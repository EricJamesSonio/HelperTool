import { getFeatures } from './featureManager.js';
import { FEATURES_META } from './settingsManager/features.js';

const MAX_POINTS = 60;
const MEM_WARN_KB = 300 * 1024;
const MEM_CRIT_KB = 800 * 1024;
const CPU_WARN = 25;
const CPU_CRIT = 60;
const STATUS_ORDER = ['critical', 'warning', 'good', 'idle'];
const STATUS_LABEL = { critical: 'Critical', warning: 'Warning', good: 'Good', idle: 'Idle' };
const STATUS_COLOR = { critical: '#ff6b69', warning: '#d29922', good: '#3fb950', idle: '#6a78ff' };

const PSEUDO = {
  core: { label: 'Helper Tool core', group: 'Core', desc: 'Main process and the app window. Features without their own process live here.' },
  workerService: { label: 'Background worker', group: 'Core', desc: 'Shared process for git status, profile, LOC scans and media jobs.' },
  electron: { label: 'Electron helpers', group: 'Core', desc: 'GPU, network and utility processes.' },
  commands: { label: 'Commands and scripts', group: 'Core', desc: 'Shell commands started by the console, ecosystem and error tools.' },
  other: { label: 'Other processes', group: 'Core', desc: 'Processes that could not be matched to a feature.' },
};

const UI_ROOTS = {
  gitTool: ['#gitToolPanel'],
  symbolIndex: ['#symbolIndexPanel'],
  codebbaseChat: ['#codebaseChatPanel'],
  githubExplorer: ['#githubExplorerPanel'],
  videoTool: ['#videoToolPanel'],
  gmailTool: ['#gmailToolPanel'],
  automationSketch: ['#automationSketchPanel'],
  projectInspector: ['#projectInspectorPanel'],
  graphify: ['#graphifyPanel'],
  mcp: ['#mcpPanel'],
  secretHolder: ['#secretHolderPanel'],
  terminalTool: ['#terminalPanel', '.ecp-wrapper'],
  ecosystemWatcher: ['#ecoDashboardPanel'],
  codeswampChat: ['#ocPanel'],
  researcherTool: ['#rsPanel'],
  harnessTool: ['#harnessPanel'],
  uiLayoutHelper: ['#ulhPanel'],
  envManager: ['#envOverlay'],
  promptTool: ['#promptToolModal'],
};

const FEATURE_IDS = new Set(FEATURES_META.map((f) => f.id));

let _panel = null;
let _open = false;
let _timer = null;
let _paused = false;
let _running = false;
let _quick = false;
let _intervalMs = 5000;
let _history = [];
let _snap = null;
let _sort = { key: 'mem', dir: -1 };
let _procsOpen = false;
let _disabledOpen = false;
let _resizeBound = false;

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmtMem(kb) {
  if (!kb || kb < 1) return '0 MB';
  const mb = kb / 1024;
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
  if (mb >= 100) return Math.round(mb) + ' MB';
  if (mb >= 1) return mb.toFixed(1) + ' MB';
  return Math.round(kb) + ' KB';
}

function fmtCpu(v) {
  return (v || 0).toFixed(v >= 10 ? 0 : 1) + '%';
}

function powerLevel(score) {
  if (score < 3) return { key: 'low', label: 'Low' };
  if (score < 12) return { key: 'medium', label: 'Medium' };
  return { key: 'high', label: 'High' };
}

function fmtAgo(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return s + 's ago';
  return Math.round(s / 60) + 'm ago';
}

export function isOpen() {
  return _open;
}

export function open() {
  if (_open) return;
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
  _open = true;
  _history = [];
  _snap = null;
  _paused = false;
  _quick = true;
  syncPauseButton();
  if (!window.perfAPI) {
    setNotice('Restart Helper Tool once so the Performance Tracker can start collecting data.');
    return;
  }
  setNotice('');
  window.perfAPI.reset().catch(() => {});
  run();
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('open');
  _open = false;
  clearTimeout(_timer);
  _timer = null;
}

function syncPauseButton() {
  const b = $('ptPause');
  if (b) b.textContent = _paused ? 'Resume' : 'Pause';
}

function setNotice(text) {
  const el = $('ptNotice');
  if (!el) return;
  el.innerHTML = text ? '<div class="pt-notice">' + esc(text) + '</div>' : '';
}

function schedule(ms) {
  clearTimeout(_timer);
  if (_open && !_paused) _timer = setTimeout(run, ms);
}

async function run() {
  if (!_open || _paused || _running) return;
  _running = true;
  try {
    const snap = await window.perfAPI.sample();
    if (!snap || !snap.ok) {
      setNotice('Could not read performance data' + (snap && snap.error ? ': ' + snap.error : '.'));
    } else {
      _snap = snap;
      _history.push({ ts: snap.ts, memKB: snap.total.memKB });
      if (_history.length > MAX_POINTS) _history.shift();
      render();
    }
  } catch (err) {
    console.error('[PerfTracker] sample failed:', err);
    setNotice('Could not read performance data: ' + err.message);
  } finally {
    _running = false;
    const delay = _quick ? 1500 : _intervalMs;
    _quick = false;
    schedule(delay);
  }
}

function _buildPanel() {
  _panel = document.createElement('div');
  _panel.id = 'perfTrackerPanel';
  _panel.className = 'pt-overlay';
  _panel.innerHTML =
    '<div class="pt-page">' +
      '<div class="pt-header">' +
        '<div class="pt-header-main">' +
          '<h1 class="pt-title"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M10 2a8 8 0 1 0 8 8"/><path d="M10 6a4 4 0 1 0 4 4"/><circle cx="10" cy="10" r="1.5"/></svg> Performance Tracker</h1>' +
          '<p class="pt-sub">Memory and CPU used by Helper Tool and each feature you have enabled</p>' +
        '</div>' +
        '<div class="pt-controls">' +
          '<label class="pt-ctl">Update every ' +
            '<select id="ptInterval" class="pt-select"><option value="3000">3 s</option><option value="5000" selected>5 s</option><option value="10000">10 s</option></select>' +
          '</label>' +
          '<button class="pt-btn" id="ptPause" type="button">Pause</button>' +
          '<button class="pt-btn" id="ptNow" type="button">Refresh</button>' +
          '<button class="pt-btn pt-btn-icon" id="ptClose" type="button" title="Close"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="16" height="16"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<div class="pt-body" id="ptBody">' +
        '<div id="ptNotice"></div>' +
        '<div class="pt-cards" id="ptCards"></div>' +
        '<div class="pt-row pt-row-main">' +
          '<section class="pt-card pt-card-chart">' +
            '<h2 class="pt-h2">Memory</h2><p class="pt-hint">Total memory used by Helper Tool over time</p>' +
            '<div class="pt-chart-wrap" id="ptChartWrap"><canvas id="ptChart"></canvas></div>' +
            '<div class="pt-chart-axis"><span id="ptAxisStart"></span><span>now</span></div>' +
          '</section>' +
          '<section class="pt-card pt-card-gauge" id="ptGauge"></section>' +
        '</div>' +
        '<div class="pt-row pt-row-two">' +
          '<section class="pt-card" id="ptInsights"></section>' +
          '<section class="pt-card" id="ptHeavy"></section>' +
        '</div>' +
        '<section class="pt-card" id="ptGroups"></section>' +
        '<section class="pt-card" id="ptTable"></section>' +
        '<section class="pt-card" id="ptDisabled"></section>' +
        '<section class="pt-card" id="ptProcs"></section>' +
        '<p class="pt-foot" id="ptFoot"></p>' +
      '</div>' +
    '</div>';
  document.body.appendChild(_panel);

  $('ptClose').addEventListener('click', close);
  $('ptNow').addEventListener('click', () => {
    clearTimeout(_timer);
    run();
  });
  $('ptPause').addEventListener('click', () => {
    _paused = !_paused;
    syncPauseButton();
    if (_paused) clearTimeout(_timer);
    else run();
  });
  $('ptInterval').addEventListener('change', (e) => {
    _intervalMs = Number(e.target.value) || 5000;
    if (!_paused && !_running) schedule(_intervalMs);
  });
  $('ptBody').addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    if (_sort.key === key) _sort.dir = -_sort.dir;
    else _sort = { key, dir: key === 'label' || key === 'group' ? 1 : -1 };
    if (_snap) render();
  });
  $('ptBody').addEventListener(
    'toggle',
    (e) => {
      if (e.target.id === 'ptProcsDetails') _procsOpen = e.target.open;
      if (e.target.id === 'ptDisabledDetails') _disabledOpen = e.target.open;
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _open) close();
  });
  if (!_resizeBound) {
    _resizeBound = true;
    window.addEventListener('resize', () => {
      if (_open) drawChart();
    });
  }
}

function countNodes(id) {
  const sels = UI_ROOTS[id];
  if (!sels) return null;
  let n = 0;
  for (const sel of sels) {
    try {
      document.querySelectorAll(sel).forEach((el) => {
        n += 1 + el.getElementsByTagName('*').length;
      });
    } catch (_) {}
  }
  return n;
}

function statusOf(row) {
  if (row.procs === 0 && row.busy < 0.5 && !row.mem) return 'idle';
  if (row.mem >= MEM_CRIT_KB || row.cpu >= CPU_CRIT) return 'critical';
  if (row.mem >= MEM_WARN_KB || row.cpu >= CPU_WARN) return 'warning';
  return 'good';
}

function buildRows(snap) {
  const feats = getFeatures();
  const rows = [];
  const seen = new Set();
  const make = (id, meta, enabled) => {
    const f = snap.features[id] || {};
    const row = {
      id,
      label: meta.label,
      group: meta.group || 'Other',
      desc: meta.desc || '',
      enabled,
      mem: f.memKB || 0,
      cpu: f.cpu || 0,
      power: f.power || 0,
      procs: f.procs || 0,
      busy: f.busyPct || 0,
      calls: f.calls || 0,
      nodes: countNodes(id),
    };
    row.status = statusOf(row);
    return row;
  };
  for (const m of FEATURES_META) {
    seen.add(m.id);
    rows.push(make(m.id, m, feats[m.id] !== false));
  }
  for (const id of Object.keys(PSEUDO)) {
    seen.add(id);
    rows.push(make(id, PSEUDO[id], true));
  }
  for (const id of Object.keys(snap.features)) {
    if (!seen.has(id)) rows.push(make(id, { label: id, group: 'Other' }, true));
  }
  return rows;
}

function render() {
  if (!_snap || !_open) return;
  const snap = _snap;
  const rows = buildRows(snap);
  if (snap.limited) {
    setNotice('Child processes could not be read' + (snap.scanError ? ' (' + snap.scanError + ')' : '') + '. Only Electron processes are shown.');
  } else if (!window.perfAPI) {
    setNotice('Restart Helper Tool once so the Performance Tracker can start collecting data.');
  } else {
    setNotice('');
  }
  $('ptCards').innerHTML = renderCards(snap, rows);
  $('ptGauge').innerHTML = renderGauge(rows);
  $('ptInsights').innerHTML = renderInsights(rows, snap);
  $('ptHeavy').innerHTML = renderHeavy(rows);
  $('ptGroups').innerHTML = renderGroups(rows);
  $('ptTable').innerHTML = renderTable(rows);
  $('ptDisabled').innerHTML = renderDisabled(rows);
  $('ptProcs').innerHTML = renderProcs(snap);
  $('ptFoot').textContent =
    'Memory is the private memory of each process. CPU is percent of one core (100% = one full core, this computer has ' + snap.cores + '). ' +
    'Power is an estimate from CPU use and idle wake-ups. Features that run inside the app window have no process of their own, so their memory is part of Helper Tool core; ' +
    'their Activity column shows time the main process spent answering their requests. Sampling only happens while this page is open.';
  drawChart();
}

function renderCards(snap, rows) {
  const features = rows.filter((r) => FEATURE_IDS.has(r.id));
  const enabled = features.filter((r) => r.enabled).length;
  const t = snap.total;
  const level = powerLevel(t.power || 0);
  const cards = [
    ['Total memory', fmtMem(t.memKB), t.procs + ' processes', ''],
    ['CPU', fmtCpu(t.cpu), '100% = one core of ' + snap.cores, ''],
    ['Power impact', level.label, 'estimated from CPU and wake-ups', 'pt-tone-' + level.key],
    ['Enabled features', enabled + ' of ' + features.length, features.length - enabled + ' turned off', ''],
  ];
  return cards
    .map((c) => '<div class="pt-stat ' + c[3] + '"><div class="pt-stat-label">' + esc(c[0]) + '</div><div class="pt-stat-value">' + esc(c[1]) + '</div><div class="pt-stat-note">' + esc(c[2]) + '</div></div>')
    .join('');
}

function wedge(cx, cy, r1, r2, a1, a2) {
  const p = (r, a) => [(cx + r * Math.cos(a)).toFixed(2), (cy + r * Math.sin(a)).toFixed(2)];
  const [x1, y1] = p(r2, a1);
  const [x2, y2] = p(r2, a2);
  const [x3, y3] = p(r1, a2);
  const [x4, y4] = p(r1, a1);
  return 'M' + x1 + ' ' + y1 + ' A' + r2 + ' ' + r2 + ' 0 0 1 ' + x2 + ' ' + y2 + ' L' + x3 + ' ' + y3 + ' A' + r1 + ' ' + r1 + ' 0 0 0 ' + x4 + ' ' + y4 + ' Z';
}

function renderGauge(rows) {
  const list = rows.filter((r) => FEATURE_IDS.has(r.id) && r.enabled);
  const statuses = list.map((r) => r.status).sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));
  const n = Math.max(1, statuses.length);
  const step = Math.PI / n;
  const gap = n > 1 ? 0.024 : 0;
  let paths = '';
  statuses.forEach((st, i) => {
    paths += '<path d="' + wedge(230, 236, 120, 212, Math.PI + i * step + gap / 2, Math.PI + (i + 1) * step - gap / 2) + '" fill="' + STATUS_COLOR[st] + '"></path>';
  });
  const counts = {};
  STATUS_ORDER.forEach((s) => (counts[s] = 0));
  statuses.forEach((s) => (counts[s] += 1));
  const legend = STATUS_ORDER.map(
    (s) => '<span class="pt-legend-item"><span class="pt-dot" style="background:' + STATUS_COLOR[s] + '"></span>' + STATUS_LABEL[s] + ' <strong>' + counts[s] + '</strong></span>'
  ).join('');
  return (
    '<div class="pt-gauge-wrap"><svg viewBox="0 0 460 250" class="pt-gauge-svg">' + paths + '</svg>' +
    '<div class="pt-gauge-center"><div class="pt-gauge-num">' + statuses.length + '</div><div class="pt-gauge-label">Enabled features</div></div></div>' +
    '<div class="pt-legend">' + legend + '</div>'
  );
}

function buildInsights(rows, snap) {
  const items = [];
  if (snap.total.memKB >= 2 * 1024 * 1024) {
    items.push({ tone: 'warn', text: 'Helper Tool is using ' + fmtMem(snap.total.memKB) + ' in total.' });
  }
  const heavy = rows
    .filter((r) => r.enabled && (r.status === 'critical' || r.status === 'warning'))
    .sort((a, b) => b.mem - a.mem)
    .slice(0, 4);
  for (const r of heavy) {
    const parts = [];
    if (r.mem >= MEM_WARN_KB) parts.push(fmtMem(r.mem) + ' of memory');
    if (r.cpu >= CPU_WARN) parts.push(Math.round(r.cpu) + '% CPU');
    if (r.cpu < 1 && r.busy < 0.5 && FEATURE_IDS.has(r.id)) {
      items.push({ tone: 'info', text: r.label + ' is idle but holds ' + fmtMem(r.mem) + '. Turn it off in Settings if you do not use it.' });
    } else {
      items.push({ tone: r.status === 'critical' ? 'bad' : 'warn', text: r.label + ' is using ' + parts.join(' and ') + '.' });
    }
  }
  for (const r of rows) {
    if (!r.enabled && r.procs > 0) {
      items.push({ tone: 'warn', text: r.label + ' is turned off but still has ' + r.procs + ' running process' + (r.procs > 1 ? 'es' : '') + ' (' + fmtMem(r.mem) + ').' });
    }
  }
  const seen = new Set();
  for (const s of snap.slow || []) {
    if (seen.has(s.channel)) continue;
    seen.add(s.channel);
    items.push({ tone: 'warn', text: 'Slow request: ' + s.channel + ' took ' + s.ms + ' ms (' + s.ago + ' s ago).' });
    if (seen.size >= 2) break;
  }
  return items.slice(0, 7);
}

function renderInsights(rows, snap) {
  const items = buildInsights(rows, snap);
  const body = items.length
    ? items.map((i) => '<div class="pt-insight pt-insight-' + i.tone + '"><span class="pt-dot"></span>' + esc(i.text) + '</div>').join('')
    : '<div class="pt-insight pt-insight-ok"><span class="pt-dot"></span>Nothing is slowing the app down.</div>';
  return '<h2 class="pt-h2">What is slowing things down</h2><p class="pt-hint">Plain-language checks on Helper Tool and your computer</p>' + body;
}

function renderHeavy(rows) {
  const list = rows
    .filter((r) => r.enabled && r.mem > 0)
    .sort((a, b) => b.mem - a.mem)
    .slice(0, 6);
  const max = list.length ? list[0].mem : 1;
  const body = list.length
    ? list
        .map(
          (r) =>
            '<div class="pt-bar-row"><div class="pt-bar-head"><span class="pt-bar-name">' + esc(r.label) + '</span><span class="pt-bar-val">' + fmtMem(r.mem) + ' · ' + fmtCpu(r.cpu) + ' CPU</span></div>' +
            '<div class="pt-bar"><div class="pt-bar-fill" style="width:' + Math.max(2, (r.mem / max) * 100).toFixed(1) + '%;background:' + STATUS_COLOR[r.status] + '"></div></div></div>'
        )
        .join('')
    : '<div class="pt-empty">Collecting data...</div>';
  return '<h2 class="pt-h2">Heaviest features</h2><p class="pt-hint">Enabled features and shared processes using the most memory</p>' + body;
}

function renderGroups(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!r.enabled) continue;
    if (!groups.has(r.group)) groups.set(r.group, { mem: 0, cpu: 0, count: 0 });
    const g = groups.get(r.group);
    g.mem += r.mem;
    g.cpu += r.cpu;
    if (FEATURE_IDS.has(r.id)) g.count += 1;
  }
  const list = [...groups.entries()].sort((a, b) => b[1].mem - a[1].mem);
  const max = list.length && list[0][1].mem ? list[0][1].mem : 1;
  const body = list
    .map(([name, g]) => {
      const status = g.mem >= MEM_CRIT_KB ? 'critical' : g.mem >= MEM_WARN_KB ? 'warning' : 'good';
      return (
        '<div class="pt-bar-row"><div class="pt-bar-head"><span class="pt-bar-name">' + esc(name) + '</span><span class="pt-bar-val">' +
        (g.count ? g.count + ' enabled · ' : '') + fmtMem(g.mem) + ' · ' + fmtCpu(g.cpu) + ' CPU</span></div>' +
        '<div class="pt-bar"><div class="pt-bar-fill" style="width:' + Math.max(2, (g.mem / max) * 100).toFixed(1) + '%;background:' + STATUS_COLOR[status] + '"></div></div></div>'
      );
    })
    .join('');
  return '<h2 class="pt-h2">Groups</h2><p class="pt-hint">Memory and CPU used by each group of features</p>' + body;
}

function sortRows(list) {
  const { key, dir } = _sort;
  const val = (r) => {
    if (key === 'label') return r.label.toLowerCase();
    if (key === 'group') return r.group.toLowerCase();
    if (key === 'status') return STATUS_ORDER.indexOf(r.status);
    return r[key] || 0;
  };
  return list.slice().sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x < y) return -dir;
    if (x > y) return dir;
    return a.label.localeCompare(b.label);
  });
}

function renderTable(rows) {
  const list = sortRows(rows.filter((r) => r.enabled && (FEATURE_IDS.has(r.id) || r.mem > 0)));
  const cols = [
    ['label', 'Feature'], ['group', 'Group'], ['mem', 'Memory'], ['cpu', 'CPU'], ['power', 'Power'],
    ['procs', 'Processes'], ['busy', 'Activity'], ['nodes', 'UI elements'], ['status', 'Status'],
  ];
  const head = cols
    .map(([k, label]) => '<th data-sort="' + k + '" class="pt-th' + (_sort.key === k ? ' pt-th-active' : '') + '">' + label + (_sort.key === k ? (_sort.dir > 0 ? ' &#9650;' : ' &#9660;') : '') + '</th>')
    .join('');
  const body = list
    .map((r) => {
      const quiet = r.procs === 0 && r.busy < 0.5;
      const level = powerLevel(r.power);
      return (
        '<tr><td class="pt-cell-name" title="' + esc(r.desc) + '">' + esc(r.label) + '</td>' +
        '<td class="pt-cell-muted">' + esc(r.group) + '</td>' +
        '<td class="pt-num">' + (r.mem ? fmtMem(r.mem) : '<span class="pt-cell-muted">in core</span>') + '</td>' +
        '<td class="pt-num">' + (r.procs ? fmtCpu(r.cpu) : '<span class="pt-cell-muted">-</span>') + '</td>' +
        '<td>' + (quiet ? '<span class="pt-cell-muted">-</span>' : '<span class="pt-pill pt-pill-' + level.key + '">' + level.label + '</span>') + '</td>' +
        '<td class="pt-num">' + (r.procs || '<span class="pt-cell-muted">0</span>') + '</td>' +
        '<td class="pt-num" title="' + r.calls + ' requests in the last interval">' + (r.busy > 0 ? r.busy.toFixed(1) + '%' : '<span class="pt-cell-muted">-</span>') + '</td>' +
        '<td class="pt-num">' + (r.nodes ? r.nodes.toLocaleString() : '<span class="pt-cell-muted">-</span>') + '</td>' +
        '<td><span class="pt-status pt-status-' + r.status + '"><span class="pt-dot"></span>' + STATUS_LABEL[r.status] + '</span></td></tr>'
      );
    })
    .join('');
  return '<h2 class="pt-h2">Enabled features</h2><p class="pt-hint">Click a column to sort</p><div class="pt-table-wrap"><table class="pt-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
}

function renderDisabled(rows) {
  const list = rows.filter((r) => FEATURE_IDS.has(r.id) && !r.enabled);
  if (!list.length) return '';
  const body = list
    .map((r) => '<span class="pt-chip' + (r.procs ? ' pt-chip-warn' : '') + '" title="' + esc(r.desc) + '">' + esc(r.label) + (r.procs ? ' - still running ' + fmtMem(r.mem) : '') + '</span>')
    .join('');
  return (
    '<details id="ptDisabledDetails" ' + (_disabledOpen ? 'open' : '') + '><summary class="pt-summary">Turned off (' + list.length + ') - not loaded, no cost</summary>' +
    '<div class="pt-chips">' + body + '</div></details>'
  );
}

function renderProcs(snap) {
  const labels = {};
  FEATURES_META.forEach((f) => (labels[f.id] = f.label));
  Object.keys(PSEUDO).forEach((id) => (labels[id] = PSEUDO[id].label));
  const body = snap.processes
    .map(
      (p) =>
        '<tr><td class="pt-num">' + p.pid + '</td><td>' + esc(p.name) + '</td><td>' + esc(labels[p.feature] || p.feature) + '</td><td class="pt-num">' + fmtMem(p.memKB) + '</td><td class="pt-num">' + fmtCpu(p.cpu) + '</td></tr>'
    )
    .join('');
  return (
    '<details id="ptProcsDetails" ' + (_procsOpen ? 'open' : '') + '><summary class="pt-summary">All processes (' + snap.processes.length + ')</summary>' +
    '<div class="pt-table-wrap"><table class="pt-table"><thead><tr><th class="pt-th">PID</th><th class="pt-th">Process</th><th class="pt-th">Feature</th><th class="pt-th">Memory</th><th class="pt-th">CPU</th></tr></thead><tbody>' + body + '</tbody></table></div></details>'
  );
}

function niceMax(kb) {
  const steps = [128, 256, 512, 1024, 1536, 2048, 3072, 4096, 6144, 8192, 12288, 16384].map((m) => m * 1024);
  for (const s of steps) if (kb <= s) return s;
  return Math.ceil(kb / (4096 * 1024)) * 4096 * 1024;
}

function drawChart() {
  const canvas = $('ptChart');
  const wrap = $('ptChartWrap');
  if (!canvas || !wrap) return;
  const cssW = wrap.clientWidth || 640;
  const cssH = 230;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const css = getComputedStyle(document.documentElement);
  const green = css.getPropertyValue('--green').trim() || '#3fb950';
  const amber = css.getPropertyValue('--yellow').trim() || '#d29922';
  const red = css.getPropertyValue('--red').trim() || '#ff6b69';
  const muted = css.getPropertyValue('--text-muted').trim() || '#a0a8b0';

  const cols = MAX_POINTS;
  const rows = 16;
  const left = 62;
  const top = 6;
  const bottom = 6;
  const plotW = cssW - left - 4;
  const plotH = cssH - top - bottom;
  const cw = plotW / cols;
  const ch = plotH / rows;
  const maxData = _history.reduce((m, h) => Math.max(m, h.memKB), 1);
  const maxKB = niceMax(maxData * 1.1);

  ctx.font = '11px sans-serif';
  ctx.fillStyle = muted;
  ctx.textAlign = 'right';
  for (let k = 0; k <= 4; k++) {
    const y = top + plotH - (plotH * k) / 4;
    ctx.fillText(k === 0 ? '0' : fmtMem((maxKB * k) / 4), left - 8, Math.min(cssH - 4, Math.max(10, y + 4)));
  }

  const first = _history.length - cols;
  for (let c = 0; c < cols; c++) {
    const idx = first + c;
    const value = idx >= 0 ? _history[idx].memKB : -1;
    const filled = value < 0 ? 0 : Math.max(1, Math.ceil((value / maxKB) * rows));
    for (let r = 0; r < rows; r++) {
      const level = ((r + 1) / rows) * maxKB;
      const x = left + c * cw + 1;
      const y = top + (rows - 1 - r) * ch + 1;
      ctx.fillStyle = r < filled ? (level <= 1024 * 1024 ? green : level <= 2048 * 1024 ? amber : red) : 'rgba(255,255,255,0.07)';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(1, cw - 2), Math.max(1, ch - 2), 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, Math.max(1, cw - 2), Math.max(1, ch - 2));
      }
    }
  }

  const start = $('ptAxisStart');
  if (start) start.textContent = _history.length > 1 ? fmtAgo(Date.now() - _history[0].ts) : '';
}