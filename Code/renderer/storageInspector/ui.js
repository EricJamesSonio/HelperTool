import { ICON, esc, fmtBytes, fmtTime, chipsHtml, keyTool, renderJsonView, renderDbView, renderTextView, renderDirView, renderStorageView, renderInfoView, renderMessage } from './viewers.js';

const G_BROWSER = 'Browser storage';
const G_MEMORY = 'In-memory only (not saved)';

const GROUPS = [
  'SQLite databases',
  'Credentials & sessions',
  'JSON & config files',
  'Folders, caches & media',
  G_BROWSER,
  G_MEMORY,
  'Everything else in the app data folder',
];

function browserSource(id, name, store) {
  let count = 0;
  let size = 0;
  const tools = [];
  try {
    count = store.length;
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      size += k.length + (store.getItem(k) || '').length;
      const t = keyTool(k).tool;
      if (t && tools.indexOf(t) === -1) tools.push(t);
    }
  } catch (_) {
    count = 0;
  }
  return {
    id: id,
    name: name,
    label: name + ' (live, this window)',
    group: G_BROWSER,
    kind: 'storage',
    storage: name === 'localStorage' ? 'local' : 'session',
    exists: true,
    count: count,
    size: size,
    tools: tools,
    note: 'Read straight from the app window. Keys marked (guess) are matched by name only. Keys with no tool are not recognised yet.',
  };
}

function iconKey(s) {
  if (s.kind === 'sqlite') return 'db';
  if (s.kind === 'json') return 'json';
  if (s.kind === 'dir' || s.isDir) return 'folder';
  if (s.kind === 'storage') return 'browser';
  if (s.kind === 'memory') return 'memory';
  return 'file';
}

export function mountStorageInspector(root, opts) {
  const api = () => window.storageInspectorAPI;
  root.innerHTML = '<div class="si-header"><div class="si-title">' + ICON.db + '<span>Storage Inspector</span></div>' +
    '<input id="siFilter" class="si-search" type="text" placeholder="Filter by name, tool or path..." />' +
    '<label class="si-toggle" title="Reveal passwords, tokens and secret values"><input id="siReveal" type="checkbox" /><span>Show hidden secrets</span></label>' +
    '<button id="siRefresh" class="si-btn" type="button">Refresh</button>' +
    '<button id="siClose" class="si-btn si-btn-icon" type="button" title="Close">&times;</button></div>' +
    '<div class="si-body"><aside class="si-side" id="siSide"></aside>' +
    '<section class="si-main"><div class="si-head" id="siHead"></div><div class="si-nav" id="siNav"></div><div class="si-view" id="siView"></div></section></div>';

  const $ = (id) => root.querySelector('#' + id);
  const S = { sources: [], byId: new Map(), current: null, target: null, stack: [], filter: '', reveal: false, userData: '' };

  function freshHost() {
    const view = $('siView');
    view.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'si-host';
    view.appendChild(h);
    return h;
  }

  function itemHtml(s) {
    const cls = 'si-item' + (S.current && S.current.id === s.id ? ' active' : '') + (s.exists === false ? ' missing' : '');
    let meta = '';
    if (s.exists === false) meta = 'not created';
    else if (s.kind === 'memory') meta = 'memory';
    else if (s.kind === 'storage') meta = s.count + ' keys';
    else meta = fmtBytes(s.size) + (s.truncatedScan ? '+' : '');
    return '<button type="button" class="' + cls + '" data-id="' + esc(s.id) + '"><span class="si-ico">' + ICON[iconKey(s)] + '</span><span class="si-item-main"><span class="si-item-name">' + esc(s.label || s.name) + '</span><span class="si-item-sub">' + esc(s.name) + '</span>' + chipsHtml(s.tools, s.sensitive, false) + '</span><span class="si-item-meta">' + esc(meta) + '</span></button>';
  }

  function matches(s, q) {
    if (!q) return true;
    const hay = [s.label, s.name, s.rel, (s.tools || []).join(' '), s.note].join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function renderSide() {
    const q = S.filter.trim().toLowerCase();
    const onDisk = S.sources.filter((s) => s.abs && s.exists !== false);
    const total = onDisk.reduce((sum, s) => sum + (s.size || 0), 0);
    let html = '<div class="si-summary"><div><strong>' + onDisk.length + '</strong> places on disk, about <strong>' + esc(fmtBytes(total)) + '</strong></div><div class="si-summary-path" title="' + esc(S.userData) + '">' + esc(S.userData) + '</div></div>';
    for (const g of GROUPS) {
      const list = S.sources.filter((s) => s.group === g && matches(s, q));
      if (!list.length) continue;
      html += '<div class="si-group"><div class="si-group-title">' + esc(g) + ' <span class="si-muted">' + list.length + '</span></div>' + list.map(itemHtml).join('') + '</div>';
    }
    $('siSide').innerHTML = html;
  }

  function renderHead(src) {
    let loc = 'In memory';
    if (src.abs) loc = src.abs;
    else if (src.kind === 'storage') loc = 'Inside the app window (' + src.name + ')';
    const bits = [];
    if (src.kind !== 'memory' && src.kind !== 'storage' && src.exists !== false) {
      bits.push(fmtBytes(src.size) + (src.truncatedScan ? '+' : ''));
      if (src.isDir && src.files) bits.push(src.files + (src.truncatedScan ? '+' : '') + ' files');
      bits.push('modified ' + fmtTime(src.mtime));
    }
    $('siHead').innerHTML = '<div class="si-head-top"><div class="si-head-text"><div class="si-head-title">' + esc(src.label || src.name) + '</div><div class="si-head-path">' + esc(loc) + '</div></div>' + (src.abs && src.exists !== false ? '<button id="siShow" class="si-btn" type="button">Show in folder</button>' : '') + '</div>' +
      '<div class="si-head-chips">' + chipsHtml(src.tools, src.sensitive, true) + '</div>' +
      (bits.length ? '<div class="si-head-meta">' + esc(bits.join('  -  ')) + '</div>' : '') +
      (src.note ? '<div class="si-note">' + esc(src.note) + '</div>' : '');
    const show = $('siShow');
    if (show) {
      show.addEventListener('click', () => {
        api().showInFolder({ path: S.target ? S.target.abs : src.abs });
      });
    }
  }

  function renderNav() {
    const nav = $('siNav');
    if (!S.target) {
      nav.innerHTML = '';
      return;
    }
    nav.innerHTML = (S.stack.length ? '<button id="siBack" class="si-btn" type="button">&#8592; Back</button>' : '') + '<span class="si-nav-path">' + esc(S.target.abs) + '</span>';
    const back = $('siBack');
    if (back) {
      back.addEventListener('click', () => {
        const t = S.stack.pop();
        if (t) go(t, false);
      });
    }
  }

  async function go(target, push) {
    if (push && S.target) S.stack.push(S.target);
    S.target = target;
    renderNav();
    const host = freshHost();
    host.innerHTML = '<div class="si-loading">Loading...</div>';
    try {
      if (target.type === 'dir') {
        const res = await api().listDir({ path: target.abs });
        if (!res || !res.success) {
          renderMessage(host, 'Cannot open this folder', res && res.error, true);
          return;
        }
        renderDirView(host, res, {
          onOpen: (item) => go({ type: item.isDir ? 'dir' : 'file', abs: item.abs }, true),
        });
        return;
      }
      const res = await api().readFile({ path: target.abs, reveal: S.reveal });
      if (!res || !res.success) {
        renderMessage(host, 'Cannot read this file', res && res.error, true);
        return;
      }
      if (res.type === 'sqlite') await renderDbView(host, { path: target.abs, reveal: S.reveal });
      else if (res.type === 'json') renderJsonView(host, res.json, { masked: res.masked });
      else if (res.type === 'text') renderTextView(host, res.text, res.truncated, res.size);
      else if (res.type === 'image') host.innerHTML = '<div class="si-image"><img alt="" src="' + res.dataUrl + '" /></div>';
      else if (res.type === 'internal') renderMessage(host, 'Browser engine data', 'This belongs to the embedded Chromium engine (cookies, caches, site storage). It is not a readable file format, so it is shown by size only.');
      else if (res.type === 'binary') renderMessage(host, 'Binary file', 'This file is binary or too large to preview (' + fmtBytes(res.size) + '). Use Show in folder to open it.');
      else renderMessage(host, 'Unsupported', 'Nothing to preview for this item.');
    } catch (err) {
      renderMessage(host, 'Something went wrong', err && err.message, true);
    }
  }

  function select(src) {
    S.current = src;
    S.stack = [];
    S.target = null;
    renderSide();
    renderHead(src);
    renderNav();
    const host = freshHost();
    if (src.kind === 'memory') {
      renderInfoView(host, src);
      return;
    }
    if (src.kind === 'storage') {
      renderStorageView(host, src.storage === 'local' ? window.localStorage : window.sessionStorage, { reveal: S.reveal });
      return;
    }
    if (src.exists === false) {
      renderMessage(host, 'Not created yet', 'This file or folder is not on disk yet. The tool that owns it has not saved anything.');
      return;
    }
    go({ type: src.isDir || src.kind === 'dir' ? 'dir' : 'file', abs: src.abs }, false);
  }

  function showWelcome() {
    $('siHead').innerHTML = '<div class="si-head-title">Where ES Code keeps its data</div><div class="si-note">Pick a source on the left. The colored chips show which tool uses it. Secrets are hidden until you switch on Show hidden secrets. Everything here is read-only.</div>';
    $('siNav').innerHTML = '';
    freshHost().innerHTML = '';
  }

  async function refresh() {
    $('siSide').innerHTML = '<div class="si-loading">Scanning the app data folder...</div>';
    let res = null;
    try {
      res = await api().catalog();
    } catch (err) {
      res = { success: false, error: err.message };
    }
    if (!res || !res.success) {
      $('siSide').innerHTML = '<div class="si-error">' + esc(res && res.error ? res.error : 'Could not scan') + '</div>';
      return;
    }
    S.userData = res.userData;
    const memory = (res.memory || []).map((m) => Object.assign({ group: G_MEMORY, kind: 'memory', exists: true }, m));
    const browser = [browserSource('ls:local', 'localStorage', window.localStorage), browserSource('ls:session', 'sessionStorage', window.sessionStorage)];
    S.sources = [].concat(res.sources, browser, memory, res.others);
    S.byId = new Map(S.sources.map((s) => [s.id, s]));
    if (S.current && S.byId.has(S.current.id)) {
      select(S.byId.get(S.current.id));
    } else {
      S.current = null;
      renderSide();
      showWelcome();
    }
  }

  $('siSide').addEventListener('click', (e) => {
    const btn = e.target.closest('.si-item');
    if (!btn) return;
    const src = S.byId.get(btn.dataset.id);
    if (src) select(src);
  });

  $('siFilter').addEventListener('input', (e) => {
    S.filter = e.target.value;
    renderSide();
  });

  $('siReveal').addEventListener('change', (e) => {
    S.reveal = e.target.checked;
    if (!S.current) return;
    if (S.target) go(S.target, false);
    else select(S.current);
  });

  $('siRefresh').addEventListener('click', () => refresh());
  $('siClose').addEventListener('click', () => {
    if (opts && typeof opts.onClose === 'function') opts.onClose();
  });

  return { refresh: refresh };
}