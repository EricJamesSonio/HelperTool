const { ipcMain, app, safeStorage, shell, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const simpleGit = require('simple-git');

const TOKEN_FORMAT = /^(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|[0-9a-f]{40})$/;
const BLOCKING = new Set(['revoked', 'expired', 'invalid', 'mismatch']);
const REFRESH_AHEAD_MS = 30 * 60 * 1000;
const HEALTH_TTL_MS = 6 * 60 * 60 * 1000;
const MAINTAIN_EVERY_MS = 15 * 60 * 1000;

let _state = null;
let _login = null;
let _maintTimer = null;
let _maintaining = false;
const _warned = new Set();
const _refreshing = new Map();

function stateFile() {
  return path.join(app.getPath('userData'), 'git-accounts.json');
}

function load() {
  if (_state) return _state;
  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(stateFile(), 'utf-8'));
  } catch (_) {
    data = null;
  }
  const accounts = data && Array.isArray(data.accounts) ? data.accounts : [];
  const legacy = data && data.repos && typeof data.repos === 'object' ? data.repos : {};
  let defaultId = data && typeof data.defaultId === 'string' ? data.defaultId : null;
  if (defaultId && !accounts.some((a) => a.id === defaultId)) defaultId = null;
  let needsSave = false;
  if (!defaultId) {
    const counts = {};
    for (const key of Object.keys(legacy)) {
      const id = legacy[key];
      if (accounts.some((a) => a.id === id)) counts[id] = (counts[id] || 0) + 1;
    }
    let best = null;
    for (const id of Object.keys(counts)) {
      if (!best || counts[id] > counts[best]) best = id;
    }
    if (best) {
      defaultId = best;
      needsSave = true;
    }
  }
  if (Object.keys(legacy).length) needsSave = true;
  _state = {
    accounts,
    defaultId,
    clientId: data && typeof data.clientId === 'string' ? data.clientId : '',
  };
  if (needsSave) {
    try {
      save();
    } catch (_) {}
  }
  return _state;
}

function save() {
  const file = stateFile();
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

function getClientId() {
  return String(process.env.HELPERTOOL_GITHUB_CLIENT_ID || load().clientId || '').trim();
}

function canSeal() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (_) {
    return false;
  }
}

function sealToken(token) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return { token: safeStorage.encryptString(token).toString('base64'), enc: true };
    }
  } catch (_) {}
  return { token, enc: false };
}

function openSealed(value, enc) {
  if (!value) return '';
  if (!enc) return value;
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch (_) {
    return '';
  }
}

function openToken(acc) {
  return openSealed(acc.token, acc.enc);
}

function tokenTypeOf(token) {
  const m = /^(gho|ghu|ghp|ghs|ghr|github_pat)_/.exec(String(token || ''));
  return m ? m[1] : '';
}

function publicAcc(acc) {
  return {
    id: acc.id,
    label: acc.label || '',
    username: acc.username,
    name: acc.name || '',
    email: acc.email || '',
    avatarUrl: acc.avatarUrl || '',
    createdAt: acc.createdAt || 0,
    tokenType: acc.tokenType || '',
    scopes: Array.isArray(acc.scopes) ? acc.scopes : [],
    health: acc.health || null,
    expiresAt: acc.expiresAt || 0,
    canRefresh: !!acc.refreshToken,
  };
}

function parseScopes(headers) {
  const raw = headers ? headers['x-oauth-scopes'] : undefined;
  if (typeof raw !== 'string') return null;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function ghGet(pathname, token) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: 'api.github.com',
      path: pathname,
      headers: {
        'User-Agent': 'HelperTool/1.0',
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(data); } catch (_) { body = null; }
        resolve({ status: res.statusCode, body, headers: res.headers || {} });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('Request timed out')); });
  });
}

function postJson(hostname, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname,
      path: pathname,
      method: 'POST',
      headers: {
        'User-Agent': 'HelperTool/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (_) { parsed = null; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('Request timed out')); });
    req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkToken(token, expectUser, expiresAt) {
  const type = tokenTypeOf(token);
  const who = expectUser ? '@' + expectUser : 'this account';
  let res;
  try {
    res = await ghGet('/user', token);
  } catch (err) {
    return {
      state: 'unknown',
      status: 0,
      scopes: null,
      login: '',
      ghMessage: '',
      message: 'GitHub could not be reached (' + err.message + '), so the token for ' + who + ' was not verified.',
    };
  }
  const h = res.headers || {};
  const ghMsg = res.body && res.body.message ? String(res.body.message) : '';
  const scopes = parseScopes(h);
  const base = { status: res.status, scopes, login: '', ghMessage: ghMsg };

  if (res.status === 200 && res.body && res.body.login) {
    const login = String(res.body.login);
    if (expectUser && login.toLowerCase() !== expectUser.toLowerCase()) {
      return Object.assign(base, {
        login,
        state: 'mismatch',
        message: 'The stored token for ' + who + ' belongs to @' + login + ' on GitHub, so it was not used. Nothing was changed. Sign in again as ' + who + ' to replace it.',
      });
    }
    if (scopes && scopes.indexOf('repo') === -1) {
      return Object.assign(base, {
        login,
        state: 'insufficient_scope',
        message: 'The token for ' + who + ' is valid but has no "repo" scope (it has: ' + (scopes.join(', ') || 'none') + '), so pushing to private repositories will fail. Sign in again to grant the repo scope.',
      });
    }
    return Object.assign(base, { login, state: 'valid', message: '' });
  }

  if (res.status === 401) {
    let state = 'revoked';
    let why = '';
    if (expiresAt && Date.now() > expiresAt) {
      state = 'expired';
      why = 'It passed its expiry time.';
    } else if (!TOKEN_FORMAT.test(token)) {
      state = 'invalid';
      why = 'The stored value does not look like a GitHub token, so it may be damaged or incomplete.';
    } else if (type === 'ghu') {
      why = 'GitHub App user tokens expire after about 8 hours, so it has probably expired or was revoked.';
    } else {
      why = 'OAuth App tokens do not expire, so it was revoked: removed under GitHub Settings > Applications, revoked from the app page, replaced after more than 10 sign-ins for the same app, or auto-revoked after being published.';
    }
    return Object.assign(base, {
      state,
      message: 'GitHub no longer accepts the token for ' + who + ' (HTTP 401' + (ghMsg ? ', "' + ghMsg + '"' : '') + '). ' + why + ' The account was kept. Sign in again as ' + who + ' to replace the token.',
    });
  }

  if (res.status === 403 || res.status === 429) {
    if (h['x-github-sso']) {
      return Object.assign(base, {
        state: 'sso',
        message: 'The token for ' + who + ' needs SAML SSO authorization for an organization. Authorize it on GitHub (Settings > Applications). The token itself is not revoked.',
      });
    }
    if (res.status === 429 || String(h['x-ratelimit-remaining']) === '0' || /rate limit/i.test(ghMsg)) {
      return Object.assign(base, {
        state: 'rate_limited',
        message: 'GitHub is rate limiting the token for ' + who + ' right now. It is not revoked. Try again in a few minutes.',
      });
    }
    return Object.assign(base, {
      state: 'blocked',
      message: 'GitHub refused the check for ' + who + ' (HTTP 403' + (ghMsg ? ', "' + ghMsg + '"' : '') + '). The token is not known to be revoked.',
    });
  }

  return Object.assign(base, {
    state: 'unknown',
    message: 'GitHub answered with an unexpected status (' + res.status + ') while checking ' + who + '. The token was not treated as revoked.',
  });
}

function recordHealth(acc, check) {
  if (!acc || !check || check.state === 'unknown') return;
  acc.health = { state: check.state, at: Date.now() };
  try {
    save();
  } catch (_) {}
}

function warnOnce(key, text) {
  if (_warned.has(key)) return;
  _warned.add(key);
  console.warn('[GitAccounts] ' + text);
}

function dueForRefresh(acc) {
  if (!acc || !acc.refreshToken || !acc.expiresAt) return false;
  return Date.now() > acc.expiresAt - REFRESH_AHEAD_MS;
}

async function doRefresh(acc) {
  const cid = getClientId();
  const rt = openSealed(acc.refreshToken, acc.refreshEnc);
  if (!cid || !rt) return { ok: false, reason: 'no_refresh' };
  if (acc.refreshExpiresAt && Date.now() > acc.refreshExpiresAt) {
    return { ok: false, reason: 'refresh_expired' };
  }
  let res;
  try {
    res = await postJson('github.com', '/login/oauth/access_token', {
      client_id: cid,
      grant_type: 'refresh_token',
      refresh_token: rt,
    });
  } catch (_) {
    return { ok: false, reason: 'network' };
  }
  const b = (res && res.body) || {};
  if (!b.access_token) return { ok: false, reason: b.error || 'rejected' };
  const sealed = sealToken(b.access_token);
  acc.token = sealed.token;
  acc.enc = sealed.enc;
  acc.tokenType = tokenTypeOf(b.access_token) || acc.tokenType;
  acc.expiresAt = Number(b.expires_in) > 0 ? Date.now() + Number(b.expires_in) * 1000 : 0;
  if (b.refresh_token) {
    const r = sealToken(b.refresh_token);
    acc.refreshToken = r.token;
    acc.refreshEnc = r.enc;
    acc.refreshExpiresAt = Number(b.refresh_token_expires_in) > 0
      ? Date.now() + Number(b.refresh_token_expires_in) * 1000
      : 0;
  }
  acc.health = { state: 'valid', at: Date.now() };
  try {
    save();
  } catch (_) {}
  return { ok: true };
}

function refreshAccount(acc) {
  if (_refreshing.has(acc.id)) return _refreshing.get(acc.id);
  const p = doRefresh(acc).finally(() => { _refreshing.delete(acc.id); });
  _refreshing.set(acc.id, p);
  return p;
}

function activeAccount() {
  const st = load();
  if (!st.defaultId) return null;
  return st.accounts.find((a) => a.id === st.defaultId) || null;
}

function configFor(repoPath) {
  if (!repoPath) return null;
  const acc = activeAccount();
  if (!acc) return null;
  const token = openToken(acc);
  if (!token) {
    warnOnce('unreadable:' + acc.id, 'The saved token for @' + acc.username + ' could not be read, so git is using your system login.');
    return null;
  }
  if (dueForRefresh(acc)) refreshAccount(acc).catch(() => {});
  const basic = Buffer.from(acc.username + ':' + token).toString('base64');
  const cfg = ['http.https://github.com/.extraheader=AUTHORIZATION: basic ' + basic];
  cfg.push('user.name=' + (acc.name || acc.username));
  if (acc.email) cfg.push('user.email=' + acc.email);
  return cfg;
}

function authedGit(factory, repoPath, ...rest) {
  let cfg = null;
  try {
    cfg = typeof repoPath === 'string' ? configFor(repoPath) : null;
  } catch (_) {
    cfg = null;
  }
  if (!cfg) return factory(repoPath, ...rest);
  return factory({ baseDir: repoPath, config: cfg }, ...rest);
}

function newId() {
  return 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function saveAccountFromToken(token, label, extra) {
  let res;
  try {
    res = await ghGet('/user', token);
  } catch (err) {
    return { success: false, error: 'Could not reach GitHub: ' + err.message };
  }
  if (res.status === 401) {
    return { success: false, error: 'GitHub rejected this token (HTTP 401, "Bad credentials"). Check that it was copied fully and has not been revoked or expired.' };
  }
  if (res.status !== 200 || !res.body || !res.body.login) {
    return { success: false, error: 'GitHub gave an unexpected answer (' + res.status + ').' };
  }
  const u = res.body;
  const st = load();
  const sealed = sealToken(token);
  const scopesList = parseScopes(res.headers);
  const info = {
    username: u.login,
    name: u.name || u.login,
    email: u.email || (u.id + '+' + u.login + '@users.noreply.github.com'),
    avatarUrl: u.avatar_url || '',
    token: sealed.token,
    enc: sealed.enc,
    tokenType: tokenTypeOf(token),
    scopes: scopesList || [],
    expiresAt: extra && extra.expiresAt ? extra.expiresAt : 0,
    refreshToken: '',
    refreshEnc: false,
    refreshExpiresAt: 0,
    health: { state: 'valid', at: Date.now() },
  };
  if (extra && extra.refreshToken) {
    const r = sealToken(extra.refreshToken);
    info.refreshToken = r.token;
    info.refreshEnc = r.enc;
    info.refreshExpiresAt = extra.refreshExpiresAt || 0;
  }
  const existing = st.accounts.find((a) => a.username.toLowerCase() === u.login.toLowerCase());
  let account;
  let updated = false;
  if (existing) {
    Object.assign(existing, info);
    if (label) existing.label = label;
    account = existing;
    updated = true;
  } else {
    account = Object.assign({ id: newId(), createdAt: Date.now(), label }, info);
    st.accounts.push(account);
  }
  if (!st.defaultId) st.defaultId = account.id;
  save();
  const result = {
    success: true,
    updated,
    account: publicAcc(account),
    accounts: st.accounts.map(publicAcc),
    activeId: st.defaultId,
  };
  if (scopesList && scopesList.indexOf('repo') === -1) {
    result.warning = 'This token has no "repo" scope (it has: ' + (scopesList.join(', ') || 'none') + '), so pushing to private repositories will fail.';
  }
  return result;
}

async function pollLogin(session, cid, device, sender) {
  let interval = Math.max(5, Number(device.interval) || 5);
  const deadline = Date.now() + (Number(device.expires_in) || 900) * 1000;
  let result = null;
  while (!session.cancelled) {
    await sleep(interval * 1000);
    if (session.cancelled) break;
    if (Date.now() > deadline) {
      result = { success: false, error: 'The code expired. Start the sign in again.' };
      break;
    }
    let res = null;
    try {
      res = await postJson('github.com', '/login/oauth/access_token', {
        client_id: cid,
        device_code: device.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });
    } catch (_) {
      continue;
    }
    const b = (res && res.body) || {};
    if (b.access_token) {
      const exp = Number(b.expires_in) > 0 ? Date.now() + Number(b.expires_in) * 1000 : 0;
      const rexp = Number(b.refresh_token_expires_in) > 0 ? Date.now() + Number(b.refresh_token_expires_in) * 1000 : 0;
      result = await saveAccountFromToken(b.access_token, '', {
        expiresAt: exp,
        refreshToken: b.refresh_token || '',
        refreshExpiresAt: rexp,
      });
      break;
    }
    if (b.error === 'authorization_pending') continue;
    if (b.error === 'slow_down') {
      interval = Number(b.interval) || interval + 5;
      continue;
    }
    if (b.error === 'access_denied') {
      result = { success: false, error: 'Sign in was denied on GitHub.' };
      break;
    }
    if (b.error === 'expired_token') {
      result = { success: false, error: 'The code expired. Start the sign in again.' };
      break;
    }
    result = { success: false, error: b.error_description || b.error || 'Sign in failed.' };
    break;
  }
  if (_login === session) _login = null;
  if (session.cancelled || !result) return;
  try {
    if (!sender.isDestroyed()) sender.send('gitAccounts:loginResult', result);
  } catch (_) {}
}

async function maintain() {
  if (_maintaining) return;
  _maintaining = true;
  try {
    const st = load();
    let dirty = false;
    const sealable = canSeal();
    for (const acc of st.accounts.slice()) {
      if (sealable) {
        if (!acc.enc && acc.token) {
          const s = sealToken(acc.token);
          if (s.enc) {
            acc.token = s.token;
            acc.enc = true;
            dirty = true;
          }
        }
        if (acc.refreshToken && !acc.refreshEnc) {
          const s = sealToken(acc.refreshToken);
          if (s.enc) {
            acc.refreshToken = s.token;
            acc.refreshEnc = true;
            dirty = true;
          }
        }
      }
      let failedRefresh = false;
      if (dueForRefresh(acc)) {
        const r = await refreshAccount(acc);
        failedRefresh = !r.ok;
      }
      const stale = !acc.health || Date.now() - (acc.health.at || 0) > HEALTH_TTL_MS;
      if (failedRefresh || stale) {
        const token = openToken(acc);
        if (token) {
          const check = await checkToken(token, acc.username, acc.expiresAt);
          if (check.state !== 'unknown') {
            acc.health = { state: check.state, at: Date.now() };
            dirty = true;
          }
        }
      }
    }
    if (dirty) save();
  } catch (err) {
    console.warn('[GitAccounts] maintenance failed: ' + err.message);
  } finally {
    _maintaining = false;
  }
}

function startMaintenance() {
  if (_maintTimer) return;
  const first = setTimeout(() => { maintain(); }, 5000);
  if (first.unref) first.unref();
  _maintTimer = setInterval(() => { maintain(); }, MAINTAIN_EVERY_MS);
  if (_maintTimer.unref) _maintTimer.unref();
}

function authConfigFor(acc, token) {
  const basic = Buffer.from(acc.username + ':' + token).toString('base64');
  return ['http.https://github.com/.extraheader=AUTHORIZATION: basic ' + basic];
}

async function activeCtx(accountId) {
  const acc = accountId
    ? load().accounts.find((a) => a.id === accountId)
    : activeAccount();
  if (!acc) {
    return {
      error: accountId
        ? 'That GitHub account was not found. Reopen this window and pick another.'
        : 'Select a GitHub account first. System default cannot list or create repositories.',
    };
  }
  if (dueForRefresh(acc)) await refreshAccount(acc);
  const token = openToken(acc);
  if (!token) {
    return { error: 'The saved token for @' + acc.username + ' could not be read. Remove the account and sign in again.' };
  }
  return { acc, token };
}

function ghSend(method, pathname, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const headers = {
      'User-Agent': 'HelperTool/1.0',
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'Content-Length': Buffer.byteLength(payload),
    };
    if (payload) headers['Content-Type'] = 'application/json';
    const req = https.request({ hostname: 'api.github.com', path: pathname, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (_) { parsed = null; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('Request timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchUserRepos(token) {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const res = await ghGet('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&page=' + page, token);
    if (res.status === 401) throw new Error('GitHub rejected the saved token. Sign in again.');
    if (res.status !== 200 || !Array.isArray(res.body)) throw new Error('GitHub answered with status ' + res.status + '.');
    for (const r of res.body) all.push(r);
    if (res.body.length < 100) break;
  }
  return all;
}

function createErrorText(res) {
  const b = res.body || {};
  const detail = Array.isArray(b.errors) && b.errors.length
    ? b.errors.map((e) => e.message || e.code || '').filter(Boolean).join('; ')
    : '';
  if (res.status === 401) return 'GitHub rejected the saved token. Sign in again.';
  if (res.status === 403 || res.status === 404) {
    return 'This account is not allowed to create repositories (the token needs the repo scope). ' + (b.message || '');
  }
  if (res.status === 422) return detail || b.message || 'GitHub could not create the repository (name may already exist).';
  return b.message || 'GitHub answered with status ' + res.status + '.';
}

function registerProject(repoPath) {
  const config = require('../config/config.js');
  const cfg = config.readConfig();
  cfg.projects = cfg.projects || {};
  const storageName = path.basename(repoPath).replace(/[^a-zA-Z0-9-_]/g, '_');
  const storagePath = path.join(app.getPath('userData'), storageName);
  fs.mkdirSync(storagePath, { recursive: true });
  for (const sub of ['Codes', 'Structures']) {
    fs.mkdirSync(path.join(storagePath, sub), { recursive: true });
  }
  cfg.projects[repoPath] = {
    storageName,
    storagePath,
    lastUsed: new Date().toISOString(),
  };
  config.writeConfig(cfg);
}

function registerRepoTools() {
  ipcMain.handle('gitAccounts:listRepos', async (_e, payload) => {
    try {
      const ctx = await activeCtx(payload && payload.accountId);
      if (ctx.error) return { success: false, error: ctx.error };
      const raw = await fetchUserRepos(ctx.token);
      return {
        success: true,
        repos: raw.map((r) => ({
          name: r.name,
          fullName: r.full_name,
          description: r.description || '',
          private: !!r.private,
          fork: !!r.fork,
          language: r.language || '',
          pushedAt: r.pushed_at || '',
          defaultBranch: r.default_branch || '',
        })),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitAccounts:listReposPage', async (_e, payload) => {
    try {
      const ctx = await activeCtx(payload && payload.accountId);
      if (ctx.error) return { success: false, error: ctx.error };
      const page = Math.max(1, Math.min(20, Number(payload && payload.page) || 1));
      const perPage = 100;
      const res = await ghGet('/user/repos?per_page=' + perPage + '&sort=updated&affiliation=owner,collaborator,organization_member&page=' + page, ctx.token);
      if (res.status === 401) return { success: false, error: 'GitHub rejected the saved token. Sign in again.' };
      if (res.status !== 200 || !Array.isArray(res.body)) {
        return { success: false, error: 'GitHub answered with status ' + res.status + '.' };
      }
      const link = res.headers && res.headers.link ? String(res.headers.link) : '';
      const hasMore = link.indexOf('rel="next"') !== -1 && page < 20;
      return {
        success: true,
        hasMore,
        nextPage: page + 1,
        repos: res.body.map((r) => ({
          name: r.name,
          fullName: r.full_name,
          description: r.description || '',
          htmlUrl: r.html_url || '',
          private: !!r.private,
          fork: !!r.fork,
          language: r.language || '',
          pushedAt: r.pushed_at || '',
          defaultBranch: r.default_branch || '',
          stars: Number(r.stargazers_count) || 0,
        })),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitAccounts:createRepo', async (_e, payload) => {
    try {
      const ctx = await activeCtx(payload && payload.accountId);
      if (ctx.error) return { success: false, error: ctx.error };
      const name = String((payload && payload.name) || '').trim();
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) {
        return { success: false, error: 'Use a name of letters, numbers, dots, dashes or underscores.' };
      }
      const gitignore = String((payload && payload.gitignore) || '').trim();
      const license = String((payload && payload.license) || '').trim();
      const body = {
        name,
        description: String((payload && payload.description) || '').trim().slice(0, 350),
        private: !(payload && payload.isPrivate === false),
        auto_init: !!(payload && payload.readme) || !!gitignore || !!license,
      };
      if (gitignore) body.gitignore_template = gitignore;
      if (license) body.license_template = license;
      const res = await ghSend('POST', '/user/repos', ctx.token, body);
      if (res.status !== 201 || !res.body) return { success: false, error: createErrorText(res) };
      const r = res.body;
      return {
        success: true,
        repo: {
          name: r.name,
          fullName: r.full_name,
          htmlUrl: r.html_url,
          private: !!r.private,
        },
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitAccounts:clone', async (_e, payload) => {
    let token = '';
    try {
      const fullName = String((payload && payload.fullName) || '').trim();
      const parentDir = String((payload && payload.parentDir) || '').trim();
      const folderName = String((payload && payload.folderName) || '').trim();
      if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(fullName)) {
        return { success: false, error: 'Invalid repository name.' };
      }
      if (!folderName || folderName === '.' || folderName === '..' || /[\\/:*?\x22<>|]/.test(folderName)) {
        return { success: false, error: 'Invalid folder name.' };
      }
      let parentStat = null;
      try { parentStat = fs.statSync(parentDir); } catch (_) { parentStat = null; }
      if (!parentStat || !parentStat.isDirectory()) {
        return { success: false, error: 'The selected folder does not exist.' };
      }
      const target = path.join(parentDir, folderName);
      if (fs.existsSync(target)) {
        let entries = [];
        try { entries = fs.readdirSync(target); } catch (_) { entries = ['?']; }
        if (entries.length) {
          return { success: false, error: 'The folder ' + target + ' already exists and is not empty. Pick another folder or name.' };
        }
      }
      const ctx = await activeCtx(payload && payload.accountId);
      if (ctx.error) return { success: false, error: ctx.error };
      token = ctx.token;
      const git = simpleGit({ baseDir: parentDir, config: authConfigFor(ctx.acc, ctx.token) });
      await git.clone('https://github.com/' + fullName + '.git', target);
      try {
        const local = simpleGit(target);
        await local.addConfig('user.name', ctx.acc.name || ctx.acc.username, false, 'local');
        if (ctx.acc.email) await local.addConfig('user.email', ctx.acc.email, false, 'local');
      } catch (_) {}
      if (payload && payload.open) registerProject(target);
      return { success: true, path: target };
    } catch (err) {
      let text = String(err && err.message ? err.message : err);
      if (token) text = text.split(token).join('***');
      return { success: false, error: text };
    }
  });
}

function register() {
  ipcMain.handle('gitAccounts:list', async () => {
    try {
      const st = load();
      return {
        success: true,
        accounts: st.accounts.map(publicAcc),
        activeId: st.defaultId || null,
        secure: canSeal(),
      };
    } catch (err) {
      return { success: false, error: err.message, accounts: [], activeId: null };
    }
  });

  ipcMain.handle('gitAccounts:add', async (_e, payload) => {
    try {
      const token = String((payload && payload.token) || '').trim();
      const label = String((payload && payload.label) || '').trim().slice(0, 40);
      if (!token) return { success: false, error: 'Paste a personal access token first.' };
      return await saveAccountFromToken(token, label, null);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitAccounts:setClientId', async (_e, payload) => {
    try {
      const value = String((payload && payload.clientId) || '').trim();
      if (!/^[A-Za-z0-9._-]{8,60}$/.test(value)) {
        return { success: false, error: 'That does not look like a GitHub Client ID.' };
      }
      load().clientId = value;
      save();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitAccounts:loginStart', async (e) => {
    try {
      const cid = getClientId();
      if (!cid) return { success: false, needsSetup: true };
      if (_login) _login.cancelled = true;
      _login = null;
      let res;
      try {
        res = await postJson('github.com', '/login/device/code', { client_id: cid, scope: 'repo read:user' });
      } catch (err) {
        return { success: false, error: 'Could not reach GitHub: ' + err.message };
      }
      const b = (res && res.body) || {};
      if (!b.device_code || !b.user_code) {
        return {
          success: false,
          needsSetup: true,
          error: 'GitHub rejected the Client ID. Check it, and that Device Flow is enabled for the app.',
        };
      }
      const session = { cancelled: false };
      _login = session;
      try { clipboard.writeText(b.user_code); } catch (_) {}
      try { shell.openExternal(b.verification_uri || 'https://github.com/login/device'); } catch (_) {}
      pollLogin(session, cid, b, e.sender);
      return {
        success: true,
        userCode: b.user_code,
        verificationUri: b.verification_uri || 'https://github.com/login/device',
        expiresIn: b.expires_in || 900,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitAccounts:loginCancel', async () => {
    if (_login) _login.cancelled = true;
    _login = null;
    return { success: true };
  });

  ipcMain.handle('gitAccounts:remove', async (_e, payload) => {
    try {
      const id = payload && payload.id;
      const st = load();
      st.accounts = st.accounts.filter((a) => a.id !== id);
      if (st.defaultId === id) st.defaultId = null;
      save();
      return { success: true, accounts: st.accounts.map(publicAcc), activeId: st.defaultId || null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitAccounts:switch', async (_e, payload) => {
    try {
      const repoPath = payload && payload.repoPath;
      const id = payload && payload.id;
      const st = load();
      if (!id) {
        st.defaultId = null;
        save();
        return { success: true, activeId: null };
      }
      const acc = st.accounts.find((a) => a.id === id);
      if (!acc) return { success: false, error: 'Account not found.' };
      if (dueForRefresh(acc)) await refreshAccount(acc);
      const token = openToken(acc);
      if (!token) {
        return { success: false, error: 'The saved token could not be read. Remove the account and add it again.' };
      }
      const warnings = [];
      const check = await checkToken(token, acc.username, acc.expiresAt);
      console.log('[GitAccounts] switch check @' + acc.username + ': ' + check.state + (check.status ? ' (HTTP ' + check.status + ')' : ''));
      recordHealth(acc, check);
      if (BLOCKING.has(check.state)) {
        return { success: false, error: check.message, reason: check.state, kept: true };
      }
      if (check.state !== 'valid' && check.message) warnings.push(check.message);
      st.defaultId = acc.id;
      save();
      if (repoPath) {
        try {
          const git = simpleGit(repoPath);
          await git.addConfig('user.name', acc.name || acc.username, false, 'local');
          if (acc.email) await git.addConfig('user.email', acc.email, false, 'local');
          let url = '';
          try {
            url = String(await git.raw(['remote', 'get-url', 'origin'])).trim();
          } catch (_) {
            url = '';
          }
          if (/^(git@|ssh:\/\/)/i.test(url)) {
            warnings.push('This repo uses an SSH remote: commits use this account, but pushes still use your SSH key.');
          }
        } catch (_) {
          warnings.push('This folder is not a git repository yet, so its local commit identity was not set.');
        }
      }
      return { success: true, activeId: acc.id, warning: warnings.length ? warnings.join(' ') : null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  registerRepoTools();
  startMaintenance();
}

function ghRequest(method, pathname, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: pathname,
      method,
      headers: {
        'User-Agent': 'HelperTool/1.0',
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        'Content-Length': 0,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(data); } catch (_) { body = null; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('Request timed out')); });
    req.end();
  });
}

function activeAccountFor() {
  return activeAccount();
}

async function originRepo(repoPath) {
  try {
    const url = String(await simpleGit(repoPath).raw(['remote', 'get-url', 'origin'])).trim();
    const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url);
    return m ? m[1] + '/' + m[2] : '';
  } catch (_) {
    return '';
  }
}

async function explainAuthFailure(repoPath, text) {
  const acc = activeAccountFor(repoPath);
  if (!acc) {
    return {
      message: text + '\n\nGit is using your system login, and GitHub rejected it. Open GitHub accounts, sign in, and select an account.',
    };
  }
  if (acc.refreshToken) {
    const r = await refreshAccount(acc);
    if (r.ok) {
      return {
        message: text + '\n\nThe saved token for @' + acc.username + ' had expired and was refreshed automatically. Try again.',
      };
    }
  }
  const token = openToken(acc);
  if (!token) {
    return { message: text + '\n\nThe saved token for @' + acc.username + ' could not be read. Remove the account and sign in again.' };
  }
  const check = await checkToken(token, acc.username, acc.expiresAt);
  recordHealth(acc, check);
  if (check.state === 'valid') {
    return {
      message: text + '\n\nGitHub reported an authentication failure, but the saved token for @' + acc.username +
        ' is still valid. Another credential (for example one stored by your system git) may be overriding it.',
    };
  }
  return { message: text + '\n\n' + check.message };
}

async function explainPushError(repoPath, original) {
  const text = String(original || '');
  if (/Authentication failed|Invalid username or token|Bad credentials|could not read Username|\b401\b/i.test(text)) {
    return explainAuthFailure(repoPath, text);
  }
  if (!/denied to|error: 403|\b403\b/i.test(text)) return null;
  const who = (/denied to ([A-Za-z0-9-]+)/i.exec(text) || [])[1] || '';
  const full = await originRepo(repoPath);
  const target = full || 'this repository';
  const acc = activeAccountFor(repoPath);
  if (!acc) {
    return {
      message: text + '\n\nGit is using your system login' + (who ? ' (@' + who + ')' : '') +
        ', and it has no write access to ' + target + '. Open GitHub accounts, sign in with the account that has access, and select it.',
    };
  }
  const token = openToken(acc);
  if (!token) {
    return { message: text + '\n\nThe saved token for @' + acc.username + ' could not be read. Remove the account and sign in again.' };
  }
  const note = who && who.toLowerCase() !== acc.username.toLowerCase()
    ? '\n\nNote: GitHub saw @' + who + ', not the selected account @' + acc.username + '. Another saved login may be overriding it.'
    : '';
  if (!full) return { message: text + note };
  let info = null;
  try {
    info = await ghRequest('GET', '/repos/' + full, token);
  } catch (err) {
    return { message: text + '\n\nCould not check access: ' + err.message };
  }
  if (info.status === 200 && info.body && info.body.permissions && info.body.permissions.push) {
    return {
      message: text + '\n\n@' + acc.username + ' has write access to ' + full +
        ', so something else is blocking the push (for example a protected branch or an organization rule).' + note,
    };
  }
  let inv = null;
  try {
    inv = await ghRequest('GET', '/user/repository_invitations?per_page=100', token);
  } catch (_) {
    inv = null;
  }
  if (inv && inv.status === 200 && Array.isArray(inv.body)) {
    const hit = inv.body.find((i) => i && i.repository && String(i.repository.full_name).toLowerCase() === full.toLowerCase());
    if (hit) {
      let res = null;
      try {
        res = await ghRequest('PATCH', '/user/repository_invitations/' + hit.id, token);
      } catch (_) {
        res = null;
      }
      if (res && res.status === 204) {
        return { accepted: true, message: 'Accepted the pending invitation to ' + full + ' for @' + acc.username + '.' };
      }
      return {
        message: text + '\n\nThere is a pending invitation to ' + full + ' but it could not be accepted automatically. Open github.com/' + full + '/invitations and accept it.',
      };
    }
  }
  return {
    message: text + '\n\n@' + acc.username + ' is not a collaborator with write access to ' + full +
      '. Ask the owner to add it with Write access (repo Settings > Collaborators), accept the invitation, then push again.' + note,
  };
}

module.exports = { register, authedGit, configFor, explainPushError };