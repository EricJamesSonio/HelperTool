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

function _clearCache(forceFull) {
  if (forceFull) { _cache = {}; return; }
  for (const key of Object.keys(_cache)) _cache[key].ttl = 0;
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
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    close();
  }
}

async function _load() {
  const body = _panel.querySelector('#pfBody');
  _cache = {};
  _avatarDataUrl = null;

  const { getPrefetchCache } = await import('./app_manager/prefetchManager.js');
  const cached = getPrefetchCache().get('profile');
  if (cached && cached.all) {
    const { all, avatar } = cached;
    if (all.profile) _profile = all.profile;
    _avatarDataUrl = avatar;
    body.innerHTML = _buildBodyHtml(all);
    _bodyEls = {};
    body.querySelectorAll('.pf-section').forEach(el => { _bodyEls[el.dataset.section] = el; });
    const newCard = _renderProfileCard();
    if (_bodyEls.card) { _bodyEls.card.replaceWith(newCard); _bodyEls.card = newCard; }
    _cache['stats:' + _statsRange] = { data: Promise.resolve(all.stats), fetchedAt: Date.now(), ttl: 30000 };
    _cache['heatmap:' + _heatmapYear] = { data: Promise.resolve(all.heatmap), fetchedAt: Date.now(), ttl: 60000 };
    _cache['donuts:' + _donutRange] = { data: Promise.resolve(all.donuts), fetchedAt: Date.now(), ttl: 30000 };
    const histKey = 'history:' + _historyPage + ':' + _historyRepo;
    _cache[histKey] = { data: Promise.resolve(all.history), fetchedAt: Date.now(), ttl: 10000 };
    _renderStatsBar().then(el => { if (_bodyEls.stats) { _bodyEls.stats.replaceWith(el); _bodyEls.stats = el; } }).catch(() => {});
    _renderHeatmap().then(el => { if (_bodyEls.heatmap) { _bodyEls.heatmap.replaceWith(el); _bodyEls.heatmap = el; } }).catch(() => {});
    _renderDonuts().then(el => { if (_bodyEls.donuts) { _bodyEls.donuts.replaceWith(el); _bodyEls.donuts = el; } }).catch(() => {});
    _renderHistory().then(el => { if (_bodyEls.history) { _bodyEls.history.replaceWith(el); _bodyEls.history = el; } }).catch(() => {});
    return;
  }

  body.innerHTML = _buildSkeleton();
  _bodyEls = {};
  body.querySelectorAll('.pf-section').forEach(el => {
    _bodyEls[el.dataset.section] = el;
  });

  // Start watcher in background (fire-and-forget)
  window.electronAPI.profile.initWatcher().catch(() => {});

  // Single batched IPC call for all data + profile
  Promise.all([
    window.electronAPI.profile.getAll({
      statsRange: _statsRange,
      heatmapYear: _heatmapYear,
      donutRange: _donutRange,
      historyPage: _historyPage,
      historyRepo: _historyRepo,
    }).catch(() => null),
    window.electronAPI.profile.getAvatar().catch(() => ({ dataUrl: null })),
  ]).then(([all, av]) => {
    if (!all) return;
    if (all.profile) _profile = all.profile;
    _avatarDataUrl = av ? av.dataUrl : null;

    import('./app_manager/prefetchManager.js').then(mod => {
      mod.getPrefetchCache().set('profile', { all, avatar: av?.dataUrl || null }, 300000);
    });

    // Populate cache with batched results
    _cache['stats:' + _statsRange] = { data: Promise.resolve(all.stats), fetchedAt: Date.now(), ttl: 30000 };
    _cache['heatmap:' + _heatmapYear] = { data: Promise.resolve(all.heatmap), fetchedAt: Date.now(), ttl: 60000 };
    _cache['donuts:' + _donutRange] = { data: Promise.resolve(all.donuts), fetchedAt: Date.now(), ttl: 30000 };
    const histKey = 'history:' + _historyPage + ':' + _historyRepo;
    _cache[histKey] = { data: Promise.resolve(all.history), fetchedAt: Date.now(), ttl: 10000 };

    // Render card
    const newCard = _renderProfileCard();
    if (_bodyEls.card) { _bodyEls.card.replaceWith(newCard); _bodyEls.card = newCard; }

    // Render all 4 sections from cached data
    _renderStatsBar().then(el => { if (_bodyEls.stats) { _bodyEls.stats.replaceWith(el); _bodyEls.stats = el; } }).catch(() => {});
    _renderHeatmap().then(el => { if (_bodyEls.heatmap) { _bodyEls.heatmap.replaceWith(el); _bodyEls.heatmap = el; } }).catch(() => {});
    _renderDonuts().then(el => { if (_bodyEls.donuts) { _bodyEls.donuts.replaceWith(el); _bodyEls.donuts = el; } }).catch(() => {});
    _renderHistory().then(el => { if (_bodyEls.history) { _bodyEls.history.replaceWith(el); _bodyEls.history = el; } }).catch(() => {});
  });
}

function _buildBodyHtml(all) {
  return `
    <div class="pf-body-sidebar">
      <div class="pf-section" data-section="card">
        <div class="pf-card-vertical pf-skel"><div class="pf-skel-avatar pf-skel-avatar-lg" style="margin:0 auto 8px"></div><div class="pf-skel-line" style="width:50%;margin:0 auto"></div><div class="pf-skel-line" style="width:70%;margin:6px auto 0"></div></div>
      </div>
    </div>
    <div class="pf-body-main">
      <div class="pf-section" data-section="stats"><div class="pf-stats-bar pf-skel"><div class="pf-stat-item"><div class="pf-skel-line" style="width:60%;height:24px;margin:0 auto"></div></div><div class="pf-stat-item"><div class="pf-skel-line" style="width:60%;height:24px;margin:0 auto"></div></div><div class="pf-stat-item"><div class="pf-skel-line" style="width:60%;height:24px;margin:0 auto"></div></div></div></div>
      <div class="pf-section" data-section="heatmap"><div class="pf-skel-line" style="width:100%;height:140px"></div></div>
      <div class="pf-section" data-section="donuts"><div class="pf-skel-donuts" style="display:flex;gap:16px"><div class="pf-skel-line" style="flex:1;height:120px"></div><div class="pf-skel-line" style="flex:1;height:120px"></div></div></div>
      <div class="pf-section" data-section="history"><div class="pf-skel-line" style="width:100%;height:200px"></div></div>
    </div>
  `;
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
      </div>
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
      <div class="pf-card-name">${_esc(_profile.name || 'Unnamed')}</div>
      <div class="pf-card-email">${_esc(_profile.email || '')}</div>
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
  const stats = await _cached('stats:' + _statsRange, () => window.electronAPI.profile.getStats(_statsRange), 30000);
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
  const heatmap = await _cached('heatmap:' + _heatmapYear, () => window.electronAPI.profile.getHeatmap(_heatmapYear), 60000) || {};
  const year = _heatmapYear;
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const startDow = start.getDay();
  const totalDays = Math.ceil((end - start) / 86400000) + 1;

  let maxVal = 1;
  for (const v of Object.values(heatmap)) { const t = v.total || 0; if (t > maxVal) maxVal = t; }

  const cellsArr = [];
  for (let i = 0; i < startDow; i++) {
    cellsArr.push(`<div class="pf-hm-cell lvl-0 pf-hm-empty"></div>`);
  }

  const d = new Date(start);
  for (let i = 0; i < totalDays; i++) {
    d.setFullYear(year, 0, i + 1);
    const dateStr = d.toISOString().slice(0, 10);
    const dayData = heatmap[dateStr];
    const val = dayData ? dayData.total : 0;
    const level = val === 0 ? 0 : val / maxVal <= 0.25 ? 1 : val / maxVal <= 0.5 ? 2 : val / maxVal <= 0.75 ? 3 : 4;
    const tip = val > 0 ? `${dateStr} — ${val} total · ${dayData.saves || 0} saves` : dateStr;
    cellsArr.push(`<div class="pf-hm-cell lvl-${level}" title="${_esc(tip)}" data-date="${dateStr}"></div>`);
  }

  section.innerHTML = `
    <div class="pf-heatmap-header">
      <button class="pf-heatmap-nav" id="pfHeatPrev">◀</button>
      <span class="pf-heatmap-title">${year} Activity</span>
      <button class="pf-heatmap-nav" id="pfHeatNext">▶</button>
    </div>
    <div class="pf-heatmap-wrap">
      <div class="pf-hm-day-labels">${['', 'Mon', '', 'Wed', '', 'Fri', ''].map(l => `<div>${l}</div>`).join('')}</div>
      <div class="pf-heatmap-grid-auto">${cellsArr.join('')}</div>
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

  // single delegated click listener on the heatmap wrap
  const wrap = section.querySelector('.pf-heatmap-wrap');
  wrap.addEventListener('click', async (e) => {
    const cell = e.target.closest('.pf-hm-cell[data-date]');
    if (!cell) return;
    const date = cell.dataset.date;
    try {
      const detail = await window.electronAPI.profile.getDayDetail(date);
      if (detail) { _dayDetail = { date, ...detail }; _renderDayDetail(); }
    } catch (_) {}
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
  const data = await _cached('donuts:' + _donutRange, () => window.electronAPI.profile.getDonutData(_donutRange), 30000) || { repo: [], ext: [], type: [] };

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
      window.electronAPI.profile.getDayDetail(btn.dataset.date).then(detail => {
        if (detail) { _dayDetail = { date: btn.dataset.date, ...detail }; _renderDayDetail(); }
      }).catch(() => {});
      return;
    }

    const pageBtn = e.target.closest('.pf-page-btn, .pf-page-nav');
    if (!pageBtn || pageBtn.disabled) return;

    clearTimeout(_historyNavTimer);
    _historyNavTimer = setTimeout(() => {
      let targetPage;
      if (pageBtn.dataset.page === 'prev') targetPage = _historyPage - 1;
      else if (pageBtn.dataset.page === 'next') targetPage = _historyPage + 1;
      else targetPage = parseInt(pageBtn.dataset.page);

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
  const result = await _cached(cacheKey, () => window.electronAPI.profile.getHistory(_historyPage, _historyRepo), 10000) || { items: [], total: 0, page: 1, pageSize: 20 };
  _lastHistoryTotal = result.total;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const itemsHtml = result.items.length ? result.items.map(item => `
    <div class="pf-history-item" data-date="${item.date}">
      <div class="pf-history-date">${item.date}</div>
      <div class="pf-history-repo">${_esc(item.repoName)}</div>
      <div class="pf-history-stats">${item.files} files · ${item.saves} saves</div>
      <button class="pf-history-view-btn" data-date="${item.date}">View Day</button>
    </div>
  `).join('') : '<div class="pf-empty">No activity yet</div>';

  const pagesHtml = totalPages > 1 ? _buildPageButtons(totalPages) : '';

  section.innerHTML = `
    <div class="pf-history-header">
      <span class="pf-section-title">Activity History <span class="pf-history-count">(${result.total} days)</span></span>
      <input class="pf-history-search" id="pfHistorySearch" placeholder="Filter by repo\u2026" value="${_esc(_historyRepo)}">
    </div>
    <div class="pf-history-list">${itemsHtml}</div>
    ${pagesHtml ? `<div class="pf-history-pages" id="pfHistoryPages">${pagesHtml}</div>` : ''}
  `;

  _wireHistoryEvents(section);

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
let _dayDetailContent = null;
let _dayDetailCommitHash = null;
let _dayCommits = null;

function _isGitPath(p) {
  const n = p.replace(/\\/g, '/');
  return n.includes('/.git/') || n.startsWith('.git/');
}

async function _loadFileDiff(filePath, commitHash) {
  _dayDetailFile = filePath;
  _dayDetailDiff = null;
  _dayDetailContent = null;
  _dayDetailCommitHash = commitHash || null;
  const el = _panel.querySelector('#pfDiffContent');
  if (el) el.innerHTML = '<div class="pf-diff-loading">Loading diff\u2026</div>';

  try {
    const result = await window.electronAPI.profile.fileDiff(filePath, null, commitHash);
    _dayDetailDiff = result.diff || '';
    _dayDetailContent = result.content || '';
    const activeEl = _panel.querySelector('#pfDiffContent');
    if (activeEl) activeEl.innerHTML = _renderDiffHTML(result.diff || '', result.content || '');
    _panel.querySelectorAll('.pf-commit-file').forEach(e => e.classList.toggle('active', e.dataset.path === filePath && e.dataset.hash === (commitHash || '')));
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
  let html = '';
  if (!commits || !commits.length) {
    return '<div class="pf-commit-empty">No commits on this day</div>';
  }
  for (const c of commits) {
    const files = (c.files || []).filter(f => !_isGitPath(f.path));
    html += `<div class="pf-commit-group">
      <div class="pf-commit-header">
        <span class="pf-commit-hash">${_esc(c.shortHash)}</span>
        <span class="pf-commit-time">${_esc(c.time)}</span>
      </div>
      <div class="pf-commit-msg">${_esc(c.message)}</div>
      <div class="pf-commit-files">`;
    for (const f of files) {
      const statusClass = f.status === 'A' ? 'pf-cs-added' : f.status === 'D' ? 'pf-cs-deleted' : 'pf-cs-modified';
      const statusLabel = f.status === 'A' ? 'A' : f.status === 'D' ? 'D' : 'M';
      html += `<div class="pf-commit-file" data-path="${_esc(f.path)}" data-hash="${_esc(c.hash)}">
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

  body.innerHTML = `
    <div class="pf-day-detail">
      <div class="pf-day-detail-header">
        <span class="pf-day-detail-title">${d.date}</span>
        <div class="pf-day-summary">${commitCount} commits</div>
        <button class="pf-btn" id="pfDayClose">← Back</button>
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
    _dayDetail = null; _dayDetailFile = null; _dayDetailDiff = null;
    _dayDetailContent = null; _dayDetailCommitHash = null; _dayCommits = null;
    _renderBody('full');
  });

  // Fetch commits in background and populate sidebar
  if (!_dayCommits) {
    window.electronAPI.profile.getDayCommits(d.date).then(commits => {
      _dayCommits = commits || [];
      const list = body.querySelector('#pfCommitsList');
      if (list) {
        list.innerHTML = _renderCommitSidebar(_dayCommits);
        _attachCommitFileClicks(body);
        // Update header count
        const sumEl = body.querySelector('.pf-day-summary');
        if (sumEl) sumEl.textContent = _dayCommits.length + ' commits';
        const titleEl = body.querySelector('.pf-detail-sidebar-title');
        if (titleEl) titleEl.textContent = 'Commits (' + _dayCommits.length + ')';
      }
    }).catch(() => {
      const list = body.querySelector('#pfCommitsList');
      if (list) list.innerHTML = '<div class="pf-commit-empty">Failed to load commits</div>';
    });
  } else {
    const list = body.querySelector('#pfCommitsList');
    if (list) {
      list.innerHTML = _renderCommitSidebar(_dayCommits);
      _attachCommitFileClicks(body);
    }
  }
}

function _attachCommitFileClicks(body) {
  body.querySelectorAll('.pf-commit-file').forEach(el => {
    el.addEventListener('click', () => {
      const filePath = el.dataset.path;
      const hash = el.dataset.hash;
      _loadFileDiff(filePath, hash || null);
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
