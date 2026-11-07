const { ipcMain, app, safeStorage, shell, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const simpleGit = require('simple-git');

let _state = null;
let _login = null;

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
  _state = {
    accounts: data && Array.isArray(data.accounts) ? data.accounts : [],
    repos: data && data.repos && typeof data.repos === 'object' ? data.repos : {},
    clientId: data && typeof data.clientId === 'string' ? data.clientId : '',
  };
  return _state;
}

function save() {
  const file = stateFile();
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

function repoKey(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function getClientId() {
  return String(process.env.HELPERTOOL_GITHUB_CLIENT_ID || load().clientId || '').trim();
}

function sealToken(token) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return { token: safeStorage.encryptString(token).toString('base64'), enc: true };
    }
  } catch (_) {}
  return { token, enc: false };
}

function openToken(acc) {
  if (!acc.enc) return acc.token || '';
  try {
    return safeStorage.decryptString(Buffer.from(acc.token, 'base64'));
  } catch (_) {
    return '';
  }
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
  };
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
        resolve({ status: res.statusCode, body });
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

function configFor(repoPath) {
  if (!repoPath) return null;
  const st = load();
  const id = st.repos[repoKey(repoPath)];
  if (!id) return null;
  const acc = st.accounts.find((a) => a.id === id);
  if (!acc) return null;
  const token = openToken(acc);
  if (!token) return null;
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

async function saveAccountFromToken(token, label) {
  let res;
  try {
    res = await ghGet('/user', token);
  } catch (err) {
    return { success: false, error: 'Could not reach GitHub: ' + err.message };
  }
  if (res.status === 401) {
    return { success: false, error: 'GitHub rejected this token. Check that it was copied fully and has not expired.' };
  }
  if (res.status !== 200 || !res.body || !res.body.login) {
    return { success: false, error: 'GitHub gave an unexpected answer (' + res.status + ').' };
  }
  const u = res.body;
  const st = load();
  const sealed = sealToken(token);
  const info = {
    label,
    username: u.login,
    name: u.name || u.login,
    email: u.email || (u.id + '+' + u.login + '@users.noreply.github.com'),
    avatarUrl: u.avatar_url || '',
    token: sealed.token,
    enc: sealed.enc,
  };
  const existing = st.accounts.find((a) => a.username.toLowerCase() === u.login.toLowerCase());
  let account;
  let updated = false;
  if (existing) {
    Object.assign(existing, info);
    if (!label) existing.label = existing.label || '';
    account = existing;
    updated = true;
  } else {
    account = Object.assign({ id: newId(), createdAt: Date.now() }, info);
    st.accounts.push(account);
  }
  save();
  return { success: true, updated, account: publicAcc(account), accounts: st.accounts.map(publicAcc) };
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
      result = await saveAccountFromToken(b.access_token, '');
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

function register() {
  ipcMain.handle('gitAccounts:list', async (_e, payload) => {
    try {
      const st = load();
      const repoPath = payload && payload.repoPath;
      const id = repoPath ? st.repos[repoKey(repoPath)] || null : null;
      const exists = id && st.accounts.some((a) => a.id === id);
      let secure = false;
      try { secure = safeStorage.isEncryptionAvailable(); } catch (_) { secure = false; }
      return {
        success: true,
        accounts: st.accounts.map(publicAcc),
        activeId: exists ? id : null,
        secure,
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
      return await saveAccountFromToken(token, label);
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
      for (const key of Object.keys(st.repos)) {
        if (st.repos[key] === id) delete st.repos[key];
      }
      save();
      return { success: true, accounts: st.accounts.map(publicAcc) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gitAccounts:switch', async (_e, payload) => {
    try {
      const repoPath = payload && payload.repoPath;
      const id = payload && payload.id;
      if (!repoPath) return { success: false, error: 'No repository selected.' };
      const st = load();
      const key = repoKey(repoPath);
      if (!id) {
        delete st.repos[key];
        save();
        return { success: true, activeId: null };
      }
      const acc = st.accounts.find((a) => a.id === id);
      if (!acc) return { success: false, error: 'Account not found.' };
      const token = openToken(acc);
      if (!token) {
        return { success: false, error: 'The saved token could not be read. Remove the account and add it again.' };
      }
      let warning = null;
      try {
        const check = await ghGet('/user', token);
        if (check.status === 401) {
          return { success: false, error: 'The token for @' + acc.username + ' was rejected (revoked or expired). Remove it and sign in again.' };
        }
      } catch (_) {
        warning = 'GitHub could not be reached, so the token was not verified.';
      }
      st.repos[key] = acc.id;
      save();
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
          warning = 'This repo uses an SSH remote: commits use this account, but pushes still use your SSH key.';
        }
      } catch (_) {
        warning = warning || 'Account saved for this folder, but it is not a git repository yet.';
      }
      return { success: true, activeId: acc.id, warning };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register, authedGit, configFor };