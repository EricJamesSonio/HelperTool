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
let _editMode = false;
let _rawContent = '';

const CLOSE_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>';
const COPY_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="10" height="12" rx="1"/><path d="M2 5v8a1 1 0 0 0 1 1h7"/></svg>';

export function isOpen() {
  return _open;
}

export function open(filePath, repoPath, opts) {
  _viewMode = opts?.viewMode === true;
  _showContent = opts?.showContent === true;
  _editMode = false;
  _rawContent = '';
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

let _previewMode = false;
let _previewLeftText = '';
let _previewRightText = '';
let _previewFileIndex = 0;
let _previewTotal = 0;
let _previewOnSave = null;
let _previewOnNavigate = null;
let _previewSyntaxError = null;
let _editInputDebounce = null;

export function openPreview(opts) {
  // opts: { filePath, repoPath, leftText, rightText, syntaxError, mode, target, fileIndex, total, onSave, onNavigate }
  _previewMode = true;
  _previewSyntaxError = opts.syntaxError || null;
  _viewMode = false;
  _showContent = false;
  _editMode = false;
  _filePath = opts.filePath;
  _repoPath = opts.repoPath;
  _previewLeftText = opts.leftText || '';
  _previewRightText = opts.rightText || '';
  _previewFileIndex = opts.fileIndex || 0;
  _previewTotal = opts.total || 1;
  _previewOnSave = opts.onSave || null;
  _previewOnNavigate = opts.onNavigate || null;
  _commits = [];
  if (!_panel) _buildPanel();
  // Update header for preview
  const filePathEl = document.getElementById('dvFilePath');
  if (filePathEl) {
    const statusLabel = opts.mode ? ` — ${opts.mode}${opts.target ? ': '+opts.target : ''}` : '';
    filePathEl.textContent = opts.filePath + statusLabel;
  }
  // Hide commit selects for preview, show file nav
  const leftSelect = document.getElementById('dvLeftSelect');
  const rightSelect = document.getElementById('dvRightSelect');
  if (leftSelect) leftSelect.style.display = 'none';
  if (rightSelect) rightSelect.style.display = 'none';
  const leftMsg = document.getElementById('dvLeftMsg');
  const rightMsg = document.getElementById('dvRightMsg');
  if (leftMsg) leftMsg.textContent = 'Current on Disk';
  if (rightMsg) rightMsg.textContent = 'Will Be (after Seed)';
  const toggleBtn = document.getElementById('dvToggleBtn');
  if (toggleBtn) toggleBtn.style.display = 'none';
  const editBtn = document.getElementById('dvEditBtn');
  if (editBtn) editBtn.style.display = '';
  _panel.classList.add('dv-open');
  _open = true;
  _renderPreviewDiff();
}

function _renderPreviewDiff() {
  const leftBody = document.getElementById('dvLeftBody');
  const rightBody = document.getElementById('dvRightBody');
  const footer = document.getElementById('dvFooter');
  const stats = document.getElementById('dvStats');
  const navCount = document.getElementById('dvNavCount');
  if (!leftBody || !rightBody) return;
  // Show loading
  leftBody.innerHTML = '<div class="dv-loading">Loading diff…</div>';
  rightBody.innerHTML = '<div class="dv-loading">Loading diff…</div>';
  // Use a simple diff: generate unified diff via JS diff lib if available, else fallback to side-by-side
  // For now, render as diff lines by computing via main IPC or via simple line diff
  // We will request main to generate diff via git diff --no-index on temp files
  // But for lazy per-click, we already have left/right texts, so we can generate diff in renderer using a simple diff
  // Use a minimal diff: split lines and mark added/removed
  // For better diff, call electronAPI.diffStrings if available, else fallback
  const leftLines = _previewLeftText.split('\n');
  const rightLines = _previewRightText.split('\n');
  // Try to use IPC for proper diff
  if (window.electronAPI && window.electronAPI.git && window.electronAPI.git.diff) {
    // Fallback to simple diff if no IPC
  }
  // Simple line diff: use diff lib if available, else naive
  let diffText = '';
  // Try to use the existing _parseDiff by synthesizing a unified diff
  // For now, do a naive diff: treat all right lines as added if left empty (create), else compute via simple LCS
  // To keep it simple, we will generate a unified diff by comparing lines
  const useSimpleDiff = () => {
    const leftSet = new Set(leftLines);
    const rightSet = new Set(rightLines);
    let out = '';
    out += `--- a/${_filePath}\n+++ b/${_filePath}\n`;
    // Find hunks - for preview, just show full file diff
    // Use a simple approach: if left empty, all right are added
    if (_previewLeftText === '') {
      out += `@@ -0,0 +1,${rightLines.length} @@\n`;
      for (const l of rightLines) out += `+${l}\n`;
    } else {
      // For surgical, show context with 3 lines
      // Use a simple diff: compare line by line
      const max = Math.max(leftLines.length, rightLines.length);
      let hunkAdded = false;
      for (let i = 0; i < max; i++) {
        const l = leftLines[i];
        const r = rightLines[i];
        if (l !== r) {
          if (!hunkAdded) {
            out += `@@ -${i+1},1 +${i+1},1 @@\n`;
            hunkAdded = true;
          }
          if (l !== undefined) out += `-${l}\n`;
          if (r !== undefined) out += `+${r}\n`;
        } else {
          out += ` ${l}\n`;
        }
      }
    }
    return out;
  };
  const doRender = (diffStr) => {
    _diffLines = _parseDiff(diffStr);
    _renderDiff();
    // Verify banner — always above diff when syntaxError exists
    const verifyHost = document.getElementById('dvVerifyBannerHost');
    if (_previewSyntaxError && verifyHost !== null) {
      // will be handled via host; fallback to inject
    }
    // Inject banner above diff bodies (severity-aware, multi-diagnostic, data-line)
    let banner = document.getElementById('dvVerifyBanner');
    if (_previewSyntaxError) {
      const arr = Array.isArray(_previewSyntaxError) ? _previewSyntaxError : [_previewSyntaxError];
      const first = arr[0];
      const severity = first.severity || 'high';
      const bannerClass = severity === 'medium' ? 'dv-verify-banner dv-verify-banner--medium' : 'dv-verify-banner dv-verify-banner--high';
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'dvVerifyBanner';
        banner.className = bannerClass;
        const container = leftBody.parentElement;
        if (container) container.insertBefore(banner, leftBody);
      }
      banner.className = bannerClass;
      banner.style.display = 'flex';
      if (arr.length === 1) {
        const v = first;
        const lineInfo = v.line ? `Line ${v.line}${v.column ? `:${v.column}` : ''}` : 'Structure';
        const detail = escapeForAnalysis(v.error || 'syntax error');
        const snippet = v.snippet ? ` — <code>${escapeForAnalysis(v.snippet.slice(0,60))}</code>` : '';
        banner.innerHTML = `<span class="dv-verify-icon">!</span><span class="dv-verify-text"><strong>${lineInfo}:</strong> ${detail}${snippet}</span><button class="dv-verify-go" data-line="${v.line||1}">Go to line</button>`;
      } else {
        const items = arr.map(v=>{
          const li = v.line ? `${v.line}${v.column?`:${v.column}`:''}` : 'Structure';
          const sev = v.severity === 'medium' ? 'medium' : 'high';
          return `<div class="dv-verify-item dv-verify-item--${sev}"><strong>${escapeForAnalysis(li)}:</strong> ${escapeForAnalysis(v.error||'syntax error')}${v.snippet?` — <code>${escapeForAnalysis(v.snippet.slice(0,60))}</code>`:''}</div>`;
        }).join('');
        banner.innerHTML = `<span class="dv-verify-icon">!</span><div class="dv-verify-list">${items}</div><button class="dv-verify-go" data-line="${first.line||1}">Go to line</button>`;
      }
      const goBtn = banner.querySelector('.dv-verify-go');
      if (goBtn) goBtn.onclick = () => {
        const lineNum = parseInt(goBtn.dataset.line,10) || 1;
        const target = document.querySelector(`[data-line="${lineNum}"]`) || document.getElementById('dvRightBody');
        if (target && target.scrollIntoView) target.scrollIntoView({behavior:'smooth', block:'center'});
        const rb = document.getElementById('dvRightBody');
        if (rb) {
          const sample = document.querySelector('.dv-line');
          const lh = sample ? parseFloat(getComputedStyle(sample).lineHeight) || 18 : 18;
          rb.scrollTop = Math.max(0, (lineNum-5)*lh);
          const lb = document.getElementById('dvLeftBody');
          if (lb) lb.scrollTop = rb.scrollTop;
        }
      };
    } else if (banner) {
      banner.style.display = 'none';
    }
    // Update footer for file navigation
    const footerLeft = document.getElementById('dvFooter');
    if (footerLeft) {
      // Add file nav if not exists
      let fileNav = document.getElementById('dvFileNav');
      if (!fileNav) {
        fileNav = document.createElement('div');
        fileNav.id = 'dvFileNav';
        fileNav.className = 'dv-file-nav';
        fileNav.innerHTML = '<button class="dv-btn dv-btn-nav" id="dvPrevFile">< Prev</button><span class="dv-nav-count" id="dvFileCount"></span><button class="dv-btn dv-btn-nav" id="dvNextFile">Next ></button>';
        footerLeft.appendChild(fileNav);
        document.getElementById('dvPrevFile').addEventListener('click', () => { if (_previewOnNavigate) _previewOnNavigate(-1); });
        document.getElementById('dvNextFile').addEventListener('click', () => { if (_previewOnNavigate) _previewOnNavigate(1); });
      }
      const countEl = document.getElementById('dvFileCount');
      if (countEl) countEl.textContent = `${_previewFileIndex + 1} / ${_previewTotal}`;
    }
    // Show file status in analysis (severity-aware, supports array)
    const analysis = document.getElementById('dvAnalysis');
    if (analysis) {
      analysis.style.display = '';
      const arr = _previewSyntaxError ? (Array.isArray(_previewSyntaxError) ? _previewSyntaxError : [_previewSyntaxError]) : null;
      const sev = arr ? (arr[0].severity || 'high') : null;
      const riskClass = arr ? (sev === 'medium' ? 'dv-risk-medium' : 'dv-risk-high') : 'dv-risk-medium';
      const riskLabel = arr ? 'Syntax Error' : (_previewLeftText ? 'Overwrite' : 'Create');
      let synFinding = '';
      if (arr) {
        synFinding = arr.map(v=>{
          const sClass = (v.severity === 'medium') ? 'dv-finding-medium' : 'dv-finding-high';
          const sevLabel = v.severity === 'medium' ? 'Duplicate import' : 'Syntax error';
          return `<div class="dv-finding ${sClass}"><span class="dv-finding-icon">!</span><span class="dv-finding-label">${sevLabel}</span><span class="dv-finding-detail">${escapeForAnalysis(v.error)}${v.line ? ` — line ${v.line}${v.column?`:${v.column}`:''}` : ''}${v.snippet?` — <code>${escapeForAnalysis(v.snippet.slice(0,40))}</code>`:''}</span></div>`;
        }).join('');
      }
      analysis.innerHTML = `<div class="dv-analysis-header"><span class="dv-analysis-title">Seed Preview — ${escapeForAnalysis(_filePath)}</span><span class="dv-risk ${riskClass}">${riskLabel}</span></div><div class="dv-analysis-body"><div class="dv-finding"><span class="dv-finding-label">Left: Current on Disk</span><span class="dv-finding-detail">${leftLines.length} lines</span></div><div class="dv-finding"><span class="dv-finding-label">Right: Will Be</span><span class="dv-finding-detail">${rightLines.length} lines — editable, Save to update preview</span></div>${synFinding}</div>`;
    }
  };
  // Try IPC diffStrings if available
  if (window.electronAPI && window.electronAPI.git && window.electronAPI.git.diffStrings) {
    window.electronAPI.git.diffStrings(_previewLeftText, _previewRightText).then(diff => {
      doRender(diff || useSimpleDiff());
    }).catch(() => doRender(useSimpleDiff()));
  } else {
    // Check for our new IPC
    if (window.electronAPI && window.electronAPI.fileSeeder && window.electronAPI.fileSeeder.getPatchedPreview) {
      // Already have texts, just render
      doRender(useSimpleDiff());
    } else {
      doRender(useSimpleDiff());
    }
  }
}

function escapeForAnalysis(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

export function updateSyntaxError(newV) {
  _previewSyntaxError = newV || null;
  const leftBody = document.getElementById('dvLeftBody');
  const rightBody = document.getElementById('dvRightBody');
  let banner = document.getElementById('dvVerifyBanner');
  if (_previewSyntaxError) {
    const arr = Array.isArray(_previewSyntaxError) ? _previewSyntaxError : [_previewSyntaxError];
    const first = arr[0];
    const severity = first.severity || 'high';
    const bannerClass = severity === 'medium' ? 'dv-verify-banner dv-verify-banner--medium' : 'dv-verify-banner dv-verify-banner--high';
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'dvVerifyBanner';
      banner.className = bannerClass;
      const container = leftBody ? leftBody.parentElement : null;
      const anchor = leftBody || rightBody;
      if (container && anchor) container.insertBefore(banner, anchor);
      else if (container) container.prepend(banner);
    }
    banner.className = bannerClass;
    banner.style.display = 'flex';
    if (arr.length === 1) {
      const v = first;
      const lineInfo = v.line ? `Line ${v.line}${v.column ? `:${v.column}` : ''}` : 'Structure';
      const detail = escapeForAnalysis(v.error || 'syntax error');
      const snippet = v.snippet ? ` — <code>${escapeForAnalysis(v.snippet.slice(0,60))}</code>` : '';
      banner.innerHTML = `<span class="dv-verify-icon">!</span><span class="dv-verify-text"><strong>${lineInfo}:</strong> ${detail}${snippet}</span><button class="dv-verify-go" data-line="${v.line||1}">Go to line</button>`;
    } else {
      const items = arr.map(v=>{
        const li = v.line ? `${v.line}${v.column?`:${v.column}`:''}` : 'Structure';
        const sev = v.severity === 'medium' ? 'medium' : 'high';
        return `<div class="dv-verify-item dv-verify-item--${sev}"><strong>${escapeForAnalysis(li)}:</strong> ${escapeForAnalysis(v.error||'syntax error')}${v.snippet?` — <code>${escapeForAnalysis(v.snippet.slice(0,60))}</code>`:''}</div>`;
      }).join('');
      banner.innerHTML = `<span class="dv-verify-icon">!</span><div class="dv-verify-list">${items}</div><button class="dv-verify-go" data-line="${first.line||1}">Go to line</button>`;
    }
    const goBtn = banner.querySelector('.dv-verify-go');
    if (goBtn) goBtn.onclick = () => {
      const lineNum = parseInt(goBtn.dataset.line,10) || 1;
      const target = document.querySelector(`[data-line="${lineNum}"]`) || document.getElementById('dvRightBody');
      if (target && target.scrollIntoView) target.scrollIntoView({behavior:'smooth', block:'center'});
      const rb = document.getElementById('dvRightBody');
      if (rb) {
        const sample = document.querySelector('.dv-line');
        const lh = sample ? parseFloat(getComputedStyle(sample).lineHeight) || 18 : 18;
        rb.scrollTop = Math.max(0, (lineNum-5)*lh);
        const lb = document.getElementById('dvLeftBody');
        if (lb) lb.scrollTop = rb.scrollTop;
      }
    };
  } else if (banner) {
    banner.style.display = 'none';
  }
  // also refresh analysis panel severity
  const analysis = document.getElementById('dvAnalysis');
  if (analysis) {
    const arr = _previewSyntaxError ? (Array.isArray(_previewSyntaxError) ? _previewSyntaxError : [_previewSyntaxError]) : null;
    if (arr) {
      const sev = arr[0].severity || 'high';
      const riskClass = sev === 'medium' ? 'dv-risk-medium' : 'dv-risk-high';
      const headerRisk = analysis.querySelector('.dv-risk');
      if (headerRisk) { headerRisk.className = `dv-risk ${riskClass}`; headerRisk.textContent = 'Syntax Error'; }
      // rebuild findings if needed — append or replace syntax finding
      let existingFindings = analysis.querySelector('.dv-analysis-body');
      if (existingFindings) {
        // remove old syntax findings then re-add
        existingFindings.querySelectorAll('.dv-finding-high, .dv-finding-medium').forEach(el=>{
          if (el.textContent.includes('Syntax error') || el.textContent.includes('Duplicate import')) el.remove();
        });
        const synHtml = arr.map(v=>{
          const sClass = (v.severity === 'medium') ? 'dv-finding-medium' : 'dv-finding-high';
          const sevLabel = v.severity === 'medium' ? 'Duplicate import' : 'Syntax error';
          return `<div class="dv-finding ${sClass}"><span class="dv-finding-icon">!</span><div class="dv-finding-content"><span class="dv-finding-label">${sevLabel}</span><span class="dv-finding-detail">${escapeForAnalysis(v.error)}${v.line ? ` — line ${v.line}${v.column?`:${v.column}`:''}` : ''}${v.snippet?` — <code>${escapeForAnalysis(v.snippet.slice(0,40))}</code>`:''}</span></div></div>`;
        }).join('');
        existingFindings.insertAdjacentHTML('beforeend', synHtml);
      }
    } else {
      const headerRisk = analysis.querySelector('.dv-risk');
      if (headerRisk) {
        const hasLeft = _previewLeftText && _previewLeftText.length > 0;
        headerRisk.className = 'dv-risk dv-risk-medium';
        headerRisk.textContent = hasLeft ? 'Overwrite' : 'Create';
      }
      analysis.querySelectorAll('.dv-finding-high, .dv-finding-medium').forEach(el=>{
        if (el.textContent.includes('Syntax error') || el.textContent.includes('Duplicate import')) el.remove();
      });
    }
  }
  // keep _previewRightText in sync if needed by caller
}

export function close() {
  if (!_open) return;
  if (_editMode) {
    _autoSaveAndClose();
    return;
  }
  // Reset preview mode
  _previewMode = false;
  _previewLeftText = '';
  _previewRightText = '';
  _previewSyntaxError = null;
  const vb = document.getElementById('dvVerifyBanner');
  if (vb) vb.style.display = 'none';
  const leftSelect = document.getElementById('dvLeftSelect');
  const rightSelect = document.getElementById('dvRightSelect');
  if (leftSelect) leftSelect.style.display = '';
  if (rightSelect) rightSelect.style.display = '';
  const toggleBtn = document.getElementById('dvToggleBtn');
  if (toggleBtn) toggleBtn.style.display = '';
  const fileNav = document.getElementById('dvFileNav');
  if (fileNav) fileNav.remove();
  _panel.classList.remove('dv-open');
  _open = false;
}

function _autoSaveAndClose() {
  const leftBody = document.getElementById('dvLeftBody');
  if (!leftBody) { _forceClose(); return; }
  const textSpans = leftBody.querySelectorAll('.dv-text[contenteditable]');
  const content = Array.from(textSpans).map(el => el.textContent).join('\n');

  if (_previewMode) {
    const sourceText = _previewRightText;
    if (content !== sourceText) {
      _previewRightText = content;
      if (_previewOnSave) _previewOnSave(content);
    }
    _forceClose();
    return;
  }

  if (content !== _rawContent) {
    window.electronAPI.writeFile(_filePath, content).then(() => {
      _rawContent = content;
      _forceClose();
    }).catch(() => _forceClose());
  } else {
    _forceClose();
  }
}

function _forceClose() {
  _editMode = false;
  _showFloatingBanner(false);
  const leftBody = document.getElementById('dvLeftBody');
  if (leftBody) leftBody.classList.remove('dv-editor-active');
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
        <button class="dv-btn dv-btn-edit" id="dvEditBtn" style="display:none">Edit</button>
        <button class="dv-btn dv-btn-toggle" id="dvToggleBtn">View Diff</button>
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
  document.getElementById('dvEditBtn').addEventListener('click', _toggleEditMode);
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
  const leftLabel = document.querySelector('.dv-panel-left .dv-panel-label');
  const leftPanel = document.querySelector('.dv-panel-left');
  const leftSelect = document.getElementById('dvLeftSelect');
  const leftMsg = document.getElementById('dvLeftMsg');
  const rightPanel = document.querySelector('.dv-panel-right');
  const divider = document.querySelector('.dv-divider');
  const footer = document.getElementById('dvFooter');
  const analysis = document.getElementById('dvAnalysis');
  const toggleBtn = document.getElementById('dvToggleBtn');

  if (_showContent) {
    if (leftLabel) leftLabel.textContent = 'File Content';
    if (leftSelect) leftSelect.style.display = 'none';
    if (leftMsg) leftMsg.style.display = 'none';
    if (rightPanel) rightPanel.style.display = 'none';
    if (divider) divider.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (analysis) analysis.style.display = 'none';
    if (leftPanel) leftPanel.classList.add('dv-panel-full');
    if (toggleBtn) toggleBtn.textContent = 'View Diff';
  } else {
    if (leftLabel) leftLabel.textContent = _viewMode ? 'Commit' : 'Older';
    if (leftSelect) leftSelect.style.display = '';
    if (leftMsg) leftMsg.style.display = '';
    if (rightPanel) rightPanel.style.display = _viewMode ? 'none' : '';
    if (divider) divider.style.display = _viewMode ? 'none' : '';
    if (footer) footer.style.display = _viewMode ? 'none' : '';
    if (analysis) analysis.style.display = _viewMode ? 'none' : '';
    if (leftPanel) leftPanel.classList.remove('dv-panel-full');
    if (toggleBtn) toggleBtn.textContent = 'View File';
  }
}

function _toggleContentHistory() {
  if (_showContent) {
    if (!_commits.length) {
      _showError('No commit history available for this file');
      return;
    }
    _viewMode = false;
    _showContent = false;
    _updateSelects();
    _loadDiff();
  } else {
    _viewMode = true;
    _showContent = true;
    _loadContent();
  }
  _applyContentMode();
}

async function _loadContent() {
  const leftBody = document.getElementById('dvLeftBody');
  leftBody.innerHTML = '<div class="dv-loading">Loading file\u2026</div>';
  let lines;
  try {
    const res = await window.electronAPI.readFile(_filePath);
    _rawContent = res.success ? res.content : '';
    lines = _rawContent.split('\n');
  } catch {
    _rawContent = '';
    lines = [];
  }
  if (!_showContent) return;
  leftBody.innerHTML = lines.map((line, i) =>
    '<div class="dv-line dv-line-context"><span class="dv-ln">' + (i + 1) + '</span><span class="dv-text">' + _escape(line) + '</span></div>'
  ).join('') || '<div class="dv-empty">Unable to read file</div>';

  const editBtn = document.getElementById('dvEditBtn');
  if (editBtn) editBtn.style.display = _editMode ? 'none' : '';
}

function _escHandler(e) {
  if (!_open) return;
  if (_editMode) {
    if (e.key === 'Escape') _toggleEditMode();
    return;
  }
  if (e.key === 'Escape') close();
}

function _toggleEditMode() {
  _editMode = !_editMode;
  const leftBody = document.getElementById('dvLeftBody');
  const editBtn = document.getElementById('dvEditBtn');
  const toggleBtn = document.getElementById('dvToggleBtn');
  if (!leftBody) return;

  if (_editMode) {
    const sourceText = _previewMode ? _previewRightText : _rawContent;
    editBtn.textContent = 'Cancel';
    if (toggleBtn) toggleBtn.style.display = 'none';
    leftBody.innerHTML =
      '<div class="dv-editor-lines">' +
      sourceText.split('\n').map((line, i) =>
        '<div class="dv-line dv-line-context dv-line-editable"><span class="dv-ln">' + (i + 1) +
        '</span><span class="dv-text" contenteditable="true">' + _escape(line) + '</span></div>'
      ).join('') +
      '</div>' +
      '<div class="dv-editor-actions"><button class="dv-btn dv-editor-save-btn" id="dvSaveBtn">Save</button></div>';
    leftBody.classList.add('dv-editor-active');
    _showFloatingBanner(true);

    const linesContainer = leftBody.querySelector('.dv-editor-lines');
    const saveBtn = document.getElementById('dvSaveBtn');
    const firstText = leftBody.querySelector('.dv-text[contenteditable]');

    saveBtn.addEventListener('click', _saveContent);
    if (firstText) {
      firstText.focus();
      window.getSelection().selectAllChildren(firstText);
      window.getSelection().collapseToEnd();
    }

    leftBody._editorKeydown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        _saveContent();
      }
    };
    leftBody.addEventListener('keydown', leftBody._editorKeydown);
    // debounce 300ms on input for live re-verify (mark stale until save re-verifies)
    const _onEditorInput = () => {
      if (_editInputDebounce) clearTimeout(_editInputDebounce);
      _editInputDebounce = setTimeout(() => {
        const cur = Array.from(linesContainer.querySelectorAll('.dv-text[contenteditable]')).map(el=>el.textContent).join('\n');
        // keep preview text in sync for diff re-render on cancel/save
        if (_previewMode) {
          // mark banner stale until onSave verifies via getPatchedPreview
          let b = document.getElementById('dvVerifyBanner');
          if (b) {
            b.classList.add('dv-verify-banner--stale');
            b.title = 'Edited — save to re-verify';
          }
        } else {
          // for non-preview, try lightweight fallback check and update if obvious
          // simple bracket check: if unbalanced, show generic banner
          let b = document.getElementById('dvVerifyBanner');
          if (b && cur.trim().length < 10) { b.style.display = 'none'; }
        }
      }, 300);
    };
    linesContainer.addEventListener('input', _onEditorInput);
    leftBody._editorInputHandler = _onEditorInput;
    leftBody._editorLinesContainer = linesContainer;
  } else {
    editBtn.textContent = 'Edit';
    if (toggleBtn) toggleBtn.style.display = '';
    leftBody.classList.remove('dv-editor-active');
    if (leftBody._editorKeydown) {
      leftBody.removeEventListener('keydown', leftBody._editorKeydown);
      delete leftBody._editorKeydown;
    }
    if (leftBody._editorInputHandler && leftBody._editorLinesContainer) {
      leftBody._editorLinesContainer.removeEventListener('input', leftBody._editorInputHandler);
      delete leftBody._editorInputHandler;
      delete leftBody._editorLinesContainer;
    }
    if (_editInputDebounce) { clearTimeout(_editInputDebounce); _editInputDebounce = null; }
    const staleBanner = document.getElementById('dvVerifyBanner');
    if (staleBanner) staleBanner.classList.remove('dv-verify-banner--stale');
    _showFloatingBanner(false);
    if (_previewMode) {
      _renderPreviewDiff();
    } else {
      _loadContent();
    }
  }
}

function _showFloatingBanner(show) {
  let banner = document.getElementById('dvEditBanner');
  if (show) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'dvEditBanner';
      banner.className = 'dv-floating-banner';
      banner.textContent = 'Edit mode is enabled \u2014 Ctrl+S to save, Esc to cancel';
      document.body.appendChild(banner);
      requestAnimationFrame(() => banner.classList.add('dv-fb-visible'));
    } else {
      banner.classList.add('dv-fb-visible');
    }
  } else if (banner) {
    banner.classList.remove('dv-fb-visible');
  }
}

async function _saveContent() {
  const leftBody = document.getElementById('dvLeftBody');
  if (!leftBody) return;
  const textSpans = leftBody.querySelectorAll('.dv-text[contenteditable]');
  if (!textSpans.length) return;
  const content = Array.from(textSpans).map(el => el.textContent).join('\n');

  if (_previewMode) {
    const sourceText = _previewRightText;
    if (content === sourceText) {
      _toggleEditMode();
      return;
    }
    _previewRightText = content;
    if (_previewOnSave) _previewOnSave(content);
    _toggleEditMode();
    return;
  }

  if (content === _rawContent) {
    _toggleEditMode();
    return;
  }
  const saveBtn = document.getElementById('dvSaveBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }
  const res = await window.electronAPI.writeFile(_filePath, content);
  if (res.success) {
    _rawContent = content;
    _toggleEditMode();
  } else {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Failed \u2014 Retry';
    }
  }
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

  if (_showContent) {
    await _loadContent();
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
      leftHtml += '<div class="dv-line dv-line-context" data-line="' + line.oldLine + '"' + blockAttr + '><span class="dv-ln">' + line.oldLine + '</span><span class="dv-text">' + _escape(line.text) + '</span></div>';
      rightHtml += '<div class="dv-line dv-line-context" data-line="' + line.newLine + '"' + blockAttr + '><span class="dv-ln">' + line.newLine + '</span><span class="dv-text">' + _escape(line.text) + '</span></div>';
    } else if (line.type === 'removed') {
      removed++;
      leftHtml += '<div class="dv-line dv-line-removed" data-line="' + line.oldLine + '"' + blockAttr + '><span class="dv-ln">' + line.oldLine + '</span><span class="dv-text">' + _escape(line.text) + '</span></div>';
      rightHtml += '<div class="dv-line dv-line-gap"' + blockAttr + '></div>';
    } else if (line.type === 'added') {
      added++;
      leftHtml += '<div class="dv-line dv-line-gap"' + blockAttr + '></div>';
      rightHtml += '<div class="dv-line dv-line-added" data-line="' + line.newLine + '"' + blockAttr + '><span class="dv-ln">' + line.newLine + '</span><span class="dv-text">' + _escape(line.text) + '</span></div>';
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
