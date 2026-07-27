import { getState, resetState, addLog, addResult, setFinal, setRunning, updateConfig } from './harnessState.js';

let _panel = null;
let _open = false;
let _repoPath = '';

const ICON_HARNESS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12v12H4z"/><path d="M8 8h4v4H8z"/><circle cx="10" cy="10" r="1.5"/></svg>';

function _buildPanel() {
  _panel = document.createElement('div');
  _panel.className = 'harness-overlay';
  _panel.id = 'harnessPanel';
  _panel.innerHTML = `
    <div class="harness-header">
      <div class="harness-header-left">
        <span class="harness-header-icon">${ICON_HARNESS}</span>
        <h2 class="harness-title">Harness Tool</h2>
      </div>
      <div class="harness-header-right">
        <button class="harness-close-btn" id="harnessCloseBtn">&times;</button>
      </div>
    </div>
    <div class="harness-body">
      <div class="harness-config">
        <h3 class="harness-section-title">Config</h3>
        <div class="harness-field">
          <label>Prompt</label>
          <textarea class="harness-prompt" id="harnessPrompt" rows="4" placeholder="Enter the prompt for opencode..."></textarea>
        </div>
        <div class="harness-field">
          <label>Validation Type</label>
          <select class="harness-select" id="harnessValidationType">
            <option value="json">JSON</option>
            <option value="keyword">Keyword</option>
            <option value="exit">Exit Code</option>
            <option value="regex">Regex</option>
          </select>
        </div>
        <div class="harness-field" id="harnessKeywordField">
          <label>Keyword / Pattern</label>
          <input type="text" class="harness-input" id="harnessKeyword" placeholder="Enter keyword or regex pattern..." />
        </div>
        <div class="harness-field">
          <label>Max Retries</label>
          <input type="number" class="harness-input" id="harnessMaxRetries" value="3" min="1" max="10" />
        </div>
        <div class="harness-field">
          <label>Test Command (optional)</label>
          <input type="text" class="harness-input" id="harnessTestCommand" placeholder="e.g. npm test" />
        </div>
        <button class="harness-run-btn" id="harnessRunBtn">
          <span class="harness-run-icon">&#9654;</span> Run
        </button>
      </div>
      <div class="harness-output">
        <h3 class="harness-section-title">Live Output</h3>
        <div class="harness-logs" id="harnessLogs"></div>
      </div>
      <div class="harness-results">
        <h3 class="harness-section-title">Results</h3>
        <div class="harness-results-list" id="harnessResults"></div>
        <div class="harness-final" id="harnessFinal"></div>
      </div>
    </div>
  `;
  document.body.appendChild(_panel);

  _panel.querySelector('#harnessCloseBtn').addEventListener('click', close);
  _panel.addEventListener('click', (e) => { if (e.target === _panel) close(); });

  document.addEventListener('keydown', _escHandler);

  _panel.querySelector('#harnessRunBtn').addEventListener('click', _run);
  _panel.querySelector('#harnessValidationType').addEventListener('change', _onValidationTypeChange);

  _onValidationTypeChange();

  if (!window.__harnessEventBound) {
    window.electronAPI.onHarnessEvent((data) => {
      if (data.type === 'log') {
        addLog(data.attempt, data.message);
        _renderLogs();
      } else if (data.type === 'result') {
        addResult(data.attempt, data.passed, data.reason);
        _renderResults();
      } else if (data.type === 'final') {
        setFinal(data);
        _renderFinal();
        _renderRunBtn();
      }
    });
    window.__harnessEventBound = true;
  }
}

function _escHandler(e) {
  if (e.key === 'Escape') close();
}

function _onValidationTypeChange() {
  const type = _panel.querySelector('#harnessValidationType').value;
  const field = _panel.querySelector('#harnessKeywordField');
  field.style.display = (type === 'keyword' || type === 'regex') ? '' : 'none';
  const inp = field.querySelector('input');
  inp.placeholder = type === 'keyword' ? 'Enter keyword...' : 'Enter regex pattern...';
}

function _readConfig() {
  const config = {
    repoPath: _repoPath,
    prompt: _panel.querySelector('#harnessPrompt').value.trim(),
    validationType: _panel.querySelector('#harnessValidationType').value,
    maxRetries: parseInt(_panel.querySelector('#harnessMaxRetries').value, 10) || 3,
    testCommand: _panel.querySelector('#harnessTestCommand').value.trim(),
  };
  if (config.validationType === 'keyword') config.keyword = _panel.querySelector('#harnessKeyword').value.trim();
  if (config.validationType === 'regex') config.pattern = _panel.querySelector('#harnessKeyword').value.trim();
  return config;
}

function _renderLogs() {
  const el = _panel.querySelector('#harnessLogs');
  const state = getState();
  el.innerHTML = state.logs.map(l =>
    `<div class="harness-log-entry"><strong>Attempt ${l.attempt}</strong><pre>${_escapeHtml(l.content)}</pre></div>`
  ).join('');
  el.scrollTop = el.scrollHeight;
}

function _renderResults() {
  const el = _panel.querySelector('#harnessResults');
  const state = getState();
  el.innerHTML = state.results.map(r => {
    const icon = r.passed ? '<span class="harness-pass">&#10003;</span>' : '<span class="harness-fail">&#10007;</span>';
    const reason = r.reason ? ` &mdash; ${_escapeHtml(r.reason)}` : '';
    return `<div class="harness-result-entry">Attempt ${r.attempt} ${icon}${reason}</div>`;
  }).join('');
}

function _renderFinal() {
  const el = _panel.querySelector('#harnessFinal');
  const state = getState();
  const f = state.finalResult;
  if (!f) { el.innerHTML = ''; return; }
  const icon = f.success
    ? '<span class="harness-pass" style="font-size:1.2rem">&#10003; SUCCESS</span>'
    : '<span class="harness-fail" style="font-size:1.2rem">&#10007; FAILED</span>';
  el.innerHTML = `<div class="harness-final-entry"><strong>Final:</strong> ${icon} (${f.attempts} attempt${f.attempts !== 1 ? 's' : ''})</div>`;
}

function _renderRunBtn() {
  const btn = _panel.querySelector('#harnessRunBtn');
  const state = getState();
  if (state.isRunning) {
    btn.disabled = true;
    btn.innerHTML = '<span class="harness-spinner"></span> Running...';
  } else {
    btn.disabled = false;
    btn.innerHTML = '<span class="harness-run-icon">&#9654;</span> Run';
  }
}

async function _run() {
  const state = getState();
  if (state.isRunning) return;

  const config = _readConfig();
  if (!config.prompt) return;

  resetState();
  setRunning(true);
  _renderRunBtn();
  _renderLogs();
  _renderResults();
  _renderFinal();

  try {
    await window.electronAPI.harnessRun(config);
  } catch (err) {
    addLog(0, `[Error] ${err.message}`);
    _renderLogs();
    setRunning(false);
    _renderRunBtn();
  }
}

function _escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function open(repoPath) {
  if (_open) return;
  _repoPath = repoPath || '';
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
  _open = true;
  _panel.querySelector('#harnessPrompt')?.focus();
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('open');
  _open = false;
}

export function isOpen() {
  return _open;
}
