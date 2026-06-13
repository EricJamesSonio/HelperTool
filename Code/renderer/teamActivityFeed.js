let _panel = null;
let _open = false;

let _commits = [];
let _contributors = {};
let _selectedContributor = null;
let _selectedDateRange = null;
let _selectedGraphKey = null;
let _selectedCommit = null;
let _selectedFile = null;
let _graphViewMode = 'day';
let _drillOriginalMode = null;
let _drillKey = null;
let _commitFilterText = '';
let _diffCache = {};
let _visibleCount = 50;
let _profileContributor = null;

const TA_SUMMARY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6"/><rect x="3" y="6" width="14" height="4" rx="1"/><path d="M10 3v7"/><path d="M7 6l3-3 3 3"/></svg>';
const TA_REFRESH = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 0 1 11.7-4.7"/><path d="M17 10a7 7 0 0 1-11.7 4.7"/><path d="M14.5 2v4h-4"/><path d="M5.5 18v-4h4"/></svg>';
const TA_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>';
const TA_CROWN = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M3.5 15.5L1 6l4 2 5-5 5 5 4-2-2.5 9.5H3.5z"/></svg>';

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
  return name.split(' ').map(s => s.charAt(0)).join('').substring(0, 2).toUpperCase();
}

function _shortHash(h) {
  return h ? h.substring(0, 7) : '';
}

function _n(n) {
  return n.toLocaleString();
}

// ── Open / Close ──────────────────────────────────────────────

export function isOpen() {
  return _open;
}

export async function open(repoPath) {
  if (_open) return;
  if (!_panel) _buildPanel();
  _panel.dataset.repoPath = repoPath || '';
  _panel.classList.add('taf-open');
  _open = true;
  await _loadData(repoPath);
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('taf-open');
  _open = false;
  _selectedCommit = null;
  _selectedFile = null;
  _selectedContributor = null;
  _selectedDateRange = null;
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
        <h2>${TA_SUMMARY} Team Activity</h2>
        <div class="taf-header-right">
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

  _panel.querySelectorAll('.taf-graph-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      _panel.querySelectorAll('.taf-graph-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _graphViewMode = btn.dataset.mode;
      _selectedGraphKey = null;
      _drillOriginalMode = null;
      _drillKey = null;
      _profileContributor = null;
      _renderCommits();
      _renderGraph();
    });
  });

  _panel.querySelector('#tafCommitList').addEventListener('scroll', _onScroll);
  document.addEventListener('keydown', _escHandler);
}

function _escHandler(e) {
  if (e.key === 'Escape' && _open) {
    if (_selectedCommit) { _closeDrawer(); return; }
    close();
  }
}

// ── Data loading ──────────────────────────────────────────────

async function _loadData(repoPath, force) {
  if (!force && _commits.length > 0) {
    _renderSummary();
    _renderContributors();
    _renderCommits();
    _renderGraph();
    return;
  }

  const summary = _panel.querySelector('#tafSummary');
  const contributorsList = _panel.querySelector('#tafContributorsList');
  const commitList = _panel.querySelector('#tafCommitList');
  const graph = _panel.querySelector('#tafGraph');

  const cacheKey = 'teamActivity:' + repoPath;
  const { getPrefetchCache } = await import('./app_manager/prefetchManager.js');
  const cached = getPrefetchCache().get(cacheKey);
  if (cached) {
    _commits = cached.commits || [];
    _contributors = cached.contributors || {};
    _diffCache = {};
    _visibleCount = 50;
    _selectedContributor = null;
    _selectedDateRange = null;
    _renderSummary();
    _renderContributors();
    _renderCommits();
    _renderGraph();
    return;
  }

  summary.innerHTML = '<div class="taf-loading">Loading\u2026</div>';
  contributorsList.innerHTML = '';
  commitList.innerHTML = '<div class="taf-loading">Loading commit history\u2026</div>';
  graph.innerHTML = '';

  try {
    const result = await window.electronAPI.teamActivityLog(repoPath);
    if (!result || result.error) {
      summary.innerHTML = '<div class="taf-empty">Error loading data</div>';
      return;
    }
    _commits = result.commits || [];
    _contributors = result.contributors || {};
    _diffCache = {};
    _visibleCount = 50;
    _selectedContributor = null;
    _selectedDateRange = null;

    _renderSummary();
    _renderContributors();
    _renderCommits();
    _renderGraph();

    import('./app_manager/prefetchManager.js').then(mod => {
      mod.getPrefetchCache().set(cacheKey, result, 300000);
    });
  } catch (err) {
    summary.innerHTML = '<div class="taf-empty">Failed to load activity data</div>';
  }
}

async function _onRefresh() {
  const btn = _panel.querySelector('#tafRefreshBtn');
  btn.classList.add('spinning');
  btn.disabled = true;
  try {
    const repo = _panel.dataset.repoPath;
    if (repo) await _loadData(repo, true);
  } finally {
    btn.classList.remove('spinning');
    btn.disabled = false;
  }
}

// ── Summary bar ───────────────────────────────────────────────

function _renderSummary() {
  const el = _panel.querySelector('#tafSummary');
  if (!_commits.length) {
    el.innerHTML = '<div class="taf-empty">No commits found</div>';
    return;
  }

  const total = _commits.length;
  const contribCount = Object.keys(_contributors).length;
  let totalAdded = 0, totalRemoved = 0;
  for (const c of Object.values(_contributors)) {
    totalAdded += c.linesAdded || 0;
    totalRemoved += c.linesRemoved || 0;
  }

  const dates = _commits.map(c => c.date).filter(Boolean).sort();
  const firstDate = dates.length ? new Date(dates[0]).toLocaleDateString() : '—';

  el.innerHTML = `
    <div class="taf-summary-item">
      <span class="taf-summary-value">${_n(total)}</span>
      <span class="taf-summary-label">Commits</span>
    </div>
    <div class="taf-summary-item">
      <span class="taf-summary-value">${_n(contribCount)}</span>
      <span class="taf-summary-label">Contributors</span>
    </div>
    <div class="taf-summary-item">
      <span class="taf-summary-value">+${_n(totalAdded)}</span>
      <span class="taf-summary-label">Added</span>
    </div>
    <div class="taf-summary-item">
      <span class="taf-summary-value">-${_n(totalRemoved)}</span>
      <span class="taf-summary-label">Removed</span>
    </div>
    <div class="taf-summary-item">
      <span class="taf-summary-value" style="font-size:12px">Since ${_esc(firstDate)}</span>
      <span class="taf-summary-label">→ Today</span>
    </div>
  `;
}

// ── Leaderboard ──────────────────────────────────────────────

function _computeScore(data) {
  return data.commits * 10 + data.linesAdded + data.linesRemoved;
}

function _renderLeaderboardItem(name, data, rank, maxScore, isAll, active) {
  const item = _el('div', { className: 'taf-lb-item' + (active ? ' active' : '') });
  if (active) item.dataset.active = '1';

  const rankEl = _el('div', { className: 'taf-lb-rank' });
  if (isAll) {
    const avatar = _el('div', { className: 'taf-lb-all-avatar', style: 'background:var(--accent)' });
    avatar.textContent = 'A';
    rankEl.appendChild(avatar);
  } else if (rank === 0) {
    rankEl.innerHTML = `<span class="taf-lb-crown">${TA_CROWN}</span>`;
  } else {
    rankEl.textContent = `#${rank + 1}`;
  }

  const info = _el('div', { className: 'taf-lb-info' });
  const nameEl = _el('div', { className: 'taf-lb-name' });
  nameEl.textContent = isAll ? 'All' : name;
  const statEl = _el('div', { className: 'taf-lb-stats' });
  if (isAll) {
    statEl.textContent = Object.keys(_contributors).length + ' contributors';
  } else {
    statEl.textContent = `${data.commits} commits · +${_n(data.linesAdded)} / -${_n(data.linesRemoved)}`;
  }
  info.appendChild(nameEl);
  info.appendChild(statEl);

  const barWrap = _el('div', { className: 'taf-lb-bar-wrap' });
  if (!isAll && maxScore > 0) {
    const pct = Math.round((_computeScore(data) / maxScore) * 100);
    const bar = _el('div', { className: 'taf-lb-bar', style: `width:${pct}%;background:${data.color || '#888'}` });
    barWrap.appendChild(bar);
  }

  const scoreEl = _el('div', { className: 'taf-lb-score' });
  if (!isAll) {
    scoreEl.textContent = _computeScore(data) + ' pts';
  }

  item.appendChild(rankEl);
  item.appendChild(info);
  item.appendChild(barWrap);
  item.appendChild(scoreEl);

  if (isAll) {
    item.addEventListener('click', () => { _selectedContributor = null; _profileContributor = null; _renderContributors(); _renderCommits(); _renderGraph(); });
  } else {
    item.addEventListener('click', () => { _selectedContributor = name; _profileContributor = null; _renderContributors(); _renderCommits(); _renderGraph(); });
    item.addEventListener('dblclick', () => { _profileContributor = name; _selectedContributor = name; _renderContributors(); _renderCommits(); _renderGraph(); });
  }
  return item;
}

function _renderContributors() {
  const list = _panel.querySelector('#tafContributorsList');
  list.innerHTML = '';

  const allActive = !_selectedContributor;
  list.appendChild(_renderLeaderboardItem(null, null, 0, 0, true, allActive));

  const ranked = Object.entries(_contributors)
    .map(([name, data]) => ({ name, data, score: _computeScore(data) }))
    .sort((a, b) => b.score - a.score);

  const maxScore = ranked.length > 0 ? ranked[0].score : 0;
  for (let i = 0; i < ranked.length; i++) {
    const active = _selectedContributor === ranked[i].name;
    list.appendChild(_renderLeaderboardItem(ranked[i].name, ranked[i].data, i, maxScore, false, active));
  }
}

// ── Graph ─────────────────────────────────────────────────────

function _getGraphCommits() {
  let commits = _commits;
  if (_selectedContributor) {
    commits = commits.filter(c => c.author === _selectedContributor);
  }
  // In drill-down mode, scope graph to the selected month/week range
  if (_drillOriginalMode && _drillKey) {
    if (_drillOriginalMode === 'month') {
      const monthKey = _drillKey.slice(0, 7);
      commits = commits.filter(c => c.date.startsWith(monthKey));
    } else if (_drillOriginalMode === 'week') {
      const wkStart = new Date(_drillKey.slice(0, 10));
      const wkEnd = new Date(wkStart);
      wkEnd.setDate(wkEnd.getDate() + 7);
      commits = commits.filter(c => {
        const d = new Date(c.date);
        return d >= wkStart && d < wkEnd;
      });
    }
  }
  return commits;
}

function _getFilteredCommits() {
  let filtered = _getGraphCommits();
  // Further filter by the selected bar
  if (_selectedGraphKey) {
    if (_drillOriginalMode) {
      // In drill-down, selected key is a day within the drill range
      if (_drillOriginalMode === 'month') {
        filtered = filtered.filter(c => c.date.startsWith(_selectedGraphKey));
      } else if (_drillOriginalMode === 'week') {
        filtered = filtered.filter(c => c.date.startsWith(_selectedGraphKey));
      }
    } else {
      filtered = filtered.filter(c => _dateToGraphKey(c.date, _graphViewMode) === _selectedGraphKey);
    }
  }
  if (_commitFilterText) {
    const ft = _commitFilterText.toLowerCase();
    filtered = filtered.filter(c =>
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
    // Toggle off
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
  _renderGraph();
}

function _updateGraphToggleButtons() {
  _panel.querySelectorAll('.taf-graph-toggle').forEach(b => {
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
  _panel.querySelectorAll('.taf-contributor').forEach(el => el.classList.remove('active'));
  _renderCommits();
  _renderGraph();
}

function _renderGraph() {
  window.__tafBarClick = _onBarClick;
  const wrap = _panel.querySelector('#tafGraph');
  const mainEl = _panel.querySelector('.taf-main');

  // Show profile view if a contributor is double-clicked
  if (_profileContributor) {
    mainEl.classList.add('in-profile');
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

  _drawBarChart(wrap, data, _graphViewMode);
}

function _renderProfile(wrap) {
  const data = _contributors[_profileContributor];
  if (!data) { wrap.innerHTML = ''; return; }

  // Compute extra stats from commits
  const authorCommits = _commits.filter(c => c.author === _profileContributor);
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
      <div class="taf-profile-avatar" style="background:${data.color || '#888'}">${_initials(_profileContributor)}</div>
      <div class="taf-profile-name">${_esc(_profileContributor)}</div>
      <div class="taf-profile-email">${_esc(data.email)}</div>
      <div class="taf-profile-stats-grid">
        <div class="taf-profile-stat">
          <span class="taf-profile-stat-value">${_n(data.commits)}</span>
          <span class="taf-profile-stat-label">Total Commits</span>
        </div>
        <div class="taf-profile-stat">
          <span class="taf-profile-stat-value" style="color:var(--green, #34d399)">+${_n(data.linesAdded)}</span>
          <span class="taf-profile-stat-label">Lines Added</span>
        </div>
        <div class="taf-profile-stat">
          <span class="taf-profile-stat-value" style="color:var(--red, #f87171)">-${_n(data.linesRemoved)}</span>
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
          <span class="taf-profile-tl-value">${firstDate ? new Date(firstDate).toLocaleDateString() : '—'}</span>
        </div>
        <div class="taf-profile-tl-item">
          <span class="taf-profile-tl-label">Last Commit</span>
          <span class="taf-profile-tl-value">${data.lastCommit ? new Date(data.lastCommit).toLocaleDateString() : '—'}</span>
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

  // Group commits by their time bucket
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

  // Determine date range from the commits themselves
  let minDate = new Date(commits[0].date);
  let maxDate = new Date(commits[0].date);
  for (const c of commits) {
    const d = new Date(c.date);
    if (d < minDate) minDate = d;
    if (d > maxDate) maxDate = d;
  }

  // Build all buckets from minDate to maxDate
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
  if (!data.length) { wrap.innerHTML = ''; return; }

  const contributors = Object.keys(_contributors);
  const contributorColors = {};
  contributors.forEach((name, i) => {
    contributorColors[name] = _contributors[name]?.color || '#888';
  });

  // Fixed bar sizing — same size for all modes, pure horizontal scroll
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

  // Grid lines
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = graphH - (graphH / gridLines) * i;
    svg += `<line x1="${padL - 4}" y1="${y}" x2="${totalW - padR}" y2="${y}" stroke="var(--border-subtle)" stroke-width="0.5"/>`;
    svg += `<text x="${padL - 8}" y="${y + 3}" fill="var(--text-faint)" font-size="9" text-anchor="end">${Math.round((maxCount / gridLines) * i)}</text>`;
  }

  // Bars
  data.forEach((g, ki) => {
    const x = padL + ki * step;
    const barH = maxCount > 0 ? (g.count / maxCount) * graphH : 0;
    const y = graphH - barH;
    const isActive = g.key === _selectedGraphKey;
    const opacity = isFiltered ? (isActive ? 1.0 : 0.2) : 0.85;
    const stroke = isActive ? 'var(--accent)' : 'none';
    const strokeW = isActive ? 2 : 0;
    const cursor = 'pointer';
    const onclick = `try{window.__tafBarClick && window.__tafBarClick('${g.key}')}catch(e){}`;

    if (g.count === 0) {
      // Empty bar — faint marker so you see the gap
      svg += `<rect x="${x}" y="${graphH - 2}" width="${barW}" height="2" fill="var(--border-subtle)" rx="1" style="cursor:${cursor}" onclick="${onclick}">
        <title>${g.key}: 0 commits</title>
      </rect>`;
    } else if (_selectedContributor) {
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 2)}" fill="${contributorColors[_selectedContributor] || 'var(--accent)'}" rx="2" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeW}" style="cursor:${cursor}" onclick="${onclick}">
        <title>${g.key}: ${g.count} commits</title>
      </rect>`;
    } else if (contributors.length === 1) {
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 2)}" fill="${contributorColors[contributors[0]] || 'var(--accent)'}" rx="2" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeW}" style="cursor:${cursor}" onclick="${onclick}">
        <title>${g.key}: ${g.count} commits</title>
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
        const color = contributorColors[name] || '#888';
        const tooltip = `${name}: ${cnt} commits`;
        svg += `<rect x="${x}" y="${yOff}" width="${barW}" height="${Math.max(segH, 1)}" fill="${color}" rx="1" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeW}" style="cursor:${cursor}" onclick="${onclick}">
          <title>${g.key} — ${tooltip}</title>
        </rect>`;
      }
    }

    // X axis label
    const skip = Math.max(1, Math.floor(data.length / 14));
    if (ki % skip === 0) {
      const label = mode === 'month' ? g.key.slice(5) : g.key.slice(5);
      svg += `<text x="${x + barW / 2}" y="${h - 8}" fill="${isActive ? 'var(--accent)' : '#22d3ee'}" font-size="11" text-anchor="middle" font-weight="${isActive ? 700 : 400}">${_esc(label)}</text>`;
    }
  });

  // Y axis label
  const dateRange = `${data[0].key} – ${data[data.length - 1].key}`;
  svg += `<text x="${padL}" y="14" fill="#22d3ee" font-size="12" font-weight="600">${_esc(dateRange)}</text>`;

  svg += '</svg>';
  wrap.innerHTML = svg;
}

// ── Commit list ───────────────────────────────────────────────

function _renderCommits() {
  const list = _panel.querySelector('#tafCommitList');
  const countEl = _panel.querySelector('#tafCommitCount');

  // Hide commit list when viewing a profile
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
    const color = c.color || _contributors[c.author]?.color || '#888';
    html += `<div class="taf-commit-row${active ? ' active' : ''}" data-idx="${i}">
      <span class="taf-commit-dot" style="background:${color}"></span>
      <span class="taf-commit-hash" title="${_esc(c.hash)}">${_shortHash(c.hash)}</span>
      <span class="taf-commit-msg">${_esc(c.message)}</span>
      <span class="taf-commit-author">${_esc(c.author)}</span>
      <span class="taf-commit-date">${c.date ? _timeAgo(c.date) : ''}</span>
      <span class="taf-commit-stats">+${c.linesAdded}/-${c.linesRemoved}</span>
      <button class="taf-commit-view-btn" data-hash="${_esc(c.hash)}">View</button>
    </div>`;
  }
  if (shown.length < filtered.length) {
    html += `<div class="taf-load-more">Scroll for more commits\u2026</div>`;
  }
  list.innerHTML = html;

  // Wire view buttons
  list.querySelectorAll('.taf-commit-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hash = btn.dataset.hash;
      const commit = filtered.find(c => c.hash === hash);
      if (commit) _openDrawer(commit);
    });
  });

  // Wire row click → open drawer
  list.querySelectorAll('.taf-commit-row').forEach(row => {
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
  _renderGraph();
}

// ── Commit detail drawer ──────────────────────────────────────

async function _openDrawer(commit) {
  _selectedCommit = commit;
  _selectedFile = null;
  const drawer = _panel.querySelector('#tafDrawer');
  drawer.classList.add('open');

  _panel.querySelector('#tafDrawerHash').textContent = _shortHash(commit.hash);

  // Meta bar (inline below header)
  const meta = _panel.querySelector('#tafDrawerMeta');
  const dateStr = commit.date ? new Date(commit.date).toLocaleString() : '—';
  meta.innerHTML = `
    <span><strong>${_esc(commit.author)}</strong> &lt;${_esc(commit.email)}&gt;</span>
    <span>${_esc(dateStr)}</span>
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(commit.message)}</span>
  `;

  // Sidebar: fetch files
  const filesEl = _panel.querySelector('#tafDrawerFiles');
  const sidebarHeader = _panel.querySelector('#tafSidebarHeader');
  const fileHeader = _panel.querySelector('#tafFileHeader');
  filesEl.innerHTML = '<div style="font-size:11px;color:var(--text-faint);padding:8px">Loading files\u2026</div>';
  fileHeader.textContent = '';
  _panel.querySelector('#tafDrawerDiff').innerHTML = '';

  const repoPath = _panel.dataset.repoPath;
  let files = commit.files && commit.files.length ? commit.files : [];
  try {
    const result = await window.electronAPI.teamActivityCommitFiles(repoPath, commit.hash);
    if (result.files && result.files.length) {
      files = result.files;
    }
  } catch (err) {
    console.warn('[TeamActivity] Failed to fetch files for', commit.hash, err);
  }

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

    filesEl.querySelectorAll('.taf-drawer-file').forEach(el => {
      el.addEventListener('click', () => {
        const filePath = el.dataset.file;
        _loadFileAtCommit(commit.hash, filePath);
        filesEl.querySelectorAll('.taf-drawer-file').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
      });
    });

    // Auto-select first file
    const firstFile = files[0].path;
    const firstEl = filesEl.querySelector('.taf-drawer-file');
    if (firstEl) firstEl.classList.add('active');
    _loadFileAtCommit(commit.hash, firstFile);
  } else {
    sidebarHeader.textContent = 'Files';
    filesEl.innerHTML = '<div style="font-size:11px;color:var(--text-faint);padding:8px">No file changes</div>';
  }
}

function _closeDrawer() {
  _selectedCommit = null;
  _selectedFile = null;
  _panel.querySelector('#tafDrawer').classList.remove('open');
  _panel.querySelector('#tafDrawerDiff').innerHTML = '';
  _panel.querySelector('#tafDrawerFiles').innerHTML = '';
  _panel.querySelector('#tafFileHeader').textContent = '';
  _renderCommits();
}

async function _loadFileAtCommit(hash, filePath) {
  const el = _panel.querySelector('#tafDrawerDiff');
  const fileHeader = _panel.querySelector('#tafFileHeader');
  el.innerHTML = '<div class="taf-drawer-diff-loading">Loading diff\u2026</div>';

  const diffKey = 'diff:' + hash + '::' + filePath;
  const rawKey  = 'raw:' + hash + '::' + filePath;

  if (_diffCache[diffKey] && _diffCache[rawKey]) {
    _renderFileHeader(fileHeader, filePath, hash, _diffCache[diffKey], _diffCache[rawKey]);
    _renderDiffContent(el, _diffCache[diffKey]);
    return;
  }

  try {
    const repoPath = _panel.dataset.repoPath;
    const [diffResult, rawResult] = await Promise.all([
      window.electronAPI.teamActivityDiff(repoPath, hash, filePath),
      window.electronAPI.teamActivityFileAtCommit(repoPath, hash, filePath),
    ]);
    const diff = diffResult.diff || '';
    const raw = rawResult.content || '';
    _diffCache[diffKey] = diff;
    _diffCache[rawKey] = raw;
    _renderFileHeader(fileHeader, filePath, hash, diff, raw);
    _renderDiffContent(el, diff);
  } catch {
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

  headerEl.querySelectorAll('.taf-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.dataset.copy;
      const text = type === 'raw' ? diffText : rawContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = type === 'raw' ? 'Copy Raw' : 'Copy Content'; }, 1500);
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
    if (ch === '+') { cls = 'added'; sign = '+'; }
    else if (ch === '-') { cls = 'removed'; sign = '-'; }
    else if (ch === '@') { cls = 'hunk'; sign = '@'; }
    else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) { cls = 'header'; sign = ''; }
    else if (ch === '\\') { cls = 'context'; sign = ''; }
    else { sign = ' '; }

    html += `<div class="taf-drawer-diff-line ${cls}">
      <span class="taf-diff-sign">${sign}</span>
      <span class="taf-diff-text">${_esc(cls === 'header' || cls === 'hunk' ? line : line.substring(1))}</span>
    </div>`;
  }
  el.innerHTML = html || '<div class="taf-drawer-diff-loading">No diff available</div>';
}
