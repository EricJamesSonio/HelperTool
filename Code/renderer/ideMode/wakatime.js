import { state } from '../app_manager/appState.js';
import { getActivePath } from './editor.js';
import { esc } from './highlight.js';

const LS_OFF = 'helpertool-wakatime-off';
const KEY_URL = 'https://wakatime.com/api-key';
const DASH_URL = 'https://wakatime.com/dashboard';
const MIN_GAP = 10000;
const TODAY_EVERY = 60000;

let st = { installed: false, hasKey: false };
let item = null;
let panel = null;
let today = '';
let busy = '';
let msg = null;
let keyForm = false;
let keyVal = '';
let last = { file: '', at: 0 };
let started = false;

function api() {
  return window.wakaAPI || null;
}

function isOff() {
  try {
    return localStorage.getItem(LS_OFF) === '1';
  } catch (_) {
    return false;
  }
}

function setOff(on) {
  try {
    localStorage.setItem(LS_OFF, on ? '1' : '0');
  } catch (_) {}
}

function openUrl(url) {
  if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(url);
}

function injectCss() {
  if (document.getElementById('ideWakaCss')) return;
  const link = document.createElement('link');
  link.id = 'ideWakaCss';
  link.rel = 'stylesheet';
  link.href = './styles/ide-wakatime.css';
  document.head.appendChild(link);
}

function countLines(text) {
  let n = 1;
  let i = -1;
  for (;;) {
    i = text.indexOf('\n', i + 1);
    if (i === -1) break;
    n++;
  }
  return n;
}

function fileOk(p) {
  if (typeof p !== 'string' || !p) return false;
  if (/^(diff|view)\|/.test(p)) return false;
  return true;
}

function beat(write) {
  const a = api();
  if (!a || isOff() || !st.installed || !st.hasKey) return;
  const file = getActivePath();
  if (!fileOk(file)) return;
  const now = Date.now();
  if (!write && file === last.file && now - last.at < MIN_GAP) return;
  last = { file, at: now };
  const payload = { file, write: !!write, repo: state.selectedRepoPath || '' };
  const wrap = document.querySelector('.ide-codewrap');
  const ta = document.querySelector('.ide-ta');
  if (ta && wrap && !wrap.hidden) {
    const v = ta.value;
    const pos = ta.selectionStart;
    const ls = pos === 0 ? 0 : v.lastIndexOf('\n', pos - 1) + 1;
    payload.line = countLines(v.slice(0, pos));
    payload.col = pos - ls + 1;
    payload.lines = countLines(v);
  }
  a.heartbeat(payload).catch(() => {});
}

function onActivity(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('.ide-ta')) {
    if (e.type === 'keydown') {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 's') beat(true);
      return;
    }
    beat(false);
    return;
  }
  if (t.closest('.ide-tab, .ide-row.file, .ide-oe-item')) setTimeout(() => beat(false), 250);
}

async function refreshStatus() {
  const a = api();
  if (!a) return;
  try {
    const res = await a.status();
    if (res && res.success) st = { installed: !!res.installed, hasKey: !!res.hasKey };
  } catch (_) {}
}

async function refreshToday() {
  const a = api();
  if (!a || !st.installed || !st.hasKey) {
    today = '';
    renderItem();
    return;
  }
  try {
    const res = await a.today();
    today = res && res.success ? String(res.text || '').trim() : '';
  } catch (_) {
    today = '';
  }
  renderItem();
  renderPanel();
}

function itemLabel() {
  if (!st.installed) return { text: 'WakaTime: set up', warn: true };
  if (!st.hasKey) return { text: 'WakaTime: add key', warn: true };
  if (isOff()) return { text: 'WakaTime: paused', warn: true };
  return { text: 'WakaTime ' + (today || '...'), warn: false };
}

function renderItem() {
  if (!item) return;
  const l = itemLabel();
  item.textContent = l.text;
  item.classList.toggle('warn', l.warn);
}

function setMsg(text, warn) {
  msg = text ? { text, warn: !!warn } : null;
}

function panelHtml() {
  let h = '<div class="waka-title">WakaTime</div>';
  if (!st.installed) {
    h += '<div class="waka-text">Tracks the time you spend coding in this IDE. The official WakaTime program is downloaded once to your user folder.</div>';
    h += '<button type="button" class="waka-btn primary" data-act="install"' + (busy ? ' disabled' : '') + '>' +
      (busy === 'install' ? '<span class="waka-spin"></span>Downloading...' : 'Install WakaTime') + '</button>';
  } else if (!st.hasKey || keyForm) {
    h += '<div class="waka-text">Paste your WakaTime API key. <a class="waka-link" data-act="key-page">Get it here</a>.</div>';
    h += '<input id="wakaKey" class="waka-in" type="password" autocomplete="off" spellcheck="false" placeholder="waka_..." value="' + esc(keyVal) + '">';
    h += '<div class="waka-row">' +
      (st.hasKey ? '<button type="button" class="waka-btn" data-act="cancel-key">Cancel</button>' : '') +
      '<button type="button" class="waka-btn primary" data-act="save-key"' + (busy ? ' disabled' : '') + '>Save key</button></div>';
  } else {
    h += '<div class="waka-text">Today: <b>' + esc(today || 'no data yet') + '</b></div>';
    h += '<div class="waka-row">' +
      '<button type="button" class="waka-btn" data-act="toggle">' + (isOff() ? 'Resume tracking' : 'Pause tracking') + '</button>' +
      '<button type="button" class="waka-btn" data-act="dash">Dashboard</button></div>';
    h += '<div class="waka-row"><a class="waka-link" data-act="change-key">Change API key</a>' +
      '<a class="waka-link" data-act="refresh">Refresh</a></div>';
  }
  if (msg) h += '<div class="waka-msg' + (msg.warn ? ' warn' : '') + '">' + esc(msg.text) + '</div>';
  return h;
}

function position() {
  if (!panel || !item) return;
  const r = item.getBoundingClientRect();
  panel.style.bottom = Math.round(window.innerHeight - r.top + 6) + 'px';
  panel.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
}

function renderPanel() {
  if (!panel || panel.hidden) return;
  panel.innerHTML = panelHtml();
  position();
}

async function doInstall() {
  const a = api();
  if (!a || busy) return;
  busy = 'install';
  setMsg(null);
  renderPanel();
  try {
    const res = await a.install();
    if (res && res.success) {
      await refreshStatus();
      setMsg(st.hasKey ? 'Installed. Tracking is on.' : 'Installed. Now add your API key.');
    } else {
      setMsg((res && res.error) || 'Install failed.', true);
    }
  } catch (err) {
    setMsg(err && err.message ? err.message : 'Install failed.', true);
  }
  busy = '';
  renderItem();
  renderPanel();
  refreshToday();
}

async function doSaveKey() {
  const a = api();
  if (!a || busy) return;
  const key = keyVal.trim();
  if (!key) {
    setMsg('Paste the API key first.', true);
    renderPanel();
    return;
  }
  busy = 'key';
  setMsg(null);
  renderPanel();
  try {
    const res = await a.setKey(key);
    if (res && res.success) {
      keyVal = '';
      keyForm = false;
      await refreshStatus();
      setMsg('Key saved. Tracking is on.');
    } else {
      setMsg((res && res.error) || 'Could not save the key.', true);
    }
  } catch (err) {
    setMsg(err && err.message ? err.message : 'Could not save the key.', true);
  }
  busy = '';
  renderItem();
  renderPanel();
  refreshToday();
}

function onPanelClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'install') doInstall();
  else if (act === 'save-key') doSaveKey();
  else if (act === 'key-page') openUrl(KEY_URL);
  else if (act === 'dash') openUrl(DASH_URL);
  else if (act === 'change-key') {
    keyForm = true;
    setMsg(null);
    renderPanel();
  } else if (act === 'cancel-key') {
    keyForm = false;
    keyVal = '';
    renderPanel();
  } else if (act === 'toggle') {
    setOff(!isOff());
    renderItem();
    renderPanel();
  } else if (act === 'refresh') refreshToday();
}

function onPanelInput(e) {
  if (e.target.id === 'wakaKey') keyVal = e.target.value;
}

function onPanelKey(e) {
  if (e.key === 'Enter' && e.target.id === 'wakaKey') {
    e.preventDefault();
    doSaveKey();
  }
}

function closePanel() {
  if (panel) panel.hidden = true;
}

function openPanel() {
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'waka-panel';
    panel.hidden = true;
    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('input', onPanelInput);
    panel.addEventListener('keydown', onPanelKey);
    document.body.appendChild(panel);
  }
  panel.hidden = false;
  setMsg(null);
  renderPanel();
  refreshStatus().then(() => {
    renderItem();
    renderPanel();
    refreshToday();
  });
}

function onDocDown(e) {
  if (!panel || panel.hidden) return;
  if (panel.contains(e.target) || (item && item.contains(e.target))) return;
  closePanel();
}

function onDocKey(e) {
  if (e.key === 'Escape' && panel && !panel.hidden) closePanel();
}

function mountItem() {
  if (item && item.isConnected) return true;
  const bar = document.querySelector('.ide-status');
  if (!bar) return false;
  item = document.createElement('span');
  item.className = 'ide-st-item ide-waka-item';
  item.title = 'WakaTime';
  item.addEventListener('click', () => {
    if (panel && !panel.hidden) closePanel();
    else openPanel();
  });
  const pos = bar.querySelector('.ide-st-pos');
  bar.insertBefore(item, pos);
  renderItem();
  return true;
}

export async function init() {
  if (started) return;
  started = true;
  injectCss();
  await refreshStatus();
  const poll = setInterval(() => {
    if (mountItem()) clearInterval(poll);
  }, 1500);
  mountItem();
  ['input', 'keyup', 'keydown', 'mouseup', 'focusin', 'click'].forEach((t) => {
    document.addEventListener(t, onActivity, true);
  });
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onDocKey, true);
  window.addEventListener('resize', position);
  refreshToday();
  setInterval(refreshToday, TODAY_EVERY);
}