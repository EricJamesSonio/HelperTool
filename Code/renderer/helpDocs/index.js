import { SECTIONS, GROUPS, APP_INFO } from './content.js';
import { renderMarkdown } from './markdown.js';

const VER_PREFIX = 'ver:';
const LIST_ID = 'versions';
const TAB_LABELS = {
  'README.md': 'Documentation',
  'UI-Preview.md': 'UI Preview',
};
const ICON_VER = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l7-7h7v7l-7 7-7-7z"/><circle cx="13.5" cy="6.5" r="1"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>';
const ALLOWED_IMG = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMG_BYTES = 20 * 1024 * 1024;

let _panel = null;
let _active = SECTIONS[0].id;
let _query = '';
let _cssPromise = null;
let _escBound = false;
let _lightbox = null;
let _renderToken = 0;
let _verTab = 'README.md';
let _versions = [];
let _versionsState = 'idle';
let _versionsError = '';
let _target = '';
let _targetIsUser = false;
let _modal = null;
let _draft = null;
const _haystack = new Map();
const _mdCache = new Map();
const _assetCache = new Map();

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

function _loadCss(id, href) {
  return new Promise((resolve) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });
}

function _ensureCss() {
  if (_cssPromise) return _cssPromise;
  _cssPromise = Promise.all([
    _loadCss('hdStyles', './styles/help-docs.css'),
    _loadCss('hdStylesMd', './styles/help-docs-md.css'),
    _loadCss('hdStylesVer', './styles/help-docs-versions.css'),
  ]);
  return _cssPromise;
}

/* ── Version helpers ───────────────────────────────── */

function _isVer(id) {
  return typeof id === 'string' && id.indexOf(VER_PREFIX) === 0;
}

function _verOf(id) {
  const key = String(id).slice(VER_PREFIX.length);
  return _versions.find((v) => v.id === key) || null;
}

function _verLabel(v) {
  const m = /version\s+(\d[\d.]*)/i.exec(v.title || '');
  return 'Version ' + (m ? m[1].replace(/\.$/, '') : v.num);
}

function _verSub(v) {
  const m = /\s[\u2014\u2013-]\s*(.+)$/.exec(v.title || '');
  return m ? m[1] : '';
}

async function _loadVersions(force) {
  if (_versionsState === 'loading') return;
  if (_versionsState === 'ready' && !force) return;
  _versionsState = 'loading';
  try {
    const api = window.versionsAPI;
    if (!api) throw new Error('Version files are not available in this build.');
    const res = await api.list();
    if (!res || !res.success) throw new Error((res && res.error) || 'Version files were not found.');
    _versions = res.versions || [];
    _target = res.target || '';
    _targetIsUser = !!res.userFolder;
    _versionsState = 'ready';
    _versionsError = '';
  } catch (err) {
    _versionsState = 'error';
    _versionsError = err && err.message ? err.message : String(err);
  }
  if (_panel) {
    _renderNav();
    if (_active === LIST_ID || _isVer(_active)) _renderPage();
  }
}

async function _readVersionFile(id, file) {
  const key = id + '/' + file;
  if (_mdCache.has(key)) return _mdCache.get(key);
  const res = await window.versionsAPI.read(id, file);
  if (!res || !res.success) throw new Error((res && res.error) || 'Could not read ' + file + '.');
  _mdCache.set(key, res.text);
  return res.text;
}

function _imgMissing(img, p) {
  const note = document.createElement('div');
  note.className = 'hd-md-missing';
  note.textContent = 'Image not found: ' + p;
  if (img.parentNode) img.parentNode.replaceChild(note, img);
}

async function _hydrateImages(root, token) {
  const imgs = Array.from(root.querySelectorAll('img[data-src]'));
  let next = 0;
  const worker = async () => {
    while (next < imgs.length) {
      const img = imgs[next++];
      if (token !== _renderToken) return;
      const p = img.getAttribute('data-src');
      try {
        let dataUrl = _assetCache.get(p);
        if (!dataUrl) {
          const res = await window.versionsAPI.asset(p);
          if (res && res.success) {
            dataUrl = res.dataUrl;
            _assetCache.set(p, dataUrl);
          }
        }
        if (token !== _renderToken) return;
        if (dataUrl) {
          img.src = dataUrl;
          img.classList.add('loaded');
        } else {
          _imgMissing(img, p);
        }
      } catch (_) {
        _imgMissing(img, p);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

function _openLightbox(src, alt) {
  _closeLightbox();
  const box = document.createElement('div');
  box.className = 'hd-lightbox';
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt || '';
  box.appendChild(img);
  box.addEventListener('click', _closeLightbox);
  document.body.appendChild(box);
  _lightbox = box;
}

function _closeLightbox() {
  if (!_lightbox) return;
  _lightbox.remove();
  _lightbox = null;
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

function _navBtn(id, iconHtml, label, sub, isActive) {
  const on = isActive === undefined ? id === _active : isActive;
  return '<button type="button" class="hd-nav-item' + (on ? ' active' : '') + '" data-id="' + _esc(id) + '"' +
    (sub ? ' title="' + _esc(sub) + '"' : '') + '>' +
    '<span class="hd-nav-icon">' + iconHtml + '</span>' +
    '<span class="hd-nav-text"><span class="hd-nav-label">' + _esc(label) + '</span>' +
    (sub ? '<span class="hd-nav-sub">' + _esc(sub) + '</span>' : '') +
    '</span></button>';
}

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
      html += _navBtn(s.id, s.icon, s.title, '');
    });
  });

  const verText = ('versions releases version history ' + _versions.map((v) => _verLabel(v) + ' ' + (v.title || '')).join(' ')).toLowerCase();
  if (!q || verText.includes(q)) {
    shown += 1;
    const sub = _versionsState === 'ready' ? _versions.length + ' releases' : '';
    html += '<div class="hd-nav-group">Releases</div>';
    html += _navBtn(LIST_ID, ICON_VER, 'Versions', sub, _active === LIST_ID || _isVer(_active));
  }

  if (!shown) html = '<div class="hd-nav-empty">No matching topics</div>';
  nav.innerHTML = html;
}

function _renderStaticPage() {
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

function _renderVersionsList() {
  _renderToken++;
  const main = _panel.querySelector('#hdMain');

  let html = '<article class="hd-page hd-page--wide">';
  html += '<div class="hd-eyebrow">Releases</div>';
  html += '<div class="hd-vhead"><div><h1 class="hd-title">Versions</h1>' +
    '<p class="hd-lead hd-lead--tight">Every release of HelperTool with its documentation and UI preview.</p></div>' +
    '<button type="button" class="hd-btn-primary" data-act="create">+ Create new</button></div>';

  if (_versionsState === 'error') {
    html += '<div class="hd-vempty">' + _esc(_versionsError) + '</div>';
  } else if (_versionsState !== 'ready') {
    html += '<div class="hd-vempty">Loading versions...</div>';
  } else if (!_versions.length) {
    html += '<div class="hd-vempty">No versions yet. Use "Create new" to add the first one.</div>';
  } else {
    html += '<div class="hd-vgrid">';
    _versions.forEach((v, i) => {
      const latest = i === 0;
      const sub = _verSub(v);
      html += '<button type="button" class="hd-vcard' + (latest ? ' latest' : '') + '" data-id="' + _esc(VER_PREFIX + v.id) + '">' +
        '<div class="hd-vcard-top"><span class="hd-vcard-id">' + _esc(v.id) + '</span>' +
        (latest ? '<span class="hd-badge-latest">Latest</span>' : '') + '</div>' +
        '<div class="hd-vcard-name">' + _esc(_verLabel(v)) + '</div>' +
        '<div class="hd-vcard-sub">' + _esc(sub || 'Release notes') + '</div>' +
        '<div class="hd-vcard-meta">' +
          (v.files.includes('README.md') ? '<span class="hd-chip">README</span>' : '') +
          (v.files.includes('UI-Preview.md') ? '<span class="hd-chip">UI Preview</span>' : '') +
          (v.images ? '<span class="hd-vcard-count">' + v.images + (v.images === 1 ? ' screenshot' : ' screenshots') + '</span>' : '') +
        '</div></button>';
    });
    html += '</div>';
  }

  html += '</article>';
  main.innerHTML = html;
  main.scrollTop = 0;
}

async function _renderVersionPage() {
  const main = _panel.querySelector('#hdMain');
  const token = ++_renderToken;
  const v = _verOf(_active);

  if (!v) {
    const msg = _versionsState === 'error' ? _versionsError : 'Loading versions...';
    main.innerHTML = '<article class="hd-page"><div class="hd-eyebrow">Releases</div>' +
      '<div class="hd-md"><div class="hd-md-loading">' + _esc(msg) + '</div></div></article>';
    return;
  }

  const file = v.files.includes(_verTab) ? _verTab : v.files[0];
  _verTab = file;
  const idx = _versions.findIndex((x) => x.id === v.id);
  const newer = _versions[idx - 1];
  const older = _versions[idx + 1];

  let html = '<article class="hd-page">';
  html += '<div class="hd-eyebrow">Releases</div>';
  html += '<div class="hd-ver-bar">' +
    '<button type="button" class="hd-btn hd-back" data-act="list">&larr; All versions</button>' +
    '<span class="hd-ver-chip">' + _esc(v.id) + '</span>' +
    (idx === 0 ? '<span class="hd-badge-latest">Latest</span>' : '') +
    '<div class="hd-tabs">';
  v.files.forEach((f) => {
    html += '<button type="button" class="hd-tab' + (f === file ? ' active' : '') + '" data-tab="' + _esc(f) + '">' + _esc(TAB_LABELS[f] || f) + '</button>';
  });
  html += '</div></div>';
  html += '<div class="hd-md" id="hdMdBody"><div class="hd-md-loading">Loading...</div></div>';
  html += '<div class="hd-pager">';
  html += older
    ? '<button type="button" class="hd-pager-btn" data-id="' + _esc(VER_PREFIX + older.id) + '"><span class="hd-pager-dir">Older</span><span class="hd-pager-name">' + _esc(_verLabel(older)) + '</span></button>'
    : '<span></span>';
  html += newer
    ? '<button type="button" class="hd-pager-btn hd-pager-next" data-id="' + _esc(VER_PREFIX + newer.id) + '"><span class="hd-pager-dir">Newer</span><span class="hd-pager-name">' + _esc(_verLabel(newer)) + '</span></button>'
    : '<span></span>';
  html += '</div>';
  html += '<div class="hd-footer">' + _esc(APP_INFO.name) + ' - Created by ' + _esc(APP_INFO.creator) + '</div>';
  html += '</article>';

  main.innerHTML = html;
  main.scrollTop = 0;

  const body = main.querySelector('#hdMdBody');
  try {
    const text = await _readVersionFile(v.id, file);
    if (token !== _renderToken) return;
    body.innerHTML = renderMarkdown(text, { baseDir: v.id });
    _hydrateImages(body, token);
  } catch (err) {
    if (token !== _renderToken) return;
    body.innerHTML = '<div class="hd-md-loading">' + _esc(err && err.message ? err.message : 'Could not load this file.') + '</div>';
  }
}

function _renderPage() {
  if (_active === LIST_ID) {
    _renderVersionsList();
    return;
  }
  if (_isVer(_active)) {
    _renderVersionPage();
    return;
  }
  _renderToken++;
  _renderStaticPage();
}

function _select(id) {
  if (id === LIST_ID) {
    // always allowed
  } else if (_isVer(id)) {
    if (!_verOf(id)) return;
    if (id !== _active) _verTab = 'README.md';
  } else if (!SECTIONS.some((s) => s.id === id)) {
    return;
  }
  _active = id;
  _renderNav();
  _renderPage();
}

/* ── Create new version ────────────────────────────── */

function _readmeTemplate(label, title) {
  const l = String(label || '').trim() || 'X.Y.Z';
  const t = String(title || '').trim();
  const head = '# Version ' + l + (t ? ' \u2014 ' + t : '');
  return [
    head,
    '',
    '## Overview',
    '',
    'Describe what this version is about in two or three sentences.',
    '',
    'This release introduces:',
    '',
    '- **Feature one** - one line about it.',
    '- **Feature two** - one line about it.',
    '',
    '---',
    '',
    '# New Features & Improvements',
    '',
    '## Feature one',
    '',
    '- **Highlight** - what it does for the user.',
    '- **Highlight** - what it does for the user.',
    '',
    '---',
    '',
    '# Workflow Improvements',
    '',
    '- **Improvement** - what gets faster or easier.',
    '',
    '---',
    '',
    '# Performance & Reliability Notes',
    '',
    'Mention speed, stability or fixes worth knowing about.',
    '',
    '---',
    '',
    '# Compatibility',
    '',
    'List what stays compatible with earlier versions.',
    '',
    '---',
    '',
    '# Summary',
    '',
    'One short paragraph that sums up the release.',
    '',
  ].join('\n');
}

function _readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

function _extOf(dataUrl) {
  const m = /^data:image\/([\w+.-]+);/i.exec(dataUrl);
  if (!m) return 'png';
  const e = m[1].toLowerCase();
  return e === 'jpeg' ? 'jpg' : e;
}

function _folderNoteText() {
  const id = 'v' + (_draft && Number.isInteger(_draft.num) ? _draft.num : '?');
  const where = _target ? _target : '.Versions';
  let t = 'Saves ' + id + '/README.md, ' + id + '/UI-Preview.md and assets/' + id + '/ in ' + where;
  if (_targetIsUser) t += ' (the app folder is read-only, so your user data folder is used).';
  return t;
}

function _renderDraftImages() {
  if (!_modal) return;
  const list = _modal.querySelector('#hdImgList');
  if (!_draft.images.length) {
    list.innerHTML = '<div class="hd-imgempty">No screenshots yet. Add images to show them in the UI Preview tab.</div>';
    return;
  }
  list.innerHTML = _draft.images.map((img, i) =>
    '<div class="hd-imgrow">' +
      '<div class="hd-imgrow-thumb"><img src="' + _esc(img.dataUrl) + '" alt=""></div>' +
      '<div class="hd-imgrow-body">' +
        '<input type="text" class="hd-input" data-cap="' + i + '" value="' + _esc(img.caption) + '" placeholder="Caption, e.g. Repo Console feature tool">' +
        '<textarea class="hd-input hd-input--area" data-desc="' + i + '" rows="3" maxlength="600" placeholder="Description: what this screenshot shows or what changed">' + _esc(img.description || '') + '</textarea>' +
        '<div class="hd-imgrow-file">1.' + (i + 1) + '.' + _esc(_extOf(img.dataUrl)) + ' - ' + _esc(img.name) + '</div>' +
      '</div>' +
      '<div class="hd-imgrow-actions">' +
        '<button type="button" class="hd-icon-btn" data-img-act="up" data-idx="' + i + '" title="Move up"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
        '<button type="button" class="hd-icon-btn" data-img-act="down" data-idx="' + i + '" title="Move down"' + (i === _draft.images.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
        '<button type="button" class="hd-icon-btn hd-icon-btn--danger" data-img-act="del" data-idx="' + i + '" title="Remove">&times;</button>' +
      '</div>' +
    '</div>'
  ).join('');
  list.querySelectorAll('textarea[data-desc]').forEach((ta) => {
    ta.addEventListener('input', () => {
      const idx = Number(ta.getAttribute('data-desc'));
      if (_draft && _draft.images[idx]) _draft.images[idx].description = ta.value;
    });
  });
}

function _setModalError(msg) {
  if (!_modal) return;
  const el = _modal.querySelector('#hdModalErr');
  if (el) el.textContent = msg || '';
}

async function _addImages(fileList) {
  const files = Array.from(fileList || []);
  const problems = [];
  for (const f of files) {
    if (ALLOWED_IMG.indexOf(f.type) === -1) {
      problems.push(f.name + ' is not a PNG, JPG, GIF or WebP image.');
      continue;
    }
    if (f.size > MAX_IMG_BYTES) {
      problems.push(f.name + ' is larger than 20 MB.');
      continue;
    }
    try {
      const dataUrl = await _readFileAsDataUrl(f);
      if (!_draft) return;
      _draft.images.push({
        name: f.name,
        dataUrl,
        caption: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(),
        description: '',
      });
    } catch (_) {
      problems.push('Could not read ' + f.name + '.');
    }
  }
  _renderDraftImages();
  _setModalError(problems.join(' '));
}

function _applyTemplateIfClean() {
  if (!_modal || _draft.dirty) return;
  _draft.readme = _readmeTemplate(_draft.label, _draft.title);
  _modal.querySelector('#hdReadme').value = _draft.readme;
}

function _openCreate() {
  if (_modal) return;
  const next = _versions.reduce((m, v) => Math.max(m, v.num), 0) + 1;
  _draft = {
    num: next,
    label: next + '.0.0',
    labelDirty: false,
    title: '',
    readme: '',
    dirty: false,
    images: [],
  };
  _draft.readme = _readmeTemplate(_draft.label, _draft.title);

  const modal = document.createElement('div');
  modal.className = 'hd-modal';
  modal.innerHTML =
    '<div class="hd-modal-box" role="dialog" aria-modal="true">' +
      '<div class="hd-modal-head"><h3>Create new version</h3>' +
        '<button type="button" class="hd-btn-close" data-m="close" title="Close" aria-label="Close">' + ICON_CLOSE + '</button></div>' +
      '<div class="hd-modal-body">' +
        '<div class="hd-fields">' +
          '<label class="hd-field"><span>Version number</span><input id="hdNum" class="hd-input" type="number" min="1" max="999" value="' + _esc(_draft.num) + '"></label>' +
          '<label class="hd-field"><span>Release label</span><input id="hdLabel" class="hd-input" type="text" value="' + _esc(_draft.label) + '" placeholder="20.0.0"></label>' +
          '<label class="hd-field hd-field--wide"><span>Title</span><input id="hdTitleIn" class="hd-input" type="text" value="" placeholder="Short headline for this release"></label>' +
        '</div>' +
        '<div class="hd-folder-note" id="hdFolderNote"></div>' +
        '<div class="hd-sec-head"><h4>README.md</h4><button type="button" class="hd-btn" data-m="reset">Reset template</button></div>' +
        '<textarea id="hdReadme" class="hd-textarea" spellcheck="false"></textarea>' +
        '<div class="hd-sec-head"><h4>UI-Preview.md</h4><button type="button" class="hd-btn" data-m="addimg">+ Add images</button></div>' +
        '<p class="hd-hint">Each image gets a caption and is saved as 1.1, 1.2 and so on inside assets for this version.</p>' +
        '<div id="hdImgList"></div>' +
        '<input type="file" id="hdImgInput" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden>' +
      '</div>' +
      '<div class="hd-modal-foot">' +
        '<span class="hd-modal-err" id="hdModalErr"></span>' +
        '<button type="button" class="hd-btn" data-m="close">Cancel</button>' +
        '<button type="button" class="hd-btn-primary" id="hdCreateBtn" data-m="create">Create version</button>' +
      '</div>' +
    '</div>';

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      _closeCreate();
      return;
    }
    const imgBtn = e.target.closest('[data-img-act]');
    if (imgBtn) {
      const i = Number(imgBtn.getAttribute('data-idx'));
      const act = imgBtn.getAttribute('data-img-act');
      const arr = _draft.images;
      if (act === 'del') arr.splice(i, 1);
      if (act === 'up' && i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
      if (act === 'down' && i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]);
      _renderDraftImages();
      return;
    }
    const btn = e.target.closest('[data-m]');
    if (!btn) return;
    const act = btn.getAttribute('data-m');
    if (act === 'close') _closeCreate();
    else if (act === 'reset') {
      _draft.dirty = false;
      _applyTemplateIfClean();
    } else if (act === 'addimg') modal.querySelector('#hdImgInput').click();
    else if (act === 'create') _submitCreate();
  });

  modal.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'hdNum') {
      const n = Number(t.value);
      _draft.num = Number.isInteger(n) ? n : NaN;
      if (!_draft.labelDirty && Number.isInteger(n) && n > 0) {
        _draft.label = n + '.0.0';
        modal.querySelector('#hdLabel').value = _draft.label;
        _applyTemplateIfClean();
      }
      modal.querySelector('#hdFolderNote').textContent = _folderNoteText();
    } else if (t.id === 'hdLabel') {
      _draft.label = t.value;
      _draft.labelDirty = true;
      _applyTemplateIfClean();
    } else if (t.id === 'hdTitleIn') {
      _draft.title = t.value;
      _applyTemplateIfClean();
    } else if (t.id === 'hdReadme') {
      _draft.readme = t.value;
      _draft.dirty = true;
    } else if (t.hasAttribute && t.hasAttribute('data-cap')) {
      const i = Number(t.getAttribute('data-cap'));
      if (_draft.images[i]) _draft.images[i].caption = t.value;
    }
  });

  modal.addEventListener('change', (e) => {
    if (e.target.id === 'hdImgInput') {
      const files = e.target.files;
      _addImages(files).then(() => { e.target.value = ''; });
    }
  });

  document.body.appendChild(modal);
  _modal = modal;
  modal.querySelector('#hdReadme').value = _draft.readme;
  modal.querySelector('#hdFolderNote').textContent = _folderNoteText();
  _renderDraftImages();
}

function _closeCreate() {
  if (!_modal) return;
  _modal.remove();
  _modal = null;
  _draft = null;
}

async function _submitCreate() {
  if (!_modal || !_draft) return;
  const d = _draft;
  const btn = _modal.querySelector('#hdCreateBtn');
  _setModalError('');

  if (!Number.isInteger(d.num) || d.num < 1 || d.num > 999) {
    _setModalError('Version number must be a whole number from 1 to 999.');
    return;
  }
  if (_versions.some((v) => v.num === d.num)) {
    _setModalError('v' + d.num + ' already exists. Pick another number.');
    return;
  }
  if (!d.readme.trim()) {
    _setModalError('README cannot be empty.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating...';
  try {
    const api = window.versionsEditAPI;
    if (!api) throw new Error('Creating versions needs an app restart.');
    const res = await api.create({
      num: d.num,
      label: d.label.trim() || d.num + '.0.0',
      title: d.title.trim(),
      readme: d.readme,
      images: d.images.map((i) => ({ caption: i.caption, description: i.description || '', dataUrl: i.dataUrl })),
    });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not create the version.');
    const newId = VER_PREFIX + res.id;
    _closeCreate();
    _mdCache.clear();
    _versionsState = 'idle';
    await _loadVersions(true);
    _select(newId);
  } catch (err) {
    if (!_modal) return;
    btn.disabled = false;
    btn.textContent = 'Create version';
    _setModalError(err && err.message ? err.message : String(err));
  }
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
          '<button type="button" class="hd-btn-close" id="hdCloseBtn" title="Close" aria-label="Close">' + ICON_CLOSE + '</button>' +
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
    const img = e.target.closest('.hd-md-img.loaded');
    if (img && _panel.contains(img)) {
      _openLightbox(img.src, img.alt);
      return;
    }
    const link = e.target.closest('a[data-ext]');
    if (link && _panel.contains(link)) {
      e.preventDefault();
      const url = link.getAttribute('href');
      if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(url);
      return;
    }
    const actBtn = e.target.closest('[data-act]');
    if (actBtn && _panel.contains(actBtn)) {
      const act = actBtn.getAttribute('data-act');
      if (act === 'create') _openCreate();
      else if (act === 'list') _select(LIST_ID);
      return;
    }
    const tab = e.target.closest('[data-tab]');
    if (tab && _panel.contains(tab)) {
      _verTab = tab.getAttribute('data-tab');
      _renderPage();
      return;
    }
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
  if (e.key !== 'Escape') return;
  if (_lightbox) {
    _closeLightbox();
    return;
  }
  if (_modal) {
    _closeCreate();
    return;
  }
  if (isOpen()) close();
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
  if (_versionsState !== 'ready') _loadVersions(false);
}

export function close() {
  _closeLightbox();
  _closeCreate();
  if (!_panel) return;
  _panel.classList.remove('open');
}