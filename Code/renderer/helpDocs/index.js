import { SECTIONS, GROUPS, APP_INFO } from './content.js';

let _panel = null;
let _active = SECTIONS[0].id;
let _query = '';
let _cssPromise = null;
let _escBound = false;
const _haystack = new Map();

function _esc(s) {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _flat(block) {
  const out = [];
  if (block.text) out.push(block.text);
  if (block.name) out.push(block.name);
  if (block.role) out.push(block.role);
  (block.items || []).forEach((it) => {
    if (typeof it === 'string') out.push(it);
    else out.push(Object.values(it).join(' '));
  });
  return out.join(' ');
}

function _buildHaystack() {
  SECTIONS.forEach((s) => {
    const parts = [s.title, s.lead || ''];
    s.blocks.forEach((b) => parts.push(_flat(b)));
    _haystack.set(s.id, parts.join(' ').toLowerCase());
  });
}

function _ensureCss() {
  if (_cssPromise) return _cssPromise;
  _cssPromise = new Promise((resolve) => {
    if (document.getElementById('hdStyles')) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.id = 'hdStyles';
    link.rel = 'stylesheet';
    link.href = './styles/help-docs.css';
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });
  return _cssPromise;
}

/* ── Block renderers ───────────────────────────────── */

function _renderBlock(b) {
  switch (b.t) {
    case 'p':
      return '<p class="hd-p">' + _esc(b.text) + '</p>';
    case 'h':
      return '<h3 class="hd-h3">' + _esc(b.text) + '</h3>';
    case 'callout':
      return '<div class="hd-callout">' + _esc(b.text) + '</div>';
    case 'ul':
      return '<ul class="hd-ul">' + b.items.map((i) => '<li>' + _esc(i) + '</li>').join('') + '</ul>';
    case 'stats':
      return '<div class="hd-stats">' + b.items.map((i) =>
        '<div class="hd-stat"><div class="hd-stat-value">' + _esc(i.value) + '</div><div class="hd-stat-label">' + _esc(i.label) + '</div></div>'
      ).join('') + '</div>';
    case 'cards':
      return '<div class="hd-cards' + (b.compact ? ' hd-cards--compact' : '') + '">' + b.items.map((i) =>
        '<div class="hd-card">' +
          (i.tag ? '<span class="hd-card-tag">' + _esc(i.tag) + '</span>' : '') +
          '<div class="hd-card-title">' + _esc(i.title) + '</div>' +
          '<div class="hd-card-text">' + _esc(i.text) + '</div>' +
        '</div>'
      ).join('') + '</div>';
    case 'steps':
      return '<ol class="hd-steps">' + b.items.map((i, n) =>
        '<li class="hd-step"><span class="hd-step-num">' + (n + 1) + '</span><div><div class="hd-step-title">' + _esc(i.title) + '</div><div class="hd-step-text">' + _esc(i.text) + '</div></div></li>'
      ).join('') + '</ol>';
    case 'timeline':
      return '<div class="hd-timeline">' + b.items.map((i) =>
        '<div class="hd-tl-item"><div class="hd-tl-dot"></div><div class="hd-tl-label">' + _esc(i.label) + '</div><div class="hd-tl-title">' + _esc(i.title) + '</div><div class="hd-tl-text">' + _esc(i.text) + '</div></div>'
      ).join('') + '</div>';
    case 'kv':
      return '<div class="hd-kv">' + b.items.map((i) =>
        '<div class="hd-kv-row"><span class="hd-kv-k">' + _esc(i.k) + '</span><span class="hd-kv-v">' + _esc(i.v) + '</span></div>'
      ).join('') + '</div>';
    case 'kbd':
      return '<div class="hd-kbd">' + b.items.map((i) =>
        '<div class="hd-kbd-row"><kbd>' + _esc(i.keys) + '</kbd><span>' + _esc(i.text) + '</span></div>'
      ).join('') + '</div>';
    case 'profile': {
      const initials = String(b.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
      return '<div class="hd-profile">' +
        '<div class="hd-avatar">' + _esc(initials) + '</div>' +
        '<div class="hd-profile-body"><div class="hd-profile-name">' + _esc(b.name) + '</div>' +
        '<div class="hd-profile-role">' + _esc(b.role) + '</div>' +
        '<p class="hd-p">' + _esc(b.text) + '</p></div></div>';
    }
    default:
      return '';
  }
}

/* ── Rendering ─────────────────────────────────────── */

function _renderNav() {
  const nav = _panel.querySelector('#hdNav');
  const q = _query.trim().toLowerCase();
  let html = '';
  let shown = 0;
  GROUPS.forEach((g) => {
    const items = SECTIONS.filter((s) => s.group === g.id && (!q || _haystack.get(s.id).includes(q)));
    if (!items.length) return;
    shown += items.length;
    html += '<div class="hd-nav-group">' + _esc(g.title) + '</div>';
    items.forEach((s) => {
      html += '<button type="button" class="hd-nav-item' + (s.id === _active ? ' active' : '') + '" data-id="' + _esc(s.id) + '">' +
        '<span class="hd-nav-icon">' + s.icon + '</span>' +
        '<span class="hd-nav-label">' + _esc(s.title) + '</span>' +
      '</button>';
    });
  });
  if (!shown) html = '<div class="hd-nav-empty">No matching topics</div>';
  nav.innerHTML = html;
}

function _renderPage() {
  const main = _panel.querySelector('#hdMain');
  const idx = SECTIONS.findIndex((s) => s.id === _active);
  const sec = SECTIONS[idx];
  if (!sec) return;
  const group = GROUPS.find((g) => g.id === sec.group);
  const prev = SECTIONS[idx - 1];
  const next = SECTIONS[idx + 1];

  let html = '<article class="hd-page">';
  html += '<div class="hd-eyebrow">' + _esc(group ? group.title : '') + '</div>';
  html += '<h1 class="hd-title">' + _esc(sec.title) + '</h1>';
  if (sec.lead) html += '<p class="hd-lead">' + _esc(sec.lead) + '</p>';
  html += sec.blocks.map(_renderBlock).join('');
  html += '<div class="hd-pager">';
  html += prev
    ? '<button type="button" class="hd-pager-btn" data-id="' + _esc(prev.id) + '"><span class="hd-pager-dir">Previous</span><span class="hd-pager-name">' + _esc(prev.title) + '</span></button>'
    : '<span></span>';
  html += next
    ? '<button type="button" class="hd-pager-btn hd-pager-next" data-id="' + _esc(next.id) + '"><span class="hd-pager-dir">Next</span><span class="hd-pager-name">' + _esc(next.title) + '</span></button>'
    : '<span></span>';
  html += '</div>';
  html += '<div class="hd-footer">' + _esc(APP_INFO.name) + ' v' + _esc(APP_INFO.version) + ' - Created by ' + _esc(APP_INFO.creator) + '</div>';
  html += '</article>';

  main.innerHTML = html;
  main.scrollTop = 0;
}

function _select(id) {
  if (!SECTIONS.some((s) => s.id === id)) return;
  _active = id;
  _renderNav();
  _renderPage();
}

/* ── Build panel ───────────────────────────────────── */

function _buildPanel() {
  _buildHaystack();
  _panel = document.createElement('div');
  _panel.id = 'hdPanel';
  _panel.className = 'hd-overlay';
  _panel.innerHTML =
    '<div class="hd-container">' +
      '<div class="hd-header">' +
        '<h2>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><circle cx="12" cy="17.5" r="0.6" fill="currentColor"/></svg>' +
          'HelperTool Documentation' +
          '<span class="hd-version">v' + _esc(APP_INFO.version) + '</span>' +
        '</h2>' +
        '<div class="hd-header-right">' +
          '<button type="button" class="hd-btn-close" id="hdCloseBtn" title="Close" aria-label="Close">' +
            '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="hd-body">' +
        '<aside class="hd-sidebar">' +
          '<div class="hd-search-wrap"><input type="text" id="hdSearch" class="hd-search" placeholder="Search docs..." autocomplete="off" /></div>' +
          '<nav class="hd-nav" id="hdNav"></nav>' +
        '</aside>' +
        '<main class="hd-main" id="hdMain"></main>' +
      '</div>' +
    '</div>';
  document.body.appendChild(_panel);

  _panel.querySelector('#hdCloseBtn').addEventListener('click', close);

  _panel.querySelector('#hdSearch').addEventListener('input', (e) => {
    _query = e.target.value || '';
    _renderNav();
  });

  _panel.addEventListener('click', (e) => {
    const target = e.target.closest('[data-id]');
    if (target && _panel.contains(target)) _select(target.getAttribute('data-id'));
  });

  if (!_escBound) {
    document.addEventListener('keydown', _escHandler);
    _escBound = true;
  }

  _renderNav();
  _renderPage();
}

function _escHandler(e) {
  if (e.key === 'Escape' && isOpen()) close();
}

/* ── Public API ────────────────────────────────────── */

export function isOpen() {
  return !!_panel && _panel.classList.contains('open');
}

export async function open() {
  if (isOpen()) return;
  await _ensureCss();
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
}

export function close() {
  if (!_panel) return;
  _panel.classList.remove('open');
}