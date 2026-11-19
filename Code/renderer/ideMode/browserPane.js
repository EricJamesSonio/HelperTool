import { esc } from './highlight.js';
import { state } from '../app_manager/appState.js';

const CSS_ID = 'ideBrowserCss';
const PARTITION = 'persist:ide-browser';
const LS_DEV = 'helpertool-ide-device';
const LS_MULTI = 'helpertool-ide-multi';
const DIM_MIN = 200;
const DIM_MAX = 2400;
const MAX_SLOTS = 3;
const SLOT_GAP = 28;
const LABEL_H = 32;
const DPRS = [1, 1.5, 2, 2.625, 3];
const ZOOMS = ['fit', '0.5', '0.75', '1'];

const SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
const I_BACK = SVG + '<path d="M9.5 3.5L5 8l4.5 4.5"/></svg>';
const I_FWD = SVG + '<path d="M6.5 3.5L11 8l-4.5 4.5"/></svg>';
const I_RELOAD = SVG + '<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2.5v3h-3"/></svg>';
const I_FULL = SVG + '<path d="M2.5 6V2.5H6"/><path d="M10 2.5h3.5V6"/><path d="M13.5 10v3.5H10"/><path d="M6 13.5H2.5V10"/></svg>';
const I_MIN = SVG + '<path d="M6 2.5V6H2.5"/><path d="M10 2.5V6h3.5"/><path d="M13.5 10H10v3.5"/><path d="M2.5 10H6v3.5"/></svg>';
const I_OPEN = SVG + '<path d="M9 2.5h4.5V7"/><path d="M13.5 2.5L7.5 8.5"/><path d="M12 9.5V13a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 3 13V5a.5.5 0 0 1 .5-.5H7"/></svg>';
const I_X = SVG + '<path d="M4 4l8 8M12 4l-8 8"/></svg>';
const I_PHONE = SVG + '<rect x="4.5" y="1.5" width="7" height="13" rx="1.6"/><path d="M7 12.4h2"/></svg>';
const I_ROTATE = SVG + '<path d="M12.5 8A4.5 4.5 0 1 1 8 3.5h3"/><path d="M9.5 1.5l2 2-2 2"/></svg>';
const I_GLOBE = SVG + '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6c-2-2-3-4-3-6s1-4 3-6z"/></svg>';
const I_PLUS = SVG + '<path d="M8 3v10M3 8h10"/></svg>';
const I_MULTI = SVG + '<rect x="1.5" y="3.5" width="3.6" height="9" rx="0.8"/><rect x="6.2" y="3.5" width="3.6" height="9" rx="0.8"/><rect x="10.9" y="3.5" width="3.6" height="9" rx="0.8"/></svg>';

const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const UA_GALAXY = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const DEVICES = [
  {
    id: 'responsive', name: 'Responsive', group: 'Custom', w: 390, h: 844, dpr: 2, kind: 'plain',
    ua: UA_ANDROID, bz: [0, 0, 0, 0], or: 0, sr: 0, body: 'transparent', ring: 'transparent', keys: '',
  },
  {
    id: 'iphone-se', name: 'iPhone SE', group: 'Phones', w: 375, h: 667, dpr: 2, kind: 'home',
    ua: UA_IOS, bz: [64, 16, 64, 16], or: 46, sr: 4, body: '#0c0c0e', ring: '#b8b9bd', keys: 'ios',
  },
  {
    id: 'iphone-14', name: 'iPhone 14', group: 'Phones', w: 390, h: 844, dpr: 3, kind: 'notch',
    ua: UA_IOS, bz: [13, 13, 13, 13], or: 60, sr: 47, body: '#0a0a0c', ring: '#4a4a52', keys: 'ios',
  },
  {
    id: 'iphone-15-pro', name: 'iPhone 15 Pro', group: 'Phones', w: 393, h: 852, dpr: 3, kind: 'island',
    ua: UA_IOS, bz: [12, 12, 12, 12], or: 62, sr: 50, body: '#0b0b0d', ring: '#8d8a84', keys: 'ios',
  },
  {
    id: 'iphone-16-pro-max', name: 'iPhone 16 Pro Max', group: 'Phones', w: 440, h: 956, dpr: 3, kind: 'island',
    ua: UA_IOS, bz: [12, 12, 12, 12], or: 68, sr: 56, body: '#0b0b0d', ring: '#a89f94', keys: 'ios',
  },
  {
    id: 'pixel-8', name: 'Pixel 8', group: 'Phones', w: 412, h: 915, dpr: 2.625, kind: 'punch',
    ua: UA_PIXEL, bz: [12, 12, 12, 12], or: 48, sr: 36, body: '#101114', ring: '#5a5d63', keys: 'android',
  },
  {
    id: 'galaxy-s24', name: 'Galaxy S24', group: 'Phones', w: 360, h: 780, dpr: 3, kind: 'punch',
    ua: UA_GALAXY, bz: [9, 9, 9, 9], or: 40, sr: 31, body: '#0d0d0f', ring: '#6b6e75', keys: 'android',
  },
  {
    id: 'ipad-mini', name: 'iPad mini', group: 'Tablets', w: 744, h: 1133, dpr: 2, kind: 'tablet',
    ua: UA_IPAD, bz: [24, 24, 24, 24], or: 42, sr: 18, body: '#0c0c0e', ring: '#9a9ca2', keys: '',
  },
  {
    id: 'ipad-pro-11', name: 'iPad Pro 11', group: 'Tablets', w: 834, h: 1194, dpr: 2, kind: 'tablet',
    ua: UA_IPAD, bz: [22, 22, 22, 22], or: 40, sr: 18, body: '#0c0c0e', ring: '#6e7076', keys: '',
  },
];

function devOf(id) {
  return DEVICES.find((d) => d.id === id) || DEVICES[0];
}

function uaOf(sl) {
  return sl.ua || devOf(sl.id).ua;
}

function keysHtml(kind) {
  const k = (s, p, l) => '<i class="ide-dev-key" data-s="' + s + '" style="--p:' + p + ';--l:' + l + '"></i>';
  if (kind === 'ios') return k('l', '13%', '22px') + k('l', '20%', '42px') + k('l', '29%', '42px') + k('r', '25%', '68px');
  if (kind === 'android') return k('r', '20%', '46px') + k('r', '32%', '32px');
  return '';
}

function bezelHtml(kind) {
  if (kind === 'home') return '<i class="ide-dev-bz1"></i><i class="ide-dev-bz2"></i>';
  if (kind === 'tablet') return '<i class="ide-dev-bz1"></i>';
  return '';
}

function hudHtml(kind) {
  if (kind === 'island' || kind === 'notch' || kind === 'punch') {
    return '<i class="ide-dev-cut"></i><i class="ide-dev-bar"></i>';
  }
  return '';
}

function devOptsHtml(selId) {
  let h = '';
  for (const g of ['Custom', 'Phones', 'Tablets']) {
    h += '<optgroup label="' + g + '">';
    for (const d of DEVICES) {
      if (d.group === g) {
        h += '<option value="' + d.id + '"' + (d.id === selId ? ' selected' : '') + '>' + d.name + '</option>';
      }
    }
    h += '</optgroup>';
  }
  return h;
}

function buildTemplate() {
  let dprOpts = '';
  for (const v of DPRS) dprOpts += '<option value="' + v + '">DPR ' + v + '</option>';
  let zoomOpts = '';
  for (const z of ZOOMS) {
    zoomOpts += '<option value="' + z + '">' + (z === 'fit' ? 'Fit' : Math.round(Number(z) * 100) + '%') + '</option>';
  }
  return '<div class="ide-bv-bar">' +
    '<button type="button" class="ide-bv-ico" data-bv="back" title="Back" disabled>' + I_BACK + '</button>' +
    '<button type="button" class="ide-bv-ico" data-bv="forward" title="Forward" disabled>' + I_FWD + '</button>' +
    '<button type="button" class="ide-bv-ico" data-bv="reload" title="Reload">' + I_RELOAD + '</button>' +
    '<input class="ide-bv-url" type="text" spellcheck="false" autocomplete="off" />' +
    '<span class="ide-bv-tag"></span>' +
    '<button type="button" class="ide-bv-btn" data-bv="device" title="Mobile and tablet view">' + I_PHONE + '<span>Device</span></button>' +
    '<button type="button" class="ide-bv-btn" data-bv="full" title="Show the app over the whole IDE">' + I_FULL + '<span>Full screen</span></button>' +
    '<button type="button" class="ide-bv-btn" data-bv="external" title="Open in your default browser">' + I_OPEN + '<span>Open in browser</span></button>' +
    '<button type="button" class="ide-bv-ico" data-bv="close" title="Close this tab">' + I_X + '</button>' +
  '</div>' +
  '<div class="ide-bv-devbar" hidden>' +
    '<div class="ide-bv-grp" data-grp="single">' +
      '<select class="ide-bv-sel" data-dv="device" title="Device">' + devOptsHtml('') + '</select>' +
      '<input class="ide-bv-num" type="number" min="' + DIM_MIN + '" max="' + DIM_MAX + '" step="1" data-dv="w" title="Width in CSS pixels" />' +
      '<span class="ide-bv-x">\u00d7</span>' +
      '<input class="ide-bv-num" type="number" min="' + DIM_MIN + '" max="' + DIM_MAX + '" step="1" data-dv="h" title="Height in CSS pixels" />' +
      '<button type="button" class="ide-bv-ico" data-bv="rotate" title="Rotate">' + I_ROTATE + '</button>' +
      '<select class="ide-bv-sel" data-dv="dpr" title="Device pixel ratio">' + dprOpts + '</select>' +
    '</div>' +
    '<div class="ide-bv-grp" data-grp="multi" hidden></div>' +
    '<select class="ide-bv-sel" data-dv="zoom" title="Zoom">' + zoomOpts + '</select>' +
    '<button type="button" class="ide-bv-btn" data-bv="multi" title="Show up to 3 devices side by side">' + I_MULTI + '<span>Multi</span></button>' +
    '<span class="ide-bv-read"></span>' +
  '</div>' +
  '<div class="ide-bv-body">' +
    '<div class="ide-dev-stage"></div>' +
  '</div>';
}

const TEMPLATE = buildTemplate();

const SLOT_HTML =
  '<div class="ide-slot-label">' +
    '<span class="ide-slot-idx"></span>' +
    '<span class="ide-slot-name"></span>' +
    '<span class="ide-slot-size"></span>' +
    '<button type="button" class="ide-slot-btn" data-bv="rotate" title="Rotate">' + I_ROTATE + '</button>' +
    '<button type="button" class="ide-slot-btn ide-slot-rm" data-bv="rmslot" title="Remove this device">' + I_X + '</button>' +
  '</div>' +
  '<div class="ide-dev-wrap">' +
    '<div class="ide-dev">' +
      '<div class="ide-dev-screen"><div class="ide-bv-error" hidden></div></div>' +
      '<div class="ide-dev-hud"></div>' +
      '<div class="ide-dev-deco"></div>' +
    '</div>' +
    '<i class="ide-rz ide-rz-r" data-rz="r" title="Drag to change the width"></i>' +
    '<i class="ide-rz ide-rz-b" data-rz="b" title="Drag to change the height"></i>' +
    '<i class="ide-rz ide-rz-c" data-rz="c" title="Drag to resize"></i>' +
  '</div>';

const tabs = [];
let activeId = '';
let seq = 0;
let slotSeq = 0;
let wired = false;

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement('link');
  link.id = CSS_ID;
  link.rel = 'stylesheet';
  link.href = './styles/ide-browser.css';
  document.head.appendChild(link);
}

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function normRepo(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function curRepo() {
  return normRepo(state.selectedRepoPath);
}

function labelOf(u) {
  return String(u).replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '') || 'Browser';
}

function normalize(raw) {
  let v = String(raw || '').trim();
  if (!v) return '';
  if (/^\d{2,5}$/.test(v)) v = 'localhost:' + v;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'http://' + v;
  if (!/^https?:\/\//i.test(v)) return '';
  return v.replace(/^(https?:\/\/)(?:0\.0\.0\.0|\[::\])/i, '$1localhost');
}

function swallow(p) {
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function hostEl() {
  if (!document.body.classList.contains('ide-mode')) return null;
  return document.querySelector('#ideMain .ide-editor');
}

function barEl() {
  return document.querySelector('#ideMain .ide-tabs');
}

function clampDim(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(DIM_MAX, Math.max(DIM_MIN, n));
}

function defaultPrefs() {
  return { id: 'iphone-15-pro', w: 393, h: 852, dpr: 3, zoom: 'fit' };
}

function loadPrefs() {
  const def = defaultPrefs();
  try {
    const raw = JSON.parse(localStorage.getItem(LS_DEV) || 'null');
    if (!raw || typeof raw !== 'object' || !DEVICES.some((d) => d.id === raw.id)) return def;
    const dpr = Number(raw.dpr);
    return {
      id: raw.id,
      w: clampDim(raw.w) || def.w,
      h: clampDim(raw.h) || def.h,
      dpr: DPRS.indexOf(dpr) !== -1 ? dpr : def.dpr,
      zoom: ZOOMS.indexOf(String(raw.zoom)) !== -1 ? String(raw.zoom) : 'fit',
    };
  } catch (_) {
    return def;
  }
}

function savePrefs(d) {
  try {
    localStorage.setItem(LS_DEV, JSON.stringify({ id: d.id, w: d.w, h: d.h, dpr: d.dpr, zoom: d.zoom }));
  } catch (_) {}
}

function savePrefsOf(t) {
  const p = t.slots[0];
  if (!p) return;
  savePrefs({ id: p.id, w: p.w, h: p.h, dpr: p.dpr, zoom: t.dev.zoom });
}

function loadMultiIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_MULTI) || 'null');
    if (Array.isArray(raw)) {
      return raw.filter((id) => DEVICES.some((d) => d.id === id)).slice(0, MAX_SLOTS - 1);
    }
  } catch (_) {}
  return [];
}

function saveMultiIds(t) {
  try {
    localStorage.setItem(LS_MULTI, JSON.stringify(t.slots.slice(1).map((s) => s.id)));
  } catch (_) {}
}

function pickNextId(t) {
  const used = t.slots.map((s) => s.id);
  const order = loadMultiIds().concat(['pixel-8', 'ipad-mini', 'iphone-se', 'galaxy-s24', 'iphone-14']);
  for (const id of order) {
    if (id !== 'responsive' && used.indexOf(id) === -1) return id;
  }
  return 'responsive';
}

function visibleTabs() {
  const repo = curRepo();
  return tabs.filter((t) => t.repo === repo);
}

function activeTab() {
  if (!activeId) return null;
  const t = tabs.find((x) => x.id === activeId);
  return t && t.repo === curRepo() ? t : null;
}

function emit() {
  const t = activeTab();
  const open = !!t && !t.pane.hidden;
  document.dispatchEvent(new CustomEvent('ide:browser-state', {
    detail: { open, full: open && t.full },
  }));
}

function onBarClick(e) {
  const el = e.target && e.target.closest ? e.target.closest('.ide-btab') : null;
  if (!el) return;
  const id = el.dataset.bid;
  if (e.target.closest('.ide-btab-x')) closeTab(id);
  else activateTab(id);
}

function onBarAux(e) {
  if (e.button !== 1) return;
  const el = e.target && e.target.closest ? e.target.closest('.ide-btab') : null;
  if (!el) return;
  e.preventDefault();
  closeTab(el.dataset.bid);
}

function wireBar(bar) {
  if (bar.__bvWired) return;
  bar.__bvWired = true;
  bar.addEventListener('click', onBarClick);
  bar.addEventListener('auxclick', onBarAux);
}

function renderBar() {
  const bar = barEl();
  if (!bar) return;
  wireBar(bar);
  bar.querySelectorAll('.ide-btab').forEach((n) => n.remove());
  const list = visibleTabs();
  const act = activeTab();
  bar.classList.toggle('ide-tabs--bv', !!act);
  const counts = {};
  for (const t of list) counts[t.label] = (counts[t.label] || 0) + 1;
  const seen = {};
  let html = '';
  for (const t of list) {
    seen[t.label] = (seen[t.label] || 0) + 1;
    const name = counts[t.label] > 1 ? t.label + ' (' + seen[t.label] + ')' : t.label;
    html += '<div class="ide-btab' + (act && act.id === t.id ? ' active' : '') + '" data-bid="' + t.id + '" title="' + attr(t.url) + '">' +
      I_GLOBE +
      '<span class="ide-btab-name">' + esc(name) + '</span>' +
      (t.dev.on ? '<span class="ide-btab-dev" title="Device view">' + I_PHONE + '</span>' : '') +
      '<span class="ide-btab-x" title="Close">&times;</span>' +
    '</div>';
  }
  bar.insertAdjacentHTML('beforeend', html);
  const a = bar.querySelector('.ide-btab.active');
  if (a) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function activateTab(id) {
  const t = tabs.find((x) => x.id === id);
  if (!t) return;
  for (const o of tabs) {
    if (o === t) continue;
    if (o.full) setFull(o, false);
    o.pane.hidden = true;
  }
  t.pane.hidden = false;
  activeId = t.id;
  renderBar();
  if (t.dev.on) layoutDev(t);
  emit();
}

function deactivate() {
  for (const o of tabs) {
    if (o.full) setFull(o, false);
    o.pane.hidden = true;
  }
  activeId = '';
  renderBar();
  emit();
}

function closeTab(id) {
  const i = tabs.findIndex((x) => x.id === id);
  if (i < 0) return;
  const t = tabs[i];
  const wasActive = t.id === activeId;
  const before = visibleTabs();
  const vi = before.indexOf(t);
  if (t.ro) t.ro.disconnect();
  t.pane.remove();
  tabs.splice(i, 1);
  if (!wasActive) {
    renderBar();
    return;
  }
  activeId = '';
  const after = visibleTabs();
  const next = after[vi] || after[vi - 1] || null;
  if (next) {
    activateTab(next.id);
    return;
  }
  renderBar();
  emit();
}

function setFull(t, on) {
  t.full = !!on;
  t.pane.classList.toggle('ide-bv--full', t.full);
  t.refs.full.innerHTML = (t.full ? I_MIN : I_FULL) + '<span>' + (t.full ? 'Minimize' : 'Full screen') + '</span>';
  t.refs.full.title = t.full ? 'Back to the editor area (Esc)' : 'Show the app over the whole IDE';
}

function hideSlotError(sl) {
  sl.error.hidden = true;
}

function hideErrors(t) {
  for (const sl of t.slots) hideSlotError(sl);
}

function showError(t, sl, target, desc) {
  sl.error.innerHTML =
    '<div class="ide-bv-err-title">Cannot reach the page</div>' +
    '<div class="ide-bv-err-url">' + esc(target || t.url) + '</div>' +
    '<div class="ide-bv-err-desc">' + esc(desc || 'The server may still be starting.') + '</div>' +
    '<button type="button" class="ide-bv-btn" data-bv="reload">Retry</button>';
  sl.error.hidden = false;
}

function setUrl(t, next) {
  if (!next) return;
  t.url = next;
  if (!t.title) t.label = labelOf(next);
  if (document.activeElement !== t.refs.urlIn) t.refs.urlIn.value = next;
  if (!t.pane.hidden) renderBar();
}

function syncNav(t) {
  const p = t.slots[0];
  try {
    t.refs.back.disabled = !(p && p.ready && p.wv.canGoBack());
    t.refs.forward.disabled = !(p && p.ready && p.wv.canGoForward());
  } catch (_) {}
}

function loadSlot(sl, next) {
  try {
    if (sl.ready) swallow(sl.wv.loadURL(next));
    else sl.wv.setAttribute('src', next);
  } catch (_) {
    sl.wv.setAttribute('src', next);
  }
}

function load(t, next) {
  t.url = next;
  t.refs.urlIn.value = next;
  hideErrors(t);
  for (const sl of t.slots) loadSlot(sl, next);
}

function reload(t) {
  hideErrors(t);
  for (const sl of t.slots) {
    try {
      if (sl.ready) sl.wv.reload();
      else swallow(sl.wv.loadURL(t.url));
    } catch (_) {
      sl.wv.setAttribute('src', t.url);
    }
  }
}

function goBack(t) {
  const p = t.slots[0];
  try {
    if (p && p.ready && p.wv.canGoBack()) p.wv.goBack();
  } catch (_) {}
}

function goForward(t) {
  const p = t.slots[0];
  try {
    if (p && p.ready && p.wv.canGoForward()) p.wv.goForward();
  } catch (_) {}
}

function mirror(t, url) {
  for (let i = 1; i < t.slots.length; i++) {
    const sl = t.slots[i];
    if (!sl.ready) continue;
    let cur = '';
    try {
      cur = sl.wv.getURL();
    } catch (_) {
      cur = '';
    }
    if (cur && cur !== url) swallow(sl.wv.loadURL(url));
  }
}

function onUrlKey(t, e) {
  e.stopPropagation();
  if (e.key === 'Enter') {
    e.preventDefault();
    const next = normalize(t.refs.urlIn.value);
    if (!next) {
      t.refs.urlIn.value = t.url;
      return;
    }
    load(t, next);
    t.refs.urlIn.blur();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    t.refs.urlIn.value = t.url;
    t.refs.urlIn.blur();
  }
}

async function applyEmu(t, sl, doReload) {
  if (!sl.ready) {
    sl.pendingEmu = true;
    return;
  }
  const on = t.dev.on;
  try {
    if (!sl.baseUA) sl.baseUA = sl.wv.getUserAgent();
    sl.wv.setUserAgent(on ? uaOf(sl) : sl.baseUA);
  } catch (_) {}
  const api = window.ideBrowserAPI;
  if (api && typeof api.emulate === 'function') {
    try {
      const id = sl.wv.getWebContentsId();
      await api.emulate({ id, enabled: on, width: sl.w, height: sl.h, dpr: sl.dpr });
    } catch (_) {}
  }
  if (doReload) {
    try {
      sl.wv.reload();
    } catch (_) {}
  }
}

function dprValue(v) {
  return DPRS.indexOf(v) !== -1 ? String(v) : '2';
}

function geoOf(sl) {
  const dv = devOf(sl.id);
  const land = sl.w > sl.h;
  let bt = dv.bz[0];
  let br = dv.bz[1];
  let bb = dv.bz[2];
  let bl = dv.bz[3];
  if (land) {
    [bt, br, bb, bl] = [br, bb, bl, bt];
  }
  return { dv, land, bt, br, bb, bl, ow: sl.w + bl + br, oh: sl.h + bt + bb };
}

function paintSlot(sl, g, k, i) {
  const dv = g.dv;
  if (sl.sig !== dv.id) {
    sl.sig = dv.id;
    sl.deco.innerHTML = bezelHtml(dv.kind) + keysHtml(dv.keys);
    sl.hud.innerHTML = hudHtml(dv.kind);
  }
  const ds = sl.dev.style;
  ds.setProperty('--w', sl.w + 'px');
  ds.setProperty('--h', sl.h + 'px');
  ds.setProperty('--bt', g.bt + 'px');
  ds.setProperty('--br', g.br + 'px');
  ds.setProperty('--bb', g.bb + 'px');
  ds.setProperty('--bl', g.bl + 'px');
  ds.setProperty('--or', dv.or + 'px');
  ds.setProperty('--sr', dv.sr + 'px');
  ds.setProperty('--fb', dv.body);
  ds.setProperty('--fr', dv.ring);
  ds.transform = 'scale(' + k + ')';
  sl.dev.dataset.kind = dv.kind;
  sl.dev.dataset.land = g.land ? '1' : '0';
  sl.wrap.style.width = Math.round(g.ow * k) + 'px';
  sl.wrap.style.height = Math.round(g.oh * k) + 'px';
  sl.idxEl.textContent = String(i + 1);
  sl.nameEl.textContent = dv.name;
  sl.sizeEl.textContent = sl.w + ' \u00d7 ' + sl.h;
  sl.label.title = dv.name + ' - ' + sl.w + ' \u00d7 ' + sl.h + ' @' + sl.dpr + 'x';
}

function updateRead(t) {
  const p = t.slots[0];
  const pct = Math.round(t.scale * 100) + '%';
  t.refs.read.textContent = t.dev.multi || !p ? pct : p.w + ' \u00d7 ' + p.h + '  ' + pct;
}

function layoutDev(t) {
  if (!t.dev.on) return;
  const r = t.refs;
  const geos = t.slots.map(geoOf);
  let k = 1;
  if (t.dragScale) {
    k = t.dragScale;
  } else if (t.dev.zoom === 'fit') {
    const sw = r.stage.clientWidth;
    const sh = r.stage.clientHeight;
    if (sw < 50 || sh < 50) return;
    let totalW = SLOT_GAP * (geos.length - 1);
    let maxH = 0;
    for (const g of geos) {
      totalW += g.ow;
      if (g.oh > maxH) maxH = g.oh;
    }
    k = Math.min(1, Math.max(80, sw - 48) / totalW, Math.max(80, sh - 48 - LABEL_H) / maxH);
  } else {
    k = Number(t.dev.zoom) || 1;
  }
  k = Math.max(0.1, k);
  t.scale = k;
  t.slots.forEach((sl, i) => {
    paintSlot(sl, geos[i], k, i);
  });
  updateRead(t);
}

function syncInputs(t) {
  const p = t.slots[0];
  const r = t.refs;
  if (!p) return;
  r.devSel.value = p.id;
  r.wIn.value = String(p.w);
  r.hIn.value = String(p.h);
  const free = p.id === 'responsive';
  r.wIn.disabled = !free;
  r.hIn.disabled = !free;
  r.dprSel.value = dprValue(p.dpr);
}

function renderChips(t) {
  let h = '';
  t.slots.forEach((sl, i) => {
    h += '<span class="ide-bv-chip">' +
      '<b>' + (i + 1) + '</b>' +
      '<select class="ide-bv-sel ide-bv-sel--chip" data-ms="' + i + '" title="Device ' + (i + 1) + '">' + devOptsHtml(sl.id) + '</select>' +
      (t.slots.length > 1
        ? '<button type="button" class="ide-bv-chip-x" data-bv="rmslot" data-i="' + i + '" title="Remove device ' + (i + 1) + '">' + I_X + '</button>'
        : '') +
    '</span>';
  });
  if (t.slots.length < MAX_SLOTS) {
    h += '<button type="button" class="ide-bv-btn" data-bv="addslot" title="Add another device (max ' + MAX_SLOTS + ')">' + I_PLUS + '<span>Add device</span></button>';
  }
  t.refs.multiGrp.innerHTML = h;
}

function syncDevUi(t) {
  const d = t.dev;
  const r = t.refs;
  t.pane.classList.toggle('ide-bv--dev', d.on);
  t.pane.classList.toggle('ide-bv--multi', d.on && d.multi);
  r.devBar.hidden = !d.on;
  r.devBtn.classList.toggle('on', d.on);
  if (!d.on) {
    for (const sl of t.slots) {
      sl.dev.removeAttribute('style');
      sl.wrap.removeAttribute('style');
    }
    return;
  }
  r.singleGrp.hidden = d.multi;
  r.multiGrp.hidden = !d.multi;
  r.multiBtn.classList.toggle('on', d.multi);
  r.zoomSel.value = d.zoom;
  if (d.multi) renderChips(t);
  else syncInputs(t);
  layoutDev(t);
}

function trimSlots(t, n) {
  while (t.slots.length > n) {
    const sl = t.slots.pop();
    sl.root.remove();
  }
}

function addSlot(t) {
  if (t.slots.length >= MAX_SLOTS) return;
  const dv = devOf(pickNextId(t));
  createSlot(t, { id: dv.id, w: dv.w, h: dv.h, dpr: dv.dpr, url: t.url, emu: true });
  saveMultiIds(t);
  syncDevUi(t);
}

function removeSlot(t, i) {
  if (t.slots.length <= 1 || i < 0 || i >= t.slots.length) return;
  const sl = t.slots[i];
  t.slots.splice(i, 1);
  sl.root.remove();
  savePrefsOf(t);
  saveMultiIds(t);
  syncNav(t);
  syncDevUi(t);
}

function toggleDevice(t) {
  t.dev.on = !t.dev.on;
  if (!t.dev.on) {
    t.dev.multi = false;
    trimSlots(t, 1);
  }
  syncDevUi(t);
  for (const sl of t.slots) applyEmu(t, sl, true);
  renderBar();
}

function toggleMulti(t) {
  if (!t.dev.on) return;
  t.dev.multi = !t.dev.multi;
  if (t.dev.multi) {
    if (t.slots.length < 2) addSlot(t);
  } else {
    trimSlots(t, 1);
  }
  syncDevUi(t);
}

function afterDevChange(t, sl, doReload) {
  if (t.slots[0] === sl) savePrefsOf(t);
  else saveMultiIds(t);
  syncDevUi(t);
  applyEmu(t, sl, doReload);
}

function pickDevice(t, sl, id) {
  const prevUa = uaOf(sl);
  const dv = devOf(id);
  const land = sl.w > sl.h;
  sl.id = dv.id;
  sl.ua = '';
  if (dv.id !== 'responsive') {
    sl.w = land ? dv.h : dv.w;
    sl.h = land ? dv.w : dv.h;
    sl.dpr = dv.dpr;
  }
  afterDevChange(t, sl, prevUa !== uaOf(sl));
}

function rotate(t, sl) {
  if (!sl) return;
  const w = sl.w;
  sl.w = sl.h;
  sl.h = w;
  afterDevChange(t, sl, false);
}

function freezeStage(t) {
  const stage = t.refs.stage;
  const cs = getComputedStyle(stage);
  const pl = parseFloat(cs.paddingLeft) || 0;
  const pt = parseFloat(cs.paddingTop) || 0;
  const pos = t.slots.map((sl) => [sl.root.offsetLeft, sl.root.offsetTop]);
  t.slots.forEach((sl, i) => {
    const top = Math.max(0, pos[i][1] - pt);
    const left = i === 0 ? Math.max(0, pos[i][0] - pl) : 0;
    sl.root.style.margin = top + 'px 0 0 ' + left + 'px';
  });
}

function thawStage(t) {
  for (const sl of t.slots) sl.root.style.margin = '';
}

function startResize(t, sl, handle, e) {
  if (!t.dev.on || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const mode = handle.dataset.rz;
  const k = t.scale || 1;
  const x0 = e.clientX;
  const y0 = e.clientY;
  const w0 = sl.w;
  const h0 = sl.h;
  freezeStage(t);
  if (sl.id !== 'responsive') {
    sl.ua = uaOf(sl);
    sl.id = 'responsive';
  }
  t.dragScale = k;
  t.pane.classList.add('ide-bv--drag');
  handle.classList.add('active');
  try {
    handle.setPointerCapture(e.pointerId);
  } catch (_) {}
  syncDevUi(t);
  let raf = 0;
  const onMove = (ev) => {
    if (mode === 'r' || mode === 'c') sl.w = clampDim(w0 + (ev.clientX - x0) / k) || sl.w;
    if (mode === 'b' || mode === 'c') sl.h = clampDim(h0 + (ev.clientY - y0) / k) || sl.h;
    layoutDev(t);
    if (t.slots[0] === sl) syncInputs(t);
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        applyEmu(t, sl, false);
      });
    }
  };
  const onEnd = (ev) => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onEnd);
    handle.removeEventListener('pointercancel', onEnd);
    try {
      handle.releasePointerCapture(ev.pointerId);
    } catch (_) {}
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    handle.classList.remove('active');
    t.pane.classList.remove('ide-bv--drag');
    t.dragScale = 0;
    thawStage(t);
    afterDevChange(t, sl, false);
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onEnd);
  handle.addEventListener('pointercancel', onEnd);
}

function slotOf(t, el) {
  const root = el && el.closest ? el.closest('.ide-slot') : null;
  if (!root) return null;
  return t.slots.find((s) => s.root === root) || null;
}

function onPaneChange(t, e) {
  const el = e.target;
  const r = t.refs;
  const p = t.slots[0];
  if (el && el.dataset && el.dataset.ms !== undefined) {
    const sl = t.slots[Number(el.dataset.ms)];
    if (sl) pickDevice(t, sl, el.value);
    return;
  }
  if (!p) return;
  if (el === r.devSel) {
    pickDevice(t, p, el.value);
    return;
  }
  if (el === r.wIn || el === r.hIn) {
    p.w = clampDim(r.wIn.value) || p.w;
    p.h = clampDim(r.hIn.value) || p.h;
    afterDevChange(t, p, false);
    return;
  }
  if (el === r.dprSel) {
    p.dpr = Number(el.value) || 2;
    afterDevChange(t, p, false);
    return;
  }
  if (el === r.zoomSel) {
    t.dev.zoom = el.value;
    savePrefsOf(t);
    syncDevUi(t);
  }
}

function onPaneClick(t, e) {
  const b = e.target && e.target.closest ? e.target.closest('[data-bv]') : null;
  if (!b || b.disabled) return;
  const act = b.dataset.bv;
  const sl = slotOf(t, b);
  if (act === 'back') goBack(t);
  else if (act === 'forward') goForward(t);
  else if (act === 'reload') reload(t);
  else if (act === 'full') {
    setFull(t, !t.full);
    emit();
  } else if (act === 'external') window.electronAPI.openExternal(t.url);
  else if (act === 'device') toggleDevice(t);
  else if (act === 'multi') toggleMulti(t);
  else if (act === 'addslot') addSlot(t);
  else if (act === 'rmslot') {
    const idx = b.dataset.i !== undefined ? Number(b.dataset.i) : t.slots.indexOf(sl);
    removeSlot(t, idx);
  } else if (act === 'rotate') rotate(t, sl || t.slots[0]);
  else if (act === 'close') closeTab(t.id);
}

function wireView(t, sl) {
  const wv = sl.wv;
  const primary = () => t.slots[0] === sl;
  wv.addEventListener('dom-ready', () => {
    sl.ready = true;
    if (!sl.baseUA) {
      try {
        sl.baseUA = wv.getUserAgent();
      } catch (_) {
        sl.baseUA = '';
      }
    }
    if (sl.pendingEmu) {
      sl.pendingEmu = false;
      applyEmu(t, sl, true);
    } else if (t.dev.on) {
      applyEmu(t, sl, false);
    }
    if (primary()) syncNav(t);
  });
  wv.addEventListener('did-start-loading', () => {
    if (primary()) t.pane.classList.add('loading');
    hideSlotError(sl);
  });
  wv.addEventListener('did-stop-loading', () => {
    if (!primary()) return;
    t.pane.classList.remove('loading');
    syncNav(t);
  });
  wv.addEventListener('did-navigate', (e) => {
    if (!primary()) return;
    setUrl(t, e.url);
    if (t.dev.on) applyEmu(t, sl, false);
    mirror(t, e.url);
    syncNav(t);
  });
  wv.addEventListener('did-navigate-in-page', (e) => {
    if (!primary()) return;
    if (e.isMainFrame) {
      setUrl(t, e.url);
      mirror(t, e.url);
    }
    syncNav(t);
  });
  wv.addEventListener('page-title-updated', (e) => {
    if (primary()) t.refs.urlIn.title = e.title || '';
  });
  wv.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || e.errorCode === -3) return;
    showError(t, sl, e.validatedURL, e.errorDescription);
  });
}

function createSlot(t, init) {
  const root = document.createElement('div');
  root.className = 'ide-slot';
  root.innerHTML = SLOT_HTML;
  const q = (s) => root.querySelector(s);
  const sl = {
    uid: 's' + (++slotSeq),
    id: init.id,
    w: init.w,
    h: init.h,
    dpr: init.dpr,
    ua: '',
    wv: null,
    ready: false,
    baseUA: '',
    pendingEmu: !!init.emu,
    sig: '',
    root,
    label: q('.ide-slot-label'),
    idxEl: q('.ide-slot-idx'),
    nameEl: q('.ide-slot-name'),
    sizeEl: q('.ide-slot-size'),
    wrap: q('.ide-dev-wrap'),
    dev: q('.ide-dev'),
    deco: q('.ide-dev-deco'),
    hud: q('.ide-dev-hud'),
    screen: q('.ide-dev-screen'),
    error: q('.ide-bv-error'),
  };
  const wv = document.createElement('webview');
  wv.className = 'ide-bv-view';
  wv.setAttribute('partition', PARTITION);
  wv.setAttribute('src', init.url);
  sl.screen.insertBefore(wv, sl.error);
  sl.wv = wv;
  root.addEventListener('pointerdown', (e) => {
    const h = e.target && e.target.closest ? e.target.closest('.ide-rz') : null;
    if (h) startResize(t, sl, h, e);
  });
  t.refs.stage.appendChild(root);
  t.slots.push(sl);
  wireView(t, sl);
  return sl;
}

function createTab(host, url, title) {
  ensureCss();
  const pane = document.createElement('div');
  pane.className = 'ide-browser';
  pane.innerHTML = TEMPLATE;
  pane.hidden = true;
  host.appendChild(pane);
  const q = (s) => pane.querySelector(s);
  const p = loadPrefs();
  const t = {
    id: 'bv' + (++seq),
    repo: curRepo(),
    url,
    title: title || '',
    label: title || labelOf(url),
    pane,
    full: false,
    ro: null,
    slots: [],
    scale: 1,
    dragScale: 0,
    dev: { on: false, multi: false, zoom: p.zoom },
    refs: {
      back: q('[data-bv="back"]'),
      forward: q('[data-bv="forward"]'),
      urlIn: q('.ide-bv-url'),
      tag: q('.ide-bv-tag'),
      full: q('[data-bv="full"]'),
      devBtn: q('[data-bv="device"]'),
      multiBtn: q('[data-bv="multi"]'),
      devBar: q('.ide-bv-devbar'),
      singleGrp: q('[data-grp="single"]'),
      multiGrp: q('[data-grp="multi"]'),
      devSel: q('[data-dv="device"]'),
      wIn: q('[data-dv="w"]'),
      hIn: q('[data-dv="h"]'),
      dprSel: q('[data-dv="dpr"]'),
      zoomSel: q('[data-dv="zoom"]'),
      read: q('.ide-bv-read'),
      stage: q('.ide-dev-stage'),
    },
  };
  t.refs.tag.textContent = title || '';
  t.refs.urlIn.value = url;
  createSlot(t, { id: p.id, w: p.w, h: p.h, dpr: p.dpr, url });
  pane.addEventListener('click', (e) => onPaneClick(t, e));
  pane.addEventListener('change', (e) => onPaneChange(t, e));
  t.refs.urlIn.addEventListener('keydown', (e) => onUrlKey(t, e));
  t.refs.devBar.addEventListener('keydown', (e) => e.stopPropagation());
  if (typeof ResizeObserver === 'function') {
    let raf = 0;
    t.ro = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (t.dev.on && t.dev.zoom === 'fit' && !t.pane.hidden && !t.dragScale) layoutDev(t);
      });
    });
    t.ro.observe(t.refs.stage);
  }
  tabs.push(t);
  return t;
}

function onKey(e) {
  const t = activeTab();
  if (!t || t.pane.hidden || !t.full) return;
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopPropagation();
  setFull(t, false);
  emit();
}

function onRepoSwitched() {
  deactivate();
}

function onRepoClosed(e) {
  const p = e && e.detail && e.detail.repoPath;
  if (!p) return;
  const key = normRepo(p);
  const gone = tabs.filter((t) => t.repo === key).map((t) => t.id);
  for (const id of gone) closeTab(id);
}

function onBodyClass() {
  if (!document.body.classList.contains('ide-mode')) deactivate();
}

function wireGlobal() {
  if (wired) return;
  wired = true;
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('repo:switched', onRepoSwitched);
  document.addEventListener('repo:closed', onRepoClosed);
  document.addEventListener('ide:file-activate', deactivate);
  document.addEventListener('ide:tabs-rendered', renderBar);
  new MutationObserver(onBodyClass).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function pruneDead() {
  for (let i = tabs.length - 1; i >= 0; i--) {
    if (!tabs[i].pane.isConnected) {
      if (tabs[i].ro) tabs[i].ro.disconnect();
      if (tabs[i].id === activeId) activeId = '';
      tabs.splice(i, 1);
    }
  }
}

export function show(opts) {
  const o = opts || {};
  const next = normalize(o.url);
  const host = hostEl();
  if (!next || !host) return false;
  wireGlobal();
  pruneDead();
  const t = createTab(host, next, typeof o.title === 'string' ? o.title.trim() : '');
  activateTab(t.id);
  return true;
}

export function hide() {
  deactivate();
}

export function close() {
  const t = activeTab();
  if (t) closeTab(t.id);
}

export function closeAll() {
  const ids = tabs.map((t) => t.id);
  for (const id of ids) closeTab(id);
}

export function setFullscreen(on) {
  const t = activeTab();
  if (!t || t.pane.hidden) return;
  setFull(t, on);
  emit();
}

export function isOpen() {
  const t = activeTab();
  return !!t && !t.pane.hidden;
}

export function isFullscreen() {
  const t = activeTab();
  return !!t && !t.pane.hidden && t.full;
}

export function count() {
  return visibleTabs().length;
}