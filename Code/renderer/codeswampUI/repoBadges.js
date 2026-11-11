import { state } from './state.js';
import { getTerminalInstances, activateSlot } from './terminalManager.js';
import { getProvider } from './providers.js';

const CSS_ID = 'ocRepoBadgesCss';
const WRAP_ID = 'ocRepoBadges';
const COLORS = ['#4f8cff', '#ff8c42', '#23d18b', '#d670d6', '#eab308', '#22d3ee'];
const dismissed = new Set();
let timer = 0;
let lastSig = '';

function injectCss() {
  if (document.getElementById(CSS_ID)) return;
  const el = document.createElement('style');
  el.id = CSS_ID;
  el.textContent = [
    '.oc-rb-wrap{display:flex;align-items:center;gap:4px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none;margin-left:6px;padding-left:10px;border-left:1px solid var(--border-subtle,rgba(255,255,255,0.15));}',
    '.oc-rb-wrap::-webkit-scrollbar{display:none;}',
    '.oc-rb{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 6px 0 8px;border-radius:5px;border:1px solid var(--border-subtle,rgba(255,255,255,0.15));border-bottom:2px solid var(--rb-color,#4f8cff);background:var(--bg-elevated,#0f1117);color:var(--text-muted,#a3b1bd);font:600 11px var(--font-mono,monospace);cursor:pointer;white-space:nowrap;}',
    '.oc-rb:hover{color:var(--text-primary,#f0f6fc);background:var(--bg-hover,rgba(255,255,255,0.08));}',
    '.oc-rb.active{color:var(--text-primary,#f0f6fc);background:var(--accent-dim,rgba(34,211,238,0.12));border-color:var(--rb-color,#4f8cff);}',
    '.oc-rb-dot{width:7px;height:7px;border-radius:50%;background:var(--rb-color,#4f8cff);flex:0 0 auto;}',
    '.oc-rb.idle .oc-rb-dot{background:transparent;border:1px solid var(--rb-color,#4f8cff);}',
    '.oc-rb-tag{font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;background:rgba(255,255,255,0.08);color:var(--text-secondary,#c6cfd8);}',
    '.oc-rb.idle .oc-rb-tag{background:transparent;border:1px dashed var(--border-default,rgba(255,255,255,0.25));}',
    '.oc-rb-x{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-left:2px;border-radius:50%;font-size:13px;line-height:1;color:var(--text-muted,#a3b1bd);opacity:0.6;cursor:pointer;}',
    '.oc-rb-x:hover{opacity:1;background:rgba(248,113,113,0.2);color:var(--red,#f87171);}',
  ].join('');
  document.head.appendChild(el);
}

function repoName(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || String(p || '');
}

function norm(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function colorFor(p) {
  const s = norm(p);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function sameRepo(a, b) {
  return norm(a) === norm(b);
}

export function dismissRepo(repoPath) {
  const k = norm(repoPath);
  if (!k) return;
  dismissed.add(k);
  lastSig = '';
}

export function undismissRepo(repoPath) {
  const k = norm(repoPath);
  if (!k) return;
  if (dismissed.delete(k)) lastSig = '';
}

function collect() {
  const out = [];
  let list = {};
  try {
    list = getTerminalInstances();
  } catch (_) {
    list = {};
  }
  for (const inst of Object.values(list)) {
    if (!inst || !inst.repoPath) continue;
    if (inst.revealed === false) continue;
    dismissed.delete(norm(inst.repoPath));
    out.push({
      repoPath: inst.repoPath,
      provider: inst.provider || state.selectedProvider,
      slot: inst.slotIndex,
      live: true,
    });
  }
  out.sort((a, b) => a.slot - b.slot);

  const known = [];
  for (const t of state.tabs) {
    if (t && t.repoPath) known.push(t.repoPath);
  }
  if (state.activeTab) known.push(state.activeTab);
  if (window.__activeRepoPath) known.push(window.__activeRepoPath);

  const seen = new Set();
  for (const rp of known) {
    const k = norm(rp);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (dismissed.has(k)) continue;
    if (out.some((i) => sameRepo(i.repoPath, rp))) continue;
    out.push({ repoPath: rp, provider: null, slot: -1, live: false });
  }
  return out;
}

function onChipClick(it) {
  import('./repoTabs.js').then((m) => {
    m.switchTab(it.repoPath);
    if (it.provider && it.provider !== state.selectedProvider) {
      const sel = document.getElementById('ocAIProviderSelect');
      if (sel) {
        sel.value = it.provider;
        sel.dispatchEvent(new Event('change'));
      }
    }
    if (it.slot >= 0 && state.parallelMode) activateSlot(it.slot);
    const input = document.getElementById('ocInput');
    if (input && !it.live) setTimeout(() => input.focus(), 50);
  }).catch(() => {});
}

function onCloseClick(it) {
  import('./repoTabs.js').then((m) => {
    const slot = state.parallelMode && it.slot >= 0 ? it.slot : undefined;
    return m.closeRepoTab(it.repoPath, slot);
  }).catch((err) => {
    console.error('[CS] close tab failed:', err);
  });
}

function render() {
  const panel = document.getElementById('ocPanel');
  if (!panel) return;
  const left = panel.querySelector('.oc-header-left');
  if (!left) return;
  let wrap = document.getElementById(WRAP_ID);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = WRAP_ID;
    wrap.className = 'oc-rb-wrap';
  }
  if (wrap.parentElement !== left) left.appendChild(wrap);

  const active = state.activeTab;
  const items = collect();
  const sig = items
    .map((i) => [i.repoPath, i.provider, i.slot, i.live ? 1 : 0].join('~'))
    .join('|') + '#' + active + '#' + state.activeSlotIndex + '#' + (state.parallelMode ? 'p' : 's');
  if (sig === lastSig && wrap.childElementCount) return;
  if (sig === lastSig && !items.length) return;
  lastSig = sig;

  wrap.textContent = '';
  for (const it of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActiveRepo = sameRepo(it.repoPath, active);
    const isActive = state.parallelMode && it.slot >= 0
      ? it.slot === state.activeSlotIndex
      : isActiveRepo;
    btn.className = 'oc-rb' + (isActive ? ' active' : '') + (it.live ? '' : ' idle');
    btn.style.setProperty('--rb-color', colorFor(it.repoPath));
    btn.title = it.repoPath + (it.live ? ' (running)' : ' (no chat yet - click to start one)');

    const dot = document.createElement('i');
    dot.className = 'oc-rb-dot';
    btn.appendChild(dot);

    const name = document.createElement('span');
    name.textContent = repoName(it.repoPath);
    btn.appendChild(name);

    const tag = document.createElement('span');
    tag.className = 'oc-rb-tag';
    if (it.live && it.provider) {
      tag.textContent = getProvider(it.provider).shortLabel + (state.parallelMode && it.slot >= 0 ? ' #' + (it.slot + 1) : '');
    } else {
      tag.textContent = 'new';
    }
    btn.appendChild(tag);

    const x = document.createElement('span');
    x.className = 'oc-rb-x';
    x.setAttribute('role', 'button');
    x.setAttribute('aria-label', 'Close ' + repoName(it.repoPath));
    x.title = 'Close tab';
    x.textContent = '\u00d7';
    x.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onCloseClick(it);
    });
    btn.appendChild(x);

    btn.addEventListener('click', () => onChipClick(it));
    wrap.appendChild(btn);
  }
}

export function ensureRepoBadges() {
  injectCss();
  render();
  if (!timer) timer = setInterval(render, 1500);
}