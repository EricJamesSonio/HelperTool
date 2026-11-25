/**
 * PDF Master UI: PDF Inspector workspace.
 * Other workspaces (PDF to DOCX, PDF Writer) are shown as planned tabs.
 */

const api = () => window.pdfMasterAPI || null;

const CLASS_LABEL = { text: 'Text', image: 'Scanned', mixed: 'Mixed', unknown: 'Unknown' };
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'text', label: 'Text' },
  { id: 'image', label: 'Scanned' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'unknown', label: 'Unknown' },
  { id: 'ocr', label: 'Needs OCR' },
];
const PREVIEW_CACHE_MAX = 12;
const MISSING_BRIDGE = 'The PDF Master bridge is not loaded. Fully restart the app.';

let root = null;
let observer = null;
let queue = [];
let pumping = false;
let toastTimer = 0;

const S = {
  status: null,
  statusLoading: false,
  activeTab: 'inspector',
  busy: false,
  convertBusy: false,
  convertProgress: null,
  convertResult: null,
  jobId: '',
  progress: null,
  filePath: '',
  report: null,
  error: '',
  selected: 0,
  filter: 'all',
  token: 0,
  previewCache: new Map(),
  thumbCache: new Map(),
};

function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

function fmtDims(w, h) {
  if (!w || !h) return 'Unknown';
  const mmW = Math.round((w / 72) * 25.4);
  const mmH = Math.round((h / 72) * 25.4);
  return Math.round(w) + ' x ' + Math.round(h) + ' pt (' + mmW + ' x ' + mmH + ' mm)';
}

function baseName(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
}

const $ = (sel) => (root ? root.querySelector(sel) : null);

function setHtml(sel, html) {
  const el = $(sel);
  if (el) el.innerHTML = html;
}

function toast(message, bad) {
  const el = document.createElement('div');
  el.className = 'pdfm-toast' + (bad ? ' pdfm-toast-bad' : '');
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), bad ? 4000 : 2500);
}

/* ---------- mount / lifecycle ---------- */

export function mount(container) {
  root = container;
  root.innerHTML =
    '<div class="pdfm">' +
      '<div class="pdfm-tabs" id="pdfmTabs"></div>' +
      '<div class="pdfm-inspector" id="pdfmInspector">' +
        '<div id="pdfmSource"></div>' +
        '<div class="pdfm-main">' +
        '<aside class="pdfm-side" id="pdfmSide"></aside>' +
        '<section class="pdfm-detail" id="pdfmDetail"></section>' +
        '</div>' +
      '</div>' +
      '<div class="pdfm-converter" id="pdfmConverter"></div>' +
    '</div>';
  root.addEventListener('click', onClick);
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('dragleave', onDragLeave);
  root.addEventListener('drop', onDrop);
  root.addEventListener('pdfm:reload', (e) => {
    const target = e && e.detail && e.detail.path;
    if (target) loadFile(String(target));
  });
  const bridge = api();
  if (bridge && bridge.onProgress) bridge.onProgress(onProgress);
  renderTabs();
  renderSource();
  renderList();
  renderDetail();
  renderConverter();
}

export function onShow() {
  if (!S.status || !S.status.available) refreshStatus();
}

async function refreshStatus() {
  const bridge = api();
  if (!bridge) {
    S.status = { available: false, error: MISSING_BRIDGE };
    renderTabs();
    renderSource();
    return;
  }
  S.statusLoading = true;
  renderTabs();
  try {
    S.status = await bridge.status();
  } catch (err) {
    S.status = { available: false, error: err && err.message ? err.message : String(err) };
  }
  S.statusLoading = false;
  renderTabs();
  renderSource();
}

/* ---------- rendering ---------- */

function renderTabs() {
  let chip;
  if (S.statusLoading || !S.status) {
    chip = '<span class="pdfm-chip">Engine: checking...</span>';
  } else if (S.status.available) {
    const how = S.status.launcher === 'bundled' ? 'bundled' : 'Python ' + (S.status.python || '');
    chip = '<span class="pdfm-chip pdfm-chip-ok">Engine ready (' + esc(how.trim()) + ')</span>';
  } else {
    chip = '<span class="pdfm-chip pdfm-chip-bad">Engine unavailable</span>' +
      '<button type="button" class="pdfm-btn pdfm-btn-small" data-act="retry">Retry</button>';
  }
  setHtml('#pdfmTabs',
    '<button type="button" class="pdfm-tab' + (S.activeTab === 'inspector' ? ' active' : '') + '" data-act="tab" data-tab="inspector">Inspector</button>' +
    '<button type="button" class="pdfm-tab' + (S.activeTab === 'converter' ? ' active' : '') + '" data-act="tab" data-tab="converter">PDF to DOCX</button>' +
    '<button type="button" class="pdfm-tab' + (S.activeTab === 'writer' ? ' active' : '') + '" data-act="tab" data-tab="writer">PDF Writer</button>' +
    '<span class="pdfm-tabs-right">' + chip + '</span>');
  const inspector = $('#pdfmInspector');
  const converter = $('#pdfmConverter');
  const writerPane = $('#pdfmWriter');
  if (inspector) inspector.classList.toggle('hidden', S.activeTab !== 'inspector');
  if (converter) converter.classList.toggle('hidden', S.activeTab !== 'converter');
  if (writerPane) writerPane.classList.toggle('hidden', S.activeTab !== 'writer');
}

function renderConverter() {
  const report = S.report;
  let summary = '';
  if (report) {
    summary =
      '<div class="pdfm-convert-file">' +
        '<div><div class="pdfm-file-name" title="' + esc(S.filePath) + '">' + esc(report.file.name) + '</div>' +
        '<div class="pdfm-file-sub">' + esc(fmtBytes(report.file.size)) + ' | ' + report.document.pageCount + ' pages</div></div>' +
        '<div class="pdfm-counts">' +
          '<span class="pdfm-badge pdfm-badge-text">Text ' + report.summary.counts.text + '</span>' +
          '<span class="pdfm-badge pdfm-badge-image">Scanned ' + report.summary.counts.image + '</span>' +
          '<span class="pdfm-badge pdfm-badge-mixed">Mixed ' + report.summary.counts.mixed + '</span>' +
        '</div>' +
      '</div>';
  }

  let progress = '';
  if (S.convertBusy) {
    const p = S.convertProgress || {};
    progress =
      '<div class="pdfm-convert-progress">' +
        '<div class="pdfm-busy-top"><div class="pdfm-file-sub" id="pdfmConvertProgressMsg">' + esc(p.message || 'Starting conversion...') + '</div>' +
        '<button type="button" class="pdfm-btn" data-act="cancel">Cancel</button></div>' +
        '<div class="pdfm-bar"><div class="pdfm-bar-fill" id="pdfmConvertProgressFill" style="width:' + (Number(p.percent) || 0) + '%"></div></div>' +
      '</div>';
  }

  let result = '';
  if (S.convertResult) {
    const r = S.convertResult;
    result =
      '<div class="pdfm-convert-result">' +
        '<div class="pdfm-drop-title">DOCX created</div>' +
        '<div class="pdfm-file-sub">' + esc(r.outputPath || '') + '</div>' +
        (r.warnings && r.warnings.length
          ? r.warnings.map((warning) => '<div class="pdfm-warn">Warning: ' + esc(warning) + '</div>').join('')
          : '') +
      '</div>';
  }

  let engineNote = '';
  if (S.status && S.status.available === false) {
    engineNote = '<div class="pdfm-error">' + esc(S.status.error || 'The document engine is not available.') + '</div>';
  } else if (S.status && S.status.available && report) {
    engineNote = '<div class="pdfm-warn">Pages are embedded as images to preserve layout. Text inside the DOCX pages will not be directly editable.</div>';
  }

  setHtml('#pdfmConverter',
    '<div class="pdfm-convert-workspace">' +
      '<div class="pdfm-convert-header">' +
        '<div><div class="pdfm-drop-title">PDF to DOCX</div>' +
        '<div class="pdfm-file-sub">Preserve the PDF appearance by placing each page as a high-resolution image in Word.</div></div>' +
        '<button type="button" class="pdfm-btn pdfm-btn-primary" data-act="convert"' +
          (!report || S.convertBusy || !(S.status && S.status.available) ? ' disabled' : '') + '>Convert to DOCX</button>' +
      '</div>' +
      (summary || '<div class="pdfm-empty pdfm-empty-big">Open a PDF in the Inspector tab before converting it to DOCX.</div>') +
      engineNote +
      progress +
      result +
    '</div>');
}

function renderSource() {
  let html = '';
  if (S.busy) {
    const p = S.progress || {};
    html = '<div class="pdfm-card">' +
      '<div class="pdfm-busy-top"><div><div class="pdfm-file-name">' + esc(baseName(S.filePath)) + '</div>' +
      '<div class="pdfm-file-sub" id="pdfmProgressMsg">' + esc(p.message || 'Working...') + '</div></div>' +
      '<button type="button" class="pdfm-btn" data-act="cancel">Cancel</button></div>' +
      '<div class="pdfm-bar"><div class="pdfm-bar-fill" id="pdfmProgressFill" style="width:' + (Number(p.percent) || 0) + '%"></div></div>' +
    '</div>';
  } else if (!S.report) {
    let note = '';
    if (S.error) note = '<div class="pdfm-error">' + esc(S.error) + '</div>';
    else if (S.status && S.status.available === false) note = '<div class="pdfm-error">' + esc(S.status.error || 'The document engine is not available.') + '</div>';
    html = '<div class="pdfm-card pdfm-drop" id="pdfmDrop">' +
      '<div class="pdfm-drop-title">Inspect a PDF</div>' +
      '<div class="pdfm-file-sub">Drop a PDF here or open one. Everything is analyzed on this computer and the original file is never changed.</div>' +
      '<div class="pdfm-drop-actions"><button type="button" class="pdfm-btn pdfm-btn-primary" data-act="open">Open PDF</button></div>' +
      note +
    '</div>';
  } else {
    html = summaryHtml();
  }
  setHtml('#pdfmSource', html);
}

function summaryHtml() {
  const r = S.report;
  const c = r.summary.counts;
  const meta = r.document.metadata || {};
  const metaKeys = ['Title', 'Author', 'Producer', 'Creator', 'CreationDate'];
  const metaHtml = metaKeys.filter((k) => meta[k]).map((k) =>
    '<span class="pdfm-meta"><b>' + esc(k) + ':</b> ' + esc(meta[k]) + '</span>').join('');
  const perm = r.document.permissions;
  const permHtml = perm
    ? '<span class="pdfm-meta"><b>Permissions:</b> print ' + (perm.print ? 'yes' : 'no') + ', copy ' + (perm.copy ? 'yes' : 'no') + ', modify ' + (perm.modify ? 'yes' : 'no') + '</span>'
    : '';
  const warns = (r.warnings || []).map((w) => '<div class="pdfm-warn">Warning: ' + esc(w) + '</div>').join('');
  return '<div class="pdfm-card">' +
    '<div class="pdfm-file">' +
      '<div class="pdfm-file-main"><div class="pdfm-file-name" title="' + esc(S.filePath) + '">' + esc(r.file.name) + '</div>' +
      '<div class="pdfm-file-sub">' + esc(fmtBytes(r.file.size)) + ' | ' + r.document.pageCount + ' pages' +
      (r.document.version ? ' | PDF ' + esc(r.document.version) : '') +
      ' | SHA-256 ' + esc(String(r.file.sha256).slice(0, 12)) + '...</div></div>' +
      '<div class="pdfm-counts">' +
        '<span class="pdfm-badge pdfm-badge-text">Text ' + c.text + '</span>' +
        '<span class="pdfm-badge pdfm-badge-image">Scanned ' + c.image + '</span>' +
        '<span class="pdfm-badge pdfm-badge-mixed">Mixed ' + c.mixed + '</span>' +
        '<span class="pdfm-badge pdfm-badge-unknown">Unknown ' + c.unknown + '</span>' +
      '</div>' +
      '<div class="pdfm-file-actions">' +
        '<button type="button" class="pdfm-btn" data-act="open">Open another</button>' +
        '<button type="button" class="pdfm-btn" data-act="export">Export report</button>' +
        '<button type="button" class="pdfm-btn" disabled title="Local OCR is planned for a later release">Run OCR (planned)</button>' +
      '</div>' +
    '</div>' +
    ((metaHtml || permHtml) ? '<div class="pdfm-metarow">' + metaHtml + permHtml + '</div>' : '') +
    warns +
  '</div>';
}

function matches(p) {
  if (S.filter === 'all') return true;
  if (S.filter === 'ocr') return !!p.needsOcr;
  return p.classification === S.filter;
}

function renderList() {
  if (!S.report) {
    setHtml('#pdfmSide', '<div class="pdfm-empty">No document open.</div>');
    return;
  }
  const pages = S.report.pages;
  const chips = FILTERS.map((f) => {
    const n = pages.filter((p) => (f.id === 'all' ? true : f.id === 'ocr' ? p.needsOcr : p.classification === f.id)).length;
    return '<button type="button" class="pdfm-fchip' + (S.filter === f.id ? ' on' : '') + '" data-act="filter" data-filter="' + f.id + '">' +
      esc(f.label) + '<span class="pdfm-fn">' + n + '</span></button>';
  }).join('');
  const rows = pages.filter(matches).map((p) => {
    const thumb = S.thumbCache.get(p.index);
    return '<button type="button" class="pdfm-row' + (p.index === S.selected ? ' active' : '') + '" data-act="select" data-page="' + p.index + '">' +
      '<span class="pdfm-thumb" data-page="' + p.index + '">' + (thumb ? '<img alt="" src="' + thumb + '">' : '') + '</span>' +
      '<span class="pdfm-row-info"><span class="pdfm-row-title">Page ' + p.number + '</span>' +
      '<span class="pdfm-row-sub">' + p.chars + ' chars | ' + p.images + ' images</span></span>' +
      '<span class="pdfm-badge pdfm-badge-' + esc(p.classification) + '">' + esc(CLASS_LABEL[p.classification] || 'Unknown') + '</span>' +
    '</button>';
  }).join('');
  setHtml('#pdfmSide',
    '<div class="pdfm-filters">' + chips + '</div>' +
    '<div class="pdfm-rows" id="pdfmRows">' + (rows || '<div class="pdfm-empty">No pages match this filter.</div>') + '</div>');
  observeThumbs();
}

function renderDetail() {
  if (!S.report) {
    setHtml('#pdfmDetail',
      '<div class="pdfm-empty pdfm-empty-big">Open a PDF to see page previews, extracted text and scan detection.<br>' +
      'Pages are labeled Text, Scanned, Mixed or Unknown so you can decide how to process them.</div>');
    return;
  }
  const pages = S.report.pages;
  const p = pages[S.selected];
  if (!p) return;
  const facts = [
    ['Page', p.number + ' of ' + pages.length],
    ['Size', fmtDims(p.width, p.height)],
    ['Orientation', p.orientation + (p.rotation ? ' (rotated ' + p.rotation + ' deg)' : '')],
    ['Classification', CLASS_LABEL[p.classification] || 'Unknown'],
    ['Characters', p.chars],
    ['Words', p.words],
    ['Images', p.images],
    ['Image coverage', Math.round(p.imageCoverage * 100) + '%' + (p.fullPageImage ? ' (full-page image)' : '')],
    ['Vector objects', p.vectorObjects],
    ['OCR needed', p.needsOcr ? 'Yes' : 'No'],
  ].map((kv) => '<div class="pdfm-kv"><span class="pdfm-k">' + esc(kv[0]) + '</span><span class="pdfm-v">' + esc(kv[1]) + '</span></div>').join('');
  let textHtml;
  if (p.error) textHtml = '<div class="pdfm-error">' + esc(p.error) + '</div>';
  else if (p.textPreview) textHtml = '<pre class="pdfm-text">' + esc(p.textPreview) + (p.textTruncated ? '\n...' : '') + '</pre>';
  else textHtml = '<div class="pdfm-empty">No selectable text on this page.' + (p.needsOcr ? ' It looks like a scanned image, so OCR would be needed.' : '') + '</div>';
  setHtml('#pdfmDetail',
    '<div class="pdfm-detail-head">' +
      '<button type="button" class="pdfm-btn pdfm-btn-small" data-act="prev"' + (S.selected <= 0 ? ' disabled' : '') + '>Previous</button>' +
      '<span class="pdfm-detail-title">Page ' + p.number + '</span>' +
      '<button type="button" class="pdfm-btn pdfm-btn-small" data-act="next"' + (S.selected >= pages.length - 1 ? ' disabled' : '') + '>Next</button>' +
    '</div>' +
    '<div class="pdfm-preview" id="pdfmPreviewBox"><div class="pdfm-loading">Rendering page...</div></div>' +
    '<div class="pdfm-facts">' + facts + '</div>' +
    '<h4 class="pdfm-h4">Extracted text (native)</h4>' + textHtml);
}

/* ---------- actions ---------- */

function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || !root.contains(btn) || btn.disabled) return;
  const act = btn.dataset.act;
  if (act === 'tab') {
    const tab = btn.dataset.tab;
    S.activeTab = tab === 'converter' || tab === 'writer' ? tab : 'inspector';
    renderTabs();
    if (S.activeTab === 'converter') renderConverter();
    root.dispatchEvent(new CustomEvent('pdfm:tab', { detail: { tab: S.activeTab } }));
  }
  else if (act === 'open') pick();
  else if (act === 'cancel') cancel();
  else if (act === 'retry') refreshStatus();
  else if (act === 'export') exportReport();
  else if (act === 'convert') convertToDocx();
  else if (act === 'select') select(Number(btn.dataset.page));
  else if (act === 'prev') select(S.selected - 1);
  else if (act === 'next') select(S.selected + 1);
  else if (act === 'filter') {
    S.filter = btn.dataset.filter || 'all';
    renderList();
  }
}

async function pick() {
  const bridge = api();
  if (!bridge) {
    toast(MISSING_BRIDGE, true);
    return;
  }
  if (S.busy) return;
  try {
    const res = await bridge.pickPdf();
    if (res && res.success && res.path) loadFile(res.path);
    else if (res && res.success === false) toast(res.error || 'Could not open the file picker.', true);
  } catch (err) {
    toast(err && err.message ? err.message : String(err), true);
  }
}

async function loadFile(filePath) {
  const bridge = api();
  if (!bridge || S.busy) return;
  S.token += 1;
  const token = S.token;
  S.busy = true;
  S.error = '';
  S.jobId = 'pm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  S.progress = { percent: 0, message: 'Starting...' };
  S.filePath = filePath;
  S.report = null;
  S.convertResult = null;
  S.selected = 0;
  S.filter = 'all';
  S.thumbCache.clear();
  S.previewCache.clear();
  queue = [];
  if (root) root.dispatchEvent(new CustomEvent('pdfm:file', { detail: { filePath: '', report: null } }));
  renderSource();
  renderList();
  renderDetail();
  let res;
  try {
    res = await bridge.inspect({ jobId: S.jobId, inputPath: filePath });
  } catch (err) {
    res = { success: false, error: err && err.message ? err.message : String(err) };
  }
  if (token !== S.token) return;
  S.busy = false;
  S.progress = null;
  if (res && res.success && res.report) {
    S.report = res.report;
  } else {
    S.filePath = '';
    S.error = res && res.code === 'CANCELLED' ? 'Inspection cancelled.' : ((res && res.error) || 'The inspection failed.');
  }
  renderTabs();
  renderSource();
  renderList();
  renderDetail();
  if (root) {
    root.dispatchEvent(new CustomEvent('pdfm:file', {
      detail: { filePath: S.report ? S.filePath : '', report: S.report },
    }));
  }
  if (S.report) loadPreview(0);
}

async function cancel() {
  const bridge = api();
  if (!bridge || (!S.busy && !S.convertBusy)) return;
  try {
    await bridge.cancel(S.jobId);
  } catch (_) {}
}

function onProgress(d) {
  if (!d) return;
  if (d.jobId !== S.jobId) {
    if (root) root.dispatchEvent(new CustomEvent('pdfm:progress', { detail: d }));
    return;
  }
  if (S.busy) {
    S.progress = d;
    const fill = $('#pdfmProgressFill');
    if (fill) fill.style.width = (Number(d.percent) || 0) + '%';
    const msg = $('#pdfmProgressMsg');
    if (msg) msg.textContent = d.message || '';
  } else if (S.convertBusy) {
    S.convertProgress = d;
    const fill = $('#pdfmConvertProgressFill');
    if (fill) fill.style.width = (Number(d.percent) || 0) + '%';
    const msg = $('#pdfmConvertProgressMsg');
    if (msg) msg.textContent = d.message || '';
  }
}

function select(i) {
  if (!S.report || !(i >= 0 && i < S.report.pages.length)) return;
  S.selected = i;
  root.querySelectorAll('.pdfm-row').forEach((row) => {
    const on = Number(row.dataset.page) === i;
    row.classList.toggle('active', on);
    if (on && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  });
  renderDetail();
  loadPreview(i);
}

async function loadPreview(i) {
  const bridge = api();
  if (!bridge || !S.report) return;
  const token = S.token;
  const key = S.filePath + '|' + i;
  const show = (item) => {
    const box = $('#pdfmPreviewBox');
    if (box) box.innerHTML = '<img class="pdfm-preview-img" alt="Page preview" src="' + item.dataUrl + '">';
  };
  const cached = S.previewCache.get(key);
  if (cached) {
    show(cached);
    return;
  }
  let res;
  try {
    res = await bridge.renderPage({ inputPath: S.filePath, pageIndex: i, maxWidth: 900, format: 'png' });
  } catch (err) {
    res = { success: false, error: err && err.message ? err.message : String(err) };
  }
  if (token !== S.token || S.selected !== i) return;
  if (res && res.success) {
    S.previewCache.set(key, res);
    if (S.previewCache.size > PREVIEW_CACHE_MAX) S.previewCache.delete(S.previewCache.keys().next().value);
    show(res);
  } else {
    const box = $('#pdfmPreviewBox');
    if (box) box.innerHTML = '<div class="pdfm-error">' + esc((res && res.error) || 'The preview could not be rendered.') + '</div>';
  }
}

async function exportReport() {
  const bridge = api();
  if (!bridge || !S.report) return;
  const name = baseName(S.filePath).replace(/\.pdf$/i, '') + '.inspection.json';
  try {
    const res = await bridge.saveReport({ report: S.report, suggestedName: name });
    if (res && res.success && res.path) toast('Report saved');
    else if (res && res.success === false) toast(res.error || 'Could not save the report.', true);
  } catch (err) {
    toast(err && err.message ? err.message : String(err), true);
  }
}

async function convertToDocx() {
  const bridge = api();
  if (!bridge || S.convertBusy || !S.report || !S.filePath) return;
  if (!S.status || !S.status.available) {
    toast('The PDF engine is not available.', true);
    return;
  }
  S.convertBusy = true;
  S.convertProgress = { percent: 0, message: 'Preparing conversion...' };
  S.convertResult = null;
  S.jobId = 'pmc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  renderConverter();
  let res;
  try {
    res = await bridge.convertToDocx({ jobId: S.jobId, inputPath: S.filePath });
  } catch (err) {
    res = { success: false, error: err && err.message ? err.message : String(err) };
  }
  S.convertBusy = false;
  S.convertProgress = null;
  if (res && res.success && !res.canceled) {
    S.convertResult = res;
    toast('DOCX created');
  } else if (res && res.success === false) {
    toast(res.code === 'CANCELLED' ? 'Conversion cancelled.' : (res.error || 'The conversion failed.'), res.code !== 'CANCELLED');
  } else if (res && res.canceled) {
    toast('Conversion cancelled.');
  }
  renderConverter();
}

/* ---------- thumbnails ---------- */

function observeThumbs() {
  if (observer) observer.disconnect();
  queue = [];
  const list = $('#pdfmRows');
  if (!list || typeof IntersectionObserver !== 'function') return;
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const i = Number(entry.target.dataset.page);
      observer.unobserve(entry.target);
      if (!S.thumbCache.has(i) && queue.indexOf(i) === -1) queue.push(i);
    }
    pumpThumbs();
  }, { root: list, rootMargin: '120px' });
  list.querySelectorAll('.pdfm-thumb[data-page]').forEach((el) => {
    if (!S.thumbCache.has(Number(el.dataset.page))) observer.observe(el);
  });
}

async function pumpThumbs() {
  if (pumping) return;
  const bridge = api();
  if (!bridge) return;
  pumping = true;
  const token = S.token;
  while (queue.length && token === S.token) {
    const i = queue.shift();
    try {
      const res = await bridge.renderPage({ inputPath: S.filePath, pageIndex: i, maxWidth: 120, format: 'jpeg' });
      if (token !== S.token) break;
      if (res && res.success) {
        S.thumbCache.set(i, res.dataUrl);
        const el = root ? root.querySelector('.pdfm-thumb[data-page="' + i + '"]') : null;
        if (el) el.innerHTML = '<img alt="" src="' + res.dataUrl + '">';
      }
    } catch (_) {}
  }
  pumping = false;
  if (queue.length) pumpThumbs();
}

/* ---------- drag and drop ---------- */

function onDragOver(e) {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
  e.preventDefault();
  root.classList.add('pdfm-dragging');
}

function onDragLeave(e) {
  if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove('pdfm-dragging');
}

function onDrop(e) {
  root.classList.remove('pdfm-dragging');
  if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
  e.preventDefault();
  const bridge = api();
  if (!bridge) {
    toast(MISSING_BRIDGE, true);
    return;
  }
  if (S.busy) return;
  const file = e.dataTransfer.files[0];
  if (!/\.pdf$/i.test(file.name || '')) {
    toast('Only .pdf files are supported.', true);
    return;
  }
  const p = bridge.getPathForFile ? bridge.getPathForFile(file) : '';
  if (!p) {
    toast('Could not read the dropped file path. Use Open PDF instead.', true);
    return;
  }
  loadFile(p);
}