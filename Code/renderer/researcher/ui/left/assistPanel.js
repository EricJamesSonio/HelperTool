// "Ticket helper" strip in the Researcher left panel.
// Reads Claude's reply from the device clipboard (manual button or auto
// watcher), runs the assist orchestrator, shows live steps, and puts the
// reply for Claude in the prompt box and on the clipboard.

import { handleReply, getSession, resetSession } from '../../assist/orchestrator.js';
import { detectReply, PROTOCOL_PROMPT, PROTOCOL_TITLE } from '../../assist/protocol.js';

const AUTO_KEY = 'rs_assist_auto';
const SEED_KEY = 'rs_assist_autoseed';

const POLL_MS = 700;

const TEMPLATE = `
  <div class="rs-assist-head">
    <span class="rs-assist-title">Ticket helper</span>
    <span class="rs-assist-badge" id="rsAssistBadge" data-state="idle">Idle</span>
    <label class="rs-assist-auto" title="Watch the clipboard and process Claude's reply as soon as you copy it">
      <input type="checkbox" id="rsAssistAuto"> Auto
    </label>
    <label class="rs-assist-auto" title="Open the Global Seeder automatically when the dry run is clean">
      <input type="checkbox" id="rsAssistAutoSeed"> Seeder
    </label>
  </div>
  <div class="rs-assist-round" id="rsAssistRound">Round 0</div>
  <div class="rs-assist-steps rs-hidden" id="rsAssistSteps"></div>
  <div class="rs-assist-result rs-hidden" id="rsAssistResult">
    <div class="rs-assist-result-title" id="rsAssistResultTitle"></div>
    <div class="rs-assist-lines" id="rsAssistLines"></div>
  </div>
  <div class="rs-assist-actions">
    <button class="rs-btn rs-btn-primary" id="rsAssistProcessBtn">Process clipboard</button>
    <button class="rs-btn rs-btn-danger rs-hidden" id="rsAssistCancelBtn">Cancel</button>
    <button class="rs-btn rs-btn-secondary rs-hidden" id="rsAssistSeederBtn">Open in Global Seeder</button>
    <button class="rs-btn" id="rsAssistProtocolBtn" title="Append the marker protocol to the prompt box">Protocol</button>
    <button class="rs-btn" id="rsAssistResetBtn" title="Start a new ticket (clears round and sent-files memory)">New ticket</button>
  </div>
`;

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

let _wired = false;
let _els = null;
let _busy = false;
let _ticking = false;
let _runId = 0;
let _auto = true;
let _autoSeed = true;

let _lastSeen = '';
let _seederText = '';

function loadAuto() {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0';
  } catch (_) {
    return true;
  }
}

function loadAutoSeed() {
  try {
    return localStorage.getItem(SEED_KEY) !== '0';
  } catch (_) {
    return true;
  }
}

function saveAutoSeed(on) {
  try {
    localStorage.setItem(SEED_KEY, on ? '1' : '0');
  } catch (_) { /* storage unavailable */ }
}
function saveAuto(on) {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0');
  } catch (_) { /* storage unavailable */ }
}

async function readClip() {
  try {
    const res = await window.electronAPI.researcher.readClipboard();
    return (res && res.text) || '';
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
  if (el) el.classList.toggle('rs-hidden', !visible);
}

function isVisible() {
  const panel = document.getElementById('rsPanel');
  const split = document.getElementById('rsSplitView');
  return !!(panel && panel.classList.contains('open') && split && !split.classList.contains('rs-hidden'));
}

function setBadge(state) {
  const key = BADGE_TEXT[state] ? state : 'idle';
  _els.badge.dataset.state = key;
  _els.badge.textContent = BADGE_TEXT[key];
}

function updateRound() {
  const s = getSession();
  _els.round.textContent = 'Round ' + s.round + ' | ' + s.sentCount + ' file(s) sent';
}

function setBusy(busy) {
  _busy = busy;
  _els.processBtn.disabled = busy;
  show(_els.cancelBtn, busy);
}

function renderSteps(steps) {
  _els.steps.textContent = '';
  for (const st of steps) {
    const row = document.createElement('div');
    row.className = 'rs-assist-step';
    row.dataset.state = st.state;
    const icon = document.createElement('span');
    icon.className = 'rs-assist-step-icon';
    icon.textContent = STEP_ICON[st.state] || '';
    const label = document.createElement('span');
    label.className = 'rs-assist-step-label';
    label.textContent = st.label;
    row.appendChild(icon);
    row.appendChild(label);
    if (st.detail) {
      const detail = document.createElement('span');
      detail.className = 'rs-assist-step-detail';
      detail.textContent = st.detail;
      row.appendChild(detail);
    }
    _els.steps.appendChild(row);
  }
  show(_els.steps, steps.length > 0);
}

function addLine(tone, text) {
  const row = document.createElement('div');
  row.className = 'rs-assist-line';
  row.dataset.tone = tone;
  row.textContent = text;
  _els.lines.appendChild(row);
}

function renderResult(result) {
  _els.resultTitle.textContent = result.title || '';
  _els.lines.textContent = '';
  for (const line of result.lines || []) addLine(line.tone || 'info', line.text);
  show(_els.result, true);
}

function resetView() {
  setBadge('idle');
  show(_els.steps, false);
  show(_els.result, false);
  show(_els.seederBtn, false);
  _seederText = '';
  updateRound();
}

async function run(text) {
  if (_busy) return;
  const runId = ++_runId;
  setBusy(true);
  setBadge('working');
  show(_els.result, false);
  show(_els.seederBtn, false);
  renderSteps([]);

  let result;
  try {
    result = await handleReply(text, {
      onStep: (steps) => {
        if (runId === _runId) renderSteps(steps);
      },
      isCancelled: () => runId !== _runId,
    });
  } catch (err) {
    result = {
      status: 'error',
      title: 'Helper failed',
      lines: [{ tone: 'error', text: (err && err.message) || String(err) }],
      replyText: '',
    };
  }
  if (runId !== _runId) return;

  setBusy(false);
  if (result.status === 'cancelled') {
    resetView();
    return;
  }

  setBadge(result.status);
  renderResult(result);
  updateRound();

  _seederText = result.seederText || '';
  _els.seederBtn.textContent = result.legacy ? 'Open in Global Seeder (legacy parse)' : 'Open in Global Seeder';
  show(_els.seederBtn, !!_seederText);

  if (_autoSeed && _seederText && result.status === 'ready' && !result.legacy) {
    addLine('info', 'Opening the Global Seeder...');
    openInSeeder().catch((err) => addLine('warn', 'Could not open the Global Seeder: ' + ((err && err.message) || err)));
  }

  if (result.replyText) {
    const textarea = document.getElementById('rsTextarea');
    if (textarea) textarea.value = result.replyText;
    const copied = await writeClip(result.replyText);
    _lastSeen = result.replyText;
    addLine(
      copied ? 'ok' : 'warn',
      copied
        ? 'Reply copied (' + result.replyText.length + ' chars). Paste it into Claude.'
        : 'Could not copy automatically. Use the Copy button.'
    );
  }
}

async function processClipboard() {
  let text = await readClip();
  _lastSeen = text;
  const box = document.getElementById('rsTextarea');
  if (!detectReply(text) && box && detectReply(box.value)) text = box.value;
  if (!text.trim()) {
    setBadge('idle');
    renderResult({ title: 'Clipboard is empty', lines: [{ tone: 'info', text: 'Copy Claude\'s reply first.' }] });
    return;
  }
  run(text);
}

async function tick() {
  if (_ticking || !_auto || _busy || !isVisible()) return;
  _ticking = true;
  try {
    const text = await readClip();
    if (!text || text === _lastSeen) return;
    _lastSeen = text;
    if (!detectReply(text)) return;
    run(text);
  } finally {
    _ticking = false;
  }
}

function cancel() {
  _runId += 1;
  setBusy(false);
  resetView();
  renderResult({ title: 'Cancelled', lines: [] });
}

async function openInSeeder() {
  if (!_seederText) return;
  const gs = await import('../../../globalSeeder/index.js');
  window.electronAPI.researcher.hideBrowserView();
  gs.open();
  const overlay = document.getElementById('globalSeederOverlay');
  if (overlay) overlay.style.zIndex = '10050';
  const input = document.getElementById('gsInput');
  if (input) input.value = _seederText;
  document.getElementById('gsParseBtn')?.click();
  const timer = setInterval(() => {
    if (!gs.isOpen()) {
      clearInterval(timer);
      window.electronAPI.researcher.showBrowserView();
    }
  }, 250);
}

function insertProtocol() {
  const textarea = document.getElementById('rsTextarea');
  if (!textarea || textarea.value.includes(PROTOCOL_TITLE)) return;
  const current = textarea.value.replace(/\s+$/, '');
  textarea.value = (current ? current + '\n\n' : '') + PROTOCOL_PROMPT;
  textarea.scrollTop = textarea.scrollHeight;
}

function newTicket() {
  _runId += 1;
  setBusy(false);
  resetSession();
  resetView();
}

export function initAssistPanel() {
  if (_wired) return;
  const textarea = document.getElementById('rsTextarea');
  if (!textarea || !textarea.parentNode) return;
  _wired = true;

  const root = document.createElement('div');
  root.className = 'rs-assist';
  root.id = 'rsAssist';
  root.innerHTML = TEMPLATE;
  textarea.parentNode.insertBefore(root, textarea);

  _els = {
    badge: root.querySelector('#rsAssistBadge'),
    round: root.querySelector('#rsAssistRound'),
    steps: root.querySelector('#rsAssistSteps'),
    result: root.querySelector('#rsAssistResult'),
    resultTitle: root.querySelector('#rsAssistResultTitle'),
    lines: root.querySelector('#rsAssistLines'),
    processBtn: root.querySelector('#rsAssistProcessBtn'),
    cancelBtn: root.querySelector('#rsAssistCancelBtn'),
    seederBtn: root.querySelector('#rsAssistSeederBtn'),
    protocolBtn: root.querySelector('#rsAssistProtocolBtn'),
    resetBtn: root.querySelector('#rsAssistResetBtn'),
    auto: root.querySelector('#rsAssistAuto'),
    autoSeed: root.querySelector('#rsAssistAutoSeed'),
  };

  _auto = loadAuto();
  _els.auto.checked = _auto;
  _els.auto.addEventListener('change', async () => {
    _auto = _els.auto.checked;
    saveAuto(_auto);
    if (_auto) _lastSeen = await readClip();
  });

  _autoSeed = loadAutoSeed();
  _els.autoSeed.checked = _autoSeed;
  _els.autoSeed.addEventListener('change', () => {
    _autoSeed = _els.autoSeed.checked;
    saveAutoSeed(_autoSeed);
  });

  _els.processBtn.addEventListener('click', processClipboard);
  _els.cancelBtn.addEventListener('click', cancel);
  _els.seederBtn.addEventListener('click', openInSeeder);
  _els.protocolBtn.addEventListener('click', insertProtocol);
  _els.resetBtn.addEventListener('click', newTicket);

  updateRound();
  readClip().then((text) => {
    _lastSeen = text;
  });
  setInterval(tick, POLL_MS);
}