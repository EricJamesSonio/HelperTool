import { esc } from '../highlight.js';
import { pickerHtml, loadPicked, savePicked } from './debugPicker.js';

const SEV_CLS = { error: 'e', warning: 'w', info: 'i' };
const SEV_ICON = { error: '\u2297', warning: '\u26A0', info: '\u24D8' };
const MAX_ROWS = 1000;

let overlay = null;
let els = null;
let getCtx = null;
let run = null;
let mode = 'pick';
let picked = new Set();
let filter = 'errors';
let query = '';
let sel = '';
let detailFile = '';
let autoSwitched = false;
let renderRaf = 0;
let wired = false;
let copyTimer = 0;
let seq = 0;

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function baseName(rel) {
  const i = rel.lastIndexOf('/');
  return i < 0 ? rel : rel.slice(i + 1);
}

function dirName(rel) {
  const i = rel.lastIndexOf('/');
  return i < 0 ? '' : rel.slice(0, i);
}

function keyOf(ctx) {
  return (ctx.root || '') + '|' + (ctx.extensions || []).map((e) => e.id).join(',');
}

function stats() {
  const s = { files: 0, fe: 0, fw: 0, te: 0, tw: 0, ti: 0 };
  if (!run) return s;
  for (const f of run.files.values()) {
    s.files++;
    if (f.e) s.fe++;
    if (f.w) s.fw++;
    s.te += f.e;
    s.tw += f.w;
    s.ti += f.i;
  }
  return s;
}

function passes(f) {
  if (filter === 'errors' && !f.e) return false;
  if (filter === 'warnings' && !f.w) return false;
  if (query && f.rel.toLowerCase().indexOf(query) === -1) return false;
  return true;
}

function visible() {
  const out = [];
  if (!run) return out;
  for (const f of run.files.values()) {
    if (passes(f)) out.push(f);
  }
  out.sort((a, b) => (b.e - a.e) || (b.w - a.w) || (b.i - a.i) || a.rel.localeCompare(b.rel));
  return out;
}

function schedule() {
  if (renderRaf || !overlay || overlay.hidden) return;
  renderRaf = requestAnimationFrame(render);
}

function chip(f, label, n, cls) {
  return '<button type="button" class="ide-dbg-chip ' + cls + (filter === f ? ' on' : '') + '" data-act="filter" data-f="' + f + '">' +
    label + '<span>' + n + '</span></button>';
}

function card(label, value, cls) {
  return '<div class="ide-dbg-card ' + cls + '"><b>' + value + '</b><span>' + label + '</span></div>';
}

function renderSummary(st) {
  const done = run.scanned + run.skipped;
  let pct = 0;
  if (run.total) pct = Math.min(100, Math.round((done / run.total) * 100));
  else if (run.done) pct = 100;
  let status;
  if (run.error) {
    status = '<span class="ide-dbg-status err">' + esc(run.error) + '</span>';
  } else if (run.running) {
    status = '<span class="ide-dbg-status run">Scanning ' + done + ' of ' + run.total + ' files...</span>';
  } else if (run.stopped) {
    status = '<span class="ide-dbg-status">Stopped after ' + done + ' of ' + run.total + ' files.</span>';
  } else {
    status = '<span class="ide-dbg-status ok">Finished in ' + (run.ms / 1000).toFixed(1) + 's. ' + run.scanned + ' files checked.</span>';
  }
  const trunc = run.truncated ? '<span class="ide-dbg-status warn">Only the first 6000 matching files were scanned.</span>' : '';
  els.sum.innerHTML =
    '<div class="ide-dbg-prog"><div class="ide-dbg-prog-fill' + (run.running ? ' run' : '') + '" style="width:' + pct + '%"></div></div>' +
    '<div class="ide-dbg-sumrow">' +
      '<div class="ide-dbg-cards">' +
        card('Files with errors', st.fe, st.fe ? 'e' : '') +
        card('Errors', st.te, st.te ? 'e' : '') +
        card('Warnings', st.tw, st.tw ? 'w' : '') +
        card('Info', st.ti, st.ti ? 'i' : '') +
        card('Clean files', run.clean, 'ok') +
      '</div>' +
      '<div class="ide-dbg-stat">' + status + trunc + '</div>' +
    '</div>';
  els.stop.hidden = !run.running;
  els.rerun.disabled = run.running;
}

function renderChips(st) {
  els.chips.innerHTML =
    chip('errors', 'Errors', st.fe, 'e') +
    chip('warnings', 'Warnings', st.fw, 'w') +
    chip('all', 'All problems', st.files, '');
}

function rowHtml(f) {
  let top = 'i';
  if (f.e) top = 'e';
  else if (f.w) top = 'w';
  return '<div class="ide-dbg-row' + (f.file === sel ? ' sel' : '') + '" data-file="' + attr(f.file) + '" title="' + attr(f.rel) + '">' +
    '<span class="ide-dbg-dot ' + top + '"></span>' +
    '<span class="ide-dbg-name">' + esc(baseName(f.rel)) + '</span>' +
    '<span class="ide-dbg-dir">' + esc(dirName(f.rel)) + '</span>' +
    '<span class="ide-dbg-nums">' +
      (f.e ? '<b class="e">' + f.e + '</b>' : '') +
      (f.w ? '<b class="w">' + f.w + '</b>' : '') +
      (f.i ? '<b class="i">' + f.i + '</b>' : '') +
    '</span>' +
  '</div>';
}

function emptyMessage(st) {
  if (run.error) return 'The scan could not finish.';
  if (run.running && !st.files) return 'Scanning files...';
  if (!st.files) return run.done ? 'No problems found in ' + run.scanned + ' files.' : 'No problems found yet.';
  if (filter === 'errors') return 'No files with errors here. Switch to All problems to see warnings and hints.';
  return 'No files match this filter.';
}

function renderList(list) {
  const keep = els.list.scrollTop;
  if (!list.length) {
    els.list.innerHTML = '<div class="ide-dbg-empty">' + esc(emptyMessage(stats())) + '</div>';
    return;
  }
  const shown = list.slice(0, MAX_ROWS);
  let html = shown.map(rowHtml).join('');
  if (list.length > MAX_ROWS) html += '<div class="ide-dbg-empty">Showing the first ' + MAX_ROWS + ' of ' + list.length + ' files. Use the search box to narrow down.</div>';
  els.list.innerHTML = html;
  els.list.scrollTop = keep;
}

function renderDetail(cur) {
  if (!cur) {
    els.detail.innerHTML = '<div class="ide-dbg-empty">Select a file to see its problems.</div>';
    detailFile = '';
    return;
  }
  const keep = detailFile === cur.file ? els.detail.scrollTop : 0;
  const rows = cur.diags.map((d, i) =>
    '<div class="ide-dbg-diag ' + SEV_CLS[d.sev] + '" data-i="' + i + '" title="Open in the editor">' +
      '<span class="ide-dbg-ln">' + d.line + ':' + (d.col + 1) + '</span>' +
      '<span class="ide-dbg-sev ' + SEV_CLS[d.sev] + '">' + SEV_ICON[d.sev] + '</span>' +
      '<span class="ide-dbg-msg">' + esc(d.msg) + '</span>' +
      '<span class="ide-dbg-src">' + esc(d.src || '') + '</span>' +
    '</div>'
  ).join('');
  els.detail.innerHTML =
    '<div class="ide-dbg-dhead">' +
      '<div class="ide-dbg-dpath" title="' + attr(cur.rel) + '">' + esc(cur.rel) + '</div>' +
      '<div class="ide-dbg-dnums">' +
        (cur.e ? '<b class="e">' + SEV_ICON.error + ' ' + cur.e + '</b>' : '') +
        (cur.w ? '<b class="w">' + SEV_ICON.warning + ' ' + cur.w + '</b>' : '') +
        (cur.i ? '<b class="i">' + SEV_ICON.info + ' ' + cur.i + '</b>' : '') +
      '</div>' +
      '<button type="button" class="ide-dbg-btn" data-act="openfile">Open file</button>' +
    '</div>' +
    '<div class="ide-dbg-dlist">' + rows + '</div>';
  const box = els.detail.querySelector('.ide-dbg-dlist');
  if (box) box.scrollTop = keep;
  detailFile = cur.file;
}

function render() {
  renderRaf = 0;
  if (!overlay || !run || mode !== 'run') return;
  let st = stats();
  if (run.done && !autoSwitched) {
    autoSwitched = true;
    if (filter === 'errors' && st.fe === 0 && st.files > 0) filter = 'all';
  }
  st = stats();
  renderSummary(st);
  renderChips(st);
  const list = visible();
  let cur = list.find((f) => f.file === sel) || null;
  if (!cur && list.length) {
    cur = list[0];
    sel = cur.file;
  }
  renderList(list);
  renderDetail(cur);
  els.foot.textContent = list.length + ' file(s) listed' + (run.repoName ? ' for ' + run.repoName : '');
}

function onBatch(b) {
  if (!run || !b || b.id !== run.id) return;
  if (Array.isArray(b.files)) {
    for (const f of b.files) run.files.set(f.file, f);
  }
  if (typeof b.total === 'number') run.total = b.total;
  if (typeof b.scanned === 'number') run.scanned = b.scanned;
  if (typeof b.clean === 'number') run.clean = b.clean;
  if (typeof b.skipped === 'number') run.skipped = b.skipped;
  if (b.truncated) run.truncated = true;
  if (b.error) run.error = b.error;
  if (b.done) {
    run.running = false;
    run.done = true;
    run.ms = b.ms || 0;
  }
  schedule();
}

function wire() {
  if (wired || !window.ideDebugAPI) return;
  wired = true;
  window.ideDebugAPI.onBatch(onBatch);
}

function cancelRun() {
  if (!run || !run.running) return;
  run.running = false;
  run.stopped = true;
  if (window.ideDebugAPI) {
    try {
      window.ideDebugAPI.cancel(run.id);
    } catch (_) {}
  }
}

function applyMode() {
  els.modal.classList.toggle('picking', mode === 'pick');
  if (mode === 'pick') {
    els.sub.textContent = 'Pick the extensions to run on this repo';
  } else if (run) {
    els.sub.textContent = 'Checking: ' + run.names.join(', ');
  }
}

function renderPick() {
  const ctx = getCtx ? getCtx() : {};
  const exts = ctx.extensions || [];
  const grid = els.pick.querySelector('.ide-dbg-pgrid');
  const keep = grid ? grid.scrollTop : 0;
  const canBack = !!run && run.key === keyOf(ctx);
  els.pick.innerHTML = pickerHtml(exts, picked, canBack);
  const next = els.pick.querySelector('.ide-dbg-pgrid');
  if (next) next.scrollTop = keep;
}

function showPicker(reset) {
  const ctx = getCtx ? getCtx() : {};
  const exts = ctx.extensions || [];
  if (reset) {
    const saved = loadPicked(ctx.root);
    picked = new Set(exts.filter((e) => !saved || saved.has(e.id)).map((e) => e.id));
    if (!picked.size) picked = new Set(exts.map((e) => e.id));
  }
  mode = 'pick';
  applyMode();
  renderPick();
}

function togglePick(id) {
  if (picked.has(id)) picked.delete(id);
  else picked.add(id);
  renderPick();
}

function pickAll(on) {
  const ctx = getCtx ? getCtx() : {};
  picked = on ? new Set((ctx.extensions || []).map((e) => e.id)) : new Set();
  renderPick();
}

async function startScan() {
  cancelRun();
  const ctx = getCtx ? getCtx() : {};
  const chosen = (ctx.extensions || []).filter((e) => picked.has(e.id));
  const ids = chosen.map((e) => e.id);
  const fileExts = [];
  for (const e of chosen) {
    for (const x of e.fileExts || []) {
      if (fileExts.indexOf(x) === -1) fileExts.push(x);
    }
  }
  savePicked(ctx.root, picked);
  const id = 'dbg' + (++seq) + '-' + Date.now();
  run = {
    id,
    key: keyOf(ctx),
    root: ctx.root || '',
    repoName: ctx.repoName || '',
    names: chosen.map((e) => e.name),
    files: new Map(),
    total: 0,
    scanned: 0,
    clean: 0,
    skipped: 0,
    running: false,
    done: false,
    stopped: false,
    truncated: false,
    ms: 0,
    error: '',
  };
  sel = '';
  detailFile = '';
  autoSwitched = false;
  mode = 'run';
  applyMode();
  if (!window.ideDebugAPI) {
    run.error = 'The debug service is not loaded yet. Fully restart the app.';
  } else if (!run.root) {
    run.error = 'No folder opened.';
  } else if (!ids.length) {
    run.error = 'Select at least one extension to run.';
  }
  if (run.error) {
    run.done = true;
    render();
    return;
  }
  run.running = true;
  render();
  try {
    const res = await window.ideDebugAPI.start({ id, root: run.root, ids, exts: fileExts });
    if (run && run.id === id && res && !res.success) {
      run.running = false;
      run.done = true;
      run.error = res.error || 'Scan failed';
      schedule();
    }
  } catch (err) {
    if (run && run.id === id) {
      run.running = false;
      run.done = true;
      run.error = err && err.message ? err.message : 'Scan failed';
      schedule();
    }
  }
}

function openAt(file, d) {
  close();
  document.dispatchEvent(new CustomEvent('ide:ext-close'));
  document.dispatchEvent(new CustomEvent('ide:open-at', {
    detail: { path: file, line: d.line, col: d.col, len: d.len },
  }));
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (_) {
    ok = false;
  }
  ta.remove();
  return ok;
}

function reportText() {
  const list = visible();
  const st = stats();
  const lines = [];
  lines.push('Debug report' + (run.repoName ? ' for ' + run.repoName : ''));
  lines.push('Extensions: ' + run.names.join(', '));
  lines.push(st.fe + ' file(s) with errors, ' + st.te + ' error(s), ' + st.tw + ' warning(s), ' + st.ti + ' info. Filter: ' + filter + '.');
  for (const f of list) {
    lines.push('');
    lines.push(f.rel + '  (' + f.e + ' errors, ' + f.w + ' warnings, ' + f.i + ' info)');
    for (const d of f.diags) {
      lines.push('  ' + d.line + ':' + (d.col + 1) + ' ' + d.sev + ' ' + d.msg + (d.src ? ' [' + d.src + ']' : ''));
    }
  }
  return lines.join('\n');
}

async function copyReport(btn) {
  if (!run) return;
  const text = reportText();
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (_) {
    ok = fallbackCopy(text);
  }
  btn.textContent = ok ? 'Copied' : 'Copy failed';
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    btn.textContent = 'Copy report';
  }, 1500);
}

function onClick(e) {
  if (e.target === overlay) {
    close();
    return;
  }
  const b = e.target.closest('[data-act]');
  if (b) {
    const act = b.dataset.act;
    if (act === 'close') close();
    else if (act === 'stop') {
      cancelRun();
      schedule();
    } else if (act === 'rerun') startScan();
    else if (act === 'copy') copyReport(b);
    else if (act === 'repick') {
      cancelRun();
      showPicker(false);
    } else if (act === 'pick-toggle') togglePick(b.dataset.id);
    else if (act === 'pick-all') pickAll(true);
    else if (act === 'pick-none') pickAll(false);
    else if (act === 'pick-run') startScan();
    else if (act === 'pick-back') {
      mode = 'run';
      applyMode();
      render();
    } else if (act === 'filter') {
      filter = b.dataset.f || 'errors';
      render();
    } else if (act === 'openfile') {
      const f = run && run.files.get(sel);
      if (!f) return;
      const d = f.diags.find((x) => x.sev === 'error') || f.diags[0];
      if (d) openAt(f.file, d);
    }
    return;
  }
  const dEl = e.target.closest('.ide-dbg-diag');
  if (dEl) {
    const f = run && run.files.get(sel);
    const d = f ? f.diags[Number(dEl.dataset.i)] : null;
    if (f && d) openAt(f.file, d);
    return;
  }
  const row = e.target.closest('.ide-dbg-row');
  if (row) {
    sel = row.dataset.file || '';
    render();
  }
}

function onKey(e) {
  if (e.key !== 'Escape' || !overlay || overlay.hidden) return;
  e.preventDefault();
  e.stopPropagation();
  close();
}

function build() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'ide-dbg-overlay ide-root';
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="ide-dbg-modal picking">' +
      '<div class="ide-dbg-head">' +
        '<span class="ide-dbg-title">Debug</span>' +
        '<span class="ide-dbg-sub"></span>' +
        '<button type="button" class="ide-dbg-btn" data-act="stop" hidden>Stop</button>' +
        '<button type="button" class="ide-dbg-btn" data-act="repick">Change extensions</button>' +
        '<button type="button" class="ide-dbg-btn" data-act="rerun">Run again</button>' +
        '<button type="button" class="ide-dbg-btn" data-act="copy">Copy report</button>' +
        '<button type="button" class="ide-dbg-x" data-act="close" title="Close">&times;</button>' +
      '</div>' +
      '<div class="ide-dbg-pick"></div>' +
      '<div class="ide-dbg-sum"></div>' +
      '<div class="ide-dbg-bar">' +
        '<div class="ide-dbg-chips"></div>' +
        '<input class="ide-dbg-q" type="text" placeholder="Filter files by path" spellcheck="false" autocomplete="off" />' +
      '</div>' +
      '<div class="ide-dbg-body">' +
        '<div class="ide-dbg-list"></div>' +
        '<div class="ide-dbg-detail"></div>' +
      '</div>' +
      '<div class="ide-dbg-foot"><span class="ide-dbg-foot-n"></span><span class="ide-dbg-foot-hint">Click a problem to jump to it in the editor.</span></div>' +
    '</div>';
  document.body.appendChild(overlay);
  els = {
    modal: overlay.querySelector('.ide-dbg-modal'),
    sub: overlay.querySelector('.ide-dbg-sub'),
    pick: overlay.querySelector('.ide-dbg-pick'),
    sum: overlay.querySelector('.ide-dbg-sum'),
    chips: overlay.querySelector('.ide-dbg-chips'),
    q: overlay.querySelector('.ide-dbg-q'),
    list: overlay.querySelector('.ide-dbg-list'),
    detail: overlay.querySelector('.ide-dbg-detail'),
    foot: overlay.querySelector('.ide-dbg-foot-n'),
    stop: overlay.querySelector('[data-act="stop"]'),
    rerun: overlay.querySelector('[data-act="rerun"]'),
  };
  els.q.addEventListener('input', () => {
    query = els.q.value.trim().toLowerCase();
    schedule();
  });
  els.q.addEventListener('keydown', (e) => e.stopPropagation());
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener('click', onClick);
  document.addEventListener('ide:close-search', () => close());
}

export function isOpen() {
  return !!overlay && !overlay.hidden;
}

export function open(ctxFn) {
  getCtx = ctxFn;
  build();
  wire();
  overlay.hidden = false;
  document.addEventListener('keydown', onKey, true);
  const ctx = getCtx ? getCtx() : {};
  if (!run || run.key !== keyOf(ctx)) {
    cancelRun();
    showPicker(true);
  } else if (mode === 'pick') {
    showPicker(false);
  } else {
    applyMode();
    render();
  }
}

export function close() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.removeEventListener('keydown', onKey, true);
}