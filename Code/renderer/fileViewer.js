let _panel = null;
let _open = false;
let _filePath = '';
let _repoPath = '';
let _commits = [];
let _selectedHash = null;
let _content = [];

const CLOSE_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>';
const COPY_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="10" height="12" rx="1"/><path d="M2 5v8a1 1 0 0 0 1 1h7"/></svg>';

export function isOpen() {
  return _open;
}

export function open(filePath, repoPath) {
  _filePath = filePath;
  _repoPath = repoPath;
  _commits = [];
  _selectedHash = null;
  _content = [];

  if (!_panel) _buildPanel();
  _panel.classList.add('fv-open');
  _open = true;
  _load();
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('fv-open');
  _open = false;
}

function _buildPanel() {
  _panel = document.createElement('div');
  _panel.id = 'fvPanel';
  _panel.className = 'fv-overlay';
  _panel.innerHTML = `
    <div class="fv-header">
      <div class="fv-header-left">
        <span class="fv-file-icon">📄</span>
        <span class="fv-file-path" id="fvFilePath"></span>
      </div>
      <div class="fv-header-actions">
        <button class="fv-btn fv-btn-copy" id="fvCopyBtn" title="Copy content">${COPY_SVG}</button>
        <button class="fv-btn fv-btn-close" id="fvCloseBtn">${CLOSE_SVG}</button>
      </div>
    </div>
    <div class="fv-body">
      <div class="fv-panel-header">
        <span class="fv-panel-label">Commit</span>
        <select class="fv-commit-select" id="fvCommitSelect"></select>
        <span class="fv-commit-msg" id="fvCommitMsg"></span>
      </div>
      <div class="fv-panel-body" id="fvBody">
        <div class="fv-loading">Loading…</div>
      </div>
    </div>
  `;
  document.body.appendChild(_panel);

  document.getElementById('fvCloseBtn').addEventListener('click', close);
  _panel.addEventListener('click', (e) => {
    if (e.target === _panel) close();
  });
  document.addEventListener('keydown', _escHandler);
  document.getElementById('fvCommitSelect').addEventListener('change', _onCommitChange);
  document.getElementById('fvCopyBtn').addEventListener('click', _copyContent);
}

function _escHandler(e) {
  if (e.key === 'Escape' && _open) close();
}

async function _load() {
  document.getElementById('fvFilePath').textContent = _filePath;

  const result = await window.electronAPI.git.fileLog(_repoPath, _filePath, 100);
  if (!result.success || !result.commits.length) {
    _showError('No commit history found for this file');
    return;
  }

  _commits = result.commits;
  _selectedHash = _commits[0].hash;
  _populateSelect();
  await _loadContent();
}

function _populateSelect() {
  const select = document.getElementById('fvCommitSelect');
  select.innerHTML = _commits.map(c => {
    const lbl = c.hash.substring(0, 7) + ' - ' + (c.message.length > 50 ? c.message.substring(0, 50) + '…' : c.message);
    return `<option value="${c.hash}">${lbl}</option>`;
  }).join('');
  select.value = _selectedHash;
  _updateCommitMsg();
}

function _updateCommitMsg() {
  const commit = _commits.find(c => c.hash === _selectedHash);
  document.getElementById('fvCommitMsg').textContent = commit ? commit.message : '';
}

function _onCommitChange() {
  _selectedHash = document.getElementById('fvCommitSelect').value;
  _updateCommitMsg();
  _loadContent();
}

function _copyContent() {
  const body = document.getElementById('fvBody');
  const text = [...body.querySelectorAll('.fv-line')]
    .map(el => el.querySelector('.fv-text')?.textContent || '')
    .join('\n');
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {});
  const btn = document.getElementById('fvCopyBtn');
  const orig = btn.innerHTML;
  btn.innerHTML = '<span style="font-size:11px">Copied!</span>';
  setTimeout(() => btn.innerHTML = orig, 1200);
}

async function _loadContent() {
  if (!_selectedHash) return;

  const res = await window.electronAPI.git.fileContent(_repoPath, _selectedHash, _filePath);
  _content = (res.success ? res.content : '').split('\n');

  const body = document.getElementById('fvBody');
  body.innerHTML = _content.map((line, i) =>
    `<div class="fv-line"><span class="fv-ln">${i + 1}</span><span class="fv-text">${_escape(line)}</span></div>`
  ).join('') || '<div class="fv-empty">Empty file</div>';
}

function _escape(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _showError(msg) {
  const body = document.getElementById('fvBody');
  body.innerHTML = `<div class="fv-error">${_escape(msg)}</div>`;
}
