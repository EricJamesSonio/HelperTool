let _panel = null;
let _open = false;
let _pollTimer = null;
let _patched = false;

const _QUADRANTS = {
  logs:    { title: 'Logs',    icon: '\u2261', order: 0, cssClass: 'logs' },
  network: { title: 'Network', icon: '\u25CE', order: 1, cssClass: 'network' },
  console: { title: 'Console', icon: '\u226B', order: 2, cssClass: 'console' },
  errors:  { title: 'Errors',  icon: '\u26A0', order: 3, cssClass: 'errors' },
};

const _TYPES = ['logs', 'network', 'console', 'errors'];
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
  _installPatches();
  _poll();
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(_poll, 2000);
  document.addEventListener('keydown', _escHandler);
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
        '<span class="eco-title">Ecosystem Dashboard</span>' +
        '<button class="eco-close-btn" id="ecoCloseBtn">&times;</button>' +
      '</div>' +
      '<div class="eco-body">' +
        '<div class="eco-grid" id="ecoGrid"></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(_panel);
  document.getElementById('ecoCloseBtn').addEventListener('click', close);
  _panel.addEventListener('click', function (e) { if (e.target === _panel) close(); });

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
        '<div class="eco-empty">Waiting for events\u2026</div>' +
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

  var known = new Set();
  for (var k = 0; k < st.events.length; k++) known.add(st.events[k].seq);
  var newEvts = [];
  for (var k = 0; k < events.length; k++) {
    if (!known.has(events[k].seq)) newEvts.push(events[k]);
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
    var duration = '';
    var statusHtml = '';
    if (type === 'network' && e.duration != null) {
      duration = e.duration + 'ms';
    }
    if (type === 'network' && e.status != null) {
      var ok = e.status >= 200 && e.status < 400;
      statusHtml = '<span class="eco-event-status ' + (ok ? 'ok' : 'fail') + '">' + e.status + '</span>';
    }
    var truncated = text.length > 120 ? text.slice(0, 120) + '\u2026' : text;

    html += '<div class="eco-event-row" data-seq="' + e.seq + '" data-type="' + type + '">';
    html += '<span class="eco-event-level ' + level + '">' + level + '</span>';
    html += '<span class="eco-event-time">' + ts + '</span>';
    html += '<span class="eco-event-text">' + _esc(truncated) + '</span>';
    if (duration) html += '<span class="eco-event-duration">' + duration + '</span>';
    if (statusHtml) html += statusHtml;
    html += '</div>';

    if (e.details) {
      html += '<div class="eco-event-details" id="ecoDetails_' + e.seq + '">' + _esc(typeof e.details === 'string' ? e.details : JSON.stringify(e.details, null, 2)) + '</div>';
    }
  }

  list.innerHTML = html;
  _attachEventListeners(type);

  if (st.autoScroll) _scrollToBottom(type);
}

function _attachEventListeners(type) {
  var list = document.getElementById('ecoList_' + type);
  if (!list) return;
  var rows = list.querySelectorAll('.eco-event-row');
  for (var i = 0; i < rows.length; i++) {
    (function (row) {
      row.addEventListener('click', function () {
        row.classList.toggle('expanded');
      });
    }(rows[i]));
  }
}

function _installPatches() {
  if (_patched) return;
  _patched = true;

  var eco = window.electronAPI.eco;
  if (!eco) return;

  function _filterNetworkUrl(url) {
    if (!url) return false;
    var u = url.toLowerCase();
    var qIdx = u.indexOf('?');
    var path = qIdx !== -1 ? u.slice(0, qIdx) : u;
    var fIdx = path.indexOf('#');
    if (fIdx !== -1) path = path.slice(0, fIdx);
    var exts = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.ico', '.map'];
    for (var i = 0; i < exts.length; i++) {
      if (path.endsWith(exts[i])) return false;
    }
    if (u.indexOf('/api') !== -1) return true;
    if (u.indexOf('/graphql') !== -1) return true;
    if (u.indexOf('/rest') !== -1) return true;
    return false;
  }

  var _origLog = console.log;
  var _origWarn = console.warn;
  var _origError = console.error;
  var _origInfo = console.info;

  console.log = function () {
    var text = '';
    try { text = Array.prototype.map.call(arguments, function (a) { return typeof a === 'string' ? a : JSON.stringify(a, null, 2); }).join(' '); } catch (e) { text = String(arguments[0] || ''); }
    eco.push({ source: 'renderer', type: 'console', level: 'log', text: text, ts: Date.now() });
    _origLog.apply(console, arguments);
  };
  console.warn = function () {
    var text = '';
    try { text = Array.prototype.map.call(arguments, function (a) { return typeof a === 'string' ? a : JSON.stringify(a, null, 2); }).join(' '); } catch (e) { text = String(arguments[0] || ''); }
    eco.push({ source: 'renderer', type: 'console', level: 'warn', text: text, ts: Date.now() });
    _origWarn.apply(console, arguments);
  };
  console.error = function () {
    var text = '';
    try { text = Array.prototype.map.call(arguments, function (a) { return typeof a === 'string' ? a : JSON.stringify(a, null, 2); }).join(' '); } catch (e) { text = String(arguments[0] || ''); }
    eco.push({ source: 'renderer', type: 'console', level: 'error', text: text, ts: Date.now() });
    _origError.apply(console, arguments);
  };
  console.info = function () {
    var text = '';
    try { text = Array.prototype.map.call(arguments, function (a) { return typeof a === 'string' ? a : JSON.stringify(a, null, 2); }).join(' '); } catch (e) { text = String(arguments[0] || ''); }
    eco.push({ source: 'renderer', type: 'console', level: 'info', text: text, ts: Date.now() });
    _origInfo.apply(console, arguments);
  };

  var _origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    var method = (init && init.method) || 'GET';
    var startTime = Date.now();
    var shouldCapture = _filterNetworkUrl(url);
    return _origFetch.apply(window, arguments).then(function (response) {
      if (shouldCapture) {
        var ct = response.headers.get('content-type') || '';
        if (!ct.includes('application/json') && !url.includes('/api') && !url.includes('/graphql') && !url.includes('/rest')) {
          return response;
        }
        var cloned = response.clone();
        cloned.text().then(function (body) {
          eco.push({
            source: 'renderer', type: 'network', subType: 'fetch',
            url: url, method: method, status: response.status,
            duration: Date.now() - startTime,
            contentType: ct,
            ts: startTime, text: method + ' ' + url + ' \u2192 ' + response.status,
            details: { url: url, method: method, status: response.status, duration: Date.now() - startTime, body: body.slice(0, 2000) },
          });
        }).catch(function () {});
      }
      return response;
    }).catch(function (err) {
      if (shouldCapture) {
        eco.push({
          source: 'renderer', type: 'network', subType: 'fetch',
          url: url, method: method, status: 0, error: err.message,
          duration: Date.now() - startTime,
          ts: startTime, text: method + ' ' + url + ' \u2192 FAILED: ' + err.message,
          details: { url: url, method: method, error: err.message, duration: Date.now() - startTime },
        });
      }
      throw err;
    });
  };

  var _OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    var xhr = new _OrigXHR();
    var _open = xhr.open.bind(xhr);
    var _send = xhr.send.bind(xhr);
    var _url = '';
    var _method = '';
    xhr.open = function (method, url) {
      _method = method;
      _url = typeof url === 'string' ? url : (url ? url.toString() : '');
      return _open(method, url);
    };
    xhr.send = function (body) {
      var startTime = Date.now();
      var shouldCapture = _filterNetworkUrl(_url);
      if (shouldCapture) {
        xhr.addEventListener('loadend', function () {
          var ct = '';
          try { ct = xhr.getResponseHeader('content-type') || ''; } catch (e) { /* ignore */ }
          eco.push({
            source: 'renderer', type: 'network', subType: 'xhr',
            url: _url, method: _method, status: xhr.status,
            duration: Date.now() - startTime, contentType: ct,
            ts: startTime,
            text: _method + ' ' + _url + ' \u2192 ' + xhr.status,
            details: { url: _url, method: _method, status: xhr.status, duration: Date.now() - startTime, response: xhr.responseText ? xhr.responseText.slice(0, 2000) : '' },
          });
        });
      }
      return _send(body);
    };
    return xhr;
  };
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
