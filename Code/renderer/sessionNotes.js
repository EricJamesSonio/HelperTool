import { state } from './app_manager/appState.js';

const DEF_KEY = 'helpertool-cfgfiles-defaults';
const REPO_KEY = 'helpertool-cfgfiles:';
const BUILTIN_DEFAULTS = ['.gitignore', '.env*', '.dockerignore'];
const SCAN_TTL = 20000;
const MAX_DEPTH = 4;
const MAX_DIRS = 400;
const MAX_FILES = 6000;
const MAX_CHARS = 300000;
const MAX_LINES = 6000;
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '.cache', '__pycache__',
  '.swc', 'vendor', '.venv', 'venv', 'target', 'out', '.turbo', '.idea', '.vscode', 'bower_components',
]);
const IGNORE_NAMES = new Set(['.ds_store', '.gitkeep', '.keep', 'thumbs.db']);
const CONFIG_NAMES = new Set(['makefile', 'procfile', 'vercel.json', 'netlify.toml', 'jsconfig.json', 'nginx.conf']);
const CATS = { env: 'Environment', ignore: 'Ignore files', docker: 'Docker', config: 'Config', dot: 'Other dotfiles', '': 'Other' };
const CAT_ORDER = ['env', 'ignore', 'docker', 'config', 'dot', ''];

const SVG = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
const ICON_BTN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M4 3h8l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="12,3 12,7 16,7"/><circle cx="8" cy="12" r="1.6"/><path d="M9.6 12H14M12.5 12v1.8"/></svg>';
const ICON_TITLE = SVG + '<path d="M4 3h8l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="12,3 12,7 16,7"/><circle cx="8" cy="12" r="1.6"/><path d="M9.6 12H14M12.5 12v1.8"/></svg>';
const ICON_X = SVG + '<path d="M5 5l10 10M15 5L5 15"/></svg>';
const ICON_REFRESH = SVG + '<path d="M3 10a7 7 0 0 1 11.7-4.7"/><path d="M17 10a7 7 0 0 1-11.7 4.7"/><path d="M14.5 2v4h-4"/><path d="M5.5 18v-4h4"/></svg>';
const ICON_PLUS = SVG + '<path d="M10 4v12M4 10h12"/></svg>';

let _el = null;
let _open = false;
let _repo = '';
let _cfg = null;
let _all = [];
let _files = [];
let _scanning = false;
let _sheet = '';
let _token = 0;
const _paneTok = [0, 0, 0];
const _texts = ['', '', ''];
const _scanCache = new Map();
const _reCache = new Map();

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

function lc(s) {
  return String(s).toLowerCase();
}

function normRepo(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function baseName(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
}

function relOf(repo, p) {
  const r = String(repo).replace(/\\/g, '/').replace(/\/+$/, '');
  const n = String(p).replace(/\\/g, '/');
  return n.toLowerCase().indexOf(r.toLowerCase() + '/') === 0 ? n.slice(r.length + 1) : n;
}

function joinPath(repo, rel) {
  const sep = repo.indexOf('\\') !== -1 ? '\\' : '/';
  return repo.replace(/[\\/]+$/, '') + sep + rel.replace(/\//g, sep);
}

function normPattern(p) {
  return String(p || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function cleanList(arr) {
  const out = [];
  const seen = new Set();
  (Array.isArray(arr) ? arr : []).forEach((x) => {
    if (typeof x !== 'string') return;
    const p = normPattern(x);
    if (!p || seen.has(p.toLowerCase())) return;
    seen.add(p.toLowerCase());
    out.push(p);
  });
  return out;
}

function globRe(p) {
  let re = _reCache.get(p);
  if (!re) {
    re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    _reCache.set(p, re);
  }
  return re;
}

function matchPattern(pat, f) {
  let p = normPattern(pat);
  if (!p) return false;
  let anchored = false;
  if (p.charAt(0) === '/') {
    anchored = true;
    p = p.slice(1);
  }
  if (!p) return false;
  const re = globRe(p);
  return anchored || p.indexOf('/') !== -1 ? re.test(f.rel) : re.test(f.name);
}

function exactOf(pat) {
  let s = normPattern(pat);
  const anchored = s.charAt(0) === '/';
  if (anchored) s = s.slice(1);
  if (!s || /[*?]/.test(s)) return '';
  return anchored || s.indexOf('/') !== -1 ? s : '';
}

function catOf(name) {
  const n = lc(name);
  if (/^\.env/.test(n) || /^env\./.test(n) || /\.env$/.test(n)) return 'env';
  if (n === '.dockerignore' || n.indexOf('dockerfile') === 0 || n.indexOf('docker-compose') === 0) return 'docker';
  if (n.charAt(0) === '.' && /ignore$/.test(n)) return 'ignore';
  if (CONFIG_NAMES.has(n) || /^tsconfig.*\.json$/.test(n) || /^\.(eslintrc|prettierrc|babelrc|stylelintrc)/.test(n)) return 'config';
  if (n.charAt(0) === '.') return 'dot';
  return '';
}

function byCatThenRel(a, b) {
  const ca = CAT_ORDER.indexOf(catOf(a.name));
  const cb = CAT_ORDER.indexOf(catOf(b.name));
  if (ca !== cb) return ca - cb;
  const da = a.rel.split('/').length;
  const db = b.rel.split('/').length;
  if (da !== db) return da - db;
  return a.rel.localeCompare(b.rel);
}

export function getDefaultPatterns() {
  try {
    const raw = JSON.parse(localStorage.getItem(DEF_KEY) || 'null');
    if (Array.isArray(raw)) return cleanList(raw);
  } catch (_) {}
  return BUILTIN_DEFAULTS.slice();
}

function setDefaultPatterns(list) {
  try {
    localStorage.setItem(DEF_KEY, JSON.stringify(cleanList(list)));
  } catch (_) {}
  if (_open && _repo && _cfg) {
    applyFiles();
    updateHeader();
    renderBody();
  }
}

function loadRepoCfg(repo) {
  let d = null;
  try {
    d = JSON.parse(localStorage.getItem(REPO_KEY + normRepo(repo)) || 'null');
  } catch (_) {
    d = null;
  }
  if (!d || typeof d !== 'object') d = {};
  return {
    patterns: cleanList(d.patterns),
    exclude: cleanList(d.exclude),
    panes: Array.isArray(d.panes) ? d.panes.map((x) => (typeof x === 'string' ? x : null)) : [],
    mask: d.mask && typeof d.mask === 'object' ? d.mask : {},
  };
}

function saveRepoCfg() {
  if (!_repo || !_cfg) return;
  try {
    localStorage.setItem(REPO_KEY + normRepo(_repo), JSON.stringify(_cfg));
  } catch (_) {}
}

async function readDirSafe(dir) {
  try {
    const res = await window.ideAPI.readDir(dir);
    if (res && res.success) return res.entries || [];
  } catch (_) {}
  return [];
}

async function scanRepo(repo) {
  if (!window.ideAPI || typeof window.ideAPI.readDir !== 'function') return [];
  const files = [];
  const queue = [{ dir: repo, depth: 0 }];
  let dirs = 0;
  while (queue.length && dirs < MAX_DIRS && files.length < MAX_FILES) {
    const batch = queue.splice(0, 8);
    dirs += batch.length;
    const lists = await Promise.all(batch.map((b) => readDirSafe(b.dir)));
    lists.forEach((entries, i) => {
      const depth = batch[i].depth;
      for (const e of entries) {
        if (e.type === 'folder') {
          if (depth < MAX_DEPTH && !SKIP_DIRS.has(lc(e.name))) queue.push({ dir: e.path, depth: depth + 1 });
        } else if (e.type === 'file') {
          if (IGNORE_NAMES.has(lc(e.name))) continue;
          files.push({ name: e.name, path: e.path, rel: relOf(repo, e.path) });
        }
      }
    });
  }
  return files;
}

function applyFiles() {
  const pats = getDefaultPatterns().concat(_cfg.patterns);
  const ex = new Set(_cfg.exclude.map(lc));
  const seen = new Set();
  const out = [];
  for (const f of _all) {
    const k = lc(f.rel);
    if (seen.has(k) || ex.has(k)) continue;
    if (pats.some((p) => matchPattern(p, f))) {
      seen.add(k);
      out.push(f);
    }
  }
  for (const p of _cfg.patterns) {
    const rel = exactOf(p);
    if (!rel) continue;
    const k = lc(rel);
    if (seen.has(k) || ex.has(k)) continue;
    seen.add(k);
    out.push({ name: rel.split('/').pop(), rel, path: joinPath(_repo, rel) });
  }
  out.sort(byCatThenRel);
  _files = out;
  reconcilePanes();
}

function reconcilePanes() {
  const n = Math.min(3, _files.length);
  const keys = _files.map((f) => f.rel);
  const panes = [];
  for (let i = 0; i < n; i++) {
    let r = _cfg.panes[i];
    if (!r || keys.indexOf(r) === -1 || panes.indexOf(r) !== -1) r = null;
    panes.push(r);
  }
  for (let i = 0; i < n; i++) {
    if (panes[i]) continue;
    const free = keys.find((k) => panes.indexOf(k) === -1);
    panes[i] = free || keys[i % keys.length];
  }
  _cfg.panes = panes;
  saveRepoCfg();
}

function currentRepo() {
  return state.selectedRepoPath || '';
}

function updateHeader() {
  if (!_el) return;
  const r = _el.querySelector('#cfRepo');
  const c = _el.querySelector('#cfCount');
  r.textContent = _repo ? baseName(_repo) : '';
  r.title = _repo;
  r.style.display = _repo ? '' : 'none';
  c.textContent = _scanning ? 'Scanning...' : (_repo ? _files.length + (_files.length === 1 ? ' file' : ' files') : '');
}

function emptyHtml(title, sub, buttons) {
  return '<div class="cf-empty">' +
    '<div class="cf-empty-icon">' + ICON_TITLE + '</div>' +
    '<div class="cf-empty-title">' + esc(title) + '</div>' +
    '<div class="cf-empty-sub">' + esc(sub) + '</div>' +
    (buttons
      ? '<div class="cf-empty-actions">' +
        '<button type="button" class="cf-btn cf-btn-primary" data-act="add">' + ICON_PLUS + ' Add files</button>' +
        '<button type="button" class="cf-btn" data-act="defaults">Edit defaults</button>' +
      '</div>'
      : '') +
  '</div>';
}

function optionsHtml(sel) {
  let html = '';
  let cur = null;
  for (const f of _files) {
    const c = catOf(f.name);
    if (c !== cur) {
      if (cur !== null) html += '</optgroup>';
      html += '<optgroup label="' + attr(CATS[c]) + '">';
      cur = c;
    }
    html += '<option value="' + attr(f.rel) + '"' + (f.rel === sel ? ' selected' : '') + '>' + esc(f.rel) + '</option>';
  }
  return html + (cur !== null ? '</optgroup>' : '');
}

function isMasked(f) {
  return catOf(f.name) === 'env' && !!_cfg.mask[f.rel];
}

function paneHtml(i) {
  const f = _files.find((x) => x.rel === _cfg.panes[i]) || _files[0];
  const cat = catOf(f.name);
  const env = cat === 'env';
  const masked = isMasked(f);
  return '<div class="cf-pane" data-i="' + i + '">' +
    '<div class="cf-pane-head">' +
      '<select class="cf-sel" title="Switch file">' + optionsHtml(f.rel) + '</select>' +
      '<span class="cf-cat">' + esc(CATS[cat]) + '</span>' +
      '<span class="cf-meta"></span>' +
      '<span class="cf-spacer"></span>' +
      (env ? '<button type="button" class="cf-btn cf-btn-sm' + (masked ? ' on' : '') + '" data-act="mask" title="Hide or show values">' + (masked ? 'Show values' : 'Hide values') + '</button>' : '') +
      '<button type="button" class="cf-btn cf-btn-sm" data-act="copy" title="Copy the file">Copy</button>' +
      '<button type="button" class="cf-btn cf-btn-sm cf-btn-icon" data-act="reload" title="Reload this file">' + ICON_REFRESH + '</button>' +
      '<button type="button" class="cf-btn cf-btn-sm cf-btn-icon" data-act="hide" title="Hide this file for this repo">' + ICON_X + '</button>' +
    '</div>' +
    '<div class="cf-path">' + esc(f.path) + '</div>' +
    '<div class="cf-pane-body"></div>' +
  '</div>';
}

function renderLines(text, masked) {
  const lines = text.split(/\r?\n/);
  const total = lines.length;
  const shown = lines.slice(0, MAX_LINES);
  const out = [];
  for (let i = 0; i < shown.length; i++) {
    const raw = shown[i];
    const t = raw.trim();
    let h;
    if (t === '') {
      h = '&nbsp;';
    } else if (t.charAt(0) === '#') {
      h = '<span class="cf-c">' + esc(raw) + '</span>';
    } else {
      const m = /^(\s*(?:export\s+)?[A-Za-z_][\w.\-]*)(\s*=\s*)(.*)$/.exec(raw);
      if (m) {
        const val = masked ? '\u2022'.repeat(Math.min(12, Math.max(4, m[3].length))) : esc(m[3]);
        h = '<span class="cf-k">' + esc(m[1]) + '</span><span class="cf-eq">' + esc(m[2]) + '</span><span class="cf-v">' + val + '</span>';
      } else if (t.charAt(0) === '!') {
        h = '<span class="cf-neg">' + esc(raw) + '</span>';
      } else {
        h = esc(raw);
      }
    }
    out.push('<div class="cf-l"><span class="cf-n">' + (i + 1) + '</span><span class="cf-t">' + h + '</span></div>');
  }
  if (total > MAX_LINES) out.push('<div class="cf-note">Showing the first ' + MAX_LINES + ' of ' + total + ' lines.</div>');
  return out.join('');
}

async function fillPane(i) {
  if (!_el) return;
  const pane = _el.querySelector('.cf-pane[data-i="' + i + '"]');
  if (!pane) return;
  const f = _files.find((x) => x.rel === _cfg.panes[i]);
  const bodyEl = pane.querySelector('.cf-pane-body');
  const meta = pane.querySelector('.cf-meta');
  if (!f) {
    bodyEl.innerHTML = '';
    return;
  }
  const tok = ++_paneTok[i];
  bodyEl.innerHTML = '<div class="cf-loading">Loading...</div>';
  let res = null;
  try {
    res = await window.electronAPI.readFile(f.path);
  } catch (_) {
    res = null;
  }
  if (tok !== _paneTok[i] || !_open) return;
  if (!res || !res.success) {
    _texts[i] = '';
    meta.textContent = '';
    bodyEl.innerHTML = '<div class="cf-missing">Cannot read this file.<small>' + esc((res && res.error) || 'It may have been moved or deleted.') + '</small></div>';
    return;
  }
  const full = String(res.content || '');
  _texts[i] = full;
  const lineCount = full === '' ? 0 : full.split(/\r?\n/).length;
  meta.textContent = lineCount + (lineCount === 1 ? ' line' : ' lines');
  if (full === '') {
    bodyEl.innerHTML = '<div class="cf-note">(empty file)</div>';
    return;
  }
  let text = full;
  let note = '';
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    note = '<div class="cf-note">File is large, showing the first ' + Math.round(MAX_CHARS / 1024) + ' KB.</div>';
  }
  bodyEl.innerHTML = renderLines(text, isMasked(f)) + note;
}

function renderBody() {
  if (!_el) return;
  const body = _el.querySelector('#cfBody');
  if (!_repo) {
    body.innerHTML = emptyHtml('No repository selected', 'Open a repo first, then come back here.', false);
    return;
  }
  if (_scanning) return;
  if (!_files.length) {
    body.innerHTML = emptyHtml('No matching files in this repo', 'Add files from the repo, or change the default patterns.', true);
    return;
  }
  const n = Math.min(3, _files.length);
  let html = '<div class="cf-panes" data-n="' + n + '">';
  for (let i = 0; i < n; i++) html += paneHtml(i);
  html += '</div>';
  body.innerHTML = html;
  for (let i = 0; i < n; i++) fillPane(i);
}

function rerenderPane(i) {
  const pane = _el.querySelector('.cf-pane[data-i="' + i + '"]');
  if (!pane) return;
  pane.outerHTML = paneHtml(i);
  fillPane(i);
}

async function load(repo, force) {
  const token = ++_token;
  _repo = repo || '';
  _files = [];
  _all = [];
  _cfg = null;
  _scanning = false;
  closeSheet();
  updateHeader();
  const body = _el.querySelector('#cfBody');
  if (!_repo) {
    renderBody();
    return;
  }
  _cfg = loadRepoCfg(_repo);
  const key = normRepo(_repo);
  const hit = _scanCache.get(key);
  if (hit && !force && Date.now() - hit.ts < SCAN_TTL) {
    _all = hit.files;
  } else {
    _scanning = true;
    updateHeader();
    body.innerHTML = '<div class="cf-empty"><div class="cf-spin"></div><div class="cf-empty-sub">Scanning repository...</div></div>';
    const files = await scanRepo(_repo);
    if (token !== _token) return;
    _scanCache.set(key, { ts: Date.now(), files });
    _all = files;
    _scanning = false;
  }
  applyFiles();
  updateHeader();
  renderBody();
}

async function refreshNow() {
  if (!_repo) return;
  const btn = _el.querySelector('[data-act="refresh"]');
  if (btn) btn.classList.add('spinning');
  try {
    await load(_repo, true);
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

function closeSheet() {
  _sheet = '';
  if (!_el) return;
  const host = _el.querySelector('#cfSheetHost');
  host.classList.remove('open');
  host.innerHTML = '';
}

function openSheet(title, bodyHtml, footHtml) {
  const host = _el.querySelector('#cfSheetHost');
  host.innerHTML =
    '<div class="cf-sheet-back" data-act="sheet-close"></div>' +
    '<div class="cf-sheet">' +
      '<div class="cf-sheet-head"><span>' + esc(title) + '</span>' +
        '<button type="button" class="cf-btn cf-btn-icon" data-act="sheet-close" title="Close">' + ICON_X + '</button></div>' +
      '<div class="cf-sheet-body">' + bodyHtml + '</div>' +
      (footHtml ? '<div class="cf-sheet-foot">' + footHtml + '</div>' : '') +
    '</div>';
  host.classList.add('open');
  return host.querySelector('.cf-sheet-body');
}

function openPicker() {
  if (!_repo || !_cfg || _scanning) return;
  _sheet = 'pick';
  const shown = new Set(_files.map((f) => lc(f.rel)));
  const hidden = new Set(_cfg.exclude.map(lc));
  const cands = _all.filter((f) => catOf(f.name) !== '').sort(byCatThenRel);
  let rows = '';
  let cur = null;
  for (const f of cands) {
    const c = catOf(f.name);
    if (c !== cur) {
      rows += '<div class="cf-pick-group">' + esc(CATS[c]) + '</div>';
      cur = c;
    }
    const k = lc(f.rel);
    const added = shown.has(k);
    const tag = added ? 'added' : (hidden.has(k) ? 'hidden' : '');
    rows += '<label class="cf-pick-row' + (added ? ' added' : '') + '" data-q="' + attr(k) + '">' +
      '<input type="checkbox" value="' + attr(f.rel) + '"' + (added ? ' checked disabled' : '') + '>' +
      '<span class="cf-pick-name">' + esc(f.rel) + '</span>' +
      '<span class="cf-pick-tag">' + tag + '</span>' +
    '</label>';
  }
  const body =
    '<div class="cf-pick-manual">' +
      '<input type="text" class="cf-input" id="cfPat" spellcheck="false" placeholder="Add a name or pattern, e.g. .eslintignore, config/*.json">' +
      '<button type="button" class="cf-btn" data-act="pat-add">Add pattern</button>' +
    '</div>' +
    '<div class="cf-pat-msg" id="cfPatMsg"></div>' +
    '<input type="text" class="cf-input" id="cfPickSearch" spellcheck="false" placeholder="Filter the files found in this repo...">' +
    '<div class="cf-pick-list">' + (rows || '<div class="cf-note">No config-style files were found in this repo.</div>') + '</div>';
  const foot =
    '<span class="cf-foot-note">' + cands.length + ' detected in ' + esc(baseName(_repo)) + '</span>' +
    '<span class="cf-spacer"></span>' +
    (_cfg.exclude.length ? '<button type="button" class="cf-btn" data-act="restore">Restore hidden (' + _cfg.exclude.length + ')</button>' : '') +
    '<button type="button" class="cf-btn cf-btn-primary" data-act="pick-add">Add selected</button>';
  openSheet('Add files to this repo', body, foot);
  const s = _el.querySelector('#cfPickSearch');
  if (s) s.focus();
}

function openDefaults() {
  _sheet = 'defaults';
  const body = openSheet('Default patterns', '<div id="cfDefBody"></div>', '');
  renderDefaultsEditor(body.querySelector('#cfDefBody'));
}

function addSelected() {
  const boxes = Array.from(_el.querySelectorAll('.cf-pick-list input:checked:not(:disabled)'));
  if (!boxes.length) {
    closeSheet();
    return;
  }
  const rels = boxes.map((b) => b.value);
  const keys = new Set(rels.map(lc));
  _cfg.exclude = _cfg.exclude.filter((x) => !keys.has(lc(x)));
  applyFiles();
  let first = '';
  for (const rel of rels) {
    if (_files.some((f) => lc(f.rel) === lc(rel))) continue;
    const pat = rel.indexOf('/') === -1 ? '/' + rel : rel;
    if (_cfg.patterns.indexOf(pat) === -1) _cfg.patterns.push(pat);
  }
  applyFiles();
  const shownNow = new Set(_cfg.panes.map(lc));
  first = rels.find((r) => !shownNow.has(lc(r))) || '';
  const n = Math.min(3, _files.length);
  if (first && n > 0 && _files.some((f) => f.rel === first)) _cfg.panes[n - 1] = first;
  saveRepoCfg();
  closeSheet();
  updateHeader();
  renderBody();
}

function addPattern() {
  const inp = _el.querySelector('#cfPat');
  const msg = _el.querySelector('#cfPatMsg');
  if (!inp || !_cfg) return;
  const p = normPattern(inp.value);
  if (!p) return;
  if (_cfg.patterns.indexOf(p) === -1) _cfg.patterns.push(p);
  saveRepoCfg();
  applyFiles();
  updateHeader();
  renderBody();
  const n = _all.filter((f) => matchPattern(p, f)).length;
  if (msg) {
    msg.textContent = n
      ? 'Matches ' + n + (n === 1 ? ' file' : ' files') + ' in this repo.'
      : 'No file matches yet. It will show up once it exists.';
  }
  inp.value = '';
}

function restoreHidden() {
  _cfg.exclude = [];
  saveRepoCfg();
  closeSheet();
  applyFiles();
  updateHeader();
  renderBody();
}

function copyPane(i, btn) {
  const t = _texts[i] || '';
  navigator.clipboard.writeText(t).then(() => {
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
  }).catch(() => {
    btn.textContent = 'Failed';
  });
}

function toggleMask(i) {
  const f = _files.find((x) => x.rel === _cfg.panes[i]);
  if (!f) return;
  _cfg.mask[f.rel] = !_cfg.mask[f.rel];
  saveRepoCfg();
  rerenderPane(i);
}

function hidePane(i) {
  const f = _files.find((x) => x.rel === _cfg.panes[i]);
  if (!f) return;
  const k = lc(f.rel);
  if (!_cfg.exclude.some((x) => lc(x) === k)) _cfg.exclude.push(f.rel);
  _cfg.patterns = _cfg.patterns.filter((p) => lc(exactOf(p)) !== k);
  _cfg.panes = _cfg.panes.map((r) => (r === f.rel ? null : r));
  saveRepoCfg();
  applyFiles();
  updateHeader();
  renderBody();
}

function onClick(e) {
  if (e.target.classList.contains('cf-backdrop')) {
    closeSessionNotes();
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'close') closeSessionNotes();
  else if (act === 'add') openPicker();
  else if (act === 'defaults') openDefaults();
  else if (act === 'refresh') refreshNow();
  else if (act === 'sheet-close') closeSheet();
  else if (act === 'pick-add') addSelected();
  else if (act === 'pat-add') addPattern();
  else if (act === 'restore') restoreHidden();
  else {
    const pane = b.closest('.cf-pane');
    if (!pane) return;
    const i = Number(pane.dataset.i);
    if (act === 'copy') copyPane(i, b);
    else if (act === 'reload') fillPane(i);
    else if (act === 'mask') toggleMask(i);
    else if (act === 'hide') hidePane(i);
  }
}

function onChange(e) {
  const sel = e.target.closest('.cf-sel');
  if (!sel || !_cfg) return;
  const pane = sel.closest('.cf-pane');
  const i = Number(pane.dataset.i);
  const rel = sel.value;
  const j = _cfg.panes.indexOf(rel);
  if (j !== -1 && j !== i) _cfg.panes[j] = _cfg.panes[i];
  _cfg.panes[i] = rel;
  saveRepoCfg();
  renderBody();
}

function onInput(e) {
  if (e.target.id !== 'cfPickSearch') return;
  const q = lc(e.target.value).trim();
  _el.querySelectorAll('.cf-pick-row').forEach((row) => {
    row.style.display = !q || row.dataset.q.indexOf(q) !== -1 ? '' : 'none';
  });
}

function onKeyDown(e) {
  if (e.key === 'Enter' && e.target.id === 'cfPat') {
    e.preventDefault();
    addPattern();
  }
}

function build() {
  if (_el) return;
  _el = document.createElement('div');
  _el.id = 'cfPanel';
  _el.className = 'cf-overlay';
  _el.innerHTML =
    '<div class="cf-backdrop"></div>' +
    '<div class="cf-modal" role="dialog" aria-label="Config files">' +
      '<div class="cf-head">' +
        '<div class="cf-title">' + ICON_TITLE + '<span>Config files</span></div>' +
        '<span class="cf-repo" id="cfRepo"></span>' +
        '<span class="cf-count" id="cfCount"></span>' +
        '<span class="cf-spacer"></span>' +
        '<button type="button" class="cf-btn cf-btn-primary" data-act="add">' + ICON_PLUS + ' Add files</button>' +
        '<button type="button" class="cf-btn" data-act="defaults" title="Patterns shown for every repo">Defaults</button>' +
        '<button type="button" class="cf-btn" data-act="refresh" title="Rescan the repo">' + ICON_REFRESH + ' Refresh</button>' +
        '<button type="button" class="cf-btn cf-btn-icon" data-act="close" title="Close (Esc)">' + ICON_X + '</button>' +
      '</div>' +
      '<div class="cf-body" id="cfBody"></div>' +
      '<div class="cf-sheet-host" id="cfSheetHost"></div>' +
    '</div>';
  document.body.appendChild(_el);
  _el.addEventListener('click', onClick);
  _el.addEventListener('change', onChange);
  _el.addEventListener('input', onInput);
  _el.addEventListener('keydown', onKeyDown);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !_open) return;
    if (_sheet) {
      closeSheet();
      return;
    }
    closeSessionNotes();
  });
}

export function renderDefaultsEditor(container) {
  if (!container) return;
  const draw = () => {
    const list = getDefaultPatterns();
    container.innerHTML =
      '<div class="cf-def-hint">Files matching these patterns are shown for every repository. * and ? work as wildcards. A pattern without a slash matches the file name anywhere in the repo.</div>' +
      '<div class="cf-def-list">' +
        (list.length
          ? list.map((p, i) => '<span class="cf-chip"><code>' + esc(p) + '</code><button type="button" class="cf-chip-x" data-i="' + i + '" title="Remove">' + ICON_X + '</button></span>').join('')
          : '<span class="cf-def-empty">No defaults. Nothing is shown unless you add files per repo.</span>') +
      '</div>' +
      '<div class="cf-def-add">' +
        '<input type="text" class="cf-input cf-def-in" spellcheck="false" placeholder="e.g. .env*, .npmrc, docker-compose*.yml">' +
        '<button type="button" class="cf-btn cf-btn-primary cf-def-addbtn">Add</button>' +
        '<button type="button" class="cf-btn cf-def-reset">Reset to built-in</button>' +
      '</div>';
  };
  const addDef = () => {
    const inp = container.querySelector('.cf-def-in');
    const p = normPattern(inp ? inp.value : '');
    if (!p) return;
    const list = getDefaultPatterns();
    if (list.map(lc).indexOf(lc(p)) === -1) list.push(p);
    setDefaultPatterns(list);
    draw();
    const again = container.querySelector('.cf-def-in');
    if (again) again.focus();
  };
  draw();
  container.onclick = (e) => {
    const x = e.target.closest('.cf-chip-x');
    if (x) {
      const list = getDefaultPatterns();
      list.splice(Number(x.dataset.i), 1);
      setDefaultPatterns(list);
      draw();
      return;
    }
    if (e.target.closest('.cf-def-addbtn')) {
      addDef();
      return;
    }
    if (e.target.closest('.cf-def-reset')) {
      setDefaultPatterns(BUILTIN_DEFAULTS.slice());
      draw();
    }
  };
  container.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('cf-def-in')) {
      e.preventDefault();
      addDef();
    }
  };
}

export function initSessionNotes() {
  const btn = document.getElementById('notesBtn');
  if (btn) {
    btn.title = 'Config files (.env, .gitignore, .dockerignore ...)';
    btn.setAttribute('aria-label', 'Config files');
    btn.innerHTML = ICON_BTN;
  }
  document.addEventListener('repo:closed', (e) => {
    const p = e && e.detail && e.detail.repoPath;
    if (p) _scanCache.delete(normRepo(p));
  });
}

export function openSessionNotes() {
  if (!_el) build();
  if (_open) {
    closeSessionNotes();
    return;
  }
  _open = true;
  _el.classList.add('open');
  load(currentRepo(), false);
}

export function closeSessionNotes() {
  if (!_open || !_el) return;
  _open = false;
  _token++;
  closeSheet();
  _el.classList.remove('open');
}

export function isSessionNotesOpen() {
  return _open;
}

export async function handleRepoChange(newRepoPath) {
  if (!_open || !_el) return;
  await load(newRepoPath || currentRepo(), false);
}