let _panel = null;
let _open = false;
let _repoPath = '';
let _activeKey = '';
let _loadToken = 0;
let _entryTs = 0;
let _ageTimer = null;
let _view = 'activity';
let _leaderMetric = 'score';

let _commits = [];
let _contributors = {};
let _selectedContributor = null;
let _selectedGraphKey = null;
let _selectedCommit = null;
let _graphViewMode = 'day';
let _drillOriginalMode = null;
let _drillKey = null;
let _commitFilterText = '';
let _diffCache = {};
let _visibleCount = 50;
let _profileContributor = null;

const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 6;
const _cache = new Map();
const _inflight = new Map();

const METRICS = {
  score: { label: 'Score', unit: 'pts', value: (d) => _computeScore(d) },
  commits: { label: 'Commits', unit: 'commits', value: (d) => d.commits || 0 },
  lines: { label: 'Lines', unit: 'lines', value: (d) => (d.linesAdded || 0) + (d.linesRemoved || 0) },
};

const TA_SUMMARY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6"/><rect x="3" y="6" width="14" height="4" rx="1"/><path d="M10 3v7"/><path d="M7 6l3-3 3 3"/></svg>';
const TA_REFRESH = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 0 1 11.7-4.7"/><path d="M17 10a7 7 0 0 1-11.7 4.7"/><path d="M14.5 2v4h-4"/><path d="M5.5 18v-4h4"/></svg>';
const TA_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>';
const TA_CROWN = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M3.5 15.5L1 6l4 2 5-5 5 5 4-2-2.5 9.5H3.5z"/></svg>';
const TA_STAR = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5z"/></svg>';
const TA_ACTIVITY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17V9M8 17V4M13 17v-6M18 17V7"/></svg>';
const TA_TROPHY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8v5a4 4 0 0 1-8 0V3z"/><path d="M6 5H3v1a3 3 0 0 0 3 3"/><path d="M14 5h3v1a3 3 0 0 1-3 3"/><path d="M10 12v3"/><path d="M7 17h6"/></svg>';

function _el(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') el.className = v;
      else if (k === 'innerHTML') el.innerHTML = v;
      else el.setAttribute(k, v);
    }
  }
  if (children) {
    for (const c of [].concat(children)) el.appendChild(c);
  }
  return el;
}

function _esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  const months = Math.floor(days / 30);
  if (months < 12) return months + 'mo ago';
  return Math.floor(months / 12) + 'y ago';
}

function _initials(name) {
  const s = String(name || '?').trim();
  if (!s) return '?';
  return s.split(' ').map((p) => p.charAt(0)).join('').substring(0, 2).toUpperCase();
}

function _shortHash(h) {
  return h ? h.substring(0, 7) : '';
}

function _n(n) {
  return (n || 0).toLocaleString();
}

function _key(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function _reduceMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

function _repoName(p) {
  const parts = String(p || '').split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

// ── Per-repo cache ────────────────────────────────────────────

function _cacheGet(repoPath) {
  const k = _key(repoPath);
  const entry = _cache.get(k);
  if (!entry) return null;
  _cache.delete(k);
  _cache.set(k, entry);
  return entry;
}

function _cacheSet(repoPath, result) {
  const k = _key(repoPath);
  const entry = {
    commits: result.commits || [],
    contributors: result.contributors || {},
    ts: Date.now(),
  };
  _cache.delete(k);
  _cache.set(k, entry);
  while (_cache.size > CACHE_MAX) {
    _cache.delete(_cache.keys().next().value);
  }
  return entry;
}

function _signature(commits) {
  const list = commits || [];
  return list.length + ':' + (list[0] ? list[0].hash : '');
}

function _fetch(repoPath, force) {
  const k = _key(repoPath);
  if (!force && _inflight.has(k)) return _inflight.get(k);
  let p = null;
  p = (async () => {
    try {
      await Promise.resolve();
      const result = await window.electronAPI.teamActivityLog(repoPath, !!force);
      if (!result || result.error) throw new Error((result && result.error) || 'No data');
      return _cacheSet(repoPath, result);
    } finally {
      if (_inflight.get(k) === p) _inflight.delete(k);
    }
  })();
  _inflight.set(k, p);
  return p;
}

document.addEventListener('repo:switched', (e) => {
  if (!_open) return;
  const p = e && e.detail && e.detail.repoPath;
  if (!p || _key(p) === _activeKey) return;
  _switchRepo(p).catch((err) => console.warn('[TeamActivity] switch failed:', err));
});

document.addEventListener('repo:closed', (e) => {
  const p = e && e.detail && e.detail.repoPath;
  if (!p) return;
  const k = _key(p);
  _cache.delete(k);
  _inflight.delete(k);
});

// ── Open / Close ──────────────────────────────────────────────

export function isOpen() {
  return _open;
}

export async function open(repoPath) {
  const repo = repoPath || window.__activeRepoPath || '';
  if (_open) {
    if (repo && _key(repo) !== _activeKey) await _switchRepo(repo);
    return;
  }
  if (!_panel) _buildPanel();
  _open = true;
  _panel.classList.add('taf-open');
  _setView(_view, true);
  _startAgeTimer();
  await _switchRepo(repo);
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('taf-open');
  _open = false;
  _selectedCommit = null;
  _selectedContributor = null;
  _stopAgeTimer();
}

function _startAgeTimer() {
  _stopAgeTimer();
  _ageTimer = setInterval(_updateAgeLabel, 30000);
}

function _stopAgeTimer() {
  if (_ageTimer) {
    clearInterval(_ageTimer);
    _ageTimer = null;
  }
}

function _updateAgeLabel(text) {
  if (!_panel) return;
  const el = _panel.querySelector('#tafUpdated');
  if (!el) return;
  if (typeof text === 'string') {
    el.textContent = text;
    return;
  }
  el.textContent = _entryTs ? 'Updated ' + _timeAgo(_entryTs) : '';
}

function _renderRepoChip() {
  const chip = _panel.querySelector('#tafRepoChip');
  const name = _repoName(_repoPath);
  chip.textContent = name;
  chip.title = _repoPath;
  chip.style.display = name ? '' : 'none';
}

// ── Panel construction ────────────────────────────────────────

function _buildPanel() {
  _panel = document.createElement('div');
  _panel.id = 'tafPanel';
  _panel.className = 'taf-overlay';
  _panel.innerHTML = `
    <div class="taf-backdrop"></div>
    <div class="taf-container">
      <div class="taf-header">
        <h2>${TA_SUMMARY}<span>Team Activity</span></h2>
        <span class="taf-repo-chip" id="tafRepoChip"></span>
        <div class="taf-tabs">
          <button type="button" class="taf-tab active" data-view="activity">${TA_ACTIVITY}<span>Activity</span></button>
          <button type="button" class="taf-tab" data-view="leadership">${TA_TROPHY}<span>Leadership</span></button>
        </div>
        <div class="taf-header-right">
          <span class="taf-updated" id="tafUpdated"></span>
          <button class="taf-refresh-btn" id="tafRefreshBtn">${TA_REFRESH} Refresh</button>
          <button class="taf-btn-close" id="tafCloseBtn">${TA_CLOSE}</button>
        </div>
      </div>
      <div class="taf-summary" id="tafSummary"></div>
      <div class="taf-body">
        <div class="taf-contributors" id="tafContributors">
          <div class="taf-contributors-header">Contributors</div>
          <div class="taf-contributors-list" id="tafContributorsList"></div>
        </div>
        <div class="taf-main">
          <div class="taf-graph-section">
            <div class="taf-graph-header">
              <span class="taf-graph-title">Commit Activity</span>
              <div class="taf-graph-toggles">
                <button class="taf-graph-toggle active" data-mode="day">Day</button>
                <button class="taf-graph-toggle" data-mode="week">Week</button>
                <button class="taf-graph-toggle" data-mode="month">Month</button>
                <button class="taf-graph-reset" id="tafGraphReset">Reset</button>
              </div>
            </div>
            <div class="taf-graph-canvas-wrap" id="tafGraph"></div>
          </div>
          <div class="taf-commit-section">
            <div class="taf-commit-header">
              <span class="taf-commit-count" id="tafCommitCount"></span>
              <input type="text" class="taf-commit-filter" id="tafCommitFilter" placeholder="Filter commits\u2026">
            </div>
            <div class="taf-commit-list" id="tafCommitList"></div>
          </div>
        </div>
        <div class="taf-leader" id="tafLeader"></div>
      </div>
      <div class="taf-drawer" id="tafDrawer">
        <div class="taf-drawer-header">
          <h3 id="tafDrawerHash"></h3>
          <button class="taf-drawer-close" id="tafDrawerClose">${TA_CLOSE}</button>
        </div>
        <div class="taf-drawer-meta" id="tafDrawerMeta"></div>
        <div class="taf-drawer-body">
          <div class="taf-drawer-content">
            <div class="taf-file-header" id="tafFileHeader"></div>
            <div class="taf-drawer-diff" id="tafDrawerDiff"></div>
          </div>
          <div class="taf-drawer-sidebar">
            <div class="taf-sidebar-header" id="tafSidebarHeader">Files</div>
            <div class="taf-drawer-files" id="tafDrawerFiles"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(_panel);

  _panel.querySelector('.taf-backdrop').addEventListener('click', close);
  _panel.querySelector('#tafCloseBtn').addEventListener('click', close);
  _panel.querySelector('#tafRefreshBtn').addEventListener('click', _onRefresh);
  _panel.querySelector('#tafCommitFilter').addEventListener('input', _onFilter);
  _panel.querySelector('#tafDrawerClose').addEventListener('click', _closeDrawer);
  _panel.querySelector('#tafGraphReset').addEventListener('click', _resetGraphFilter);

  _panel.querySelectorAll('.taf-tab').forEach((btn) => {
    btn.addEventListener('click', () => _setView(btn.dataset.view));
  });

  _panel.querySelectorAll('.taf-graph-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      _panel.querySelectorAll('.taf-graph-toggle').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      _graphViewMode = btn.dataset.mode;
      _selectedGraphKey = null;
      _drillOriginalMode = null;
      _drillKey = null;
      _profileContributor = null;
      _renderCommits();
      _renderGraph(true);
    });
  });

  _panel.querySelector('#tafGraph').addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('[data-key]') : null;
    if (t) _onBarClick(t.getAttribute('data-key'));
  });

  _panel.querySelector('#tafLeader').addEventListener('click', (e) => {
    const m = e.target.closest('[data-metric]');
    if (m) {
      _leaderMetric = m.dataset.metric;
      _renderLeadership(true);
      return;
    }
    const row = e.target.closest('[data-name]');
    if (row) _leaderSelect(row.dataset.name);
  });

  _panel.querySelector('#tafCommitList').addEventListener('scroll', _onScroll);
  document.addEventListener('keydown', _escHandler);
}

function _escHandler(e) {
  if (e.key === 'Escape' && _open) {
    if (_selectedCommit) {
      _closeDrawer();
      return;
    }
    close();
  }
}

function _setView(view, skipRender) {
  _view = view;
  if (!_panel) return;
  _panel.classList.toggle('taf-view-leader', view === 'leadership');
  _panel.querySelectorAll('.taf-tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'leadership' && !skipRender) _renderLeadership(true);
}

// ── UI state ──────────────────────────────────────────────────

function _hideDrawer() {
  _selectedCommit = null;
  const drawer = _panel.querySelector('#tafDrawer');
  drawer.classList.remove('open');
  _panel.querySelector('#tafDrawerDiff').innerHTML = '';
  _panel.querySelector('#tafDrawerFiles').innerHTML = '';
  _panel.querySelector('#tafFileHeader').textContent = '';
}

function _resetUiState() {
  _selectedContributor = null;
  _selectedGraphKey = null;
  _drillOriginalMode = null;
  _drillKey = null;
  _profileContributor = null;
  _commitFilterText = '';
  _visibleCount = 50;
  _diffCache = {};
  _graphViewMode = 'day';
  if (!_panel) return;
  _hideDrawer();
  _panel.querySelector('#tafCommitFilter').value = '';
  _panel.querySelector('#tafCommitList').scrollTop = 0;
  _updateGraphToggleButtons();
}

// ── Data loading ──────────────────────────────────────────────

async function _switchRepo(repoPath) {
  _repoPath = repoPath || '';
  _activeKey = _key(_repoPath);
  _panel.dataset.repoPath = _repoPath;
  _resetUiState();
  _renderRepoChip();
  if (!_repoPath) {
    _loadToken++;
    _commits = [];
    _contributors = {};
    _entryTs = 0;
    _renderAll(false);
    _updateAgeLabel('');
    return;
  }
  await _loadData(_repoPath);
}

async function _loadData(repoPath) {
  const token = ++_loadToken;
  const entry = _cacheGet(repoPath);
  if (entry) {
    _applyEntry(entry, false);
    if (Date.now() - entry.ts > CACHE_TTL) _backgroundRefresh(repoPath, token);
    return;
  }

  _showLoading();
  try {
    const fresh = await _fetch(repoPath, false);
    if (token !== _loadToken) return;
    _applyEntry(fresh, false);
  } catch (err) {
    if (token !== _loadToken) return;
    _showError();
  }
}

async function _backgroundRefresh(repoPath, token) {
  try {
    const fresh = await _fetch(repoPath, true);
    if (token !== _loadToken || !_open) return;
    if (_signature(fresh.commits) === _signature(_commits)) {
      _entryTs = fresh.ts;
      _updateAgeLabel();
      return;
    }
    _applyEntry(fresh, true);
  } catch (_) {
    return;
  }
}

function _applyEntry(entry, keepState) {
  _commits = entry.commits || [];
  _contributors = entry.contributors || {};
  _entryTs = entry.ts || Date.now();
  if (keepState) {
    if (_selectedContributor && !_contributors[_selectedContributor]) _selectedContributor = null;
    if (_profileContributor && !_contributors[_profileContributor]) _profileContributor = null;
  }
  _renderAll(!keepState);
  _updateAgeLabel();
}

function _renderAll(animate) {
  _renderSummary(animate);
  _renderContributors(animate);
  _renderCommits();
  _renderGraph(animate);
  if (_view === 'leadership') _renderLeadership(animate);
}

function _showLoading() {
  _panel.querySelector('#tafSummary').innerHTML =
    '<div class="taf-skel-card"></div><div class="taf-skel-card"></div><div class="taf-skel-card"></div><div class="taf-skel-card"></div><div class="taf-skel-card"></div>';
  _panel.querySelector('#tafContributorsList').innerHTML =
    '<div class="taf-skel-row"></div><div class="taf-skel-row"></div><div class="taf-skel-row"></div><div class="taf-skel-row"></div>';
  _panel.querySelector('#tafCommitList').innerHTML = '<div class="taf-loading">Loading commit history\u2026</div>';
  _panel.querySelector('#tafCommitCount').textContent = '';
  _panel.querySelector('#tafGraph').innerHTML = '';
  _panel.querySelector('#tafLeader').innerHTML = '<div class="taf-loading">Loading\u2026</div>';
  _updateAgeLabel('');
}

function _showError() {
  _panel.querySelector('#tafSummary').innerHTML = '<div class="taf-empty">Failed to load activity data</div>';
  _panel.querySelector('#tafContributorsList').innerHTML = '';
  _panel.querySelector('#tafCommitList').innerHTML = '';
  _panel.querySelector('#tafLeader').innerHTML = '<div class="taf-empty">Failed to load activity data</div>';
}

async function _onRefresh() {
  const repo = _repoPath;
  if (!repo) return;
  const token = ++_loadToken;
  const btn = _panel.querySelector('#tafRefreshBtn');
  btn.classList.add('spinning');
  btn.disabled = true;
  try {
    const fresh = await _fetch(repo, true);
    if (token !== _loadToken) return;
    _applyEntry(fresh, true);
  } catch (err) {
    if (token === _loadToken) _updateAgeLabel('Refresh failed');
  } finally {
    btn.classList.remove('spinning');
    btn.disabled = false;
  }
}

// ── Counters ──────────────────────────────────────────────────

function _runCounters(root) {
  const els = root.querySelectorAll('[data-count]');
  els.forEach((el) => {
    const to = Number(el.dataset.count) || 0;
    const prefix = el.dataset.prefix || '';
    const delay = Number(el.dataset.delay || 0);
    if (_reduceMotion()) {
      el.textContent = prefix + _n(to);
      return;
    }
    el.textContent = prefix + '0';
    const start = performance.now() + delay;
    const dur = 900;
    const tick = (now) => {
      if (!el.isConnected) return;
      const t = Math.min(1, Math.max(0, (now - start) / dur));
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + _n(Math.round(to * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ── Summary bar ───────────────────────────────────────────────

function _statCard(cls, prefix, value, label) {
  return `<div class="taf-summary-item ${cls}">
    <span class="taf-summary-value" data-count="${value}" data-prefix="${prefix}">${prefix}${_n(value)}</span>
    <span class="taf-summary-label">${label}</span>
  </div>`;
}

function _renderSummary(animate) {
  const el = _panel.querySelector('#tafSummary');
  if (!_commits.length) {
    el.innerHTML = '<div class="taf-empty">No commits found</div>';
    return;
  }

  const total = _commits.length;
  const contribCount = Object.keys(_contributors).length;
  let totalAdded = 0;
  let totalRemoved = 0;
  for (const c of Object.values(_contributors)) {
    totalAdded += c.linesAdded || 0;
    totalRemoved += c.linesRemoved || 0;
  }

  const dates = _commits.map((c) => c.date).filter(Boolean).sort();
  const firstDate = dates.length ? new Date(dates[0]).toLocaleDateString() : '\u2014';

  el.innerHTML =
    _statCard('', '', total, 'Commits') +
    _statCard('', '', contribCount, 'Contributors') +
    _statCard('is-added', '+', totalAdded, 'Added') +
    _statCard('is-removed', '-', totalRemoved, 'Removed') +
    `<div class="taf-summary-item">
      <span class="taf-summary-value taf-summary-since">Since ${_esc(firstDate)}</span>
      <span class="taf-summary-label">\u2192 Today</span>
    </div>`;

  if (animate) _runCounters(el);
}

// ── Leaderboard (sidebar) ─────────────────────────────────────

function _computeScore(data) {
  return (data.commits || 0) * 10 + (data.linesAdded || 0) + (data.linesRemoved || 0);
}

function _selectContributor(name, profile) {
  _selectedContributor = name;
  _profileContributor = profile ? name : null;
  _renderContributors(false);
  _renderCommits();
  _renderGraph(true);
}

function _renderLeaderboardItem(name, data, rank, maxScore, isAll, active) {
  const item = _el('div', { className: 'taf-lb-item' + (active ? ' active' : '') });

  const rankEl = _el('div', { className: 'taf-lb-rank' });
  if (!isAll) {
    if (rank === 0) rankEl.innerHTML = `<span class="taf-lb-crown">${TA_CROWN}</span>`;
    else rankEl.textContent = '#' + (rank + 1);
  }

  const avatar = _el('div', { className: 'taf-lb-avatar' });
  if (isAll) {
    avatar.classList.add('is-all');
    avatar.textContent = 'A';
  } else {
    avatar.style.background = data.color || 'var(--text-faint)';
    avatar.textContent = _initials(name);
  }

  const info = _el('div', { className: 'taf-lb-info' });
  const nameEl = _el('div', { className: 'taf-lb-name' });
  nameEl.textContent = isAll ? 'All' : name;
  const statEl = _el('div', { className: 'taf-lb-stats' });
  if (isAll) {
    statEl.textContent = Object.keys(_contributors).length + ' contributors';
  } else {
    statEl.textContent = `${data.commits} commits \u00b7 +${_n(data.linesAdded)} / -${_n(data.linesRemoved)}`;
  }
  info.appendChild(nameEl);
  info.appendChild(statEl);

  if (!isAll && maxScore > 0) {
    const pct = Math.max(2, Math.round((_computeScore(data) / maxScore) * 100));
    const barWrap = _el('div', { className: 'taf-lb-bar-wrap' });
    const bar = _el('div', { className: 'taf-lb-bar', style: `width:${pct}%;background:${data.color || 'var(--text-faint)'}` });
    barWrap.appendChild(bar);
    info.appendChild(barWrap);
  }

  const scoreEl = _el('div', { className: 'taf-lb-score' });
  if (!isAll) scoreEl.textContent = _n(_computeScore(data)) + ' pts';

  item.appendChild(rankEl);
  item.appendChild(avatar);
  item.appendChild(info);
  item.appendChild(scoreEl);

  if (isAll) {
    item.addEventListener('click', () => _selectContributor(null, false));
  } else {
    item.addEventListener('click', () => _selectContributor(name, false));
    item.addEventListener('dblclick', () => _selectContributor(name, true));
  }
  return item;
}

function _renderContributors(animate) {
  const list = _panel.querySelector('#tafContributorsList');
  list.classList.toggle('taf-anim', !!animate && !_reduceMotion());
  list.innerHTML = '';

  list.appendChild(_renderLeaderboardItem(null, null, 0, 0, true, !_selectedContributor));

  const ranked = Object.entries(_contributors)
    .map(([name, data]) => ({ name, data, score: _computeScore(data) }))
    .sort((a, b) => b.score - a.score);

  const maxScore = ranked.length > 0 ? ranked[0].score : 0;
  for (let i = 0; i < ranked.length; i++) {
    const active = _selectedContributor === ranked[i].name;
    list.appendChild(_renderLeaderboardItem(ranked[i].name, ranked[i].data, i, maxScore, false, active));
  }
}

// ── Leadership view ───────────────────────────────────────────

function _rankContributors(metric) {
  const fn = METRICS[metric] || METRICS.score;
  return Object.entries(_contributors)
    .map(([name, d]) => ({ name, d, value: fn.value(d) }))
    .sort((a, b) => b.value - a.value || (b.d.commits || 0) - (a.d.commits || 0) || a.name.localeCompare(b.name));
}

function _leaderSub(d) {
  return `${_n(d.commits)} commits \u00b7 +${_n(d.linesAdded)} / -${_n(d.linesRemoved)}`;
}

function _leaderSelect(name) {
  if (!name || !_contributors[name]) return;
  _selectedContributor = name;
  _profileContributor = null;
  _selectedGraphKey = null;
  _setView('activity', true);
  _renderContributors(false);
  _renderCommits();
  _renderGraph(true);
}

function _renderLeadership(animate) {
  const root = _panel.querySelector('#tafLeader');
  root.classList.remove('go');
  root.classList.remove('static');

  const ranked = _rankContributors(_leaderMetric);
  if (!ranked.length) {
    root.innerHTML = '<div class="taf-empty">No contributors yet</div>';
    return;
  }

  const metric = METRICS[_leaderMetric] || METRICS.score;
  const max = ranked[0].value || 1;
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const delays = { 0: 0.55, 1: 0.3, 2: 0.1 };

  let tabs = '';
  for (const key of Object.keys(METRICS)) {
    tabs += `<button type="button" class="taf-metric${key === _leaderMetric ? ' active' : ''}" data-metric="${key}">${METRICS[key].label}</button>`;
  }

  let podium = '';
  for (const idx of [2, 1, 0]) {
    const entry = top[idx];
    if (!entry) continue;
    const place = idx + 1;
    const ratio = idx === 0 ? 1 : Math.max(0.3, entry.value / max);
    const delay = delays[idx];
    const color = entry.d.color || 'var(--text-faint)';
    podium += `<div class="taf-pod taf-pod-${place}" data-name="${_esc(entry.name)}" style="--r:${ratio.toFixed(3)};--delay:${delay}s">
      <div class="taf-pod-head">
        ${place === 1 ? `<div class="taf-pod-star">${TA_STAR}</div>` : ''}
        <div class="taf-pod-avatar" style="background:${color}">${_esc(_initials(entry.name))}</div>
        <div class="taf-pod-name" title="${_esc(entry.name)}">${_esc(entry.name)}</div>
        <div class="taf-pod-sub">${_esc(_leaderSub(entry.d))}</div>
      </div>
      <div class="taf-pod-bar">
        <span class="taf-pod-rank">${place}</span>
        <span class="taf-pod-value" data-count="${entry.value}" data-delay="${Math.round(delay * 1000)}">${_n(entry.value)}</span>
        <span class="taf-pod-unit">${metric.unit}</span>
      </div>
    </div>`;
  }

  let rows = '';
  rest.forEach((entry, i) => {
    const pct = Math.max(2, Math.round((entry.value / max) * 100));
    const color = entry.d.color || 'var(--text-faint)';
    rows += `<div class="taf-rank-row" data-name="${_esc(entry.name)}" style="--w:${pct}%;--i:${i};--c:${color}">
      <span class="taf-rank-pos">#${i + 4}</span>
      <span class="taf-rank-avatar" style="background:${color}">${_esc(_initials(entry.name))}</span>
      <div class="taf-rank-info">
        <div class="taf-rank-name">${_esc(entry.name)}</div>
        <div class="taf-rank-sub">${_esc(_leaderSub(entry.d))}</div>
      </div>
      <div class="taf-rank-track"><div class="taf-rank-fill"></div></div>
      <span class="taf-rank-value">${_n(entry.value)} ${metric.unit}</span>
    </div>`;
  });

  root.innerHTML = `
    <div class="taf-leader-toolbar">
      <div class="taf-leader-heading">
        <div class="taf-leader-title">${TA_TROPHY}<span>Leadership \u00b7 ${_esc(_repoName(_repoPath))}</span></div>
        <div class="taf-leader-sub">Score = commits x 10 + lines added + lines removed</div>
      </div>
      <div class="taf-metric-toggle">${tabs}</div>
    </div>
    <div class="taf-podium">${podium}</div>
    ${rest.length ? `<div class="taf-rank-list">${rows}</div>` : ''}
  `;

  if (!animate || _reduceMotion()) {
    root.classList.add('static');
    root.classList.add('go');
    root.querySelectorAll('[data-count]').forEach((el) => {
      el.textContent = _n(Number(el.dataset.count) || 0);
    });
    return;
  }

  _runCounters(root);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.add('go'));
  });
}

// ── Graph ─────────────────────────────────────────────────────

function _getGraphCommits() {
  let commits = _commits;
  if (_selectedContributor) {
    commits = commits.filter((c) => c.author === _selectedContributor);
  }
  if (_drillOriginalMode && _drillKey) {
    if (_drillOriginalMode === 'month') {
      const monthKey = _drillKey.slice(0, 7);
      commits = commits.filter((c) => c.date.startsWith(monthKey));
    } else if (_drillOriginalMode === 'week') {
      const wkStart = new Date(_drillKey.slice(0, 10));
      const wkEnd = new Date(wkStart);
      wkEnd.setDate(wkEnd.getDate() + 7);
      commits = commits.filter((c) => {
        const d = new Date(c.date);
        return d >= wkStart && d < wkEnd;
      });
    }
  }
  return commits;
}

function _getFilteredCommits() {
  let filtered = _getGraphCommits();
  if (_selectedGraphKey) {
    if (_drillOriginalMode) {
      filtered = filtered.filter((c) => c.date.startsWith(_selectedGraphKey));
    } else {
      filtered = filtered.filter((c) => _dateToGraphKey(c.date, _graphViewMode) === _selectedGraphKey);
    }
  }
  if (_commitFilterText) {
    const ft = _commitFilterText.toLowerCase();
    filtered = filtered.filter((c) =>
      c.message.toLowerCase().includes(ft) ||
      c.author.toLowerCase().includes(ft) ||
      c.hash.includes(ft)
    );
  }
  return filtered;
}

function _dateToGraphKey(dateStr, mode) {
  const d = new Date(dateStr);
  if (mode === 'day') return d.toISOString().slice(0, 10);
  if (mode === 'week') {
    const wkStart = new Date(d);
    wkStart.setDate(d.getDate() - d.getDay());
    return wkStart.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 7);
}

function _onBarClick(key) {
  if (_selectedGraphKey === key) {
    _selectedGraphKey = null;
    if (_drillOriginalMode) {
      _graphViewMode = _drillOriginalMode;
      _drillOriginalMode = null;
      _drillKey = null;
      _updateGraphToggleButtons();
    }
  } else {
    _selectedGraphKey = key;
    if (!_drillOriginalMode && (_graphViewMode === 'month' || _graphViewMode === 'week')) {
      _drillOriginalMode = _graphViewMode;
      _drillKey = key;
      _graphViewMode = 'day';
      _updateGraphToggleButtons();
    }
  }
  _renderCommits();
  _renderGraph(false);
}

function _updateGraphToggleButtons() {
  if (!_panel) return;
  _panel.querySelectorAll('.taf-graph-toggle').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === _graphViewMode);
  });
}

function _resetGraphFilter() {
  _selectedGraphKey = null;
  _selectedContributor = null;
  _profileContributor = null;
  if (_drillOriginalMode) {
    _graphViewMode = _drillOriginalMode;
    _drillOriginalMode = null;
    _drillKey = null;
    _updateGraphToggleButtons();
  }
  _renderContributors(false);
  _renderCommits();
  _renderGraph(true);
}

function _renderGraph(animate) {
  const wrap = _panel.querySelector('#tafGraph');
  const mainEl = _panel.querySelector('.taf-main');

  if (_profileContributor) {
    mainEl.classList.add('in-profile');
    wrap.classList.remove('taf-anim');
    _renderProfile(wrap);
    return;
  }
  mainEl.classList.remove('in-profile');

  const graphCommits = _getGraphCommits();

  if (!graphCommits.length) {
    wrap.innerHTML = '<div class="taf-empty">No data</div>';
    return;
  }

  const data = _buildGraphData(graphCommits, _graphViewMode);
  if (!data.length) {
    wrap.innerHTML = '<div class="taf-empty">No data</div>';
    return;
  }

  wrap.classList.toggle('taf-anim', !!animate && !_reduceMotion());
  _drawBarChart(wrap, data, _graphViewMode);
}

function _renderProfile(wrap) {
  const data = _contributors[_profileContributor];
  if (!data) {
    wrap.innerHTML = '';
    return;
  }

  const authorCommits = _commits.filter((c) => c.author === _profileContributor);
  let firstDate = null;
  let totalFiles = 0;
  for (const c of authorCommits) {
    if (!firstDate || c.date < firstDate) firstDate = c.date;
    totalFiles += c.filesChanged || 0;
  }
  const activeDays = firstDate && data.lastCommit
    ? Math.max(1, Math.ceil((new Date(data.lastCommit) - new Date(firstDate)) / 86400000))
    : 1;
  const commitsPerWeek = activeDays > 0 ? ((data.commits / activeDays) * 7).toFixed(1) : '0';

  const net = data.linesAdded - data.linesRemoved;
  const netStr = net >= 0 ? `+${_n(net)}` : `-${_n(Math.abs(net))}`;

  wrap.innerHTML = `
    <div class="taf-profile">
      <div class="taf-profile-avatar" style="background:${data.color || 'var(--text-faint)'}">${_esc(_initials(_profileContributor))}</div>
      <div class="taf-profile-name">${_esc(_profileContributor)}</div>
      <div class="taf-profile-email">${_esc(data.email)}</div>
      <div class="taf-profile-stats-grid">
        <div class="taf-profile-stat">
          <span class="taf-profile-stat-value">${_n(data.commits)}</span>
          <span class="taf-profile-stat-label">Total Commits</span>
        </div>
        <div class="taf-profile-stat">
          <span class="taf-profile-stat-value" style="color:var(--green)">+${_n(data.linesAdded)}</span>
          <span class="taf-profile-stat-label">Lines Added</span>
        </div>
        <div class="taf-profile-stat">
          <span class="taf-profile-stat-value" style="color:var(--red)">-${_n(data.linesRemoved)}</span>
          <span class="taf-profile-stat-label">Lines Removed</span>
        </div>
        <div class="taf-profile-stat">
          <span class="taf-profile-stat-value">${netStr}</span>
          <span class="taf-profile-stat-label">Net Changes</span>
        </div>
        <div class="taf-profile-stat">
          <span class="taf-profile-stat-value">${_n(totalFiles)}</span>
          <span class="taf-profile-stat-label">Files Changed</span>
        </div>
        <div class="taf-profile-stat">
          <span class="taf-profile-stat-value">${commitsPerWeek}</span>
          <span class="taf-profile-stat-label">Avg / Week</span>
        </div>
      </div>
      <div class="taf-profile-timeline">
        <div class="taf-profile-tl-item">
          <span class="taf-profile-tl-label">First Commit</span>
          <span class="taf-profile-tl-value">${firstDate ? new Date(firstDate).toLocaleDateString() : '\u2014'}</span>
        </div>
        <div class="taf-profile-tl-item">
          <span class="taf-profile-tl-label">Last Commit</span>
          <span class="taf-profile-tl-value">${data.lastCommit ? new Date(data.lastCommit).toLocaleDateString() : '\u2014'}</span>
        </div>
        <div class="taf-profile-tl-item">
          <span class="taf-profile-tl-label">Active Period</span>
          <span class="taf-profile-tl-value">${_n(activeDays)} days</span>
        </div>
      </div>
      <div class="taf-profile-hint">Double-click another contributor or click Reset to return</div>
    </div>`;
}

function _buildGraphData(commits, mode) {
  if (!commits.length) return [];

  const grouped = {};
  for (const c of commits) {
    const d = new Date(c.date);
    let key;
    if (mode === 'day') {
      key = d.toISOString().slice(0, 10);
    } else if (mode === 'week') {
      const wkStart = new Date(d);
      wkStart.setDate(d.getDate() - d.getDay());
      key = wkStart.toISOString().slice(0, 10);
    } else {
      key = d.toISOString().slice(0, 7);
    }
    if (!grouped[key]) grouped[key] = { key, label: key, count: 0, commits: [] };
    grouped[key].count++;
    grouped[key].commits.push(c);
  }

  let minDate = new Date(commits[0].date);
  let maxDate = new Date(commits[0].date);
  for (const c of commits) {
    const d = new Date(c.date);
    if (d < minDate) minDate = d;
    if (d > maxDate) maxDate = d;
  }

  const result = [];
  const cursor = new Date(minDate);

  if (mode === 'day') {
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= maxDate) {
      const key = cursor.toISOString().slice(0, 10);
      result.push(grouped[key] || { key, label: key, count: 0, commits: [] });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (mode === 'week') {
    cursor.setDate(cursor.getDate() - cursor.getDay());
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= maxDate) {
      const key = cursor.toISOString().slice(0, 10);
      result.push(grouped[key] || { key, label: key, count: 0, commits: [] });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= maxDate) {
      const key = cursor.toISOString().slice(0, 7);
      result.push(grouped[key] || { key, label: key, count: 0, commits: [] });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return result;
}

function _drawBarChart(wrap, data, mode) {
  if (!data.length) {
    wrap.innerHTML = '';
    return;
  }

  const contributors = Object.keys(_contributors);
  const contributorColors = {};
  contributors.forEach((name) => {
    contributorColors[name] = (_contributors[name] && _contributors[name].color) || 'var(--text-faint)';
  });

  const barW = 30;
  const gap = 30;
  const step = barW + gap;
  const padL = 36;
  const padR = 12;
  const h = 280;
  const graphH = h - 28;
  const totalW = padL + data.length * step + padR;

  let maxCount = 0;
  for (const d of data) maxCount = Math.max(maxCount, d.count);

  const isFiltered = _selectedGraphKey !== null;

  let svg = `<svg viewBox="0 0 ${totalW} ${h}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">`;

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = graphH - (graphH / gridLines) * i;
    svg += `<line x1="${padL - 4}" y1="${y}" x2="${totalW - padR}" y2="${y}" stroke="var(--border-subtle)" stroke-width="0.5"/>`;
    svg += `<text x="${padL - 8}" y="${y + 3}" fill="var(--text-faint)" font-size="9" text-anchor="end">${Math.round((maxCount / gridLines) * i)}</text>`;
  }

  data.forEach((g, ki) => {
    const x = padL + ki * step;
    const barH = maxCount > 0 ? (g.count / maxCount) * graphH : 0;
    const y = graphH - barH;
    const isActive = g.key === _selectedGraphKey;
    const opacity = isFiltered ? (isActive ? 1.0 : 0.2) : 0.85;
    const stroke = isActive ? 'var(--accent)' : 'none';
    const strokeW = isActive ? 2 : 0;
    const idx = Math.min(ki, 40);
    const common = `class="taf-bar" data-key="${_esc(g.key)}" style="cursor:pointer;--i:${idx}"`;

    if (g.count === 0) {
      svg += `<rect x="${x}" y="${graphH - 2}" width="${barW}" height="2" fill="var(--border-subtle)" rx="1" data-key="${_esc(g.key)}" style="cursor:pointer">
        <title>${_esc(g.key)}: 0 commits</title>
      </rect>`;
    } else if (_selectedContributor) {
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 2)}" fill="${contributorColors[_selectedContributor] || 'var(--accent)'}" rx="2" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeW}" ${common}>
        <title>${_esc(g.key)}: ${g.count} commits</title>
      </rect>`;
    } else if (contributors.length === 1) {
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 2)}" fill="${contributorColors[contributors[0]] || 'var(--accent)'}" rx="2" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeW}" ${common}>
        <title>${_esc(g.key)}: ${g.count} commits</title>
      </rect>`;
    } else {
      const contribCounts = {};
      for (const c of g.commits) {
        if (!contribCounts[c.author]) contribCounts[c.author] = 0;
        contribCounts[c.author]++;
      }
      let yOff = graphH;
      const sorted = Object.entries(contribCounts).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [name, cnt] of sorted) {
        const segH = maxCount > 0 ? (cnt / maxCount) * graphH : 0;
        yOff -= segH;
        const color = contributorColors[name] || 'var(--text-faint)';
        svg += `<rect x="${x}" y="${yOff}" width="${barW}" height="${Math.max(segH, 1)}" fill="${color}" rx="1" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeW}" ${common}>
          <title>${_esc(g.key)} \u2014 ${_esc(name)}: ${cnt} commits</title>
        </rect>`;
      }
    }

    const skip = Math.max(1, Math.floor(data.length / 14));
    if (ki % skip === 0) {
      const label = g.key.slice(5);
      svg += `<text x="${x + barW / 2}" y="${h - 8}" fill="${isActive ? 'var(--accent)' : 'var(--text-muted)'}" font-size="11" text-anchor="middle" font-weight="${isActive ? 700 : 400}">${_esc(label)}</text>`;
    }
  });

  const dateRange = `${data[0].key} \u2013 ${data[data.length - 1].key}`;
  svg += `<text x="${padL}" y="14" fill="var(--accent)" font-size="12" font-weight="600">${_esc(dateRange)}</text>`;

  svg += '</svg>';
  wrap.innerHTML = svg;
}

// ── Commit list ───────────────────────────────────────────────

function _renderCommits() {
  const list = _panel.querySelector('#tafCommitList');
  const countEl = _panel.querySelector('#tafCommitCount');

  if (_profileContributor) {
    list.innerHTML = '';
    countEl.textContent = '';
    return;
  }

  const filtered = _getFilteredCommits();
  const shown = filtered.slice(0, _visibleCount);

  countEl.textContent = `${shown.length} of ${filtered.length} commits`;

  if (!filtered.length) {
    list.innerHTML = '<div class="taf-empty">No commits match your filter</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < shown.length; i++) {
    const c = shown[i];
    const active = _selectedCommit && _selectedCommit.hash === c.hash;
    const color = c.color || (_contributors[c.author] && _contributors[c.author].color) || 'var(--text-faint)';
    html += `<div class="taf-commit-row${active ? ' active' : ''}" data-idx="${i}">
      <span class="taf-commit-dot" style="background:${color}"></span>
      <span class="taf-commit-hash" title="${_esc(c.hash)}">${_shortHash(c.hash)}</span>
      <span class="taf-commit-msg">${_esc(c.message)}</span>
      <span class="taf-commit-author">${_esc(c.author)}</span>
      <span class="taf-commit-date">${c.date ? _timeAgo(c.date) : ''}</span>
      <span class="taf-commit-stats"><span class="taf-stat-add">+${c.linesAdded}</span><span class="taf-stat-del">-${c.linesRemoved}</span></span>
      <button class="taf-commit-view-btn" data-hash="${_esc(c.hash)}">View</button>
    </div>`;
  }
  if (shown.length < filtered.length) {
    html += '<div class="taf-load-more">Scroll for more commits\u2026</div>';
  }
  list.innerHTML = html;

  list.querySelectorAll('.taf-commit-view-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hash = btn.dataset.hash;
      const commit = filtered.find((c) => c.hash === hash);
      if (commit) _openDrawer(commit);
    });
  });

  list.querySelectorAll('.taf-commit-row').forEach((row) => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.dataset.idx, 10);
      const commit = shown[idx];
      if (commit) _openDrawer(commit);
    });
  });
}

function _onScroll() {
  const list = _panel.querySelector('#tafCommitList');
  if (list.scrollTop + list.clientHeight >= list.scrollHeight - 100) {
    const filtered = _getFilteredCommits();
    if (_visibleCount < filtered.length) {
      _visibleCount = Math.min(_visibleCount + 50, filtered.length);
      _renderCommits();
    }
  }
}

function _onFilter() {
  _commitFilterText = _panel.querySelector('#tafCommitFilter').value;
  _visibleCount = 50;
  _renderCommits();
  _renderGraph(false);
}

// ── Commit detail drawer ──────────────────────────────────────

async function _openDrawer(commit) {
  _selectedCommit = commit;
  const repoPath = _repoPath;
  const drawer = _panel.querySelector('#tafDrawer');
  drawer.classList.add('open');

  _panel.querySelector('#tafDrawerHash').textContent = _shortHash(commit.hash);

  const meta = _panel.querySelector('#tafDrawerMeta');
  const dateStr = commit.date ? new Date(commit.date).toLocaleString() : '\u2014';
  meta.innerHTML = `
    <span><strong>${_esc(commit.author)}</strong> &lt;${_esc(commit.email)}&gt;</span>
    <span>${_esc(dateStr)}</span>
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(commit.message)}</span>
  `;

  const filesEl = _panel.querySelector('#tafDrawerFiles');
  const sidebarHeader = _panel.querySelector('#tafSidebarHeader');
  const fileHeader = _panel.querySelector('#tafFileHeader');
  filesEl.innerHTML = '<div class="taf-drawer-note">Loading files\u2026</div>';
  fileHeader.textContent = '';
  _panel.querySelector('#tafDrawerDiff').innerHTML = '';

  let files = commit.files && commit.files.length ? commit.files : [];
  try {
    const result = await window.electronAPI.teamActivityCommitFiles(repoPath, commit.hash);
    if (result.files && result.files.length) {
      files = result.files;
    }
  } catch (err) {
    console.warn('[TeamActivity] Failed to fetch files for', commit.hash, err);
  }

  if (!_selectedCommit || _selectedCommit.hash !== commit.hash || repoPath !== _repoPath) return;

  if (files.length) {
    sidebarHeader.textContent = `Files (${files.length})`;
    let fhtml = '';
    for (const f of files) {
      const statusClass = f.status || 'modified';
      const added = f.added || 0;
      const removed = f.removed || 0;
      fhtml += `<div class="taf-drawer-file" data-file="${_esc(f.path)}">
        <span class="taf-drawer-file-status ${statusClass}">${statusClass}</span>
        <span class="taf-drawer-file-path">${_esc(f.path)}</span>
        <span class="taf-drawer-file-stats">+${added}/-${removed}</span>
      </div>`;
    }
    filesEl.innerHTML = fhtml;

    filesEl.querySelectorAll('.taf-drawer-file').forEach((el) => {
      el.addEventListener('click', () => {
        const filePath = el.dataset.file;
        _loadFileAtCommit(commit.hash, filePath);
        filesEl.querySelectorAll('.taf-drawer-file').forEach((e) => e.classList.remove('active'));
        el.classList.add('active');
      });
    });

    const firstFile = files[0].path;
    const firstEl = filesEl.querySelector('.taf-drawer-file');
    if (firstEl) firstEl.classList.add('active');
    _loadFileAtCommit(commit.hash, firstFile);
  } else {
    sidebarHeader.textContent = 'Files';
    filesEl.innerHTML = '<div class="taf-drawer-note">No file changes</div>';
  }
}

function _closeDrawer() {
  _hideDrawer();
  _renderCommits();
}

async function _loadFileAtCommit(hash, filePath) {
  const el = _panel.querySelector('#tafDrawerDiff');
  const fileHeader = _panel.querySelector('#tafFileHeader');
  el.innerHTML = '<div class="taf-drawer-diff-loading">Loading diff\u2026</div>';

  const repoPath = _repoPath;
  const base = _activeKey + '|' + hash + '::' + filePath;
  const diffKey = 'diff:' + base;
  const rawKey = 'raw:' + base;

  if (_diffCache[diffKey] !== undefined && _diffCache[rawKey] !== undefined) {
    _renderFileHeader(fileHeader, filePath, hash, _diffCache[diffKey], _diffCache[rawKey]);
    _renderDiffContent(el, _diffCache[diffKey]);
    return;
  }

  try {
    const [diffResult, rawResult] = await Promise.all([
      window.electronAPI.teamActivityDiff(repoPath, hash, filePath),
      window.electronAPI.teamActivityFileAtCommit(repoPath, hash, filePath),
    ]);
    if (repoPath !== _repoPath || !_selectedCommit || _selectedCommit.hash !== hash) return;
    const diff = diffResult.diff || '';
    const raw = rawResult.content || '';
    _diffCache[diffKey] = diff;
    _diffCache[rawKey] = raw;
    _renderFileHeader(fileHeader, filePath, hash, diff, raw);
    _renderDiffContent(el, diff);
  } catch (err) {
    el.innerHTML = '<div class="taf-drawer-diff-loading">Failed to load diff</div>';
  }
}

function _renderFileHeader(headerEl, filePath, hash, diffText, rawContent) {
  headerEl.innerHTML = `
    <span style="flex-shrink:0">${_esc(filePath)} at ${_shortHash(hash)}</span>
    <span class="taf-diff-legend">
      <span class="taf-legend-added">+ added</span>
      <span class="taf-legend-removed">- removed</span>
      <span class="taf-legend-hunk">@@ hunk</span>
    </span>
    <span class="taf-header-actions">
      <button class="taf-copy-btn" data-copy="raw">Copy Raw</button>
      <button class="taf-copy-btn" data-copy="content">Copy Content</button>
    </span>`;

  headerEl.querySelectorAll('.taf-copy-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.dataset.copy;
      const text = type === 'raw' ? diffText : rawContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = type === 'raw' ? 'Copy Raw' : 'Copy Content';
        }, 1500);
      }).catch(() => {
        btn.textContent = 'Failed';
      });
    });
  });
}

function _renderDiffContent(el, diffText) {
  if (!diffText) {
    el.innerHTML = '<div class="taf-drawer-diff-loading">No diff available</div>';
    return;
  }

  const lines = diffText.split('\n');
  let html = '';
  for (const line of lines) {
    const ch = line.charAt(0);
    let cls = 'context';
    let sign = ch;
    if (ch === '+') {
      cls = 'added';
      sign = '+';
    } else if (ch === '-') {
      cls = 'removed';
      sign = '-';
    } else if (ch === '@') {
      cls = 'hunk';
      sign = '@';
    } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      cls = 'header';
      sign = '';
    } else if (ch === '\\') {
      cls = 'context';
      sign = '';
    } else {
      sign = ' ';
    }

    if (line.startsWith('---') || line.startsWith('+++')) {
      cls = 'header';
      sign = '';
    }

    html += `<div class="taf-drawer-diff-line ${cls}">
      <span class="taf-diff-sign">${sign}</span>
      <span class="taf-diff-text">${_esc(cls === 'header' || cls === 'hunk' ? line : line.substring(1))}</span>
    </div>`;
  }
  el.innerHTML = html || '<div class="taf-drawer-diff-loading">No diff available</div>';
}