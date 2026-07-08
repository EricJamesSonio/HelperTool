let _currentOverlay = null;
let _currentEscHandler = null;

function _stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

function _escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _buildEntryElement(entry) {
  const div = document.createElement('div');
  div.className = 'ov-entry';

  const header = document.createElement('div');
  header.className = 'ov-entry-header';

  const cmdSpan = document.createElement('span');
  cmdSpan.className = 'ov-entry-command';
  cmdSpan.textContent = `$ ${entry.command}`;
  header.appendChild(cmdSpan);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'ov-entry-copy';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const text = `$ ${entry.command}\n${entry.output}`;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    }).catch(() => {});
  });
  header.appendChild(copyBtn);

  div.appendChild(header);

  const output = document.createElement('div');
  output.className = 'ov-entry-output collapsed';
  output.textContent = entry.output;
  output.addEventListener('click', (e) => {
    e.stopPropagation();
    output.classList.toggle('collapsed');
    output.classList.toggle('expanded');
  });
  div.appendChild(output);

  return div;
}

export function showOutputViewer({ title, content, command, language, entries } = {}) {
  closeOutputViewer();

  const lang = language || 'output';

  const overlay = document.createElement('div');
  overlay.className = 'ov-overlay';
  overlay.id = 'outputViewerOverlay';

  const hasEntries = entries && Array.isArray(entries) && entries.length > 0;

  if (hasEntries) {
    const copyAllText = entries
      .map(e => `$ ${e.command}\n${e.output}`)
      .join('\n\n');

    overlay.innerHTML = `
      <div class="ov-modal">
        <div class="ov-header">
          <div class="ov-title">
            <svg class="ov-title-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 14 10 4 16 14"/><line x1="2" y1="16" x2="18" y2="16"/>
            </svg>
            ${_escHtml(title || 'Output')}
          </div>
          <div class="ov-actions">
            <button class="ov-btn ov-btn-copy" id="ovCopyBtn" title="Copy all output">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <rect x="7" y="7" width="11" height="11" rx="1.5"/><path d="M4 11V4h7"/>
              </svg>
              <span>Copy All</span>
            </button>
            <button class="ov-btn ov-btn-close" id="ovCloseBtn" title="Close (Esc)">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16">
                <path d="M5 5l10 10"/><path d="M15 5L5 15"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="ov-body ov-body-entries" id="ovBody"></div>
        <div class="ov-footer">
          <span class="ov-footer-info">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="12" height="12">
              <circle cx="10" cy="10" r="8"/><line x1="10" y1="8" x2="10" y2="13"/><circle cx="10" cy="6.5" r="0.8" fill="currentColor"/>
            </svg>
            ${entries.length} command${entries.length !== 1 ? 's' : ''}
          </span>
          <span class="ov-footer-lang">${lang}</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    _currentOverlay = overlay;

    const body = overlay.querySelector('#ovBody');
    entries.forEach(entry => {
      body.appendChild(_buildEntryElement(entry));
    });

    const copyBtn = overlay.querySelector('#ovCopyBtn');
    copyBtn.addEventListener('click', () => _doCopy(copyAllText, copyBtn));

  } else {
    const cleanContent = _stripAnsi(String(content || ''));
    const hasCommand = command && String(command).trim();
    const copyText = hasCommand
      ? `$ ${command.trim()}\n${cleanContent}`
      : cleanContent;

    overlay.innerHTML = `
      <div class="ov-modal">
        <div class="ov-header">
          <div class="ov-title">
            <svg class="ov-title-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 14 10 4 16 14"/><line x1="2" y1="16" x2="18" y2="16"/>
            </svg>
            ${_escHtml(title || 'Output')}
          </div>
          <div class="ov-actions">
            <button class="ov-btn ov-btn-copy" id="ovCopyBtn" title="Copy all output">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <rect x="7" y="7" width="11" height="11" rx="1.5"/><path d="M4 11V4h7"/>
              </svg>
              <span>Copy</span>
            </button>
            <button class="ov-btn ov-btn-close" id="ovCloseBtn" title="Close (Esc)">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16">
                <path d="M5 5l10 10"/><path d="M15 5L5 15"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="ov-body">
          ${hasCommand ? `
          <div class="ov-command">
            <span class="ov-command-label">Command:</span>
            <code class="ov-command-text">${_escHtml(command.trim())}</code>
          </div>
          ` : ''}
          <pre class="ov-content" id="ovContent">${_escHtml(cleanContent)}</pre>
        </div>
        <div class="ov-footer">
          <span class="ov-footer-info">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="12" height="12">
              <circle cx="10" cy="10" r="8"/><line x1="10" y1="8" x2="10" y2="13"/><circle cx="10" cy="6.5" r="0.8" fill="currentColor"/>
            </svg>
            ${cleanContent.split('\n').length} lines · ${cleanContent.length} chars
          </span>
          <span class="ov-footer-lang">${lang}</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    _currentOverlay = overlay;

    const copyBtn = overlay.querySelector('#ovCopyBtn');
    copyBtn.addEventListener('click', () => _doCopy(copyText, copyBtn));
  }

  // Close button
  overlay.querySelector('#ovCloseBtn').addEventListener('click', closeOutputViewer);

  // Click outside
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOutputViewer();
  });

  // Escape
  _currentEscHandler = (e) => {
    if (e.key === 'Escape') closeOutputViewer();
  };
  document.addEventListener('keydown', _currentEscHandler);

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('ov-open'));
}

export function closeOutputViewer() {
  if (_currentEscHandler) {
    document.removeEventListener('keydown', _currentEscHandler);
    _currentEscHandler = null;
  }
  const el = document.getElementById('outputViewerOverlay');
  if (el) {
    el.classList.remove('ov-open');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => { if (el.parentNode) el.remove(); }, 200);
  }
  _currentOverlay = null;
}

export function isOutputViewerOpen() {
  return !!_currentOverlay;
}

function _doCopy(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const span = btn.querySelector('span');
    const orig = span.textContent;
    span.textContent = 'Copied!';
    btn.classList.add('ov-btn--copied');
    setTimeout(() => {
      span.textContent = orig;
      btn.classList.remove('ov-btn--copied');
    }, 1500);
  }).catch(() => {});
}
