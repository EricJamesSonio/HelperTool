import { state as _appState } from './app_manager/appState.js';

const FRESH_MS = 60 * 1000;
const SNAP_KEY = 'profile.snapshot.v1';
const TAB_KEY = 'profile.tab';
const SCOPE_KEY = 'profile.scope';
const REPOS_KEY = 'profile.repos.v2';
const REPOS_TTL = 5 * 60 * 1000;
const REPOS_PER_PAGE = 20;

const TAB_DEFS = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'commits', label: 'Commits' },
  { id: 'repos', label: 'Repositories' },
];

const PROFILE_COLORS = ['#4F8EF7', '#34d399', '#f472b6', '#fb923c', '#a78bfa', '#fbbf24'];

let _panel = null;
let _open = false;
let _profile = null;
let _avatarDataUrl = null;
let _heatmapYear = new Date().getFullYear();
let _statsRange = 'all';
let _donutRange = 'all';
let _historyPage = 1;
let _historyRepo = '';
let _dayDetail = null;
let _editingProfile = false;

let _tab = TAB_DEFS.some((t) => t.id === _lsGet(TAB_KEY)) ? _lsGet(TAB_KEY) : 'workspace';
let _scope = _lsGet(SCOPE_KEY) === 'all' ? 'all' : 'account';

let _lastPrime = 0;
let _hydratedAt = 0;
let _primePromise = null;
let _skipSnapshot = false;
let _statusText = '';
let _statusLoading = false;
let _changeTimer = null;

let _accounts = [];
let _activeAccountId = null;
let _accMenuOpen = false;
let _accBusy = false;
let _accMsg = '';
let _accWarn = false;
let _accMsgTimer = 0;
let _acctRepoSet = null;

let _repos = [];
let _reposAccountId = '';
let _reposFilter = 'all';
let _reposSort = 'date';
let _reposQuery = '';
let _reposPage = 1;
let _reposLoading = false;
let _reposError = '';
let _reposInflight = '';
let _reposPromise = null;
let _reposSeq = 0;
const _reposMem = new Map();

let _pill = null;
let _pillTimer = 0;

// data cache with TTL and stale-while-revalidate
let _cache = {};
let _plain = {};

function _lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function _lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {}
}

function _lsJson(key) {
  try {
    const raw = _lsGet(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function _cached(key, fetcher, ttlMs) {
  const entry = _cache[key];
  const now = Date.now();
  if (entry !== undefined) {
    if (now - entry.fetchedAt < entry.ttl) {
      return entry.data;
    }
    const stale = entry.data;
    _cache[key] = { data: fetcher().catch(() => null), fetchedAt: now, ttl: ttlMs || 30000 };
    return stale;
  }
  const promise = fetcher().catch(() => null);
  _cache[key] = { data: promise, fetchedAt: now, ttl: ttlMs || 30000 };
  return promise;
}

function _put(key, data, ttl) {
  if (data === undefined || data === null) return;
  _cache[key] = { data: Promise.resolve(data), fetchedAt: Date.now(), ttl: ttl || 60000 };
  _plain[key] = data;
}

function _clearCache() {
  _cache = {};
  _plain = {};
  _skipSnapshot = true;
}

function _hasAnyCache() {
  return Object.keys(_plain).length > 0;
}

function _saveSnapshot() {
  try {
    _lsSet(SNAP_KEY, JSON.stringify({ at: _lastPrime || Date.now(), plain: _plain }));
  } catch (_) {}
}

function _restoreSnapshot() {
  if (_skipSnapshot) return false;
  const snap = _lsJson(SNAP_KEY);
  if (!snap || !snap.plain) return false;
  for (const key of Object.keys(snap.plain)) _put(key, snap.plain[key], 60000);
  _lastPrime = snap.at || 0;
  return true;
}

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
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _repoPath() {
  return (_appState && _appState.selectedRepoPath) || window.__activeRepoPath || null;
}

function _openUrl(url) {
  if (!url) return;
  if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(url);
  else window.open(url, '_blank');
}

function _resizeImage(file, maxSize) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxSize) { h *= maxSize / w; w = maxSize; } }
      else { if (h > maxSize) { w *= maxSize / h; h = maxSize; } }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

// ── Background loading status ──

function _pillShow(text, kind) {
  if (_open) {
    _hidePill();
    return;
  }
  if (!_pill) {
    _pill = document.createElement('div');
    _pill.className = 'pf-warm-pill';
    document.body.appendChild(_pill);
  }
  clearTimeout(_pillTimer);
  _pill.className = 'pf-warm-pill show ' + (kind || '');
  let icon = '';
  if (kind === 'loading') icon = '<span class="pf-spinner sm"></span>';
  else if (kind === 'done') icon = '<span class="pf-warm-check">\u2713</span>';
  _pill.innerHTML = icon + '<span>' + _esc(text) + '</span>';
  if (kind !== 'loading') _pillTimer = setTimeout(_hidePill, 2200);
}

function _hidePill() {
  clearTimeout(_pillTimer);
  if (_pill) _pill.classList.remove('show');
}

function _paintStatus() {
  const el = _panel ? _panel.querySelector('#pfStatus') : null;
  if (!el) return;
  if (_statusLoading) {
    el.innerHTML = '<span class="pf-spinner sm"></span><span>' + _esc(_statusText) + '</span>';
  } else if (_lastPrime) {
    el.innerHTML = '<span>Updated ' + _esc(_timeAgo(new Date(_lastPrime).toISOString())) + '</span>';
  } else {
    el.innerHTML = '';
  }
}

function _progress(done, total) {
  _statusText = 'Loading resources\u2026 ' + done + '/' + total;
  _paintStatus();
  _pillShow('Loading profile resources\u2026 ' + done + '/' + total, 'loading');
}

// ── Accounts (shared with the GitHub accounts panel) ──

function _activeAccount() {
  return _accounts.find((a) => a.id === _activeAccountId) || null;
}

async function _loadAccounts() {
  const api = window.gitAccountsAPI;
  if (!api) {
    _accounts = [];
    _activeAccountId = null;
    return;
  }
  try {
    const res = await api.list(_repoPath());
    if (res && res.success) {
      _accounts = res.accounts || [];
      _activeAccountId = res.activeId || null;
    }
  } catch (_) {}
}

function _matchesAccount(r) {
  const acc = _activeAccount();
  if (!acc) return true;
  const remote = String(r.remote || '').toLowerCase();
  if (!remote) return false;
  if (remote.split('/')[0] === String(acc.username).toLowerCase()) return true;
  return !!(_acctRepoSet && _acctRepoSet.has(remote));
}

function _setAcctSet(list) {
  _acctRepoSet = new Set((list || []).map((r) => String(r.fullName || '').toLowerCase()));
}

function _setAccMsg(text, warn) {
  clearTimeout(_accMsgTimer);
  _accMsg = text || '';
  _accWarn = !!warn;
  if (text) {
    _accMsgTimer = setTimeout(() => {
      _accMsg = '';
      if (_panel && !_dayDetail) _renderBody('card');
    }, 8000);
  }
}

async function _switchAccount(id) {
  const api = window.gitAccountsAPI;
  const target = id || null;
  if (!api || _accBusy) return;
  _accMenuOpen = false;
  if (target === (_activeAccountId || null)) {
    _renderBody('card');
    return;
  }
  _accBusy = true;
  _setAccMsg('', false);
  _renderBody('card');
  try {
    const res = await api.switch(_repoPath(), target);
    if (res && res.success) {
      _activeAccountId = res.activeId || null;
      _acctRepoSet = null;
      _reposPage = 1;
      if (res.warning) _setAccMsg(res.warning, true);
    } else {
      _setAccMsg((res && res.error) || 'Could not switch account.', true);
    }
  } catch (err) {
    _setAccMsg(err && err.message ? err.message : 'Could not switch account.', true);
  }
  _accBusy = false;
  _renderBody('card');
  _renderBody('dash');
  _renderBody('repos');
  _loadRepos(false);
}

// ── Priming (fetch everything once, keep it warm) ──

function _prime(force) {
  if (_primePromise) return _primePromise;
  if (!force && _lastPrime && Date.now() - _lastPrime < FRESH_MS) return Promise.resolve(false);
  _primePromise = _doPrime().finally(() => {
    _primePromise = null;
  });
  return _primePromise;
}

async function _doPrime() {
  const api = window.electronAPI && window.electronAPI.profile;
  if (!api) return false;
  const days = _dashRange === 'month' ? 30 : 7;
  const total = 5;
  let done = 0;
  _statusLoading = true;
  _progress(done, total);
  const step = () => {
    done += 1;
    _progress(done, total);
  };

  const jobs = [
    api.getAll({
      statsRange: _statsRange,
      heatmapYear: _heatmapYear,
      donutRange: _donutRange,
      historyPage: _historyPage,
      historyRepo: _historyRepo,
    }).then((all) => {
      if (!all) return;
      if (all.profile) _profile = all.profile;
      _put('stats:' + _statsRange, all.stats, 60000);
      _put('heatmap:' + _heatmapYear, all.heatmap, 60000);
      _put('donuts:' + _donutRange, all.donuts, 60000);
      _put('history:' + _historyPage + ':' + _historyRepo, all.history, 60000);
    }).catch(() => {}).then(step),

    api.getOverview({ range: _dashRange }).then((ov) => {
      if (ov && ov.repos) _put('overview:' + _dashRange, ov, 60000);
    }).catch(() => {}).then(step),

    api.getHours(days).then((hrs) => {
      _put('hours:' + days, hrs, 300000);
    }).catch(() => {}).then(step),

    _loadAccounts().then(step),

    (_avatarDataUrl
      ? Promise.resolve()
      : api.getAvatar().then((av) => {
        if (av && av.dataUrl) _avatarDataUrl = av.dataUrl;
      }).catch(() => {})
    ).then(step),
  ];

  await Promise.all(jobs);
  _lastPrime = Date.now();
  _statusLoading = false;
  _paintStatus();
  _saveSnapshot();
  return true;
}

export async function warm() {
  if (!window.electronAPI || !window.electronAPI.profile) return;
  const bootDone = (capMs) => new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (!document.getElementById('appLoadingOverlay') || Date.now() - started > capMs) {
        resolve();
        return;
      }
      setTimeout(check, 400);
    };
    check();
  });
  const idle = (timeoutMs) => new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: timeoutMs });
    else setTimeout(resolve, 1000);
  });
  try {
    await bootDone(25000);
    await idle(5000);
    if (_open) return;
    await _prime(false);
    if (_open) return;
    if (_activeAccount()) {
      _pillShow('Loading repositories\u2026', 'loading');
      await _loadRepos(false);
    }
    _pillShow('Profile ready', 'done');
  } catch (_) {
    _hidePill();
  }
}

export function isOpen() { return _open; }

export function open() {
  if (_open) return;
  _ensurePanel();
  _panel.classList.add('open');
  _open = true;
  _hidePill();
  _load();
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('open');
  _open = false;
  _dayDetail = null;
  _editingProfile = false;
  _accMenuOpen = false;
}

function _ensurePanel() {
  if (!_panel) _buildPanel();
}

function _forceRefresh() {
  _clearCache();
  _lastPrime = 0;
  _hydratedAt = 0;
  _reposMem.clear();
  _load().then(() => {
    _loadRepos(true);
  });
}

function _buildPanel() {
  _panel = document.createElement('div');
  _panel.id = 'profilePanel';
  _panel.className = 'pf-overlay';
  _panel.innerHTML = `
    <div class="pf-container">
      <div class="pf-header">
        <h2><span class="pf-header-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M2 18a8 8 0 0 1 16 0"/></svg></span> Profile</h2>
        <div class="pf-header-right">
          <button class="pf-btn-icon" id="pfRefreshBtn" title="Refresh"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M19 16v-6h-6"/><path d="M17.65 6.35A8 8 0 0 0 3.3 9.7M2.35 13.65A8 8 0 0 0 16.7 10.3"/></svg></button>
          <button class="pf-btn-close" id="pfCloseBtn"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg></button>
        </div>
      </div>
      <div class="pf-body" id="pfBody">
        <div class="pf-loading">Loading resources\u2026</div>
      </div>
      <input type="file" accept="image/*" id="pfAvatarInput" hidden>
    </div>
  `;
  document.body.appendChild(_panel);
  _panel.querySelector('#pfCloseBtn').addEventListener('click', close);
  _panel.querySelector('#pfRefreshBtn').addEventListener('click', _forceRefresh);
  _panel.querySelector('#pfAvatarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await _resizeImage(file, 200);
    const result = await window.electronAPI.profile.uploadAvatar(dataUrl);
    if (result && result.success) {
      _avatarDataUrl = dataUrl;
      _renderBody('card');
    }
  });
  _panel.addEventListener('mousedown', (e) => {
    if (_accMenuOpen && !e.target.closest('.pf-acc')) {
      _accMenuOpen = false;
      _renderBody('card');
    }
  });
  _panel.addEventListener('error', (ev) => {
    const t = ev.target;
    if (t && t.tagName === 'IMG' && t.closest && t.closest('.pf-acc-av, .pf-avatar')) t.remove();
  }, true);
  document.addEventListener('keydown', _escHandler);
}

async function _escHandler(e) {
  if (e.key === 'Escape' && _open) {
    if (_accMenuOpen) { _accMenuOpen = false; _renderBody('card'); return; }
    if (_dayDetail) { _dayDetail = null; _renderBody('full'); return; }
    if (_editingProfile) { _editingProfile = false; _renderBody('card'); return; }
    close();
  }
}

// ── Load / paint ──

function _ensureView(body) {
  if (body.querySelector('.pf-tabs')) return false;
  body.innerHTML = _buildSkeleton();
  _bodyEls = {};
  body.querySelectorAll('.pf-section').forEach((el) => {
    _bodyEls[el.dataset.section] = el;
  });
  _wireTabs();
  _applyTab();
  _paintStatus();
  _hydratedAt = 0;
  return true;
}

function _paintAll() {
  if (!_panel || _dayDetail) return;
  _swap('card', _renderProfileCard);
  _swap('stats', _renderStatsBar);
  _swap('heatmap', _renderHeatmap);
  _swap('donuts', _renderDonuts);
  _swap('history', _renderHistory);
  _swap('dash', _renderDashboard);
  _swap('repos', _renderReposTab);
  _hydratedAt = Date.now();
}

async function _load() {
  _ensurePanel();
  const body = _panel.querySelector('#pfBody');
  const rebuilt = _ensureView(body);
  if (_dayDetail) return;

  if (!_hasAnyCache()) _restoreSnapshot();

  if (!_hasAnyCache()) {
    await _prime(true);
    if (_dayDetail || !_panel) return;
    _paintAll();
    return;
  }

  if (rebuilt || !_hydratedAt) _paintAll();

  const stale = !_lastPrime || Date.now() - _lastPrime > FRESH_MS;
  if (stale) {
    const updated = await _prime(true);
    if (updated && !_dayDetail) _paintAll();
  }
}

function _swap(key, render) {
  Promise.resolve()
    .then(render)
    .then((el) => {
      if (!_panel || !el || _dayDetail) return;
      const old = _bodyEls[key];
      if (old && old.isConnected) {
        old.replaceWith(el);
        _bodyEls[key] = el;
      }
    })
    .catch(() => {});
}

function _wireTabs() {
  _panel.querySelectorAll('.pf-tab').forEach((b) => {
    b.addEventListener('click', () => _setTab(b.dataset.tab));
  });
}

function _setTab(id) {
  if (!TAB_DEFS.some((t) => t.id === id)) return;
  _tab = id;
  _lsSet(TAB_KEY, id);
  _applyTab();
  if (id === 'repos') _loadRepos(false);
}

function _applyTab() {
  if (!_panel) return;
  _panel.querySelectorAll('.pf-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === _tab);
  });
  _panel.querySelectorAll('.pf-pane').forEach((p) => {
    p.classList.toggle('pf-hidden', p.dataset.pane !== _tab);
  });
}

let _bodyEls = {};

function _buildSkeleton() {
  const tabs = TAB_DEFS.map((t) => '<button class="pf-tab" data-tab="' + t.id + '">' + t.label + '</button>').join('');
  const skelStats = '<div class="pf-stat-item"><div class="pf-skel-line" style="width:60%;height:24px;margin:0 auto"></div></div>';
  return `
    <div class="pf-body-sidebar">
      <div class="pf-section" data-section="card">
        <div class="pf-card-vertical pf-skel"><div class="pf-skel-avatar pf-skel-avatar-lg" style="margin:0 auto 8px"></div><div class="pf-skel-line" style="width:50%;margin:0 auto"></div><div class="pf-skel-line" style="width:70%;margin:6px auto 0"></div></div>
      </div>
    </div>
    <div class="pf-body-main">
      <div class="pf-tabs">
        ${tabs}
        <span class="pf-tabs-status" id="pfStatus"></span>
      </div>
      <div class="pf-pane" data-pane="workspace">
        <div class="pf-section" data-section="dash">
          <div class="pf-dash-head"><span class="pf-section-title">Workspace</span><span class="pf-dash-sub">Loading resources\u2026</span></div>
          <div class="pf-skel-line" style="width:100%;height:200px"></div>
        </div>
      </div>
      <div class="pf-pane pf-hidden" data-pane="commits">
        <div class="pf-section" data-section="stats">
          <div class="pf-stats-bar pf-skel">${skelStats}${skelStats}${skelStats}${skelStats}</div>
        </div>
        <div class="pf-section" data-section="heatmap">
          <div class="pf-heatmap-header"><div class="pf-skel-line" style="width:120px;height:16px"></div></div>
          <div class="pf-heatmap-wrap"><div class="pf-skel-line" style="width:100%;height:100px"></div></div>
        </div>
        <div class="pf-section" data-section="donuts">
          <div class="pf-donuts-row"><div class="pf-donut-wrap pf-skel"><div class="pf-skel-line" style="width:60%;margin:0 auto"></div></div><div class="pf-donut-wrap pf-skel"><div class="pf-skel-line" style="width:60%;margin:0 auto"></div></div><div class="pf-donut-wrap pf-skel"><div class="pf-skel-line" style="width:60%;margin:0 auto"></div></div></div>
        </div>
        <div class="pf-section" data-section="history">
          <div class="pf-skel-line" style="width:200px;height:16px;margin-bottom:8px"></div>
          <div class="pf-skel-line" style="width:100%;height:40px"></div>
          <div class="pf-skel-line" style="width:100%;height:40px;margin-top:4px"></div>
        </div>
      </div>
      <div class="pf-pane pf-hidden" data-pane="repos">
        <div class="pf-section" data-section="repos">
          <div class="pf-skel-line" style="width:100%;height:120px"></div>
        </div>
      </div>
    </div>`;
}

async function _renderBody(change) {
  if (_dayDetail) { _renderDayDetail(); return; }
  const body = _panel.querySelector('#pfBody');
  if (!body.querySelector('.pf-tabs') || change === 'full') {
    await _load();
    return;
  }
  const renderers = {
    card: _renderProfileCard,
    stats: _renderStatsBar,
    heatmap: _renderHeatmap,
    donuts: _renderDonuts,
    history: _renderHistory,
    dash: _renderDashboard,
    repos: _renderReposTab,
  };
  const render = renderers[change];
  if (!render) return;
  const focusId = document.activeElement ? document.activeElement.id : '';
  const newEl = await render();
  if (!newEl) return;
  if (_bodyEls[change] && _bodyEls[change].isConnected) {
    _bodyEls[change].replaceWith(newEl);
    _bodyEls[change] = newEl;
  }
  if (focusId === 'pfHistorySearch') {
    const input = newEl.querySelector('#pfHistorySearch');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
}

function _initials(name) {
  if (!name) return '?';
  return name.split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// ── Profile Card ──

const SOCIAL_ICONS = {
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
  wakatime: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>',
};

const I_SYS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="15" height="10" rx="1.5"/><path d="M7 17h6M10 14v3"/></svg>';
const I_CHEV = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l5 5 5-5"/></svg>';
const I_CHECK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>';

function _accAvatarHtml(acc) {
  const letter = String(acc.username || acc.name || '?').charAt(0);
  let img = '';
  if (acc.avatarUrl) {
    const sep = acc.avatarUrl.indexOf('?') === -1 ? '?' : '&';
    img = '<img src="' + _esc(acc.avatarUrl + sep + 's=64') + '" alt="" referrerpolicy="no-referrer">';
  }
  return '<span class="pf-acc-av"><span>' + _esc(letter) + '</span>' + img + '</span>';
}

function _accountBlockHtml() {
  if (!window.gitAccountsAPI) return '';
  if (!_accounts.length) {
    return '<div class="pf-acc-empty">No GitHub account connected yet. Use the GitHub button in the top bar to sign in.</div>';
  }
  const acc = _activeAccount();
  const curHtml = acc
    ? _accAvatarHtml(acc) + '<span class="pf-acc-text"><span class="pf-acc-name">' + _esc(acc.label || acc.name || acc.username) + '</span><span class="pf-acc-sub">@' + _esc(acc.username) + '</span></span>'
    : '<span class="pf-acc-av sys">' + I_SYS + '</span><span class="pf-acc-text"><span class="pf-acc-name">System default</span><span class="pf-acc-sub">No GitHub account selected</span></span>';

  let h = '<div class="pf-acc">' +
    '<div class="pf-acc-label">GitHub account</div>' +
    '<button type="button" class="pf-acc-btn' + (_accMenuOpen ? ' open' : '') + '" data-acc="toggle"' + (_accBusy ? ' disabled' : '') + '>' +
      curHtml +
      (_accBusy ? '<span class="pf-spinner sm"></span>' : '<span class="pf-acc-chev">' + I_CHEV + '</span>') +
    '</button>';

  if (_accMenuOpen) {
    h += '<div class="pf-acc-list">';
    h += '<div class="pf-acc-opt' + (!acc ? ' active' : '') + '" data-acc="pick" data-id="">' +
      '<span class="pf-acc-av sys">' + I_SYS + '</span>' +
      '<span class="pf-acc-text"><span class="pf-acc-name">System default</span></span>' +
      (!acc ? '<span class="pf-acc-tick">' + I_CHECK + '</span>' : '') +
    '</div>';
    for (const a of _accounts) {
      const on = a.id === _activeAccountId;
      h += '<div class="pf-acc-opt' + (on ? ' active' : '') + '" data-acc="pick" data-id="' + _esc(a.id) + '">' +
        _accAvatarHtml(a) +
        '<span class="pf-acc-text"><span class="pf-acc-name">' + _esc(a.label || a.name || a.username) + '</span><span class="pf-acc-sub">@' + _esc(a.username) + '</span></span>' +
        (on ? '<span class="pf-acc-tick">' + I_CHECK + '</span>' : '') +
      '</div>';
    }
    h += '</div>';
  }
  if (_accMsg) h += '<div class="pf-acc-msg' + (_accWarn ? ' warn' : '') + '">' + _esc(_accMsg) + '</div>';
  h += '</div>';
  return h;
}

function _renderProfileCard() {
  if (!_profile) _profile = {};
  const acc = _activeAccount();
  const section = _el('div', { className: 'pf-section' });

  if (_editingProfile) {
    const identityFields = acc
      ? '<div class="pf-edit-note">Name, email and photo come from your GitHub account (@' + _esc(acc.username) + ').</div>'
      : `<div class="pf-edit-field"><label>Name</label><input class="pf-edit-input" id="pfEditName" value="${_esc(_profile.name || '')}"></div>
          <div class="pf-edit-field"><label>Email</label><input class="pf-edit-input" id="pfEditEmail" value="${_esc(_profile.email || '')}"></div>`;
    const colorField = acc
      ? ''
      : `<div class="pf-edit-field"><label>Avatar Color</label><div class="pf-color-picker" id="pfColorPicker">${PROFILE_COLORS.map(c => `<button class="pf-color-swatch${c === _profile.avatarColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div></div>`;
    section.innerHTML = `
      <div class="pf-card pf-card-vertical">
        <div class="pf-edit-form">
          ${identityFields}
          <div class="pf-edit-field"><label>Bio</label><textarea class="pf-edit-textarea" id="pfEditBio" rows="3">${_esc(_profile.bio || '')}</textarea></div>
          <div class="pf-edit-field"><label>Website</label><input class="pf-edit-input" id="pfEditWeb" value="${_esc(_profile.website || '')}"></div>
          ${colorField}
          <div class="pf-edit-field"><label>Facebook URL</label><input class="pf-edit-input" id="pfEditFb" value="${_esc(_profile.facebook || '')}"></div>
          <div class="pf-edit-field"><label>TikTok URL</label><input class="pf-edit-input" id="pfEditTt" value="${_esc(_profile.tiktok || '')}"></div>
          <div class="pf-edit-field"><label>LinkedIn URL</label><input class="pf-edit-input" id="pfEditLi" value="${_esc(_profile.linkedin || '')}"></div>
          <div class="pf-edit-field"><label>WakaTime URL</label><input class="pf-edit-input" id="pfEditWk" value="${_esc(_profile.wakatime || '')}"></div>
          <div class="pf-edit-actions"><button class="pf-btn primary" id="pfSaveProfile">Save</button><button class="pf-btn" id="pfCancelEdit">Cancel</button></div>
        </div>
      </div>
    `;
    const picker = section.querySelector('#pfColorPicker');
    if (picker) {
      picker.addEventListener('click', (e) => {
        const btn = e.target.closest('.pf-color-swatch');
        if (!btn) return;
        section.querySelectorAll('.pf-color-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    }
    section.querySelector('#pfSaveProfile').addEventListener('click', async () => {
      const colorBtn = section.querySelector('.pf-color-swatch.active');
      const nameEl = section.querySelector('#pfEditName');
      const emailEl = section.querySelector('#pfEditEmail');
      await window.electronAPI.profile.update({
        name: nameEl ? nameEl.value : (_profile.name || ''),
        email: emailEl ? emailEl.value : (_profile.email || ''),
        bio: section.querySelector('#pfEditBio').value,
        website: section.querySelector('#pfEditWeb').value,
        avatarColor: colorBtn ? colorBtn.dataset.color : (_profile.avatarColor || '#4F8EF7'),
        facebook: section.querySelector('#pfEditFb').value,
        tiktok: section.querySelector('#pfEditTt').value,
        linkedin: section.querySelector('#pfEditLi').value,
        wakatime: section.querySelector('#pfEditWk').value,
      });
      try {
        const { getPrefetchCache } = await import('./app_manager/prefetchManager.js');
        getPrefetchCache().invalidate('profile');
      } catch (_) {}
      const p = await window.electronAPI.profile.get();
      if (p) _profile = p;
      _editingProfile = false;
      _renderBody('card');
    });
    section.querySelector('#pfCancelEdit').addEventListener('click', () => { _editingProfile = false; _renderBody('card'); });
    return section;
  }

  const c = _profile.avatarColor || '#4F8EF7';
  const hasSocial = _profile.facebook || _profile.tiktok || _profile.linkedin || _profile.wakatime;
  const displayName = acc ? (acc.label || acc.name || acc.username) : (_profile.name || _profile.email || 'Unnamed');
  let handleLine = '';
  let emailLine = '';
  if (acc) {
    handleLine = '<div class="pf-card-handle">@' + _esc(acc.username) + '</div>';
    emailLine = (acc.email || _profile.email) ? '<div class="pf-card-email">' + _esc(acc.email || _profile.email) + '</div>' : '';
  } else {
    emailLine = '<div class="pf-card-email">' + (_profile.name ? _esc(_profile.email || '') : '') + '</div>';
  }

  let imgSrc = '';
  if (acc && acc.avatarUrl) imgSrc = acc.avatarUrl + (acc.avatarUrl.indexOf('?') === -1 ? '?' : '&') + 's=260';
  else if (!acc && _avatarDataUrl) imgSrc = _avatarDataUrl;
  const avatarHtml = '<div class="pf-avatar" style="background:' + c + ';color:#fff"><span class="pf-avatar-l">' + _esc(_initials(displayName)) + '</span>' +
    (imgSrc ? '<img src="' + _esc(imgSrc) + '" alt="" referrerpolicy="no-referrer">' : '') + '</div>';
  const overlayHtml = acc
    ? ''
    : '<div class="pf-avatar-overlay"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>';

  section.innerHTML = `
    <div class="pf-card pf-card-vertical">
      <div class="pf-card-avatar-wrap${acc ? ' static' : ''}">
        ${avatarHtml}
        ${overlayHtml}
      </div>
      <div class="pf-card-name">${_esc(displayName)}</div>
      ${handleLine}
      ${emailLine}
      ${_accountBlockHtml()}
      ${_profile.bio ? `<div class="pf-card-bio">${_esc(_profile.bio)}</div>` : ''}
      ${_profile.website ? `<a class="pf-card-website" href="${_esc(_profile.website)}" target="_blank" rel="noopener"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v8M6 10h8"/></svg>${_esc(_profile.website)}</a>` : ''}
      ${hasSocial ? `<div class="pf-socials">${_socialLink('facebook', _profile.facebook)}${_socialLink('tiktok', _profile.tiktok)}${_socialLink('linkedin', _profile.linkedin)}${_socialLink('wakatime', _profile.wakatime)}</div>` : ''}
      <button class="pf-btn primary pf-card-edit-btn" id="pfEditBtn">Edit Profile</button>
    </div>
  `;
  section.querySelector('#pfEditBtn').addEventListener('click', () => { _editingProfile = true; _renderBody('card'); });
  const wrap = section.querySelector('.pf-card-avatar-wrap');
  if (!acc) {
    wrap.addEventListener('click', () => {
      const input = _panel.querySelector('#pfAvatarInput');
      input.value = '';
      input.click();
    });
  }
  section.addEventListener('click', (e) => {
    const t = e.target.closest('[data-acc]');
    if (!t) return;
    if (t.dataset.acc === 'toggle') {
      _accMenuOpen = !_accMenuOpen;
      _renderBody('card');
      return;
    }
    if (t.dataset.acc === 'pick') _switchAccount(t.dataset.id);
  });
  return section;
}

function _socialLink(platform, url) {
  if (!url) return '';
  const icon = SOCIAL_ICONS[platform] || '';
  return `<a class="pf-social-link" href="${_esc(url)}" target="_blank" rel="noopener" title="${platform}">${icon}<span>${platform}</span></a>`;
}

// ── Stats Bar ──

async function _renderStatsBar() {
  const section = _el('div', { className: 'pf-section' });
  const stats = (await _cached('stats:' + _statsRange, () => window.electronAPI.profile.getStats(_statsRange), 60000)) || {};
  const items = [
    { label: 'Commits', value: (stats.commits || 0).toLocaleString() },
    { label: 'File Saves', value: (stats.saves || 0).toLocaleString() },
    { label: 'Files Touched', value: (stats.files || 0).toLocaleString() },
    { label: 'Repos Active', value: (stats.repos || 0).toLocaleString() },
  ];
  const ranges = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All' },
  ];
  section.innerHTML = `
    <div class="pf-stats-bar">
      ${items.map((s) => `<div class="pf-stat-item"><div class="pf-stat-value">${s.value}</div><div class="pf-stat-label">${s.label}</div></div>`).join('')}
    </div>
    <div class="pf-range-tabs">${ranges.map((r) => `<button class="pf-range-btn${_statsRange === r.id ? ' active' : ''}" data-range="${r.id}">${r.label}</button>`).join('')}</div>
  `;
  section.querySelectorAll('.pf-range-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _statsRange = btn.dataset.range;
      _renderBody('stats');
    });
  });
  return section;
}

// ── Heatmap ──

async function _renderHeatmap() {
  const section = _el('div', { className: 'pf-section' });
  const heatmap = (await _cached('heatmap:' + _heatmapYear, () => window.electronAPI.profile.getHeatmap(_heatmapYear), 60000)) || {};
  const year = _heatmapYear;
  const thisYear = new Date().getFullYear();
  const today = _localDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const start = new Date(year, 0, 1);
  const startDow = start.getDay();
  const totalDays = Math.round((new Date(year + 1, 0, 1) - start) / 86400000);

  const vals = Object.values(heatmap).map((v) => v.total || 0).filter((v) => v > 0).sort((a, b) => a - b);
  const pick = (p) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] : 0);
  const t1 = pick(0.25);
  const t2 = pick(0.5);
  const t3 = pick(0.75);
  const level = (v) => (v <= 0 ? 0 : v <= t1 ? 1 : v <= t2 ? 2 : v <= t3 ? 3 : 4);

  const cells = [];
  for (let i = 0; i < startDow; i++) {
    cells.push('<div class="pf-hm-cell lvl-0 pf-hm-empty"></div>');
  }

  const months = [];
  let lastMonth = -1;
  let lastLabelCol = -10;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(year, 0, 1 + i);
    const dateStr = _localDate(d);
    const col = Math.floor((startDow + i) / 7);
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth();
      if (col - lastLabelCol >= 3) {
        months.push('<span style="grid-column:' + (col + 1) + '">' + monthNames[lastMonth] + '</span>');
        lastLabelCol = col;
      }
    }
    if (dateStr > today) {
      cells.push('<div class="pf-hm-cell lvl-0 pf-hm-future"></div>');
      continue;
    }
    const day = heatmap[dateStr];
    const total = day ? day.total : 0;
    const tip = total > 0
      ? dateStr + ': ' + day.commits + ' commits, ' + day.saves + ' saves'
      : dateStr + ': no activity';
    cells.push('<div class="pf-hm-cell lvl-' + level(total) + '" title="' + _esc(tip) + '" data-date="' + dateStr + '"></div>');
  }

  section.innerHTML = `
    <div class="pf-heatmap-header">
      <button class="pf-heatmap-nav" id="pfHeatPrev">\u25C0</button>
      <span class="pf-heatmap-title">${year} Activity</span>
      <button class="pf-heatmap-nav" id="pfHeatNext"${year >= thisYear ? ' disabled' : ''}>\u25B6</button>
    </div>
    <div class="pf-heatmap-wrap">
      <div class="pf-hm-day-labels">${['', 'Mon', '', 'Wed', '', 'Fri', ''].map((l) => `<div>${l}</div>`).join('')}</div>
      <div class="pf-hm-cols">
        <div class="pf-hm-months">${months.join('')}</div>
        <div class="pf-heatmap-grid-auto">${cells.join('')}</div>
      </div>
    </div>
    <div class="pf-hm-legend"><span>Less</span>${[0, 1, 2, 3, 4].map((l) => `<div class="pf-hm-cell lvl-${l}"></div>`).join('')}<span>More</span></div>
  `;

  section.querySelector('#pfHeatPrev').addEventListener('click', () => {
    _heatmapYear--;
    _renderBody('heatmap');
  });
  section.querySelector('#pfHeatNext').addEventListener('click', () => {
    if (_heatmapYear >= thisYear) return;
    _heatmapYear++;
    _renderBody('heatmap');
  });

  section.querySelector('.pf-heatmap-wrap').addEventListener('click', (e) => {
    const cell = e.target.closest('.pf-hm-cell[data-date]');
    if (cell) _openDay(cell.dataset.date);
  });

  return section;
}

// ── Donut Charts ──

const DONUT_COLORS = ['#4F8EF7', '#34d399', '#f472b6', '#fb923c', '#a78bfa', '#fbbf24', '#f87171', '#2dd4bf'];

function _buildDonutHTML(title, items, fmt) {
  const list = (items || []).filter((i) => (Number(i.value) || 0) > 0).slice(0, 7);
  const total = list.reduce((s, i) => s + i.value, 0);
  if (!total) {
    return `<div class="pf-donut-wrap"><div class="pf-donut-title">${_esc(title)}</div><div class="pf-donut-empty">No data</div></div>`;
  }
  const r = 50, cx = 60, cy = 60;
  let svg = '';
  if (list.length === 1) {
    svg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${DONUT_COLORS[0]}"/>`;
  } else {
    let angle = -Math.PI / 2;
    list.forEach((item, i) => {
      const pct = item.value / total;
      const endAngle = angle + pct * 2 * Math.PI;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      svg += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${x2},${y2} Z" fill="${DONUT_COLORS[i % DONUT_COLORS.length]}" stroke="var(--bg-surface)" stroke-width="1"/>`;
      angle = endAngle;
    });
  }
  let html = `<div class="pf-donut-wrap"><div class="pf-donut-title">${_esc(title)}</div><div class="pf-donut-chart"><svg viewBox="0 0 120 120" width="120" height="120">${svg}<circle cx="${cx}" cy="${cy}" r="28" fill="var(--bg-surface)"/></svg></div><div class="pf-donut-legend">`;
  list.forEach((item, i) => {
    const pct = ((item.value / total) * 100).toFixed(1) + '%';
    const right = fmt ? fmt(item.value) + ' \u00B7 ' + pct : pct;
    html += `<div class="pf-donut-legend-item"><span class="pf-donut-dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></span>${_esc(item.label)} <span class="pf-donut-pct">${right}</span></div>`;
  });
  html += '</div></div>';
  return html;
}

async function _renderDonuts() {
  const section = _el('div', { className: 'pf-section' });
  const data = (await _cached('donuts:' + _donutRange, () => window.electronAPI.profile.getDonutData(_donutRange), 60000)) || { repo: [], ext: [], weekday: [] };

  const ranges = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All' },
  ];

  section.innerHTML = `<div class="pf-range-tabs">${ranges.map((r) => `<button class="pf-range-btn${_donutRange === r.id ? ' active' : ''}" data-range="${r.id}">${r.label}</button>`).join('')}</div>
    <div class="pf-donuts-row">${_buildDonutHTML('Activity by Repo', data.repo)}${_buildDonutHTML('Activity by File Type', data.ext)}${_buildDonutHTML('Activity by Weekday', data.weekday)}</div>`;

  section.querySelectorAll('.pf-range-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _donutRange = btn.dataset.range;
      _renderBody('donuts');
    });
  });

  return section;
}

// ── History ──

let _historyNavTimer = null;

function _buildPageButtons(totalPages) {
  const cur = _historyPage;
  const parts = [];
  const addPage = (p) => { parts.push(`<button class="pf-page-btn${p === cur ? ' active' : ''}" data-page="${p}">${p}</button>`); };
  const addDots = () => { parts.push('<span class="pf-page-dots">\u2026</span>'); };

  if (totalPages <= 9) {
    for (let i = 1; i <= totalPages; i++) addPage(i);
  } else {
    addPage(1);
    if (cur > 4) addDots();
    const start = Math.max(2, cur - 2);
    const end = Math.min(totalPages - 1, cur + 2);
    for (let i = start; i <= end; i++) addPage(i);
    if (cur < totalPages - 3) addDots();
    addPage(totalPages);
  }

  parts.unshift(`<button class="pf-page-nav" data-page="prev" ${cur <= 1 ? 'disabled' : ''}>\u25C0</button>`);
  parts.push(`<button class="pf-page-nav" data-page="next" ${cur >= totalPages ? 'disabled' : ''}>\u25B6</button>`);
  return parts.join('');
}

function _wireHistoryEvents(section) {
  section.addEventListener('click', (e) => {
    const btn = e.target.closest('.pf-history-view-btn');
    if (btn) {
      _openDay(btn.dataset.date, btn.dataset.repo || '');
      return;
    }

    const pageBtn = e.target.closest('.pf-page-btn, .pf-page-nav');
    if (!pageBtn || pageBtn.disabled) return;

    clearTimeout(_historyNavTimer);
    _historyNavTimer = setTimeout(() => {
      let targetPage;
      if (pageBtn.dataset.page === 'prev') targetPage = _historyPage - 1;
      else if (pageBtn.dataset.page === 'next') targetPage = _historyPage + 1;
      else targetPage = parseInt(pageBtn.dataset.page, 10);

      if (!targetPage || targetPage < 1 || targetPage > Math.ceil(_lastHistoryTotal / 20)) return;
      _historyPage = targetPage;
      _renderBody('history');
    }, 80);
  });

  const searchInput = section.querySelector('#pfHistorySearch');
  if (searchInput) {
    let timer;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        _historyRepo = searchInput.value;
        _historyPage = 1;
        _renderBody('history');
      }, 300);
    });
  }
}

let _lastHistoryTotal = 0;

async function _renderHistory() {
  const section = _el('div', { className: 'pf-section' });
  const cacheKey = 'history:' + _historyPage + ':' + _historyRepo;
  const result = (await _cached(cacheKey, () => window.electronAPI.profile.getHistory(_historyPage, _historyRepo), 30000)) || { items: [], total: 0, page: 1, pageSize: 20 };
  _lastHistoryTotal = result.total;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const itemsHtml = result.items.length ? result.items.map((item) => `
    <div class="pf-history-item" data-date="${_esc(item.date)}">
      <div class="pf-history-date">${_esc(item.date)}</div>
      <div class="pf-history-repo" title="${_esc(item.repoPath)}">${_esc(item.repoName)}</div>
      <div class="pf-history-stats">${item.commits} commits \u00B7 ${item.files} files \u00B7 ${item.saves} saves</div>
      <button class="pf-history-view-btn" data-date="${_esc(item.date)}" data-repo="${_esc(item.repoPath)}">View Day</button>
    </div>
  `).join('') : '<div class="pf-empty">No activity yet</div>';

  const pagesHtml = totalPages > 1 ? _buildPageButtons(totalPages) : '';

  section.innerHTML = `
    <div class="pf-history-header">
      <span class="pf-section-title">Activity History <span class="pf-history-count">(${result.total} entries)</span></span>
      <input class="pf-history-search" id="pfHistorySearch" placeholder="Filter by repo name\u2026" value="${_esc(_historyRepo)}">
    </div>
    <div class="pf-history-list">${itemsHtml}</div>
    ${pagesHtml ? `<div class="pf-history-pages" id="pfHistoryPages">${pagesHtml}</div>` : ''}
  `;

  _wireHistoryEvents(section);
  return section;
}

// ── Repositories tab (uses the GitHub account selected in GitHub accounts) ──

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
  C: '#555555', Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138',
  Kotlin: '#A97BFF', Dart: '#00B4AB', Shell: '#89e051', HTML: '#e34c26',
  CSS: '#563d7c', Vue: '#41b883', 'C#': '#178600',
};

function _langColor(lang) {
  return LANG_COLORS[lang] || '#6b7280';
}

function _slimRepo(r) {
  return {
    name: r.name,
    fullName: r.fullName,
    description: String(r.description || '').slice(0, 160),
    htmlUrl: r.htmlUrl || '',
    private: !!r.private,
    fork: !!r.fork,
    language: r.language || '',
    pushedAt: r.pushedAt || '',
    stars: Number(r.stars) || 0,
  };
}

function _reposDiskGet(id) {
  const all = _lsJson(REPOS_KEY) || {};
  return all[id] || null;
}

function _reposDiskPut(id, entry) {
  const all = _lsJson(REPOS_KEY) || {};
  all[id] = entry;
  try {
    _lsSet(REPOS_KEY, JSON.stringify(all));
  } catch (_) {}
}

function _loadRepos(force) {
  const acc = _activeAccount();
  if (!acc) {
    _repos = [];
    _reposAccountId = '';
    _reposLoading = false;
    _reposError = '';
    _acctRepoSet = null;
    _paintRepos();
    return Promise.resolve();
  }
  const id = acc.id;
  const entry = _reposMem.get(id) || _reposDiskGet(id);
  if (entry && entry.repos) {
    _reposMem.set(id, entry);
    _repos = entry.repos;
    _reposAccountId = id;
    _setAcctSet(_repos);
  } else if (_reposAccountId !== id) {
    _repos = [];
    _reposAccountId = id;
  }
  if (!force && entry && Date.now() - entry.at < REPOS_TTL) {
    _reposLoading = false;
    _reposError = '';
    _paintRepos();
    return Promise.resolve();
  }
  if (!force && _reposInflight === id && _reposPromise) return _reposPromise;
  _reposPromise = _doLoadRepos(id, !!(entry && entry.repos));
  return _reposPromise;
}

async function _doLoadRepos(id, hasCached) {
  const api = window.gitReposPageAPI;
  _reposError = '';
  if (!api) {
    _reposError = 'Fully restart the app to load repositories.';
    _reposLoading = false;
    _paintRepos();
    return;
  }
  const seq = ++_reposSeq;
  _reposInflight = id;
  _reposLoading = true;
  _paintRepos();
  const collected = [];
  let page = 1;
  try {
    while (true) {
      const res = await api.page({ accountId: id, page });
      if (seq !== _reposSeq) return;
      if (!res || !res.success) throw new Error((res && res.error) || 'Could not load repositories.');
      for (const r of res.repos || []) collected.push(_slimRepo(r));
      if (!hasCached) {
        _repos = collected.slice();
        _paintRepos();
      }
      if (!res.hasMore) break;
      page = res.nextPage || page + 1;
    }
    _repos = collected;
    const entry = { at: Date.now(), repos: collected };
    _reposMem.set(id, entry);
    _reposDiskPut(id, entry);
    _setAcctSet(collected);
    if (_scope === 'account' && _bodyEls.dash && _panel && !_dayDetail) _renderBody('dash');
  } catch (err) {
    if (seq === _reposSeq) _reposError = err && err.message ? err.message : 'Could not load repositories.';
  } finally {
    if (seq === _reposSeq) {
      _reposLoading = false;
      _reposInflight = '';
    }
    _paintRepos();
  }
}

function _paintRepos() {
  const root = _bodyEls.repos;
  if (root && root.isConnected) _paintReposList(root);
}

function _timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function _buildRepoCard(r) {
  const visClass = r.private ? 'pf-repo-vis-private' : 'pf-repo-vis-public';
  const starsHtml = r.stars > 0
    ? `<span class="pf-repo-meta-item" title="Stars">\u2605 ${r.stars.toLocaleString()}</span>`
    : '';
  const langHtml = r.language
    ? `<span class="pf-repo-meta-item pf-repo-lang"><span class="pf-repo-lang-dot" style="background:${_langColor(r.language)}"></span>${_esc(r.language)}</span>`
    : '';
  return `
    <div class="pf-repo-card">
      <div class="pf-repo-card-top">
        <div class="pf-repo-card-info">
          <div class="pf-repo-name">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0"><path d="M2 3h5l2 2h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>
            ${_esc(r.name)}
          </div>
          <span class="pf-repo-visibility ${visClass}">${r.private ? 'Private' : 'Public'}</span>
          ${r.fork ? '<span class="pf-repo-visibility pf-repo-vis-fork">Fork</span>' : ''}
        </div>
        <button class="pf-repo-visit-btn" data-url="${_esc(r.htmlUrl)}" title="Open in browser">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M5 15L15 5M15 5H9M15 5v6"/></svg>
          Visit
        </button>
      </div>
      ${r.description ? `<div class="pf-repo-desc">${_esc(r.description)}</div>` : ''}
      <div class="pf-repo-meta">
        ${langHtml}
        ${starsHtml}
        <span class="pf-repo-meta-item">Updated ${_timeAgo(r.pushedAt)}</span>
      </div>
    </div>
  `;
}

function _buildReposPages(totalPages) {
  const cur = _reposPage;
  const parts = [];
  const addPage = (p) => { parts.push(`<button class="pf-repo-page-btn${p === cur ? ' active' : ''}" data-page="${p}">${p}</button>`); };
  const addDots = () => { parts.push('<span class="pf-repo-page-dots">\u2026</span>'); };

  parts.push(`<button class="pf-repo-page-nav" data-page="prev" ${cur <= 1 ? 'disabled' : ''}>\u25C0</button>`);

  if (totalPages <= 9) {
    for (let i = 1; i <= totalPages; i++) addPage(i);
  } else {
    addPage(1);
    if (cur > 4) addDots();
    const start = Math.max(2, cur - 2);
    const end = Math.min(totalPages - 1, cur + 2);
    for (let i = start; i <= end; i++) addPage(i);
    if (cur < totalPages - 3) addDots();
    addPage(totalPages);
  }

  parts.push(`<button class="pf-repo-page-nav" data-page="next" ${cur >= totalPages ? 'disabled' : ''}>\u25B6</button>`);
  return parts.join('');
}

function _paintReposList(root) {
  const host = root ? root.querySelector('.pf-repos-host') : null;
  if (!host) return;
  const acc = _activeAccount();

  if (!acc) {
    host.innerHTML = '<div class="pf-repos-empty">Select a GitHub account in the card on the left to see its repositories.<br>System default cannot list repositories.</div>';
    return;
  }
  if (_reposError && !_repos.length) {
    host.innerHTML = '<div class="pf-repos-error">' + _esc(_reposError) + '<button class="pf-btn" data-act="retry">Try again</button></div>';
    return;
  }
  if (_reposLoading && !_repos.length) {
    host.innerHTML = '<div class="pf-repos-loading"><div class="pf-spinner"></div> Loading repositories\u2026</div>';
    return;
  }
  if (!_repos.length) {
    host.innerHTML = '<div class="pf-repos-empty">No repositories found for @' + _esc(acc.username) + '</div>';
    return;
  }

  const q = _reposQuery.trim().toLowerCase();
  let list = _repos;
  if (_reposFilter === 'public') list = list.filter((r) => !r.private);
  else if (_reposFilter === 'private') list = list.filter((r) => r.private);
  if (q) {
    list = list.filter((r) => r.fullName.toLowerCase().indexOf(q) !== -1
      || String(r.description || '').toLowerCase().indexOf(q) !== -1
      || String(r.language || '').toLowerCase().indexOf(q) !== -1);
  }

  const sorted = list.slice();
  if (_reposSort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (_reposSort === 'stars') sorted.sort((a, b) => b.stars - a.stars);
  else sorted.sort((a, b) => new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0));

  const totalPages = Math.max(1, Math.ceil(sorted.length / REPOS_PER_PAGE));
  if (_reposPage > totalPages) _reposPage = totalPages;
  const start = (_reposPage - 1) * REPOS_PER_PAGE;
  const pageItems = sorted.slice(start, start + REPOS_PER_PAGE);

  host.innerHTML =
    '<div class="pf-repos-meta-bar"><span>@' + _esc(acc.username) + ' \u00B7 ' + sorted.length + ' repo' + (sorted.length === 1 ? '' : 's') + '</span>' +
    (_reposLoading ? '<span class="pf-repos-counts-loading">Updating\u2026</span>' : '') +
    (_reposError ? '<span class="pf-repos-inline-err">' + _esc(_reposError) + '</span>' : '') +
    '</div>' +
    (pageItems.length ? '<div class="pf-repos-list">' + pageItems.map(_buildRepoCard).join('') + '</div>' : '<div class="pf-repos-empty">No matches</div>') +
    (totalPages > 1 ? '<div class="pf-repos-pages">' + _buildReposPages(totalPages) + '</div>' : '');
}

function _renderReposTab() {
  const section = _el('div', { className: 'pf-section' });
  const filters = [['all', 'All'], ['public', 'Public'], ['private', 'Private']];
  const sorts = [['date', 'Last updated'], ['name', 'Name'], ['stars', 'Stars']];
  section.innerHTML = `
    <div class="pf-repos-toolbar">
      <input class="pf-repos-search" id="pfReposSearch" placeholder="Search repositories\u2026" value="${_esc(_reposQuery)}">
      <div class="pf-repos-filters">
        ${filters.map((f) => `<button class="pf-repos-filter-chip${_reposFilter === f[0] ? ' active' : ''}" data-filter="${f[0]}">${f[1]}</button>`).join('')}
      </div>
      <div class="pf-repos-sort-group">
        <span class="pf-repos-sort-label">Sort:</span>
        <select class="pf-repos-sort-select" id="pfReposSortSelect">
          ${sorts.map((s) => `<option value="${s[0]}"${_reposSort === s[0] ? ' selected' : ''}>${s[1]}</option>`).join('')}
        </select>
        <button class="pf-btn" data-act="resync" title="Re-fetch from GitHub">Resync</button>
      </div>
    </div>
    <div class="pf-repos-host"></div>
  `;

  section.addEventListener('click', (e) => {
    const visit = e.target.closest('.pf-repo-visit-btn');
    if (visit) {
      _openUrl(visit.dataset.url);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act && (act.dataset.act === 'retry' || act.dataset.act === 'resync')) {
      _loadRepos(true);
      return;
    }
    const chip = e.target.closest('.pf-repos-filter-chip');
    if (chip) {
      _reposFilter = chip.dataset.filter;
      _reposPage = 1;
      _renderBody('repos');
      return;
    }
    const pg = e.target.closest('.pf-repo-page-btn, .pf-repo-page-nav');
    if (pg && !pg.disabled) {
      const target = pg.dataset.page;
      if (target === 'prev' && _reposPage > 1) _reposPage--;
      else if (target === 'next') _reposPage++;
      else if (target !== 'prev') _reposPage = parseInt(target, 10) || 1;
      _paintReposList(section);
    }
  });

  const sortSelect = section.querySelector('#pfReposSortSelect');
  sortSelect.addEventListener('change', () => {
    _reposSort = sortSelect.value;
    _reposPage = 1;
    _paintReposList(section);
  });

  const search = section.querySelector('#pfReposSearch');
  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      _reposQuery = search.value;
      _reposPage = 1;
      _paintReposList(section);
    }, 150);
  });

  _paintReposList(section);
  return section;
}

// ── Day Detail + Diff Viewer ──

let _dayDetailFile = null;
let _dayDetailDiff = null;
let _dayDetailContent = null;
let _dayDetailCommitHash = null;
let _dayCommits = null;

function _isGitPath(p) {
  const n = p.replace(/\\/g, '/');
  return n.includes('/.git/') || n.startsWith('.git/');
}

async function _loadFileDiff(filePath, commitHash, repoPath) {
  _dayDetailFile = filePath;
  _dayDetailDiff = null;
  _dayDetailContent = null;
  _dayDetailCommitHash = commitHash || null;
  const el = _panel.querySelector('#pfDiffContent');
  if (el) el.innerHTML = '<div class="pf-diff-loading">Loading diff\u2026</div>';

  try {
    const result = await window.electronAPI.profile.fileDiff(filePath, repoPath || null, commitHash || null);
    _dayDetailDiff = result.diff || '';
    _dayDetailContent = result.content || '';
    const activeEl = _panel.querySelector('#pfDiffContent');
    if (activeEl) activeEl.innerHTML = _renderDiffHTML(result.diff || '', result.content || '');
    _panel.querySelectorAll('.pf-commit-file').forEach((e) => {
      e.classList.toggle('active', e.dataset.path === filePath && e.dataset.hash === (commitHash || ''));
    });
  } catch {
    const activeEl = _panel.querySelector('#pfDiffContent');
    if (activeEl) activeEl.innerHTML = '<div class="pf-diff-loading">Failed to load diff</div>';
  }
}

function _renderDiffHTML(diffText, contentText) {
  if (!diffText) {
    if (contentText) return `<pre class="pf-diff-content-text">${_esc(contentText)}</pre>`;
    return '<div class="pf-diff-empty">No changes in this commit</div>';
  }
  const lines = diffText.split('\n');
  let html = '';
  for (const line of lines) {
    const ch = line.charAt(0);
    let cls = 'context';
    let sign = ch;
    if (ch === '+') { cls = 'added'; sign = '+'; }
    else if (ch === '-') { cls = 'removed'; sign = '-'; }
    else if (ch === '@') { cls = 'hunk'; sign = '@'; }
    else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) { cls = 'header'; sign = ''; }
    else if (ch === '\\') { cls = 'context'; sign = ''; }
    else { sign = ' '; }
    html += `<div class="pf-diff-line ${cls}"><span class="pf-diff-sign">${sign}</span><span class="pf-diff-text">${_esc(cls === 'header' || cls === 'hunk' ? line : line.substring(1))}</span></div>`;
  }
  return html || '<div class="pf-diff-empty">No changes in this commit</div>';
}

function _renderCommitSidebar(commits) {
  if (!commits || !commits.length) {
    return '<div class="pf-commit-empty">No commits on this day</div>';
  }
  const multi = new Set(commits.map((c) => c.repoPath)).size > 1;
  let html = '';
  for (const c of commits) {
    const files = (c.files || []).filter((f) => !_isGitPath(f.path));
    html += `<div class="pf-commit-group">
      <div class="pf-commit-header">
        <span class="pf-commit-hash">${_esc(c.shortHash)}</span>
        ${multi ? `<span class="pf-commit-repo">${_esc(c.repoName)}</span>` : ''}
        <span class="pf-commit-time">${_esc(c.time)}</span>
      </div>
      <div class="pf-commit-msg">${_esc(c.message)}</div>
      <div class="pf-commit-files">`;
    for (const f of files) {
      const statusClass = f.status === 'A' ? 'pf-cs-added' : f.status === 'D' ? 'pf-cs-deleted' : 'pf-cs-modified';
      const statusLabel = f.status === 'A' || f.status === 'D' || f.status === 'R' ? f.status : 'M';
      html += `<div class="pf-commit-file" data-path="${_esc(f.path)}" data-hash="${_esc(c.hash)}" data-repo="${_esc(c.repoPath)}">
        <span class="pf-commit-file-status ${statusClass}">${statusLabel}</span>
        <span class="pf-commit-file-path">${_esc(f.path)}</span>
      </div>`;
    }
    html += '</div></div>';
  }
  return html;
}

async function _renderDayDetail() {
  if (!_dayDetail) { _renderBody('full'); return; }
  const body = _panel.querySelector('#pfBody');
  const d = _dayDetail;
  const commitCount = _dayCommits ? _dayCommits.length : '...';
  const repoLabel = d.repoPath ? d.repoPath.split(/[\\/]/).pop() : 'all repos';

  body.innerHTML = `
    <div class="pf-day-detail">
      <div class="pf-day-detail-header">
        <span class="pf-day-detail-title">${_esc(d.date)}</span>
        <div class="pf-day-summary"><span id="pfDayCount">${commitCount}</span> commits \u00B7 ${_esc(repoLabel)}</div>
        <button class="pf-btn" id="pfDayClose">\u2190 Back</button>
      </div>
      <div class="pf-detail-body">
        <div class="pf-detail-sidebar">
          <div class="pf-detail-sidebar-title">Commits (${commitCount})</div>
          <div class="pf-commits-list" id="pfCommitsList">
            <div class="pf-diff-loading">Loading commits\u2026</div>
          </div>
        </div>
        <div class="pf-detail-main">
          <div class="pf-diff-header">
            <span class="pf-diff-header-path">${_dayDetailFile ? _esc(_dayDetailFile) : 'Select a file'}</span>
            ${_dayDetailCommitHash ? `<span class="pf-diff-commit-hash">${_esc(_dayDetailCommitHash.substring(0, 7))}</span>` : ''}
            <span class="pf-diff-legend">
              <span class="pf-diff-legend-added">+ added</span>
              <span class="pf-diff-legend-removed">- removed</span>
              <span class="pf-diff-legend-hunk">@@ hunk</span>
            </span>
          </div>
          <div class="pf-diff-content" id="pfDiffContent">
            ${_dayDetailFile && _dayDetailDiff !== null ? _renderDiffHTML(_dayDetailDiff, _dayDetailContent) : '<div class="pf-diff-select-prompt">Click a file to view its changes</div>'}
          </div>
        </div>
      </div>
    </div>
  `;

  body.querySelector('#pfDayClose').addEventListener('click', () => {
    _dayDetail = null;
    _dayDetailFile = null;
    _dayDetailDiff = null;
    _dayDetailContent = null;
    _dayDetailCommitHash = null;
    _dayCommits = null;
    _renderBody('full');
  });

  const fill = (commits) => {
    const list = body.querySelector('#pfCommitsList');
    if (!list) return;
    list.innerHTML = _renderCommitSidebar(commits);
    _attachCommitFileClicks(body);
    const countEl = body.querySelector('#pfDayCount');
    if (countEl) countEl.textContent = String(commits.length);
    const titleEl = body.querySelector('.pf-detail-sidebar-title');
    if (titleEl) titleEl.textContent = 'Commits (' + commits.length + ')';
  };

  if (_dayCommits) {
    fill(_dayCommits);
    return;
  }

  window.electronAPI.profile.getDayCommits(d.date, d.repoPath || null).then((commits) => {
    _dayCommits = commits || [];
    fill(_dayCommits);
  }).catch(() => {
    const list = body.querySelector('#pfCommitsList');
    if (list) list.innerHTML = '<div class="pf-commit-empty">Failed to load commits</div>';
  });
}

function _attachCommitFileClicks(body) {
  body.querySelectorAll('.pf-commit-file').forEach((el) => {
    el.addEventListener('click', () => {
      _loadFileDiff(el.dataset.path, el.dataset.hash || null, el.dataset.repo || null);
    });
    if (el.dataset.path === _dayDetailFile && el.dataset.hash === (_dayDetailCommitHash || '')) {
      el.classList.add('active');
    }
  });
}

// ── Workspace dashboard ──

let _dashRange = 'week';
let _dashFilter = 'all';
let _dashSort = 'recent';

function _localDate(d) {
  const x = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
}

async function _openDay(date, repoPath) {
  try {
    const detail = await window.electronAPI.profile.getDayDetail(date);
    if (!detail) return;
    _dayCommits = null;
    _dayDetailFile = null;
    _dayDetailDiff = null;
    _dayDetailContent = null;
    _dayDetailCommitHash = null;
    _dayDetail = Object.assign({ date, repoPath: repoPath || '' }, detail);
    _renderDayDetail();
  } catch (_) {}
}

function _fmtHours(sec) {
  const s = Number(sec) || 0;
  if (s < 60) return '\u2014';
  if (s < 3600) return Math.round(s / 60) + 'm';
  const h = s / 3600;
  return (h < 10 ? h.toFixed(1) : String(Math.round(h))) + 'h';
}
let _wk = { open: false, busy: false, msg: '', warn: false, clientId: '', secret: '', hasApp: false, redirect: '' };

function _wakaApi() {
  return window.wakaOauthAPI || null;
}

function _wakaDropHours() {
  for (const k of Object.keys(_cache)) {
    if (k.indexOf('hours:') === 0) delete _cache[k];
  }
  for (const k of Object.keys(_plain)) {
    if (k.indexOf('hours:') === 0) delete _plain[k];
  }
}

function _wakaConnectHtml(hrs) {
  if (hrs && hrs.success) return '';
  if (!_wakaApi()) {
    return '<div class="pf-waka"><div class="pf-waka-hint">Fully restart the app to enable WakaTime sign in.</div></div>';
  }
  let h = '<div class="pf-waka">';
  if (_wk.busy) {
    h += '<div class="pf-waka-wait"><span class="pf-spinner sm"></span><span>Waiting for approval in your browser...</span></div>' +
      '<div class="pf-waka-actions"><button type="button" class="pf-btn" data-waka="cancel">Cancel</button></div>';
  } else if (_wk.open) {
    h += '<div class="pf-waka-hint">Create an app on WakaTime (<a class="pf-waka-link" data-waka="apps">open apps page</a>) and add this exact redirect URI to it:</div>' +
      '<div class="pf-waka-redirect">' + _esc(_wk.redirect) + '</div>' +
      '<div class="pf-edit-field"><label>Client ID</label><input class="pf-edit-input" id="pfWkId" autocomplete="off" spellcheck="false" value="' + _esc(_wk.clientId) + '"></div>' +
      '<div class="pf-edit-field"><label>Client secret</label><input class="pf-edit-input" id="pfWkSecret" type="password" autocomplete="off" spellcheck="false" placeholder="' + (_wk.hasApp ? 'Saved - leave empty to keep it' : 'waka_sec_...') + '" value="' + _esc(_wk.secret) + '"></div>' +
      '<div class="pf-waka-actions"><button type="button" class="pf-btn" data-waka="close">Cancel</button><button type="button" class="pf-btn primary" data-waka="connect">Connect</button></div>';
  } else {
    h += '<div class="pf-waka-actions"><button type="button" class="pf-btn primary" data-waka="open">Connect WakaTime</button></div>';
  }
  if (_wk.msg) h += '<div class="pf-acc-msg' + (_wk.warn ? ' warn' : '') + '">' + _esc(_wk.msg) + '</div>';
  return h + '</div>';
}

async function _wakaOpen() {
  const a = _wakaApi();
  if (!a) return;
  try {
    const st = await a.status();
    if (st && st.success) {
      _wk.hasApp = !!st.hasApp;
      _wk.redirect = st.redirectUri || '';
      if (!_wk.clientId) _wk.clientId = st.clientId || '';
    }
  } catch (_) {}
  _wk.open = true;
  _wk.msg = '';
  _wk.warn = false;
  _renderBody('dash');
}

async function _wakaConnect() {
  const a = _wakaApi();
  if (!a || _wk.busy) return;
  const id = _wk.clientId.trim();
  const secret = _wk.secret.trim();
  if (!id || (!secret && !_wk.hasApp)) {
    _wk.msg = 'Enter the Client ID and Client secret of your WakaTime app.';
    _wk.warn = true;
    _renderBody('dash');
    return;
  }
  _wk.busy = true;
  _wk.msg = '';
  _wk.warn = false;
  _renderBody('dash');
  try {
    const saved = await a.saveApp(id, secret);
    if (!saved || !saved.success) throw new Error((saved && saved.error) || 'Could not save the app details.');
    _wk.secret = '';
    _wk.hasApp = true;
    const res = await a.connect();
    if (res && res.success) {
      _wk.open = false;
      _wk.msg = '';
      _wakaDropHours();
    } else if (!res || !res.cancelled) {
      throw new Error((res && res.error) || 'WakaTime sign in failed.');
    }
  } catch (err) {
    _wk.msg = err && err.message ? err.message : 'WakaTime sign in failed.';
    _wk.warn = true;
  }
  _wk.busy = false;
  _renderBody('dash');
}

async function _wakaCancel() {
  const a = _wakaApi();
  if (!a) return;
  try {
    await a.cancel();
  } catch (_) {}
}


function _topWithOther(items, top) {
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= top) return sorted;
  const head = sorted.slice(0, top);
  head.push({ label: 'Other', value: sorted.slice(top).reduce((s, i) => s + i.value, 0) });
  return head;
}

function _commitsChartHtml(daily) {
  const list = daily || [];
  const max = Math.max(1, ...list.map((d) => d.commits));
  const total = list.reduce((s, d) => s + d.commits, 0);
  const w = 8;
  const gap = 3;
  const h = 70;
  const bars = list.map((d, i) => {
    const bh = d.commits ? Math.max(3, Math.round((d.commits / max) * h)) : 1;
    return '<rect x="' + (i * (w + gap)) + '" y="' + (h - bh) + '" width="' + w + '" height="' + bh + '" rx="1.5" class="pf-bar' + (d.commits ? '' : ' empty') + '"><title>' + _esc(d.date) + ': ' + d.commits + ' commits, ' + d.saves + ' saves</title></rect>';
  }).join('');
  const width = Math.max(1, list.length * (w + gap) - gap);
  const first = list.length ? list[0].date : '';
  const last = list.length ? list[list.length - 1].date : '';
  return '<div class="pf-donut-wrap pf-dash-chart"><div class="pf-donut-title">Commits, last 30 days <span class="pf-donut-pct">' + total + ' total</span></div>' +
    '<svg viewBox="0 0 ' + width + ' ' + h + '" preserveAspectRatio="none" class="pf-bars">' + bars + '</svg>' +
    '<div class="pf-bars-axis"><span>' + _esc(first) + '</span><span>' + _esc(last) + '</span></div></div>';
}

function _dashSorted(repos, hours) {
  const hoursOf = (r) => hours.get(r.name.toLowerCase()) || 0;
  const by = {
    recent: (a, b) => b.lastCommitAt - a.lastCommitAt,
    changes: (a, b) => (b.dirty + b.unpushed) - (a.dirty + a.unpushed) || b.lastCommitAt - a.lastCommitAt,
    commits: (a, b) => b.commits - a.commits,
    hours: (a, b) => hoursOf(b) - hoursOf(a),
  };
  return repos.slice().sort(by[_dashSort] || by.recent);
}

function _dashRowHtml(r, hours, hasHours) {
  let changes = '<span class="pf-dash-ok">clean</span>';
  if (r.error) changes = '<span class="pf-dash-warn">error</span>';
  else if (r.dirty > 0) {
    changes = '<span class="pf-dash-warn">' + r.dirty + ' changed</span>' +
      (r.staged ? ' <span class="pf-dash-mute">(' + r.staged + ' staged)</span>' : '');
  }

  const bits = [];
  if (r.unpushed > 0) {
    bits.push('<span class="pf-dash-warn">\u2191' + r.unpushed + (r.upstream ? '' : ' unpushed') + '</span>');
  }
  if (r.behind > 0) bits.push('<span class="pf-dash-info">\u2193' + r.behind + '</span>');
  if (!bits.length) {
    bits.push(r.upstream ? '<span class="pf-dash-ok">synced</span>' : '<span class="pf-dash-mute">no upstream</span>');
  }

  const last = r.lastCommitAt ? _timeAgo(new Date(r.lastCommitAt * 1000).toISOString()) : '\u2014';
  const hoursCell = hasHours ? _fmtHours(hours.get(r.name.toLowerCase())) : '\u2014';
  const deploy = (r.deploy || []).map((d) => '<span class="pf-dash-chip" title="' + _esc(d.role) + '">' + _esc(d.name) + '</span>').join('') || '<span class="pf-dash-mute">\u2014</span>';

  return '<tr class="pf-dash-row' + (r.isActive ? ' active' : '') + '" data-path="' + _esc(r.repoPath) + '" title="' + _esc(r.repoPath) + '">' +
    '<td class="pf-dash-name">' + _esc(r.name) + '</td>' +
    '<td><span class="pf-dash-branch">' + _esc(r.branch || 'detached') + '</span></td>' +
    '<td>' + changes + '</td>' +
    '<td>' + bits.join(' ') + '</td>' +
    '<td title="' + _esc(r.lastCommitMsg) + '">' + _esc(last) + '</td>' +
    '<td class="pf-dash-num">' + r.commits + '</td>' +
    '<td class="pf-dash-num">' + r.saves + '</td>' +
    '<td class="pf-dash-num">' + hoursCell + '</td>' +
    '<td>' + deploy + '</td>' +
  '</tr>';
}

async function _openRepoFromDash(repoPath) {
  if (!repoPath) return;
  try {
    const mod = await import('./app_manager/repoManager.js');
    await mod.loadRepo(repoPath);
    if (window.__activeRepoPath === repoPath) close();
  } catch (_) {}
}

async function _renderDashboard() {
  const section = _el('div', { className: 'pf-section' });
  const days = _dashRange === 'month' ? 30 : 7;
  const [ov, hrs] = await Promise.all([
    _cached('overview:' + _dashRange, () => window.electronAPI.profile.getOverview({ range: _dashRange }), 60000),
    _cached('hours:' + days, () => window.electronAPI.profile.getHours(days), 300000),
  ]);

  const rangeTabs = '<div class="pf-range-tabs">' +
    [['week', '7D'], ['month', '30D']].map((x) => '<button class="pf-range-btn' + (_dashRange === x[0] ? ' active' : '') + '" data-dash-range="' + x[0] + '">' + x[1] + '</button>').join('') +
  '</div>';

  const wireRange = () => {
    section.querySelectorAll('[data-dash-range]').forEach((b) => b.addEventListener('click', () => {
      _dashRange = b.dataset.dashRange;
      _renderBody('dash');
    }));
  };

  if (!ov || !ov.repos) {
    section.innerHTML = '<div class="pf-dash-head"><span class="pf-section-title">Workspace</span>' + rangeTabs + '</div><div class="pf-empty">Could not read your repositories</div>';
    wireRange();
    return section;
  }

  const acc = _activeAccount();
  const scoped = !!acc && _scope === 'account';
  const allRepos = ov.repos.filter((r) => r.exists && r.isGit);
  const repos = scoped ? allRepos.filter(_matchesAccount) : allRepos;
  const skipped = ov.repos.length - allRepos.length;
  const hiddenByScope = allRepos.length - repos.length;
  const hasHours = !!(hrs && hrs.success);
  const hours = new Map();
  if (hasHours) for (const p of hrs.projects) hours.set(String(p.name).toLowerCase(), p.seconds);

  const shownNames = new Set(repos.map((r) => r.name.toLowerCase()));
  let hoursTotal = hasHours ? hrs.seconds : 0;
  if (hasHours && scoped) {
    hoursTotal = hrs.projects.reduce((s, p) => s + (shownNames.has(String(p.name).toLowerCase()) ? p.seconds : 0), 0);
  }

  const dirtyRepos = repos.filter((r) => r.dirty > 0).length;
  const unpushed = repos.reduce((s, r) => s + r.unpushed, 0);
  const commits = repos.reduce((s, r) => s + r.commits, 0);
  const attention = repos.filter((r) => r.dirty > 0 || r.unpushed > 0 || r.behind > 0);
  const shown = _dashSorted(_dashFilter === 'attention' ? attention : repos, hours);

  const card = (value, label, warn) => '<div class="pf-dash-card"><div class="pf-dash-card-value' + (warn ? ' warn' : '') + '">' + value + '</div><div class="pf-dash-card-label">' + label + '</div></div>';
  const cards = '<div class="pf-dash-cards">' +
    card(repos.length, 'Repos', false) +
    card(dirtyRepos, 'Uncommitted', dirtyRepos > 0) +
    card(unpushed, 'Unpushed commits', unpushed > 0) +
    card(commits, 'Commits (' + (_dashRange === 'month' ? '30d' : '7d') + ')', false) +
    card(hasHours ? _fmtHours(hoursTotal) : '\u2014', 'Hours (' + (_dashRange === 'month' ? '30d' : '7d') + ')', false) +
  '</div>';

  const scopeTabs = acc
    ? '<div class="pf-range-tabs">' +
      '<button class="pf-range-btn' + (scoped ? ' active' : '') + '" data-dash-scope="account">@' + _esc(acc.username) + '</button>' +
      '<button class="pf-range-btn' + (!scoped ? ' active' : '') + '" data-dash-scope="all">All repos</button>' +
    '</div>'
    : '';

  const filters = '<div class="pf-range-tabs">' +
    '<button class="pf-range-btn' + (_dashFilter === 'all' ? ' active' : '') + '" data-dash-filter="all">All</button>' +
    '<button class="pf-range-btn' + (_dashFilter === 'attention' ? ' active' : '') + '" data-dash-filter="attention">Needs attention (' + attention.length + ')</button>' +
  '</div>';

  const cols = [
    { label: 'Repository' },
    { label: 'Branch' },
    { label: 'Changes', sort: 'changes' },
    { label: 'Sync' },
    { label: 'Last commit', sort: 'recent' },
    { label: 'Commits', sort: 'commits', num: true },
    { label: 'Saves', num: true },
    { label: 'Hours', sort: 'hours', num: true },
    { label: 'Deploy' },
  ];
  const head = cols.map((c) => '<th class="' + (c.sort && c.sort === _dashSort ? 'sorted ' : '') + (c.num ? 'pf-dash-num' : '') + '"' + (c.sort ? ' data-sort="' + c.sort + '"' : '') + '>' + c.label + '</th>').join('');
  let emptyText = 'Nothing needs attention';
  if (_dashFilter === 'all') emptyText = scoped ? 'No repositories found for @' + _esc(acc.username) : 'No repositories found';
  const rowsHtml = shown.length
    ? shown.map((r) => _dashRowHtml(r, hours, hasHours)).join('')
    : '<tr><td colspan="9" class="pf-dash-mute" style="text-align:center;padding:24px">' + emptyText + '</td></tr>';

  const hoursSource = hasHours && scoped
    ? hrs.projects.filter((p) => shownNames.has(String(p.name).toLowerCase()))
    : (hasHours ? hrs.projects : []);
  const hoursItems = hoursSource.length
    ? _topWithOther(hoursSource.map((p) => ({ label: p.name, value: p.seconds })), 6)
    : [];
  const hoursEmpty = hrs && hrs.error ? hrs.error : 'Connect WakaTime to see hours';
  const hoursCard = hoursItems.length
    ? _buildDonutHTML('Hours by Project', hoursItems, _fmtHours)
    : '<div class="pf-donut-wrap"><div class="pf-donut-title">Hours by Project</div><div class="pf-donut-empty">' + _esc(hoursEmpty) + '</div>' + _wakaConnectHtml(hrs) + '</div>';

  let notes = '';
  if (skipped > 0) {
    notes += '<div class="pf-dash-sub">' + skipped + ' tracked folder' + (skipped === 1 ? '' : 's') + ' skipped (missing or not a git repository)</div>';
  }
  if (scoped && hiddenByScope > 0) {
    notes += '<div class="pf-dash-sub">' + hiddenByScope + ' repo' + (hiddenByScope === 1 ? '' : 's') + ' hidden: they belong to other accounts or have no GitHub remote. Choose All repos to see them.</div>';
  }

  section.innerHTML =
    '<div class="pf-dash-head"><span class="pf-section-title">Workspace</span>' + scopeTabs + filters + rangeTabs + '</div>' +
    cards +
    '<div class="pf-dash-tablewrap"><table class="pf-dash-table"><thead><tr>' + head + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
    notes +
    '<div class="pf-dash-charts">' + _commitsChartHtml(ov.daily) + hoursCard + '</div>';

  wireRange();
  section.querySelectorAll('[data-dash-scope]').forEach((b) => b.addEventListener('click', () => {
    _scope = b.dataset.dashScope === 'all' ? 'all' : 'account';
    _lsSet(SCOPE_KEY, _scope);
    _renderBody('dash');
  }));
  section.querySelectorAll('[data-dash-filter]').forEach((b) => b.addEventListener('click', () => {
    _dashFilter = b.dataset.dashFilter;
    _renderBody('dash');
  }));
  section.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    _dashSort = th.dataset.sort;
    _renderBody('dash');
  }));
  const tbody = section.querySelector('tbody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const row = e.target.closest('.pf-dash-row');
      if (row) _openRepoFromDash(row.dataset.path);
    });
  }
  section.addEventListener('click', (e) => {
    const t = e.target.closest('[data-waka]');
    if (!t) return;
    const act = t.dataset.waka;
    if (act === 'open') _wakaOpen();
    else if (act === 'connect') _wakaConnect();
    else if (act === 'cancel') _wakaCancel();
    else if (act === 'apps') _openUrl('https://wakatime.com/apps');
    else if (act === 'close') {
      _wk.open = false;
      _wk.msg = '';
      _renderBody('dash');
    }
  });
  section.addEventListener('input', (e) => {
    if (e.target.id === 'pfWkId') _wk.clientId = e.target.value;
    else if (e.target.id === 'pfWkSecret') _wk.secret = e.target.value;
  });
  return section;
}

// Listen for data changes from main process (commit/push events)
if (window.electronAPI && window.electronAPI.profile && window.electronAPI.profile.onDataChanged) {
  window.electronAPI.profile.onDataChanged(() => {
    import('./app_manager/prefetchManager.js').then((mod) => {
      mod.getPrefetchCache().invalidate('profile');
    }).catch(() => {});
    _clearCache();
    _lastPrime = 0;
    _hydratedAt = 0;
    clearTimeout(_changeTimer);
    _changeTimer = setTimeout(() => {
      if (_open) {
        if (!_dayDetail) _load();
      } else {
        warm();
      }
    }, 1200);
  });
}

// Pre-load the profile in the background shortly after startup so opening it is instant.
if (window.electronAPI && window.electronAPI.profile) {
  setTimeout(() => {
    const feats = window.electronAPI.featuresGet ? window.electronAPI.featuresGet() : Promise.resolve(null);
    Promise.resolve(feats).then((f) => {
      if (f && f.profileTool === false) return;
      warm();
    }).catch(() => {
      warm();
    });
  }, 3500);
}