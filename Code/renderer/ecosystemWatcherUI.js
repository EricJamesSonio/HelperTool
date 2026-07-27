let _panel = null;
let _open = false;
let _pollTimer = null;
let _runners = [];
let _urls = [];
let _activeCwd = window.__activeRepoPath || '';
let _selectedPath = window.__activeRepoPath || '';
let _userSetPath = false;
let _sessionPage = 0;
let _allSessions = [];
let _selectedRunnerId = null;
let _selectedSessionId = null;

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

function _hasOpenClass() {
  const p = document.getElementById('ecosystemWatcherPanel');
  return p?.classList.contains('open') ?? false;
}

export function isOpen() { return _hasOpenClass(); }

export function open() {
  if (_hasOpenClass()) return;
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
  _open = true;
  _refresh();
  _pollTimer = setInterval(_refresh, 5000);
}

export function close() {
  if (!_hasOpenClass()) return;
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
    _allSessions = sessions && sessions.data ? sessions.data : (sessions || []);
    _renderHealth(health);
    _renderSessions();

    // Sync path from global repo selection if user never picked one via the UI
    if (!_userSetPath && window.__activeRepoPath) {
      _activeCwd = window.__activeRepoPath;
      _selectedPath = window.__activeRepoPath;
      _updatePathDisplay();
    }
  } catch (err) {
    console.error('[EcoWatcher] Refresh error:', err);
  }
}

function _selectSession(sessionId) {
  const runner = _runners.find(function (r) { return r.sessionId === sessionId; });
  if (runner) {
    _selectedRunnerId = runner.runnerId;
    _selectedSessionId = null;
    _selectRunner(runner.runnerId);
  } else {
    _selectedSessionId = sessionId;
    _selectedRunnerId = null;
    _showEventsOnly(sessionId);
  }
}

function _updatePathDisplay() {
  const pathEl = document.getElementById('ewRunPath');
  const useBtn = document.getElementById('ewCwdUseBtn');
  const isActive = useBtn && useBtn.classList.contains('ew-cwd-in-use');

  const label = _selectedPath || _activeCwd;
  if (pathEl) pathEl.textContent = _esc(label || '(none selected)');
}

function _handleUsePath() {
  const useBtn = document.getElementById('ewCwdUseBtn');
  if (!useBtn) return;
  const isActive = useBtn.classList.contains('ew-cwd-in-use');

  if (isActive) {
    const prevCwd = _activeCwd;
    useBtn.classList.remove('ew-cwd-in-use');
    useBtn.textContent = 'Use';
    _activeCwd = '';
    const statusEl = document.getElementById('ewRunStatus');
    if (statusEl) statusEl.textContent = 'Path unset — pick one with Change';
    const input = document.getElementById('ewCmdInput');
    const pathPrefix = prevCwd.replace(/[/\\]$/, '') + '\\';
    if (input && input.value.startsWith(pathPrefix)) input.value = input.value.slice(pathPrefix.length);
    else if (input) input.value = '';
  } else {
    _activeCwd = _selectedPath || window.__activeRepoPath || '';
    if (!_activeCwd) {
      const statusEl = document.getElementById('ewRunStatus');
      if (statusEl) statusEl.textContent = 'No path selected — click Change first';
      return;
    }
    useBtn.classList.add('ew-cwd-in-use');
    useBtn.textContent = 'Active';
    const statusEl = document.getElementById('ewRunStatus');
    if (statusEl) statusEl.textContent = '✓ ' + _activeCwd;
    const input = document.getElementById('ewCmdInput');
    if (input) input.value = _activeCwd + '\\';
  }
  _updatePathDisplay();
}

async function _togglePathDropdown() {
  const dropdown = document.getElementById('ewCwdDropdown');
  const btn = document.getElementById('ewCwdChangeBtn');
  if (!dropdown) return;
  if (dropdown.style.display !== 'none') {
    dropdown.style.display = 'none';
    return;
  }
  dropdown.innerHTML = '<div class="ew-cwd-dropdown-loading">Loading...</div>';
  dropdown.style.display = '';

  let repos = [];
  try { repos = await window.electronAPI.getRecentRepos?.() || []; } catch (e) { repos = []; }

  dropdown.innerHTML = '';

  if (repos.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ew-cwd-dropdown-item ew-cwd-dropdown-empty';
    empty.textContent = 'No recent repos';
    dropdown.appendChild(empty);
  } else {
    for (const r of repos) {
      const item = document.createElement('div');
      item.className = 'ew-cwd-dropdown-item';
      if (r.repoPath === _selectedPath) item.classList.add('ew-cwd-dropdown-item--active');
      item.innerHTML = '<div class="ew-cwd-dropdown-item-name">' + _esc(r.repoPath.split(/[/\\]/).pop()) + '</div><div class="ew-cwd-dropdown-item-path">' + _esc(r.repoPath) + '</div>';
      item.addEventListener('click', function() {
        _selectPath(r.repoPath);
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(item);
    }
  }

  const divider = document.createElement('div');
  divider.className = 'ew-cwd-dropdown-divider';
  dropdown.appendChild(divider);

  const browse = document.createElement('div');
  browse.className = 'ew-cwd-dropdown-item';
  browse.innerHTML = '<span class="ew-cwd-dropdown-browse-icon">📁</span> Browse for another folder...';
  browse.addEventListener('click', async function() {
    dropdown.style.display = 'none';
    try {
      const repoPath = await window.electronAPI.selectRepo();
      if (repoPath) _selectPath(repoPath);
    } catch (e) { /* ignore */ }
  });
  dropdown.appendChild(browse);

  const closeDropdown = function(ev) {
    if (!dropdown.contains(ev.target) && ev.target !== btn) {
      dropdown.style.display = 'none';
      document.removeEventListener('click', closeDropdown);
      document.removeEventListener('keydown', closeOnEscape);
    }
  };
  const closeOnEscape = function(ev) {
    if (ev.key === 'Escape') {
      dropdown.style.display = 'none';
      document.removeEventListener('click', closeDropdown);
      document.removeEventListener('keydown', closeOnEscape);
    }
  };
  setTimeout(function() {
    document.addEventListener('click', closeDropdown);
    document.addEventListener('keydown', closeOnEscape);
  }, 0);
}

function _selectPath(path) {
  _userSetPath = true;
  _selectedPath = path;
  const useBtn = document.getElementById('ewCwdUseBtn');
  if (useBtn) {
    useBtn.classList.remove('ew-cwd-in-use');
    useBtn.textContent = 'Use';
  }
  _activeCwd = '';
  _updatePathDisplay();
  const statusEl = document.getElementById('ewRunStatus');
  if (statusEl) statusEl.textContent = 'Click Use to activate this path';
}

async function _handleRun() {
  const input = document.getElementById('ewCmdInput');
  const cmd = input ? input.value.trim() : '';
  if (!cmd) return;

  const cwd = _activeCwd;
  if (!cwd) {
    const statusEl = document.getElementById('ewRunStatus');
    if (statusEl) statusEl.textContent = 'No path selected — click Change, pick a folder, then Use';
    return;
  }

  // Strip cwd prefix from command if present, so process-runner gets just the relative part
  let command = cmd;
  const cwdPrefix = cwd.replace(/[/\\]$/, '') + '\\';
  if (command.startsWith(cwdPrefix)) {
    command = command.slice(cwdPrefix.length);
  }

  const runBtn = document.getElementById('ewRunBtn');
  if (runBtn) runBtn.disabled = true;
  const statusEl = document.getElementById('ewRunStatus');
  if (statusEl) statusEl.textContent = 'Starting...';

  try {
    const result = await window.electronAPI.watcher.runCommand({ command: command, cwd: cwd });
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

async function _handleStop(runnerId) {
  try {
    await window.electronAPI.watcher.stopCommand(runnerId);
    if (_selectedRunnerId === runnerId) {
      _selectedRunnerId = null;
      _selectedSessionId = null;
      document.getElementById('ewSplitView').style.display = 'none';
    }
  } catch (e) {
    console.error('[EcoWatcher] Stop error:', e);
  }
}

function _stripAnsi(s) {
  return s
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1b\][0-9;]*[^\x1b]*\x1b\\/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b[^\[\(]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/\r/g, '');
}

async function _selectRunner(runnerId) {
  _selectedRunnerId = runnerId;
  _renderSessions();
  const splitEl = document.getElementById('ewSplitView');
  if (!splitEl) return;
  splitEl.style.display = '';

  const terminalEl = document.getElementById('ewSplitTerminal');
  const eventsEl = document.getElementById('ewSplitEvents');
  if (terminalEl) terminalEl.textContent = 'Loading output...';
  if (eventsEl) eventsEl.textContent = 'Loading events...';

  const runner = _runners.find(function (r) { return r.runnerId === runnerId; });
  const sessionId = runner ? runner.sessionId : null;

  let termText = '(no output)';
  let events = [];
  let sessionEvents = [];

  try {
    const result = await window.electronAPI.watcher.commandOutput({ runnerId, tail: 200 });
    termText = result && result.success ? result.data : '(no output)';
  } catch (e) { /* ignore */ }

  if (sessionId) {
    try {
      const timeline = await window.electronAPI.watcher.timeline(sessionId, 50);
      sessionEvents = timeline && timeline.data ? timeline.data : [];
    } catch (e) { /* ignore */ }
  }

  if (terminalEl) terminalEl.textContent = _stripAnsi(termText || '(empty)');
  if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;

  if (eventsEl) {
    if (!sessionEvents.length) {
      eventsEl.textContent = '(no events)';
    } else {
      eventsEl.innerHTML = sessionEvents.map(function (e) {
        const type = e.type || 'log';
        const ts = e.ts ? new Date(e.ts).toLocaleTimeString() : '';
        const msg = e.summary || e.message || e.data && e.data.raw || '(no message)';
        return '<div class="ew-split-event">' +
          '<span class="ew-event-type ' + type + '">' + type + '</span>' +
          '<span class="ew-split-event-msg">' + _esc(msg).slice(0, 200) + '</span>' +
          '<span class="ew-split-event-time">' + ts + '</span>' +
          '</div>';
      }).join('');
    }
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

async function _handleUrlReconnect(port) {
  try {
    await window.electronAPI.watcher.urlCheckNow(port);
    await _refresh();
  } catch (e) {
    console.error('[EcoWatcher] URL reconnect error:', e);
  }
}

async function _handleManualUrlConnect(sessionId) {
  const input = document.getElementById('ewManualUrl_' + sessionId);
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;

  const btn = document.getElementById('ewManualUrlBtn_' + sessionId);
  if (btn) btn.disabled = true;

  let url = raw;
  let port = 0;
  const match = raw.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/);
  if (match) {
    port = parseInt(match[1], 10);
  } else {
    const portMatch = raw.match(/:(\d+)/);
    if (portMatch) {
      port = parseInt(portMatch[1], 10);
      url = 'http://localhost:' + port;
    }
  }

  if (!port) {
    if (btn) btn.disabled = false;
    return;
  }

  try {
    await window.electronAPI.watcher.urlRegister({
      url: url,
      port: port,
      framework: 'manual',
      sessionId: sessionId,
    });
    await window.electronAPI.watcher.urlCheckNow(port);
    input.value = '';
    await _refresh();
  } catch (e) {
    console.error('[EcoWatcher] Manual URL connect error:', e);
  }
  if (btn) btn.disabled = false;
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
          </div>
          <div class="ew-run-bar-row ew-run-bar-meta">
            <div class="ew-cwd-row">
              <span class="ew-run-cwd" id="ewRunCwd">Path: <span id="ewRunPath">${_esc(_activeCwd || '(none selected)')}</span></span>
              <button class="ew-cwd-use-btn" id="ewCwdUseBtn">Use</button>
              <div class="ew-cwd-select-wrap">
                <button class="ew-cwd-change-btn" id="ewCwdChangeBtn">Change ▾</button>
                <div class="ew-cwd-dropdown" id="ewCwdDropdown" style="display:none"></div>
              </div>
            </div>
            <span class="ew-run-status" id="ewRunStatus"></span>
          </div>
        </div>

        <div class="ew-section">
          <div class="ew-section-title">Sessions</div>
          <div id="ewSessions" class="ew-sessions">Loading...</div>
        </div>

        <div class="ew-split-view" id="ewSplitView" style="display:none">
          <div class="ew-split-pane ew-split-terminal-pane">
            <div class="ew-section-title">Terminal Output</div>
            <pre class="ew-split-terminal" id="ewSplitTerminal"></pre>
          </div>
          <div class="ew-split-divider"></div>
          <div class="ew-split-pane ew-split-events-pane">
            <div class="ew-section-title">Events</div>
            <div class="ew-split-events" id="ewSplitEvents"></div>
          </div>
        </div>

        <div class="ew-section">
          <div class="ew-section-title">Health</div>
          <div id="ewHealth" class="ew-health">Loading...</div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(_panel);

  _panel.querySelector('#ewCloseBtn').addEventListener('click', close);
  _panel.addEventListener('click', (e) => {
    if (e.target === _panel) close();
  });
  document.addEventListener('keydown', _escHandler);

  document.getElementById('ewRunBtn').addEventListener('click', _handleRun);

  document.getElementById('ewCmdInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _handleRun();
  });

  document.getElementById('ewCwdUseBtn').addEventListener('click', _handleUsePath);
  document.getElementById('ewCwdChangeBtn').addEventListener('click', _togglePathDropdown);
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

function _renderSessions() {
  const el = document.getElementById('ewSessions');
  if (!el) return;

  // Build merged list
  const items = [];
  const usedSessionIds = new Set();

  // Runners (active commands)
  for (const r of _runners) {
    const uptime = r.uptime != null ? _fmtUptime(r.uptime) : _fmtUptime(Math.floor((Date.now() - r.startedAt) / 1000));
    items.push({
      id: r.runnerId,
      sessionId: r.sessionId,
      label: r.command || ('Runner ' + r.runnerId),
      status: r.status,
      startedAt: r.startedAt || Date.now(),
      meta: uptime + ' \u00b7 ' + (r.outputLineCount || 0) + ' lines',
      isRunner: true,
      runner: r,
    });
    usedSessionIds.add(r.sessionId);
  }

  // Watcher-only sessions (no active runner)
  for (const s of _allSessions) {
    if (usedSessionIds.has(s.sessionId)) continue;
    const cmdInfo = s.command || '';
    const label = cmdInfo || ('Session ' + s.sessionId);
    const sourceLabel = cmdInfo ? 'run' : (s.source || 'ai');
    items.push({
      id: s.sessionId,
      sessionId: s.sessionId,
      label: label,
      status: 'stopped',
      startedAt: s.startedAt || Date.now(),
      meta: sourceLabel + ' | ' + (s.eventCount || 0) + ' events',
      isRunner: false,
      watcherSession: s,
    });
  }

  // Sort — most recent first
  items.sort(function (a, b) { return b.startedAt - a.startedAt; });

  if (!items.length) {
    el.innerHTML = '<div class="ew-empty">No sessions</div>';
    return;
  }

  // Paginate (show 5)
  const pageSize = 5;
  const totalPages = Math.ceil(items.length / pageSize) || 1;
  if (_sessionPage >= totalPages) _sessionPage = totalPages - 1;
  const start = _sessionPage * pageSize;
  const page = items.slice(start, start + pageSize);

  let html = '<div class="ew-sessions-list">';
  for (const item of page) {
    const dotClass = item.status === 'running' ? 'ew-dot-running' : 'ew-dot-ended';
    const isSelected = (item.isRunner && item.runner.runnerId === _selectedRunnerId) || (!item.isRunner && item.sessionId === _selectedSessionId);
    const statusLabel = item.status === 'running' ? 'Running' : 'Stopped';

    html += '<div class="ew-session-item' + (isSelected ? ' ew-session-item--selected' : '') + '" data-id="' + item.sessionId + '" data-runner-id="' + (item.isRunner ? item.runner.runnerId : '') + '">';

    html += '<span class="ew-runner-dot ' + dotClass + '" title="' + statusLabel + '"></span>';

    html += '<div class="ew-session-info">';
    html += '<div class="ew-session-id">' + _esc(item.label) + '</div>';
    html += '<div class="ew-session-meta"><span class="ew-status-label ' + item.status + '">' + statusLabel + '</span> &middot; ' + _esc(item.meta) + '</div>';
    if (item.isRunner && item.runner.detectedUrls && item.runner.detectedUrls.length) {
      html += '<div class="ew-session-urls">';
      for (const u of item.runner.detectedUrls) {
        const urlInfo = _urls.find(function (x) { return x.port === u.port; });
        const isOnline = urlInfo && urlInfo.status === 'online';
        const healthDot = urlInfo ? (isOnline ? '\ud83d\udfe2' : urlInfo.status === 'offline' ? '\ud83d\udd34' : '\ud83d\udfe1') : '\u26aa';
        html += '<span class="ew-session-url' + (isOnline ? '' : ' ew-session-url--offline') + '">' + healthDot + ' ' + _esc(u.url) + '</span>';
        if (!isOnline) {
          html += '<button class="ew-url-reconnect-btn" data-port="' + u.port + '" title="Re-check URL">\u27f3</button>';
        }
      }
      html += '</div>';
    }
    html += '<div class="ew-manual-url-row" data-session-id="' + item.sessionId + '">';
    html += '<input class="ew-manual-url-input" id="ewManualUrl_' + item.sessionId + '" type="text" placeholder="Add URL manually e.g. http://localhost:5173" spellcheck="false" />';
    html += '<button class="ew-manual-url-btn" id="ewManualUrlBtn_' + item.sessionId + '" data-session-id="' + item.sessionId + '">Connect</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="ew-session-actions">';
    html += '<button class="ew-session-view-btn" data-action="view">View</button>';
    if (item.isRunner && item.status === 'running') {
      html += '<button class="ew-session-stop-btn" data-action="stop" data-runner-id="' + item.runner.runnerId + '">Stop</button>';
    }
    html += '</div>';

    html += '</div>';
  }
  html += '</div>';

  if (totalPages > 1) {
    html += '<div class="ew-session-pages">';
    html += '<span class="ew-page-info">Page ' + (_sessionPage + 1) + ' of ' + totalPages + '</span>';
    if (_sessionPage < totalPages - 1) {
      html += '<button class="ew-page-btn" id="ewNextPage">Next</button>';
    }
    html += '</div>';
  }

  el.innerHTML = html;

  // Click on item body toggles split view
  el.querySelectorAll('.ew-session-item').forEach(function (item) {
    item.addEventListener('click', function (e) {
      if (e.target.closest('[data-action]')) return;
      const runnerId = item.dataset.runnerId;
      const sessionId = item.dataset.id;
      if (runnerId) {
        const r = _runners.find(function (x) { return x.runnerId === runnerId; });
        if (r) {
          if (_selectedRunnerId === runnerId) {
            _selectedRunnerId = null;
            _selectedSessionId = null;
            document.getElementById('ewSplitView').style.display = 'none';
          } else {
            _selectedRunnerId = runnerId;
            _selectedSessionId = null;
            _selectRunner(runnerId);
          }
        }
      } else {
        if (_selectedSessionId === sessionId) {
          _selectedSessionId = null;
          _selectedRunnerId = null;
          document.getElementById('ewSplitView').style.display = 'none';
        } else {
          _selectedSessionId = sessionId;
          _selectedRunnerId = null;
          _showEventsOnly(sessionId);
        }
      }
      _renderSessions();
    });
  });

  // View buttons
  el.querySelectorAll('.ew-session-view-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const item = btn.closest('.ew-session-item');
      if (!item) return;
      item.click();
    });
  });

  // Stop buttons
  el.querySelectorAll('.ew-session-stop-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const runnerId = btn.dataset.runnerId;
      if (runnerId) _handleStop(runnerId);
    });
  });

  // Reconnect URL buttons
  el.querySelectorAll('.ew-url-reconnect-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const port = parseInt(btn.dataset.port, 10);
      if (port) _handleUrlReconnect(port);
    });
  });

  // Manual URL Connect buttons
  el.querySelectorAll('.ew-manual-url-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const sessionId = btn.dataset.sessionId;
      if (sessionId) _handleManualUrlConnect(sessionId);
    });
  });

  // Manual URL input Enter key
  el.querySelectorAll('.ew-manual-url-input').forEach(function (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.stopPropagation();
        const sessionId = input.closest('.ew-session-item')?.dataset?.id;
        if (sessionId) _handleManualUrlConnect(sessionId);
      }
    });
  });

  const nextBtn = document.getElementById('ewNextPage');
  if (nextBtn) nextBtn.addEventListener('click', function () {
    _sessionPage++;
    _renderSessions();
  });
}

async function _showEventsOnly(sessionId) {
  const splitEl = document.getElementById('ewSplitView');
  if (!splitEl) return;
  splitEl.style.display = '';

  const terminalEl = document.getElementById('ewSplitTerminal');
  const eventsEl = document.getElementById('ewSplitEvents');
  if (terminalEl) terminalEl.textContent = '(no terminal — session only)';
  if (eventsEl) eventsEl.textContent = 'Loading events...';

  let sessionEvents = [];
  try {
    const timeline = await window.electronAPI.watcher.timeline(sessionId, 50);
    sessionEvents = timeline && timeline.data ? timeline.data : [];
  } catch (e) { /* ignore */ }

  if (eventsEl) {
    if (!sessionEvents.length) {
      eventsEl.textContent = '(no events)';
    } else {
      eventsEl.innerHTML = sessionEvents.map(function (e) {
        const type = e.type || 'log';
        const ts = e.ts ? new Date(e.ts).toLocaleTimeString() : '';
        const msg = e.summary || e.message || e.data && e.data.raw || '(no message)';
        return '<div class="ew-split-event">' +
          '<span class="ew-event-type ' + type + '">' + type + '</span>' +
          '<span class="ew-split-event-msg">' + _esc(msg).slice(0, 200) + '</span>' +
          '<span class="ew-split-event-time">' + ts + '</span>' +
          '</div>';
      }).join('');
    }
  }
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
