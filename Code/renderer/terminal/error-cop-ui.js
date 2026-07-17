const ICON_SHIELD = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2l8 4v5c0 4-3.5 7.5-8 9-4.5-1.5-8-5-8-9V6l8-4z"/><path d="M7 10l2 2 4-4"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';
const ICON_ERROR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M6 6l8 8"/></svg>';

function _fmtTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function _fmtDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TIME_PRESETS = [
  { value: 'today',      label: 'Today' },
  { value: 'this-week',  label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'pick-month', label: 'Pick Month\u2026' },
];

function _getDateRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  let start, end;

  switch (preset) {
    case 'today':
      start = new Date(y, m, d);
      end = new Date(y, m, d + 1);
      break;
    case 'this-week': {
      const day = now.getDay();
      start = new Date(y, m, d - (day === 0 ? 6 : day - 1));
      end = new Date(y, m, d + 1);
      break;
    }
    case 'this-month':
      start = new Date(y, m, 1);
      end = new Date(y, m + 1, 1);
      break;
    case 'last-month':
      start = new Date(y, m - 1, 1);
      end = new Date(y, m, 1);
      break;
    default:
      start = new Date(y, m, d);
      end = new Date(y, m, d + 1);
  }
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

export default class ErrorCopUI {
  constructor() {
    this._panel = null;
    this._wrapper = null;
    this._badgeEl = null;
    this._lastUnread = 0;
    this._activeTab = 'tools';
    this._timeline = [];
    this._errors = [];
    this._sessions = [];
    this._filter = 'all';
    this._toastTimer = null;
    this._isOpen = false;
    this._allBrowserServers = [];
    this._serverRunning = false;
    this._serverStarting = false;
    this._selectMode = false;
    this._selectedSessionIds = new Set();
    this._refreshTimer = null;
    this._timePreset = 'today';
    this._pickMonthEl = null;
    this._timeDropdownEl = null;
  }

  init() {
    this._createPanel();
    this._listenIPC();
  }

  createTerminalButton() {
    const btn = document.createElement('button');
    btn.className = 'ecp-terminal-btn';
    btn.id = 'ecpTerminalBtn';
    btn.title = 'Error Cop - View errors and timeline';
    btn.innerHTML = `${ICON_SHIELD} <span>Errors</span>`;
    btn.addEventListener('click', () => this.open());
    return btn;
  }

  getBadgeEl() {
    if (!this._badgeEl) {
      this._badgeEl = document.createElement('span');
      this._badgeEl.className = 'ecp-nav-badge';
      this._badgeEl.style.display = 'none';
      this._badgeEl.textContent = '0';
    }
    return this._badgeEl;
  }

  _createPanel() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'ecp-wrapper';
    this._wrapper.innerHTML = `
      <div class="ecp-panel">
        <div class="ecp-bg-glow"></div>
        <div class="ecp-header">
          <div class="ecp-header-left">
            <span class="ecp-title">Error Cop</span>
            <span class="ecp-subtitle">Session Monitor</span>
            <span class="ecp-header-badge" id="ecpHeaderBadge">ACTIVE</span>
          </div>
          <div class="ecp-header-actions" style="display:flex;align-items:center;gap:8px">
            <div class="ecp-time-dropdown-wrapper" style="position:relative">
              <button class="ecp-time-dropdown-btn" id="ecpTimeDropdownBtn" title="Select time range">
                <span id="ecpTimeLabel">Today</span>
                <span class="ecp-time-chevron">&#9662;</span>
              </button>
              <div class="ecp-time-dropdown" id="ecpTimeDropdown" style="display:none"></div>
            </div>
            <div class="ecp-info-line" style="margin:0;padding:4px 12px;font-size:11px">
              <span>Unread</span>
              <span class="ecp-info-value" id="ecpUnreadValue">0</span>
            </div>
            <button class="ecp-close-btn" id="ecpCloseBtn" title="Close">${ICON_CLOSE}</button>
          </div>
        </div>
        <div class="ecp-tab-bar">
          <button class="ecp-tab ecp-tab-active" data-tab="tools">Tools</button>
          <button class="ecp-tab" data-tab="timeline">Timeline</button>
          <button class="ecp-tab" data-tab="errors">Errors</button>
          <button class="ecp-tab" data-tab="sessions">Sessions</button>
        </div>
        <div class="ecp-body" id="ecpBody">
          <div class="ecp-left-column" id="ecpLeftCol"></div>
          <div class="ecp-right-column" id="ecpRightCol"></div>
        </div>
      </div>
    `;
    document.body.appendChild(this._wrapper);

    this._panel = this._wrapper;
    this._leftCol = this._wrapper.querySelector('#ecpLeftCol');
    this._rightCol = this._wrapper.querySelector('#ecpRightCol');
    this._closeBtn = this._wrapper.querySelector('#ecpCloseBtn');
    this._unreadEl = this._wrapper.querySelector('#ecpUnreadValue');
    this._headerBadge = this._wrapper.querySelector('#ecpHeaderBadge');

    this._closeBtn.addEventListener('click', () => this.close());

    this._wrapper.querySelectorAll('.ecp-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._wrapper.querySelectorAll('.ecp-tab').forEach(t => t.classList.remove('ecp-tab-active'));
        tab.classList.add('ecp-tab-active');
        this._activeTab = tab.dataset.tab;
        this._render();
      });
    });

    this._initTimeDropdown();
    this._createToast();
  }

  _createToast() {
    this._toast = document.createElement('div');
    this._toast.className = 'ecp-toast';
    this._toast.innerHTML = `<span class="ecp-toast-icon"></span><span class="ecp-toast-text" id="ecpToastText">New error detected</span>`;
    document.body.appendChild(this._toast);
  }

  _showToast(text) {
    const el = this._toast.querySelector('#ecpToastText');
    el.textContent = text;
    this._toast.classList.add('show');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toast.classList.remove('show');
    }, 4000);
  }

  _initTimeDropdown() {
    const btn = this._wrapper.querySelector('#ecpTimeDropdownBtn');
    const dd = this._wrapper.querySelector('#ecpTimeDropdown');
    const label = this._wrapper.querySelector('#ecpTimeLabel');
    this._timeDropdownEl = dd;

    const renderDD = () => {
      dd.innerHTML = '';
      TIME_PRESETS.forEach(p => {
        const opt = document.createElement('button');
        opt.className = 'ecp-time-option' + (p.value === this._timePreset ? ' active' : '');
        opt.textContent = p.label;
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          this._timePreset = p.value;
          label.textContent = p.label;
          dd.style.display = 'none';
          if (p.value === 'pick-month') {
            this._showMonthPicker(label);
          } else {
            this._reloadWithTimeRange();
          }
        });
        dd.appendChild(opt);
      });
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderDD();
      dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => {
      if (dd) dd.style.display = 'none';
    });
  }

  _showMonthPicker(labelEl) {
    const existing = document.querySelector('.ecp-month-picker');
    if (existing) existing.remove();

    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();

    const overlay = document.createElement('div');
    overlay.className = 'ecp-month-picker';
    overlay.innerHTML = `
      <div class="ecp-month-picker-inner">
        <div class="ecp-month-picker-header">
          <button class="ecp-mp-nav" id="ecpMpPrev">&#9664;</button>
          <span class="ecp-mp-title" id="ecpMpTitle">${new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
          <button class="ecp-mp-nav" id="ecpMpNext">&#9654;</button>
        </div>
        <div class="ecp-month-picker-grid" id="ecpMpGrid"></div>
        <button class="ecp-filter-btn" id="ecpMpApply" style="margin-top:8px;width:100%">Apply</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const renderGrid = () => {
      const grid = overlay.querySelector('#ecpMpGrid');
      grid.innerHTML = '';
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      months.forEach((mName, i) => {
        const btn = document.createElement('button');
        btn.className = 'ecp-mp-month' + (i === month ? ' active' : '');
        btn.textContent = mName;
        btn.addEventListener('click', () => {
          overlay.querySelectorAll('.ecp-mp-month').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          month = i;
          overlay.querySelector('#ecpMpTitle').textContent = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
        });
        grid.appendChild(btn);
      });
    };

    overlay.querySelector('#ecpMpPrev').addEventListener('click', () => { year--; overlay.querySelector('#ecpMpTitle').textContent = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' }); });
    overlay.querySelector('#ecpMpNext').addEventListener('click', () => { year++; overlay.querySelector('#ecpMpTitle').textContent = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' }); });

    overlay.querySelector('#ecpMpApply').addEventListener('click', () => {
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 1).toISOString();
      this._timePreset = 'custom';
      labelEl.textContent = new Date(year, month).toLocaleString('default', { month: 'short', year: 'numeric' });
      this._customRange = { startDate: start, endDate: end };
      overlay.remove();
      this._reloadWithTimeRange();
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    renderGrid();
  }

  async _reloadWithTimeRange() {
    await this._loadData();
    this._render();
  }

  _listenIPC() {
    window.electronAPI.onNewError(({ error }) => {
      try {
        if (error && error.title) {
          this._showToast(`🔴 ${error.title}`);
        }
      } catch (e) {
        console.error('[ErrorCop] onNewError handler failed:', e);
      }
    });

    window.electronAPI.onTimelineEvent((event) => {
      try {
        if (!event) return;
        this._timeline.unshift(event);
        if (this._timeline.length > 200) this._timeline.length = 200;
        if (this._isOpen && this._activeTab === 'timeline') this._renderTimeline();
      } catch (e) {
        console.error('[ErrorCop] onTimelineEvent handler failed:', e);
      }
    });

    window.electronAPI.onUnreadCount(({ count }) => {
      try {
        this._lastUnread = typeof count === 'number' ? count : 0;
        if (this._badgeEl) {
          this._badgeEl.textContent = count > 99 ? '99+' : String(count);
          this._badgeEl.style.display = count > 0 ? 'flex' : 'none';
        }
        if (this._unreadEl) this._unreadEl.textContent = String(this._lastUnread);
      } catch (e) {
        console.error('[ErrorCop] onUnreadCount handler failed:', e);
      }
    });
  }

  async open() {
    if (this._isOpen) return;
    this._isOpen = true;

    // Close other open tool panels BEFORE we show ours
    // (so our own panel isn't caught by closeAll's .ecp-wrapper check)
    try {
      const { closeAllPanels } = await import('../app_manager/toolsManager.js');
      closeAllPanels();
    } catch {}

    this._wrapper.classList.add('open');

    // Mark read when opening
    try {
      await window.electronAPI.markRead();
    } catch {}

    // Check server status
    try {
      const status = await window.electronAPI.getServerStatus();
      if (status) this._serverRunning = status.running;
    } catch {}

    // Load data
    await this._loadData();
    this._render();
    this._startRefresh();
  }

  close() {
    this._isOpen = false;
    this._wrapper.classList.remove('open');
    this._stopRefresh();
  }

  toggle() {
    if (this._isOpen) this.close();
    else this.open();
  }

  _startRefresh() {
    this._stopRefresh();
    this._refreshTimer = setInterval(() => this._pollBrowserServers(), 5000);
  }

  _stopRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  async _pollBrowserServers() {
    if (!this._isOpen) return;
    try {
      const servers = await window.electronAPI.getAllBrowserServers();
      if (!servers) return;
      if (JSON.stringify(this._allBrowserServers) !== JSON.stringify(servers)) {
        this._allBrowserServers = servers;
        if (this._activeTab === 'sessions' && !this._showOccurrenceView) {
          this._renderSessions();
        }
      }
    } catch {}
  }

  async _loadData() {
    try {
      let dateOpts = {};
      if (this._timePreset === 'custom' && this._customRange) {
        dateOpts = this._customRange;
      } else {
        dateOpts = _getDateRange(this._timePreset);
      }
      const [timeline, errors, sessions, allBrowserServers] = await Promise.all([
        window.electronAPI.getTimeline({ limit: 200, ...dateOpts }),
        window.electronAPI.getErrors({ limit: 200, ...dateOpts }),
        window.electronAPI.getSessions({ limit: 100, ...dateOpts }),
        window.electronAPI.getAllBrowserServers(),
      ]);
      this._timeline = timeline || [];
      this._errors = errors || [];
      this._sessions = sessions || [];
      this._allBrowserServers = allBrowserServers || [];
    } catch (err) {
      console.error('[ErrorCop] Load failed:', err);
    }
  }

  _render() {
    const body = this._wrapper ? this._wrapper.querySelector('#ecpBody') : null;
    if (body) {
      body.classList.toggle('full-width', this._activeTab === 'tools');
    }
    switch (this._activeTab) {
      case 'timeline': this._renderTimeline(); break;
      case 'errors': this._renderErrors(); break;
      case 'sessions': this._renderSessions(); break;
      case 'tools': this._renderTools(); break;
    }
  }

  _renderTimeline() {
    this._leftCol.innerHTML = '';
    this._rightCol.innerHTML = '';

    const items = this._timeline;

    if (items.length === 0) {
      this._leftCol.innerHTML = `<div class="ecp-empty"><div class="ecp-empty-icon">${ICON_SHIELD}</div><div>No events yet. Run a command in the terminal.</div></div>`;
      return;
    }

    const list = document.createElement('div');
    list.className = 'ecp-timeline';

    for (const ev of items) {
      const dotClass = ev.type === 'error' ? 'ecp-dot-error' : ev.type === 'warning' ? 'ecp-dot-warning' : ev.type === 'server' ? 'ecp-dot-server' : 'ecp-dot-info';
      const row = document.createElement('div');
      row.className = 'ecp-event';
      row.innerHTML = `
        <span class="ecp-event-dot ${dotClass}"></span>
        <div class="ecp-event-body">
          <span class="ecp-event-title">${this._escapeHtml(ev.title || '')}</span>
          <span class="ecp-event-message">${this._escapeHtml(ev.message || '')}</span>
        </div>
        <div class="ecp-event-meta">
          <span class="ecp-event-time">${_fmtTime(ev.timestamp)}</span>
          ${ev.errorId ? '<span class="ecp-event-count">!</span>' : ''}
        </div>
      `;
      list.appendChild(row);
    }

    this._leftCol.appendChild(list);

    // Right column: show stats
    const errorCount = items.filter(e => e.type === 'error').length;
    const warnCount = items.filter(e => e.type === 'warning').length;
    const infoCount = items.filter(e => e.type === 'info' || e.type === 'server').length;
    this._rightCol.innerHTML = `
      <div class="ecp-info-line">
        <span>Errors</span>
        <span class="ecp-info-value" style="color:#ff4444">${errorCount}</span>
      </div>
      <div class="ecp-info-line">
        <span>Warnings</span>
        <span class="ecp-info-value" style="color:#eab308">${warnCount}</span>
      </div>
      <div class="ecp-info-line">
        <span>Info / Server</span>
        <span class="ecp-info-value" style="color:#3b8eea">${infoCount}</span>
      </div>
      <div class="ecp-info-line">
        <span>Total Events</span>
        <span class="ecp-info-value">${items.length}</span>
      </div>
    `;
  }

  _renderErrors() {
    this._leftCol.innerHTML = '';
    this._rightCol.innerHTML = '';

    // Filter bar
    const filterBar = document.createElement('div');
    filterBar.className = 'ecp-filters';
    ['all', 'error', 'warning'].forEach(f => {
      const btn = document.createElement('button');
      btn.className = `ecp-filter-btn${f === this._filter ? ' active' : ''}`;
      btn.textContent = f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1);
      btn.addEventListener('click', () => {
        this._filter = f;
        this._renderErrors();
      });
      filterBar.appendChild(btn);
    });
    this._leftCol.appendChild(filterBar);

    let items = this._errors;
    if (this._filter !== 'all') {
      items = items.filter(e => e.level === this._filter);
    }

    if (items.length === 0) {
      this._leftCol.innerHTML += `<div class="ecp-empty"><div class="ecp-empty-icon">${ICON_SHIELD}</div><div>No errors recorded.</div></div>`;
      return;
    }

    const list = document.createElement('div');
    list.className = 'ecp-timeline';

    for (const err of items) {
      const dotClass = err.level === 'error' ? 'ecp-dot-error' : err.level === 'warning' ? 'ecp-dot-warning' : 'ecp-dot-info';
      const rawMsg = err.message || '';
      const msgFirstLine = rawMsg.split('\n')[0] || '';
      const isMultiline = rawMsg.indexOf('\n') > 0;
      const row = document.createElement('div');
      row.className = 'ecp-event';
      row.innerHTML = `
        <span class="ecp-event-dot ${dotClass}"></span>
        <div class="ecp-event-body">
          <span class="ecp-event-title">${this._escapeHtml(err.title || '')}</span>
          <span class="ecp-event-message">${this._escapeHtml(msgFirstLine)}${isMultiline ? ' <span class="ecp-msg-more">…</span>' : ''}</span>
        </div>
        <div class="ecp-event-meta">
          <span class="ecp-event-time">${_fmtTime(err.timestamp)}</span>
          ${err.occurrences > 1 ? `<span class="ecp-event-count">${err.occurrences}x</span>` : ''}
        </div>
      `;
      list.appendChild(row);
    }

    this._leftCol.appendChild(list);

    // Right column: stats
    const errCount = items.filter(e => e.level === 'error').length;
    const warnCount = items.filter(e => e.level === 'warning').length;
    this._rightCol.innerHTML = `
      <div class="ecp-info-line">
        <span>🔴 Errors</span>
        <span class="ecp-info-value" style="color:#ff4444">${errCount}</span>
      </div>
      <div class="ecp-info-line">
        <span>🟡 Warnings</span>
        <span class="ecp-info-value" style="color:#eab308">${warnCount}</span>
      </div>
      <div class="ecp-info-line">
        <span>Total</span>
        <span class="ecp-info-value">${items.length}</span>
      </div>
    `;
  }

  _renderSessions() {
    if (this._showOccurrenceView && this._currentSession) {
      this._renderSessionOccurrences();
      return;
    }

    this._leftCol.innerHTML = '';
    this._rightCol.innerHTML = '';

    const sessions = this._sessions;

    if (sessions.length === 0) {
      this._leftCol.innerHTML = `<div class="ecp-empty"><div class="ecp-empty-icon">${ICON_SHIELD}</div><div>No terminal sessions yet.</div></div>`;
      return;
    }

    this._leftCol.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0">
        <span style="font-size:12px;font-weight:600;color:#8899aa">${sessions.length} session${sessions.length !== 1 ? 's' : ''}</span>
        <div style="display:flex;gap:6px">
          ${this._selectMode ? `
            <button class="ecp-filter-btn" id="ecpSelectAllBtn" style="padding:3px 12px;font-size:11px">${this._selectedSessionIds.size === sessions.length ? 'Deselect All' : 'Select All'}</button>
            <button class="ecp-filter-btn" id="ecpDeleteSelected" style="padding:3px 12px;font-size:11px;border-color:#ff4444;color:#ff4444" ${this._selectedSessionIds.size === 0 ? 'disabled' : ''}>Delete (${this._selectedSessionIds.size})</button>
            <button class="ecp-filter-btn" id="ecpCancelSelect" style="padding:3px 12px;font-size:11px">Cancel</button>
          ` : `
            <button class="ecp-filter-btn" id="ecpEnterSelect" style="padding:3px 12px;font-size:11px;border-color:#ff4444;color:#ff4444">Delete</button>
          `}
        </div>
      </div>
    `;

    const enterBtn = this._leftCol.querySelector('#ecpEnterSelect');
    if (enterBtn) {
      enterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectMode = true;
        this._selectedSessionIds.clear();
        this._renderSessions();
      });
    }

    const cancelBtn = this._leftCol.querySelector('#ecpCancelSelect');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectMode = false;
        this._selectedSessionIds.clear();
        this._renderSessions();
      });
    }

    const selectAllBtn = this._leftCol.querySelector('#ecpSelectAllBtn');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._selectedSessionIds.size === sessions.length) {
          this._selectedSessionIds.clear();
        } else {
          this._selectedSessionIds = new Set(sessions.map(s => s.id));
        }
        this._renderSessions();
      });
    }

    const deleteBtn = this._leftCol.querySelector('#ecpDeleteSelected');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._deleteSelected();
      });
    }

    const list = document.createElement('div');
    list.className = 'ecp-sessions';

    for (const s of sessions) {
      const statusClass = s.ended_reason === 'killed' ? 'ecp-session-killed' : `ecp-session-${s.status || 'ended'}`;
      const statusText = s.ended_reason === 'killed' ? 'Killed' : (s.status || 'ended');
      const labelText = s.label || s.project || 'Terminal';
      const browserInfo = (this._allBrowserServers || []).filter(b => b.session_id === s.id);
      const sId = s.id;
      const isSelected = this._selectedSessionIds.has(sId);

      const card = document.createElement('div');
      card.className = 'ecp-session-card' + (isSelected ? ' ecp-session-selected' : '');
      if (this._selectMode) {
        card.style.cursor = 'default';
      }

      let browserHtml = '';
      if (browserInfo.length) {
        browserHtml = browserInfo.map(b =>
          `<span style="color:#3b8eea;font-size:11px">\ud83c\udf10 ${this._escapeHtml(b.framework || 'Dev Server')} (${this._escapeHtml(b.url || '')})</span>`
        ).join('');
      }

      const checkboxHtml = this._selectMode
        ? `<span style="display:flex;align-items:center;margin-right:6px;flex-shrink:0">
            <span class="ecp-checkbox${isSelected ? ' ecp-checkbox-checked' : ''}" data-session-id="${sId}"></span>
          </span>`
        : '';

      card.innerHTML = `
        <div class="ecp-session-row">
          ${checkboxHtml}
          <span class="ecp-session-project" style="${this._selectMode ? 'flex:1' : ''}">${this._escapeHtml(labelText)}</span>
          <span class="ecp-session-command" style="${this._selectMode ? 'display:none' : ''}">${this._escapeHtml(s.command || '')}</span>
          <span class="ecp-session-status ${statusClass}">${statusText}</span>
        </div>
        ${browserHtml ? `<div class="ecp-session-row" style="gap:4px;padding-left:${this._selectMode ? '26px' : '0'}">${browserHtml}</div>` : ''}
        <div class="ecp-session-row" style="${browserHtml ? 'margin-top:4px' : ''}${this._selectMode ? 'padding-left:26px' : ''}">
          <div class="ecp-session-stats">
            <span>Errors: <strong style="color:#ff4444">${s.total_errors || 0}</strong></span>
            <span>Warnings: <strong style="color:#eab308">${s.total_warnings || 0}</strong></span>
            <span>Lines: <strong>${s.total_lines || 0}</strong></span>
          </div>
          <span class="ecp-session-time">${_fmtDate(s.started_at)}</span>
        </div>
      `;

      if (this._selectMode) {
        const checkbox = card.querySelector('.ecp-checkbox');
        if (checkbox) {
          checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleSessionSelect(sId);
          });
        }
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggleSessionSelect(sId);
        });
      } else {
        card.addEventListener('click', async () => {
          try {
            const occurrences = await window.electronAPI.getSessionOccurrences(s.id);
            this._currentSession = s;
            this._sessionOccurrences = occurrences || [];
            this._showOccurrenceView = true;
            await this._renderSessionOccurrences();
          } catch {}
        });
      }
      list.appendChild(card);
    }

    this._leftCol.appendChild(list);

    this._rightCol.innerHTML = '';
  }

  _toggleSessionSelect(id) {
    if (this._selectedSessionIds.has(id)) {
      this._selectedSessionIds.delete(id);
    } else {
      this._selectedSessionIds.add(id);
    }
    this._renderSessions();
  }

  async _deleteSelected() {
    const ids = [...this._selectedSessionIds];
    if (!ids.length) return;
    const confirmed = await this._showConfirmModal({
      title: 'Delete Sessions',
      message: `Delete ${ids.length} session${ids.length !== 1 ? 's' : ''} and all associated errors and browser data?`,
      note: 'This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await window.electronAPI.deleteSessions(ids);
      this._selectMode = false;
      this._selectedSessionIds.clear();
      await this._loadData();
      this._renderSessions();
    } catch (e) {
      console.error('[ErrorCop] deleteSessions failed:', e);
    }
  }

  _showConfirmModal({ title, message, note, confirmText, danger }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'ecp-modal-overlay';
      overlay.innerHTML = `
        <div class="ecp-modal">
          <div class="ecp-modal-title">${this._escapeHtml(title || 'Confirm')}</div>
          <div class="ecp-modal-message">${this._escapeHtml(message || '')}</div>
          ${note ? `<div class="ecp-modal-note">${this._escapeHtml(note)}</div>` : ''}
          <div class="ecp-modal-actions">
            <button class="ecp-filter-btn ecp-modal-cancel">Cancel</button>
            <button class="ecp-filter-btn ecp-modal-confirm" style="${danger ? 'border-color:#ff4444;color:#ff4444' : ''}">${this._escapeHtml(confirmText || 'OK')}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('open'));

      const close = (result) => {
        overlay.classList.remove('open');
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      };

      overlay.querySelector('.ecp-modal-cancel').addEventListener('click', () => close(false));
      overlay.querySelector('.ecp-modal-confirm').addEventListener('click', () => close(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });
    });
  }

  async _renderSessionOccurrences() {
    this._leftCol.innerHTML = '';
    this._rightCol.innerHTML = '';

    const s = this._currentSession;
    const items = this._sessionOccurrences || [];

    // Back button + header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-shrink:0';
    const backBtn = document.createElement('button');
    backBtn.className = 'ecp-filter-btn';
    backBtn.innerHTML = '\u2190 Back to Sessions';
    backBtn.addEventListener('click', () => {
      this._showOccurrenceView = false;
      this._currentSession = null;
      this._sessionOccurrences = [];
      this._renderSessions();
    });
    header.appendChild(backBtn);
    const title = document.createElement('span');
    title.style.cssText = 'font-size:12px;font-weight:600;color:#f0dfdf';
    const occLabel = s.label || s.project || 'Terminal';
    title.textContent = `${this._escapeHtml(occLabel)} \u2014 ${this._escapeHtml(s.command || '')}`;
    header.appendChild(title);
    this._leftCol.appendChild(header);

    // ── Browser Server Section ──
    const browserServers = await window.electronAPI.getBrowserServers(s.id).catch(() => []);
    if (!this._showOccurrenceView) return;

    const attachedBrowsers = await window.electronAPI.getAttachedBrowsers().catch(() => ({}));
    if (!this._showOccurrenceView) return;

    if (browserServers.length > 0) {
      const browserSection = document.createElement('div');
      browserSection.style.cssText = 'margin-bottom:10px;padding:8px 10px;background:rgba(59,142,234,0.1);border-radius:6px;border:1px solid rgba(59,142,234,0.25);flex-shrink:0';

      for (const bs of browserServers) {
        const isAttached = !!attachedBrowsers[bs.port];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px';
        row.innerHTML = `
          <span style="color:#3b8eea">\ud83c\udf10</span>
          <span style="flex:1;color:#c0d0e0">${this._escapeHtml(bs.framework || 'Dev Server')}</span>
          <span style="color:#7a8a9a">${this._escapeHtml(bs.url || '')}</span>
        `;

        const btn = document.createElement('button');
        btn.className = 'ecp-filter-btn';
        btn.style.cssText = 'padding:2px 10px;font-size:11px';
        if (isAttached) {
          btn.textContent = 'Detach';
          btn.style.borderColor = '#23d18b';
          btn.style.color = '#23d18b';
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
              await window.electronAPI.browserDetach(bs.port);
              await this._renderSessionOccurrences();
            } catch {}
          });
        } else {
          btn.textContent = 'Attach';
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
              await window.electronAPI.browserAttach({ sessionId: s.id, port: bs.port, url: bs.url });
              await this._renderSessionOccurrences();
            } catch {}
          });
        }
        row.appendChild(btn);
        browserSection.appendChild(row);
      }

      this._leftCol.appendChild(browserSection);
    }

    if (items.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'ecp-empty';
      emptyEl.innerHTML = `<div class="ecp-empty-icon">${ICON_SHIELD}</div><div>No errors in this session.</div>`;
      this._leftCol.appendChild(emptyEl);
      this._renderSessionRight(s, items, browserServers);
      return;
    }

    const list = document.createElement('div');
    list.className = 'ecp-timeline';

    for (const occ of items) {
      const isBrowser = (occ.line_text || '').startsWith('[Browser]');
      const dotClass = occ.level === 'error' ? 'ecp-dot-error' : occ.level === 'warning' ? 'ecp-dot-warning' : 'ecp-dot-info';
      const sourceBadge = isBrowser
        ? '<span style="font-size:10px;color:#3b8eea;margin-right:4px">\ud83c\udf10</span>'
        : '<span style="font-size:10px;color:#8a9aaa;margin-right:4px">\ud83d\udda5\ufe0f</span>';
      const fullText = occ.line_text || occ.message || occ.title || '';
      const lineCount = fullText.split('\n').length;
      const row = document.createElement('div');
      row.className = 'ecp-event ecp-event-expanded';
      row.innerHTML = `
        <span class="ecp-event-dot ${dotClass}" style="align-self:flex-start;margin-top:3px"></span>
        <div class="ecp-event-body">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="ecp-event-title">${sourceBadge}${this._escapeHtml(occ.title || '')}</span>
            ${lineCount > 1 ? `<span class="ecp-line-count">${lineCount} lines</span>` : ''}
            <button class="ecp-copy-btn" title="Copy error text">\ud83d\udccb</button>
          </div>
          <pre class="ecp-event-text">${this._escapeHtml(fullText)}</pre>
        </div>
        <div class="ecp-event-meta" style="align-self:flex-start;margin-top:3px">
          <span class="ecp-event-time">${_fmtTime(occ.timestamp)}</span>
        </div>
      `;
      const copyBtn = row.querySelector('.ecp-copy-btn');
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(fullText).then(() => {
          copyBtn.textContent = '\u2713';
          setTimeout(() => { copyBtn.textContent = '\ud83d\udccb'; }, 1500);
        }).catch(() => {});
      });
      list.appendChild(row);
    }

    this._leftCol.appendChild(list);

    this._renderSessionRight(s, items, browserServers);
  }

  _renderSessionRight(s, items, browserServers) {
    const terminal = items.filter(i => !(i.line_text || '').startsWith('[Browser]'));
    const browser = items.filter(i => (i.line_text || '').startsWith('[Browser]'));
    const termErrors = terminal.filter(e => e.level === 'error').length;
    const termWarns = terminal.filter(e => e.level === 'warning').length;
    const brwErrors = browser.filter(e => e.level === 'error').length;
    const brwWarns = browser.filter(e => e.level === 'warning').length;

    let browserSourcesHtml = '';
    if (browserServers && browserServers.length > 0) {
      browserSourcesHtml = browserServers.map(bs =>
        `<div class="ecp-info-line" style="font-size:11px;color:#7a8a9a;padding-left:4px">
          <span>\ud83c\udf10 ${this._escapeHtml(bs.framework || 'Dev Server')} — ${this._escapeHtml(bs.url || '')}</span>
        </div>`
      ).join('');
    }

    const statusText = s.ended_reason === 'killed' ? 'Killed' : (s.status || 'ended');
    const statusColor = s.ended_reason === 'killed' ? '#f87171' : (s.status === 'running' ? '#23d18b' : '#8899aa');

    this._rightCol.innerHTML = `
      <div class="ecp-info-line">
        <span>Session ID</span>
        <span class="ecp-info-value">#${s.id}</span>
      </div>
      <div class="ecp-info-line">
        <span>Label</span>
        <span class="ecp-info-value" style="color:#f0dfdf">${this._escapeHtml(s.label || '-')}</span>
      </div>
      <div class="ecp-info-line">
        <span>Status</span>
        <span class="ecp-info-value" style="color:${statusColor}">${statusText}</span>
      </div>
      <div class="ecp-info-line">
        <span>Started</span>
        <span class="ecp-info-value">${_fmtDate(s.started_at)}</span>
      </div>
      <div class="ecp-info-line" style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px">
        <span style="font-weight:600;font-size:11px">Sources</span>
        <span></span>
      </div>
      <div class="ecp-info-line">
        <span style="padding-left:4px">\ud83d\udda5\ufe0f Terminal</span>
        <span class="ecp-info-value">${termErrors} err · ${termWarns} warn</span>
      </div>
      ${browserServers && browserServers.length > 0 ? `
      <div class="ecp-info-line">
        <span style="padding-left:4px">\ud83c\udf10 Browser</span>
        <span class="ecp-info-value">${brwErrors} err · ${brwWarns} warn</span>
      </div>
      ${browserSourcesHtml}` : ''}
      <div class="ecp-info-line" style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px">
        <span>Total Occurrences</span>
        <span class="ecp-info-value">${items.length}</span>
      </div>
    `;
  }

  async _renderTools() {
    try {
      const status = await window.electronAPI.getServerStatus();
      this._serverRunning = status && status.running;
    } catch {}

    this._leftCol.innerHTML = '';
    this._rightCol.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'ecp-landing';

    const statusColor = this._serverStarting ? '#eab308' : this._serverRunning ? '#23d18b' : '#6d5050';
    const statusText = this._serverStarting ? 'Starting...' : this._serverRunning ? 'Running' : 'Stopped';

    container.innerHTML = `
      <div class="ecp-landing-glow"></div>
      <div class="ecp-landing-icon">${ICON_SHIELD}</div>
      <div class="ecp-landing-title">Error Cop</div>
      <div class="ecp-landing-subtitle">Runtime Error Monitor &middot; Localhost API on port 3334</div>

      <div class="ecp-landing-status">
        <span class="ecp-landing-dot" style="background:${statusColor};box-shadow:0 0 8px ${statusColor}"></span>
        ${statusText}
      </div>

      <div class="ecp-landing-actions">
        <button class="ecp-landing-btn ecp-landing-btn-primary ecp-server-start" ${this._serverRunning || this._serverStarting ? 'disabled' : ''}>
          ${this._serverRunning ? 'Server Running' : 'Start Server'}
        </button>
        <button class="ecp-landing-btn ecp-server-stop" ${!this._serverRunning ? 'disabled' : ''}>
          Stop Server
        </button>
        <button class="ecp-landing-btn ecp-server-copy-url">
          Copy URL
        </button>
      </div>

      <div class="ecp-landing-divider"></div>

      <div class="ecp-landing-section-title">AI Cheatsheet</div>
      <div class="ecp-landing-desc">Auto-generated guide that tells AI agents how to use the Error Cop API. View it and send to AI.</div>
      <button class="ecp-landing-btn ecp-cheatsheet-btn" style="margin-top:4px">
        View &amp; Send to AI
      </button>
    `;

    this._leftCol.appendChild(container);

    this._leftCol.querySelector('.ecp-server-start').addEventListener('click', () => this._handleServerStart());
    this._leftCol.querySelector('.ecp-server-stop').addEventListener('click', () => this._handleServerStop());
    this._leftCol.querySelector('.ecp-server-copy-url').addEventListener('click', () => this._handleCopyUrl());
    this._leftCol.querySelector('.ecp-cheatsheet-btn').addEventListener('click', () => this._handleCheatsheet());
  }

  async _handleServerStart() {
    if (this._serverStarting) return;
    this._serverStarting = true;
    this._serverRunning = false;
    this._renderTools();
    try {
      const result = await window.electronAPI.startServer();
      if (result && result.success) {
        this._serverRunning = true;
      } else {
        console.error('[ErrorCop] Start server failed:', result?.error);
      }
    } catch (e) {
      console.error('[ErrorCop] Start server error:', e);
    }
    this._serverStarting = false;
    this._renderTools();
  }

  async _handleServerStop() {
    if (!this._serverRunning) return;
    try {
      const result = await window.electronAPI.stopServer();
      if (result && result.success) {
        this._serverRunning = false;
      }
    } catch (e) {
      console.error('[ErrorCop] Stop server error:', e);
    }
    this._renderTools();
  }

  async _handleCopyUrl() {
    const url = 'http://127.0.0.1:3334';
    try {
      await navigator.clipboard.writeText(url);
      const btn = this._leftCol.querySelector('.ecp-server-copy-url');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      }
    } catch {}
  }

  async _handleCheatsheet() {
    const repoPath = window.__activeRepoPath;
    if (!repoPath) return;
    const csPath = (repoPath + '/graphify/prompts/errorcop-cheatsheet.md').replace(/\\/g, '/');
    try {
      const result = await window.electronAPI.readFile(csPath);
      if (result && result.success && result.content) {
        this._showSendToAiDialog(result.content);
      } else {
        console.warn('[ErrorCop] Cheatsheet not found at:', csPath);
      }
    } catch (e) {
      console.error('[ErrorCop] Failed to read cheatsheet:', e);
    }
  }

  _showSendToAiDialog(promptText) {
    const existing = document.querySelector('.ecp-sa-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ecp-sa-overlay';
    overlay.innerHTML = `
      <div class="ecp-sa-dialog">
        <div class="ecp-sa-header">
          <span class="ecp-sa-title">Send to AI</span>
          <button class="ecp-sa-close" id="ecpSaClose">&times;</button>
        </div>
        <div class="ecp-sa-body">
          <div class="ecp-sa-card" id="ecpSaOpenFile">
            <div class="ecp-sa-card-icon">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h7l3 3v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M11 4v3h3"/></svg>
            </div>
            <div class="ecp-sa-card-text">
              <span class="ecp-sa-card-label">Open File</span>
              <span class="ecp-sa-card-desc">View the cheatsheet in a modal and copy it manually.</span>
            </div>
          </div>
          <div class="ecp-sa-card" id="ecpSaOpenCodeSwamp">
            <div class="ecp-sa-card-icon">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2z"/><path d="M10 8v4"/><path d="M8 10h4"/></svg>
            </div>
            <div class="ecp-sa-card-text">
              <span class="ecp-sa-card-label">Open CodeSwamp</span>
              <span class="ecp-sa-card-desc">Send the cheatsheet directly to CodeSwamp input.</span>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector('#ecpSaClose').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('keydown', function saEscape(e) {
      if (e.key === 'Escape' && document.querySelector('.ecp-sa-overlay')) {
        overlay.remove();
        document.removeEventListener('keydown', saEscape);
      }
    });

    overlay.querySelector('#ecpSaOpenFile').addEventListener('click', () => {
      overlay.remove();
      this._showPromptViewer(promptText);
    });

    overlay.querySelector('#ecpSaOpenCodeSwamp').addEventListener('click', () => {
      overlay.remove();
      this._openCodeSwampWithPrompt(promptText);
    });
  }

  _showPromptViewer(promptText) {
    const existing = document.querySelector('.ecp-prompt-viewer');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ecp-prompt-viewer';
    overlay.innerHTML = `
      <div class="ecp-pv-header">
        <span class="ecp-pv-title">errorcop-cheatsheet.md</span>
        <div class="ecp-pv-actions">
          <button class="ecp-pv-copy-btn" id="ecpPvCopy">Copy</button>
          <button class="ecp-pv-close" id="ecpPvClose">&times;</button>
        </div>
      </div>
      <pre class="ecp-pv-content" id="ecpPvContent">${this._escapeHtml(promptText)}</pre>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#ecpPvClose').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.addEventListener('keydown', function pvEscape(e) {
      if (e.key === 'Escape' && document.querySelector('.ecp-prompt-viewer')) {
        overlay.remove();
        document.removeEventListener('keydown', pvEscape);
      }
    });

    overlay.querySelector('#ecpPvCopy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(promptText);
        const btn = overlay.querySelector('#ecpPvCopy');
        btn.textContent = 'Copied';
        btn.classList.add('ecp-pv-copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('ecp-pv-copied');
        }, 2000);
      } catch {}
    });
  }

  _openCodeSwampWithPrompt(promptText) {
    try {
      const btn = document.querySelector('[data-tool="opencode"]');
      if (btn) btn.click();

      let input = document.getElementById('ocInput');
      let tab = document.querySelector('.oc-tab.active');
      const poll = setInterval(() => {
        if (!input) input = document.getElementById('ocInput');
        if (!tab) tab = document.querySelector('.oc-tab.active');
        if (input && tab) {
          clearInterval(poll);
          input.value = promptText;
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 200) + 'px';
          input.focus();
          input.selectionStart = input.selectionEnd = input.value.length;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 200);
      setTimeout(() => clearInterval(poll), 6000);
    } catch (e) {
      console.error('[ErrorCop] Failed to open CodeSwamp:', e);
    }
  }

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
