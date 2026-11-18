import { state } from './state.js';
import { getProviderStatus, showProviderForRepo, switchProviderView, prewarmSession } from './terminalManager.js';

const TABS = [
  { id: 'opencode', label: 'OpenCode' },
  { id: 'cline', label: 'Cline' },
  { id: 'copilot', label: 'Copilot' },
];
const CSS_ID = 'ocProviderTabsCss';
let timer = 0;
let repoBound = false;

function injectCss() {
  if (document.getElementById(CSS_ID)) return;
  const el = document.createElement('style');
  el.id = CSS_ID;
  el.textContent =
    '.oc-ptabs{display:flex;flex:0 0 auto;border-bottom:1px solid var(--border-default,#2a2a2a);background:var(--bg-surface,#111);}' +
    '.oc-ptab{position:relative;flex:1 1 0;display:flex;align-items:center;justify-content:center;gap:7px;height:34px;padding:0 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--text-muted,#8a8a8a);font:600 12px var(--font-ui,inherit);cursor:pointer;}' +
    '.oc-ptab:hover{color:var(--text-primary,#e6e6e6);background:var(--bg-hover,rgba(255,255,255,0.05));}' +
    '.oc-ptab.active{color:var(--accent,#3b82f6);border-bottom-color:var(--accent,#3b82f6);background:var(--accent-dim,rgba(59,130,246,0.1));}' +
    '.oc-ptab-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--text-muted,#6b6b6b);opacity:0.45;}' +
    '.oc-ptab.st-ready .oc-ptab-dot{background:var(--green,#3fb950);opacity:1;}' +
    '.oc-ptab.st-booting .oc-ptab-dot{background:#eab308;opacity:1;}';
  document.head.appendChild(el);
}

function buildHtml() {
  return TABS.map((t) =>
    '<button type="button" class="oc-ptab st-none" role="tab" data-provider="' + t.id + '">' +
      '<span>' + t.label + '</span><i class="oc-ptab-dot"></i>' +
    '</button>'
  ).join('');
}

function syncTabs() {
  const wrap = document.getElementById('ocProviderTabs');
  if (!wrap) return;
  let status = {};
  try {
    status = state.activeTab ? getProviderStatus(state.activeTab) : {};
  } catch (_) {
    status = {};
  }
  wrap.querySelectorAll('[data-provider]').forEach((b) => {
    const id = b.dataset.provider;
    const on = id === state.selectedProvider;
    const st = status[id] || 'none';
    b.classList.toggle('active', on);
    b.classList.remove('st-ready', 'st-booting', 'st-none');
    b.classList.add('st-' + st);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.title = st === 'none' ? 'Not started' : (st === 'ready' ? 'Terminal ready' : 'Terminal booting');
  });
}

export async function chooseProvider(id) {
  if (!id) return;
  const repo = state.activeTab;
  const prev = state.selectedProvider;
  const sel = document.getElementById('ocAIProviderSelect');
  if (prev !== id) {
    if (sel) {
      sel.value = id;
      sel.dispatchEvent(new Event('change'));
    } else {
      state.selectedProvider = id;
      try {
        localStorage.setItem('helpertool-cs-provider', id);
      } catch (_) {}
      if (repo) {
        if (state.parallelMode) showProviderForRepo(repo, id);
        else switchProviderView(repo, prev);
        prewarmSession(repo, id).catch(() => {});
      }
    }
  } else if (repo) {
    const shown = showProviderForRepo(repo, id);
    if (!shown && !state.parallelMode) switchProviderView(repo, null);
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
      if (b) chooseProvider(b.dataset.provider);
    });
  }
  const select = document.getElementById('ocAIProviderSelect');
  if (select && !select.dataset.tabsBound) {
    select.dataset.tabsBound = '1';
    select.addEventListener('change', syncTabs);
  }
  if (!repoBound) {
    repoBound = true;
    document.addEventListener('repo:switched', () => setTimeout(syncTabs, 50));
  }
  syncTabs();
  if (!timer) {
    timer = setInterval(() => {
      if (document.getElementById('ocProviderTabs')) syncTabs();
    }, 1500);
  }
}