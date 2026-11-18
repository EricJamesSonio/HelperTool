import { state } from './state.js';
import { getTerminalInstances, getProviderStatus } from './terminalManager.js';
import { getProvider } from './providers.js';
import { getOpenRepos } from '../app_manager/repoTabs.js';

const CSS_ID = 'ocRepoBadgesCss';
const WRAP_ID = 'ocRepoBadges';
const COLORS = ['#4f8cff', '#ff8c42', '#23d18b', '#d670d6', '#eab308', '#22d3ee'];
const PROVIDER_ORDER = ['opencode', 'cline', 'copilot'];
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
    '.oc-rb-p{font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;border:1px solid transparent;background:rgba(255,255,255,0.06);color:var(--text-muted,#a3b1bd);}',
    '.oc-rb-p:hover{border-color:var(--border-default,rgba(255,255,255,0.25));}',
    '.oc-rb-p.st-ready{color:#23d18b;background:rgba(35,209,139,0.14);}',
    '.oc-rb-p.st-booting{color:#eab308;background:rgba(234,179,8,0.14);}',
    '.oc-rb-p.st-none{opacity:0.45;}',
    '.oc-rb-p.sel{border-color:var(--rb-color,#4f8cff);}',
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
  let list = {};
  try {
    list = getTerminalInstances();
  } catch (_) {
    list = {};
  }
  const insts = Object.values(list).filter((i) => i && i.repoPath);
  for (const inst of insts) {
    if (inst.revealed !== false) dismissed.delete(norm(inst.repoPath));
  }

  const map = new Map();
  const add = (rp) => {
    const k = norm(rp);
    if (!k || dismissed.has(k)) return null;
    let e = map.get(k);
    if (!e) {
      e = { repoPath: rp, status: {} };
      map.set(k, e);
    }
    return e;
  };

  const known = [];
  try {
    for (const rp of getOpenRepos()) known.push(rp);
  } catch (_) {
    known.length = 0;
  }
  for (const t of state.tabs) {
    if (t && t.repoPath) known.push(t.repoPath);
  }
  if (state.activeTab) known.push(state.activeTab);
  if (window.__activeRepoPath) known.push(window.__activeRepoPath);
  for (const rp of known) add(rp);
  for (const inst of insts) add(inst.repoPath);

  for (const e of map.values()) {
    try {
      e.status = getProviderStatus(e.repoPath) || {};
    } catch (_) {
      e.status = {};
    }
  }
  return Array.from(map.values());
}

function pickProvider(entry) {
  const sel = state.selectedProvider;
  if (entry.status[sel]) return sel;
  for (const id of PROVIDER_ORDER) {
    if (entry.status[id]) return id;
  }
  return sel;
}

async function onChipClick(entry, providerId) {
  try {
    const rt = await import('./repoTabs.js');
    await rt.openRepoTab(entry.repoPath);
    const pt = await import('./providerTabs.js');
    await pt.chooseProvider(providerId || pickProvider(entry));
  } catch (err) {
    console.error('[CS] open repo chip failed:', err);
  }
}

function onCloseClick(entry) {
  import('./repoTabs.js').then((m) => m.closeRepoTab(entry.repoPath)).catch((err) => {
    console.error('[CS] close tab failed:', err);
  });
}

function anyLive(entry) {
  return Object.keys(entry.status).length > 0;
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
    .map((i) => i.repoPath + '~' + PROVIDER_ORDER.map((p) => p + ':' + (i.status[p] || '-')).join(','))
    .join('|') + '#' + active + '#' + state.selectedProvider;
  if (sig === lastSig && (wrap.childElementCount || !items.length)) return;
  lastSig = sig;

  wrap.textContent = '';
  for (const it of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = sameRepo(it.repoPath, active);
    btn.className = 'oc-rb' + (isActive ? ' active' : '') + (anyLive(it) ? '' : ' idle');
    btn.style.setProperty('--rb-color', colorFor(it.repoPath));
    btn.title = it.repoPath;

    const dot = document.createElement('i');
    dot.className = 'oc-rb-dot';
    btn.appendChild(dot);

    const name = document.createElement('span');
    name.textContent = repoName(it.repoPath);
    btn.appendChild(name);

    for (const pid of PROVIDER_ORDER) {
      const st = it.status[pid] || 'none';
      const tag = document.createElement('span');
      tag.className = 'oc-rb-p st-' + st + (isActive && state.selectedProvider === pid ? ' sel' : '');
      tag.textContent = getProvider(pid).shortLabel;
      tag.title = getProvider(pid).label + ' - ' + (st === 'none' ? 'not started' : st);
      tag.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onChipClick(it, pid);
      });
      btn.appendChild(tag);
    }

    const x = document.createElement('span');
    x.className = 'oc-rb-x';
    x.setAttribute('role', 'button');
    x.setAttribute('aria-label', 'Close ' + repoName(it.repoPath));
    x.title = 'Close tab (stops all terminals for this repo)';
    x.textContent = '\u00d7';
    x.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onCloseClick(it);
    });
    btn.appendChild(x);

    btn.addEventListener('click', () => onChipClick(it, null));
    wrap.appendChild(btn);
  }
}

export function ensureRepoBadges() {
  injectCss();
  render();
  if (!timer) timer = setInterval(render, 1500);
}