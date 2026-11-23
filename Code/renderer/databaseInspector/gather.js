import { state } from './state.js';
import { dbiIcon, fmtCount } from './template.js';

const STYLE_ID = 'dbiGatherStyles';
const LS_FMT = 'dbi_gather_fmt';
const LS_LIMIT = 'dbi_gather_limit';
const INITIAL_ROWS = 100;
const MORE_ROWS = 500;
const MAX_CELL_CHARS = 300;
const DEFAULT_LIMIT = 1000;

const FORMATS = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'json', label: 'JSON' },
  { id: 'csv', label: 'CSV' },
  { id: 'tsv', label: 'TSV' },
];

const LIMITS = [
  { value: 100, label: '100 rows / table' },
  { value: 500, label: '500 rows / table' },
  { value: 1000, label: '1,000 rows / table' },
  { value: 5000, label: '5,000 rows / table' },
  { value: 0, label: 'All rows' },
];

const GATHER_CSS = `
.dbi-gather-overlay {
  position: fixed;
  inset: 0;
  top: var(--titlebar-h, 0px);
  z-index: 100000;
  background: rgba(7, 13, 26, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-ui);
}
.dbi-gather-modal {
  background: var(--bg-surface, #0c1427);
  border: 1px solid var(--border-default, rgba(255,255,255,0.10));
  border-radius: 14px;
  width: min(1500px, 96vw);
  height: min(920px, 92vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 32px 80px rgba(0,0,0,0.55);
  color: var(--text-primary, #eef2ff);
  font-size: 14px;
  line-height: 1.5;
}
.dbi-gather-modal button,
.dbi-gather-modal input,
.dbi-gather-modal select { font-family: inherit; }
.dbi-gather-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  background: rgba(0,0,0,0.2);
  flex-shrink: 0;
}
.dbi-gather-head-main { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.dbi-gather-head-icon { display: inline-flex; color: var(--accent, #22d3ee); }
.dbi-gather-head-icon .dbi-ico { width: 24px; height: 24px; }
.dbi-gather-title { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.dbi-gather-sub { font-size: 13px; color: var(--text-muted, #a0a8b0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dbi-gather-head-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.dbi-gather-fmt {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #a0a8b0);
}
.dbi-gather-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.dbi-gather-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 14px;
  padding: 30px;
  text-align: center;
  color: var(--text-muted, #a0a8b0);
  font-size: 15px;
}
.dbi-gather-center .dbi-ico { width: 28px; height: 28px; }
.dbi-gather-center-error { color: var(--red, #f87171); font-family: var(--font-mono); white-space: pre-wrap; max-width: 760px; }
.dbi-gather-picker { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 20px; }
.dbi-gather-picker-bar { display: flex; gap: 8px; flex-shrink: 0; }
.dbi-gather-picker-bar .dbi-input { flex: 1; }
.dbi-gather-picker-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  border-radius: 10px;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 4px;
  align-content: start;
}
.dbi-gather-picker-list .dbi-gather-center { grid-column: 1 / -1; }
.dbi-gather-pick {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
}
.dbi-gather-pick:hover { background: var(--bg-hover, rgba(255,255,255,0.06)); }
.dbi-gather-pick.is-on { background: var(--accent-dim, rgba(34,211,238,0.12)); border-color: var(--accent, #22d3ee); }
.dbi-gather-pick input { accent-color: var(--accent, #22d3ee); width: 16px; height: 16px; margin: 0; }
.dbi-gather-pick-name { flex: 1; min-width: 0; font-family: var(--font-mono); font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dbi-gather-pick-count { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted, #a0a8b0); flex-shrink: 0; }
.dbi-gather-picker-foot { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
.dbi-gather-picker-count { flex: 1; font-size: 13.5px; color: var(--text-muted, #a0a8b0); }
.dbi-gather-limit { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary, #94a3c4); }
.dbi-gather-nav {
  display: flex;
  gap: 8px;
  padding: 10px 20px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  flex-shrink: 0;
}
.dbi-gather-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-default, rgba(255,255,255,0.10));
  background: var(--bg-raised, #1a2540);
  color: var(--text-primary, #eef2ff);
  font-family: var(--font-mono);
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
}
.dbi-gather-chip:hover { border-color: var(--accent, #22d3ee); }
.dbi-gather-chip span { color: var(--text-muted, #a0a8b0); }
.dbi-gather-chip.is-err span { color: var(--red, #f87171); }
.dbi-gather-results { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.dbi-gather-sections {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  user-select: text;
}
.dbi-gather-section {
  border: 1px solid var(--border-default, rgba(255,255,255,0.10));
  border-radius: 12px;
  background: rgba(0,0,0,0.12);
  flex-shrink: 0;
}
.dbi-gather-section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-raised, #1a2540);
  border-radius: 11px 11px 0 0;
  cursor: pointer;
  user-select: none;
}
.dbi-gather-section.is-collapsed .dbi-gather-section-head { border-radius: 11px; }
.dbi-gather-chev { display: inline-block; color: var(--text-muted, #a0a8b0); transition: transform 0.12s; }
.dbi-gather-section.is-collapsed .dbi-gather-chev { transform: rotate(-90deg); }
.dbi-gather-section.is-collapsed .dbi-gather-section-body { display: none; }
.dbi-gather-section-name { font-family: var(--font-mono); font-size: 15px; font-weight: 700; color: var(--accent, #22d3ee); overflow-wrap: anywhere; }
.dbi-gather-badge {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255,255,255,0.06);
  color: var(--text-secondary, #94a3c4);
  white-space: nowrap;
}
.dbi-gather-badge.is-warn { background: var(--yellow-dim, rgba(210,153,34,0.13)); color: var(--yellow, #fbbf24); }
.dbi-gather-badge.is-err { background: var(--red-dim, rgba(248,113,113,0.15)); color: var(--red, #f87171); }
.dbi-gather-copy { margin-left: auto; height: 30px; font-size: 13px; padding: 0 12px; }
.dbi-gather-copy.is-ok, .dbi-gather-head-actions .dbi-btn.is-ok { color: var(--green, #34d399); }
.dbi-gather-scroll { max-height: 520px; overflow: auto; }
.dbi-gather-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 12.5px; }
.dbi-gather-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 12px;
  text-align: left;
  background: var(--bg-raised, #1a2540);
  color: var(--text-primary, #eef2ff);
  font-weight: 700;
  white-space: nowrap;
  border-bottom: 1px solid var(--border-default, rgba(255,255,255,0.10));
}
.dbi-gather-table td {
  padding: 6px 12px;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary, #94a3c4);
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04));
}
.dbi-gather-table tbody tr:nth-child(even) td { background: rgba(255,255,255,0.015); }
.dbi-gather-table tbody tr:hover td { background: var(--bg-hover, rgba(255,255,255,0.05)); }
.dbi-gather-table .rn { width: 1%; text-align: right; color: var(--text-faint, #707880); user-select: none; }
.dbi-gather-table td.is-null { color: var(--text-faint, #707880); font-style: italic; }
.dbi-gather-table td.is-num { text-align: right; color: var(--blue, #60a5fa); }
.dbi-gather-table td.is-bool { color: var(--purple, #bc8cff); }
.dbi-gather-more {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-muted, #a0a8b0);
  border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
}
.dbi-gather-more .dbi-btn { height: 30px; font-size: 13px; padding: 0 12px; margin-left: auto; }
.dbi-gather-empty { padding: 18px; font-size: 14px; color: var(--text-faint, #707880); font-style: italic; }
.dbi-gather-error { padding: 14px 18px; font-family: var(--font-mono); font-size: 13px; color: var(--red, #f87171); white-space: pre-wrap; word-break: break-word; }
`;

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (_) {}
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = GATHER_CSS;
  document.head.appendChild(style);
}

function cellText(v) {
  return v === null || v === undefined ? 'NULL' : String(v);
}

function mdCell(v) {
  return cellText(v).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function rowsLabel(res) {
  if (res.error) return 'error';
  const n = res.rows.length;
  return n + (n === 1 ? ' row' : ' rows') + (res.truncated ? ', limit reached' : '');
}

function toMarkdown(res) {
  if (!res.columns.length) return '(no columns)';
  if (!res.rows.length) return '(no rows) columns: ' + res.columns.join(', ');
  const cells = res.rows.map(r => r.map(mdCell));
  const heads = res.columns.map(mdCell);
  const widths = heads.map((h, i) => {
    let w = Math.max(h.length, 3);
    for (const r of cells) {
      if (r[i] !== undefined && r[i].length > w) w = r[i].length;
    }
    return Math.min(w, 60);
  });
  const pad = (s, i) => s + ' '.repeat(Math.max(0, widths[i] - s.length));
  const head = '| ' + heads.map((h, i) => pad(h, i)).join(' | ') + ' |';
  const sep = '| ' + widths.map(w => '-'.repeat(w)).join(' | ') + ' |';
  const body = cells.map(r => '| ' + r.map((s, i) => pad(s, i)).join(' | ') + ' |');
  return [head, sep].concat(body).join('\n');
}

function toJson(res) {
  const objects = res.rows.map(r => {
    const o = {};
    res.columns.forEach((c, i) => { o[c] = r[i] === undefined ? null : r[i]; });
    return o;
  });
  return JSON.stringify(objects, null, 2);
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(res) {
  const lines = [res.columns.map(csvCell).join(',')];
  for (const r of res.rows) lines.push(r.map(csvCell).join(','));
  return lines.join('\n');
}

function tsvCell(v) {
  return cellText(v).replace(/[\t\r\n]+/g, ' ');
}

function toTsv(res) {
  const lines = [res.columns.map(tsvCell).join('\t')];
  for (const r of res.rows) lines.push(r.map(tsvCell).join('\t'));
  return lines.join('\n');
}

function formatBody(res, fmt) {
  if (res.error) {
    return fmt === 'json' ? JSON.stringify({ error: res.error }, null, 2) : '(error: ' + res.error + ')';
  }
  if (fmt === 'json') return toJson(res);
  if (fmt === 'csv') return toCsv(res);
  if (fmt === 'tsv') return toTsv(res);
  return toMarkdown(res);
}

function heading(res) {
  return '### ' + res.table + ' (' + rowsLabel(res) + ')';
}

function formatOne(res, fmt) {
  const body = formatBody(res, fmt);
  return fmt === 'markdown' ? heading(res) + '\n\n' + body : body;
}

function formatAll(results, fmt) {
  if (fmt === 'json') {
    const out = {};
    for (const res of results) {
      out[res.table] = res.error ? { error: res.error } : JSON.parse(toJson(res));
    }
    return JSON.stringify(out, null, 2);
  }
  return results.map(res => heading(res) + '\n\n' + formatBody(res, fmt)).join('\n\n');
}

function cellHtml(v) {
  if (v === null || v === undefined) return '<td class="is-null">NULL</td>';
  if (typeof v === 'number') return '<td class="is-num">' + esc(v) + '</td>';
  if (typeof v === 'boolean') return '<td class="is-bool">' + String(v) + '</td>';
  const s = String(v);
  const shown = s.length > MAX_CELL_CHARS ? s.slice(0, MAX_CELL_CHARS) + '\u2026' : s;
  return '<td title="' + esc(s.slice(0, 500)) + '">' + esc(shown) + '</td>';
}

function flash(btn, ok) {
  if (!btn) return;
  if (!btn.dataset.orig) btn.dataset.orig = btn.innerHTML;
  btn.innerHTML = dbiIcon(ok ? 'check' : 'warning') + (ok ? ' Copied' : ' Failed');
  btn.classList.toggle('is-ok', ok);
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => {
    btn.innerHTML = btn.dataset.orig;
    btn.classList.remove('is-ok');
  }, 1500);
}

function copyText(text, btn) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => flash(btn, true)).catch(() => flash(btn, false));
  } else {
    flash(btn, false);
  }
}

export function openGatherModal() {
  if (document.getElementById('dbiGatherOverlay')) return;
  ensureStyles();

  const nodes = (state.graphData && state.graphData.nodes) || [];
  const tables = nodes
    .map(n => ({ name: n.data.label, rowCount: n.data.rowCount }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selected = new Set();
  if (state.selectedTable && tables.some(t => t.name === state.selectedTable)) {
    selected.add(state.selectedTable);
  }

  let limit = parseInt(lsGet(LS_LIMIT, ''), 10);
  if (!LIMITS.some(l => l.value === limit)) limit = DEFAULT_LIMIT;
  let usedLimit = limit;
  let fmt = lsGet(LS_FMT, 'markdown');
  if (!FORMATS.some(f => f.id === fmt)) fmt = 'markdown';

  let results = [];
  let shown = [];
  let elapsed = 0;
  let filter = '';
  let closed = false;

  const overlay = document.createElement('div');
  overlay.id = 'dbiGatherOverlay';
  overlay.className = 'dbi-gather-overlay';
  overlay.innerHTML = `
    <div class="dbi-gather-modal" role="dialog" aria-modal="true">
      <div class="dbi-gather-head">
        <div class="dbi-gather-head-main">
          <span class="dbi-gather-head-icon">${dbiIcon('table')}</span>
          <div>
            <div class="dbi-gather-title">Gather Data</div>
            <div class="dbi-gather-sub" id="dbiGatherSub"></div>
          </div>
        </div>
        <div class="dbi-gather-head-actions" id="dbiGatherActions"></div>
        <button class="dbi-btn-icon" id="dbiGatherClose" title="Close">${dbiIcon('close')}</button>
      </div>
      <div class="dbi-gather-body" id="dbiGatherBody"></div>
    </div>
  `;

  const subEl = overlay.querySelector('#dbiGatherSub');
  const actionsEl = overlay.querySelector('#dbiGatherActions');
  const bodyEl = overlay.querySelector('#dbiGatherBody');

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  }

  function limitLabel(value) {
    const found = LIMITS.find(l => l.value === value);
    return found ? found.label : 'custom limit';
  }

  function showPicker() {
    subEl.textContent = 'Choose the tables to collect data from';
    actionsEl.innerHTML = '';

    if (tables.length === 0) {
      bodyEl.innerHTML = '<div class="dbi-gather-center">No tables available. Scan or select a database first.</div>';
      return;
    }

    bodyEl.innerHTML = `
      <div class="dbi-gather-picker">
        <div class="dbi-gather-picker-bar">
          <input type="text" class="dbi-input" id="dbiGatherSearch" placeholder="Filter tables\u2026" value="${esc(filter)}" />
          <button class="dbi-btn" id="dbiGatherSelAll">Select all</button>
          <button class="dbi-btn dbi-btn-secondary" id="dbiGatherSelNone">Clear</button>
        </div>
        <div class="dbi-gather-picker-list" id="dbiGatherList"></div>
        <div class="dbi-gather-picker-foot">
          <span class="dbi-gather-picker-count" id="dbiGatherCount"></span>
          <label class="dbi-gather-limit">Row limit
            <select class="dbi-select" id="dbiGatherLimit">
              ${LIMITS.map(l => `<option value="${l.value}" ${l.value === limit ? 'selected' : ''}>${l.label}</option>`).join('')}
            </select>
          </label>
          <button class="dbi-btn dbi-btn-primary" id="dbiGatherRun" disabled>${dbiIcon('bolt')} Gather</button>
        </div>
      </div>
    `;

    const searchEl = bodyEl.querySelector('#dbiGatherSearch');
    const listEl = bodyEl.querySelector('#dbiGatherList');
    const countEl = bodyEl.querySelector('#dbiGatherCount');
    const runBtn = bodyEl.querySelector('#dbiGatherRun');
    const limitEl = bodyEl.querySelector('#dbiGatherLimit');

    const visibleTables = () => {
      const q = filter.trim().toLowerCase();
      return tables.filter(t => !q || t.name.toLowerCase().includes(q));
    };

    const updateFoot = () => {
      countEl.textContent = selected.size + ' of ' + tables.length + ' selected';
      runBtn.disabled = selected.size === 0;
    };

    const renderList = () => {
      const visible = visibleTables();
      listEl.innerHTML = visible.length
        ? visible.map(t => `
          <label class="dbi-gather-pick${selected.has(t.name) ? ' is-on' : ''}" data-table="${esc(t.name)}">
            <input type="checkbox" ${selected.has(t.name) ? 'checked' : ''} />
            <span class="dbi-gather-pick-name">${esc(t.name)}</span>
            <span class="dbi-gather-pick-count">${fmtCount(t.rowCount)}</span>
          </label>`).join('')
        : '<div class="dbi-gather-center">No matching tables</div>';
      updateFoot();
    };

    searchEl.addEventListener('input', () => {
      filter = searchEl.value;
      renderList();
    });

    listEl.addEventListener('change', (e) => {
      const row = e.target.closest('.dbi-gather-pick');
      if (!row) return;
      const name = row.dataset.table;
      if (e.target.checked) selected.add(name);
      else selected.delete(name);
      row.classList.toggle('is-on', e.target.checked);
      updateFoot();
    });

    bodyEl.querySelector('#dbiGatherSelAll').addEventListener('click', () => {
      visibleTables().forEach(t => selected.add(t.name));
      renderList();
    });

    bodyEl.querySelector('#dbiGatherSelNone').addEventListener('click', () => {
      selected.clear();
      renderList();
    });

    limitEl.addEventListener('change', () => {
      limit = parseInt(limitEl.value, 10);
      lsSet(LS_LIMIT, limit);
    });

    runBtn.addEventListener('click', () => runGather());

    renderList();
    searchEl.focus();
  }

  function showLoading(count) {
    subEl.textContent = 'Gathering\u2026';
    actionsEl.innerHTML = '';
    bodyEl.innerHTML = `<div class="dbi-gather-center">${dbiIcon('refresh', 'dbi-spin')}<div>Gathering data from ${count} table${count === 1 ? '' : 's'}\u2026</div></div>`;
  }

  function showError(message) {
    subEl.textContent = 'Gather failed';
    actionsEl.innerHTML = '';
    bodyEl.innerHTML = `
      <div class="dbi-gather-center">
        <div class="dbi-gather-center-error">${esc(message)}</div>
        <button class="dbi-btn" id="dbiGatherErrBack">${dbiIcon('arrowLeft')} Back</button>
      </div>`;
    bodyEl.querySelector('#dbiGatherErrBack').addEventListener('click', () => showPicker());
  }

  async function runGather() {
    const names = tables.filter(t => selected.has(t.name)).map(t => t.name);
    if (names.length === 0) return;
    usedLimit = limit;
    showLoading(names.length);
    const started = performance.now();
    try {
      const res = await window.electronAPI.dbInspector.gatherTables({
        snapshotId: state.currentSnapshotId,
        tables: names,
        limit,
      });
      if (closed) return;
      if (!res || !res.success) {
        showError((res && res.error) || 'Gather failed');
        return;
      }
      results = res.results || [];
      shown = results.map(() => INITIAL_ROWS);
      elapsed = (performance.now() - started) / 1000;
      showResults();
    } catch (err) {
      if (closed) return;
      showError(err && err.message ? err.message : String(err));
    }
  }

  function sectionBodyHtml(res, i) {
    if (res.error) return `<div class="dbi-gather-error">${esc(res.error)}</div>`;
    if (!res.columns.length) return '<div class="dbi-gather-empty">No columns returned</div>';
    if (!res.rows.length) return '<div class="dbi-gather-empty">No rows in this table</div>';
    const count = Math.min(shown[i], res.rows.length);
    const head = '<th class="rn">#</th>' + res.columns.map(c => `<th>${esc(c)}</th>`).join('');
    const body = res.rows.slice(0, count).map((r, ri) => `<tr><td class="rn">${ri + 1}</td>${r.map(v => cellHtml(v)).join('')}</tr>`).join('');
    const remaining = res.rows.length - count;
    const more = remaining > 0
      ? `<div class="dbi-gather-more"><span>Showing ${fmtCount(count)} of ${fmtCount(res.rows.length)} rows. Copy includes all rows.</span><button class="dbi-btn" data-more="${i}">Show ${Math.min(MORE_ROWS, remaining)} more</button></div>`
      : '';
    return `<div class="dbi-gather-scroll"><table class="dbi-gather-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}`;
  }

  function sectionHtml(res, i) {
    const badges = [];
    if (res.error) {
      badges.push('<span class="dbi-gather-badge is-err">error</span>');
    } else {
      badges.push(`<span class="dbi-gather-badge">${fmtCount(res.rows.length)} ${res.rows.length === 1 ? 'row' : 'rows'}</span>`);
      badges.push(`<span class="dbi-gather-badge">${res.columns.length} cols</span>`);
      if (res.truncated) badges.push('<span class="dbi-gather-badge is-warn">limit reached</span>');
    }
    return `
      <section class="dbi-gather-section" id="dbiGatherSec_${i}">
        <div class="dbi-gather-section-head">
          <span class="dbi-gather-chev">\u25BE</span>
          <span class="dbi-gather-section-name">${esc(res.table)}</span>
          ${badges.join('')}
          <button class="dbi-btn dbi-gather-copy" data-copy="${i}">${dbiIcon('copy')} Copy</button>
        </div>
        <div class="dbi-gather-section-body" id="dbiGatherSecBody_${i}">${sectionBodyHtml(res, i)}</div>
      </section>`;
  }

  function showResults() {
    const totalRows = results.reduce((sum, r) => sum + (r.rows ? r.rows.length : 0), 0);
    subEl.textContent = results.length + (results.length === 1 ? ' table' : ' tables') +
      ' \u00B7 ' + fmtCount(totalRows) + ' rows \u00B7 ' + limitLabel(usedLimit) + ' \u00B7 ' + elapsed.toFixed(2) + 's';

    actionsEl.innerHTML = `
      <label class="dbi-gather-fmt">Copy as
        <select class="dbi-select" id="dbiGatherFmt">
          ${FORMATS.map(f => `<option value="${f.id}" ${f.id === fmt ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </label>
      <button class="dbi-btn dbi-btn-secondary" id="dbiGatherBack">${dbiIcon('arrowLeft')} Change tables</button>
      <button class="dbi-btn dbi-btn-primary" id="dbiGatherCopyAll">${dbiIcon('copy')} Copy All</button>
    `;

    bodyEl.innerHTML = `
      <div class="dbi-gather-results">
        <div class="dbi-gather-nav" id="dbiGatherNav">
          ${results.map((r, i) => `<button class="dbi-gather-chip${r.error ? ' is-err' : ''}" data-jump="${i}">${esc(r.table)} <span>${r.error ? 'error' : fmtCount(r.rows.length)}</span></button>`).join('')}
        </div>
        <div class="dbi-gather-sections" id="dbiGatherSections">
          ${results.map((r, i) => sectionHtml(r, i)).join('')}
        </div>
      </div>
    `;

    const sectionsEl = bodyEl.querySelector('#dbiGatherSections');

    bodyEl.querySelector('#dbiGatherNav').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-jump]');
      if (!chip) return;
      const sec = sectionsEl.querySelector('#dbiGatherSec_' + chip.dataset.jump);
      if (!sec) return;
      sec.classList.remove('is-collapsed');
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    sectionsEl.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('[data-copy]');
      if (copyBtn) {
        const res = results[parseInt(copyBtn.dataset.copy, 10)];
        if (res) copyText(formatOne(res, fmt), copyBtn);
        return;
      }
      const moreBtn = e.target.closest('[data-more]');
      if (moreBtn) {
        const i = parseInt(moreBtn.dataset.more, 10);
        shown[i] += MORE_ROWS;
        const target = sectionsEl.querySelector('#dbiGatherSecBody_' + i);
        if (target) target.innerHTML = sectionBodyHtml(results[i], i);
        return;
      }
      const head = e.target.closest('.dbi-gather-section-head');
      if (head) head.parentElement.classList.toggle('is-collapsed');
    });

    actionsEl.querySelector('#dbiGatherFmt').addEventListener('change', (e) => {
      fmt = e.target.value;
      lsSet(LS_FMT, fmt);
    });

    actionsEl.querySelector('#dbiGatherBack').addEventListener('click', () => showPicker());

    actionsEl.querySelector('#dbiGatherCopyAll').addEventListener('click', (e) => {
      copyText(formatAll(results, fmt), e.currentTarget);
    });
  }

  let downOnOverlay = false;
  overlay.addEventListener('mousedown', (e) => { downOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', (e) => {
    if (downOnOverlay && e.target === overlay) close();
    downOnOverlay = false;
  });
  overlay.querySelector('#dbiGatherClose').addEventListener('click', () => close());
  document.addEventListener('keydown', onKey, true);

  document.body.appendChild(overlay);
  showPicker();
}