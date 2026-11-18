export const ICON = {
  db: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="10" cy="4.5" rx="6.5" ry="2.5"/><path d="M3.5 4.5v11c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-11"/><path d="M3.5 10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5"/></svg>',
  json: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3C5 3 5 4.5 5 6s0 3-2 4c2 1 2 2.5 2 4s0 3 2 3"/><path d="M13 3c2 0 2 1.5 2 3s0 3 2 4c-2 1-2 2.5-2 4s0 3-2 3"/></svg>',
  folder: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H9L7 4H4a2 2 0 0 0-2 2z"/></svg>',
  browser: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M2.5 7.5h15"/><circle cx="5" cy="5.5" r="0.5"/></svg>',
  memory: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="10" height="10" rx="1.5"/><path d="M8 2v3M12 2v3M8 15v3M12 15v3M2 8h3M2 12h3M15 8h3M15 12h3"/></svg>',
  file: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h8l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M12 3v4h4"/></svg>',
};

const KEY_TOOLS = [
  [/^helpertool-settings$/, 'Settings'],
  [/^helpertool-shortcuts$/, 'Shortcuts / CLI Tool'],
  [/^helpertool-select-shortcuts$/, 'Select Shortcuts'],
  [/^helpertool-viewmode$/, 'File tree view mode'],
  [/^dbi_/, 'DB Inspector'],
];

const KEY_GUESS = [
  [/secret/i, 'Secret Holder'],
  [/note/i, 'Notes'],
  [/canvas/i, 'Canvas Tool'],
  [/swamp|opencode/i, 'Code Swamp'],
  [/deploy/i, 'Deploy Tool'],
  [/prompt/i, 'Prompt Tool'],
  [/workspace/i, 'Workspace'],
  [/profile/i, 'Profile Tool'],
  [/docker/i, 'Docker'],
  [/graph/i, 'Graphify / Codebase Map'],
  [/researcher/i, 'Researcher'],
  [/harness/i, 'Harness Tool'],
  [/git/i, 'Git Tool'],
  [/ide/i, 'IDE Mode'],
  [/theme|setting/i, 'Settings'],
  [/shortcut/i, 'Shortcuts'],
];

const SECRET_KEY = /secret|token|password|passwd|api[_-]?key/i;
const MASK_TEXT = '\u2022\u2022\u2022\u2022\u2022\u2022 (hidden)';

export function keyTool(key) {
  for (const entry of KEY_TOOLS) {
    if (entry[0].test(key)) return { tool: entry[1], guess: false };
  }
  for (const entry of KEY_GUESS) {
    if (entry[0].test(key)) return { tool: entry[1] + ' (guess)', guess: true };
  }
  return { tool: '', guess: false };
}

export function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmtBytes(n) {
  if (n === null || n === undefined) return '-';
  if (n < 1024) return n + ' B';
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return v.toFixed(v >= 100 ? 0 : 1) + ' ' + units[i];
}

export function fmtTime(ms) {
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
}

export function chipsHtml(tools, sensitive, all) {
  const list = Array.isArray(tools) ? tools : [];
  const shown = all ? list : list.slice(0, 3);
  let html = shown.map((t) => '<span class="si-chip">' + esc(t) + '</span>').join('');
  if (!all && list.length > shown.length) {
    html += '<span class="si-chip si-chip-more">+' + (list.length - shown.length) + '</span>';
  }
  if (sensitive) html += '<span class="si-chip si-chip-warn">sensitive</span>';
  return html ? '<span class="si-chips">' + html + '</span>' : '';
}

export function renderMessage(host, title, text, isError) {
  host.innerHTML = '<div class="si-message' + (isError ? ' si-message-error' : '') + '"><div class="si-message-title">' + esc(title) + '</div><div class="si-message-text">' + esc(text || '') + '</div></div>';
}

export function renderInfoView(host, src) {
  const rows = [
    ['What it is', src.label || src.name],
    ['Source file', src.name],
    ['Used by', (src.tools || []).join(', ') || '-'],
  ];
  host.innerHTML = '<div class="si-info"><div class="si-info-badge">Memory only - nothing is saved to disk</div>' +
    rows.map((r) => '<div class="si-info-row"><span class="si-info-k">' + esc(r[0]) + '</span><span class="si-info-v">' + esc(r[1]) + '</span></div>').join('') +
    '<p class="si-info-note">' + esc(src.note || '') + '</p></div>';
}

export function renderTextView(host, text, truncated, size) {
  host.innerHTML = '<div class="si-toolbar"><button type="button" class="si-btn" data-act="copy">Copy</button>' +
    (truncated ? '<span class="si-muted">Showing the first part of a ' + esc(fmtBytes(size)) + ' file</span>' : '') +
    '</div><pre class="si-pre"></pre>';
  host.querySelector('.si-pre').textContent = text;
  host.querySelector('[data-act="copy"]').addEventListener('click', () => {
    navigator.clipboard.writeText(text).catch(() => {});
  });
}

function keyHtml(key) {
  if (key === null) return '';
  return '<span class="si-key">' + esc(key) + '</span><span class="si-colon">: </span>';
}

function valueHtml(val) {
  if (val === null) return '<span class="si-null-v">null</span>';
  if (typeof val === 'string') {
    const cut = val.length > 300 ? val.slice(0, 300) + '...' : val;
    return '<span class="si-str">&quot;' + esc(cut) + '&quot;</span>' + (val.length > 300 ? '<span class="si-more-hint"> (' + val.length + ' chars, click to expand)</span>' : '');
  }
  if (typeof val === 'number') return '<span class="si-num-v">' + esc(val) + '</span>';
  if (typeof val === 'boolean') return '<span class="si-bool">' + esc(val) + '</span>';
  return '<span>' + esc(val) + '</span>';
}

function fillKids(kids, entries, from) {
  const end = Math.min(entries.length, from + 200);
  for (let i = from; i < end; i++) {
    kids.appendChild(makeNode(entries[i][0], entries[i][1], false));
  }
  if (end < entries.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'si-btn si-more-btn';
    more.textContent = 'Show ' + (entries.length - end) + ' more';
    more.addEventListener('click', () => {
      more.remove();
      fillKids(kids, entries, end);
    });
    kids.appendChild(more);
  }
}

function makeNode(key, val, open) {
  const wrap = document.createElement('div');
  wrap.className = 'si-node';
  const row = document.createElement('div');
  row.className = 'si-row';
  const isObj = val !== null && typeof val === 'object';
  if (!isObj) {
    row.innerHTML = keyHtml(key) + valueHtml(val);
    if (typeof val === 'string' && val.length > 300) {
      row.classList.add('si-row-long');
      row.addEventListener('click', () => {
        row.classList.remove('si-row-long');
        row.innerHTML = keyHtml(key) + '<span class="si-str si-str-full"></span>';
        row.querySelector('.si-str-full').textContent = '"' + val + '"';
      });
    }
    wrap.appendChild(row);
    return wrap;
  }
  const isArr = Array.isArray(val);
  const entries = isArr ? val.map((v, i) => [i, v]) : Object.keys(val).map((k) => [k, val[k]]);
  row.classList.add('si-row-branch');
  row.innerHTML = '<span class="si-caret">&#9656;</span>' + keyHtml(key) + '<span class="si-meta">' + (isArr ? 'Array(' + entries.length + ')' : 'Object{' + entries.length + '}') + '</span>';
  const kids = document.createElement('div');
  kids.className = 'si-kids';
  kids.hidden = true;
  let built = false;
  const toggle = (force) => {
    const show = typeof force === 'boolean' ? force : kids.hidden;
    if (show && !built) {
      built = true;
      fillKids(kids, entries, 0);
    }
    kids.hidden = !show;
    row.classList.toggle('si-open', show);
  };
  row.addEventListener('click', () => toggle());
  wrap.appendChild(row);
  wrap.appendChild(kids);
  if (open && entries.length) toggle(true);
  return wrap;
}

export function renderJsonView(host, json, opts) {
  const masked = !!(opts && opts.masked);
  host.innerHTML = '<div class="si-toolbar"><button type="button" class="si-btn si-btn-on" data-mode="tree">Tree</button><button type="button" class="si-btn" data-mode="raw">Raw</button><button type="button" class="si-btn" data-act="copy">Copy</button>' +
    (masked ? '<span class="si-chip si-chip-warn">some values hidden</span>' : '') +
    '</div><div class="si-json"></div>';
  const body = host.querySelector('.si-json');
  const treeBtn = host.querySelector('[data-mode="tree"]');
  const rawBtn = host.querySelector('[data-mode="raw"]');
  let rawText = null;
  const getRaw = () => {
    if (rawText === null) rawText = JSON.stringify(json, null, 2);
    return rawText;
  };
  const showTree = () => {
    treeBtn.classList.add('si-btn-on');
    rawBtn.classList.remove('si-btn-on');
    body.innerHTML = '';
    body.appendChild(makeNode(null, json, true));
  };
  const showRaw = () => {
    rawBtn.classList.add('si-btn-on');
    treeBtn.classList.remove('si-btn-on');
    const text = getRaw();
    const pre = document.createElement('pre');
    pre.className = 'si-pre';
    pre.textContent = text.length > 400000 ? text.slice(0, 400000) + '\n...[display cut, use Copy for the full text]' : text;
    body.innerHTML = '';
    body.appendChild(pre);
  };
  treeBtn.addEventListener('click', showTree);
  rawBtn.addEventListener('click', showRaw);
  host.querySelector('[data-act="copy"]').addEventListener('click', () => {
    navigator.clipboard.writeText(getRaw()).catch(() => {});
  });
  showTree();
}

function prettyValue(v) {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v);
  if (/^\s*[\[{]/.test(s)) {
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch (_) {
      return s;
    }
  }
  return s;
}

export async function renderDbView(host, ctx) {
  const api = window.storageInspectorAPI;
  host.innerHTML = '<div class="si-loading">Opening database...</div>';
  const res = await api.dbTables({ path: ctx.path, flush: true });
  if (!res || !res.success) {
    renderMessage(host, 'Cannot open this database', res && res.error, true);
    return;
  }
  const tables = res.tables || [];
  if (!tables.length) {
    renderMessage(host, 'Empty database', 'No tables were found in this file.');
    return;
  }
  host.innerHTML = '<div class="si-db"><div class="si-db-tables"></div><div class="si-db-data"></div></div>';
  const listEl = host.querySelector('.si-db-tables');
  const dataEl = host.querySelector('.si-db-data');
  const st = { table: null, offset: 0, search: '', limit: 50, rows: [], columns: [] };
  let gridEl = null;
  let detailEl = null;
  let infoEl = null;
  let prevBtn = null;
  let nextBtn = null;
  let timer = null;

  listEl.innerHTML = tables.map((t) => '<button type="button" class="si-tbl" data-name="' + esc(t.name) + '"><span class="si-tbl-top"><span class="si-tbl-name">' + esc(t.name) + '</span><span class="si-tbl-count">' + (t.count === null ? 'err' : esc(t.count)) + '</span></span>' + (t.tool ? '<span class="si-tbl-tool">' + esc(t.tool) + '</span>' : '') + '</button>').join('');

  async function load() {
    gridEl.innerHTML = '<div class="si-loading">Reading rows...</div>';
    const r = await api.dbRows({ path: ctx.path, table: st.table, limit: st.limit, offset: st.offset, search: st.search, reveal: ctx.reveal });
    if (!r || !r.success) {
      gridEl.innerHTML = '<div class="si-error">' + esc(r && r.error) + '</div>';
      return;
    }
    st.rows = r.rows;
    st.columns = r.columns;
    const from = r.total ? st.offset + 1 : 0;
    const to = st.offset + r.rows.length;
    infoEl.textContent = from + '-' + to + ' of ' + r.total + ' rows';
    prevBtn.disabled = st.offset <= 0;
    nextBtn.disabled = to >= r.total;
    detailEl.hidden = true;
    if (!r.rows.length) {
      gridEl.innerHTML = '<div class="si-empty">No rows' + (st.search ? ' match this search' : '') + '.</div>';
      return;
    }
    const head = '<tr><th class="si-rn">#</th>' + r.columns.map((c) => '<th>' + esc(c) + (r.maskedColumns.indexOf(c) !== -1 ? ' <span class="si-lock" title="Hidden. Turn on Show hidden secrets.">&#128274;</span>' : '') + '</th>').join('') + '</tr>';
    const body = r.rows.map((row, i) => '<tr><td class="si-rn">' + (st.offset + i + 1) + '</td>' + row.map((v, c) => {
      if (v === null) return '<td class="si-null" data-r="' + i + '" data-c="' + c + '">NULL</td>';
      const cls = typeof v === 'number' ? ' class="si-num"' : '';
      return '<td' + cls + ' data-r="' + i + '" data-c="' + c + '">' + esc(String(v).slice(0, 200)) + '</td>';
    }).join('') + '</tr>').join('');
    gridEl.innerHTML = '<table class="si-grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  function buildShell() {
    dataEl.innerHTML = '<div class="si-db-bar"><span class="si-db-name"></span><input class="si-search si-search-sm" type="text" placeholder="Search in this table..." /><span class="si-spacer"></span><span class="si-muted si-db-info"></span><button type="button" class="si-btn" data-act="prev">Prev</button><button type="button" class="si-btn" data-act="next">Next</button></div><div class="si-grid-wrap"></div><div class="si-cell-detail" hidden></div>';
    dataEl.querySelector('.si-db-name').textContent = st.table;
    gridEl = dataEl.querySelector('.si-grid-wrap');
    detailEl = dataEl.querySelector('.si-cell-detail');
    infoEl = dataEl.querySelector('.si-db-info');
    prevBtn = dataEl.querySelector('[data-act="prev"]');
    nextBtn = dataEl.querySelector('[data-act="next"]');
    prevBtn.addEventListener('click', () => {
      st.offset = Math.max(0, st.offset - st.limit);
      load();
    });
    nextBtn.addEventListener('click', () => {
      st.offset += st.limit;
      load();
    });
    dataEl.querySelector('.si-search').addEventListener('input', (e) => {
      clearTimeout(timer);
      const value = e.target.value;
      timer = setTimeout(() => {
        st.search = value;
        st.offset = 0;
        load();
      }, 300);
    });
    gridEl.addEventListener('click', (e) => {
      const td = e.target.closest('td[data-r]');
      if (!td) return;
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      const value = st.rows[r] ? st.rows[r][c] : null;
      const text = prettyValue(value);
      detailEl.hidden = false;
      detailEl.innerHTML = '<div class="si-cell-head"><span></span><button type="button" class="si-btn" data-act="copy">Copy</button><button type="button" class="si-btn" data-act="hide">Close</button></div><pre class="si-pre"></pre>';
      detailEl.querySelector('span').textContent = st.table + '.' + st.columns[c] + ' (row ' + (st.offset + r + 1) + ')';
      detailEl.querySelector('pre').textContent = text;
      detailEl.querySelector('[data-act="copy"]').addEventListener('click', () => {
        navigator.clipboard.writeText(text).catch(() => {});
      });
      detailEl.querySelector('[data-act="hide"]').addEventListener('click', () => {
        detailEl.hidden = true;
      });
    });
  }

  async function selectTable(name) {
    st.table = name;
    st.offset = 0;
    st.search = '';
    listEl.querySelectorAll('.si-tbl').forEach((b) => b.classList.toggle('active', b.dataset.name === name));
    buildShell();
    await load();
  }

  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('.si-tbl');
    if (b) selectTable(b.dataset.name);
  });

  const firstFilled = tables.find((t) => t.count > 0) || tables[0];
  await selectTable(firstFilled.name);
}

export function renderDirView(host, listing, hooks) {
  const items = listing.items || [];
  if (!items.length) {
    renderMessage(host, 'Empty folder', 'There is nothing in this folder.');
    return;
  }
  host.innerHTML = '<table class="si-grid si-dir"><thead><tr><th></th><th>Name</th><th>What it is</th><th>Size</th><th>Modified</th></tr></thead><tbody>' +
    items.map((it, i) => '<tr class="si-dir-row" data-i="' + i + '"><td class="si-dir-ico">' + (it.isDir ? ICON.folder : it.kind === 'sqlite' ? ICON.db : it.kind === 'json' ? ICON.json : ICON.file) + '</td><td>' + esc(it.name) + '</td><td>' + (it.internal ? '<span class="si-chip">internal</span>' : esc(it.label || '')) + '</td><td>' + (it.size === null ? '' : esc(fmtBytes(it.size))) + '</td><td>' + esc(fmtTime(it.mtime)) + '</td></tr>').join('') +
    '</tbody></table>' + (listing.truncated ? '<div class="si-muted si-pad">Showing the first ' + items.length + ' of ' + listing.total + ' entries.</div>' : '');
  host.querySelector('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('.si-dir-row');
    if (!tr) return;
    hooks.onOpen(items[Number(tr.dataset.i)]);
  });
}

export function renderStorageView(host, store, opts) {
  const reveal = !!(opts && opts.reveal);
  const rows = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      const v = store.getItem(k) || '';
      const t = keyTool(k);
      rows.push({ k: k, v: v, size: k.length + v.length, tool: t.tool, secret: SECRET_KEY.test(k) });
    }
  } catch (err) {
    renderMessage(host, 'Storage is not available', err.message, true);
    return;
  }
  rows.sort((a, b) => a.k.localeCompare(b.k));
  if (!rows.length) {
    renderMessage(host, 'Nothing stored', 'There are no keys here.');
    return;
  }
  host.innerHTML = '<table class="si-grid si-ls"><thead><tr><th>Key</th><th>Used by</th><th>Size</th><th>Value</th></tr></thead><tbody>' +
    rows.map((r, i) => {
      const shown = r.secret && !reveal ? MASK_TEXT : r.v.slice(0, 140);
      return '<tr class="si-ls-row" data-i="' + i + '"><td>' + esc(r.k) + '</td><td>' + (r.tool ? '<span class="si-chip">' + esc(r.tool) + '</span>' : '<span class="si-muted">unlabeled</span>') + '</td><td>' + esc(fmtBytes(r.size)) + '</td><td class="si-ls-val">' + esc(shown) + '</td></tr>';
    }).join('') + '</tbody></table>';
  host.querySelector('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('.si-ls-row');
    if (!tr) return;
    const next = tr.nextElementSibling;
    if (next && next.classList.contains('si-ls-detail')) {
      next.remove();
      return;
    }
    const r = rows[Number(tr.dataset.i)];
    const detail = document.createElement('tr');
    detail.className = 'si-ls-detail';
    const cell = document.createElement('td');
    cell.colSpan = 4;
    const pre = document.createElement('pre');
    pre.className = 'si-pre';
    pre.textContent = r.secret && !reveal ? MASK_TEXT : prettyValue(r.v);
    cell.appendChild(pre);
    detail.appendChild(cell);
    tr.after(detail);
  });
}