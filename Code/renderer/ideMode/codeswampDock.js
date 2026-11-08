import { state as csState } from '../codeswampUI/state.js';
import { getFeatures } from '../featureManager.js';

const LS_W = 'helpertool-ide-cs-w2';
const W_MIN = 300;
const W_MAX = 900;

const ICON = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5a2 2 0 0 1 2-2h5.5"/><path d="M3 5.5v5a2 2 0 0 0 2 2h1v3l3.5-3H12a2 2 0 0 0 2-2V9"/><path d="M15 2.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>';

let btn = null;
let dock = null;
let dockSlot = null;
let modal = null;
let modalSlot = null;
let visible = false;
let lastMode = null;
let tm = null;
let scroll = null;
let resizeBound = false;

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {}
}

function isIde() {
  return document.body.classList.contains('ide-mode');
}

function enabled() {
  try {
    return getFeatures().codeswampChat !== false;
  } catch (_) {
    return true;
  }
}

function currentMode() {
  return csState.parallelMode ? 'modal' : 'dock';
}

function isLive() {
  if (!tm) return false;
  try {
    return Object.keys(tm.getTerminalInstances()).length > 0;
  } catch (_) {
    return false;
  }
}

function refreshButton() {
  if (!btn) return;
  const live = isLive();
  btn.classList.toggle('is-open', visible);
  btn.classList.toggle('is-live', live && !visible);
  if (visible) btn.title = 'Hide Code Swamp chat';
  else if (live) btn.title = 'Code Swamp is running - click to show';
  else btn.title = 'Open Code Swamp chat';
}

function setSidebarCollapsed(want) {
  if (csState.sidebarCollapsed === want) return;
  const toggle = document.getElementById('ocSidebarToggle');
  if (toggle) toggle.click();
}

function initResizer(el, handle) {
  const apply = (w) => document.documentElement.style.setProperty('--ide-cs-w', w + 'px');
  const saved = parseInt(readLS(LS_W, ''), 10);
  if (saved >= W_MIN && saved <= W_MAX) apply(saved);
  let dragging = false;
  let next = 0;
  let raf = 0;
  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    next = 0;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = el.getBoundingClientRect();
    const onLeft = document.body.classList.contains('ide-sb-right');
    const raw = onLeft ? e.clientX - rect.left : rect.right - e.clientX;
    next = Math.min(W_MAX, Math.max(W_MIN, raw));
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        apply(next);
      });
    }
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch (_) {}
    if (next) writeLS(LS_W, String(Math.round(next)));
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

function onHostClickCapture(e) {
  if (!e.target || !e.target.closest) return;
  if (e.target.closest('#ocCloseBtn')) {
    e.stopPropagation();
    e.preventDefault();
    hide();
  }
}

function onHostClick(e) {
  if (currentMode() !== 'dock' || !e.target || !e.target.closest) return;
  if (e.target.closest('.oc-conv-item, #ocNewChatBtn')) {
    setTimeout(() => setSidebarCollapsed(true), 120);
  }
}

function onHostChange(e) {
  if (e.target && e.target.id === 'ocParallelToggle' && visible) place();
}

function buildHosts() {
  if (dock) return;
  const body = document.querySelector('.app-body');
  if (!body) return;
  dock = document.createElement('div');
  dock.id = 'ideCsDock';
  dock.className = 'ide-cs-dock ide-cs-host';
  dock.innerHTML = '<div class="ide-cs-resizer"></div><div class="ide-cs-slot"></div>';
  body.appendChild(dock);
  dockSlot = dock.querySelector('.ide-cs-slot');
  initResizer(dock, dock.querySelector('.ide-cs-resizer'));
  modal = document.createElement('div');
  modal.id = 'ideCsModal';
  modal.className = 'ide-cs-modal-overlay ide-cs-host';
  modal.innerHTML = '<div class="ide-cs-modal"><div class="ide-cs-modal-slot"></div></div>';
  document.body.appendChild(modal);
  modalSlot = modal.querySelector('.ide-cs-modal-slot');
  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) hide();
  });
  [dock, modal].forEach((el) => {
    el.addEventListener('click', onHostClickCapture, true);
    el.addEventListener('click', onHostClick);
    el.addEventListener('change', onHostChange);
  });
}

async function ensurePanel() {
  const existing = document.getElementById('ocPanel');
  if (existing && existing.querySelector('.oc-header')) return existing;
  const holder = document.createElement('div');
  holder.id = 'ocPanelContainer';
  const slot = currentMode() === 'modal' ? modalSlot : dockSlot;
  slot.appendChild(holder);
  try {
    const mod = await import('../codeswampUI.js');
    await mod.init();
  } catch (err) {
    console.error('[IDE] Code Swamp failed to load:', err);
  }
  const panel = document.getElementById('ocPanel');
  if (panel) slot.appendChild(panel);
  holder.remove();
  return panel;
}

function bindResize() {
  if (resizeBound) return;
  const container = document.getElementById('ocTerminalContainer');
  if (!container || typeof ResizeObserver === 'undefined') return;
  resizeBound = true;
  let raf = 0;
  new ResizeObserver(() => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (visible && tm) tm.fitActiveTerminal();
    });
  }).observe(container);
}

function place() {
  const panel = document.getElementById('ocPanel');
  if (!panel || !dock) return;
  const mode = currentMode();
  panel.classList.remove('open');
  panel.classList.add('ide-cs-hosted');
  if (mode === 'modal') {
    dock.classList.remove('open');
    if (panel.parentElement !== modalSlot) modalSlot.appendChild(panel);
    modal.classList.add('open');
  } else {
    modal.classList.remove('open');
    if (panel.parentElement !== dockSlot) dockSlot.appendChild(panel);
    dock.classList.add('open');
  }
  csState.open = true;
  if (mode !== lastMode) {
    lastMode = mode;
    setSidebarCollapsed(mode === 'dock');
  }
  const closeBtn = document.getElementById('ocCloseBtn');
  if (closeBtn) closeBtn.title = 'Hide chat (sessions keep running)';
  if (scroll) scroll.attach(document.getElementById('ocTerminalContainer'));
  bindResize();
  refreshButton();
  requestAnimationFrame(() => {
    if (tm) tm.fitActiveTerminal();
  });
}

async function show() {
  if (!isIde() || !enabled()) return;
  buildHosts();
  if (!dock) return;
  const panel = await ensurePanel();
  if (!panel || !isIde()) return;
  if (!tm) tm = await import('../codeswampUI/terminalManager.js');
  if (!scroll) scroll = await import('./csScrollHelper.js');
  visible = true;
  place();
  const input = document.getElementById('ocInput');
  if (input) input.focus();
}

function hide() {
  visible = false;
  if (dock) dock.classList.remove('open');
  if (modal) modal.classList.remove('open');
  csState.open = false;
  refreshButton();
}

function toggle() {
  if (visible) hide();
  else show();
}

function leaveIde() {
  hide();
  const panel = document.getElementById('ocPanel');
  if (panel) {
    panel.classList.remove('ide-cs-hosted');
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
  }
  const closeBtn = document.getElementById('ocCloseBtn');
  if (closeBtn) closeBtn.title = 'Close (Esc)';
  setSidebarCollapsed(false);
  lastMode = null;
}

function watchMode() {
  let was = isIde();
  new MutationObserver(() => {
    const now = isIde();
    if (was && !now) leaveIde();
    was = now;
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function onKey(e) {
  if (!visible || !isIde()) return;
  if (e.key === 'F2') {
    if (currentMode() === 'modal') hide();
    return;
  }
  if (e.key !== 'Escape' || currentMode() !== 'modal') return;
  const t = e.target;
  if (t && t.closest && t.closest('textarea, input, select, .xterm')) return;
  if (document.querySelector('.oc-pp-overlay, .oc-tp-overlay, .oc-sp-overlay, .oc-ppn-overlay, .oc-bkp-overlay, .oc-replace-overlay, .oc-file-picker')) return;
  hide();
}

function createButton() {
  if (document.getElementById('ideCsBtn') || !enabled()) return;
  const center = document.querySelector('.navbar-row--primary .navbar-section.center');
  const host = center || document.querySelector('.navbar-row--primary .navbar-section.right');
  if (!host) return;
  btn = document.createElement('button');
  btn.id = 'ideCsBtn';
  btn.type = 'button';
  btn.className = 'tool-btn ide-cs-btn';
  btn.title = 'Open Code Swamp chat';
  btn.innerHTML = ICON + '<span class="ide-cs-dot"></span>';
  btn.addEventListener('click', toggle);
  const search = document.getElementById('ideNavSearch');
  if (search && search.parentElement === host) search.after(btn);
  else host.appendChild(btn);
}

export function init() {
  createButton();
  document.addEventListener('ide:codeswamp-toggle', toggle);
  document.addEventListener('keydown', onKey);
  watchMode();
  setInterval(refreshButton, 1500);
}