/**
 * reqLibrary.js
 * Requirements Library page: one library per repository, with a project profile,
 * an application type, preset specifications grouped by area
 * (Components, Globals, Security, Shared), ranked search, a configurable
 * generator and copy actions.
 */

import { state } from './app_manager/appState.js';

const CSS_ID = 'rlStyles';
const LEVELS = ['must-have', 'standard', 'medium', 'strict'];
const LEVEL_LABEL = { 'must-have': 'Must-Have', standard: 'Standard', medium: 'Medium', strict: 'Strict' };

const QUICK = [
  { id: 'all', label: 'All specifications' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'viewed', label: 'Recently viewed' },
  { id: 'added', label: 'Recently added' },
  { id: 'updated', label: 'Recently updated' },
];

const SUB_ORDER = [
  'Inputs',
  'Actions',
  'Display',
  'Charts',
  'Overlays',
  'Loading',
  'Labels',
  'Confirmation',
  'Styles',
  'Store',
  'Realtime',
  'Pipelines',
  'Config',
  'Errors',
  'Auth',
  'Authorization',
  'Input protection',
  'Layer',
  'Database',
  'Pipeline',
  'Layout',
  'Portals',
  'Pages',
  'Endpoints',
  'DevOps',
  'Utils',
  'Standards',
  'Structure',
];

const BOOK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>';

const CONTEXT_NOTES = [
  'Inspect the existing project architecture before implementing anything.',
  'Identify the current framework and libraries and follow the established project conventions.',
  'Reuse existing utilities and services where appropriate.',
  'Avoid introducing unnecessary dependencies.',
  'Do not replace existing implementations without justification.',
  'Ask for missing information instead of inventing project requirements.',
  'Do not modify unrelated functionality.',
];

let GROUPS = [
  'Functional Requirements',
  'Security Requirements',
  'Performance Requirements',
  'Architecture Requirements',
  'Data Management Requirements',
  'Error Handling Requirements',
  'User Experience Requirements',
  'Accessibility Requirements',
  'Testing Requirements',
  'Integration Requirements',
  'Acceptance Criteria',
];

let _panel = null;
let _open = false;
let _data = null;
let _draft = null;
let _searchTimer = null;
let _bound = false;
let _searchWordsCache = [];

const _ui = {
  view: 'list',
  quick: 'all',
  category: '',
  sub: '',
  level: '',
  tag: '',
  sort: 'name',
  search: '',
  selectedId: null,
};

const _cfg = {
  level: 'strict',
  appType: 'general',
  groups: new Set(),
  includeRelated: false,
  includeStyle: true,
};

// ---- helpers ---------------------------------------------------------------

function api() {
  return window.reqLibraryAPI;
}

function repoPath() {
  return state.selectedRepoPath || '';
}

function payload(extra) {
  return Object.assign({ repoPath: repoPath() }, extra || {});
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  return iso ? String(iso).slice(0, 10) : '-';
}

function newReqId() {
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function subOf(spec) {
  return spec.subcategory || 'General';
}

function ensureStyles() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement('link');
  link.id = CSS_ID;
  link.rel = 'stylesheet';
  link.href = './styles/req-library.css';
  document.head.appendChild(link);
}

function toast(msg) {
  const el = _panel && _panel.querySelector('#rlToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1800);
}

function download(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_e) { ok = false; }
    ta.remove();
    return ok;
  }
}

function optionsHtml(list, selected) {
  return list
    .map((o) => '<option value="' + esc(o.value) + '"' + (o.value === selected ? ' selected' : '') + '>' + esc(o.label) + '</option>')
    .join('');
}

function layoutBox() {
  if (!_panel) return;
  let top = 0;
  const body = document.querySelector('.app-body');
  if (body && body.getBoundingClientRect().height > 0) {
    top = body.getBoundingClientRect().top;
  } else {
    ['#appTitlebar', '.navbar-row--primary'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.height > 0 && rect.bottom > top && rect.bottom < window.innerHeight * 0.4) top = rect.bottom;
    });
  }
  let left = 0;
  const side = document.getElementById('toolsSidebar');
  if (side) {
    const rect = side.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.right < window.innerWidth * 0.5) left = rect.right;
  }
  _panel.style.setProperty('--rl-top', Math.round(top) + 'px');
  _panel.style.setProperty('--rl-left', Math.round(left) + 'px');
}

// ---- generator -------------------------------------------------------------

function levelRank(l) {
  return LEVELS.indexOf(l);
}

function appTypeLabel(id) {
  const list = (_data && _data.appTypes) || [];
  const found = list.find((t) => t.id === id);
  return found ? found.label : id;
}

function pickRequirements(spec, cfg) {
  const max = levelRank(cfg.level);
  const type = cfg.appType || 'general';
  const seen = new Set();
  const out = [];
  for (const r of spec.requirements) {
    if (levelRank(r.level) > max) continue;
    const types = Array.isArray(r.types) ? r.types : [];
    if (types.length && types.indexOf(type) === -1) continue;
    const key = (r.title + '|' + r.description).toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function groupRequirements(reqs) {
  const map = new Map();
  for (const r of reqs) {
    if (!map.has(r.group)) map.set(r.group, []);
    map.get(r.group).push(r);
  }
  const ordered = [];
  for (const g of GROUPS) {
    if (map.has(g)) ordered.push([g, map.get(g)]);
  }
  for (const [g, items] of map) {
    if (!GROUPS.includes(g)) ordered.push([g, items]);
  }
  return ordered;
}

function reqLine(r) {
  let line = '- ';
  if (r.title && r.description) line += '**' + r.title + ':** ' + r.description;
  else if (r.title) line += '**' + r.title + '**';
  else line += r.description;
  if (r.notes) line += ' (Notes: ' + r.notes + ')';
  return line;
}

function groupsMarkdown(reqs, groupsSet, headingLevel) {
  const out = [];
  for (const [group, items] of groupRequirements(reqs)) {
    if (!groupsSet.has(group)) continue;
    out.push('', headingLevel + ' ' + group, '');
    for (const r of items) out.push(reqLine(r));
  }
  return out;
}

const STYLE_KEY = 'code-style-guide';
const STYLE_SELF = new Set(['code-style-guide', 'functional-utils-style', 'oop-infrastructure-style', 'modular-feature-style']);

function styleGuideFor(spec) {
  if (!_data || STYLE_SELF.has(spec.presetKey)) return null;
  const guide = _data.specs.find((s) => s.presetKey === STYLE_KEY);
  if (!guide || guide.id === spec.id) return null;
  return guide;
}

function styleSectionLines(spec, cfg) {
  if (!cfg.includeStyle) return [];
  const guide = styleGuideFor(spec);
  if (!guide) return [];
  const rows = pickRequirements(guide, cfg);
  if (!rows.length) return [];
  const out = [
    '',
    '## Code Style & Folder Structure',
    '',
    'Follow the existing project style first. Use these suggestions for new code and for placing files.',
    '',
  ];
  for (const r of rows) out.push(reqLine(r));
  return out;
}
const DEP_ROW_TITLE = 'Dependencies: ask before assuming';

function isBundleSpec(spec) {
  return !!(spec && spec.presetKey && String(spec.presetKey).indexOf('bundle-') === 0);
}

function withoutDependencyRows(spec) {
  return Object.assign({}, spec, {
    requirements: spec.requirements.filter((r) => r.title !== DEP_ROW_TITLE),
  });
}
function toMarkdown(spec, cfg, groupsSet, full) {
  const lines = ['# Feature: ' + spec.name];
  if (spec.description) lines.push('', spec.description);
  const idx = levelRank(cfg.level);
  lines.push('', '## Implementation Context', '');
  lines.push('- Area: ' + spec.category + (spec.subcategory ? ' / ' + spec.subcategory : ''));
  lines.push('- Strictness: ' + LEVEL_LABEL[cfg.level] + ' (cumulative: ' + LEVELS.slice(0, idx + 1).map((l) => LEVEL_LABEL[l]).join(' + ') + ')');
  const typeId = cfg.appType || 'general';
  if (typeId !== 'general') lines.push('- Application type: ' + appTypeLabel(typeId));
  if (full) {
    const profile = _data && _data.profile;
    if (profile && profile.stack) lines.push('- Project stack: ' + profile.stack);
    if (profile && profile.notes) lines.push('- Project notes: ' + profile.notes.replace(/\s*\n\s*/g, ' '));
    for (const n of CONTEXT_NOTES) lines.push('- ' + n);
  }
  lines.push(...groupsMarkdown(pickRequirements(spec, cfg), groupsSet, '##'));

  if (cfg.includeRelated) {
    const bundle = isBundleSpec(spec);
    for (const rid of spec.related || []) {
      const rs = _data.specs.find((s) => s.id === rid);
      if (!rs || rs.id === spec.id) continue;
      const source = bundle ? withoutDependencyRows(rs) : rs;
      const body = groupsMarkdown(pickRequirements(source, cfg), groupsSet, '###');
      if (!body.length) continue;
      lines.push('', '## Related Specification: ' + rs.name, ...body);
    }
  }

  if (full || groupsSet.has('Architecture Requirements')) {
    lines.push(...styleSectionLines(spec, cfg));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function specToMarkdownFull(spec) {
  const lines = ['# ' + spec.name];
  if (spec.description) lines.push('', spec.description);
  lines.push('', '- Area: ' + spec.category + (spec.subcategory ? ' / ' + spec.subcategory : ''));
  if (spec.tags.length) lines.push('- Tags: ' + spec.tags.join(', '));
  for (const level of LEVELS) {
    const reqs = spec.requirements.filter((r) => r.level === level);
    if (!reqs.length) continue;
    lines.push('', '## ' + LEVEL_LABEL[level]);
    for (const [group, items] of groupRequirements(reqs)) {
      lines.push('', '### ' + group, '');
      for (const r of items) lines.push(reqLine(r));
    }
  }
  return lines.join('\n') + '\n';
}

// ---- data ------------------------------------------------------------------

async function reload() {
  if (!repoPath()) {
    _data = null;
    return;
  }
  _data = await api().load(payload());
  if (Array.isArray(_data.groups) && _data.groups.length) GROUPS = _data.groups;
}

async function call(fn, okMsg) {
  try {
    await fn();
    await reload();
    renderAll();
    if (okMsg) toast(okMsg);
  } catch (err) {
    toast((err && err.message) ? err.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '') : 'Something went wrong');
  }
}

// ---- search ----------------------------------------------------------------

function searchWords(q) {
  return String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function specScore(spec, words) {
  const name = String(spec.name || '').toLowerCase();
  const nameParts = name.split(/[^a-z0-9]+/).filter(Boolean);
  const desc = String(spec.description || '').toLowerCase();
  const tags = spec.tags.join(' ').toLowerCase();
  const area = (spec.category + ' ' + (spec.subcategory || '')).toLowerCase();
  const reqTitles = spec.requirements.map((r) => r.title).join(' ').toLowerCase();
  const reqText = spec.requirements.map((r) => r.description + ' ' + (r.notes || '')).join(' ').toLowerCase();
  let total = 0;
  for (const w of words) {
    let best = 0;
    if (nameParts.indexOf(w) !== -1) best = 100;
    else if (name.indexOf(w) !== -1) best = 80;
    else if (tags.indexOf(w) !== -1) best = 60;
    else if (area.indexOf(w) !== -1) best = 50;
    else if (desc.indexOf(w) !== -1) best = 40;
    else if (reqTitles.indexOf(w) !== -1) best = 25;
    else if (reqText.indexOf(w) !== -1) best = 10;
    if (!best) return 0;
    total += best;
  }
  if (name.indexOf(words.join(' ')) !== -1) total += 60;
  return total;
}

function hlText(text, words) {
  const raw = String(text == null ? '' : text);
  if (!words.length) return esc(raw);
  const low = raw.toLowerCase();
  if (low.length !== raw.length) return esc(raw);
  const marks = new Array(raw.length).fill(false);
  for (const w of words) {
    let i = low.indexOf(w);
    while (i !== -1) {
      for (let k = i; k < i + w.length; k++) marks[k] = true;
      i = low.indexOf(w, i + w.length);
    }
  }
  let out = '';
  let open = false;
  for (let k = 0; k < raw.length; k++) {
    if (marks[k] && !open) {
      out += '<mark class="rl-hl">';
      open = true;
    }
    if (!marks[k] && open) {
      out += '</mark>';
      open = false;
    }
    out += esc(raw[k]);
  }
  if (open) out += '</mark>';
  return out;
}

function getFiltered() {
  const words = searchWords(_ui.search);
  _searchWordsCache = words;
  let list = _data.specs.slice();

  if (_ui.quick === 'favorites') list = list.filter((s) => s.favorite);
  if (_ui.quick === 'viewed') list = list.filter((s) => s.lastAccessedAt);
  if (_ui.category) list = list.filter((s) => s.category === _ui.category);
  if (_ui.sub) list = list.filter((s) => subOf(s) === _ui.sub);
  if (_ui.level) list = list.filter((s) => s.requirements.some((r) => r.level === _ui.level));
  if (_ui.tag) list = list.filter((s) => s.tags.includes(_ui.tag));

  if (words.length) {
    const scored = [];
    for (const s of list) {
      const sc = specScore(s, words);
      if (sc > 0) scored.push([s, sc]);
    }
    scored.sort((a, b) => (b[1] - a[1]) || a[0].name.localeCompare(b[0].name));
    return scored.map((x) => x[0]);
  }

  const byDate = (key) => (a, b) => String(b[key] || '').localeCompare(String(a[key] || ''));
  if (_ui.quick === 'viewed') list.sort(byDate('lastAccessedAt'));
  else if (_ui.quick === 'added') list.sort(byDate('createdAt'));
  else if (_ui.quick === 'updated') list.sort(byDate('updatedAt'));
  else if (_ui.sort === 'updated') list.sort(byDate('updatedAt'));
  else if (_ui.sort === 'added') list.sort(byDate('createdAt'));
  else list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function hasActiveFilters() {
  return !!(_ui.quick !== 'all' || _ui.category || _ui.sub || _ui.level || _ui.tag || _ui.search.trim());
}

function resetUi() {
  _ui.view = 'list';
  _ui.quick = 'all';
  _ui.category = '';
  _ui.sub = '';
  _ui.level = '';
  _ui.tag = '';
  _ui.search = '';
  _ui.selectedId = null;
  _draft = null;
  if (_panel) {
    const input = _panel.querySelector('#rlSearch');
    if (input) input.value = '';
    const modal = _panel.querySelector('#rlModal');
    if (modal) modal.style.display = 'none';
  }
}

// ---- page lifecycle --------------------------------------------------------

export function isOpen() {
  if (_open && _panel && !_panel.classList.contains('open')) _open = false;
  return _open;
}

async function refresh() {
  try {
    await reload();
  } catch (err) {
    console.error('[ReqLibrary] load failed:', err);
    _data = null;
    toast('Could not load the library');
  }
  renderAll();
}

export async function open() {
  if (isOpen()) return;
  ensureStyles();
  if (!_panel) buildPanel();
  layoutBox();
  _panel.classList.add('open');
  _open = true;
  await refresh();
}

export function close() {
  if (!_panel) return;
  _panel.classList.remove('open');
  _open = false;
  const modal = _panel.querySelector('#rlModal');
  if (modal) modal.style.display = 'none';
}

function onRepoSwitched() {
  resetUi();
  _data = null;
  if (_open) refresh();
}

function buildPanel() {
  _panel = document.createElement('div');
  _panel.id = 'rlPanel';
  _panel.className = 'rl-overlay';
  _panel.innerHTML =
    '<div class="rl-container">' +
      '<div class="rl-header">' +
        '<h2 class="rl-title">' + BOOK_ICON + ' Requirements Library</h2>' +
        '<span class="rl-repo" id="rlRepo"></span>' +
        '<div class="rl-search-wrap">' +
          '<input id="rlSearch" class="rl-search" type="text" placeholder="Search specifications, requirements, tags..." autocomplete="off">' +
          '<button class="rl-btn" data-act="clear-search" title="Clear search">Clear</button>' +
        '</div>' +
        '<div class="rl-header-actions">' +
          '<button class="rl-btn rl-btn-primary" data-act="new">+ New</button>' +
          '<button class="rl-btn" data-act="import">Import</button>' +
          '<button class="rl-btn" data-act="export">Export</button>' +
          '<button class="rl-btn" data-act="manage">Manage</button>' +
          '<button class="rl-btn rl-icon-btn" data-act="close" title="Close">X</button>' +
        '</div>' +
      '</div>' +
      '<div class="rl-body">' +
        '<aside class="rl-sidebar" id="rlSidebar"></aside>' +
        '<main class="rl-main" id="rlMain"></main>' +
      '</div>' +
      '<input type="file" id="rlFile" accept=".json,application/json" style="display:none">' +
      '<div class="rl-modal" id="rlModal" style="display:none"></div>' +
      '<div class="rl-toast" id="rlToast"></div>' +
    '</div>';
  document.body.appendChild(_panel);

  _panel.addEventListener('click', onClick);
  _panel.addEventListener('change', onChange);

  _panel.querySelector('#rlSearch').addEventListener('input', (e) => {
    clearTimeout(_searchTimer);
    const value = e.target.value;
    _searchTimer = setTimeout(() => {
      _ui.search = value;
      _ui.view = 'list';
      renderAll();
    }, 200);
  });

  _panel.querySelector('#rlFile').addEventListener('change', onImportFile);

  if (!_bound) {
    _bound = true;
    window.addEventListener('resize', layoutBox);
    document.addEventListener('repo:switched', onRepoSwitched);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !_open) return;
      const modal = _panel.querySelector('#rlModal');
      if (modal && modal.style.display !== 'none') {
        modal.style.display = 'none';
        return;
      }
      close();
    });
    const side = document.getElementById('toolsSidebar');
    if (side && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => layoutBox()).observe(side);
    }
  }
}

// ---- rendering -------------------------------------------------------------

function updateHeader() {
  const el = _panel && _panel.querySelector('#rlRepo');
  if (!el) return;
  el.textContent = _data ? _data.repoName : 'No repository';
}

function renderNoRepo() {
  _panel.querySelector('#rlSidebar').innerHTML = '';
  _panel.querySelector('#rlMain').innerHTML =
    '<div class="rl-empty">Select a repository first. Each repository has its own requirements library and project profile.</div>';
  updateHeader();
}

function renderAll() {
  if (!_data) {
    renderNoRepo();
    return;
  }
  updateHeader();
  renderSidebar();
  renderMain();
}

function renderMain() {
  if (!_data) return;
  if (_ui.view === 'detail') renderDetail();
  else if (_ui.view === 'edit') renderEdit();
  else renderList();
}

function subCounts(category) {
  const map = new Map();
  for (const s of _data.specs) {
    if (s.category !== category) continue;
    const key = subOf(s);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function renderSidebar() {
  const side = _panel.querySelector('#rlSidebar');
  const counts = {};
  for (const s of _data.specs) counts[s.category] = (counts[s.category] || 0) + 1;

  const quick = QUICK.map((q) =>
    '<button class="rl-side-item' + (_ui.quick === q.id ? ' active' : '') + '" data-act="quick" data-v="' + q.id + '">' + esc(q.label) + '</button>'
  ).join('');

  let cats = '<button class="rl-side-item' + (!_ui.category ? ' active' : '') + '" data-act="category" data-v="">All areas<span class="rl-count">' + _data.specs.length + '</span></button>';
  for (const c of _data.categories) {
    const n = counts[c] || 0;
    if (c === 'Other' && !n && _ui.category !== c) continue;
    cats += '<button class="rl-side-item' + (_ui.category === c && !_ui.sub ? ' active' : '') + '" data-act="category" data-v="' + esc(c) + '">' + esc(c) + '<span class="rl-count">' + n + '</span></button>';
    if (_ui.category === c) {
      for (const [name, count] of subCounts(c)) {
        cats += '<button class="rl-side-item' + (_ui.sub === name ? ' active' : '') + '" style="padding-left:26px;font-size:12px" data-act="sub" data-v="' + esc(name) + '">' + esc(name) + '<span class="rl-count">' + count + '</span></button>';
      }
    }
  }

  const levelOpts = optionsHtml(
    [{ value: '', label: 'Any strictness' }].concat(LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))),
    _ui.level
  );
  const sortOpts = optionsHtml(
    [{ value: 'name', label: 'Sort: Name' }, { value: 'updated', label: 'Sort: Recently updated' }, { value: 'added', label: 'Sort: Recently added' }],
    _ui.sort
  );
  const tags = _data.tags.map((t) =>
    '<button class="rl-chip' + (_ui.tag === t ? ' active' : '') + '" data-act="tag" data-v="' + esc(t) + '">' + esc(t) + '</button>'
  ).join('');

  side.innerHTML =
    '<div class="rl-side-section"><div class="rl-side-title">Browse</div>' + quick + '</div>' +
    '<div class="rl-side-section"><div class="rl-side-title">Areas</div>' + cats + '</div>' +
    '<div class="rl-side-section"><div class="rl-side-title">Filters</div>' +
      '<select class="rl-input" data-field="fLevel">' + levelOpts + '</select>' +
      '<select class="rl-input" data-field="fSort">' + sortOpts + '</select>' +
    '</div>' +
    '<div class="rl-side-section"><div class="rl-side-title">Tags</div><div class="rl-chip-wrap">' + (tags || '<span class="rl-muted">No tags yet</span>') + '</div></div>' +
    (hasActiveFilters() ? '<button class="rl-btn rl-btn-block" data-act="clear-filters">Clear all filters</button>' : '');
}

function levelChips(spec) {
  return LEVELS.filter((l) => spec.requirements.some((r) => r.level === l))
    .map((l) => '<span class="rl-badge rl-lv-' + l + '">' + LEVEL_LABEL[l] + '</span>').join('');
}

function cardHtml(s) {
  const tags = s.tags.map((t) => '<span class="rl-tag">#' + esc(t) + '</span>').join('');
  return '<div class="rl-card" data-act="open-spec" data-id="' + esc(s.id) + '">' +
    '<div class="rl-card-top"><span class="rl-card-name">' + hlText(s.name, _searchWordsCache) + '</span>' +
    '<button class="rl-star' + (s.favorite ? ' on' : '') + '" data-act="fav" data-id="' + esc(s.id) + '" title="Favorite">' + (s.favorite ? '&#9733;' : '&#9734;') + '</button></div>' +
    '<div class="rl-card-desc">' + hlText(s.description, _searchWordsCache) + '</div>' +
    '<div class="rl-card-meta">' + esc(s.category) + (s.subcategory ? ' / ' + esc(s.subcategory) : '') + '</div>' +
    '<div class="rl-badges">' + levelChips(s) + '</div>' +
    '<div class="rl-tags">' + tags + '</div>' +
  '</div>';
}

function groupList(list, keyFn, order) {
  const map = new Map();
  for (const s of list) {
    const k = keyFn(s);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(s);
  }
  const keys = Array.from(map.keys());
  keys.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return keys.map((k) => [k, map.get(k)]);
}

function cardsHtml(list) {
  const searching = _searchWordsCache.length > 0;
  if (!list.length) {
    return '<div class="rl-empty">' + (hasActiveFilters() ? 'No specifications match your search or filters.' : 'No specifications yet. Create one with the New button.') + '</div>';
  }
  const note = searching
    ? '<div class="rl-result-note">' + list.length + ' result' + (list.length === 1 ? '' : 's') + ' for "' + esc(_ui.search.trim()) + '" (best match first)</div>'
    : '';
  const plain = _ui.quick === 'all' && _ui.sort === 'name';
  if (searching || !plain || _ui.sub) return note + '<div class="rl-grid">' + list.map(cardHtml).join('') + '</div>';

  const groups = !_ui.category
    ? groupList(list, (s) => s.category, _data.categories)
    : groupList(list, subOf, SUB_ORDER);

  return groups.map(([name, items]) =>
    '<div class="rl-cat-head">' + esc(name) + '<span class="rl-count">' + items.length + '</span></div>' +
    '<div class="rl-grid">' + items.map(cardHtml).join('') + '</div>'
  ).join('');
}

function profileHtml() {
  const p = _data.profile;
  const levels = optionsHtml(LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })), p.strictness);
  const typeOpts = optionsHtml((_data.appTypes || []).map((t) => ({ value: t.id, label: t.label })), p.appType || 'general');
  return '<div class="rl-config-row">' +
      '<label>Application type of <b>' + esc(_data.repoName) + '</b><select class="rl-input" data-field="pAppType">' + typeOpts + '</select></label>' +
      '<span class="rl-muted"> Every type has the same components. Only the integration, security and device rows change.</span>' +
    '</div>' +
    '<details class="rl-profile">' +
    '<summary>Project profile for <b>' + esc(_data.repoName) + '</b>: default strictness ' + esc(LEVEL_LABEL[p.strictness]) + '</summary>' +
    '<div class="rl-form-grid">' +
      '<label>Default strictness<select id="rlPLevel" class="rl-input">' + levels + '</select></label>' +
      '<label>Stack and conventions (optional)<input id="rlPStack" class="rl-input" placeholder="For example: framework, database, UI library" value="' + esc(p.stack) + '"></label>' +
      '<label>Project notes (optional)<textarea id="rlPNotes" class="rl-input" rows="2" placeholder="Anything the AI should know about this project">' + esc(p.notes) + '</textarea></label>' +
    '</div>' +
    '<button class="rl-btn rl-btn-primary" data-act="save-profile">Save profile</button>' +
    '<span class="rl-muted"> The default strictness is used by the generator. Stack and notes are added to copied output.</span>' +
  '</details>';
}

function renderList() {
  const main = _panel.querySelector('#rlMain');
  const list = getFiltered();
  const favCount = _data.specs.filter((s) => s.favorite).length;

  const stats =
    '<div class="rl-stats">' +
      '<div class="rl-stat"><b>' + _data.specs.length + '</b><span>Specifications</span></div>' +
      '<div class="rl-stat"><b>' + _data.categories.length + '</b><span>Areas</span></div>' +
      '<div class="rl-stat"><b>' + _data.tags.length + '</b><span>Tags</span></div>' +
      '<div class="rl-stat"><b>' + favCount + '</b><span>Favorites</span></div>' +
    '</div>';

  main.innerHTML = '<div class="rl-content">' + profileHtml() + stats + cardsHtml(list) + '</div>';
}

function openSpec(id) {
  const spec = _data.specs.find((s) => s.id === id);
  if (!spec) return;
  _ui.selectedId = id;
  _ui.view = 'detail';
  _cfg.level = _data.profile.strictness;
  _cfg.appType = _data.profile.appType || 'general';
  _cfg.groups = new Set(GROUPS);
  _cfg.includeRelated = isBundleSpec(spec);
  _cfg.includeStyle = true;
  spec.lastAccessedAt = new Date().toISOString();
  api().markViewed(payload({ id })).catch(() => {});
  renderMain();
  const main = _panel.querySelector('#rlMain');
  if (main) main.scrollTop = 0;
}

function renderDetail() {
  const main = _panel.querySelector('#rlMain');
  const spec = _data.specs.find((s) => s.id === _ui.selectedId);
  if (!spec) {
    _ui.view = 'list';
    renderList();
    return;
  }

  const picked = pickRequirements(spec, _cfg);
  const presentGroups = groupRequirements(picked).map((g) => g[0]);
  const md = toMarkdown(spec, _cfg, _cfg.groups, true);

  const levelOpts = optionsHtml(LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })), _cfg.level);
  const typeOpts = optionsHtml((_data.appTypes || []).map((t) => ({ value: t.id, label: t.label })), _cfg.appType || 'general');
  const groupBoxes = presentGroups.map((g) =>
    '<label class="rl-check"><input type="checkbox" data-field="cfgGroup" data-group="' + esc(g) + '"' + (_cfg.groups.has(g) ? ' checked' : '') + '> ' + esc(g.replace(' Requirements', '')) + '</label>'
  ).join('');
  const relatedNames = (spec.related || []).map((rid) => _data.specs.find((s) => s.id === rid)).filter(Boolean);
  const relatedBox = relatedNames.length
    ? '<label class="rl-check"><input type="checkbox" data-field="cfgRelated"' + (_cfg.includeRelated ? ' checked' : '') + '> Include related: ' + esc(relatedNames.map((s) => s.name).join(', ')) + '</label>'
    : '';
  const styleBox = styleGuideFor(spec)
    ? '<label class="rl-check"><input type="checkbox" data-field="cfgStyle"' + (_cfg.includeStyle ? ' checked' : '') + '> Include code style and folder structure</label>'
    : '';

  const byLevel = LEVELS.map((l) => {
    const reqs = spec.requirements.filter((r) => r.level === l);
    if (!reqs.length) return '';
    return '<details class="rl-details"><summary><span class="rl-badge rl-lv-' + l + '">' + LEVEL_LABEL[l] + '</span> ' + reqs.length + ' requirements</summary>' +
      '<ul class="rl-req-list">' + reqs.map((r) => {
        const types = Array.isArray(r.types) ? r.types : [];
        const typeTag = types.length
          ? ' <span class="rl-badge">' + esc(types.map(appTypeLabel).join(', ')) + '</span>'
          : '';
        return '<li><b>' + esc(r.title) + '</b>' + typeTag + ' <span class="rl-muted">(' + esc(r.group.replace(' Requirements', '')) + ')</span><br>' + esc(r.description) + '</li>';
      }).join('') + '</ul></details>';
  }).join('');

  main.innerHTML =
    '<div class="rl-content">' +
    '<div class="rl-toolbar">' +
      '<button class="rl-btn" data-act="back">Back to library</button>' +
      '<div class="rl-spacer"></div>' +
      '<button class="rl-btn" data-act="fav" data-id="' + esc(spec.id) + '">' + (spec.favorite ? 'Unfavorite' : 'Favorite') + '</button>' +
      '<button class="rl-btn" data-act="edit" data-id="' + esc(spec.id) + '">Edit</button>' +
      '<button class="rl-btn" data-act="dup" data-id="' + esc(spec.id) + '">Duplicate</button>' +
      '<button class="rl-btn" data-act="export-spec" data-fmt="json" data-id="' + esc(spec.id) + '">Export JSON</button>' +
      '<button class="rl-btn" data-act="export-spec" data-fmt="md" data-id="' + esc(spec.id) + '">Export Markdown</button>' +
      '<button class="rl-btn rl-btn-danger" data-act="del" data-id="' + esc(spec.id) + '">Delete</button>' +
    '</div>' +
    '<h3 class="rl-detail-title">' + esc(spec.name) + (spec.favorite ? ' <span class="rl-star on">&#9733;</span>' : '') + '</h3>' +
    '<p class="rl-detail-desc">' + esc(spec.description) + '</p>' +
    '<div class="rl-meta">Area: ' + esc(spec.category) + (spec.subcategory ? ' / ' + esc(spec.subcategory) : '') +
      ' &middot; Version ' + esc(spec.version) + ' &middot; Updated ' + fmtDate(spec.updatedAt) + ' &middot; Created ' + fmtDate(spec.createdAt) +
      '<div class="rl-tags">' + spec.tags.map((t) => '<span class="rl-tag">#' + esc(t) + '</span>').join('') + '</div></div>' +
    '<div class="rl-config">' +
      '<div class="rl-config-row">' +
        '<label>Strictness<select class="rl-input" data-field="cfgLevel">' + levelOpts + '</select></label>' +
        '<label>Application type<select class="rl-input" data-field="cfgAppType">' + typeOpts + '</select></label>' +
      '</div>' +
      '<div class="rl-config-row rl-checks">' + groupBoxes + relatedBox + styleBox + '</div>' +
      '<div class="rl-copy-row">' +
        '<button class="rl-btn rl-btn-primary" data-act="copy" data-mode="all">Copy All</button>' +
        '<button class="rl-btn" data-act="copy" data-mode="selected">Copy Selected Groups</button>' +
        '<button class="rl-btn" data-act="copy" data-mode="group" data-group="Functional Requirements">Copy Functional</button>' +
        '<button class="rl-btn" data-act="copy" data-mode="group" data-group="Security Requirements">Copy Security</button>' +
        '<button class="rl-btn" data-act="copy" data-mode="group" data-group="Performance Requirements">Copy Performance</button>' +
      '</div>' +
    '</div>' +
    '<div class="rl-label">Generated requirements (' + picked.length + ' included)</div>' +
    '<pre class="rl-preview">' + esc(md) + '</pre>' +
    '<div class="rl-label">All requirements by strictness</div>' + byLevel +
    '</div>';
}

// ---- editor ----------------------------------------------------------------

function blankDraft() {
  return {
    id: null,
    name: '',
    description: '',
    category: _ui.category || _data.categories[0] || 'Other',
    subcategory: _ui.sub && _ui.sub !== 'General' ? _ui.sub : '',
    tags: [],
    related: [],
    requirements: [],
  };
}

function startEdit(id) {
  if (id) {
    const spec = _data.specs.find((s) => s.id === id);
    if (!spec) return;
    _draft = JSON.parse(JSON.stringify(spec));
  } else {
    _draft = blankDraft();
  }
  _ui.view = 'edit';
  renderMain();
  const main = _panel.querySelector('#rlMain');
  if (main) main.scrollTop = 0;
}

function reqRowHtml(r) {
  const groupOpts = optionsHtml(GROUPS.map((g) => ({ value: g, label: g })), r.group);
  const levelOpts = optionsHtml(LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })), r.level);
  return '<div class="rl-req-row" data-id="' + esc(r.id) + '">' +
    '<div class="rl-req-top">' +
      '<select class="rl-input rl-r-group">' + groupOpts + '</select>' +
      '<select class="rl-input rl-r-level">' + levelOpts + '</select>' +
      '<input class="rl-input rl-r-title" placeholder="Requirement title" value="' + esc(r.title) + '">' +
      '<button class="rl-btn" data-act="req-up">Up</button>' +
      '<button class="rl-btn" data-act="req-down">Down</button>' +
      '<button class="rl-btn rl-btn-danger" data-act="req-del">Remove</button>' +
    '</div>' +
    '<textarea class="rl-input rl-r-desc" rows="2" placeholder="Specific, actionable description">' + esc(r.description) + '</textarea>' +
    '<input class="rl-input rl-r-notes" placeholder="Optional implementation notes" value="' + esc(r.notes || '') + '">' +
  '</div>';
}

function renderEdit() {
  const main = _panel.querySelector('#rlMain');
  const d = _draft;
  const catList = _data.categories.map((c) => '<option value="' + esc(c) + '"></option>').join('');
  const subNames = Array.from(new Set(_data.specs.map((s) => s.subcategory).filter(Boolean))).sort();
  const subList = subNames.map((n) => '<option value="' + esc(n) + '"></option>').join('');
  const relBoxes = _data.specs.filter((s) => s.id !== d.id).map((s) =>
    '<label class="rl-check"><input type="checkbox" class="rl-e-rel" value="' + esc(s.id) + '"' + (d.related.includes(s.id) ? ' checked' : '') + '> ' + esc(s.name) + '</label>'
  ).join('');

  main.innerHTML =
    '<div class="rl-content">' +
    '<div class="rl-toolbar">' +
      '<button class="rl-btn" data-act="cancel">Cancel</button>' +
      '<div class="rl-spacer"></div>' +
      '<button class="rl-btn rl-btn-primary" data-act="save">Save</button>' +
    '</div>' +
    '<h3 class="rl-detail-title">' + (d.id ? 'Edit specification' : 'New specification') + '</h3>' +
    '<div class="rl-form-grid">' +
      '<label>Name<input id="rlEName" class="rl-input" value="' + esc(d.name) + '"></label>' +
      '<label>Area<input id="rlECat" class="rl-input" list="rlCats" value="' + esc(d.category) + '"><datalist id="rlCats">' + catList + '</datalist></label>' +
      '<label>Group (Inputs, Loading, Store...)<input id="rlESub" class="rl-input" list="rlSubs" value="' + esc(d.subcategory) + '"><datalist id="rlSubs">' + subList + '</datalist></label>' +
      '<label>Tags (comma separated)<input id="rlETags" class="rl-input" value="' + esc(d.tags.join(', ')) + '"></label>' +
    '</div>' +
    '<label class="rl-block">Description<textarea id="rlEDesc" class="rl-input" rows="2">' + esc(d.description) + '</textarea></label>' +
    '<div class="rl-block"><div class="rl-label">Related specifications</div><div class="rl-checks">' + (relBoxes || '<span class="rl-muted">No other specifications</span>') + '</div></div>' +
    '<div class="rl-label rl-row-between">Requirements and acceptance criteria <button class="rl-btn" data-act="add-req">+ Add requirement</button></div>' +
    '<div id="rlReqRows">' + (d.requirements.length ? d.requirements.map(reqRowHtml).join('') : '<div class="rl-empty">No requirements yet.</div>') + '</div>' +
    '</div>';
}

function collectDraft() {
  const main = _panel.querySelector('#rlMain');
  if (!main || !_draft) return;
  const val = (sel) => {
    const el = main.querySelector(sel);
    return el ? el.value : '';
  };
  const previous = new Map(_draft.requirements.map((r) => [r.id, r]));
  _draft.name = val('#rlEName').trim();
  _draft.category = val('#rlECat').trim() || 'Other';
  _draft.subcategory = val('#rlESub').trim();
  _draft.description = val('#rlEDesc').trim();
  _draft.tags = val('#rlETags').split(',').map((t) => t.trim()).filter(Boolean);
  _draft.related = Array.from(main.querySelectorAll('.rl-e-rel:checked')).map((i) => i.value);
  _draft.requirements = Array.from(main.querySelectorAll('.rl-req-row')).map((row) => {
    const prev = previous.get(row.dataset.id);
    return {
      id: row.dataset.id,
      group: row.querySelector('.rl-r-group').value,
      level: row.querySelector('.rl-r-level').value,
      title: row.querySelector('.rl-r-title').value.trim(),
      description: row.querySelector('.rl-r-desc').value.trim(),
      notes: row.querySelector('.rl-r-notes').value.trim(),
      types: prev && Array.isArray(prev.types) ? prev.types : [],
    };
  });
}

async function saveDraft() {
  collectDraft();
  if (!_draft.name) {
    toast('A name is required');
    return;
  }
  _draft.requirements = _draft.requirements.filter((r) => r.title || r.description);
  try {
    const saved = await api().upsertSpec(payload({ spec: _draft }));
    await reload();
    _draft = null;
    renderSidebar();
    openSpec(saved.id);
    toast('Saved');
  } catch (err) {
    toast('Could not save the specification');
  }
}

// ---- manage modal ----------------------------------------------------------

function renderManage() {
  const modal = _panel.querySelector('#rlModal');
  const section = (title, kind, rows) =>
    '<div class="rl-mgr-section"><div class="rl-label">' + title + '</div>' + rows +
    '<div class="rl-mgr-row"><input id="rlMgrAdd_' + kind + '" class="rl-input" placeholder="Add new...">' +
    '<button class="rl-btn rl-btn-primary" data-act="mgr-add" data-kind="' + kind + '">Add</button></div></div>';

  const row = (kind, value, label, editable) =>
    '<div class="rl-mgr-row"><input class="rl-input" value="' + esc(label) + '"' + (editable ? '' : ' disabled') + '>' +
    (editable
      ? '<button class="rl-btn" data-act="mgr-rename" data-kind="' + kind + '" data-v="' + esc(value) + '">Rename</button>' +
        '<button class="rl-btn rl-btn-danger" data-act="mgr-del" data-kind="' + kind + '" data-v="' + esc(value) + '">Delete</button>'
      : '<span class="rl-muted">built-in</span>') +
    '</div>';

  const cats = _data.categories.map((c) => row('category', c, c, c !== 'Other')).join('');
  const tags = _data.tags.map((t) => row('tag', t, t, true)).join('');

  const presets =
    '<div class="rl-mgr-section"><div class="rl-label">Presets</div>' +
    '<div class="rl-mgr-row"><span class="rl-muted">' + (_data.presetTotal - _data.presetMissing - _data.presetRemoved) + ' of ' + _data.presetTotal + ' presets are in this repository. ' +
    _data.presetMissing + ' available to add, ' + _data.presetRemoved + ' deleted.</span></div>' +
    '<div class="rl-mgr-row">' +
      '<button class="rl-btn" data-act="presets-add">Add missing presets</button>' +
      '<button class="rl-btn" data-act="presets-restore">Restore deleted presets</button>' +
    '</div></div>';

  modal.innerHTML =
    '<div class="rl-modal-box">' +
      '<div class="rl-toolbar"><h3 class="rl-detail-title">Manage ' + esc(_data.repoName) + '</h3><div class="rl-spacer"></div>' +
      '<button class="rl-btn" data-act="modal-close">Close</button></div>' +
      presets +
      section('Areas', 'category', cats) +
      section('Tags', 'tag', tags) +
    '</div>';
  modal.style.display = 'flex';
}

// ---- events ----------------------------------------------------------------

function onChange(e) {
  const t = e.target;
  const f = t.dataset && t.dataset.field;
  if (!f) return;
  switch (f) {
    case 'fLevel': _ui.level = t.value; renderAll(); break;
    case 'fSort': _ui.sort = t.value; renderAll(); break;
    case 'cfgLevel': _cfg.level = t.value; renderMain(); break;
    case 'cfgAppType': _cfg.appType = t.value; renderMain(); break;
    case 'pAppType':
      call(() => api().updateProfile(payload({ profile: { appType: t.value } })), 'Application type saved');
      break;
    case 'cfgRelated': _cfg.includeRelated = t.checked; renderMain(); break;
    case 'cfgStyle': _cfg.includeStyle = t.checked; renderMain(); break;
    case 'cfgGroup':
      if (t.checked) _cfg.groups.add(t.dataset.group);
      else _cfg.groups.delete(t.dataset.group);
      renderMain();
      break;
    default: break;
  }
}

function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  e.stopPropagation();
  handleAction(t.dataset.act, t);
}

async function handleAction(act, t) {
  const id = t.dataset.id;
  switch (act) {
    case 'close': close(); break;
    case 'clear-search': {
      _panel.querySelector('#rlSearch').value = '';
      _ui.search = '';
      renderAll();
      break;
    }
    case 'new': if (_data) startEdit(null); break;
    case 'import': if (_data) _panel.querySelector('#rlFile').click(); break;
    case 'export':
      if (!_data) break;
      download(_data.repoName + '-requirements-library.json', JSON.stringify({
        exportType: 'library',
        version: _data.version,
        categories: _data.categories,
        tags: _data.tags,
        specs: _data.specs,
      }, null, 2), 'application/json');
      toast('Library exported');
      break;
    case 'manage': if (_data) renderManage(); break;
    case 'modal-close': _panel.querySelector('#rlModal').style.display = 'none'; break;
    case 'quick': _ui.quick = t.dataset.v; _ui.view = 'list'; renderAll(); break;
    case 'category': _ui.category = t.dataset.v; _ui.sub = ''; _ui.view = 'list'; renderAll(); break;
    case 'sub': _ui.sub = _ui.sub === t.dataset.v ? '' : t.dataset.v; _ui.view = 'list'; renderAll(); break;
    case 'tag': _ui.tag = _ui.tag === t.dataset.v ? '' : t.dataset.v; _ui.view = 'list'; renderAll(); break;
    case 'clear-filters': {
      _ui.quick = 'all'; _ui.category = ''; _ui.sub = ''; _ui.level = ''; _ui.tag = ''; _ui.search = '';
      _panel.querySelector('#rlSearch').value = '';
      _ui.view = 'list';
      renderAll();
      break;
    }
    case 'save-profile': {
      const profile = {
        strictness: _panel.querySelector('#rlPLevel').value,
        stack: _panel.querySelector('#rlPStack').value,
        notes: _panel.querySelector('#rlPNotes').value,
      };
      await call(() => api().updateProfile(payload({ profile })), 'Profile saved');
      break;
    }
    case 'open-spec': openSpec(id); break;
    case 'back': _ui.view = 'list'; renderMain(); break;
    case 'fav': await call(() => api().toggleFavorite(payload({ id }))); break;
    case 'dup': {
      try {
        const copy = await api().duplicateSpec(payload({ id }));
        await reload();
        renderSidebar();
        openSpec(copy.id);
        toast('Duplicated');
      } catch (_) {
        toast('Could not duplicate');
      }
      break;
    }
    case 'del': {
      const spec = _data.specs.find((s) => s.id === id);
      if (!spec) break;
      if (!confirm('Delete "' + spec.name + '"? This cannot be undone.')) break;
      _ui.view = 'list';
      await call(() => api().deleteSpec(payload({ id })), 'Deleted');
      break;
    }
    case 'edit': startEdit(id); break;
    case 'cancel': _draft = null; _ui.view = _ui.selectedId ? 'detail' : 'list'; renderMain(); break;
    case 'save': await saveDraft(); break;
    case 'add-req':
      collectDraft();
      _draft.requirements.push({ id: newReqId(), group: GROUPS[0], level: 'standard', title: '', description: '', notes: '', types: [] });
      renderEdit();
      break;
    case 'req-up':
    case 'req-down':
    case 'req-del': {
      collectDraft();
      const row = t.closest('.rl-req-row');
      const idx = _draft.requirements.findIndex((r) => r.id === row.dataset.id);
      if (idx === -1) break;
      if (act === 'req-del') {
        _draft.requirements.splice(idx, 1);
      } else {
        const to = act === 'req-up' ? idx - 1 : idx + 1;
        if (to >= 0 && to < _draft.requirements.length) {
          const tmp = _draft.requirements[idx];
          _draft.requirements[idx] = _draft.requirements[to];
          _draft.requirements[to] = tmp;
        }
      }
      renderEdit();
      break;
    }
    case 'export-spec': {
      const spec = _data.specs.find((s) => s.id === id);
      if (!spec) break;
      const base = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'specification';
      if (t.dataset.fmt === 'md') download(base + '.md', specToMarkdownFull(spec), 'text/markdown');
      else download(base + '.json', JSON.stringify({ exportType: 'spec', spec }, null, 2), 'application/json');
      toast('Exported');
      break;
    }
    case 'copy': await doCopy(t); break;
    case 'presets-add':
    case 'presets-restore': {
      try {
        const result = await api().syncPresets(payload({ includeRemoved: act === 'presets-restore' }));
        await reload();
        renderAll();
        renderManage();
        toast('Added ' + result.added + ' presets');
      } catch (_) {
        toast('Could not add presets');
      }
      break;
    }
    case 'mgr-add': {
      const input = _panel.querySelector('#rlMgrAdd_' + t.dataset.kind);
      const value = input ? input.value.trim() : '';
      if (!value) break;
      await call(() => api().addItem(payload({ kind: t.dataset.kind, value })));
      renderManage();
      break;
    }
    case 'mgr-rename': {
      const input = t.closest('.rl-mgr-row').querySelector('input');
      await call(() => api().renameItem(payload({ kind: t.dataset.kind, value: t.dataset.v, newValue: input.value })), 'Renamed');
      renderManage();
      break;
    }
    case 'mgr-del': {
      if (!confirm('Delete "' + t.dataset.v + '"? Specifications using it will be updated.')) break;
      await call(() => api().deleteItem(payload({ kind: t.dataset.kind, value: t.dataset.v })), 'Deleted');
      renderManage();
      break;
    }
    default: break;
  }
}

async function doCopy(t) {
  const spec = _data.specs.find((s) => s.id === _ui.selectedId);
  if (!spec) return;
  const mode = t.dataset.mode;
  let text;
  if (mode === 'all') {
    text = toMarkdown(spec, _cfg, new Set(GROUPS), true);
  } else if (mode === 'selected') {
    if (!_cfg.groups.size) {
      toast('Select at least one group');
      return;
    }
    text = toMarkdown(spec, _cfg, _cfg.groups, false);
  } else {
    const group = t.dataset.group;
    const has = pickRequirements(spec, _cfg).some((r) => r.group === group);
    if (!has) {
      toast('No ' + group.replace(' Requirements', '').toLowerCase() + ' requirements for this configuration');
      return;
    }
    text = toMarkdown(spec, _cfg, new Set([group]), false);
  }
  const ok = await copyText(text);
  toast(ok ? 'Copied to clipboard' : 'Copy failed');
}

async function onImportFile(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || (!Array.isArray(parsed.specs) && !parsed.spec)) {
      toast('Not a valid library or specification file');
      return;
    }
    const result = await api().importLibrary(payload({ data: parsed }));
    await reload();
    renderAll();
    toast('Imported ' + result.imported + (result.skipped ? ', skipped ' + result.skipped : ''));
  } catch (_) {
    toast('Import failed: invalid file');
  }
}