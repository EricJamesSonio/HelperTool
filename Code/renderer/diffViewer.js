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

const CLOSE_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>';
const COPY_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="10" height="12" rx="1"/><path d="M2 5v8a1 1 0 0 0 1 1h7"/></svg>';

export function isOpen() {
  return _open;
}

export function open(filePath, repoPath) {
  _filePath = filePath;
  _repoPath = repoPath;
  _commits = [];
  _leftHash = null;
  _rightHash = null;
  _diffLines = [];
  _contentLeft = [];
  _contentRight = [];

  if (!_panel) _buildPanel();
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
        <span class="dv-file-icon">📄</span>
        <span class="dv-file-path" id="dvFilePath"></span>
      </div>
      <div class="dv-header-actions">
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
        <button class="dv-btn dv-btn-nav" id="dvPrevDiff" title="Previous change">◀ Prev</button>
        <span class="dv-nav-count" id="dvNavCount"></span>
        <button class="dv-btn dv-btn-nav" id="dvNextDiff" title="Next change">Next ▶</button>
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
}

function _escHandler(e) {
  if (e.key === 'Escape' && _open) close();
}

async function _load() {
  const filePathEl = document.getElementById('dvFilePath');
  filePathEl.textContent = _filePath;

  const result = await window.electronAPI.git.fileLog(_repoPath, _filePath, 100);
  if (!result.success || !result.commits.length) {
    _showError('No commit history found for this file');
    return;
  }

  _commits = result.commits;

  if (_commits.length >= 2) {
    _rightHash = _commits[0].hash;
    _leftHash = _commits[1].hash;
  } else if (_commits.length === 1) {
    _rightHash = _commits[0].hash;
    _leftHash = _commits[0].hash;
  }

  _updateSelects();
  await _loadDiff();
}

function _updateSelects() {
  const leftSelect = document.getElementById('dvLeftSelect');
  const rightSelect = document.getElementById('dvRightSelect');
  const leftMsg = document.getElementById('dvLeftMsg');
  const rightMsg = document.getElementById('dvRightMsg');

  const leftIdx = _leftHash ? _commits.findIndex(c => c.hash === _leftHash) : -1;
  const rightIdx = _rightHash ? _commits.findIndex(c => c.hash === _rightHash) : -1;

  // Left older panel: only shows commits older (higher index) than right
  let leftCandidates = rightIdx >= 0 ? _commits.filter((_, i) => i > rightIdx) : [..._commits];
  // Right newer panel: only shows commits newer (lower index) than left
  let rightCandidates = leftIdx >= 0 ? _commits.filter((_, i) => i < leftIdx) : [..._commits];

  // Fallback for edge case (e.g. single commit)
  if (leftCandidates.length === 0) leftCandidates = [..._commits];
  if (rightCandidates.length === 0) rightCandidates = [..._commits];

  const optFor = c => {
    const lbl = c.hash.substring(0, 7) + ' - ' + (c.message.length > 50 ? c.message.substring(0, 50) + '…' : c.message);
    return `<option value="${c.hash}">${lbl}</option>`;
  };
  leftSelect.innerHTML = leftCandidates.map(optFor).join('');
  rightSelect.innerHTML = rightCandidates.map(optFor).join('');

  // Auto-adjust selection if current hash was filtered out
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
  _updateSelects();
  _loadDiff();
}

function _onRightChange() {
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
      `<div class="dv-line dv-line-context"><span class="dv-ln">${i + 1}</span><span class="dv-text">${_escape(line)}</span></div>`
    ).join('');
    rightBody.innerHTML = _contentRight.map((line, i) =>
      `<div class="dv-line dv-line-context"><span class="dv-ln">${i + 1}</span><span class="dv-text">${_escape(line)}</span></div>`
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

function _renderDiff() {
  const leftBody = document.getElementById('dvLeftBody');
  const rightBody = document.getElementById('dvRightBody');
  const footer = document.getElementById('dvFooter');
  const stats = document.getElementById('dvStats');
  const navCount = document.getElementById('dvNavCount');

  // Compute blocks: groups of consecutive non-context (removed/added) lines
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

  let leftHtml = '';
  let rightHtml = '';
  let added = 0;
  let removed = 0;

  for (let i = 0; i < _diffLines.length; i++) {
    const line = _diffLines[i];
    const blockId = blocks.findIndex(b => i >= b.start && i <= b.end);
    const blockAttr = blockId >= 0 ? ` data-block="${blockId}"` : '';

    if (line.type === 'hunk' || line.type === 'note') continue;

    if (line.type === 'context') {
      leftHtml += `<div class="dv-line dv-line-context"${blockAttr}><span class="dv-ln">${line.oldLine}</span><span class="dv-text">${_escape(line.text)}</span></div>`;
      rightHtml += `<div class="dv-line dv-line-context"${blockAttr}><span class="dv-ln">${line.newLine}</span><span class="dv-text">${_escape(line.text)}</span></div>`;
    } else if (line.type === 'removed') {
      removed++;
      leftHtml += `<div class="dv-line dv-line-removed"${blockAttr}><span class="dv-ln">${line.oldLine}</span><span class="dv-text">${_escape(line.text)}</span></div>`;
      rightHtml += `<div class="dv-line dv-line-gap"${blockAttr}></div>`;
    } else if (line.type === 'added') {
      added++;
      leftHtml += `<div class="dv-line dv-line-gap"${blockAttr}></div>`;
      rightHtml += `<div class="dv-line dv-line-added"${blockAttr}><span class="dv-ln">${line.newLine}</span><span class="dv-text">${_escape(line.text)}</span></div>`;
    }
  }

  leftBody.innerHTML = leftHtml || '<div class="dv-empty">No content</div>';
  rightBody.innerHTML = rightHtml || '<div class="dv-empty">No content</div>';

  _syncPanels();
  _diffBlockIndex = -1;

  footer.style.display = '';
  stats.textContent = `+${added} / -${removed} lines`;
  navCount.textContent = blocks.length > 0 ? `1 of ${blocks.length}` : '';
}

let _syncing = false;

function _syncPanels() {
  const leftBody = document.getElementById('dvLeftBody');
  const rightBody = document.getElementById('dvRightBody');
  if (!leftBody || !rightBody) return;

  // Remove old listeners and attach synced scroll
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

  // Determine unique block IDs (numeric sort)
  const blockIds = [...new Set([...blocks].map(el => +el.dataset.block))].sort((a, b) => a - b);
  if (!blockIds.length) return;

  _diffBlockIndex = (_diffBlockIndex + dir + blockIds.length) % blockIds.length;
  const id = blockIds[_diffBlockIndex];

  // Clear previous highlight
  leftBody.querySelectorAll('.dv-line-active').forEach(el => el.classList.remove('dv-line-active'));
  rightBody.querySelectorAll('.dv-line-active').forEach(el => el.classList.remove('dv-line-active'));

  // Highlight code lines in this block (skip gap spacers)
  leftBody.querySelectorAll(`[data-block="${id}"]`).forEach(el => {
    if (!el.classList.contains('dv-line-gap')) el.classList.add('dv-line-active');
  });
  rightBody.querySelectorAll(`[data-block="${id}"]`).forEach(el => {
    if (!el.classList.contains('dv-line-gap')) el.classList.add('dv-line-active');
  });

  // Scroll both panels so the block is centered
  const leftTarget = leftBody.querySelector(`[data-block="${id}"]`);
  if (leftTarget) {
    leftTarget.scrollIntoView({ block: 'center', behavior: 'auto' });
    // Sync right panel immediately (layout was flushed by scrollIntoView)
    rightBody.scrollTop = leftBody.scrollTop;
  }

  document.getElementById('dvNavCount').textContent = `${_diffBlockIndex + 1} of ${blockIds.length}`;
}

// ── Comment detection ────────────────────────────────────────────

function _isCommentLine(line) {
  const s = line.trim();
  if (!s) return true;

  // Single-line comment starters (language-agnostic)
  const commentPatterns = [
    /^\/\//,      // C, C++, Java, JS, TS, Go, Rust, C#, Swift, etc.
    /^#/,         // Python, Ruby, Shell, YAML, R, Perl, Makefile
    /^--/,        // SQL, Lua, Ada, Haskell, VHDL
    /^%/,         // MATLAB, Erlang, LaTeX, TeX
    /^\/\*/,      // Block comment start (C-family)
    /^\*/,        // Block comment continuation (C-family)
    /^\*\/$/,     // Block comment end
    /^;\s*/,      // Lisp, Scheme, Clojure, Assembly
    /^'/,         // Visual Basic, VBA
    /^REM\s/i,    // BASIC, VBScript
    /^<!--/,      // HTML, XML, SVG
    /^\{#/,       // Jinja, Nunjucks comment
    /^#\{/,       // Elixir comment
  ];
  for (const p of commentPatterns) {
    if (p.test(s)) return true;
  }

  // Multi-line comment delimiters (if the line is solely a delimiter)
  if (/^\*\/$/.test(s)) return true;
  if (/^\/\*\*?$/.test(s)) return true;
  if (/^<\/?!--$/.test(s)) return true;

  // Python/JS/Ruby docstrings on their own line
  if (/^(""".*"""|'''')$/.test(s)) return true;
  if (/^"""$/.test(s) || /^'''$/.test(s)) return true;

  return false;
}

// ── Impact Analysis ────────────────────────────────────────────

function _runAnalysis(diffText) {
  const analysisEl = document.getElementById('dvAnalysis');
  if (!diffText || _diffLines.length === 0) {
    analysisEl.style.display = 'none';
    return;
  }

  const findings = [];

  const removedLines = _diffLines.filter(l => l.type === 'removed').map(l => l.text);
  const addedLines = _diffLines.filter(l => l.type === 'added').map(l => l.text);

  // Strip comment lines before analysis
  const codeRemovedLines = removedLines.filter(l => !_isCommentLine(l));
  const codeAddedLines = addedLines.filter(l => !_isCommentLine(l));

  const allChanged = [...codeRemovedLines, ...codeAddedLines];
  const allChangedText = allChanged.join('\n');
  // API call scanner
  const apiPatterns = [
    /\.(post|get|put|patch|delete|fetch)\s*\(/gi,
    /\bapi\.\w+\s*\(/gi,
    /\bfetch\s*\(/gi,
    /\baxios\s*\./gi,
    /\bcreate\w+\s*\(/gi,
    /\bupdate\w+\s*\(/gi,
    /\bdelete\w+\s*\(/gi,
  ];
  const apiMatches = [];
  for (const p of apiPatterns) {
    let m;
    while ((m = p.exec(allChangedText)) !== null) {
      apiMatches.push(m[0]);
    }
  }
  if (apiMatches.length) {
    const unique = [...new Set(apiMatches)];
    findings.push({
      icon: '🔌',
      label: 'API Calls Modified',
      detail: unique.join(', '),
      severity: 'high'
    });
  }

  // Hook usage scanner
  const hookPattern = /\buse\w+\s*\(/g;
  const hookMatches = [];
  let m;
  while ((m = hookPattern.exec(allChangedText)) !== null) {
    hookMatches.push(m[0]);
  }
  if (hookMatches.length) {
    findings.push({
      icon: '🪝',
      label: 'Hook Usage Changed',
      detail: [...new Set(hookMatches)].join(', '),
      severity: 'medium'
    });
  }

  // Variable/method naming changes
  const removedNames = new Set();
  const addedNames = new Set();
  const namePattern = /\b[a-z]\w+(?:[A-Z]\w+)*\b/g;
  for (const line of codeRemovedLines) {
    const names = line.match(namePattern);
    if (names) names.forEach(n => removedNames.add(n));
  }
  for (const line of codeAddedLines) {
    const names = line.match(namePattern);
    if (names) names.forEach(n => addedNames.add(n));
  }
  const changedNames = [...removedNames].filter(n => !addedNames.has(n) && n.length > 3);
  const newNames = [...addedNames].filter(n => !removedNames.has(n) && n.length > 3);
  if (changedNames.length > 3 || newNames.length > 3) {
    findings.push({
      icon: '📛',
      label: 'Naming Changes Detected',
      detail: `Removed: ${changedNames.slice(0, 5).join(', ')}${changedNames.length > 5 ? '…' : ''}`,
      severity: 'medium'
    });
  }

  // Route detection
  const routePattern = /['"`]\/[\w\-/]+['"`]|(?:path|route|navigate)\s*[:=]\s*['"`][\w\-/]+['"`]/gi;
  const routeMatches = [];
  while ((m = routePattern.exec(allChangedText)) !== null) {
    routeMatches.push(m[0]);
  }
  if (routeMatches.length) {
    findings.push({
      icon: '🧭',
      label: 'Route Changes',
      detail: [...new Set(routeMatches)].slice(0, 3).join(', '),
      severity: 'high'
    });
  }

  // Component prop changes
  const propRemoved = [];
  const propAdded = [];
  const propPattern = /(\w+)=['"]/
  for (const line of codeRemovedLines) {
    const pm = line.match(/(\w+)=['"]/g);
    if (pm) pm.forEach(p => propRemoved.push(p));
  }
  for (const line of codeAddedLines) {
    const pm = line.match(/(\w+)=['"]/g);
    if (pm) pm.forEach(p => propAdded.push(p));
  }
  const uniquePropsRemoved = [...new Set(propRemoved)].filter(p => !propAdded.includes(p));
  const uniquePropsAdded = [...new Set(propAdded)].filter(p => !propRemoved.includes(p));
  if (uniquePropsRemoved.length || uniquePropsAdded.length) {
    findings.push({
      icon: '🧩',
      label: 'Component Props Changed',
      detail: (uniquePropsRemoved.length ? `Removed: ${uniquePropsRemoved.slice(0, 3).join(', ')}` : '') +
              (uniquePropsRemoved.length && uniquePropsAdded.length ? ' | ' : '') +
              (uniquePropsAdded.length ? `Added: ${uniquePropsAdded.slice(0, 3).join(', ')}` : ''),
      severity: 'high'
    });
  }

  // Import/export detection
  const importChanged = codeRemovedLines.some(l => /^import\s/.test(l)) || codeAddedLines.some(l => /^import\s/.test(l));
  const exportChanged = codeRemovedLines.some(l => /^export\s/.test(l)) || codeAddedLines.some(l => /^export\s/.test(l));
  if (importChanged || exportChanged) {
    findings.push({
      icon: '📦',
      label: importChanged && exportChanged ? 'Import/Export Modified' : importChanged ? 'Import Modified' : 'Export Modified',
      detail: 'Module interface changed',
      severity: 'medium'
    });
  }

  // TYPESCRIPT type/interface changes
  const typeChanged = codeRemovedLines.some(l => /^(type|interface)\s/.test(l)) || codeAddedLines.some(l => /^(type|interface)\s/.test(l));
  if (typeChanged) {
    findings.push({
      icon: '📐',
      label: 'Type/Interface Changed',
      detail: 'Type definitions modified',
      severity: 'high'
    });
  }

  // Render analysis
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
        <div class="dv-finding dv-finding-${f.severity}">
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
        <span class="dv-finding-icon">✅</span>
        <div class="dv-finding-content">
          <span class="dv-finding-label">No Significant Changes Detected</span>
          <span class="dv-finding-detail">Changes appear to be UI-only or structural</span>
        </div>
      </div>
    </div>`}
  `;
}

function _escape(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _showError(msg) {
  const leftBody = document.getElementById('dvLeftBody');
  const rightBody = document.getElementById('dvRightBody');
  leftBody.innerHTML = `<div class="dv-error">${_escape(msg)}</div>`;
  rightBody.innerHTML = `<div class="dv-error">${_escape(msg)}</div>`;
}
