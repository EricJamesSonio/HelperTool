let _panel = null;
let _open = false;
let _profile = null;
let _avatarDataUrl = null;
let _lastLoadTime = 0;
let _heatmapYear = new Date().getFullYear();
let _statsRange = 'all';
let _donutRange = 'all';
let _historyPage = 1;
let _historyRepo = '';
let _dayDetail = null;
let _editingProfile = false;

// Repositories section state
let _viewSection = 'main'; // 'main' | 'repos'
let _repos = [];
let _reposFilter = 'all';
let _reposSort = 'date';
let _reposLoading = false;
let _reposToken = '';
let _reposCommitCounts = {};
let _reposCountsLoading = false;
let _reposError = '';
let _reposLoadedFromCache = false;
let _reposPage = 1;

const _REPOS_PER_PAGE = 20;
const _REPOS_CACHE_KEY = 'profile.githubRepos';
const _REPOS_COMMITS_CACHE_KEY = 'profile.githubReposCommits';
const _REPOS_CACHE_TS_KEY = 'profile.githubReposFetchedAt';
const _REPOS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const PROFILE_COLORS = ['#4F8EF7', '#34d399', '#f472b6', '#fb923c', '#a78bfa', '#fbbf24'];

const HEATMAP_COLORS = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];

// data cache with TTL and stale-while-revalidate
let _cache = {};

function _cached(key, fetcher, ttlMs) {
  const entry = _cache[key];
  const now = Date.now();
  if (entry !== undefined) {
    if (now - entry.fetchedAt < entry.ttl) {
      return entry.data;
    }
    // stale-while-revalidate: fetch fresh in bg, return stale for this caller
    const stale = entry.data;
    _cache[key] = { data: fetcher().catch(() => null), fetchedAt: now, ttl: ttlMs || 30000 };
    return stale;
  }
  const promise = fetcher().catch(() => null);
  _cache[key] = { data: promise, fetchedAt: now, ttl: ttlMs || 30000 };
  return promise;
}

function _clearCache() {
  _cache = {};
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

export function isOpen() { return _open; }

export function open() {
  if (_open) return;
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
  _open = true;
  _viewSection = 'main';
  _load();
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('open');
  _open = false;
  _dayDetail = null;
  _editingProfile = false;
  _viewSection = 'main';
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
        <div class="pf-loading">Loading\u2026</div>
      </div>
      <input type="file" accept="image/*" id="pfAvatarInput" hidden>
    </div>
  `;
  document.body.appendChild(_panel);
  _panel.querySelector('#pfCloseBtn').addEventListener('click', close);
  _panel.querySelector('#pfRefreshBtn').addEventListener('click', () => { _clearCache(); _load(); });
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
  document.addEventListener('keydown', _escHandler);
}

async function _escHandler(e) {
  if (e.key === 'Escape' && _open) {
    if (_dayDetail) { _dayDetail = null; _renderBody('full'); return; }
    if (_editingProfile) { _editingProfile = false; _renderBody('card'); return; }
    if (_viewSection === 'repos') { _switchToMain(); return; }
    close();
  }
}

async function _load() {
  _viewSection = 'main';
  const body = _panel.querySelector('#pfBody');
  const now = Date.now();
  if (!_lastLoadTime || now - _lastLoadTime > 60000) _cache = {};
  _lastLoadTime = now;

  body.innerHTML = _buildSkeleton();
  _bodyEls = {};
  body.querySelectorAll('.pf-section').forEach((el) => {
    _bodyEls[el.dataset.section] = el;
  });
  _wireReposNav();

  const api = window.electronAPI.profile;
  const [all, av] = await Promise.all([
    api.getAll({
      statsRange: _statsRange,
      heatmapYear: _heatmapYear,
      donutRange: _donutRange,
      historyPage: _historyPage,
      historyRepo: _historyRepo,
    }).catch(() => null),
    _avatarDataUrl
      ? Promise.resolve({ dataUrl: _avatarDataUrl })
      : api.getAvatar().catch(() => ({ dataUrl: null })),
  ]);
  if (!_open || !all || _dayDetail) return;

  if (all.profile) _profile = all.profile;
  _avatarDataUrl = (av && av.dataUrl) || _avatarDataUrl;

  const t = Date.now();
  _cache['stats:' + _statsRange] = { data: Promise.resolve(all.stats), fetchedAt: t, ttl: 30000 };
  _cache['heatmap:' + _heatmapYear] = { data: Promise.resolve(all.heatmap), fetchedAt: t, ttl: 60000 };
  _cache['donuts:' + _donutRange] = { data: Promise.resolve(all.donuts), fetchedAt: t, ttl: 30000 };
  _cache['history:' + _historyPage + ':' + _historyRepo] = { data: Promise.resolve(all.history), fetchedAt: t, ttl: 10000 };

  _swap('card', async () => _renderProfileCard());
  _swap('stats', _renderStatsBar);
  _swap('heatmap', _renderHeatmap);
  _swap('donuts', _renderDonuts);
  _swap('history', _renderHistory);
  _swap('dash', _renderDashboard);
}

function _wireReposNav() {
  const btn = _panel?.querySelector('#pfReposNavBtn');
  if (btn) {
    btn.addEventListener('click', () => _switchToRepos());
  }
}

function _switchToRepos() {
  _viewSection = 'repos';
  const body = _panel.querySelector('#pfBody');
  let reposSection = body.querySelector('.pf-body-repos-full');

  if (!reposSection) {
    body.insertAdjacentHTML('beforeend', _buildReposSkeleton());
    reposSection = body.querySelector('.pf-body-repos-full');
    _renderRepos();
  }

  // Hide sidebar + main, show repos
  body.querySelector('.pf-body-sidebar')?.classList.add('pf-hidden');
  body.querySelector('.pf-body-main')?.classList.add('pf-hidden');
  reposSection?.classList.remove('pf-hidden');
}

function _switchToMain() {
  _viewSection = 'main';
  const body = _panel.querySelector('#pfBody');
  body.querySelector('.pf-body-sidebar')?.classList.remove('pf-hidden');
  body.querySelector('.pf-body-main')?.classList.remove('pf-hidden');
  body.querySelector('.pf-body-repos-full')?.classList.add('pf-hidden');
}

function _buildReposSkeleton() {
  const token = _reposToken || localStorage.getItem('profile.githubToken') || '';
  const hasCache = !!localStorage.getItem(_REPOS_CACHE_KEY);
  return `
    <div class="pf-body-repos-full">
      <div class="pf-repos-header">
        <button class="pf-btn" id="pfReposBackBtn">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M12 5l-5 5 5 5"/></svg>
          Back
        </button>
        <h2 class="pf-repos-title">Repositories</h2>
        <button class="pf-btn" id="pfReposSyncBtn" title="Force re-fetch from GitHub">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M1 4v6h6"/><path d="M19 16v-6h-6"/><path d="M17.65 6.35A8 8 0 0 0 3.3 9.7M2.35 13.65A8 8 0 0 0 16.7 10.3"/></svg>
          Resync
        </button>
        <div class="pf-repos-token-area">
          <input type="password" class="pf-repos-token-input" id="pfReposToken" placeholder="GitHub Personal Access Token" value="${_esc(token)}">
          <button class="pf-btn primary" id="pfReposLoadBtn">Load</button>
        </div>
      </div>
      <div class="pf-repos-body">
        <div class="pf-repos-loading">${hasCache ? 'Loading cached repositories\u2026' : 'Enter a GitHub token to list your repositories'}</div>
      </div>
    </div>
  `;
}

async function _renderRepos() {
  const body = _panel.querySelector('#pfBody');
  const reposBody = body.querySelector('.pf-repos-body');
  if (!reposBody) return;

  _reposToken = localStorage.getItem('profile.githubToken') || '';

  body.querySelector('#pfReposBackBtn')?.addEventListener('click', _switchToMain);
  const loadBtn = body.querySelector('#pfReposLoadBtn');
  const syncBtn = body.querySelector('#pfReposSyncBtn');
  const tokenInput = body.querySelector('#pfReposToken');

  syncBtn?.addEventListener('click', () => {
    _clearReposCache();
    _fetchAndRenderRepos();
  });

  loadBtn?.addEventListener('click', () => _fetchAndRenderRepos());
  tokenInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _fetchAndRenderRepos();
  });
  tokenInput?.addEventListener('input', () => {
    _reposToken = tokenInput.value;
  });

  // Try loading from cache first
  if (_reposToken && _loadReposFromCache()) {
    return;
  }

  if (_reposToken) {
    await _fetchAndRenderRepos();
  }
}

function _saveReposCache() {
  try {
    localStorage.setItem(_REPOS_CACHE_KEY, JSON.stringify(_repos));
    localStorage.setItem(_REPOS_COMMITS_CACHE_KEY, JSON.stringify(_reposCommitCounts));
    localStorage.setItem(_REPOS_CACHE_TS_KEY, String(Date.now()));
  } catch (_) {}
}

function _loadReposFromCache() {
  try {
    const raw = localStorage.getItem(_REPOS_CACHE_KEY);
    const ts = parseInt(localStorage.getItem(_REPOS_CACHE_TS_KEY) || '0', 10);
    if (!raw) return false;
    _repos = JSON.parse(raw);
    const commitsRaw = localStorage.getItem(_REPOS_COMMITS_CACHE_KEY);
    _reposCommitCounts = commitsRaw ? JSON.parse(commitsRaw) : {};
    _reposLoading = false;
    _reposCountsLoading = false;
    _reposError = '';
    _reposLoadedFromCache = true;
    _renderReposContent();
    return true;
  } catch (_) {
    return false;
  }
}

function _clearReposCache() {
  try {
    localStorage.removeItem(_REPOS_CACHE_KEY);
    localStorage.removeItem(_REPOS_COMMITS_CACHE_KEY);
    localStorage.removeItem(_REPOS_CACHE_TS_KEY);
  } catch (_) {}
  _repos = [];
  _reposCommitCounts = {};
  _reposLoadedFromCache = false;
}

async function _fetchAndRenderRepos() {
  const token = _reposToken.trim();
  if (!token) return;

  localStorage.setItem('profile.githubToken', token);

  _repos = [];
  _reposCommitCounts = {};
  _reposCountsLoading = false;
  _reposError = '';
  _reposLoading = true;

  _renderReposContent();

  try {
    const result = await window.electronAPI.github.listRepos({
      token,
      type: _reposFilter,
      sort: _reposSort,
    });

    if (!result.success) {
      _reposError = result.error || 'Failed to load repositories';
      _reposLoading = false;
      _renderReposContent();
      return;
    }

    _repos = result.repos || [];
    _reposLoading = false;
    _reposPage = 1;
    _saveReposCache();
    _renderReposContent();

    // If sorting by commits, batch-fetch commit counts
    if (_reposSort === 'commits' && _repos.length > 0) {
      _reposCountsLoading = true;
      _renderReposContent();

      const repoEntries = _repos.map(r => {
        const parts = r.fullName.split('/');
        return { owner: parts[0], name: parts[1] };
      });

      const countsResult = await window.electronAPI.github.getCommitCounts({ token, repos: repoEntries });
      if (countsResult.success) {
        _reposCommitCounts = countsResult.counts || {};
      }
      _reposCountsLoading = false;
      _saveReposCache();
      _renderReposContent();
    }
  } catch (err) {
    _reposError = err.message || 'Network error';
    _reposLoading = false;
    _renderReposContent();
  }
}

function _renderReposContent() {
  const body = _panel.querySelector('#pfBody');
  const reposBody = body?.querySelector('.pf-repos-body');
  if (!reposBody) return;

  const filterChips = [
    { id: 'all', label: 'All' },
    { id: 'public', label: 'Public' },
    { id: 'private', label: 'Private' },
  ];

  const sortOptions = [
    { id: 'date', label: 'Last Updated' },
    { id: 'commits', label: 'Most Commits' },
  ];

  let reposHtml = '';
  let totalFiltered = 0;
  let totalPages = 0;

  if (_reposLoading) {
    reposHtml = '<div class="pf-repos-loading"><div class="pf-spinner"></div> Loading repositories\u2026</div>';
  } else if (_reposError) {
    reposHtml = `<div class="pf-repos-error">${_esc(_reposError)}</div>`;
  } else if (_repos.length === 0) {
    reposHtml = '<div class="pf-repos-empty">No repositories found</div>';
  } else {
    let filtered = _repos;
    if (_reposFilter === 'public') filtered = filtered.filter(r => !r.private);
    else if (_reposFilter === 'private') filtered = filtered.filter(r => r.private);

    const sorted = [...filtered];
    if (_reposSort === 'date') {
      sorted.sort((a, b) => new Date(b.pushedAt || b.updatedAt) - new Date(a.pushedAt || a.updatedAt));
    } else if (_reposSort === 'commits') {
      sorted.sort((a, b) => {
        const ca = _reposCommitCounts[a.fullName] || 0;
        const cb = _reposCommitCounts[b.fullName] || 0;
        return cb - ca;
      });
    }

    totalFiltered = sorted.length;
    totalPages = Math.max(1, Math.ceil(totalFiltered / _REPOS_PER_PAGE));
    if (_reposPage > totalPages) _reposPage = totalPages;

    const start = (_reposPage - 1) * _REPOS_PER_PAGE;
    const pageItems = sorted.slice(start, start + _REPOS_PER_PAGE);

    reposHtml = `<div class="pf-repos-list">${pageItems.map(r => _buildRepoCard(r)).join('')}</div>`;
  }

  const pagesHtml = totalPages > 1 ? _buildReposPages(totalPages) : '';

  reposBody.innerHTML = `
    <div class="pf-repos-toolbar">
      <div class="pf-repos-filters">
        ${filterChips.map(f => `<button class="pf-repos-filter-chip${_reposFilter === f.id ? ' active' : ''}" data-filter="${f.id}">${f.label}</button>`).join('')}
      </div>
      <div class="pf-repos-sort-group">
        <span class="pf-repos-sort-label">Sort:</span>
        <select class="pf-repos-sort-select" id="pfReposSortSelect">
          ${sortOptions.map(s => `<option value="${s.id}"${_reposSort === s.id ? ' selected' : ''}>${s.label}</option>`).join('')}
        </select>
        ${_reposCountsLoading ? '<span class="pf-repos-counts-loading">Loading counts\u2026</span>' : ''}
        <span class="pf-repos-count">${totalFiltered} repo${totalFiltered !== 1 ? 's' : ''}</span>
      </div>
    </div>
    ${reposHtml}
    ${pagesHtml ? `<div class="pf-repos-pages">${pagesHtml}</div>` : ''}
  `;

  // Wire filter chips
  reposBody.querySelectorAll('.pf-repos-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      _reposFilter = chip.dataset.filter;
      _reposPage = 1;
      _renderReposContent();
    });
  });

  // Wire sort select
  const sortSelect = reposBody.querySelector('#pfReposSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      const newSort = sortSelect.value;
      if (newSort === _reposSort) return;
      _reposSort = newSort;
      _reposPage = 1;
      if (_reposSort === 'commits' && Object.keys(_reposCommitCounts).length === 0) {
        _fetchAndRenderRepos();
      } else {
        _renderReposContent();
      }
    });
  }

  // Wire visit buttons
  reposBody.querySelectorAll('.pf-repo-visit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      if (url && window.electronAPI?.github?.openUrl) {
        window.electronAPI.github.openUrl(url).catch(() => window.open(url, '_blank'));
      } else if (url) {
        window.open(url, '_blank');
      }
    });
  });

  // Wire page buttons
  reposBody.querySelectorAll('.pf-repo-page-btn, .pf-repo-page-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const target = btn.dataset.page;
      if (target === 'prev' && _reposPage > 1) { _reposPage--; _renderReposContent(); }
      else if (target === 'next') { _reposPage++; _renderReposContent(); }
      else if (target) { _reposPage = parseInt(target); _renderReposContent(); }
    });
  });
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

function _buildRepoCard(r) {
  const visibility = r.private ? 'Private' : 'Public';
  const visClass = r.private ? 'pf-repo-vis-private' : 'pf-repo-vis-public';
  const commitCount = _reposCommitCounts[r.fullName];
  const commitHtml = commitCount !== undefined
    ? `<span class="pf-repo-meta-item" title="Commits">${commitCount.toLocaleString()} commits</span>`
    : '';
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
          <span class="pf-repo-visibility ${visClass}">${visibility}</span>
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
        ${commitHtml}
        <span class="pf-repo-meta-item">Updated ${_timeAgo(r.pushedAt || r.updatedAt)}</span>
      </div>
    </div>
  `;
}

function _langColor(lang) {
  const colors = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
    Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
    C: '#555555', Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138',
    Kotlin: '#A97BFF', Dart: '#00B4AB', Shell: '#89e051', HTML: '#e34c26',
    CSS: '#563d7c', Vue: '#41b883', 'C#': '#178600',
  };
  return colors[lang] || '#6b7280';
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


let _bodyEls = {};

function _buildSkeleton() {
  return `
    <div class="pf-body-sidebar">
      <div class="pf-section" data-section="card">
        <div class="pf-card-vertical pf-skel"><div class="pf-skel-avatar pf-skel-avatar-lg" style="margin:0 auto 8px"></div><div class="pf-skel-line" style="width:50%;margin:0 auto"></div><div class="pf-skel-line" style="width:70%;margin:6px auto 0"></div></div>
      </div>
    </div>
    <div class="pf-body-main">
      <div class="pf-section" data-section="repos-nav">
        <button class="pf-repos-nav-btn" id="pfReposNavBtn">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M2 3h5l2 2h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>
          Repositories
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;margin-left:auto"><path d="M8 5l5 5-5 5"/></svg>
        </button>
      </div>
      <div class="pf-section" data-section="stats">
        <div class="pf-stats-bar pf-skel"><div class="pf-stat-item"><div class="pf-skel-line" style="width:60%;height:24px;margin:0 auto"></div></div><div class="pf-stat-item"><div class="pf-skel-line" style="width:60%;height:24px;margin:0 auto"></div></div><div class="pf-stat-item"><div class="pf-skel-line" style="width:60%;height:24px;margin:0 auto"></div></div><div class="pf-stat-item"><div class="pf-skel-line" style="width:60%;height:24px;margin:0 auto"></div></div></div>
      </div>
      <div class="pf-section" data-section="dash">
        <div class="pf-dash-head"><span class="pf-section-title">Workspace</span><span class="pf-dash-sub">Scanning repositories\u2026</span></div>
        <div class="pf-skel-line" style="width:100%;height:200px"></div>
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
    </div>`;
}

async function _renderBody(change) {
  if (_dayDetail) { _renderDayDetail(); return; }
  const body = _panel.querySelector('#pfBody');
  if (!body.firstChild || change === 'full') {
    await _load();
    return;
  }
  if (change === 'card') {
    const newCard = _renderProfileCard();
    if (_bodyEls.card) _bodyEls.card.replaceWith(newCard);
    _bodyEls.card = newCard;
    return;
  }
  const renderers = {
    stats: _renderStatsBar,
    heatmap: _renderHeatmap,
    donuts: _renderDonuts,
    history: _renderHistory,
    dash: _renderDashboard,
  };
  const render = renderers[change];
  if (!render) return;
  const focusId = document.activeElement ? document.activeElement.id : '';
  const newEl = await render();
  if (_bodyEls[change]) _bodyEls[change].replaceWith(newEl);
  _bodyEls[change] = newEl;
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

function _renderProfileCard() {
  if (!_profile) _profile = {};
  const section = _el('div', { className: 'pf-section' });
  if (_editingProfile) {
    section.innerHTML = `
      <div class="pf-card pf-card-vertical">
        <div class="pf-edit-form">
          <div class="pf-edit-field"><label>Name</label><input class="pf-edit-input" id="pfEditName" value="${_esc(_profile.name || '')}"></div>
          <div class="pf-edit-field"><label>Email</label><input class="pf-edit-input" id="pfEditEmail" value="${_esc(_profile.email || '')}"></div>
          <div class="pf-edit-field"><label>Bio</label><textarea class="pf-edit-textarea" id="pfEditBio" rows="3">${_esc(_profile.bio || '')}</textarea></div>
          <div class="pf-edit-field"><label>Website</label><input class="pf-edit-input" id="pfEditWeb" value="${_esc(_profile.website || '')}"></div>
          <div class="pf-edit-field"><label>Avatar Color</label><div class="pf-color-picker" id="pfColorPicker">${PROFILE_COLORS.map(c => `<button class="pf-color-swatch${c === _profile.avatarColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div></div>
          <div class="pf-edit-field"><label>Facebook URL</label><input class="pf-edit-input" id="pfEditFb" value="${_esc(_profile.facebook || '')}"></div>
          <div class="pf-edit-field"><label>TikTok URL</label><input class="pf-edit-input" id="pfEditTt" value="${_esc(_profile.tiktok || '')}"></div>
          <div class="pf-edit-field"><label>LinkedIn URL</label><input class="pf-edit-input" id="pfEditLi" value="${_esc(_profile.linkedin || '')}"></div>
          <div class="pf-edit-field"><label>WakaTime URL</label><input class="pf-edit-input" id="pfEditWk" value="${_esc(_profile.wakatime || '')}"></div>
          <div class="pf-edit-actions"><button class="pf-btn primary" id="pfSaveProfile">Save</button><button class="pf-btn" id="pfCancelEdit">Cancel</button></div>
        </div>
      </div>
    `;
    section.querySelector('#pfColorPicker').addEventListener('click', (e) => {
      const btn = e.target.closest('.pf-color-swatch');
      if (!btn) return;
      section.querySelectorAll('.pf-color-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    section.querySelector('#pfSaveProfile').addEventListener('click', async () => {
      const colorBtn = section.querySelector('.pf-color-swatch.active');
      await window.electronAPI.profile.update({
        name: section.querySelector('#pfEditName').value,
        email: section.querySelector('#pfEditEmail').value,
        bio: section.querySelector('#pfEditBio').value,
        website: section.querySelector('#pfEditWeb').value,
        avatarColor: colorBtn ? colorBtn.dataset.color : '#4F8EF7',
        facebook: section.querySelector('#pfEditFb').value,
        tiktok: section.querySelector('#pfEditTt').value,
        linkedin: section.querySelector('#pfEditLi').value,
        wakatime: section.querySelector('#pfEditWk').value,
      });
      const { getPrefetchCache } = await import('./app_manager/prefetchManager.js');
      getPrefetchCache().invalidate('profile');
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
  const avatarContent = _avatarDataUrl
    ? `<img src="${_esc(_avatarDataUrl)}" alt="">`
    : _initials(_profile.name);
  section.innerHTML = `
    <div class="pf-card pf-card-vertical">
      <div class="pf-card-avatar-wrap">
        <div class="pf-avatar" style="background:${c};color:#fff">${avatarContent}</div>
        <div class="pf-avatar-overlay">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </div>
      </div>
      <div class="pf-card-name">${_esc(_profile.name || _profile.email || 'Unnamed')}</div>
      <div class="pf-card-email">${_profile.name ? _esc(_profile.email || '') : ''}</div>
      ${_profile.bio ? `<div class="pf-card-bio">${_esc(_profile.bio)}</div>` : ''}
      ${_profile.website ? `<a class="pf-card-website" href="${_esc(_profile.website)}" target="_blank" rel="noopener"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v8M6 10h8"/></svg>${_esc(_profile.website)}</a>` : ''}
      ${hasSocial ? `<div class="pf-socials">${_socialLink('facebook', _profile.facebook)}${_socialLink('tiktok', _profile.tiktok)}${_socialLink('linkedin', _profile.linkedin)}${_socialLink('wakatime', _profile.wakatime)}</div>` : ''}
      <button class="pf-btn primary pf-card-edit-btn" id="pfEditBtn">Edit Profile</button>
    </div>
  `;
  section.querySelector('#pfEditBtn').addEventListener('click', () => { _editingProfile = true; _renderBody('card'); });
  section.querySelector('.pf-card-avatar-wrap').addEventListener('click', () => {
    const input = _panel.querySelector('#pfAvatarInput');
    input.value = '';
    input.click();
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
  const stats = (await _cached('stats:' + _statsRange, () => window.electronAPI.profile.getStats(_statsRange), 30000)) || {};
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
      delete _cache['stats:' + _statsRange];
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
    delete _cache['heatmap:' + _heatmapYear];
    _renderBody('heatmap');
  });
  section.querySelector('#pfHeatNext').addEventListener('click', () => {
    if (_heatmapYear >= thisYear) return;
    _heatmapYear++;
    delete _cache['heatmap:' + _heatmapYear];
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
  const data = (await _cached('donuts:' + _donutRange, () => window.electronAPI.profile.getDonutData(_donutRange), 30000)) || { repo: [], ext: [], weekday: [] };

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
      delete _cache['donuts:' + _donutRange];
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
      delete _cache['history:' + _historyPage + ':' + _historyRepo];
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
        delete _cache['history:1:' + _historyRepo];
        _renderBody('history');
      }, 300);
    });
  }
}

let _lastHistoryTotal = 0;

async function _renderHistory() {
  const section = _el('div', { className: 'pf-section' });
  const cacheKey = 'history:' + _historyPage + ':' + _historyRepo;
  const result = (await _cached(cacheKey, () => window.electronAPI.profile.getHistory(_historyPage, _historyRepo), 10000)) || { items: [], total: 0, page: 1, pageSize: 20 };
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

// Listen for data changes from main process (commit/push events)
if (window.electronAPI?.profile?.onDataChanged) {
  window.electronAPI.profile.onDataChanged(() => {
    import('./app_manager/prefetchManager.js').then(mod => {
      mod.getPrefetchCache().invalidate('profile');
    });
    _cache = {};
    if (_open) {
      _load();
    }
  });
}
let _dashRange = 'week';
let _dashFilter = 'all';
let _dashSort = 'recent';

function _localDate(d) {
  const x = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
}

function _swap(key, render) {
  Promise.resolve(render()).then((el) => {
    if (!_open || !el) return;
    const old = _bodyEls[key];
    if (old && old.isConnected) old.replaceWith(el);
    _bodyEls[key] = el;
  }).catch(() => {});
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

  if (!ov || !ov.repos) {
    section.innerHTML = '<div class="pf-dash-head"><span class="pf-section-title">Workspace</span>' + rangeTabs + '</div><div class="pf-empty">Could not read your repositories</div>';
    section.querySelectorAll('[data-dash-range]').forEach((b) => b.addEventListener('click', () => {
      _dashRange = b.dataset.dashRange;
      _renderBody('dash');
    }));
    return section;
  }

  const repos = ov.repos.filter((r) => r.exists && r.isGit);
  const skipped = ov.repos.length - repos.length;
  const hasHours = !!(hrs && hrs.success);
  const hours = new Map();
  if (hasHours) for (const p of hrs.projects) hours.set(String(p.name).toLowerCase(), p.seconds);

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
    card(hasHours ? _fmtHours(hrs.seconds) : '\u2014', 'Hours (' + (_dashRange === 'month' ? '30d' : '7d') + ')', false) +
  '</div>';

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
  const rowsHtml = shown.length
    ? shown.map((r) => _dashRowHtml(r, hours, hasHours)).join('')
    : '<tr><td colspan="9" class="pf-dash-mute" style="text-align:center;padding:24px">Nothing needs attention</td></tr>';

  const hoursItems = hasHours && hrs.projects.length
    ? _topWithOther(hrs.projects.map((p) => ({ label: p.name, value: p.seconds })), 6)
    : [];
  const hoursCard = hoursItems.length
    ? _buildDonutHTML('Hours by Project', hoursItems, _fmtHours)
    : '<div class="pf-donut-wrap"><div class="pf-donut-title">Hours by Project</div><div class="pf-donut-empty">' + _esc(hrs && hrs.error ? hrs.error : 'Connect WakaTime to see hours') + '</div></div>';

  section.innerHTML =
    '<div class="pf-dash-head"><span class="pf-section-title">Workspace</span>' + filters + rangeTabs + '</div>' +
    cards +
    '<div class="pf-dash-tablewrap"><table class="pf-dash-table"><thead><tr>' + head + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
    (skipped > 0 ? '<div class="pf-dash-sub">' + skipped + ' tracked folder' + (skipped === 1 ? '' : 's') + ' skipped (missing or not a git repository)</div>' : '') +
    '<div class="pf-dash-charts">' + _commitsChartHtml(ov.daily) + hoursCard + '</div>';

  section.querySelectorAll('[data-dash-range]').forEach((b) => b.addEventListener('click', () => {
    _dashRange = b.dataset.dashRange;
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
  return section;
}
