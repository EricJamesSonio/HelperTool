let _panel = null;
let _open = false;
let _profile = null;
let _heatmapYear = new Date().getFullYear();
let _statsRange = 'all';
let _donutRange = 'all';
let _historyPage = 1;
let _historyRepo = '';
let _dayDetail = null;
let _editingProfile = false;

const PROFILE_COLORS = ['#4F8EF7', '#34d399', '#f472b6', '#fb923c', '#a78bfa', '#fbbf24'];

const HEATMAP_COLORS = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];

// data cache to avoid re-fetching unchanged data
let _cache = {};

function _cached(key, fetcher) {
  if (_cache[key] !== undefined) return _cache[key];
  _cache[key] = fetcher();
  return _cache[key];
}

function _clearCache() { _cache = {}; }

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
  _load();
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('open');
  _open = false;
  _dayDetail = null;
  _editingProfile = false;
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
    </div>
  `;
  document.body.appendChild(_panel);
  _panel.querySelector('#pfCloseBtn').addEventListener('click', close);
  _panel.querySelector('#pfRefreshBtn').addEventListener('click', () => { _clearCache(); _load(); });
  document.addEventListener('keydown', _escHandler);
}

async function _escHandler(e) {
  if (e.key === 'Escape' && _open) {
    if (_dayDetail) { _dayDetail = null; _renderBody('full'); return; }
    if (_editingProfile) { _editingProfile = false; _renderBody('card'); return; }
    close();
  }
}

async function _load() {
  const body = _panel.querySelector('#pfBody');
  body.innerHTML = _buildSkeleton();
  _bodyEls = {};
  _cache = {};
  body.querySelectorAll('.pf-section').forEach(el => {
    _bodyEls[el.dataset.section] = el;
  });

  // Fetch profile in background
  window.electronAPI.profile.get().then(p => {
    if (p) _profile = p;
    const newCard = _renderProfileCard();
    if (_bodyEls.card) { _bodyEls.card.replaceWith(newCard); _bodyEls.card = newCard; }
  }).catch(() => {});

  // Start watcher in background (fire-and-forget)
  window.electronAPI.profile.initWatcher().catch(() => {});

  // Fire all 4 data sections in parallel — each populates independently
  Promise.all([
    _renderStatsBar().then(el => { if (_bodyEls.stats) { _bodyEls.stats.replaceWith(el); _bodyEls.stats = el; } }).catch(() => {}),
    _renderHeatmap().then(el => { if (_bodyEls.heatmap) { _bodyEls.heatmap.replaceWith(el); _bodyEls.heatmap = el; } }).catch(() => {}),
    _renderDonuts().then(el => { if (_bodyEls.donuts) { _bodyEls.donuts.replaceWith(el); _bodyEls.donuts = el; } }).catch(() => {}),
    _renderHistory().then(el => { if (_bodyEls.history) { _bodyEls.history.replaceWith(el); _bodyEls.history = el; } }).catch(() => {}),
  ]);
}

let _bodyEls = {};

function _buildSkeleton() {
  return `
    <div class="pf-section" data-section="card">
      <div class="pf-card pf-skel"><div class="pf-avatar pf-skel-avatar"></div><div class="pf-info"><div class="pf-skel-line" style="width:40%"></div><div class="pf-skel-line" style="width:60%"></div></div></div>
    </div>
    <div class="pf-section" data-section="stats">
      <div class="pf-stats-bar pf-skel"><div class="pf-stat-item"><div class="pf-skel-line" style="width:60%;height:24px;margin:0 auto"></div></div><div class="pf-stat-item"><div class="pf-skel-line" style="width:60%;height:24px;margin:0 auto"></div></div><div class="pf-stat-item"><div class="pf-skel-line" style="width:60%;height:24px;margin:0 auto"></div></div></div>
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
    </div>`;
}

async function _renderBody(change) {
  if (_dayDetail) { _renderDayDetail(); return; }
  const body = _panel.querySelector('#pfBody');
  if (!body.firstChild || change === 'full') {
    await _load();
  } else if (change === 'stats') {
    const newEl = await _renderStatsBar();
    if (_bodyEls.stats) { _bodyEls.stats.replaceWith(newEl); _bodyEls.stats = newEl; }
  } else if (change === 'heatmap') {
    const newEl = await _renderHeatmap();
    if (_bodyEls.heatmap) { _bodyEls.heatmap.replaceWith(newEl); _bodyEls.heatmap = newEl; }
  } else if (change === 'donuts') {
    const newEl = await _renderDonuts();
    if (_bodyEls.donuts) { _bodyEls.donuts.replaceWith(newEl); _bodyEls.donuts = newEl; }
  } else if (change === 'history') {
    const newEl = await _renderHistory();
    if (_bodyEls.history) { _bodyEls.history.replaceWith(newEl); _bodyEls.history = newEl; }
  } else if (change === 'card') {
    const newCard = _renderProfileCard();
    if (_bodyEls.card) { _bodyEls.card.replaceWith(newCard); _bodyEls.card = newCard; }
  }
}

function _initials(name) {
  if (!name) return '?';
  return name.split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// ── Profile Card ──

function _renderProfileCard() {
  const section = _el('div', { className: 'pf-section' });
  if (_editingProfile) {
    section.innerHTML = `
      <div class="pf-card">
        <div class="pf-edit-form">
          <div class="pf-edit-field"><label>Name</label><input class="pf-edit-input" id="pfEditName" value="${_esc(_profile.name || '')}"></div>
          <div class="pf-edit-field"><label>Email</label><input class="pf-edit-input" id="pfEditEmail" value="${_esc(_profile.email || '')}"></div>
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
        avatarColor: colorBtn ? colorBtn.dataset.color : '#4F8EF7',
        facebook: section.querySelector('#pfEditFb').value,
        tiktok: section.querySelector('#pfEditTt').value,
        linkedin: section.querySelector('#pfEditLi').value,
        wakatime: section.querySelector('#pfEditWk').value,
      });
      const p = await window.electronAPI.profile.get();
      if (p) _profile = p;
      _editingProfile = false;
      _renderBody('card');
    });
    section.querySelector('#pfCancelEdit').addEventListener('click', () => { _editingProfile = false; _renderBody('card'); });
    return section;
  }

  const c = _profile.avatarColor || '#4F8EF7';
  section.innerHTML = `
    <div class="pf-card">
      <div class="pf-avatar" style="background:${c};color:#fff">${_initials(_profile.name)}</div>
      <div class="pf-info">
        <div class="pf-name">${_esc(_profile.name || 'Unnamed')}</div>
        <div class="pf-email">${_esc(_profile.email || '')}</div>
      </div>
      <button class="pf-btn primary" id="pfEditBtn">Edit Profile</button>
    </div>
    <div class="pf-socials">${_socialLink('facebook', _profile.facebook)}${_socialLink('tiktok', _profile.tiktok)}${_socialLink('linkedin', _profile.linkedin)}${_socialLink('wakatime', _profile.wakatime)}</div>
  `;
  section.querySelector('#pfEditBtn').addEventListener('click', () => { _editingProfile = true; _renderBody('card'); });
  return section;
}

function _socialLink(platform, url) {
  if (!url) return '';
  return `<a class="pf-social-link" href="${_esc(url)}" target="_blank" title="${platform}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v8M6 10h8"/></svg><span>${platform}</span></a>`;
}

// ── Stats Bar ──

async function _renderStatsBar() {
  const section = _el('div', { className: 'pf-section' });
  const stats = await _cached('stats:' + _statsRange, () => window.electronAPI.profile.getStats(_statsRange));
  const items = [
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
      ${items.map(s => `<div class="pf-stat-item"><div class="pf-stat-value">${s.value}</div><div class="pf-stat-label">${s.label}</div></div>`).join('')}
    </div>
    <div class="pf-range-tabs">${ranges.map(r => `<button class="pf-range-btn${_statsRange === r.id ? ' active' : ''}" data-range="${r.id}">${r.label}</button>`).join('')}</div>
  `;
  section.querySelectorAll('.pf-range-btn').forEach(btn => {
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
  const heatmap = await _cached('heatmap:' + _heatmapYear, () => window.electronAPI.profile.getHeatmap(_heatmapYear)) || {};
  const year = _heatmapYear;
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const startDow = start.getDay();
  const totalDays = Math.ceil((end - start) / 86400000) + 1;
  const maxVal = Math.max(1, ...Object.values(heatmap).map(v => v.total || 0));

  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  const weeks = Math.ceil((totalDays + startDow) / 7);

  let cellsHtml = '';
  for (let d = 0; d < totalDays; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);
    const dayData = heatmap[dateStr];
    const val = dayData ? dayData.total : 0;
    const level = val === 0 ? 0 : val / maxVal <= 0.25 ? 1 : val / maxVal <= 0.5 ? 2 : val / maxVal <= 0.75 ? 3 : 4;
    const col = Math.floor((d + startDow) / 7) + 2;
    const row = date.getDay() + 1;
    const tip = val > 0 ? `${dateStr} — ${val} total · ${dayData.saves || 0} saves` : dateStr;
    cellsHtml += `<div class="pf-hm-cell lvl-${level}" style="grid-row:${row};grid-column:${col}" title="${_esc(tip)}" data-date="${dateStr}"></div>`;
  }

  section.innerHTML = `
    <div class="pf-heatmap-header">
      <button class="pf-heatmap-nav" id="pfHeatPrev">◀</button>
      <span class="pf-heatmap-title">${year} Activity</span>
      <button class="pf-heatmap-nav" id="pfHeatNext">▶</button>
    </div>
    <div class="pf-heatmap-wrap">
      <div class="pf-heatmap-grid" style="grid-template-columns: 28px repeat(${weeks}, 12px);grid-template-rows: repeat(7, 12px)">
        ${dayLabels.map((l, ri) => `<div class="pf-hm-day-label" style="grid-row:${ri+1};grid-column:1">${l}</div>`).join('')}
        ${cellsHtml}
      </div>
    </div>
    <div class="pf-hm-legend"><span>Less</span>${[0,1,2,3,4].map(l => `<div class="pf-hm-cell lvl-${l}"></div>`).join('')}<span>More</span></div>
  `;

  section.querySelector('#pfHeatPrev').addEventListener('click', () => {
    _heatmapYear--;
    delete _cache['heatmap:' + _heatmapYear];
    _renderBody('heatmap');
  });
  section.querySelector('#pfHeatNext').addEventListener('click', () => {
    _heatmapYear++;
    delete _cache['heatmap:' + _heatmapYear];
    _renderBody('heatmap');
  });

  section.querySelectorAll('.pf-hm-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', async () => {
      const date = cell.dataset.date;
      try {
        const detail = await window.electronAPI.profile.getDayDetail(date);
        if (detail) { _dayDetail = { date, ...detail }; _renderDayDetail(); }
      } catch (_) {}
    });
  });

  return section;
}

// ── Donut Charts ──

const DONUT_COLORS = ['#4F8EF7', '#34d399', '#f472b6', '#fb923c', '#a78bfa', '#fbbf24', '#f87171', '#2dd4bf'];

function _buildDonutHTML(title, items) {
  const total = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
  if (!total) return `<div class="pf-donut-wrap"><div class="pf-donut-title">${_esc(title)}</div><div class="pf-donut-empty">No data</div></div>`;
  const r = 50, cx = 60, cy = 60;
  let html = `<div class="pf-donut-wrap"><div class="pf-donut-title">${_esc(title)}</div><div class="pf-donut-chart"><svg viewBox="0 0 120 120" width="120" height="120">`;
  let angle = -Math.PI / 2;
  const slices = items.filter(i => (Number(i.value) || 0) > 0).slice(0, 7);
  slices.forEach((item, i) => {
    const pct = item.value / total;
    const endAngle = angle + pct * 2 * Math.PI;
    const color = DONUT_COLORS[i % DONUT_COLORS.length];
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    html += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${x2},${y2} Z" fill="${color}" stroke="var(--bg-surface)" stroke-width="1"/>`;
    angle = endAngle;
  });
  html += `<circle cx="${cx}" cy="${cy}" r="28" fill="var(--bg-surface)"/></svg></div><div class="pf-donut-legend">`;
  slices.forEach((item, i) => {
    html += `<div class="pf-donut-legend-item"><span class="pf-donut-dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></span>${_esc(item.label)} <span class="pf-donut-pct">${((item.value / total) * 100).toFixed(1)}%</span></div>`;
  });
  html += '</div></div>';
  return html;
}

async function _renderDonuts() {
  const section = _el('div', { className: 'pf-section' });
  const data = await _cached('donuts:' + _donutRange, () => window.electronAPI.profile.getDonutData(_donutRange)) || { repo: [], ext: [], type: [] };

  const ranges = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All' },
  ];

  section.innerHTML = `<div class="pf-range-tabs">${ranges.map(r => `<button class="pf-range-btn${_donutRange === r.id ? ' active' : ''}" data-range="${r.id}">${r.label}</button>`).join('')}</div>
    <div class="pf-donuts-row">${_buildDonutHTML('Activity by Repo', data.repo)}${_buildDonutHTML('Activity by File Type', data.ext)}${_buildDonutHTML('Activity by Type', data.type)}</div>`;

  section.querySelectorAll('.pf-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _donutRange = btn.dataset.range;
      delete _cache['donuts:' + _donutRange];
      _renderBody('donuts');
    });
  });

  return section;
}

// ── History ──

async function _renderHistory() {
  const section = _el('div', { className: 'pf-section' });
  const cacheKey = 'history:' + _historyPage + ':' + _historyRepo;
  const result = await _cached(cacheKey, () => window.electronAPI.profile.getHistory(_historyPage, _historyRepo)) || { items: [], total: 0, page: 1, pageSize: 20 };
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const itemsHtml = result.items.length ? result.items.map(item => `
    <div class="pf-history-item" data-date="${item.date}">
      <div class="pf-history-date">${item.date}</div>
      <div class="pf-history-repo">${_esc(item.repoName)}</div>
      <div class="pf-history-stats">${item.files} files · ${item.saves} saves</div>
      <button class="pf-history-view-btn" data-date="${item.date}">View Day</button>
    </div>
  `).join('') : '<div class="pf-empty">No activity yet</div>';

  const pagesHtml = totalPages > 1 ? Array.from({length: totalPages}, (_, i) => `<button class="pf-page-btn${_historyPage === i+1 ? ' active' : ''}" data-page="${i+1}">${i+1}</button>`).join('') : '';

  section.innerHTML = `
    <div class="pf-history-header">
      <span class="pf-section-title">Activity History</span>
      <input class="pf-history-search" id="pfHistorySearch" placeholder="Filter by repo\u2026" value="${_esc(_historyRepo)}">
    </div>
    <div class="pf-history-list">${itemsHtml}</div>
    ${pagesHtml ? `<div class="pf-history-pages">${pagesHtml}</div>` : ''}
  `;

  section.querySelectorAll('.pf-history-view-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const detail = await window.electronAPI.profile.getDayDetail(btn.dataset.date);
        if (detail) { _dayDetail = { date: btn.dataset.date, ...detail }; _renderDayDetail(); }
      } catch (_) {}
    });
  });

  section.querySelectorAll('.pf-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _historyPage = parseInt(btn.dataset.page);
      delete _cache['history:' + _historyPage + ':' + _historyRepo];
      _renderBody('history');
    });
  });

  let searchTimer;
  section.querySelector('#pfHistorySearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      _historyRepo = e.target.value;
      _historyPage = 1;
      delete _cache['history:1:' + _historyRepo];
      _renderBody('history');
    }, 300);
  });

  return section;
}

// ── Day Detail + Diff Viewer ──

let _dayDetailFile = null;
let _dayDetailDiff = null;

function _isGitPath(p) {
  return p.replace(/\\/g, '/').includes('/.git/');
}

async function _loadFileDiff(filePath, repoName) {
  _dayDetailFile = filePath;
  _dayDetailDiff = null;
  const el = _panel.querySelector('#pfDiffContent');
  if (el) el.innerHTML = '<div class="pf-diff-loading">Loading diff\u2026</div>';

  try {
    const result = await window.electronAPI.profile.fileDiff(filePath);
    _dayDetailDiff = result.diff || '';
    const activeEl = _panel.querySelector('#pfDiffContent');
    if (activeEl) activeEl.innerHTML = _renderDiffHTML(result.diff || '');
    _panel.querySelectorAll('.pf-detail-file').forEach(e => e.classList.toggle('active', e.dataset.path === filePath));
  } catch {
    const activeEl = _panel.querySelector('#pfDiffContent');
    if (activeEl) activeEl.innerHTML = '<div class="pf-diff-loading">Failed to load diff</div>';
  }
}

function _renderDiffHTML(diffText) {
  if (!diffText) return '<div class="pf-diff-empty">No uncommitted changes</div>';
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
  return html || '<div class="pf-diff-empty">No uncommitted changes</div>';
}

function _renderDayDetail() {
  if (!_dayDetail) { _renderBody('full'); return; }
  const body = _panel.querySelector('#pfBody');
  const d = _dayDetail;
  const totalSaves = d.repos ? d.repos.reduce((s, r) => s + (r.saves || 0), 0) : 0;
  const totalFiles = d.repos ? d.repos.reduce((s, r) => s + (r.files || 0), 0) : 0;

  const files = (d.files || []).filter(f => !_isGitPath(f.path));

  body.innerHTML = `
    <div class="pf-day-detail">
      <div class="pf-day-detail-header">
        <span class="pf-day-detail-title">${d.date}</span>
        <div class="pf-day-summary">${totalSaves} saves · ${totalFiles} files</div>
        <button class="pf-btn" id="pfDayClose">← Back</button>
      </div>
      <div class="pf-detail-body">
        <div class="pf-detail-sidebar">
          <div class="pf-detail-sidebar-title">Files Touched (${files.length})</div>
          <div class="pf-detail-files-list">
            ${files.length ? files.map(f => `
              <div class="pf-detail-file" data-path="${_esc(f.path)}" data-repo="${_esc(f.repo || '')}">
                <span class="pf-detail-file-path">${_esc(f.path)}</span>
                <span class="pf-detail-file-count">${f.saves} saves</span>
              </div>
            `).join('') : '<div class="pf-detail-empty">No files</div>'}
          </div>
        </div>
        <div class="pf-detail-main">
          <div class="pf-diff-header">
            <span class="pf-diff-header-path">${_dayDetailFile ? _esc(_dayDetailFile) : 'Select a file'}</span>
            <span class="pf-diff-legend">
              <span class="pf-diff-legend-added">+ added</span>
              <span class="pf-diff-legend-removed">- removed</span>
              <span class="pf-diff-legend-hunk">@@ hunk</span>
            </span>
          </div>
          <div class="pf-diff-content" id="pfDiffContent">
            ${_dayDetailFile && _dayDetailDiff !== null ? _renderDiffHTML(_dayDetailDiff) : '<div class="pf-diff-select-prompt">Click a file to view its changes</div>'}
          </div>
        </div>
      </div>
    </div>
  `;

  body.querySelector('#pfDayClose').addEventListener('click', () => { _dayDetail = null; _dayDetailFile = null; _dayDetailDiff = null; _renderBody('full'); });

  body.querySelectorAll('.pf-detail-file').forEach(el => {
    el.addEventListener('click', () => {
      const filePath = el.dataset.path;
      _loadFileDiff(filePath);
    });
    if (el.dataset.path === _dayDetailFile) el.classList.add('active');
  });
}
