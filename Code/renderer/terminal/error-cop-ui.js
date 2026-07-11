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

export default class ErrorCopUI {
  constructor() {
    this._panel = null;
    this._wrapper = null;
    this._badgeEl = null;
    this._lastUnread = 0;
    this._activeTab = 'timeline';
    this._timeline = [];
    this._errors = [];
    this._sessions = [];
    this._filter = 'all';
    this._toastTimer = null;
    this._isOpen = false;
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
            <div class="ecp-info-line" style="margin:0;padding:4px 12px;font-size:11px">
              <span>Unread</span>
              <span class="ecp-info-value" id="ecpUnreadValue">0</span>
            </div>
            <button class="ecp-close-btn" id="ecpCloseBtn" title="Close">${ICON_CLOSE}</button>
          </div>
        </div>
        <div class="ecp-tab-bar">
          <button class="ecp-tab ecp-tab-active" data-tab="timeline">Timeline</button>
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

  _listenIPC() {
    window.electronAPI.onNewError(({ error }) => {
      this._showToast(`🔴 ${error.title}`);
    });

    window.electronAPI.onTimelineEvent((event) => {
      this._timeline.unshift(event);
      if (this._timeline.length > 200) this._timeline.length = 200;
      if (this._isOpen && this._activeTab === 'timeline') this._renderTimeline();
    });

    window.electronAPI.onUnreadCount(({ count }) => {
      this._lastUnread = count;
      if (this._badgeEl) {
        this._badgeEl.textContent = count > 99 ? '99+' : String(count);
        this._badgeEl.style.display = count > 0 ? 'flex' : 'none';
      }
      if (this._unreadEl) this._unreadEl.textContent = String(count);
    });
  }

  async open() {
    if (this._isOpen) return;
    this._isOpen = true;
    this._wrapper.classList.add('open');

    // Mark read when opening
    try {
      await window.electronAPI.markRead();
    } catch {}

    // Load data
    await this._loadData();
    this._render();
  }

  close() {
    this._isOpen = false;
    this._wrapper.classList.remove('open');
  }

  toggle() {
    if (this._isOpen) this.close();
    else this.open();
  }

  async _loadData() {
    try {
      const [timeline, errors, sessions] = await Promise.all([
        window.electronAPI.getTimeline({ limit: 100 }),
        window.electronAPI.getErrors({ limit: 100 }),
        window.electronAPI.getSessions(30),
      ]);
      this._timeline = timeline || [];
      this._errors = errors || [];
      this._sessions = sessions || [];
    } catch (err) {
      console.error('[ErrorCop] Load failed:', err);
    }
  }

  _render() {
    switch (this._activeTab) {
      case 'timeline': this._renderTimeline(); break;
      case 'errors': this._renderErrors(); break;
      case 'sessions': this._renderSessions(); break;
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
      const row = document.createElement('div');
      row.className = 'ecp-event';
      row.innerHTML = `
        <span class="ecp-event-dot ${dotClass}"></span>
        <div class="ecp-event-body">
          <span class="ecp-event-title">${this._escapeHtml(err.title || '')}</span>
          <span class="ecp-event-message">${this._escapeHtml(err.message || '')}</span>
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
    this._leftCol.innerHTML = '';
    this._rightCol.innerHTML = '';

    const sessions = this._sessions;

    if (sessions.length === 0) {
      this._leftCol.innerHTML = `<div class="ecp-empty"><div class="ecp-empty-icon">${ICON_SHIELD}</div><div>No terminal sessions yet.</div></div>`;
      return;
    }

    const list = document.createElement('div');
    list.className = 'ecp-sessions';

    for (const s of sessions) {
      const statusClass = `ecp-session-${s.status || 'ended'}`;
      const card = document.createElement('div');
      card.className = 'ecp-session-card';
      card.innerHTML = `
        <div class="ecp-session-row">
          <span class="ecp-session-project">${this._escapeHtml(s.project || 'Terminal')}</span>
          <span class="ecp-session-command">${this._escapeHtml(s.command || '')}</span>
          <span class="ecp-session-status ${statusClass}">${s.status || 'ended'}</span>
        </div>
        <div class="ecp-session-row">
          <div class="ecp-session-stats">
            <span>Errors: <strong style="color:#ff4444">${s.total_errors || 0}</strong></span>
            <span>Warnings: <strong style="color:#eab308">${s.total_warnings || 0}</strong></span>
            <span>Lines: <strong>${s.total_lines || 0}</strong></span>
          </div>
          <span class="ecp-session-time">${_fmtDate(s.started_at)}</span>
        </div>
      `;
      card.addEventListener('click', async () => {
        try {
          const sessionErrors = await window.electronAPI.getSessionErrors(s.id);
          this._errors = sessionErrors || [];
          this._activeTab = 'errors';
          this._wrapper.querySelectorAll('.ecp-tab').forEach(t => t.classList.remove('ecp-tab-active'));
          this._wrapper.querySelector('[data-tab="errors"]').classList.add('ecp-tab-active');
          this._renderErrors();
        } catch {}
      });
      list.appendChild(card);
    }

    this._leftCol.appendChild(list);

    // Right column: session stats
    const totalErrors = sessions.reduce((sum, s) => sum + (s.total_errors || 0), 0);
    const totalWarnings = sessions.reduce((sum, s) => sum + (s.total_warnings || 0), 0);
    const totalLines = sessions.reduce((sum, s) => sum + (s.total_lines || 0), 0);
    const running = sessions.filter(s => s.status === 'running').length;
    this._rightCol.innerHTML = `
      <div class="ecp-info-line">
        <span>Sessions</span>
        <span class="ecp-info-value">${sessions.length}</span>
      </div>
      <div class="ecp-info-line">
        <span>Running Now</span>
        <span class="ecp-info-value" style="color:#23d18b">${running}</span>
      </div>
      <div class="ecp-info-line">
        <span>🔴 Total Errors</span>
        <span class="ecp-info-value" style="color:#ff4444">${totalErrors}</span>
      </div>
      <div class="ecp-info-line">
        <span>🟡 Total Warnings</span>
        <span class="ecp-info-value" style="color:#eab308">${totalWarnings}</span>
      </div>
      <div class="ecp-info-line">
        <span>Total Lines</span>
        <span class="ecp-info-value">${totalLines}</span>
      </div>
    `;
  }

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
