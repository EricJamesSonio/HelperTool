'use strict';

const { ipcMain, BrowserView, session, shell } = require('electron');
const { makeDeployStore } = require('../utils/deployStore.js');
const { PROVIDERS, ROLES, searchProviders, normalizeUrl, toNavigableUrl } = require('../utils/deployProviders.js');
const { suggestForRepo } = require('../services/deploySuggest.js');

const MAX_TABS = 4;
const SLEEP_AFTER_MS = 45000;
const TAB_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,80}$/;
const GH_USER = /^[A-Za-z0-9-]{1,39}$/;
const GH_URL = 'https://github.com';
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const GOOGLE_AUTH = /^https:\/\/accounts\.google\.com\//i;
const OAUTH_POPUP = /^https:\/\/(accounts\.google\.com|github\.com\/login\/oauth)\//i;

let getWin = () => null;
let store = null;
let sleepTimer = null;
const tabs = new Map();
const configured = new Set();

function partitionFor(accountId) {
  return 'persist:deploy-' + (ACCOUNT_ID.test(accountId || '') ? accountId : 'default');
}

function accountInfo(accountId) {
  if (!store || !ACCOUNT_ID.test(accountId || '')) return null;
  return store.view('').accounts.find((a) => a.id === accountId) || null;
}

function ghPartition(user) {
  return 'persist:deploy-gh-' + String(user).toLowerCase();
}

function accountPartition(accountId) {
  const acc = accountInfo(accountId);
  if (acc && acc.githubUser && GH_USER.test(acc.githubUser)) return ghPartition(acc.githubUser);
  return partitionFor(accountId);
}

function cleanUserAgent(ua) {
  return String(ua || '')
    .replace(/\s*Electron\/[\d.]+/i, '')
    .replace(/\s[\w.-]+\/[\d.]+(?=\sChrome\/)/, '');
}

function secureSession(ses, partition) {
  if (configured.has(partition)) return;
  configured.add(partition);
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write' || permission === 'fullscreen');
  });
  try {
    ses.setUserAgent(cleanUserAgent(ses.getUserAgent()));
  } catch (_) {}
  try {
    const nodePath = require('path');
    const preload = nodePath.join(__dirname, 'deployGooglePreload.js');
    const current = typeof ses.getPreloads === 'function' ? ses.getPreloads() : [];
    if (current.indexOf(preload) === -1) ses.setPreloads(current.concat([preload]));
  } catch (_) {}
  try {
    ses.webRequest.onBeforeSendHeaders({ urls: ['https://accounts.google.com/*'] }, (details, callback) => {
      const headers = Object.assign({}, details.requestHeaders);
      for (const key of Object.keys(headers)) {
        if (/^sec-ch-ua/i.test(key) || /^user-agent$/i.test(key)) delete headers[key];
      }
      headers['User-Agent'] = FIREFOX_UA;
      callback({ requestHeaders: headers });
    });
  } catch (_) {}
}

function urlOf(event, url) {
  if (typeof url === 'string') return url;
  return event && typeof event.url === 'string' ? event.url : '';
}

function watchGoogle(wc, baseUa) {
  const apply = (url) => {
    try {
      if (wc.isDestroyed()) return;
      const want = GOOGLE_AUTH.test(url) ? FIREFOX_UA : baseUa;
      if (wc.getUserAgent() !== want) wc.setUserAgent(want);
    } catch (_) {}
  };
  wc.on('will-navigate', (event, url) => apply(urlOf(event, url)));
  wc.on('will-redirect', (event, url) => apply(urlOf(event, url)));
  return apply;
}

function canGo(wc, dir) {
  try {
    const nh = wc.navigationHistory;
    if (nh) return dir < 0 ? nh.canGoBack() : nh.canGoForward();
  } catch (_) {}
  try {
    return dir < 0 ? wc.canGoBack() : wc.canGoForward();
  } catch (_) {
    return false;
  }
}

function go(wc, dir) {
  try {
    const nh = wc.navigationHistory;
    if (nh) {
      if (dir < 0) nh.goBack();
      else nh.goForward();
      return;
    }
  } catch (_) {}
  try {
    if (dir < 0) wc.goBack();
    else wc.goForward();
  } catch (_) {}
}

function sendState(tab) {
  const win = getWin();
  if (!win || win.isDestroyed() || !tab.view) return;
  const wc = tab.view.webContents;
  if (wc.isDestroyed()) return;
  tab.url = wc.getURL() || tab.url;
  tab.title = wc.getTitle() || tab.title;
  try {
    win.webContents.send('deploy:viewState', {
      tabId: tab.id,
      url: tab.url,
      title: tab.title,
      loading: wc.isLoading(),
      canGoBack: canGo(wc, -1),
      canGoForward: canGo(wc, 1),
    });
  } catch (_) {}
}

function popupHandler(wc, partition) {
  return ({ url, features }) => {
    if (!/^https?:\/\//i.test(url)) return { action: 'deny' };
    const wantsPopup = /(width|height|popup)/i.test(features || '') || OAUTH_POPUP.test(url);
    if (!wantsPopup) {
      wc.loadURL(url).catch(() => {});
      return { action: 'deny' };
    }
    const parent = getWin();
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 720,
        autoHideMenuBar: true,
        parent: parent && !parent.isDestroyed() ? parent : undefined,
        webPreferences: { partition, nodeIntegration: false, contextIsolation: true, sandbox: true },
      },
    };
  };
}

function createView(tab) {
  const partition = accountPartition(tab.accountId);
  const view = new BrowserView({
    webPreferences: { partition, nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false },
  });
  const wc = view.webContents;
  secureSession(wc.session, partition);
  const baseUa = cleanUserAgent(wc.getUserAgent());
  wc.setUserAgent(baseUa);
  const applyUa = watchGoogle(wc, baseUa);
  wc.setWindowOpenHandler(popupHandler(wc, partition));
  wc.on('did-create-window', (child) => {
    tab.popups.add(child);
    child.on('closed', () => tab.popups.delete(child));
    const cwc = child.webContents;
    cwc.setUserAgent(baseUa);
    watchGoogle(cwc, baseUa);
    cwc.setWindowOpenHandler(popupHandler(cwc, partition));
  });
  const push = () => sendState(tab);
  for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated']) {
    wc.on(ev, push);
  }
  tab.view = view;
  tab.attached = false;
  applyUa(tab.url);
  wc.loadURL(tab.url).catch(() => {});
  return view;
}

function attach(tab) {
  const win = getWin();
  if (!win || win.isDestroyed() || !tab.view || tab.attached) return;
  try {
    win.addBrowserView(tab.view);
    tab.attached = true;
  } catch (_) {}
}

function detach(tab) {
  if (!tab.view || !tab.attached) return;
  const win = getWin();
  try {
    if (win && !win.isDestroyed()) win.removeBrowserView(tab.view);
  } catch (_) {}
  tab.attached = false;
}

function destroyView(tab) {
  if (!tab.view) return false;
  detach(tab);
  for (const child of Array.from(tab.popups)) {
    try {
      if (!child.isDestroyed()) child.destroy();
    } catch (_) {}
  }
  tab.popups.clear();
  const wc = tab.view.webContents;
  try {
    tab.url = wc.getURL() || tab.url;
  } catch (_) {}
  try {
    if (!wc.isDestroyed()) {
      if (typeof wc.destroy === 'function') wc.destroy();
      else if (typeof wc.close === 'function') wc.close();
    }
  } catch (_) {}
  tab.view = null;
  return true;
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  destroyView(tab);
  tabs.delete(id);
}

function closeAll() {
  for (const id of Array.from(tabs.keys())) closeTab(id);
}

function sleepAll() {
  clearTimeout(sleepTimer);
  sleepTimer = null;
  let count = 0;
  for (const tab of tabs.values()) {
    if (destroyView(tab)) count++;
  }
  return count;
}

function hideAll() {
  for (const tab of tabs.values()) detach(tab);
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(sleepAll, SLEEP_AFTER_MS);
}

function applyLayout(payload) {
  const win = getWin();
  if (!win || win.isDestroyed()) return;
  clearTimeout(sleepTimer);
  sleepTimer = null;
  const vw = Number(payload && payload.viewportWidth) || 0;
  const rects = (payload && payload.rects) || {};
  const content = win.getContentBounds();
  const scale = vw > 0 ? content.width / vw : 1;
  for (const tab of tabs.values()) {
    const r = rects[tab.id];
    const w = r ? Number(r.w) : 0;
    const h = r ? Number(r.h) : 0;
    if (!r || !(w > 10) || !(h > 10)) {
      detach(tab);
      continue;
    }
    if (!tab.view) createView(tab);
    attach(tab);
    tab.view.setBounds({
      x: Math.round((Number(r.x) || 0) * scale),
      y: Math.round((Number(r.y) || 0) * scale),
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale)),
    });
  }
}

function runNav(tab, action, url) {
  const wc = tab.view ? tab.view.webContents : null;
  if (!wc || wc.isDestroyed()) {
    if (action === 'goto') {
      const u = toNavigableUrl(url);
      if (u) tab.url = u;
    }
    return;
  }
  if (action === 'back') go(wc, -1);
  else if (action === 'forward') go(wc, 1);
  else if (action === 'reload') wc.reload();
  else if (action === 'stop') wc.stop();
  else if (action === 'goto') {
    const u = toNavigableUrl(url);
    if (u) wc.loadURL(u).catch(() => {});
  }
}

async function githubStatus(accountId) {
  if (!accountInfo(accountId)) return { loggedIn: false, user: '' };
  const ses = session.fromPartition(accountPartition(accountId));
  const cookies = await ses.cookies.get({ url: GH_URL });
  const logged = cookies.some((c) => c.name === 'logged_in' && c.value === 'yes');
  const who = cookies.find((c) => c.name === 'dotcom_user');
  return { loggedIn: logged, user: who ? String(who.value) : '' };
}

async function githubLogout(accountId) {
  if (!accountInfo(accountId)) return;
  const ses = session.fromPartition(accountPartition(accountId));
  const cookies = await ses.cookies.get({ url: GH_URL });
  for (const c of cookies) {
    try {
      await ses.cookies.remove(GH_URL, c.name);
    } catch (_) {}
  }
  try {
    await ses.clearStorageData({ origin: GH_URL });
  } catch (_) {}
}

function slim(p) {
  return { id: p.id, name: p.name, url: p.url, roles: p.roles };
}

function register({ app, getMainWindow }) {
  getWin = getMainWindow;
  store = makeDeployStore({ app });

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (_event, payload) => {
      try {
        return await fn(payload || {});
      } catch (err) {
        return { success: false, error: err && err.message ? err.message : String(err) };
      }
    });
  };

  handle('deploy:load', (p) => Object.assign({ success: true, roles: ROLES, providers: PROVIDERS.map(slim) }, store.view(p.repoPath)));
  handle('deploy:search', (p) => ({ success: true, providers: searchProviders(p.query, p.role).map(slim) }));
  handle('deploy:suggest', (p) => suggestForRepo(p.repoPath));
  handle('deploy:saveAccount', (p) => Object.assign({ success: true }, store.saveAccount(p)));
  handle('deploy:deleteAccount', async (p) => {
    const id = String(p.id || '');
    const acc = accountInfo(id);
    for (const tab of Array.from(tabs.values())) {
      if (tab.accountId === id) closeTab(tab.id);
    }
    store.deleteAccount(id);
    if (ACCOUNT_ID.test(id)) {
      try {
        await session.fromPartition(partitionFor(id)).clearStorageData();
      } catch (_) {}
    }
    if (acc && acc.githubUser && GH_USER.test(acc.githubUser)) {
      const left = store.view('').accounts;
      const shared = left.some((a) => String(a.githubUser || '').toLowerCase() === acc.githubUser.toLowerCase());
      if (!shared) {
        try {
          await session.fromPartition(ghPartition(acc.githubUser)).clearStorageData();
        } catch (_) {}
      }
    }
    return Object.assign({ success: true }, store.view(p.repoPath));
  });
  handle('deploy:saveTarget', (p) => {
    const saved = store.saveTarget(p.repoPath, p.target);
    return Object.assign({ success: true, target: saved.target }, store.view(p.repoPath));
  });
  handle('deploy:deleteTarget', (p) => {
    store.deleteTarget(p.repoPath, p.id);
    return Object.assign({ success: true }, store.view(p.repoPath));
  });
  handle('deploy:setUi', (p) => ({ success: true, ui: store.setUi(p) }));

  handle('deploy:githubStatus', async (p) => Object.assign({ success: true }, await githubStatus(String(p.accountId || ''))));
  handle('deploy:githubLogout', async (p) => {
    await githubLogout(String(p.accountId || ''));
    return { success: true };
  });

  handle('deploy:openTab', (p) => {
    const id = String(p.tabId || '');
    if (!TAB_ID.test(id)) return { success: false, error: 'Bad tab id' };
    if (!tabs.has(id) && tabs.size >= MAX_TABS) return { success: false, error: 'At most ' + MAX_TABS + ' tabs can be open' };
    const url = normalizeUrl(p.url);
    if (!url) return { success: false, error: 'That link is not a valid web address' };
    const accountId = ACCOUNT_ID.test(String(p.accountId || '')) ? String(p.accountId) : '';
    tabs.set(id, { id, url, accountId, title: '', view: null, attached: false, popups: new Set() });
    return { success: true };
  });
  handle('deploy:closeTab', (p) => {
    closeTab(String(p.tabId || ''));
    return { success: true };
  });
  handle('deploy:closeAll', () => {
    closeAll();
    return { success: true };
  });
  handle('deploy:layout', (p) => {
    applyLayout(p);
    return { success: true };
  });
  handle('deploy:hide', () => {
    hideAll();
    return { success: true };
  });
  handle('deploy:nav', (p) => {
    const tab = tabs.get(String(p.tabId || ''));
    if (!tab) return { success: false, error: 'Tab not found' };
    runNav(tab, String(p.action || ''), p.url);
    return { success: true };
  });
  handle('deploy:openExternal', (p) => {
    const tab = tabs.get(String(p.tabId || ''));
    let url = tab ? tab.url : '';
    if (tab && tab.view && !tab.view.webContents.isDestroyed()) url = tab.view.webContents.getURL() || url;
    const safe = normalizeUrl(url || p.url);
    if (!safe) return { success: false, error: 'There is no page to open' };
    shell.openExternal(safe);
    return { success: true };
  });
}

function getPids() {
  const out = new Set();
  for (const tab of tabs.values()) {
    try {
      if (tab.view && !tab.view.webContents.isDestroyed()) {
        const pid = tab.view.webContents.getOSProcessId();
        if (pid) out.add(pid);
      }
    } catch (_) {}
  }
  return out;
}

function cleanup() {
  clearTimeout(sleepTimer);
  sleepTimer = null;
  closeAll();
}

module.exports = { register, cleanup, sleepAll, getPids };