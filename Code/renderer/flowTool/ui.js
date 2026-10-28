import { state as appState } from '../app_manager/appState.js';
import { handleReply, getSession, resetSession } from '../researcher/assist/orchestrator.js';
import { detectReply, PROTOCOL_PROMPT, PROTOCOL_TITLE } from '../researcher/assist/protocol.js';
import { parseContentBlocks } from '../globalSeeder/parser.js';
import { state, POLL_MS, loadAuto, saveAuto } from './state.js';
import {
  buildReview,
  loadDiff,
  chooseCandidate,
  applyReview,
  summarize,
  entryKind,
  isActive,
  collapseDiff,
} from './review.js';

const BADGE_TEXT = {
  idle: 'Idle',
  working: 'Working...',
  ready: 'Ready',
  warning: 'Needs attention',
  error: 'Problem',
  review: 'Human review',
  done: 'Done',
  unknown: 'No marker',
};
const STEP_ICON = { pending: '-', active: '', done: '+', warn: '!', error: 'x' };
const KIND_LABEL = {
  new: 'new',
  overwrite: 'overwrite',
  patch: 'patch',
  invalid: 'invalid',
  problem: 'pick target',
  applied: 'applied',
};

let els = null;

function api() {
  const fs = window.electronAPI.fileSeeder;
  return {
    parse: parseContentBlocks,
    previewContent: (b, e) => fs.previewContent(b, e),
    getPatchedPreview: (b, r, e) => fs.getPatchedPreview(b, r, e),
    seedContent: (b, p) => fs.seedContent(b, p),
  };
}

async function readClip() {
  try {
    let res = await window.electronAPI.researcher.readClipboard();
    if (res && typeof res.then === 'function') res = await res;
    let text = res && res.text;
    if (text && typeof text.then === 'function') text = await text;
    return typeof text === 'string' ? text : '';
  } catch (_) {
    return '';
  }
}

async function writeClip(text) {
  try {
    const res = await window.electronAPI.researcher.writeClipboard(text);
    return !!(res && res.success);
  } catch (_) {
    return false;
  }
}

function show(el, visible) {
  if (el) el.classList.toggle('ft-hidden', !visible);
}

function setBadge(key) {
  const k = BADGE_TEXT[key] ? key : 'idle';
  els.badge.dataset.state = k;
  els.badge.textContent = BADGE_TEXT[k];
}

function updateRound() {
  const s = getSession();
  els.round.textContent = 'Round ' + s.round + ' | ' + s.sentCount + ' file(s) sent';
}

function setBusy(busy) {
  state.busy = busy;
  els.processBtn.disabled = busy;
  show(els.cancelBtn, busy);
}

function makeEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function renderSteps(steps) {
  els.steps.textContent = '';
  for (const st of steps) {
    const row = makeEl('div', 'ft-step');
    row.dataset.state = st.state;
    row.appendChild(makeEl('span', 'ft-step-icon', STEP_ICON[st.state] || ''));
    row.appendChild(makeEl('span', 'ft-step-label', st.label));
    if (st.detail) row.appendChild(makeEl('span', 'ft-step-detail', st.detail));
    els.steps.appendChild(row);
  }
  show(els.steps, steps.length > 0);
}

function addLine(tone, text) {
  const row = makeEl('div', 'ft-line', text);
  row.dataset.tone = tone;
  els.lines.appendChild(row);
}

function renderResult(result) {
  els.resultTitle.textContent = result.title || '';
  els.lines.textContent = '';
  for (const line of result.lines || []) addLine(line.tone || 'info', line.text);
  show(els.result, true);
}

function setBanner(tone, text) {
  els.banner.dataset.tone = tone;
  els.banner.textContent = text;
  show(els.banner, !!text);
}

function clearReview() {
  state.review = null;
  state.selected = -1;
  els.reviewBody.dataset.empty = 'true';
  els.chips.textContent = '';
  els.files.textContent = '';
  els.detail.textContent = '';
  setBanner('info', '');
  els.applyBtn.disabled = true;
  const empty = makeEl('div', 'ft-empty', 'Nothing to review yet. Copy Claude\'s reply and press Process clipboard. When it contains file blocks, the dry run result appears here.');
  els.detail.appendChild(empty);
}

function renderChips() {
  els.chips.textContent = '';
  if (!state.review) return;
  const c = summarize(state.review);
  const order = ['new', 'overwrite', 'patch', 'problem', 'invalid', 'applied', 'skip'];
  for (const k of order) {
    if (!c[k]) continue;
    const chip = makeEl('span', 'ft-chip', c[k] + ' ' + (KIND_LABEL[k] || k));
    chip.dataset.kind = k;
    els.chips.appendChild(chip);
  }
}

function refreshApply() {
  const r = state.review;
  const n = r ? r.entries.filter(isActive).length : 0;
  els.applyBtn.disabled = n === 0 || state.busy;
  els.applyBtn.textContent = n ? 'Apply selected (' + n + ')' : 'Apply selected';
}

function renderFiles() {
  els.files.textContent = '';
  const r = state.review;
  if (!r) return;
  r.entries.forEach((e, i) => {
    const row = makeEl('div', 'ft-file');
    row.dataset.selected = String(i === state.selected);
    row.dataset.skipped = String(!isActive(e) && !e.applied);
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = isActive(e) || e.applied;
    box.disabled = e.applied;
    box.title = e.invalid ? 'Invalid syntax. Check to apply anyway.' : 'Include in Apply';
    box.addEventListener('click', (ev) => ev.stopPropagation());
    box.addEventListener('change', () => {
      e.skipped = !box.checked;
      if (e.invalid) e.allowInvalid = box.checked;
      renderFiles();
      renderChips();
      refreshApply();
    });
    const main = makeEl('div', 'ft-file-main');
    main.appendChild(makeEl('div', 'ft-file-name', e.resolved));
    const sub = e.resolved !== e.relPath ? 'from ' + e.relPath : e.mode !== 'full' ? 'mode: ' + e.mode : '';
    if (sub) main.appendChild(makeEl('div', 'ft-file-sub', sub));
    const kind = entryKind(e);
    const chip = makeEl('span', 'ft-chip', KIND_LABEL[kind] || kind);
    chip.dataset.kind = kind;
    row.appendChild(box);
    row.appendChild(main);
    row.appendChild(chip);
    row.addEventListener('click', () => selectEntry(i));
    els.files.appendChild(row);
  });
}

function addNote(wrap, tone, text) {
  const n = makeEl('div', 'ft-note', text);
  n.dataset.tone = tone;
  wrap.appendChild(n);
}

function renderCode(lines, rows) {
  const pre = makeEl('div', 'ft-code');
  for (const l of rows) {
    const line = makeEl('div', 'ft-code-line');
    line.dataset.t = l.t;
    const no = makeEl('span', 'ft-code-no', l.t === '...' ? '' : String(l.b || l.a || ''));
    const sign = makeEl('span', 'ft-code-sign', l.t === ' ' || l.t === '...' ? '' : l.t);
    const text = makeEl('span', 'ft-code-text', l.text);
    line.appendChild(no);
    line.appendChild(sign);
    line.appendChild(text);
    pre.appendChild(line);
  }
  if (!rows.length) pre.appendChild(makeEl('div', 'ft-note', 'No content.'));
  return pre;
}

function renderDetail() {
  els.detail.textContent = '';
  const r = state.review;
  const e = r && r.entries[state.selected];
  if (!e) {
    els.detail.appendChild(makeEl('div', 'ft-empty', 'Select a file on the left to see what will change.'));
    return;
  }
  const head = makeEl('div', 'ft-detail-head');
  head.appendChild(makeEl('div', 'ft-detail-path', e.resolved));
  const kind = entryKind(e);
  const chip = makeEl('span', 'ft-chip', KIND_LABEL[kind] || kind);
  chip.dataset.kind = kind;
  head.appendChild(chip);
  if (e.stats) head.appendChild(makeEl('span', 'ft-note', '+' + e.stats.add + ' / -' + e.stats.del));
  els.detail.appendChild(head);

  if (e.ambiguous && e.candidates.length) {
    const sel = document.createElement('select');
    sel.className = 'ft-select';
    const ph = makeEl('option', '', 'Several matches. Pick the target file...');
    ph.value = '';
    sel.appendChild(ph);
    for (const c of e.candidates) {
      const o = makeEl('option', '', c);
      o.value = c;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      chooseCandidate(r, state.selected, sel.value);
      renderAll();
    });
    els.detail.appendChild(sel);
  }

  const notes = makeEl('div', 'ft-notes');
  if (e.invalid) addNote(notes, 'error', 'Syntax problem: this file is skipped unless you tick it to apply anyway.');
  if (e.syntaxError) addNote(notes, 'error', 'Syntax: ' + e.syntaxError);
  if (e.warning) addNote(notes, 'warn', e.warning);
  if (e.parseWarning) addNote(notes, 'warn', e.parseWarning);
  for (const rep of e.repairs || []) addNote(notes, 'info', 'Repaired: ' + (typeof rep === 'string' ? rep : JSON.stringify(rep)));
  if (e.diffError) addNote(notes, 'error', 'Preview: ' + e.diffError);
  if (e.result) addNote(notes, 'ok', e.result);
  if (notes.childNodes.length) els.detail.appendChild(notes);

  const tabs = makeEl('div', 'ft-tabs');
  for (const [id, label] of [['diff', 'Changes'], ['full', 'Full file']]) {
    const b = makeEl('button', 'ft-btn ft-tab', label);
    b.dataset.active = String(state.view === id);
    b.addEventListener('click', () => {
      state.view = id;
      renderDetail();
    });
    tabs.appendChild(b);
  }
  els.detail.appendChild(tabs);

  if (!e.diff) {
    els.detail.appendChild(makeEl('div', 'ft-note', 'Loading preview...'));
    return;
  }
  if (state.view === 'full') {
    const rows = String(e.final == null ? e.content : e.final)
      .split('\n')
      .map((text, i) => ({ t: ' ', text, b: i + 1 }));
    els.detail.appendChild(renderCode([], rows));
  } else if (e.diff.length) {
    els.detail.appendChild(renderCode([], collapseDiff(e.diff)));
  }
}

async function selectEntry(i) {
  state.selected = i;
  renderFiles();
  renderDetail();
  const r = state.review;
  if (!r || !r.entries[i] || r.entries[i].diff) return;
  const token = r;
  await loadDiff(r, i, api());
  if (state.review !== token || state.selected !== i) return;
  renderFiles();
  renderDetail();
}

function renderAll() {
  els.reviewBody.dataset.empty = state.review ? 'false' : 'true';
  renderChips();
  renderFiles();
  renderDetail();
  refreshApply();
  if (state.review && state.selected >= 0) {
    const e = state.review.entries[state.selected];
    if (e && !e.diff) selectEntry(state.selected);
  }
}

async function openReview(seederText) {
  clearReview();
  if (!seederText) return;
  const base = appState.selectedRepoPath;
  if (!base) {
    setBanner('error', 'No repository selected.');
    return;
  }
  setBanner('info', 'Running the dry run...');
  let review;
  try {
    review = await buildReview(base, seederText, api());
  } catch (err) {
    setBanner('error', 'Dry run failed: ' + ((err && err.message) || err));
    return;
  }
  if (review.error) {
    setBanner('error', review.error);
    return;
  }
  setBanner('info', '');
  state.review = review;
  state.view = 'diff';
  const first = review.entries.findIndex((e) => !e.skipped);
  state.selected = first >= 0 ? first : 0;
  renderAll();
}

async function applySelected() {
  const r = state.review;
  if (!r || state.busy) return;
  els.applyBtn.disabled = true;
  setBanner('info', 'Applying...');
  let res;
  try {
    res = await applyReview(r, api());
  } catch (err) {
    res = { error: (err && err.message) || String(err) };
  }
  if (res.error) {
    setBanner('error', res.error);
    refreshApply();
    return;
  }
  const bad = res.errors.length;
  setBanner(
    bad ? 'error' : 'ok',
    'Applied ' + (res.count - bad) + ' file(s)' + (bad ? ', ' + bad + ' failed (see the log).' : '.')
  );
  if (bad) console.warn('[FlowTool] seed errors:', res.errors);
  const refresh = document.getElementById('refreshBtn');
  if (refresh) refresh.click();
  renderAll();
}

async function run(text) {
  if (state.busy) return;
  const runId = ++state.runId;
  setBusy(true);
  setBadge('working');
  show(els.result, false);
  clearReview();
  renderSteps([]);
  let result;
  try {
    result = await handleReply(text, {
      onStep: (steps) => {
        if (runId === state.runId) renderSteps(steps);
      },
      isCancelled: () => runId !== state.runId,
    });
  } catch (err) {
    result = {
      status: 'error',
      title: 'Helper failed',
      lines: [{ tone: 'error', text: (err && err.message) || String(err) }],
      replyText: '',
    };
  }
  if (runId !== state.runId) return;
  setBusy(false);
  if (result.status === 'cancelled') {
    setBadge('idle');
    show(els.steps, false);
    updateRound();
    return;
  }
  setBadge(result.status);
  renderResult(result);
  updateRound();
  if (result.seederText) await openReview(result.seederText);
  if (result.replyText) {
    els.box.value = result.replyText;
    const copied = await writeClip(result.replyText);
    state.lastSeen = result.replyText;
    addLine(
      copied ? 'ok' : 'warn',
      copied
        ? 'Reply copied (' + result.replyText.length + ' chars). Paste it into Claude.'
        : 'Could not copy automatically. Use Copy box.'
    );
  }
}

async function processClipboard() {
  let text = await readClip();
  state.lastSeen = text;
  if (!detectReply(text) && detectReply(els.box.value)) text = els.box.value;
  if (text.trim() === '[object Promise]') {
    setBadge('idle');
    renderResult({
      title: 'Clipboard holds "[object Promise]"',
      lines: [{ tone: 'warn', text: 'Something copied a Promise instead of text. Copy Claude\'s reply again.' }],
    });
    return;
  }
  if (!text.trim()) {
    setBadge('idle');
    renderResult({ title: 'Clipboard is empty', lines: [{ tone: 'info', text: 'Copy Claude\'s reply first.' }] });
    return;
  }
  run(text);
}

async function tick() {
  if (state.ticking || !state.auto || state.busy || !isOpen()) return;
  state.ticking = true;
  try {
    const text = await readClip();
    if (!text || text === state.lastSeen) return;
    state.lastSeen = text;
    if (!detectReply(text)) return;
    run(text);
  } finally {
    state.ticking = false;
  }
}

function cancel() {
  state.runId += 1;
  setBusy(false);
  setBadge('idle');
  show(els.steps, false);
  renderResult({ title: 'Cancelled', lines: [] });
}

function newTicket() {
  state.runId += 1;
  setBusy(false);
  resetSession();
  els.box.value = '';
  show(els.steps, false);
  show(els.result, false);
  clearReview();
  setBadge('idle');
  updateRound();
}

function insertProtocol() {
  if (els.box.value.includes(PROTOCOL_TITLE)) return;
  const current = els.box.value.replace(/\s+$/, '');
  els.box.value = (current ? current + '\n\n' : '') + PROTOCOL_PROMPT;
  els.box.scrollTop = els.box.scrollHeight;
}

export function isOpen() {
  const p = document.getElementById('ftPanel');
  return !!(p && p.classList.contains('open'));
}

export function startPolling() {
  stopPolling();
  state.timer = setInterval(tick, POLL_MS);
}

export function stopPolling() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

export async function seedLastSeen() {
  state.lastSeen = await readClip();
}

export function wire(root, onClose) {
  els = {
    badge: root.querySelector('#ftBadge'),
    round: root.querySelector('#ftRound'),
    auto: root.querySelector('#ftAuto'),
    box: root.querySelector('#ftBox'),
    processBtn: root.querySelector('#ftProcessBtn'),
    cancelBtn: root.querySelector('#ftCancelBtn'),
    steps: root.querySelector('#ftSteps'),
    result: root.querySelector('#ftResult'),
    resultTitle: root.querySelector('#ftResultTitle'),
    lines: root.querySelector('#ftLines'),
    chips: root.querySelector('#ftChips'),
    banner: root.querySelector('#ftBanner'),
    files: root.querySelector('#ftFiles'),
    detail: root.querySelector('#ftDetail'),
    reviewBody: root.querySelector('#ftReviewBody'),
    applyBtn: root.querySelector('#ftApplyBtn'),
  };
  state.auto = loadAuto();
  els.auto.checked = state.auto;
  els.auto.addEventListener('change', () => {
    state.auto = els.auto.checked;
    saveAuto(state.auto);
    if (state.auto) seedLastSeen();
  });
  els.processBtn.addEventListener('click', processClipboard);
  els.cancelBtn.addEventListener('click', cancel);
  root.querySelector('#ftCloseBtn').addEventListener('click', onClose);
  root.querySelector('#ftProtocolBtn').addEventListener('click', insertProtocol);
  root.querySelector('#ftNewBtn').addEventListener('click', newTicket);
  root.querySelector('#ftClearBtn').addEventListener('click', () => {
    els.box.value = '';
  });
  root.querySelector('#ftCopyBtn').addEventListener('click', async () => {
    const ok = await writeClip(els.box.value);
    addLine(ok ? 'ok' : 'warn', ok ? 'Box copied.' : 'Could not copy.');
    show(els.result, true);
  });
  root.querySelector('#ftSelAllBtn').addEventListener('click', () => setAll(true));
  root.querySelector('#ftSelNoneBtn').addEventListener('click', () => setAll(false));
  els.applyBtn.addEventListener('click', applySelected);
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      onClose();
    }
  });
  clearReview();
  setBadge('idle');
  updateRound();
}

function setAll(on) {
  const r = state.review;
  if (!r) return;
  for (const e of r.entries) {
    if (e.applied) continue;
    e.skipped = !on;
    if (e.invalid) e.allowInvalid = on;
  }
  renderFiles();
  renderChips();
  refreshApply();
}

export function refreshHeader() {
  if (els) updateRound();
}