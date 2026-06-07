let _panel = null;
let _open = false;
let _filePath = '';
let _repoPath = '';
let _commits = [];
let _leftHash = null;
let _rightHash = null;
let _diffLines = [];
let _contentLeft = [];
let _contentRight = [];
let _viewMode = false;
let _showContent = false;

const CLOSE_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>';
const COPY_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="10" height="12" rx="1"/><path d="M2 5v8a1 1 0 0 0 1 1h7"/></svg>';

export function isOpen() {
  return _open;
}

export function open(filePath, repoPath, opts) {
  _viewMode = opts?.viewMode === true;
  _showContent = opts?.showContent === true;
  _filePath = filePath;
  _repoPath = repoPath;
  _commits = [];
  _leftHash = null;
  _rightHash = null;
  _diffLines = [];
  _contentLeft = [];
  _contentRight = [];

  if (!_panel) _buildPanel();
  _applyViewMode();
  _applyContentMode();
  _panel.classList.add('dv-open');
  _open = true;
  _load();
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('dv-open');
  _open = false;
}

function _buildPanel() {
  _panel = document.createElement('div');
  _panel.id = 'dvPanel';
  _panel.className = 'dv-overlay';
  _panel.innerHTML = `
    <div class="dv-header">
      <div class="dv-header-left">
        <span class="dv-file-icon"></span>
        <span class="dv-file-path" id="dvFilePath"></span>
      </div>
      <div class="dv-header-actions">
        <button class="dv-btn dv-btn-toggle" id="dvToggleBtn" style="display:none">History</button>
        <button class="dv-btn dv-btn-close" id="dvCloseBtn">${CLOSE_SVG}</button>
      </div>
    </div>
    <div class="dv-body">
      <div class="dv-panel dv-panel-left">
        <div class="dv-panel-header">
          <span class="dv-panel-label">Older</span>
          <select class="dv-commit-select" id="dvLeftSelect"></select>
          <span class="dv-commit-msg" id="dvLeftMsg"></span>
          <button class="dv-btn dv-btn-copy" id="dvCopyLeft" title="Copy content">${COPY_SVG}</button>
        </div>
        <div class="dv-panel-body" id="dvLeftBody">
          <div class="dv-loading">Select a commit to view</div>
        </div>
      </div>
      <div class="dv-divider"></div>
      <div class="dv-panel dv-panel-right">
        <div class="dv-panel-header">
          <span class="dv-panel-label">Newer</span>
          <select class="dv-commit-select" id="dvRightSelect"></select>
          <span class="dv-commit-msg" id="dvRightMsg"></span>
          <button class="dv-btn dv-btn-copy" id="dvCopyRight" title="Copy content">${COPY_SVG}</button>
        </div>
        <div class="dv-panel-body" id="dvRightBody">
          <div class="dv-loading">Select a commit to view</div>
        </div>
      </div>
    </div>
    <div class="dv-footer" id="dvFooter" style="display:none">
      <span class="dv-stats" id="dvStats"></span>
      <div class="dv-nav">
        <button class="dv-btn dv-btn-nav" id="dvPrevDiff" title="Previous change"> Prev</button>
        <span class="dv-nav-count" id="dvNavCount"></span>
        <button class="dv-btn dv-btn-nav" id="dvNextDiff" title="Next change">Next </button>
      </div>
    </div>
    <div class="dv-analysis" id="dvAnalysis" style="display:none"></div>
  `;
  document.body.appendChild(_panel);

  document.getElementById('dvCloseBtn').addEventListener('click', close);
  _panel.addEventListener('click', (e) => {
    if (e.target === _panel) close();
  });
  document.addEventListener('keydown', _escHandler);

  document.getElementById('dvLeftSelect').addEventListener('change', _onLeftChange);
  document.getElementById('dvRightSelect').addEventListener('change', _onRightChange);
  document.getElementById('dvPrevDiff').addEventListener('click', _scrollToPrevDiff);
  document.getElementById('dvNextDiff').addEventListener('click', _scrollToNextDiff);
  document.getElementById('dvCopyLeft').addEventListener('click', () => _copyPanel('left'));
  document.getElementById('dvCopyRight').addEventListener('click', () => _copyPanel('right'));
  document.getElementById('dvToggleBtn').addEventListener('click', _toggleContentHistory);
}

function _applyViewMode() {
  const leftLabel = document.querySelector('.dv-panel-left .dv-panel-label');
  const leftPanel = document.querySelector('.dv-panel-left');
  const rightPanel = document.querySelector('.dv-panel-right');
  const divider = document.querySelector('.dv-divider');
  const footer = document.getElementById('dvFooter');
  const analysis = document.getElementById('dvAnalysis');
  if (_viewMode) {
    if (leftLabel) leftLabel.textContent = 'Commit';
    if (leftPanel) leftPanel.classList.add('dv-panel-full');
    if (rightPanel) rightPanel.style.display = 'none';
    if (divider) divider.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (analysis) analysis.style.display = 'none';
  } else {
    if (leftLabel) leftLabel.textContent = 'Older';
    if (leftPanel) leftPanel.classList.remove('dv-panel-full');
    if (rightPanel) rightPanel.style.display = '';
    if (divider) divider.style.display = '';
    if (footer) footer.style.display = '';
    if (analysis) analysis.style.display = '';
  }
}

function _applyContentMode() {
  if (!_viewMode) return;
  const leftLabel = document.querySelector('.dv-panel-left .dv-panel-label');
  const leftSelect = document.getElementById('dvLeftSelect');
  const leftMsg = document.getElementById('dvLeftMsg');
  const toggleBtn = document.getElementById('dvToggleBtn');

  if (_showContent) {
    if (leftLabel) leftLabel.textContent = 'File Content';
    if (leftSelect) leftSelect.style.display = 'none';
    if (leftMsg) leftMsg.style.display = 'none';
    toggleBtn.textContent = 'History';
  } else {
    if (leftLabel) leftLabel.textContent = 'Commit';
    if (leftSelect) leftSelect.style.display = '';
    if (leftMsg) leftMsg.style.display = '';
    toggleBtn.textContent = 'Content';
  }
}

function _toggleContentHistory() {
  if (!_viewMode) return;
  _showContent = !_showContent;
  if (_showContent) {
    _loadContent();
  } else {
    if (!_commits.length || !_leftHash) {
      _showContent = true;
      return;
    }
    _updateSelects();
    const commit = _commits.find(c => c.hash === _leftHash);
    const leftMsg = document.getElementById('dvLeftMsg');
    if (leftMsg) leftMsg.textContent = commit ? commit.message : '';
    _loadDiff();
  }
  _applyContentMode();
}

async function _loadContent() {
  const leftBody = document.getElementById('dvLeftBody');
  leftBody.innerHTML = '<div class="dv-loading">Loading file\u2026</div>';
  let lines;
  try {
    const res = await window.electronAPI.readFile(_filePath);
    lines = (res.success ? res.content : '').split('\n');
  } catch {
    lines = [];
  }
  if (!_showContent) return;
  leftBody.innerHTML = lines.map((line, i) =>
    '<div class="dv-line dv-line-context"><span class="dv-ln">' + (i + 1) + '</span><span class="dv-text">' + _escape(line) + '</span></div>'
  ).join('') || '<div class="dv-empty">Unable to read file</div>';
}

function _escHandler(e) {
  if (e.key === 'Escape' && _open) close();
}

async function _load() {
  const filePathEl = document.getElementById('dvFilePath');
  filePathEl.textContent = _filePath;

  const result = await window.electronAPI.git.fileLog(_repoPath, _filePath, 100);
  if (result.success && result.commits.length) {
    _commits = result.commits;
    if (_viewMode) {
      _leftHash = _commits[0].hash;
      _rightHash = _commits[0].hash;
    } else if (_commits.length >= 2) {
      _rightHash = _commits[0].hash;
      _leftHash = _commits[1].hash;
    } else if (_commits.length === 1) {
      _rightHash = _commits[0].hash;
      _leftHash = _commits[0].hash;
    }
    _updateSelects();
  }

  const toggleBtn = document.getElementById('dvToggleBtn');
  if (_showContent) {
    await _loadContent();
    if (toggleBtn) toggleBtn.style.display = _commits.length ? '' : 'none';
  } else if (_commits.length) {
    await _loadDiff();
  } else {
    _showError('No commit history found for this file');
  }
}

function _updateSelects() {
  const leftSelect = document.getElementById('dvLeftSelect');
  const rightSelect = document.getElementById('dvRightSelect');
  const leftMsg = document.getElementById('dvLeftMsg');
  const rightMsg = document.getElementById('dvRightMsg');

  if (_viewMode) {
    const optFor = c => {
      const lbl = c.hash.substring(0, 7) + ' - ' + (c.message.length > 50 ? c.message.substring(0, 50) + '\u2026' : c.message);
      return '<option value="' + c.hash + '">' + lbl + '</option>';
    };
    leftSelect.innerHTML = _commits.map(optFor).join('');
    leftSelect.value = _leftHash;
    const commit = _commits.find(c => c.hash === _leftHash);
    leftMsg.textContent = commit ? commit.message : '';
    rightSelect.innerHTML = '';
    rightMsg.textContent = '';
    return;
  }

  const leftIdx = _leftHash ? _commits.findIndex(c => c.hash === _leftHash) : -1;
  const rightIdx = _rightHash ? _commits.findIndex(c => c.hash === _rightHash) : -1;

  let leftCandidates = rightIdx >= 0 ? _commits.filter((_, i) => i > rightIdx) : [..._commits];
  let rightCandidates = leftIdx >= 0 ? _commits.filter((_, i) => i < leftIdx) : [..._commits];

  if (leftCandidates.length === 0) leftCandidates = [..._commits];
  if (rightCandidates.length === 0) rightCandidates = [..._commits];

  const optFor = c => {
    const lbl = c.hash.substring(0, 7) + ' - ' + (c.message.length > 50 ? c.message.substring(0, 50) + '\u2026' : c.message);
    return '<option value="' + c.hash + '">' + lbl + '</option>';
  };
  leftSelect.innerHTML = leftCandidates.map(optFor).join('');
  rightSelect.innerHTML = rightCandidates.map(optFor).join('');

  if (!leftCandidates.some(c => c.hash === _leftHash)) {
    _leftHash = leftCandidates.length > 0 ? leftCandidates[leftCandidates.length - 1].hash : _commits[0].hash;
  }
  if (!rightCandidates.some(c => c.hash === _rightHash)) {
    _rightHash = rightCandidates.length > 0 ? rightCandidates[0].hash : _commits[0].hash;
  }

  leftSelect.value = _leftHash;
  rightSelect.value = _rightHash;

  const leftCommit = _commits.find(c => c.hash === _leftHash);
  const rightCommit = _commits.find(c => c.hash === _rightHash);
  leftMsg.textContent = leftCommit ? leftCommit.message : '';
  rightMsg.textContent = rightCommit ? rightCommit.message : '';
}

function _onLeftChange() {
  _leftHash = document.getElementById('dvLeftSelect').value;
  if (_viewMode) {
    const commit = _commits.find(c => c.hash === _leftHash);
    const msg = document.getElementById('dvLeftMsg');
    if (msg) msg.textContent = commit ? commit.message : '';
    _loadDiff();
  } else {
    _updateSelects();
    _loadDiff();
  }
}

function _onRightChange() {
  if (_viewMode) return;
  _rightHash = document.getElementById('dvRightSelect').value;
  _updateSelects();
  _loadDiff();
}

function _copyPanel(side) {
  const body = document.getElementById(side === 'left' ? 'dvLeftBody' : 'dvRightBody');
  const text = [...body.querySelectorAll('.dv-line')]
    .map(el => el.querySelector('.dv-text')?.textContent || '')
    .join('\n');
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {});
  const btn = document.getElementById(side === 'left' ? 'dvCopyLeft' : 'dvCopyRight');
  const orig = btn.innerHTML;
  btn.innerHTML = '<span style="font-size:11px">Copied!</span>';
  setTimeout(() => btn.innerHTML = orig, 1200);
}

async function _loadDiff() {
  if (!_leftHash || !_rightHash) return;

  if (_viewMode) {
    const leftBody = document.getElementById('dvLeftBody');
    const rightBody = document.getElementById('dvRightBody');
    const res = await window.electronAPI.git.fileContent(_repoPath, _leftHash, _filePath);
    if (_showContent) return;
    const content = (res.success ? res.content : '').split('\n');
    leftBody.innerHTML = content.map((line, i) =>
      '<div class="dv-line dv-line-context"><span class="dv-ln">' + (i + 1) + '</span><span class="dv-text">' + _escape(line) + '</span></div>'
    ).join('');
    rightBody.innerHTML = '';
    return;
  }

  const [leftRes, rightRes, diffRes] = await Promise.all([
    window.electronAPI.git.fileContent(_repoPath, _leftHash, _filePath),
    window.electronAPI.git.fileContent(_repoPath, _rightHash, _filePath),
    window.electronAPI.git.diffCommits(_repoPath, _leftHash, _rightHash, _filePath)
  ]);

  _contentLeft = (leftRes.success ? leftRes.content : '').split('\n');
  _contentRight = (rightRes.success ? rightRes.content : '').split('\n');

  const leftBody = document.getElementById('dvLeftBody');
  const rightBody = document.getElementById('dvRightBody');

  if (!diffRes.success || !diffRes.diff) {
    leftBody.innerHTML = _contentLeft.map((line, i) =>
      '<div class="dv-line dv-line-context"><span class="dv-ln">' + (i + 1) + '</span><span class="dv-text">' + _escape(line) + '</span></div>'
    ).join('');
    rightBody.innerHTML = _contentRight.map((line, i) =>
      '<div class="dv-line dv-line-context"><span class="dv-ln">' + (i + 1) + '</span><span class="dv-text">' + _escape(line) + '</span></div>'
    ).join('');
    document.getElementById('dvFooter').style.display = 'none';
    document.getElementById('dvAnalysis').style.display = 'none';
    return;
  }

  _diffLines = _parseDiff(diffRes.diff);
  _renderDiff();
  _runAnalysis(diffRes.diff);
}

function _parseDiff(diffText) {
  if (!diffText) return [];
  const lines = diffText.split('\n');
  const result = [];
  let oldLine = 0;
  let newLine = 0;
  let hunk = null;

  for (const raw of lines) {
    if (raw.startsWith('@@')) {
      const match = raw.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        oldLine = parseInt(match[1]);
        newLine = parseInt(match[3]);
        hunk = { oldStart: oldLine, newStart: newLine };
        result.push({ type: 'hunk', oldLine: oldLine, newLine: newLine, raw });
      }
      continue;
    }
    if (raw.startsWith('---') || raw.startsWith('+++') || raw.startsWith('diff ') || raw.startsWith('index ')) {
      continue;
    }

    const ch = raw.charAt(0);
    if (ch === ' ') {
      result.push({ type: 'context', oldLine: oldLine++, newLine: newLine++, text: raw.substring(1) });
    } else if (ch === '-') {
      result.push({ type: 'removed', oldLine: oldLine++, newLine: null, text: raw.substring(1) });
    } else if (ch === '+') {
      result.push({ type: 'added', oldLine: null, newLine: newLine++, text: raw.substring(1) });
    } else if (ch === '\\') {
      result.push({ type: 'note', text: raw });
    }
  }

  return result;
}

function _getDiffBlocks() {
  const blocks = [];
  let currentBlock = -1;
  for (let i = 0; i < _diffLines.length; i++) {
    const t = _diffLines[i].type;
    if (t === 'context' || t === 'hunk' || t === 'note') {
      currentBlock = -1;
    } else {
      if (currentBlock < 0) {
        currentBlock = blocks.length;
        blocks.push({ start: i, end: i });
      } else {
        blocks[currentBlock].end = i;
      }
    }
  }
  return blocks;
}

function _scrollToBlocks(blockIds) {
  const leftBody = document.getElementById('dvLeftBody');
  const rightBody = document.getElementById('dvRightBody');
  if (!leftBody) return;

  leftBody.querySelectorAll('.dv-line-active').forEach(el => el.classList.remove('dv-line-active'));
  rightBody?.querySelectorAll('.dv-line-active').forEach(el => el.classList.remove('dv-line-active'));

  blockIds.forEach(id => {
    leftBody.querySelectorAll('[data-block="' + id + '"]').forEach(el => {
      if (!el.classList.contains('dv-line-gap')) el.classList.add('dv-line-active');
    });
    rightBody?.querySelectorAll('[data-block="' + id + '"]').forEach(el => {
      if (!el.classList.contains('dv-line-gap')) el.classList.add('dv-line-active');
    });
  });

  const first = leftBody.querySelector('[data-block="' + blockIds[0] + '"]');
  if (first) {
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (rightBody) rightBody.scrollTop = leftBody.scrollTop;
  }
}

function _renderDiff() {
  const leftBody = document.getElementById('dvLeftBody');
  const rightBody = document.getElementById('dvRightBody');
  const footer = document.getElementById('dvFooter');
  const stats = document.getElementById('dvStats');
  const navCount = document.getElementById('dvNavCount');

  const blocks = _getDiffBlocks();

  let leftHtml = '';
  let rightHtml = '';
  let added = 0;
  let removed = 0;

  for (let i = 0; i < _diffLines.length; i++) {
    const line = _diffLines[i];
    const blockId = blocks.findIndex(b => i >= b.start && i <= b.end);
    const blockAttr = blockId >= 0 ? ' data-block="' + blockId + '"' : '';

    if (line.type === 'hunk' || line.type === 'note') continue;

    if (line.type === 'context') {
      leftHtml += '<div class="dv-line dv-line-context"' + blockAttr + '><span class="dv-ln">' + line.oldLine + '</span><span class="dv-text">' + _escape(line.text) + '</span></div>';
      rightHtml += '<div class="dv-line dv-line-context"' + blockAttr + '><span class="dv-ln">' + line.newLine + '</span><span class="dv-text">' + _escape(line.text) + '</span></div>';
    } else if (line.type === 'removed') {
      removed++;
      leftHtml += '<div class="dv-line dv-line-removed"' + blockAttr + '><span class="dv-ln">' + line.oldLine + '</span><span class="dv-text">' + _escape(line.text) + '</span></div>';
      rightHtml += '<div class="dv-line dv-line-gap"' + blockAttr + '></div>';
    } else if (line.type === 'added') {
      added++;
      leftHtml += '<div class="dv-line dv-line-gap"' + blockAttr + '></div>';
      rightHtml += '<div class="dv-line dv-line-added"' + blockAttr + '><span class="dv-ln">' + line.newLine + '</span><span class="dv-text">' + _escape(line.text) + '</span></div>';
    }
  }

  leftBody.innerHTML = leftHtml || '<div class="dv-empty">No content</div>';
  rightBody.innerHTML = rightHtml || '<div class="dv-empty">No content</div>';

  _syncPanels();
  _diffBlockIndex = -1;

  footer.style.display = '';
  stats.textContent = '+' + added + ' / -' + removed + ' lines';
  navCount.textContent = blocks.length > 0 ? '1 of ' + blocks.length : '';
}

let _syncing = false;

function _syncPanels() {
  const leftBody = document.getElementById('dvLeftBody');
  const rightBody = document.getElementById('dvRightBody');
  if (!leftBody || !rightBody) return;

  leftBody.removeEventListener('scroll', _onLeftScroll);
  rightBody.removeEventListener('scroll', _onRightScroll);

  _onLeftScroll = () => {
    if (_syncing) return;
    _syncing = true;
    rightBody.scrollTop = leftBody.scrollTop;
    rightBody.scrollLeft = leftBody.scrollLeft;
    _syncing = false;
  };

  _onRightScroll = () => {
    if (_syncing) return;
    _syncing = true;
    leftBody.scrollTop = rightBody.scrollTop;
    leftBody.scrollLeft = rightBody.scrollLeft;
    _syncing = false;
  };

  leftBody.addEventListener('scroll', _onLeftScroll, { passive: true });
  rightBody.addEventListener('scroll', _onRightScroll, { passive: true });
}

let _onLeftScroll = null;
let _onRightScroll = null;

function _scrollToPrevDiff() {
  _scrollToDiff(-1);
}

function _scrollToNextDiff() {
  _scrollToDiff(1);
}

let _diffBlockIndex = -1;

function _scrollToDiff(dir) {
  const leftBody = document.getElementById('dvLeftBody');
  const rightBody = document.getElementById('dvRightBody');
  const blocks = leftBody.querySelectorAll('[data-block]');
  if (!blocks.length) return;

  const blockIds = [...new Set([...blocks].map(el => +el.dataset.block))].sort((a, b) => a - b);
  if (!blockIds.length) return;

  _diffBlockIndex = (_diffBlockIndex + dir + blockIds.length) % blockIds.length;
  const id = blockIds[_diffBlockIndex];

  leftBody.querySelectorAll('.dv-line-active').forEach(el => el.classList.remove('dv-line-active'));
  rightBody.querySelectorAll('.dv-line-active').forEach(el => el.classList.remove('dv-line-active'));

  leftBody.querySelectorAll('[data-block="' + id + '"]').forEach(el => {
    if (!el.classList.contains('dv-line-gap')) el.classList.add('dv-line-active');
  });
  rightBody.querySelectorAll('[data-block="' + id + '"]').forEach(el => {
    if (!el.classList.contains('dv-line-gap')) el.classList.add('dv-line-active');
  });

  const leftTarget = leftBody.querySelector('[data-block="' + id + '"]');
  if (leftTarget) {
    leftTarget.scrollIntoView({ block: 'center', behavior: 'auto' });
    rightBody.scrollTop = leftBody.scrollTop;
  }

  document.getElementById('dvNavCount').textContent = (_diffBlockIndex + 1) + ' of ' + blockIds.length;
}

function _isCommentLine(line) {
  const s = line.trim();
  if (!s) return true;

  const commentPatterns = [
    /^\/\//,
    /^#/,
    /^--/,
    /^%/,
    /^\/\*/,
    /^\*/,
    /^\*\/$/,
    /^;\s*/,
    /^'/,
    /^REM\s/i,
    /^<!--/,
    /^\{#/,
    /^#\{/,
  ];
  for (const p of commentPatterns) {
    if (p.test(s)) return true;
  }

  if (/^\*\/$/.test(s)) return true;
  if (/^\/\*\*?$/.test(s)) return true;
  if (/^<\/?!--$/.test(s)) return true;

  if (/^(""".*"""|''')$/.test(s)) return true;
  if (/^"""$/.test(s) || /^'''$/.test(s)) return true;

  return false;
}

function _runAnalysis(diffText) {
  const analysisEl = document.getElementById('dvAnalysis');
  if (!diffText || _diffLines.length === 0) {
    analysisEl.style.display = 'none';
    return;
  }

  const blocks = _getDiffBlocks();
  if (!blocks.length) {
    analysisEl.style.display = 'none';
    return;
  }

  const blockTexts = blocks.map(b => {
    const removed = [];
    const added = [];
    for (let i = b.start; i <= b.end; i++) {
      const l = _diffLines[i];
      if (l.type === 'removed') removed.push(l.text);
      else if (l.type === 'added') added.push(l.text);
    }
    return {
      removed: removed.join('\n'),
      added: added.join('\n'),
      all: [...removed, ...added].join('\n'),
      codeRemoved: removed.filter(l => !_isCommentLine(l)).join('\n'),
      codeAdded: added.filter(l => !_isCommentLine(l)).join('\n'),
      codeChanged: [...removed.filter(l => !_isCommentLine(l)), ...added.filter(l => !_isCommentLine(l))].join('\n'),
    };
  });

  function scanBlocks(patterns, extractor) {
    const blockIds = new Set();
    const allMatches = new Set();
    blocks.forEach((b, bi) => {
      const text = blockTexts[bi].codeChanged;
      if (!text) return;
      let found = false;
      for (const p of patterns) {
        p.lastIndex = 0;
        let m;
        while ((m = p.exec(text)) !== null) {
          allMatches.add(m[0]);
          found = true;
        }
      }
      if (found) blockIds.add(bi);
    });
    const items = extractor ? extractor([...allMatches]) : [...allMatches];
    return { blockIds: [...blockIds], items, allMatches: [...allMatches] };
  }

  const findings = [];

  // API Calls Modified
  const apiPatterns = [
    /\.(post|get|put|patch|delete|fetch)\s*\(/gi,
    /\bapi\.\w+\s*\(/gi,
    /\bfetch\s*\(/gi,
    /\baxios\s*\./gi,
    /\bcreate\w+\s*\(/gi,
    /\bupdate\w+\s*\(/gi,
    /\bdelete\w+\s*\(/gi,
  ];
  const apiResult = scanBlocks(apiPatterns);
  if (apiResult.blockIds.length) {
    findings.push({ icon: '\uD83D\uDD0C', label: 'API Calls Modified', detail: apiResult.allMatches.join(', '), severity: 'high', blockIds: apiResult.blockIds });
  }

  // Hook Usage Changed
  const hookResult = scanBlocks([/\buse\w+\s*\(/gi]);
  if (hookResult.blockIds.length) {
    findings.push({ icon: '\uD83E\uDE9D', label: 'Hook Usage Changed', detail: hookResult.allMatches.join(', '), severity: 'medium', blockIds: hookResult.blockIds });
  }

  // Naming Changes Detected
  const nameResult = scanBlocks([/\b[a-z]\w+(?:[A-Z]\w+)*\b/g], matches => matches.filter(n => n.length > 3));
  if (nameResult.blockIds.length && nameResult.items.length > 3) {
    findings.push({ icon: '\uD83D\uDCDB', label: 'Naming Changes Detected', detail: 'Changed: ' + nameResult.items.slice(0, 5).join(', ') + (nameResult.items.length > 5 ? '\u2026' : ''), severity: 'medium', blockIds: nameResult.blockIds });
  }

  // Route Changes
  const routePattern = /['"`]\/[\w\-/]+['"`]|(?:path|route|navigate)\s*[:=]\s*['"`][\w\-/]+['"`]/gi;
  const routeResult = scanBlocks([routePattern]);
  if (routeResult.blockIds.length) {
    findings.push({ icon: '\uD83E\uDDED', label: 'Route Changes', detail: routeResult.allMatches.slice(0, 3).join(', '), severity: 'high', blockIds: routeResult.blockIds });
  }

  // Component Props Changed
  const propResult = scanBlocks([/(\w+)=['"]/g], matches => [...new Set(matches)]);
  if (propResult.blockIds.length) {
    findings.push({ icon: '\uD83E\uDDE9', label: 'Component Props Changed', detail: propResult.items.slice(0, 5).join(', '), severity: 'high', blockIds: propResult.blockIds });
  }

  // Import/Export Modified
  const importResult = scanBlocks([/^import\s/gm, /^export\s/gm]);
  if (importResult.blockIds.length) {
    const hasImport = importResult.allMatches.some(m => m.startsWith('import'));
    const hasExport = importResult.allMatches.some(m => m.startsWith('export'));
    findings.push({ icon: '\uD83D\uDCE6', label: hasImport && hasExport ? 'Import/Export Modified' : hasImport ? 'Import Modified' : 'Export Modified', detail: 'Module interface changed', severity: 'medium', blockIds: importResult.blockIds });
  }

  // Type/Interface Changed
  const typeResult = scanBlocks([/^(type|interface)\s/gm]);
  if (typeResult.blockIds.length) {
    findings.push({ icon: '\uD83D\uDCD0', label: 'Type/Interface Changed', detail: 'Type definitions modified', severity: 'high', blockIds: typeResult.blockIds });
  }

  const highRisk = findings.filter(f => f.severity === 'high').length;
  const medRisk = findings.filter(f => f.severity === 'medium').length;
  const overallRisk = highRisk > 0 ? 'High' : medRisk > 0 ? 'Medium' : 'Low';

  analysisEl.style.display = '';
  analysisEl.innerHTML = `
    <div class="dv-analysis-header">
      <span class="dv-analysis-title">Change Impact Analysis</span>
      <span class="dv-risk dv-risk-${overallRisk.toLowerCase()}">${overallRisk} Risk</span>
    </div>
    ${findings.length ? `
    <div class="dv-analysis-body">
      ${findings.map(f => `
        <div class="dv-finding dv-finding-${f.severity}${f.blockIds?.length ? ' dv-finding-clickable' : ''}" data-block-ids="${f.blockIds?.join(',') || ''}">
          <span class="dv-finding-icon">${f.icon}</span>
          <div class="dv-finding-content">
            <span class="dv-finding-label">${f.label}</span>
            <span class="dv-finding-detail">${f.detail}</span>
          </div>
        </div>
      `).join('')}
    </div>` : `
    <div class="dv-analysis-body">
      <div class="dv-finding dv-finding-low">
        <span class="dv-finding-icon">\u2705</span>
        <div class="dv-finding-content">
          <span class="dv-finding-label">No Significant Changes Detected</span>
          <span class="dv-finding-detail">Changes appear to be UI-only or structural</span>
        </div>
      </div>
    </div>`}
  `;

  analysisEl.querySelectorAll('.dv-finding-clickable').forEach(el => {
    el.addEventListener('click', () => {
      const ids = el.dataset.blockIds;
      if (!ids) return;
      _scrollToBlocks(ids.split(',').map(Number));
    });
  });
}

function _escape(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _showError(msg) {
  const leftBody = document.getElementById('dvLeftBody');
  const rightBody = document.getElementById('dvRightBody');
  leftBody.innerHTML = '<div class="dv-error">' + _escape(msg) + '</div>';
  rightBody.innerHTML = '<div class="dv-error">' + _escape(msg) + '</div>';
}
