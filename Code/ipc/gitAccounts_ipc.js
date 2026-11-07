const { ipcMain, app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const simpleGit = require('simple-git');

let _state = null;

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
    } catch (err) {
      return { success: false, error: err.message };
    }
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
          return { success: false, error: 'The token for @' + acc.username + ' was rejected (revoked or expired). Remove it and add a new token.' };
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