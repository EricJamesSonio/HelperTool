'use strict';

const { ipcMain, BrowserView, session, shell } = require('electron');
const { makeDeployStore } = require('../utils/deployStore.js');
const { PROVIDERS, ROLES, searchProviders, normalizeUrl, toNavigableUrl } = require('../utils/deployProviders.js');
const { suggestForRepo } = require('../services/deploySuggest.js');

const MAX_TABS = 4;
const SLEEP_AFTER_MS = 45000;
const TAB_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,80}$/;

let getWin = () => null;
let store = null;
let sleepTimer = null;
const tabs = new Map();
const configured = new Set();

function partitionFor(accountId) {
  return 'persist:deploy-' + (ACCOUNT_ID.test(accountId || '') ? accountId : 'default');
}

function secureSession(ses, partition) {
  if (configured.has(partition)) return;
  configured.add(partition);
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write' || permission === 'fullscreen');
  });
}

function cleanUserAgent(ua) {
  return String(ua || '')
    .replace(/\s*Electron\/[\d.]+/i, '')
    .replace(/\s[\w.-]+\/[\d.]+(?=\sChrome\/)/, '');
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

function createView(tab) {
  const partition = partitionFor(tab.accountId);
  const view = new BrowserView({
    webPreferences: { partition, nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false },
  });
  const wc = view.webContents;
  secureSession(wc.session, partition);
  wc.setUserAgent(cleanUserAgent(wc.getUserAgent()));
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) wc.loadURL(url).catch(() => {});
    return { action: 'deny' };
  });
  const push = () => sendState(tab);
  for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated']) {
    wc.on(ev, push);
  }
  tab.view = view;
  tab.attached = false;
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
    for (const tab of Array.from(tabs.values())) {
      if (tab.accountId === id) closeTab(tab.id);
    }
    store.deleteAccount(id);
    if (ACCOUNT_ID.test(id)) {
      try {
        await session.fromPartition(partitionFor(id)).clearStorageData();
      } catch (_) {}
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

  handle('deploy:openTab', (p) => {
    const id = String(p.tabId || '');
    if (!TAB_ID.test(id)) return { success: false, error: 'Bad tab id' };
    if (!tabs.has(id) && tabs.size >= MAX_TABS) return { success: false, error: 'At most ' + MAX_TABS + ' tabs can be open' };
    const url = normalizeUrl(p.url);
    if (!url) return { success: false, error: 'That link is not a valid web address' };
    const accountId = ACCOUNT_ID.test(String(p.accountId || '')) ? String(p.accountId) : '';
    tabs.set(id, { id, url, accountId, title: '', view: null, attached: false });
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