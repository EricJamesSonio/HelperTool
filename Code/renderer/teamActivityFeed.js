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
let _commitFilterText = '';
let _diffCache = {};
let _visibleCount = 50;

const TA_SUMMARY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6"/><rect x="3" y="6" width="14" height="4" rx="1"/><path d="M10 3v7"/><path d="M7 6l3-3 3 3"/></svg>';
const TA_REFRESH = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 0 1 11.7-4.7"/><path d="M17 10a7 7 0 0 1-11.7 4.7"/><path d="M14.5 2v4h-4"/><path d="M5.5 18v-4h4"/></svg>';
const TA_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>';

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
        <div class="taf-drawer-body" id="tafDrawerBody">
          <div class="taf-drawer-meta" id="tafDrawerMeta"></div>
          <div class="taf-drawer-files" id="tafDrawerFiles"></div>
          <div class="taf-drawer-diff" id="tafDrawerDiff"></div>
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

  _panel.querySelectorAll('.taf-graph-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      _panel.querySelectorAll('.taf-graph-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _graphViewMode = btn.dataset.mode;
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

async function _loadData(repoPath) {
  const summary = _panel.querySelector('#tafSummary');
  const contributorsList = _panel.querySelector('#tafContributorsList');
  const commitList = _panel.querySelector('#tafCommitList');
  const graph = _panel.querySelector('#tafGraph');

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
    if (repo) await _loadData(repo);
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

// ── Contributors ──────────────────────────────────────────────

function _renderContributors() {
  const list = _panel.querySelector('#tafContributorsList');
  const entries = Object.entries(_contributors);

  const allActive = !_selectedContributor;
  list.innerHTML = '';

  const allItem = _el('div', { className: 'taf-contributor' + (allActive ? ' active' : '') });
  const allAvatar = _el('div', { className: 'taf-contributor-avatar', style: 'background:var(--accent)' });
  allAvatar.textContent = 'A';
  const allInfo = _el('div', { className: 'taf-contributor-info' });
  const allName = _el('div', { className: 'taf-contributor-name' });
  allName.textContent = 'All';
  const allStat = _el('div', { className: 'taf-contributor-stats' });
  allStat.textContent = entries.length + ' contributors';
  allInfo.appendChild(allName);
  allInfo.appendChild(allStat);
  allItem.appendChild(allAvatar);
  allItem.appendChild(allInfo);
  allItem.addEventListener('click', () => { _selectedContributor = null; _renderContributors(); _renderCommits(); _renderGraph(); });
  list.appendChild(allItem);

  for (const [name, data] of entries) {
    const active = _selectedContributor === name;
    const item = _el('div', { className: 'taf-contributor' + (active ? ' active' : '') });
    const avatar = _el('div', { className: 'taf-contributor-avatar', style: `background:${data.color || '#888'}` });
    avatar.textContent = _initials(name);
    const info = _el('div', { className: 'taf-contributor-info' });
    const nameEl = _el('div', { className: 'taf-contributor-name' });
    nameEl.textContent = name;
    const stat = _el('div', { className: 'taf-contributor-stats' });
    stat.textContent = `${data.commits} commits · +${_n(data.linesAdded)} / -${_n(data.linesRemoved)}`;
    info.appendChild(nameEl);
    info.appendChild(stat);
    const last = _el('div', { className: 'taf-contributor-last' });
    last.textContent = data.lastCommit ? _timeAgo(data.lastCommit) : '';
    item.appendChild(avatar);
    item.appendChild(info);
    item.appendChild(last);
    item.addEventListener('click', () => { _selectedContributor = name; _renderContributors(); _renderCommits(); _renderGraph(); });
    list.appendChild(item);
  }
}

// ── Graph ─────────────────────────────────────────────────────

function _getFilteredCommits() {
  let filtered = _commits;
  if (_selectedContributor) {
    filtered = filtered.filter(c => c.author === _selectedContributor);
  }
  if (_selectedGraphKey) {
    filtered = filtered.filter(c => _dateToGraphKey(c.date, _graphViewMode) === _selectedGraphKey);
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
    _selectedGraphKey = null;
  } else {
    _selectedGraphKey = key;
  }
  _renderCommits();
  _renderGraph();
}

function _renderGraph() {
  window.__tafBarClick = _onBarClick;
  const wrap = _panel.querySelector('#tafGraph');
  const filtered = _getFilteredCommits();
  if (!filtered.length) {
    wrap.innerHTML = '<div class="taf-empty">No data</div>';
    return;
  }

  const grouped = _groupByTime(filtered, _graphViewMode);
  if (!Object.keys(grouped).length) {
    wrap.innerHTML = '<div class="taf-empty">No data</div>';
    return;
  }

  _drawBarChart(wrap, grouped);
}

function _groupByTime(commits, mode) {
  const map = {};
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
    if (!map[key]) map[key] = { key, label: key, count: 0, commits: [] };
    map[key].count++;
    map[key].commits.push(c);
  }
  return map;
}

function _drawBarChart(wrap, grouped) {
  const keys = Object.keys(grouped).sort();
  if (!keys.length) { wrap.innerHTML = ''; return; }

  const contributors = Object.keys(_contributors);
  const w = Math.max(keys.length * 30, 300);
  const h = 140;
  const barPad = 4;
  const barW = Math.max(4, Math.min(20, (w / keys.length) - barPad));
  const contributorColors = {};
  contributors.forEach((name, i) => {
    contributorColors[name] = _contributors[name]?.color || '#888';
  });

  let maxCount = 0;
  for (const k of keys) maxCount = Math.max(maxCount, grouped[k].count);

  let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">`;
  const graphH = h - 20;

  // Grid lines
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = graphH - (graphH / gridLines) * i;
    svg += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="var(--border-subtle)" stroke-width="0.5"/>`;
    svg += `<text x="-4" y="${y + 3}" fill="var(--text-faint)" font-size="8" text-anchor="end">${Math.round((maxCount / gridLines) * i)}</text>`;
  }

  const isFiltered = _selectedGraphKey !== null;

  // Bars
  keys.forEach((key, ki) => {
    const g = grouped[key];
    const x = ki * (barW + barPad) + 4;
    const barH = maxCount > 0 ? (g.count / maxCount) * graphH : 0;
    const y = graphH - barH;
    const isActive = key === _selectedGraphKey;
    const opacity = isFiltered ? (isActive ? 1.0 : 0.2) : 0.85;
    const stroke = isActive ? 'var(--accent)' : 'none';
    const strokeW = isActive ? 2 : 0;
    const cursor = 'pointer';

    const onclick = `try{window.__tafBarClick && window.__tafBarClick('${key}')}catch(e){}`;

    if (_selectedContributor) {
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${contributorColors[_selectedContributor] || 'var(--accent)'}" rx="2" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeW}" style="cursor:${cursor}" onclick="${onclick}">
        <title>${key}: ${g.count} commits</title>
      </rect>`;
    } else if (contributors.length === 1) {
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${contributorColors[contributors[0]] || 'var(--accent)'}" rx="2" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeW}" style="cursor:${cursor}" onclick="${onclick}">
        <title>${key}: ${g.count} commits</title>
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
          <title>${key} — ${tooltip}</title>
        </rect>`;
      }
    }

    // X axis label
    const skip = Math.max(1, Math.floor(keys.length / 10));
    if (ki % skip === 0) {
      const label = key.slice(5);
      svg += `<text x="${x + barW / 2}" y="${h - 2}" fill="${isActive ? 'var(--accent)' : 'var(--text-faint)'}" font-size="7" text-anchor="middle" font-weight="${isActive ? 700 : 400}">${_esc(label)}</text>`;
    }
  });

  svg += '</svg>';
  wrap.innerHTML = svg;
}

// ── Commit list ───────────────────────────────────────────────

function _renderCommits() {
  const list = _panel.querySelector('#tafCommitList');
  const countEl = _panel.querySelector('#tafCommitCount');
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

function _openDrawer(commit) {
  _selectedCommit = commit;
  _selectedFile = null;
  const drawer = _panel.querySelector('#tafDrawer');
  drawer.classList.add('open');

  _panel.querySelector('#tafDrawerHash').textContent = _shortHash(commit.hash);

  // Meta
  const meta = _panel.querySelector('#tafDrawerMeta');
  const dateStr = commit.date ? new Date(commit.date).toLocaleString() : '—';
  meta.innerHTML = `
    <div class="taf-drawer-meta-row"><strong>Hash</strong> <code style="font-family:var(--font-mono);font-size:11px">${_esc(commit.hash)}</code></div>
    <div class="taf-drawer-meta-row"><strong>Author</strong> ${_esc(commit.author)} &lt;${_esc(commit.email)}&gt;</div>
    <div class="taf-drawer-meta-row"><strong>Date</strong> ${_esc(dateStr)}</div>
    <div class="taf-drawer-meta-row"><strong>Message</strong> ${_esc(commit.message)}</div>
  `;

  // Files
  const filesEl = _panel.querySelector('#tafDrawerFiles');
  if (commit.files && commit.files.length) {
    let fhtml = '';
    for (const f of commit.files) {
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
        _loadDiff(commit.hash, filePath);
        filesEl.querySelectorAll('.taf-drawer-file').forEach(e => e.style.background = '');
        el.style.background = 'var(--bg-active)';
      });
    });
  } else {
    filesEl.innerHTML = '<div style="font-size:11px;color:var(--text-faint);padding:8px">No file changes</div>';
  }

  // Diff
  _panel.querySelector('#tafDrawerDiff').innerHTML = '';
}

function _closeDrawer() {
  _selectedCommit = null;
  _selectedFile = null;
  _panel.querySelector('#tafDrawer').classList.remove('open');
  _panel.querySelector('#tafDrawerDiff').innerHTML = '';
  _renderCommits();
}

async function _loadDiff(hash, filePath) {
  const diffEl = _panel.querySelector('#tafDrawerDiff');
  diffEl.innerHTML = '<div class="taf-drawer-diff-loading">Loading diff\u2026</div>';

  const cacheKey = hash + '::' + filePath;
  if (_diffCache[cacheKey]) {
    _renderDiff(diffEl, _diffCache[cacheKey]);
    return;
  }

  try {
    const repoPath = _panel.dataset.repoPath;
    const result = await window.electronAPI.teamActivityDiff(repoPath, hash, filePath);
    const diff = result.diff || '';
    _diffCache[cacheKey] = diff;
    _renderDiff(diffEl, diff);
  } catch {
    diffEl.innerHTML = '<div class="taf-drawer-diff-loading">Failed to load diff</div>';
  }
}

function _renderDiff(el, diffText) {
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
