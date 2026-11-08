import { state } from '../../app_manager/appState.js';
import { esc } from '../highlight.js';
import { EXTENSIONS } from './registry.js';
import * as fmt from './formatter.js';
import * as pm from './prettierModal.js';
const MEMO_MAX = 24;
const memo = new Map();
let idsMemo = null;
let extsMemo = null;

function sigOf(text, ids) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ids.join(',') + '|' + text.length + '|' + (h >>> 0);
}

const LS_PREFIX = 'helpertool-ide-ext:';
const MAX_TEXT = 600000;

const PUZZLE = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M3 3h4v1.5a1.5 1.5 0 1 0 3 0V3h3v4h-1.5a1.5 1.5 0 1 0 0 3H13v3H3z"/></svg>';

let handlers = {};
let mounted = false;
let btn = null;
let countEl = null;
let overlay = null;
let bodyEl = null;
let footEl = null;
let repoKey = null;
let overrides = {};
let stacks = {};
let detecting = 0;
let seq = 0;
let timer = 0;

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function normRepo(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function loadOverrides() {
  try {
    const raw = localStorage.getItem(LS_PREFIX + repoKey);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

function saveOverrides() {
  try {
    if (repoKey) localStorage.setItem(LS_PREFIX + repoKey, JSON.stringify(overrides));
  } catch (_) {}
}

function isOn(id) {
  const o = overrides[id];
  if (o === 'on') return true;
  if (o === 'off') return false;
  return !!stacks[id];
}

function enabledCount() {
  return EXTENSIONS.filter((e) => isOn(e.id)).length;
}

function activeIds() {
  if (idsMemo) return idsMemo;
  const list = EXTENSIONS.filter((e) => e.kind !== 'formatter' && isOn(e.id));
  idsMemo = list.map((e) => e.id);
  extsMemo = new Set();
  for (const x of list) {
    for (const f of x.fileExts) extsMemo.add(f);
  }
  return idsMemo;
}

function fileExt(name) {
  const lower = String(name || '').toLowerCase();
  const i = lower.lastIndexOf('.');
  return i < 0 ? '' : lower.slice(i + 1);
}

export function handles(name) {
  activeIds();
  return !!extsMemo && extsMemo.has(fileExt(name));
}

export function hasActive() {
  return activeIds().length > 0;
}

export function formatterOn() {
  return isOn('prettier');
}

export function formatOnSave() {
  return isOn('prettier') && !!fmt.getOptions().formatOnSave;
}

export function analyze(path, name, getText, delay, done) {
  clearTimeout(timer);
  const my = ++seq;
  if (!window.ideExtAPI || !handles(name)) {
    done([]);
    return;
  }
  const ids = activeIds();
  timer = setTimeout(async () => {
    const text = getText();
    if (typeof text !== 'string' || !text || text.length > MAX_TEXT) {
      if (my === seq) done([]);
      return;
    }
    const sig = sigOf(text, ids);
    const hit = memo.get(path);
    if (hit && hit.sig === sig) {
      memo.delete(path);
      memo.set(path, hit);
      done(hit.diags);
      return;
    }
    let res = null;
    try {
      res = await window.ideExtAPI.diagnose({ file: path, text, exts: ids });
    } catch (_) {
      res = null;
    }
    if (my !== seq) return;
    const ok = !!(res && res.success && Array.isArray(res.diags));
    const diags = ok ? res.diags : [];
    if (ok) {
      memo.delete(path);
      memo.set(path, { sig, diags });
      if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
    }
    done(diags);
  }, Math.max(0, delay || 0));
}

function updateBadge() {
  if (!countEl || !btn) return;
  const n = enabledCount();
  countEl.textContent = n ? String(n) : '';
  countEl.hidden = !n;
  btn.title = n ? n + ' extension(s) active for this repo' : 'Extensions: no stack detected for this repo';
}

function refresh(notify) {
  idsMemo = null;
  extsMemo = null;
  updateBadge();
  if (overlay && !overlay.hidden) renderModal();
  if (notify && handlers.onChange) handlers.onChange();
}

async function detect(force) {
  const root = state.selectedRepoPath;
  const my = ++detecting;
  if (!root || !window.ideExtAPI) {
    stacks = {};
    refresh(true);
    return;
  }
  let res = null;
  try {
    res = await window.ideExtAPI.detect(force ? { root, force: true } : root);
  } catch (_) {
    res = null;
  }
  if (my !== detecting || root !== state.selectedRepoPath) return;
  const next = res && res.success && res.stacks ? res.stacks : {};
  const same = JSON.stringify(next) === JSON.stringify(stacks);
  stacks = next;
  if (same) return;
  refresh(true);
}

function cardHtml(e) {
  const auto = !!stacks[e.id];
  const ov = overrides[e.id];
  const on = isOn(e.id);
  const isFmt = e.kind === 'formatter';
  let tag = '<span class="ide-ext-tag none">' + (isFmt ? 'Optional' : 'Not detected') + '</span>';
  if (ov === 'on') tag = '<span class="ide-ext-tag manual">Manual</span>';
  else if (ov === 'off') tag = '<span class="ide-ext-tag off">Off</span>';
  else if (auto) tag = '<span class="ide-ext-tag auto">Auto</span>';
  let meta;
  if (isFmt) {
    meta = on
      ? 'Active. Format on save is ' + (fmt.getOptions().formatOnSave ? 'on' : 'off') + '. Shift+Alt+F formats the current file.'
      : (auto ? 'Prettier config found: ' + stacks[e.id] : 'Off. Turn it on to format files.');
  } else {
    meta = auto ? 'Detected: ' + stacks[e.id] : 'Not detected in this repo';
  }
  const langs = e.langs.map((l) => '<span class="ide-ext-lang">' + esc(l) + '</span>').join('');
  const view = e.hasView ? '<button type="button" class="ide-ext-view" data-act="view-fmt">View</button>' : '';
  return '<div class="ide-ext-card' + (on ? ' on' : '') + '" data-id="' + e.id + '">' +
    '<span class="ide-ext-badge" style="color:var(' + e.color + ')">' + esc(e.badge) + '</span>' +
    '<div class="ide-ext-info">' +
      '<div class="ide-ext-top"><span class="ide-ext-name">' + esc(e.name) + '</span>' + tag + '</div>' +
      '<div class="ide-ext-desc">' + esc(e.desc) + '</div>' +
      '<div class="ide-ext-langs">' + langs + '</div>' +
      '<div class="ide-ext-meta">' + esc(meta) + '</div>' +
      view +
    '</div>' +
    '<button type="button" class="ide-ext-sw' + (on ? ' on' : '') + '" data-act="toggle" data-id="' + e.id + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" title="' + (on ? 'Turn off' : 'Turn on') + '"></button>' +
  '</div>';
}

function renderModal() {
  const detected = EXTENSIONS.filter((e) => stacks[e.id]);
  const chips = detected.length
    ? detected.map((e) => '<span class="ide-ext-chip" title="' + attr(stacks[e.id]) + '">' + esc(e.name) + '</span>').join('')
    : '<span class="ide-ext-none">No known stack detected</span>';
  const api = window.ideExtAPI ? '' : '<div class="ide-ext-warn">The extension service is not loaded yet. Fully restart the app.</div>';
  bodyEl.innerHTML = api +
    '<div class="ide-ext-stack"><span class="ide-ext-stack-lbl">Detected stack</span>' + chips + '</div>' +
    '<div class="ide-ext-grid">' + EXTENSIONS.map(cardHtml).join('') + '</div>';
  const repo = state.selectedRepoPath ? String(state.selectedRepoPath).split(/[\\/]/).filter(Boolean).pop() : '';
  footEl.textContent = enabledCount() + ' of ' + EXTENSIONS.length + ' extensions active' + (repo ? ' for ' + repo : '');
}

function toggle(id) {
  const auto = !!stacks[id];
  const next = !isOn(id);
  if (next === auto) delete overrides[id];
  else overrides[id] = next ? 'on' : 'off';
  saveOverrides();
  refresh(true);
}

function openPrettier() {
  pm.open({
    isOn: () => isOn('prettier'),
    toggle: () => toggle('prettier'),
  });
}

function onKey(e) {
  if (e.key !== 'Escape' || !overlay || overlay.hidden) return;
  e.preventDefault();
  e.stopPropagation();
  close();
}

function onOverlayClick(e) {
  if (e.target === overlay) {
    close();
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'close') close();
  else if (act === 'redetect') detect(true);
  else if (act === 'toggle') toggle(b.dataset.id);
  else if (act === 'view-fmt') openPrettier();
}

function build() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'ide-ext-overlay ide-root';
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="ide-ext-modal">' +
      '<div class="ide-ext-head">' +
        '<span class="ide-ext-title">Extensions</span>' +
        '<span class="ide-ext-sub">Debugging helpers, enabled automatically from this repo\'s stack</span>' +
        '<button type="button" class="ide-ext-redetect" data-act="redetect" title="Scan the repo again">Re-detect</button>' +
        '<button type="button" class="ide-ext-close" data-act="close" title="Close">&times;</button>' +
      '</div>' +
      '<div class="ide-ext-body"></div>' +
      '<div class="ide-ext-foot"><span class="ide-ext-foot-n"></span><span class="ide-ext-foot-hint">Use a switch to override auto-detection. Saved per repo.</span></div>' +
    '</div>';
  document.body.appendChild(overlay);
  bodyEl = overlay.querySelector('.ide-ext-body');
  footEl = overlay.querySelector('.ide-ext-foot-n');
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener('click', onOverlayClick);
  document.addEventListener('ide:close-search', () => close());
}

export function open() {
  build();
  overlay.hidden = false;
  document.addEventListener('keydown', onKey, true);
  renderModal();
}

export function close() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.removeEventListener('keydown', onKey, true);
}

function injectCss() {
  const sheets = [
    ['ideExtCss', './styles/ide-ext.css'],
    ['idePrettierCss', './styles/ide-prettier.css'],
  ];
  for (const [id, href] of sheets) {
    if (document.getElementById(id)) continue;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

function createButton() {
  if (document.getElementById('ideExtBtn')) {
    btn = document.getElementById('ideExtBtn');
    countEl = btn.querySelector('.ide-ext-count');
    return;
  }
  const anchor = document.getElementById('ideModeBtn');
  const host = anchor ? anchor.parentElement : document.querySelector('.navbar-row--primary .navbar-section.right');
  if (!host) return;
  btn = document.createElement('button');
  btn.id = 'ideExtBtn';
  btn.type = 'button';
  btn.className = 'view-mode-btn ide-ext-btn';
  btn.innerHTML = PUZZLE + 'Extensions<span class="ide-ext-count" hidden></span>';
  countEl = btn.querySelector('.ide-ext-count');
  btn.addEventListener('click', () => {
    if (overlay && !overlay.hidden) close();
    else open();
  });
  if (anchor) anchor.after(btn);
  else host.insertBefore(btn, host.firstChild);
}

function onRepoSwitched() {
  repoKey = normRepo(state.selectedRepoPath);
  overrides = loadOverrides();
  stacks = {};
  refresh(false);
  detect();
}

export function mount(opts) {
  handlers = opts || {};
  if (mounted) return;
  mounted = true;
  injectCss();
  createButton();
  repoKey = normRepo(state.selectedRepoPath);
  overrides = loadOverrides();
  document.addEventListener('repo:switched', onRepoSwitched);
  updateBadge();
  detect();
}