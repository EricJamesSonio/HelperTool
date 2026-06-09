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
          <button class="pf-btn-icon" id="pfRefreshBtn" title="Sync commits"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M19 16v-6h-6"/><path d="M17.65 6.35A8 8 0 0 0 3.3 9.7M2.35 13.65A8 8 0 0 0 16.7 10.3"/></svg></button>
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
  _panel.querySelector('#pfRefreshBtn').addEventListener('click', () => { _sync(); _load(); });
  document.addEventListener('keydown', _escHandler);
}

function _escHandler(e) {
  if (e.key === 'Escape' && _open) {
    if (_dayDetail) { _dayDetail = null; _renderBody(); return; }
    if (_editingProfile) { _editingProfile = false; _renderBody(); return; }
    close();
  }
}

async function _load() {
  try {
    const p = await window.electronAPI.profile.get();
    if (p) _profile = p;
    await _sync();
    _renderBody();
  } catch (err) {
    console.error('[Profile] Failed to load:', err);
    _panel.querySelector('#pfBody').innerHTML = '<div class="pf-error">Failed to load profile: ' + err.message + '</div>';
  }
}

async function _sync() {
  try { await window.electronAPI.profile.syncCommits(); } catch (_) {}
  try { await window.electronAPI.profile.initWatcher(); } catch (_) {}
}

async function _renderBody() {
  if (_dayDetail) { _renderDayDetail(); return; }
  const body = _panel.querySelector('#pfBody');
  body.innerHTML = '';
  body.appendChild(_renderProfileCard());
  body.appendChild(await _renderStatsBar());
  body.appendChild(await _renderHeatmap());
  body.appendChild(await _renderDonuts());
  body.appendChild(await _renderHistory());
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
      _renderBody();
    });
    section.querySelector('#pfCancelEdit').addEventListener('click', () => { _editingProfile = false; _renderBody(); });
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
  section.querySelector('#pfEditBtn').addEventListener('click', () => { _editingProfile = true; _renderBody(); });
  return section;
}

function _socialLink(platform, url) {
  if (!url) return '';
  return `<a class="pf-social-link" href="${_esc(url)}" target="_blank" title="${platform}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v8M6 10h8"/></svg><span>${platform}</span></a>`;
}

// ── Stats Bar ──

async function _renderStatsBar() {
  const section = _el('div', { className: 'pf-section' });
  const stats = await window.electronAPI.profile.getStats(_statsRange);
  const items = [
    { label: 'Total Commits', value: (stats.commits || 0).toLocaleString() },
    { label: 'Files Touched', value: (stats.files || 0).toLocaleString() },
    { label: 'File Saves', value: (stats.saves || 0).toLocaleString() },
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
      _renderBody();
    });
  });
  return section;
}

// ── Heatmap ──

async function _renderHeatmap() {
  const section = _el('div', { className: 'pf-section' });
  const heatmap = await window.electronAPI.profile.getHeatmap(_heatmapYear) || {};
  const now = new Date();
  const year = _heatmapYear;
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  const dayOfWeek = startDate.getDay();
  const totalDays = Math.ceil((endDate - startDate) / 86400000) + 1;

  const maxVal = Math.max(1, ...Object.values(heatmap).map(v => v.total || 0));

  let cells = [];
  for (let d = 0; d < totalDays; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);
    const dayData = heatmap[dateStr];
    const val = dayData ? dayData.total : 0;
    const pct = val / maxVal;
    const level = pct === 0 ? 0 : pct <= 0.25 ? 1 : pct <= 0.5 ? 2 : pct <= 0.75 ? 3 : 4;
    const dow = date.getDay();
    const weekIdx = Math.floor((d + dayOfWeek) / 7);
    cells.push({ date: dateStr, level, val, dayData, dow, weekIdx });
  }

  const weeks = Math.ceil((totalDays + dayOfWeek) / 7);
  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  section.innerHTML = `
    <div class="pf-heatmap-header">
      <button class="pf-heatmap-nav" id="pfHeatPrev">◀</button>
      <span class="pf-heatmap-title">${year} Activity</span>
      <button class="pf-heatmap-nav" id="pfHeatNext">▶</button>
    </div>
    <div class="pf-heatmap-wrap">
      <div class="pf-heatmap-grid" style="grid-template-columns: 28px repeat(${weeks}, 12px);grid-template-rows: repeat(7, 12px)">
        ${dayLabels.map((l, ri) => `<div class="pf-hm-day-label" style="grid-row:${ri+1};grid-column:1">${l}</div>`).join('')}
        ${cells.map(c => {
          const col = c.weekIdx + 2;
          const row = c.dow + 1;
          const lvl = c.level;
          const tip = c.val > 0 ? `${c.date} — ${c.val} total · ${c.dayData.commits || 0} commits · ${c.dayData.saves || 0} saves` : c.date;
          return `<div class="pf-hm-cell lvl-${lvl}" style="grid-row:${row};grid-column:${col}" title="${_esc(tip)}" data-date="${c.date}"></div>`;
        }).join('')}
      </div>
    </div>
    <div class="pf-hm-legend"><span>Less</span>${[0,1,2,3,4].map(l => `<div class="pf-hm-cell lvl-${l}"></div>`).join('')}<span>More</span></div>
  `;

  section.querySelector('#pfHeatPrev').addEventListener('click', () => { _heatmapYear--; _renderBody(); });
  section.querySelector('#pfHeatNext').addEventListener('click', () => { _heatmapYear++; _renderBody(); });

  section.querySelectorAll('.pf-hm-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', async () => {
      const date = cell.dataset.date;
      try {
        const detail = await window.electronAPI.profile.getDayDetail(date);
        if (detail) { _dayDetail = { date, ...detail }; _renderBody(); }
      } catch (_) {}
    });
  });

  return section;
}

// ── Donut Charts ──

function _renderDonutSegment(svg, cx, cy, r, startAngle, endAngle, color) {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
  const seg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  seg.setAttribute('d', d);
  seg.setAttribute('fill', color);
  return seg;
}

async function _renderDonuts() {
  const section = _el('div', { className: 'pf-section' });
  const data = await window.electronAPI.profile.getDonutData(_donutRange) || { repo: [], ext: [], type: [] };

  const ranges = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All' },
  ];

  const donutColors = ['#4F8EF7', '#34d399', '#f472b6', '#fb923c', '#a78bfa', '#fbbf24', '#f87171', '#2dd4bf'];

  function buildDonut(id, title, items, valueKey) {
    const total = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
    const wrap = _el('div', { className: 'pf-donut-wrap' });
    if (!total) {
      wrap.innerHTML = `<div class="pf-donut-title">${_esc(title)}</div><div class="pf-donut-empty">No data</div>`;
      return wrap;
    }
    const r = 50;
    const cx = 60, cy = 60;
    let html = `<div class="pf-donut-title">${_esc(title)}</div><div class="pf-donut-chart"><svg viewBox="0 0 120 120" width="120" height="120">`;
    let angle = -Math.PI / 2;
    const slices = items.filter(i => (Number(i.value) || 0) > 0).slice(0, 7);
    slices.forEach((item, i) => {
      const pct = item.value / total;
      const endAngle = angle + pct * 2 * Math.PI;
      const color = donutColors[i % donutColors.length];
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const large = pct > 0.5 ? 1 : 0;
      html += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z" fill="${color}" stroke="var(--bg-surface)" stroke-width="1"/>`;
      angle = endAngle;
    });
    html += `<circle cx="${cx}" cy="${cy}" r="28" fill="var(--bg-surface)"/></svg></div><div class="pf-donut-legend">`;
    slices.forEach((item, i) => {
      const pct = ((item.value / total) * 100).toFixed(1);
      html += `<div class="pf-donut-legend-item"><span class="pf-donut-dot" style="background:${donutColors[i % donutColors.length]}"></span>${_esc(item.label)} <span class="pf-donut-pct">${pct}%</span></div>`;
    });
    html += '</div>';
    wrap.innerHTML = html;
    return wrap;
  }

  section.innerHTML = `<div class="pf-range-tabs">${ranges.map(r => `<button class="pf-range-btn${_donutRange === r.id ? ' active' : ''}" data-range="${r.id}">${r.label}</button>`).join('')}</div>
    <div class="pf-donuts-row" id="pfDonutsRow"></div>`;

  section.querySelectorAll('.pf-range-btn').forEach(btn => {
    btn.addEventListener('click', () => { _donutRange = btn.dataset.range; _renderBody(); });
  });

  const row = section.querySelector('#pfDonutsRow');
  row.appendChild(buildDonut('repo', 'Activity by Repo', data.repo));
  row.appendChild(buildDonut('ext', 'Activity by File Type', data.ext));
  row.appendChild(buildDonut('type', 'Activity by Type', data.type));

  return section;
}

// ── History ──

async function _renderHistory() {
  const section = _el('div', { className: 'pf-section' });
  const result = await window.electronAPI.profile.getHistory(_historyPage, _historyRepo) || { items: [], total: 0, page: 1, pageSize: 20 };
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  section.innerHTML = `
    <div class="pf-history-header">
      <span class="pf-section-title">Activity History</span>
      <input class="pf-history-search" id="pfHistorySearch" placeholder="Filter by repo\u2026" value="${_esc(_historyRepo)}">
    </div>
    <div class="pf-history-list">${result.items.length ? result.items.map(item => `
      <div class="pf-history-item" data-date="${item.date}">
        <div class="pf-history-date">${item.date}</div>
        <div class="pf-history-repo">${_esc(item.repoName)}</div>
        <div class="pf-history-stats">${item.commits} commits · ${item.files} files · ${item.saves} saves</div>
        <button class="pf-history-view-btn" data-date="${item.date}">View Day</button>
      </div>
    `).join('') : '<div class="pf-empty">No activity yet</div>'}</div>
    <div class="pf-history-pages">${Array.from({length: totalPages}, (_, i) => `<button class="pf-page-btn${_historyPage === i+1 ? ' active' : ''}" data-page="${i+1}">${i+1}</button>`).join('')}</div>
  `;

  section.querySelectorAll('.pf-history-view-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const detail = await window.electronAPI.profile.getDayDetail(btn.dataset.date);
        if (detail) { _dayDetail = { date: btn.dataset.date, ...detail }; _renderBody(); }
      } catch (_) {}
    });
  });

  section.querySelectorAll('.pf-page-btn').forEach(btn => {
    btn.addEventListener('click', () => { _historyPage = parseInt(btn.dataset.page); _renderBody(); });
  });

  let searchTimer;
  section.querySelector('#pfHistorySearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { _historyRepo = e.target.value; _historyPage = 1; _renderBody(); }, 300);
  });

  return section;
}

// ── Day Detail Drawer ──

function _renderDayDetail() {
  if (!_dayDetail) { _renderBody(); return; }
  const body = _panel.querySelector('#pfBody');
  const d = _dayDetail;
  const totalCommits = d.repos ? d.repos.reduce((s, r) => s + (r.commits || 0), 0) : 0;
  const totalFiles = d.repos ? d.repos.reduce((s, r) => s + (r.files || 0), 0) : 0;
  const totalSaves = d.repos ? d.repos.reduce((s, r) => s + (r.saves || 0), 0) : 0;

  body.innerHTML = `
    <div class="pf-day-detail">
      <div class="pf-day-detail-header">
        <span class="pf-day-detail-title">${d.date}</span>
        <button class="pf-btn" id="pfDayClose">← Back</button>
      </div>
      <div class="pf-day-summary">${totalCommits} commits · ${totalFiles} files · ${totalSaves} saves</div>
      ${d.repos && d.repos.length ? `<div class="pf-day-section"><div class="pf-day-section-title">Repos</div>${d.repos.map(r => `
        <div class="pf-day-repo"><span class="pf-day-repo-name">${_esc(r.repo)}</span> ${r.commits}c · ${r.files}f · ${r.saves}s ${r.added || r.removed ? `(+${r.added}/-${r.removed})` : ''}</div>
      `).join('')}</div>` : ''}
      ${d.files && d.files.length ? `<div class="pf-day-section"><div class="pf-day-section-title">Files Touched</div>${d.files.map(f => `
        <div class="pf-day-file"><span class="pf-day-file-path">${_esc(f.path)}</span> <span class="pf-day-file-count">${f.saves} saves</span></div>
      `).join('')}</div>` : ''}
      ${(!d.repos || !d.repos.length) && (!d.files || !d.files.length) ? '<div class="pf-empty">No activity for this day</div>' : ''}
    </div>
  `;
  body.querySelector('#pfDayClose').addEventListener('click', () => { _dayDetail = null; _renderBody(); });
}
