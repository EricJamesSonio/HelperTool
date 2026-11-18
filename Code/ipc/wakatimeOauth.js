const { ipcMain, app, safeStorage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = 47831;
const REDIRECT_URI = 'http://127.0.0.1:' + PORT + '/wakatime/callback';
const AUTHORIZE_URL = 'https://wakatime.com/oauth/authorize';
const SCOPE = 'read_summaries';
const FLOW_TIMEOUT_MS = 180000;
const RANGE_TTL_MS = 300000;
const EXPIRY_SKEW_MS = 60000;

let _data = null;
let _flow = null;
let _refreshing = null;
let _rangeCache = { key: '', at: 0, data: null };

function storeFile() {
  return path.join(app.getPath('userData'), 'wakatime-oauth.json');
}

function load() {
  if (_data) return _data;
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(storeFile(), 'utf-8'));
  } catch (_) {
    raw = null;
  }
  const o = raw && typeof raw === 'object' ? raw : {};
  _data = {
    clientId: typeof o.clientId === 'string' ? o.clientId : '',
    secret: typeof o.secret === 'string' ? o.secret : '',
    secretEnc: !!o.secretEnc,
    access: typeof o.access === 'string' ? o.access : '',
    accessEnc: !!o.accessEnc,
    refresh: typeof o.refresh === 'string' ? o.refresh : '',
    refreshEnc: !!o.refreshEnc,
    expiresAt: Number(o.expiresAt) || 0,
  };
  return _data;
}

function save() {
  const file = storeFile();
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

function seal(value) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return { value: safeStorage.encryptString(value).toString('base64'), enc: true };
    }
  } catch (_) {}
  return { value, enc: false };
}

function open(value, enc) {
  if (!value) return '';
  if (!enc) return value;
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch (_) {
    return '';
  }
}

function setSecret(st, secret) {
  const s = seal(secret);
  st.secret = s.value;
  st.secretEnc = s.enc;
}

function expiryOf(body) {
  const sec = Number(body.expires_in);
  if (sec > 0) return Date.now() + sec * 1000;
  const at = Date.parse(String(body.expires_at || ''));
  return Number.isFinite(at) ? at : 0;
}

function applyTokens(st, body) {
  const access = String((body && body.access_token) || '');
  if (!access) return false;
  const a = seal(access);
  st.access = a.value;
  st.accessEnc = a.enc;
  if (body.refresh_token) {
    const r = seal(String(body.refresh_token));
    st.refresh = r.value;
    st.refreshEnc = r.enc;
  }
  st.expiresAt = expiryOf(body);
  save();
  _rangeCache = { key: '', at: 0, data: null };
  return true;
}

function parseBody(text) {
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object') return v;
  } catch (_) {}
  const out = {};
  for (const [k, v] of new URLSearchParams(String(text || ''))) out[k] = v;
  return out;
}

function describe(body, status) {
  const b = body || {};
  const text = String(b.error_description || b.error || b.message || '').trim();
  return 'WakaTime answered HTTP ' + status + (text ? ': ' + text : '') + '.';
}

function request(options, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { resolve({ status: res.statusCode, body: parseBody(data) }); });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('Request timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
}

function postForm(fields) {
  const payload = new URLSearchParams(fields).toString();
  return request({
    hostname: 'wakatime.com',
    path: '/oauth/token',
    method: 'POST',
    headers: {
      'User-Agent': 'ES Code/1.0',
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, payload);
}

function apiGet(pathname, token) {
  return request({
    hostname: 'api.wakatime.com',
    path: pathname,
    method: 'GET',
    headers: {
      'User-Agent': 'ES Code/1.0',
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
  });
}

async function doRefresh() {
  const st = load();
  const secret = open(st.secret, st.secretEnc);
  const refresh = open(st.refresh, st.refreshEnc);
  if (!st.clientId || !secret || !refresh) return false;
  let res;
  try {
    res = await postForm({
      client_id: st.clientId,
      client_secret: secret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    });
  } catch (_) {
    return false;
  }
  return applyTokens(st, res.body);
}

function refreshTokens() {
  if (_refreshing) return _refreshing;
  _refreshing = doRefresh().finally(() => { _refreshing = null; });
  return _refreshing;
}

async function authedGet(pathname) {
  const st = load();
  let token = open(st.access, st.accessEnc);
  if (!token) return { status: 0, needsAuth: true, body: {} };
  if (st.expiresAt && Date.now() > st.expiresAt - EXPIRY_SKEW_MS) {
    if (await refreshTokens()) {
      const fresh = load();
      token = open(fresh.access, fresh.accessEnc);
    }
  }
  let res = await apiGet(pathname, token);
  if (res.status === 401) {
    if (await refreshTokens()) {
      const next = load();
      res = await apiGet(pathname, open(next.access, next.accessEnc));
    }
  }
  return res;
}

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function readRange(days) {
  const st = load();
  if (!open(st.access, st.accessEnc)) {
    return { success: false, needsAuth: true, error: 'Connect WakaTime to see hours.' };
  }
  const n = Math.max(1, Math.min(Math.floor(Number(days)) || 7, 30));
  const now = Date.now();
  if (_rangeCache.key === String(n) && _rangeCache.data && now - _rangeCache.at < RANGE_TTL_MS) {
    return _rangeCache.data;
  }

  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1));
  const res = await authedGet('/api/v1/users/current/summaries?start=' + ymd(start) + '&end=' + ymd(end));

  if (res.needsAuth || res.status === 401) {
    return { success: false, needsAuth: true, error: 'WakaTime sign in expired or was revoked. Connect again.' };
  }
  if (res.status === 403) {
    return { success: false, error: describe(res.body, 403) };
  }
  if (res.status !== 200 || !res.body || !Array.isArray(res.body.data)) {
    return { success: false, error: describe(res.body, res.status) };
  }

  const totals = new Map();
  const daysOut = [];
  let seconds = 0;
  for (const day of res.body.data) {
    const total = Number(day.grand_total && day.grand_total.total_seconds) || 0;
    seconds += total;
    daysOut.push({ date: String((day.range && day.range.date) || ''), seconds: total });
    for (const p of Array.isArray(day.projects) ? day.projects : []) {
      const name = String(p.name || '');
      if (!name) continue;
      totals.set(name, (totals.get(name) || 0) + (Number(p.total_seconds) || 0));
    }
  }
  const projects = Array.from(totals, ([name, sec]) => ({ name, seconds: sec })).sort((a, b) => b.seconds - a.seconds);
  const data = { success: true, days: daysOut, projects, seconds };
  _rangeCache = { key: String(n), at: now, data };
  return data;
}

function page(res, text) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Connection': 'close' });
  res.end('<!doctype html><html><head><meta charset="utf-8"><title>ES Code</title></head><body style="font-family:sans-serif;padding:40px;text-align:center">' + text + '</body></html>');
}

async function handleCallback(req, res, flow, expected) {
  let url;
  try {
    url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  } catch (_) {
    res.writeHead(400);
    res.end();
    return;
  }
  if (url.pathname !== '/wakatime/callback') {
    res.writeHead(404);
    res.end();
    return;
  }
  const denied = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const got = url.searchParams.get('state');
  if (denied) {
    page(res, 'WakaTime sign in was not completed. You can close this tab.');
    flow.finish({ success: false, error: 'WakaTime sign in was not completed (' + denied + ').' });
    return;
  }
  if (!code || got !== expected) {
    page(res, 'This sign in response was not valid. You can close this tab.');
    flow.finish({ success: false, error: 'The sign in response did not match this request, so it was ignored.' });
    return;
  }
  const st = load();
  const secret = open(st.secret, st.secretEnc);
  let result;
  try {
    const tok = await postForm({
      client_id: st.clientId,
      client_secret: secret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code,
    });
    if (applyTokens(st, tok.body)) result = { success: true };
    else result = { success: false, error: describe(tok.body, tok.status) };
  } catch (err) {
    result = { success: false, error: 'Could not reach WakaTime: ' + err.message };
  }
  page(res, result.success
    ? 'WakaTime is connected. You can close this tab and return to ES Code.'
    : 'WakaTime sign in failed. You can close this tab.');
  flow.finish(result);
}

function startFlow() {
  const st = load();
  const secret = open(st.secret, st.secretEnc);
  if (!st.clientId || !secret) {
    return Promise.resolve({ success: false, error: 'Save the Client ID and Client secret of your WakaTime app first.' });
  }
  if (_flow) _flow.finish({ success: false, cancelled: true, error: 'Sign in cancelled.' });
  return new Promise((resolve) => {
    const expected = crypto.randomBytes(16).toString('hex');
    const flow = { server: null, timer: null, done: false, finish: null };
    flow.finish = (result) => {
      if (flow.done) return;
      flow.done = true;
      clearTimeout(flow.timer);
      try { flow.server.close(); } catch (_) {}
      try { if (flow.server.closeAllConnections) flow.server.closeAllConnections(); } catch (_) {}
      if (_flow === flow) _flow = null;
      resolve(result);
    };
    flow.server = http.createServer((req, res) => {
      handleCallback(req, res, flow, expected).catch((err) => {
        flow.finish({ success: false, error: 'WakaTime sign in failed: ' + err.message });
      });
    });
    flow.server.on('error', (err) => {
      const inUse = err && err.code === 'EADDRINUSE';
      flow.finish({
        success: false,
        error: inUse
          ? 'Port ' + PORT + ' is in use, so the sign in could not start. Close the program using it and try again.'
          : 'Could not start the sign in: ' + err.message,
      });
    });
    flow.timer = setTimeout(() => {
      flow.finish({ success: false, error: 'WakaTime sign in timed out. Try again.' });
    }, FLOW_TIMEOUT_MS);
    _flow = flow;
    const authUrl = AUTHORIZE_URL + '?' + new URLSearchParams({
      client_id: st.clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      state: expected,
    }).toString();
    flow.server.listen(PORT, '127.0.0.1', () => {
      try {
        shell.openExternal(authUrl);
      } catch (err) {
        flow.finish({ success: false, error: 'Could not open the browser: ' + err.message });
      }
    });
  });
}

function register() {
  ipcMain.handle('wakatime:oauthStatus', async () => {
    try {
      const st = load();
      return {
        success: true,
        connected: !!open(st.access, st.accessEnc),
        hasApp: !!st.clientId && !!st.secret,
        clientId: st.clientId,
        redirectUri: REDIRECT_URI,
        scope: SCOPE,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('wakatime:oauthSaveApp', async (_e, payload) => {
    try {
      const q = payload || {};
      const clientId = String(q.clientId || '').trim();
      const secret = String(q.clientSecret || '').trim();
      if (!clientId || /\s/.test(clientId) || clientId.length > 200) {
        return { success: false, error: 'That does not look like a WakaTime Client ID.' };
      }
      if (secret && (/\s/.test(secret) || secret.length > 300)) {
        return { success: false, error: 'That does not look like a WakaTime Client secret.' };
      }
      const st = load();
      if (!secret && !st.secret) {
        return { success: false, error: 'Paste the Client secret of your WakaTime app.' };
      }
      if (!secret && clientId !== st.clientId) {
        return { success: false, error: 'You changed the Client ID, so paste its Client secret too.' };
      }
      st.clientId = clientId;
      if (secret) setSecret(st, secret);
      save();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('wakatime:oauthConnect', async () => {
    try {
      return await startFlow();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('wakatime:oauthCancel', async () => {
    if (_flow) _flow.finish({ success: false, cancelled: true, error: 'Sign in cancelled.' });
    return { success: true };
  });

  ipcMain.handle('wakatime:oauthDisconnect', async () => {
    try {
      const st = load();
      st.access = '';
      st.accessEnc = false;
      st.refresh = '';
      st.refreshEnc = false;
      st.expiresAt = 0;
      save();
      _rangeCache = { key: '', at: 0, data: null };
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register, readRange };