let _panel = null;
let _open = false;
let _pollTimer = null;
let _runners = [];
let _urls = [];
let _expandedOutput = null;

function _el(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'innerHTML') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  if (children) for (const c of [].concat(children)) el.appendChild(c);
  return el;
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function isOpen() { return _open; }

export function open() {
  if (_open) return;
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
  _open = true;
  _refresh();
  _pollTimer = setInterval(_refresh, 5000);
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('open');
  _open = false;
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

async function _refresh() {
  try {
    const [health, sessions, cmdList, urlList] = await Promise.all([
      window.electronAPI.watcher.health(),
      window.electronAPI.watcher.sessions(),
      window.electronAPI.watcher.commandList(),
      window.electronAPI.watcher.urlList(),
    ]);
    _runners = cmdList && cmdList.success ? cmdList.data : [];
    _urls = urlList && urlList.success ? urlList.data : [];
    _renderHealth(health);
    _renderRunners();
    _renderSessions(sessions);
  } catch (err) {
    console.error('[EcoWatcher] Refresh error:', err);
  }
}

async function _selectSession(sessionId) {
  try {
    const [snapshot, timeline] = await Promise.all([
      window.electronAPI.watcher.snapshot(sessionId),
      window.electronAPI.watcher.timeline(sessionId, 50),
    ]);
    _renderDetail(snapshot, timeline);
  } catch (err) {
    console.error('[EcoWatcher] Session detail error:', err);
  }
}

async function _handleRun() {
  const input = document.getElementById('ewCmdInput');
  const cmd = input ? input.value.trim() : '';
  if (!cmd) return;

  const cwd = window.__activeRepoPath || '';
  if (!cwd) {
    const statusEl = document.getElementById('ewRunStatus');
    if (statusEl) statusEl.textContent = 'No repo path selected';
    return;
  }

  const runBtn = document.getElementById('ewRunBtn');
  const stopBtn = document.getElementById('ewStopBtn');
  if (runBtn) runBtn.disabled = true;
  const statusEl = document.getElementById('ewRunStatus');
  if (statusEl) statusEl.textContent = 'Starting...';

  try {
    const result = await window.electronAPI.watcher.runCommand({ command: cmd, cwd });
    if (result && result.success) {
      if (statusEl) statusEl.textContent = 'Running';
      input.value = '';
    } else {
      if (statusEl) statusEl.textContent = 'Failed: ' + (result ? result.error : 'unknown');
      if (runBtn) runBtn.disabled = false;
    }
  } catch (e) {
    console.error('[EcoWatcher] Run error:', e);
    if (statusEl) statusEl.textContent = 'Error: ' + e.message;
    if (runBtn) runBtn.disabled = false;
  }
}

async function _handleStop() {
  if (!_runners.length) return;
  const last = _runners[_runners.length - 1];
  const runBtn = document.getElementById('ewRunBtn');
  const statusEl = document.getElementById('ewRunStatus');
  try {
    await window.electronAPI.watcher.stopCommand(last.runnerId);
    if (statusEl) statusEl.textContent = 'Stopped';
  } catch (e) {
    console.error('[EcoWatcher] Stop error:', e);
    if (statusEl) statusEl.textContent = 'Stop error: ' + e.message;
  }
  if (runBtn) runBtn.disabled = false;
}

async function _toggleOutput(runnerId) {
  const outputSection = document.getElementById('ewOutputSection');
  const outputArea = document.getElementById('ewOutputArea');
  if (!outputSection || !outputArea) return;

  if (_expandedOutput === runnerId) {
    outputSection.style.display = 'none';
    _expandedOutput = null;
    return;
  }

  _expandedOutput = runnerId;
  outputSection.style.display = '';
  outputArea.textContent = 'Loading output...';

  try {
    const result = await window.electronAPI.watcher.commandOutput({ runnerId, tail: 100 });
    const text = result && result.success ? result.data : '(no output)';
    outputArea.textContent = text || '(empty)';
    outputArea.scrollTop = outputArea.scrollHeight;
  } catch (e) {
    outputArea.textContent = 'Error loading output: ' + e.message;
  }
}

async function _registerUrl(info) {
  try {
    await window.electronAPI.watcher.urlRegister({
      url: info.url,
      port: info.port,
      framework: info.framework,
      sessionId: info.sessionId,
    });
  } catch (e) {
    console.error('[EcoWatcher] URL register error:', e);
  }
}

function _buildPanel() {
  _panel = document.createElement('div');
  _panel.id = 'ecosystemWatcherPanel';
  _panel.className = 'ew-overlay';
  _panel.innerHTML = `
    <div class="ew-modal">
      <div class="ew-header">
        <span class="ew-title">Ecosystem Watcher</span>
        <button class="ew-close-btn" id="ewCloseBtn">&times;</button>
      </div>
      <div class="ew-body">
        <div class="ew-run-bar">
          <div class="ew-run-bar-row">
            <input class="ew-run-input" id="ewCmdInput" type="text" placeholder="npm run dev" spellcheck="false" autocomplete="off" />
            <button class="ew-run-btn" id="ewRunBtn">Run</button>
            <button class="ew-stop-btn" id="ewStopBtn">Stop</button>
          </div>
          <div class="ew-run-bar-row ew-run-bar-meta">
            <span class="ew-run-cwd" id="ewRunCwd">Path: <span id="ewRunPath">${_esc(window.__activeRepoPath || '(none selected)')}</span></span>
            <span class="ew-run-status" id="ewRunStatus"></span>
          </div>
        </div>

        <div class="ew-runners-section" id="ewRunnersSection" style="display:none">
          <div class="ew-section-title">Running Commands</div>
          <div id="ewRunners" class="ew-runners"></div>
        </div>

        <div class="ew-output-section" id="ewOutputSection" style="display:none">
          <div class="ew-section-title">Command Output</div>
          <pre class="ew-output-area" id="ewOutputArea"></pre>
        </div>

        <div class="ew-section">
          <div class="ew-section-title">Health</div>
          <div id="ewHealth" class="ew-health">Loading...</div>
        </div>
        <div class="ew-section">
          <div class="ew-section-title">Sessions</div>
          <div id="ewSessions" class="ew-sessions">Loading...</div>
        </div>
        <div class="ew-section" id="ewDetailSection" style="display:none">
          <div class="ew-section-title">
            Session Detail
            <button class="ew-back-btn" id="ewBackBtn">Back</button>
          </div>
          <div id="ewDetail" class="ew-detail"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(_panel);

  _panel.querySelector('#ewCloseBtn').addEventListener('click', close);
  _panel.querySelector('#ewBackBtn').addEventListener('click', () => {
    document.getElementById('ewDetailSection').style.display = 'none';
  });
  _panel.addEventListener('click', (e) => {
    if (e.target === _panel) close();
  });
  document.addEventListener('keydown', _escHandler);

  document.getElementById('ewRunBtn').addEventListener('click', _handleRun);
  document.getElementById('ewStopBtn').addEventListener('click', _handleStop);

  document.getElementById('ewCmdInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _handleRun();
  });
}

function _escHandler(e) {
  if (e.key === 'Escape' && _open) close();
}

function _renderHealth(health) {
  const el = document.getElementById('ewHealth');
  if (!el) return;
  const d = health && health.data ? health.data : health || {};
  el.innerHTML = `
    <div class="ew-health-grid">
      <span class="ew-health-label">Status</span>
      <span class="ew-health-value ${d.running ? 'running' : 'stopped'}">${d.running ? 'Running' : 'Stopped'}</span>
      <span class="ew-health-label">Sessions</span>
      <span class="ew-health-value">${d.sessionCount || 0}</span>
      <span class="ew-health-label">Network Capture</span>
      <span class="ew-health-value">${d.captures && d.captures.network ? 'Active' : 'Inactive'}</span>
      <span class="ew-health-label">Uptime</span>
      <span class="ew-health-value">${_fmtUptime(d.uptime)}</span>
    </div>
  `;
}

function _renderRunners() {
  const section = document.getElementById('ewRunnersSection');
  const el = document.getElementById('ewRunners');
  const outputSection = document.getElementById('ewOutputSection');
  if (!section || !el) return;

  if (!_runners || _runners.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  el.innerHTML = '';

  for (const r of _runners) {
    const statusDot = r.status === 'running' ? 'ew-dot-running' : r.status === 'ended' ? 'ew-dot-ended' : r.status === 'killed' ? 'ew-dot-killed' : 'ew-dot-failed';

    const card = document.createElement('div');
    card.className = 'ew-runner-card';

    const urlHtml = r.detectedUrls && r.detectedUrls.length > 0
      ? '<div class="ew-runner-urls">' + r.detectedUrls.map(u => {
          const urlInfo = _urls.find(x => x.port === u.port);
          const healthDot = urlInfo ? (urlInfo.status === 'online' ? '🟢' : urlInfo.status === 'offline' ? '🔴' : '🟡') : '⚪';
          const healthText = urlInfo ? (urlInfo.status + (urlInfo.responseTimeMs ? ' ' + urlInfo.responseTimeMs + 'ms' : '')) : 'checking...';
          return `<div class="ew-runner-url">
            <span class="ew-url-dot">${healthDot}</span>
            <span class="ew-url-text">${_esc(u.url)}</span>
            <span class="ew-url-framework">${_esc(u.framework || 'Dev Server')}</span>
            <span class="ew-url-health">${healthText}</span>
          </div>`;
        }).join('') + '</div>'
      : '';

    const uptime = r.uptime != null ? _fmtUptime(r.uptime) : _fmtUptime(Math.floor((Date.now() - r.startedAt) / 1000));

    card.innerHTML = `
      <div class="ew-runner-row">
        <span class="ew-runner-dot ${statusDot}"></span>
        <div class="ew-runner-info">
          <span class="ew-runner-cmd">${_esc(r.command)}</span>
          <span class="ew-runner-meta">${r.status} · ${uptime} · ${r.outputLineCount || 0} lines</span>
        </div>
        <button class="ew-runner-view-btn" data-runner-id="${_esc(r.runnerId)}">Output</button>
      </div>
      ${urlHtml}
    `;

    el.appendChild(card);

    const viewBtn = card.querySelector('.ew-runner-view-btn');
    viewBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      _toggleOutput(r.runnerId);
    });

    // Auto-register URLs from running commands
    if (r.detectedUrls && r.status === 'running') {
      for (const u of r.detectedUrls) {
        const exists = _urls.some(x => x.port === u.port);
        if (!exists) {
          _registerUrl({ url: u.url, port: u.port, framework: u.framework, sessionId: r.sessionId });
        }
      }
    }
  }
}

function _renderSessions(result) {
  const el = document.getElementById('ewSessions');
  if (!el) return;
  const sessions = result && result.data ? result.data : result;
  if (!sessions || !sessions.length) {
    el.innerHTML = '<div class="ew-empty">No active sessions</div>';
    return;
  }
  el.innerHTML = sessions.map(s => {
    const cmdInfo = s.command || '';
    const label = cmdInfo || ('Session ' + s.sessionId);
    const sourceLabel = cmdInfo ? 'run' : (s.source || 'ai');
    return `
    <div class="ew-session-item" data-id="${s.sessionId}">
      <div>
        <div class="ew-session-id">${_esc(label)}</div>
        <div class="ew-session-meta">${sourceLabel} | ${s.eventCount || 0} events | ${_fmtUptime(Math.floor((Date.now() - (s.startedAt || Date.now())) / 1000))}</div>
      </div>
      <span style="color:var(--text-faint,#364060);font-size:0.75rem">View &rarr;</span>
    </div>
  `}).join('');
  el.querySelectorAll('.ew-session-item').forEach(item => {
    item.addEventListener('click', () => _selectSession(item.dataset.id));
  });
}

function _renderDetail(snapshot, timeline) {
  const section = document.getElementById('ewDetailSection');
  const el = document.getElementById('ewDetail');
  if (!section || !el) return;
  section.style.display = '';

  const snap = snapshot && snapshot.data ? snapshot.data : {};
  const events = timeline && timeline.data ? timeline.data : [];

  let html = '';
  if (snap.summary) {
    html += `<div class="ew-summary-box"><div class="ew-summary-label">Summary</div>${_esc(snap.summary)}</div>`;
  }
  if (snap.keyEvents && snap.keyEvents.length) {
    html += '<div class="ew-summary-box"><div class="ew-summary-label">Key Events</div>';
    html += snap.keyEvents.map(k => `<div class="ew-key-event">${_esc(k)}</div>`).join('');
    html += '</div>';
  }

  html += '<div class="ew-summary-label" style="margin-bottom:6px">Event Timeline</div>';
  if (!events.length) {
    html += '<div class="ew-empty">No events recorded yet</div>';
  } else {
    html += events.map(e => {
      const type = e.type || 'log';
      const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '';
      return `<div class="ew-event-item">
        <span class="ew-event-type ${type}">${type}</span>
        <span class="ew-event-msg">${_esc(e.message || e.data?.raw || '(no message)').slice(0, 200)}</span>
        <span class="ew-event-time">${ts}</span>
      </div>`;
    }).join('');
  }

  el.innerHTML = html;
}

function _fmtUptime(sec) {
  if (!sec || sec < 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(h + 'h');
  if (m) parts.push(m + 'm');
  parts.push(s + 's');
  return parts.join(' ');
}
