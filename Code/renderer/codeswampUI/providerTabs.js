import { state } from './state.js';
import { getTerminalInstances } from './terminalManager.js';

const TABS = [
  { id: 'opencode', label: 'OpenCode' },
  { id: 'cline', label: 'Cline' },
];
const CSS_ID = 'ocProviderTabsCss';
let timer = 0;

function injectCss() {
  if (document.getElementById(CSS_ID)) return;
  const el = document.createElement('style');
  el.id = CSS_ID;
  el.textContent =
    '.oc-ptabs{display:flex;flex:0 0 auto;border-bottom:1px solid var(--border-default,#2a2a2a);background:var(--bg-surface,#111);}' +
    '.oc-ptab{position:relative;flex:1 1 0;display:flex;align-items:center;justify-content:center;gap:7px;height:34px;padding:0 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--text-muted,#8a8a8a);font:600 12px var(--font-ui,inherit);cursor:pointer;}' +
    '.oc-ptab:hover{color:var(--text-primary,#e6e6e6);background:var(--bg-hover,rgba(255,255,255,0.05));}' +
    '.oc-ptab.active{color:var(--accent,#3b82f6);border-bottom-color:var(--accent,#3b82f6);background:var(--accent-dim,rgba(59,130,246,0.1));}' +
    '.oc-ptab-dot{display:none;width:7px;height:7px;border-radius:50%;background:var(--green,#3fb950);}' +
    '.oc-ptab.live .oc-ptab-dot{display:inline-block;}';
  document.head.appendChild(el);
}

function buildHtml() {
  return TABS.map((t) =>
    '<button type="button" class="oc-ptab" role="tab" data-provider="' + t.id + '">' +
      '<span>' + t.label + '</span><i class="oc-ptab-dot"></i>' +
    '</button>'
  ).join('');
}

function liveSet() {
  const out = new Set();
  let list = {};
  try {
    list = getTerminalInstances();
  } catch (_) {
    list = {};
  }
  for (const inst of Object.values(list)) {
    if (inst && inst.provider && inst.repoPath === state.activeTab && inst.revealed !== false) out.add(inst.provider);
  }
  return out;
}

function syncTabs() {
  const wrap = document.getElementById('ocProviderTabs');
  if (!wrap) return;
  const live = liveSet();
  wrap.querySelectorAll('[data-provider]').forEach((b) => {
    const id = b.dataset.provider;
    const on = id === state.selectedProvider;
    b.classList.toggle('active', on);
    b.classList.toggle('live', live.has(id));
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function selectProvider(id) {
  if (state.selectedProvider === id) return;
  const sel = document.getElementById('ocAIProviderSelect');
  if (sel) {
    sel.value = id;
    sel.dispatchEvent(new Event('change'));
  } else {
    state.selectedProvider = id;
    try {
      localStorage.setItem('helpertool-cs-provider', id);
    } catch (_) {}
  }
  syncTabs();
}

export function renderProviderTabs() {
  injectCss();
  const header = document.querySelector('#ocPanel .oc-header');
  let wrap = document.getElementById('ocProviderTabs');
  if (!wrap) {
    if (!header) return;
    wrap = document.createElement('div');
    wrap.id = 'ocProviderTabs';
  }
  if (header && wrap.previousElementSibling !== header) header.after(wrap);
  wrap.className = 'oc-ptabs';
  wrap.setAttribute('role', 'tablist');
  if (!wrap.querySelector('.oc-ptab')) wrap.innerHTML = buildHtml();
  if (!wrap.dataset.bound) {
    wrap.dataset.bound = '1';
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-provider]');
      if (b) selectProvider(b.dataset.provider);
    });
  }
  const select = document.getElementById('ocAIProviderSelect');
  if (select && !select.dataset.tabsBound) {
    select.dataset.tabsBound = '1';
    select.addEventListener('change', syncTabs);
  }
  syncTabs();
  if (!timer) {
    timer = setInterval(() => {
      if (document.getElementById('ocProviderTabs')) syncTabs();
    }, 1500);
  }
}