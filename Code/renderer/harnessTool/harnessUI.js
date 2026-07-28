import { getState, resetState, addLog, addResult, setFinal, setRunning, updateConfig, getLoops, getActiveLoop, setActiveLoop, createLoop, updateLoop, deleteLoop, loadConfigFromLoop } from './harnessState.js';

let _panel = null;
let _open = false;
let _repoPath = '';
let _currentTab = 'config';

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
        <span class="harness-status-badge checking" id="harnessStatusBadge">Checking opencode...</span>
        <button class="harness-close-btn" id="harnessCloseBtn">&times;</button>
      </div>
    </div>
    <div class="harness-tabs">
      <button class="harness-tab active" data-tab="config">Config</button>
      <button class="harness-tab" data-tab="loops">Loops</button>
    </div>
    <div class="harness-body">
      <div class="harness-panel" data-panel="config">
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
          <div class="harness-config-actions">
            <button class="harness-run-btn" id="harnessRunBtn">
              <span class="harness-run-icon">&#9654;</span> Run
            </button>
            <button class="harness-save-loop-btn" id="harnessSaveLoopBtn">Save as Loop</button>
          </div>
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
      <div class="harness-panel" data-panel="loops" style="display:none">
        <div class="harness-loops-header">
          <h3 class="harness-section-title">Saved Loops</h3>
          <button class="harness-create-loop-btn" id="harnessCreateLoopBtn">+ Create Loop</button>
        </div>
        <div class="harness-loops-list" id="harnessLoopsList"></div>
      </div>
    </div>
  `;
  document.body.appendChild(_panel);

  _panel.querySelector('#harnessCloseBtn').addEventListener('click', close);
  _panel.addEventListener('click', (e) => { if (e.target === _panel) close(); });

  document.addEventListener('keydown', _escHandler);

  _panel.querySelector('#harnessRunBtn').addEventListener('click', _run);
  _panel.querySelector('#harnessSaveLoopBtn').addEventListener('click', _saveAsLoop);
  _panel.querySelector('#harnessValidationType').addEventListener('change', _onValidationTypeChange);
  _panel.querySelector('#harnessCreateLoopBtn').addEventListener('click', _openCreateModal);

  _panel.querySelectorAll('.harness-tab').forEach(tab => {
    tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
  });

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

function _switchTab(tab) {
  _currentTab = tab;
  _panel.querySelectorAll('.harness-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  _panel.querySelectorAll('.harness-panel').forEach(p => {
    p.style.display = p.dataset.panel === tab ? '' : 'none';
  });
  if (tab === 'loops') _renderLoopsList();
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
  const badge = _panel.querySelector('#harnessStatusBadge');
  const state = getState();
  if (state.isRunning) {
    btn.disabled = true;
    btn.innerHTML = '<span class="harness-spinner"></span> Running...';
  } else {
    btn.disabled = badge && badge.classList.contains('not-found');
    btn.innerHTML = '<span class="harness-run-icon">&#9654;</span> Run';
  }
}

async function _run() {
  const state = getState();
  if (state.isRunning) return;

  const config = _readConfig();
  if (!config.prompt) return;

  try { window.electronAPI.harnessPrewarmStop(); } catch (_) {}

  resetState();
  setRunning(true);
  _renderRunBtn();
  _renderLogs();
  _renderResults();
  _renderFinal();

  _switchTab('config');

  try {
    await window.electronAPI.harnessRun(config);
  } catch (err) {
    addLog(0, `[Error] ${err.message}`);
    _renderLogs();
    setRunning(false);
    _renderRunBtn();
  }
}

function _renderLoopsList() {
  const el = _panel.querySelector('#harnessLoopsList');
  const loops = getLoops();
  const active = getActiveLoop();
  const current = _readConfig();

  const currentCard = `
    <div class="harness-loop-card current-config">
      <div class="harness-loop-info">
        <div class="harness-loop-name">Current Config ${active ? '' : '<span class="harness-loop-badge active-badge">Active</span>'}</div>
        <div class="harness-loop-meta">Prompt: "${_escapeHtml(current.prompt.slice(0, 60))}${current.prompt.length > 60 ? '...' : ''}"</div>
        <div class="harness-loop-meta">Validation: ${current.validationType} &middot; Max Retries: ${current.maxRetries}${current.testCommand ? ' &middot; Test: ' + _escapeHtml(current.testCommand) : ''}</div>
        <div class="harness-loop-meta">Unsaved &mdash; click Save to persist</div>
      </div>
      <div class="harness-loop-actions">
        <button class="harness-btn-sm harness-btn-save-current" id="harnessSaveCurrentLoop">Save as Loop</button>
      </div>
    </div>
  `;

  const savedCards = loops.map(loop => {
    const isActive = active && active.id === loop.id;
    const dateStr = new Date(loop.updatedAt).toLocaleDateString();
    return `
      <div class="harness-loop-card ${isActive ? 'active' : ''}">
        <div class="harness-loop-info">
          <div class="harness-loop-name">${_escapeHtml(loop.name)} ${isActive ? '<span class="harness-loop-badge">Active</span>' : ''}</div>
          <div class="harness-loop-meta">Prompt: "${_escapeHtml(loop.config.prompt.slice(0, 60))}${loop.config.prompt.length > 60 ? '...' : ''}"</div>
          <div class="harness-loop-meta">Validation: ${loop.config.validationType} &middot; Max Retries: ${loop.config.maxRetries}${loop.config.testCommand ? ' &middot; Test: ' + _escapeHtml(loop.config.testCommand) : ''}</div>
          <div class="harness-loop-meta">Updated: ${dateStr}</div>
        </div>
        <div class="harness-loop-actions">
          ${isActive ? '' : `<button class="harness-btn-sm harness-btn-select" data-id="${loop.id}">Set Active</button>`}
          <button class="harness-btn-sm harness-btn-edit" data-id="${loop.id}">Edit</button>
          <button class="harness-btn-sm harness-btn-delete" data-id="${loop.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  const emptyMsg = !loops.length
    ? '<div class="harness-loops-empty">No saved loops yet. Create one to reuse later.</div>'
    : '';

  el.innerHTML = currentCard + '<div class="harness-loops-divider"></div>' + (savedCards || emptyMsg);

  el.querySelector('#harnessSaveCurrentLoop')?.addEventListener('click', _saveAsLoop);

  el.querySelectorAll('.harness-btn-select').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveLoop(btn.dataset.id);
      _renderLoopsList();
    });
  });

  el.querySelectorAll('.harness-btn-edit').forEach(btn => {
    btn.addEventListener('click', () => _openEditModal(btn.dataset.id));
  });

  el.querySelectorAll('.harness-btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this loop?')) {
        deleteLoop(btn.dataset.id);
        _renderLoopsList();
      }
    });
  });
}

function _openCreateModal() {
  _openLoopModal(null);
}

function _openEditModal(id) {
  const loop = getLoops().find(l => l.id === id);
  if (loop) _openLoopModal(loop);
}

async function _checkOpencodeStatus() {
  const badge = _panel.querySelector('#harnessStatusBadge');
  const runBtn = _panel.querySelector('#harnessRunBtn');
  badge.className = 'harness-status-badge checking';
  badge.textContent = 'Checking opencode...';
  runBtn.disabled = true;

  try {
    const status = await window.electronAPI.harnessCheckStatus();
    if (status.found) {
      badge.className = 'harness-status-badge ready';
      badge.textContent = `Opencode Ready`;
      runBtn.disabled = getState().isRunning;
      _prewarmOpencode();
    } else {
      badge.className = 'harness-status-badge not-found';
      badge.textContent = 'Opencode Not Found';
      runBtn.disabled = true;
      runBtn.title = 'opencode binary was not found on PATH or known install locations.';
    }
  } catch (err) {
    badge.className = 'harness-status-badge not-found';
    badge.textContent = 'Status Check Failed';
    runBtn.disabled = true;
  }
}

async function _prewarmOpencode() {
  const badge = _panel.querySelector('#harnessStatusBadge');
  badge.className = 'harness-status-badge checking';
  badge.textContent = 'Warming up...';
  try {
    await window.electronAPI.harnessPrewarm();
    badge.className = 'harness-status-badge ready';
    badge.textContent = 'Opencode Ready';
  } catch {
    badge.className = 'harness-status-badge not-found';
    badge.textContent = 'Pre-warm Failed';
  }
}

function _openLoopModal(loop) {
  const isEdit = !!loop;
  const backdrop = document.createElement('div');
  backdrop.className = 'harness-modal-backdrop';
  backdrop.innerHTML = `
    <div class="harness-modal">
      <div class="harness-modal-header">
        <h3>${isEdit ? 'Edit Loop' : 'Create Loop'}</h3>
        <button class="harness-modal-close">&times;</button>
      </div>
      <div class="harness-modal-body">
        <div class="harness-field">
          <label>Loop Name</label>
          <input type="text" class="harness-input" id="harnessModalName" value="${isEdit ? _escapeHtml(loop.name) : ''}" placeholder="My Loop" />
        </div>
        <div class="harness-field">
          <label>Prompt</label>
          <textarea class="harness-prompt" id="harnessModalPrompt" rows="3" placeholder="Enter the prompt...">${isEdit ? _escapeHtml(loop.config.prompt) : ''}</textarea>
        </div>
        <div class="harness-field">
          <label>Validation Type</label>
          <select class="harness-select" id="harnessModalValidationType">
            <option value="json" ${isEdit && loop.config.validationType === 'json' ? 'selected' : ''}>JSON</option>
            <option value="keyword" ${isEdit && loop.config.validationType === 'keyword' ? 'selected' : ''}>Keyword</option>
            <option value="exit" ${isEdit && loop.config.validationType === 'exit' ? 'selected' : ''}>Exit Code</option>
            <option value="regex" ${isEdit && loop.config.validationType === 'regex' ? 'selected' : ''}>Regex</option>
          </select>
        </div>
        <div class="harness-field" id="harnessModalKeywordField" style="display:${isEdit && (loop.config.validationType === 'keyword' || loop.config.validationType === 'regex') ? '' : 'none'}">
          <label>Keyword / Pattern</label>
          <input type="text" class="harness-input" id="harnessModalKeyword" value="${isEdit ? _escapeHtml(loop.config.keyword || loop.config.pattern || '') : ''}" />
        </div>
        <div class="harness-field">
          <label>Max Retries</label>
          <input type="number" class="harness-input" id="harnessModalMaxRetries" value="${isEdit ? loop.config.maxRetries : 3}" min="1" max="10" />
        </div>
        <div class="harness-field">
          <label>Test Command (optional)</label>
          <input type="text" class="harness-input" id="harnessModalTestCommand" value="${isEdit ? _escapeHtml(loop.config.testCommand || '') : ''}" placeholder="e.g. npm test" />
        </div>
      </div>
      <div class="harness-modal-footer">
        <button class="harness-btn-cancel">Cancel</button>
        <button class="harness-btn-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const modal = backdrop.querySelector('.harness-modal');
  const sel = backdrop.querySelector('#harnessModalValidationType');
  const kwField = backdrop.querySelector('#harnessModalKeywordField');
  const kwInput = backdrop.querySelector('#harnessModalKeyword');

  sel.addEventListener('change', () => {
    const v = sel.value;
    kwField.style.display = (v === 'keyword' || v === 'regex') ? '' : 'none';
    kwInput.placeholder = v === 'keyword' ? 'Enter keyword...' : 'Enter regex pattern...';
  });

  backdrop.querySelector('.harness-modal-close').addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('.harness-btn-cancel').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

  backdrop.querySelector('.harness-btn-save').addEventListener('click', () => {
    const name = backdrop.querySelector('#harnessModalName').value.trim() || 'Untitled Loop';
    const config = {
      prompt: backdrop.querySelector('#harnessModalPrompt').value.trim(),
      validationType: sel.value,
      maxRetries: parseInt(backdrop.querySelector('#harnessModalMaxRetries').value, 10) || 3,
      testCommand: backdrop.querySelector('#harnessModalTestCommand').value.trim(),
    };
    if (config.validationType === 'keyword') config.keyword = kwInput.value.trim();
    if (config.validationType === 'regex') config.pattern = kwInput.value.trim();

    if (!config.prompt) {
      backdrop.querySelector('#harnessModalPrompt').focus();
      return;
    }

    if (isEdit) {
      updateLoop(loop.id, { name, config });
    } else {
      createLoop(name, config);
    }

    backdrop.remove();
    _renderLoopsList();
  });
}

function _saveAsLoop() {
  const config = _readConfig();
  if (!config.prompt) return;
  const name = prompt('Loop name:');
  if (!name) return;
  createLoop(name.trim(), {
    prompt: config.prompt,
    validationType: config.validationType,
    keyword: config.keyword || '',
    pattern: config.pattern || '',
    maxRetries: config.maxRetries,
    testCommand: config.testCommand || '',
  });
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
  _switchTab('config');
  _checkOpencodeStatus();
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('open');
  _open = false;
  try { window.electronAPI.harnessPrewarmStop(); } catch (_) {}
}

export function isOpen() {
  return _open;
}
