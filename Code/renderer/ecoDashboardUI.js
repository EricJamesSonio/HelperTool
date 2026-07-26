let _panel = null;
let _open = false;
let _pollTimer = null;

const _QUADRANTS = {
  consoleLogs:    { title: 'Console Logs',    icon: '\u2261', order: 0 },
  apiCalls:       { title: 'API Calls',       icon: '\u25CE', order: 1 },
  terminalErrors: { title: 'Terminal Errors', icon: '\u26A0', order: 2 },
  browserErrors:  { title: 'Browser Errors',  icon: '\u2716', order: 3 },
};

const _TYPES = ['consoleLogs', 'apiCalls', 'terminalErrors', 'browserErrors'];
const _state = {};

function _initState() {
  for (var i = 0; i < _TYPES.length; i++) {
    _state[_TYPES[i]] = {
      events: [],
      oldestSeq: null,
      hasMore: false,
      autoScroll: true,
      loading: false,
    };
  }
}

export function isOpen() { return _open; }

export function open() {
  if (_open) return;
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
  _open = true;
  _initState();
  _autoFillPath();
  _refreshStatus();
  _poll();
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(_pollAndStatus, 2000);
  document.addEventListener('keydown', _escHandler);
}

async function _autoFillPath() {
  try {
    var p = await window.electronAPI.getActiveProject();
    if (p && p.repoPath) document.getElementById('ecoPathInput').value = p.repoPath;
  } catch (e) { /* ignore */ }
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('open');
  _open = false;
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  document.removeEventListener('keydown', _escHandler);
}

function _escHandler(e) {
  if (e.key === 'Escape') close();
}

function _buildPanel() {
  _panel = document.createElement('div');
  _panel.className = 'eco-overlay';
  _panel.id = 'ecoDashboardPanel';
  _panel.innerHTML =
    '<div class="eco-modal">' +
      '<div class="eco-header">' +
        '<span class="eco-title">Ecosystem Tool</span>' +
        '<button class="eco-close-btn" id="ecoCloseBtn">&times;</button>' +
      '</div>' +
      '<div class="eco-control-bar" id="ecoControlBar">' +
        '<div class="eco-control-row">' +
          '<input class="eco-path-input" id="ecoPathInput" type="text" placeholder="Project directory\u2026" spellcheck="false" />' +
          '<button class="eco-browse-btn" id="ecoBrowseBtn">Browse</button>' +
          '<input class="eco-cmd-input" id="ecoCmdInput" type="text" placeholder="npm run dev" spellcheck="false" />' +
          '<button class="eco-run-btn" id="ecoRunBtn">Run</button>' +
          '<button class="eco-stop-btn" id="ecoStopBtn" style="display:none">Stop</button>' +
        '</div>' +
        '<div class="eco-control-row eco-status-row">' +
          '<span class="eco-status-indicator" id="ecoStatusDot"></span>' +
          '<span class="eco-status-text" id="ecoStatusText">Stopped</span>' +
          '<span class="eco-url-display" id="ecoUrlDisplay" style="display:none"></span>' +
        '</div>' +
      '</div>' +
      '<div class="eco-body">' +
        '<div class="eco-grid" id="ecoGrid"></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(_panel);
  document.getElementById('ecoCloseBtn').addEventListener('click', close);
  _panel.addEventListener('click', function (e) { if (e.target === _panel) close(); });
  document.getElementById('ecoBrowseBtn').addEventListener('click', _handleBrowse);
  document.getElementById('ecoRunBtn').addEventListener('click', _handleRun);
  document.getElementById('ecoStopBtn').addEventListener('click', _handleStop);
  document.getElementById('ecoCmdInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') _handleRun();
  });

  var grid = document.getElementById('ecoGrid');
  var sorted = _TYPES.slice().sort(function (a, b) { return _QUADRANTS[a].order - _QUADRANTS[b].order; });
  for (var i = 0; i < sorted.length; i++) {
    var type = sorted[i];
    var q = _QUADRANTS[type];
    var qEl = document.createElement('div');
    qEl.className = 'eco-quadrant';
    qEl.id = 'ecoQuadrant_' + type;
    qEl.innerHTML =
      '<div class="eco-quadrant-header">' +
        '<span class="eco-quadrant-icon">' + q.icon + '</span>' +
        '<span class="eco-quadrant-title">' + q.title + '</span>' +
        '<span class="eco-quadrant-badge" id="ecoBadge_' + type + '">0</span>' +
        '<div class="eco-quadrant-actions">' +
          '<button class="eco-quadrant-btn" id="ecoClear_' + type + '">Clear</button>' +
          '<button class="eco-quadrant-btn active" id="ecoScroll_' + type + '">Auto</button>' +
        '</div>' +
      '</div>' +
      '<div class="eco-event-list" id="ecoList_' + type + '">' +
        '<div class="eco-empty">No events</div>' +
      '</div>' +
      '<div class="eco-quadrant-footer">' +
        '<button class="eco-load-more" id="ecoLoadMore_' + type + '" disabled>Load More</button>' +
      '</div>';
    grid.appendChild(qEl);

    document.getElementById('ecoClear_' + type).addEventListener('click', function (t) {
      return function () { _clearQuadrant(t); };
    }(type));
    document.getElementById('ecoScroll_' + type).addEventListener('click', function (t) {
      return function () { _toggleScroll(t); };
    }(type));
    document.getElementById('ecoLoadMore_' + type).addEventListener('click', function (t) {
      return function () { _loadMore(t); };
    }(type));
  }
}

async function _handleBrowse() {
  try {
    var p = await window.electronAPI.selectRepo();
    if (p) document.getElementById('ecoPathInput').value = p;
  } catch (e) { /* ignore */ }
}

async function _handleRun() {
  var path = document.getElementById('ecoPathInput').value.trim();
  var cmd = document.getElementById('ecoCmdInput').value.trim();
  if (!path || !cmd) return;
  document.getElementById('ecoRunBtn').style.display = 'none';
  document.getElementById('ecoStopBtn').style.display = '';
  document.getElementById('ecoStatusText').textContent = 'Starting\u2026';
  document.getElementById('ecoStatusDot').className = 'eco-status-indicator eco-status-waiting';
  for (var i = 0; i < _TYPES.length; i++) {
    _state[_TYPES[i]] = { events: [], oldestSeq: null, hasMore: false, autoScroll: true, loading: false };
    _renderQuadrant(_TYPES[i]);
  }
  try {
    var res = await window.electronAPI.eco.run(path, cmd);
    if (!res || !res.success) {
      document.getElementById('ecoStatusText').textContent = 'Failed: ' + ((res && res.error) || 'unknown');
      document.getElementById('ecoStatusDot').className = 'eco-status-indicator eco-status-stopped';
      document.getElementById('ecoRunBtn').style.display = '';
      document.getElementById('ecoStopBtn').style.display = 'none';
    }
  } catch (e) {
    document.getElementById('ecoStatusText').textContent = 'Error: ' + e.message;
    document.getElementById('ecoStatusDot').className = 'eco-status-indicator eco-status-stopped';
    document.getElementById('ecoRunBtn').style.display = '';
    document.getElementById('ecoStopBtn').style.display = 'none';
  }
}

async function _handleStop() {
  try {
    await window.electronAPI.eco.stop();
  } catch (e) { /* ignore */ }
  document.getElementById('ecoRunBtn').style.display = '';
  document.getElementById('ecoStopBtn').style.display = 'none';
  document.getElementById('ecoUrlDisplay').style.display = 'none';
  document.getElementById('ecoStatusText').textContent = 'Stopped';
  document.getElementById('ecoStatusDot').className = 'eco-status-indicator eco-status-stopped';
}

async function _refreshStatus() {
  try {
    var st = await window.electronAPI.eco.status();
    if (!st) return;
    var dot = document.getElementById('ecoStatusDot');
    var txt = document.getElementById('ecoStatusText');
    var urlDisp = document.getElementById('ecoUrlDisplay');
    if (st.running) {
      document.getElementById('ecoStopBtn').style.display = '';
      document.getElementById('ecoRunBtn').style.display = 'none';
      if (st.url && st.url !== '__MANUAL_INPUT_REQUIRED__') {
        dot.className = 'eco-status-indicator eco-status-running';
        txt.textContent = 'Running';
        urlDisp.style.display = '';
        urlDisp.textContent = st.url;
        if (st.browserConnected) {
          urlDisp.innerHTML = st.url + ' <span class="eco-browser-tag">browser connected</span>';
        }
      } else if (st.url === '__MANUAL_INPUT_REQUIRED__') {
        dot.className = 'eco-status-indicator eco-status-waiting';
        txt.textContent = 'Waiting for URL \u2014 enter manually:';
        urlDisp.style.display = '';
        urlDisp.innerHTML = '<input class="eco-manual-url" id="ecoManualUrl" type="text" placeholder="http://localhost:XXXX" />' +
          '<button class="eco-quadrant-btn" id="ecoManualUrlBtn">Connect</button>';
        document.getElementById('ecoManualUrlBtn').addEventListener('click', async function () {
          var u = document.getElementById('ecoManualUrl').value.trim();
          if (u) {
            try { await window.electronAPI.eco.stop(); } catch (e) {}
            try { await window.electronAPI.eco.run(document.getElementById('ecoPathInput').value.trim(), document.getElementById('ecoCmdInput').value.trim()); } catch (e) {}
          }
        });
      } else {
        dot.className = 'eco-status-indicator eco-status-waiting';
        txt.textContent = 'Running \u2014 waiting for URL\u2026';
        urlDisp.style.display = 'none';
      }
    } else {
      dot.className = 'eco-status-indicator eco-status-stopped';
      txt.textContent = 'Stopped';
      urlDisp.style.display = 'none';
      if (document.getElementById('ecoRunBtn').style.display === 'none') {
        document.getElementById('ecoRunBtn').style.display = '';
        document.getElementById('ecoStopBtn').style.display = 'none';
      }
    }
  } catch (e) { /* ignore */ }
}

function _pollAndStatus() {
  _poll();
  _refreshStatus();
}

async function _poll() {
  for (var i = 0; i < _TYPES.length; i++) {
    var type = _TYPES[i];
    try {
      var res = await window.electronAPI.eco.feed(type, null);
      _mergeEvents(type, res);
    } catch (e) { /* silent */ }
  }
}

function _mergeEvents(type, res) {
  if (!res || !res.events) return;
  var st = _state[type];
  var events = res.events;
  if (!events.length) {
    st.hasMore = res.hasMore;
    return;
  }

  var known = {};
  for (var k = 0; k < st.events.length; k++) known[st.events[k].seq] = true;
  var newEvts = [];
  for (var k = 0; k < events.length; k++) {
    if (!known[events[k].seq]) newEvts.push(events[k]);
  }
  if (!newEvts.length) {
    st.hasMore = res.hasMore;
    return;
  }
  st.events = st.events.concat(newEvts);
  st.oldestSeq = st.events.length > 0 ? st.events[0].seq : null;
  st.hasMore = res.hasMore;
  _renderQuadrant(type);
}

async function _loadMore(type) {
  var st = _state[type];
  if (st.loading || !st.hasMore || st.oldestSeq == null) return;
  st.loading = true;
  try {
    var res = await window.electronAPI.eco.feed(type, st.oldestSeq);
    if (res && res.events && res.events.length) {
      st.events = res.events.concat(st.events);
      st.oldestSeq = st.events.length > 0 ? st.events[0].seq : null;
      st.hasMore = res.hasMore;
      _renderQuadrant(type);
    } else if (res) {
      st.hasMore = res.hasMore;
    }
  } catch (e) { /* silent */ } finally {
    st.loading = false;
  }
}

function _clearQuadrant(type) {
  _state[type].events = [];
  _state[type].oldestSeq = null;
  _state[type].hasMore = false;
  window.electronAPI.eco.clear(type);
  _renderQuadrant(type);
}

function _toggleScroll(type) {
  var st = _state[type];
  st.autoScroll = !st.autoScroll;
  var btn = document.getElementById('ecoScroll_' + type);
  if (btn) btn.classList.toggle('active');
  if (st.autoScroll) _scrollToBottom(type);
}

function _scrollToBottom(type) {
  var list = document.getElementById('ecoList_' + type);
  if (list) list.scrollTop = list.scrollHeight;
}

function _renderQuadrant(type) {
  var st = _state[type];
  var list = document.getElementById('ecoList_' + type);
  if (!list) return;

  var badge = document.getElementById('ecoBadge_' + type);
  if (badge) badge.textContent = st.events.length;

  var loadMoreBtn = document.getElementById('ecoLoadMore_' + type);
  if (loadMoreBtn) {
    loadMoreBtn.disabled = !st.hasMore || st.loading;
    loadMoreBtn.textContent = st.loading ? 'Loading\u2026' : 'Load More';
  }

  if (!st.events.length) {
    list.innerHTML = '<div class="eco-empty">No events</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < st.events.length; i++) {
    var e = st.events[i];
    var level = e.level || 'info';
    var ts = e.ts ? _fmtTime(e.ts) : '';
    var text = e.text || '';
    var extraHtml = '';

    if (type === 'apiCalls') {
      var method = e.method || '';
      var status = e.status;
      if (status != null) {
        var ok = status >= 200 && status < 400;
        extraHtml = '<span class="eco-api-method">' + _esc(method) + '</span>' +
          '<span class="eco-event-status ' + (ok ? 'ok' : 'fail') + '">' + status + '</span>';
        if (e.duration != null) extraHtml += '<span class="eco-event-duration">' + e.duration + 'ms</span>';
      } else {
        extraHtml = '<span class="eco-api-method">' + _esc(method) + '</span>';
      }
    }

    var truncated = text.length > 120 ? text.slice(0, 120) + '\u2026' : text;
    html += '<div class="eco-event-row" data-seq="' + e.seq + '" data-type="' + type + '">';
    html += '<span class="eco-event-level ' + level + '">' + level + '</span>';
    html += '<span class="eco-event-time">' + ts + '</span>';
    html += '<span class="eco-event-text">' + _esc(truncated) + '</span>';
    if (extraHtml) html += extraHtml;
    html += '</div>';

    if (e.details) {
      html += '<div class="eco-event-details" id="ecoDetails_' + e.seq + '">' + _esc(typeof e.details === 'string' ? e.details : JSON.stringify(e.details, null, 2)) + '</div>';
    }
  }

  list.innerHTML = html;

  var rows = list.querySelectorAll('.eco-event-row');
  for (var i = 0; i < rows.length; i++) {
    (function (row) {
      row.addEventListener('click', function () {
        row.classList.toggle('expanded');
      });
    }(rows[i]));
  }

  if (st.autoScroll) _scrollToBottom(type);
}

function _fmtTime(ts) {
  var d = new Date(ts);
  return d.getHours().toString().padStart(2, '0') + ':' +
    d.getMinutes().toString().padStart(2, '0') + ':' +
    d.getSeconds().toString().padStart(2, '0');
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
