/**
 * PDF Writer UI. Works on the PDF that is open in the Inspector tab.
 * Talks to the Inspector through DOM events on the panel container:
 *   pdfm:file, pdfm:tab, pdfm:progress (in) and pdfm:reload (out).
 */

import { buildSections, KIND_LABEL, pageLabel } from './writerModel.js';
import { checkText, findPlaceholders, fillPlaceholder } from './writerParser.js';
import { buildPrompt } from './writerPrompt.js';
import { dropSentence } from './writerParser.js';

const MISSING_BRIDGE = 'The PDF Writer bridge is not loaded. Fully restart the app.';
const CHECK_DELAY = 350;

const SKELETON =
  '<div class="pdfw">' +
    '<div class="pdfw-top" id="pdfwTop"></div>' +
    '<div class="pdfw-main">' +
      '<aside class="pdfw-side">' +
        '<div class="pdfw-side-head" id="pdfwSideHead"></div>' +
        '<div class="pdfw-side-list" id="pdfwSide"></div>' +
      '</aside>' +
      '<section class="pdfw-work">' +
        '<div class="pdfw-scroll">' +
          '<div id="pdfwPrompt"></div>' +
          '<div class="pdfw-card">' +
            '<div class="pdfw-step-head">' +
              '<span class="pdfw-num">2</span>' +
              '<div>' +
                '<div class="pdfw-title">Paste the polished text</div>' +
                '<div class="pdfw-sub">Paste the AI result with its [[SECTION: S#]] blocks. It is checked automatically.</div>' +
              '</div>' +
            '</div>' +
            '<textarea id="pdfwText" class="pdfw-textarea" spellcheck="false" ' +
              'placeholder="[[SECTION: S2]]&#10;# Heading&#10;&#10;Paragraph...&#10;[[END]]"></textarea>' +
            '<div class="pdfw-row pdfw-row-between">' +
              '<div class="pdfw-meta" id="pdfwMeta"></div>' +
              '<div class="pdfw-row">' +
                '<button type="button" class="pdfm-btn pdfm-btn-small" data-wact="paste">Paste from clipboard</button>' +
                '<button type="button" class="pdfm-btn pdfm-btn-small" data-wact="clear" disabled>Clear</button>' +
              '</div>' +
            '</div>' +
            '<div id="pdfwHolders"></div>' +
            '<div id="pdfwCheck"></div>' +
          '</div>' +
        '</div>' +
        '<div class="pdfw-dock" id="pdfwSave"></div>' +
      '</section>' +
    '</div>' +
  '</div>';

const W = {
  active: false,
  file: '',
  analysis: null,
  overrides: { splits: [], joins: [] },
  sections: [],
  prompt: '',
  text: '',
  check: null,
  holders: [],
  fills: {},
  saveMode: 'new',
  busy: '',
  jobId: '',
  progress: null,
  error: '',
  result: null,
  token: 0,
};

let host = null;
let el = null;
let toastTimer = 0;
let checkTimer = 0;

function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function $(sel) {
  return el ? el.querySelector(sel) : null;
}

function setHtml(sel, html) {
  const node = $(sel);
  if (node) node.innerHTML = html;
}

function baseName(p) {
  return String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
}

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

function toast(message, bad) {
  const node = document.createElement('div');
  node.className = 'pdfm-toast' + (bad ? ' pdfm-toast-bad' : '');
  node.textContent = message;
  document.body.appendChild(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), bad ? 4000 : 2500);
}

export function mount(container) {
  host = container;
  const shell = container.querySelector('.pdfm');
  if (!shell) return;
  el = document.createElement('div');
  el.id = 'pdfmWriter';
  el.className = 'pdfm-writer hidden';
  el.innerHTML = SKELETON;
  shell.appendChild(el);
  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', onKey);
  host.addEventListener('pdfm:file', (e) => onFile(e.detail));
  host.addEventListener('pdfm:tab', (e) => onTab(e.detail));
  host.addEventListener('pdfm:progress', (e) => onProgress(e.detail));
  renderAll();
}

function onInput(e) {
  const target = e.target;
  if (!target) return;
  if (target.id === 'pdfwText') {
    W.text = target.value;
    scheduleCheck();
  } else if (target.dataset && target.dataset.hfill !== undefined) {
    const holder = W.holders[Number(target.dataset.hfill)];
    if (holder) W.fills[holder.raw] = target.value;
  }
}

function onKey(e) {
  const target = e.target;
  if (e.key !== 'Enter' || !target || !target.dataset || target.dataset.hfill === undefined) return;
  e.preventDefault();
  fillOne(Number(target.dataset.hfill));
}

function onFile(detail) {
  const filePath = detail && detail.filePath ? String(detail.filePath) : '';
  W.token += 1;
  W.file = filePath;
  W.analysis = null;
  W.sections = [];
  W.overrides = { splits: [], joins: [] };
  W.prompt = '';
  W.check = null;
  W.result = null;
  W.error = '';
  W.busy = '';
  W.progress = null;
  renderAll();
  if (filePath && W.active) analyze();
}

function onTab(detail) {
  W.active = !!detail && detail.tab === 'writer';
  if (W.active && W.file && !W.analysis && !W.busy) analyze();
}

function onProgress(d) {
  if (!d || d.jobId !== W.jobId || !W.busy) return;
  W.progress = d;
  const fill = $('#pdfwBar');
  if (fill) fill.style.width = (Number(d.percent) || 0) + '%';
  const msg = $('#pdfwMsg');
  if (msg) msg.textContent = d.message || '';
}

function newJobId() {
  return 'pw' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function analyze() {
  const api = window.pdfWriterAPI;
  if (!api) {
    W.error = MISSING_BRIDGE;
    renderAll();
    return;
  }
  if (!W.file || W.busy) return;
  W.token += 1;
  const token = W.token;
  W.busy = 'analyze';
  W.error = '';
  W.result = null;
  W.jobId = newJobId();
  W.progress = { percent: 0, message: 'Starting...' };
  renderAll();
  let res;
  try {
    res = await api.analyze({ jobId: W.jobId, inputPath: W.file });
  } catch (err) {
    res = { success: false, error: err && err.message ? err.message : String(err) };
  }
  if (token !== W.token) return;
  W.busy = '';
  W.progress = null;
  if (res && res.success && res.analysis) {
    W.analysis = res.analysis;
    W.overrides = { splits: [], joins: [] };
    rebuild();
  } else {
    W.error = res && res.code === 'CANCELLED' ? 'Analysis cancelled.' : ((res && res.error) || 'The analysis failed.');
    renderAll();
  }
}

function rebuild() {
  W.sections = buildSections(W.analysis, W.overrides);
  W.prompt = buildPrompt(W.sections);
  W.check = W.text.trim() && W.sections.length ? checkText(W.text, W.sections) : null;
  renderAll();
}

function toggleSplit(page) {
  if (!(page > 0)) return;
  const splits = new Set(W.overrides.splits);
  const joins = new Set(W.overrides.joins);
  const isStart = W.sections.some((sec) => sec.start === page);
  if (isStart) {
    splits.delete(page);
    joins.add(page);
  } else {
    joins.delete(page);
    splits.add(page);
  }
  W.overrides = { splits: Array.from(splits), joins: Array.from(joins) };
  rebuild();
}

function onClick(e) {
  const btn = e.target.closest('[data-wact]');
  if (!btn || !el.contains(btn) || btn.disabled) return;
  const act = btn.dataset.wact;
  if (act === 'analyze') {
    W.analysis = null;
    analyze();
  } else if (act === 'cancel') cancel();
  else if (act === 'chip') toggleSplit(Number(btn.dataset.page));
  else if (act === 'copy') copyPrompt();
  else if (act === 'paste') pasteClipboard();
  else if (act === 'clear') {
    W.fills = {};
    setText('');
  } else if (act === 'fill-one') fillOne(Number(btn.dataset.hidx));
  else if (act === 'fill-remove') fillRemove(Number(btn.dataset.hidx));
  else if (act === 'fill-drop') fillDrop(Number(btn.dataset.hidx));
  else if (act === 'fill-all') fillAll();
  else if (act === 'mode') {
    W.saveMode = btn.value === 'replace' ? 'replace' : 'new';
    renderSave();
  } else if (act === 'write') write();
  else if (act === 'reload') {
    const target = btn.dataset.path;
    if (target && host) host.dispatchEvent(new CustomEvent('pdfm:reload', { detail: { path: target } }));
  }
}

async function cancel() {
  const bridge = window.pdfMasterAPI;
  if (!bridge || !W.busy) return;
  try {
    await bridge.cancel(W.jobId);
  } catch (_) {}
}

async function copyPrompt() {
  const text = W.prompt || '';
  if (!text) return;
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (_) {
    const details = $('#pdfwDetails');
    if (details) details.open = true;
    const area = $('#pdfwPromptText');
    if (area) {
      area.select();
      try {
        copied = document.execCommand('copy');
      } catch (__) {
        copied = false;
      }
    }
  }
  if (!copied) {
    toast('Could not copy. Select the prompt text and copy it.', true);
    return;
  }
  toast('Prompt copied');
  const button = $('[data-wact="copy"]');
  if (button) {
    button.textContent = 'Copied';
    setTimeout(() => {
      if (button.isConnected) button.textContent = 'Copy prompt';
    }, 1500);
  }
}

async function pasteClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      toast('The clipboard is empty.', true);
      return;
    }
    setText(text);
  } catch (_) {
    toast('Could not read the clipboard. Click the box and press Ctrl+V.', true);
  }
}

/* ---------- text and checking ---------- */

function setText(text) {
  W.text = String(text || '');
  const area = $('#pdfwText');
  if (area) area.value = W.text;
  clearTimeout(checkTimer);
  doCheck();
}

function scheduleCheck() {
  clearTimeout(checkTimer);
  if (!W.text.trim()) {
    doCheck();
    return;
  }
  checkTimer = setTimeout(doCheck, CHECK_DELAY);
}

function doCheck() {
  W.check = W.text.trim() && W.sections.length ? checkText(W.text, W.sections) : null;
  afterCheck();
}

function afterCheck() {
  renderMeta();
  renderHolders();
  renderCheck();
  renderSide();
  renderSave();
}

function fillOne(index) {
  const holder = W.holders[index];
  if (!holder) return;
  const value = String(W.fills[holder.raw] || '').trim();
  if (!value) {
    toast('Type the value first, or use Remove.', true);
    return;
  }
  delete W.fills[holder.raw];
  setText(fillPlaceholder(W.text, holder.raw, value));
}

function fillRemove(index) {
  const holder = W.holders[index];
  if (!holder) return;
  delete W.fills[holder.raw];
  setText(fillPlaceholder(W.text, holder.raw, ''));
}
function fillDrop(index) {
  const holder = W.holders[index];
  if (!holder) return;
  delete W.fills[holder.raw];
  setText(dropSentence(W.text, holder.raw));
}

function fillAll() {
  let text = W.text;
  let count = 0;
  W.holders.forEach((holder) => {
    const value = String(W.fills[holder.raw] || '').trim();
    if (!value) return;
    text = fillPlaceholder(text, holder.raw, value);
    delete W.fills[holder.raw];
    count += 1;
  });
  if (!count) {
    toast('Type at least one value first.', true);
    return;
  }
  setText(text);
}

/* ---------- writing ---------- */

async function write() {
  const api = window.pdfWriterAPI;
  const chk = W.check;
  if (!api || !chk || !chk.ok || W.busy || !W.analysis) return;
  const analysis = W.analysis;
  W.token += 1;
  const token = W.token;
  W.busy = 'write';
  W.error = '';
  W.result = null;
  W.jobId = newJobId();
  W.progress = { percent: 0, message: 'Starting...' };
  renderAll();
  let res;
  try {
    res = await api.write({
      jobId: W.jobId,
      inputPath: W.file,
      saveMode: W.saveMode,
      replace: chk.replace,
      tocPages: chk.tocPages,
      footers: analysis.pages.map((p) => p.footer || null),
      footerGeo: analysis.template ? analysis.template.footer : null,
    });
  } catch (err) {
    res = { success: false, error: err && err.message ? err.message : String(err) };
  }
  if (token !== W.token) return;
  W.busy = '';
  W.progress = null;
  if (res && res.success && !res.canceled) {
    W.result = res;
    toast('PDF written');
    if (res.mode === 'replace') {
      W.analysis = null;
      W.sections = [];
      W.prompt = '';
      W.check = null;
    }
  } else if (res && res.success && res.canceled) {
    toast('Cancelled');
  } else {
    W.error = res && res.code === 'CANCELLED' ? 'Writing cancelled.' : ((res && res.error) || 'The PDF could not be written.');
  }
  renderAll();
}

/* ---------- rendering ---------- */

function renderAll() {
  renderTop();
  renderSide();
  renderPrompt();
  renderMeta();
  renderHolders();
  renderCheck();
  renderSave();
}

function progressHtml() {
  const p = W.progress || {};
  return '<div class="pdfw-progress">' +
    '<div class="pdfm-busy-top"><div class="pdfm-file-sub" id="pdfwMsg">' + esc(p.message || 'Working...') + '</div>' +
    '<button type="button" class="pdfm-btn pdfm-btn-small" data-wact="cancel">Cancel</button></div>' +
    '<div class="pdfm-bar"><div class="pdfm-bar-fill" id="pdfwBar" style="width:' + (Number(p.percent) || 0) + '%"></div></div>' +
  '</div>';
}

function renderTop() {
  if (!W.file) {
    setHtml('#pdfwTop', '<div class="pdfw-note">Open a PDF in the Inspector tab first. PDF Writer works on the same file.</div>');
    return;
  }
  let html = '<div class="pdfw-file"><div class="pdfw-file-main"><div class="pdfm-file-name" title="' + esc(W.file) + '">' + esc(baseName(W.file)) + '</div>';
  if (W.analysis) {
    const t = W.analysis.template || {};
    html += '<div class="pdfw-file-tags">' +
      '<span class="pdfw-tag">' + plural(W.analysis.pageCount, 'page') + '</span>' +
      '<span class="pdfw-tag ' + (t.headerFound ? 'on' : '') + '">' + (t.headerFound ? 'Letterhead header detected' : 'No letterhead header') + '</span>' +
      '<span class="pdfw-tag ' + (t.footer ? 'on' : '') + '">' + (t.footer ? 'Page numbers detected' : 'No page numbers') + '</span>' +
    '</div>';
  }
  html += '</div><button type="button" class="pdfm-btn" data-wact="analyze"' + (W.busy ? ' disabled' : '') + '>Re-analyze</button></div>';
  if (W.busy === 'analyze') html += progressHtml();
  if (W.error && W.busy !== 'write') html += '<div class="pdfm-error">' + esc(W.error) + '</div>';
  if (W.analysis && W.analysis.warnings) {
    W.analysis.warnings.forEach((w) => {
      html += '<div class="pdfm-warn">Warning: ' + esc(w) + '</div>';
    });
  }
  setHtml('#pdfwTop', html);
}

function statusById() {
  const map = new Map();
  if (!W.check) return map;
  W.check.blocks.forEach((b) => {
    map.set(b.id, b.ok ? 'ready' : 'fix');
  });
  return map;
}

function renderSide() {
  if (!W.sections.length) {
    setHtml('#pdfwSideHead', '');
    setHtml('#pdfwSide', '<div class="pdfm-empty">' + (W.busy === 'analyze' ? 'Analyzing pages...' : 'No sections yet.') + '</div>');
    return;
  }
  const editable = W.sections.filter((s) => s.kind === 'flow' || s.kind === 'slots').length;
  const fixed = W.sections.length - editable;
  setHtml('#pdfwSideHead',
    '<div class="pdfw-side-title">Sections</div>' +
    '<div class="pdfm-file-sub">' + editable + ' editable, ' + fixed + ' kept as is. Click a page chip to split or join sections.</div>');
  const status = statusById();
  const cards = W.sections.map((sec) => {
    const editableSec = sec.kind === 'flow' || sec.kind === 'slots';
    const state = status.get(sec.id);
    const chips = [];
    for (let i = sec.start; i <= sec.end; i++) {
      chips.push('<button type="button" class="pdfw-chip' + (i === sec.start ? ' start' : '') + '" data-wact="chip" data-page="' + i + '" ' +
        'title="' + (i === sec.start ? (i > 0 ? 'Join with the previous section' : 'First page') : 'Start a new section here') + '">p' + (i + 1) + '</button>');
    }
    const preview = sec.lines.slice(0, 6).map((l) => esc(l.t)).join('\n');
    let tag = '';
    if (state === 'ready') tag = '<span class="pdfw-pill ok">Will be rewritten</span>';
    else if (state === 'fix') tag = '<span class="pdfw-pill bad">Needs fix</span>';
    else if (!editableSec) tag = '<span class="pdfw-pill mute">Kept as is</span>';
    return '<div class="pdfw-sec pdfw-kind-' + esc(sec.kind) + (editableSec ? '' : ' pdfw-sec-fixed') + (state ? ' pdfw-sec-' + state : '') + '">' +
      '<div class="pdfw-sec-head"><span class="pdfw-id">' + esc(sec.id) + '</span>' +
      '<span class="pdfw-sec-title">' + esc(sec.title) + '</span></div>' +
      '<div class="pdfw-sec-sub"><span class="pdfw-badge pdfw-badge-' + esc(sec.kind) + '">' + esc(KIND_LABEL[sec.kind] || sec.kind) + '</span> ' +
      esc(pageLabel(sec)) + (sec.lines.length ? ' | ' + sec.lines.length + ' lines' : '') + '</div>' +
      (tag ? '<div class="pdfw-sec-tag">' + tag + '</div>' : '') +
      '<div class="pdfw-chips">' + chips.join('') + '</div>' +
      (preview && editableSec ? '<details class="pdfw-prev"><summary>Preview text</summary><pre class="pdfw-preview">' + preview + '</pre></details>' : '') +
    '</div>';
  }).join('');
  setHtml('#pdfwSide', cards);
}

function renderPrompt() {
  if (!W.sections.length) {
    setHtml('#pdfwPrompt', '');
    return;
  }
  setHtml('#pdfwPrompt',
    '<div class="pdfw-card">' +
      '<div class="pdfw-step-head">' +
        '<span class="pdfw-num">1</span>' +
        '<div>' +
          '<div class="pdfw-title">Get the AI prompt</div>' +
          '<div class="pdfw-sub">The prompt describes the structure of this PDF. Paste it in your AI chat, then add your raw notes at the end.</div>' +
        '</div>' +
        '<button type="button" class="pdfm-btn pdfm-btn-primary pdfw-push" data-wact="copy">Copy prompt</button>' +
      '</div>' +
      '<details id="pdfwDetails" class="pdfw-details"><summary>Show prompt (' + W.prompt.length + ' characters)</summary>' +
        '<textarea id="pdfwPromptText" class="pdfw-textarea pdfw-readonly" readonly spellcheck="false">' + esc(W.prompt) + '</textarea>' +
      '</details>' +
    '</div>');
}

function renderMeta() {
  const text = W.text.trim();
  const clear = $('[data-wact="clear"]');
  if (clear) clear.disabled = !text;
  if (!text) {
    setHtml('#pdfwMeta', 'Nothing pasted yet.');
    return;
  }
  const words = text.split(/\s+/).length;
  const blocks = W.check ? W.check.blocks.length : 0;
  setHtml('#pdfwMeta', plural(blocks, 'block') + ' found | ' + plural(words, 'word'));
}

function snippet(context, raw) {
  const text = String(context || '');
  const at = text.indexOf(raw);
  if (at === -1) return esc(text.slice(0, 140));
  const from = Math.max(0, at - 60);
  const to = Math.min(text.length, at + raw.length + 60);
  const before = esc(text.slice(from, at));
  const after = esc(text.slice(at + raw.length, to));
  return (from > 0 ? '...' : '') + before + '<mark>' + esc(raw) + '</mark>' + after + (to < text.length ? '...' : '');
}

function renderHolders() {
  W.holders = findPlaceholders(W.text);
  if (!W.holders.length) {
    setHtml('#pdfwHolders', '');
    return;
  }
  const kindOf = (id) => {
    const sec = W.sections.find((s) => s.id === id);
    return sec ? sec.kind : '';
  };
  const items = W.holders.map((h, i) => {
    const inSlots = h.sections.some((id) => kindOf(id) === 'slots');
    const tags = h.sections.map((id) => '<span class="pdfw-id">' + esc(id) + '</span>').join('');
    return '<div class="pdfw-holder">' +
      '<div class="pdfw-holder-label">' + esc(h.label) + '</div>' +
      '<div class="pdfw-holder-meta">' + tags +
        '<span class="pdfm-file-sub">' + plural(h.count, 'place') + '</span></div>' +
      '<div class="pdfw-holder-ctx">' + snippet(h.context, h.raw) + '</div>' +
      '<div class="pdfw-holder-row">' +
        '<input type="text" class="pdfw-input" data-hfill="' + i + '" value="' + esc(W.fills[h.raw] || '') + '" placeholder="Type the real value" spellcheck="false">' +
        '<button type="button" class="pdfm-btn pdfm-btn-primary pdfm-btn-small" data-wact="fill-one" data-hidx="' + i + '">Apply</button>' +
        '<button type="button" class="pdfm-btn pdfm-btn-small" data-wact="fill-remove" data-hidx="' + i + '" title="Delete only this placeholder from the text">Remove</button>' +
        (inSlots
          ? ''
          : '<button type="button" class="pdfm-btn pdfm-btn-small" data-wact="fill-drop" data-hidx="' + i + '" title="Delete the whole sentence or bullet that contains it">Drop sentence</button>') +
      '</div>' +
      (inSlots ? '<div class="pdfm-file-sub">Fixed layout: Remove only works when the original line was empty or just punctuation. Otherwise type a real line.</div>' : '') +
    '</div>';
  }).join('');
  setHtml('#pdfwHolders',
    '<div class="pdfw-holders">' +
      '<div class="pdfw-holders-head">' +
        '<div><div class="pdfw-title">Fill in ' + plural(W.holders.length, 'missing detail') + '</div>' +
        '<div class="pdfm-file-sub">The AI marked these as unknown. Type the real value and apply it, or drop the sentence that uses it.</div></div>' +
        (W.holders.length > 1 ? '<button type="button" class="pdfm-btn pdfm-btn-small" data-wact="fill-all">Apply all filled</button>' : '') +
      '</div>' +
      items +
    '</div>');
}

function renderCheck() {
  const chk = W.check;
  if (!chk) {
    setHtml('#pdfwCheck', '');
    return;
  }
  const total = chk.blocks.length;
  const okCount = chk.blocks.filter((b) => b.ok).length;
  const issues = chk.errors.length + (total - okCount);
  let html = '<div class="pdfw-results">';
  if (chk.ok) {
    html += '<div class="pdfw-summary ok">' + plural(okCount, 'section') + ' ready to write</div>';
  } else {
    html += '<div class="pdfw-summary bad">' + plural(issues, 'issue') + ' to fix' +
      (okCount ? ' | ' + okCount + ' of ' + total + ' sections ready' : '') + '</div>';
  }
  chk.errors.forEach((m) => {
    html += '<div class="pdfm-error">' + esc(m) + '</div>';
  });
  chk.blocks.forEach((b) => {
    html += '<div class="pdfw-result ' + (b.ok ? 'ok' : 'bad') + '">' +
      '<div class="pdfw-result-head">' +
        '<span class="pdfw-pill ' + (b.ok ? 'ok' : 'bad') + '">' + (b.ok ? 'Ready' : 'Fix') + '</span>' +
        '<span class="pdfw-id">' + esc(b.id) + '</span>' +
        '<span class="pdfw-result-title">' + esc(b.title) + '</span>' +
      '</div>' +
      (b.summary ? '<div class="pdfm-file-sub">' + esc(b.summary) + '</div>' : '') +
      b.messages.map((m) => '<div class="pdfw-msg ' + (b.ok ? 'warn' : 'bad') + '">' + esc(m) + '</div>').join('') +
    '</div>';
  });
  chk.warnings.forEach((m) => {
    html += '<div class="pdfm-warn">' + esc(m) + '</div>';
  });
  html += '</div>';
  setHtml('#pdfwCheck', html);
}

function renderSave() {
  const chk = W.check;
  const ready = !!(chk && chk.ok) && !W.busy && !!W.analysis;
  let statusClass = '';
  let statusText = '';
  if (!W.analysis) {
    statusText = 'Open and analyze a PDF first.';
  } else if (!W.text.trim()) {
    statusText = 'Paste the AI text to continue.';
  } else if (!chk) {
    statusText = 'Checking...';
  } else if (chk.ok) {
    statusClass = 'ok';
    statusText = plural(chk.replace.length, 'section') + ' will be rebuilt. Other pages stay untouched.';
  } else {
    statusClass = 'bad';
    statusText = 'Fix the issues above before writing.';
  }
  let html = '';
  if (W.result) {
    const r = W.result;
    html += '<div class="pdfw-done">' +
      '<div class="pdfw-done-head"><span class="pdfw-pill ok">Done</span><span class="pdfm-drop-title">PDF written</span></div>' +
      '<div class="pdfm-file-sub">' + esc(r.outputPath || '') + ' | ' + plural(Number(r.pageCount) || 0, 'page') +
      (r.tocUpdated ? ' | contents updated' : '') + '</div>' +
      (r.warnings || []).map((w) => '<div class="pdfm-warn">Warning: ' + esc(w) + '</div>').join('') +
      '<div class="pdfw-row"><button type="button" class="pdfm-btn pdfm-btn-small" data-wact="reload" data-path="' + esc(r.outputPath || '') + '">Open result in Inspector</button></div>' +
    '</div>';
  }
  html += '<div class="pdfw-bar">' +
    '<div class="pdfw-step-head compact"><span class="pdfw-num">3</span><div class="pdfw-title">Write the PDF</div></div>' +
    '<div class="pdfw-seg">' +
      '<label class="' + (W.saveMode === 'new' ? 'on' : '') + '"><input type="radio" name="pdfwMode" value="new" data-wact="mode"' + (W.saveMode === 'new' ? ' checked' : '') + '>Save as new file</label>' +
      '<label class="' + (W.saveMode === 'replace' ? 'on' : '') + '"><input type="radio" name="pdfwMode" value="replace" data-wact="mode"' + (W.saveMode === 'replace' ? ' checked' : '') + '>Replace original</label>' +
    '</div>' +
    '<div class="pdfw-bar-status ' + statusClass + '">' + esc(statusText) + '</div>' +
    '<button type="button" class="pdfm-btn pdfm-btn-primary" data-wact="write"' + (ready ? '' : ' disabled') + '>Write PDF</button>' +
  '</div>';
  if (W.saveMode === 'replace') html += '<div class="pdfm-warn">The original file will be overwritten.</div>';
  if (W.busy === 'write') html += progressHtml();
  if (W.error && W.busy !== 'analyze') html += '<div class="pdfm-error">' + esc(W.error) + '</div>';
  setHtml('#pdfwSave', html);
}