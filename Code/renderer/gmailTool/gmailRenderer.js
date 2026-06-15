const ICONS = {
  gmail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8l10 6 10-6"/></svg>',
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 4v12"/><path d="M4 10h12"/></svg>',
  trash: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h14"/><path d="M6 5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M8 9v6"/><path d="M12 9v6"/><path d="M5 5l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"/></svg>',
  refresh: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 10a7 7 0 1 1-2-5"/><path d="M17 3v5h-5"/></svg>',
  external: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><path d="M13 3h4v4"/><path d="M11 9l6-6"/></svg>',
  check: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 10l4 4 8-8"/></svg>',
  back: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 4l-6 6 6 6"/></svg>',
  chevronDown: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 8l4 4 4-4"/></svg>',
};

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function extractName(fromStr) {
  if (!fromStr) return 'Unknown';
  const match = fromStr.match(/^"?(.+?)"?\s*</);
  return match ? match[1].trim() : fromStr.split('@')[0];
}

export function renderEmpty() {
  return `
    <div class="gm-empty">
      <div class="gm-empty-icon">${ICONS.gmail}</div>
      <div class="gm-empty-title">Gmail Inbox</div>
      <div class="gm-empty-desc">Add a Gmail account to monitor your inbox</div>
      <button class="gm-add-btn" id="gmAddAccount">${ICONS.plus} Add Gmail Account</button>
    </div>`;
}

export function renderAccountList(accounts, results) {
  return accounts.map(acct => {
    const result = results.find(r => r.account === acct.email);
    const unread = result ? result.unread : 0;
    const errMsg = result && result.error ? result.error : null;

    return `
      <div class="gm-account" data-email="${escapeHtml(acct.email)}">
        <div class="gm-account-header">
          <div class="gm-account-info">
            <div class="gm-account-avatar">${escapeHtml(acct.email[0].toUpperCase())}</div>
            <div class="gm-account-details">
              <div class="gm-account-email">${escapeHtml(acct.email)}</div>
              ${unread > 0 ? `<div class="gm-account-badge">${unread}</div>` : '<div class="gm-account-badge gm-account-badge--none">0</div>'}
            </div>
          </div>
          <button class="gm-account-remove" data-email="${escapeHtml(acct.email)}" title="Remove account">${ICONS.trash}</button>
        </div>
        ${errMsg ? `<div class="gm-error">${escapeHtml(errMsg)}</div>` : ''}
      </div>`;
  }).join('');
}

export function renderInboxView(email, messages, filter, expandedIds, unreadCount) {
  const filtered = filterMessages(messages, filter);
  return `
    <div class="gm-inbox-header">
      <button class="gm-inbox-back" id="gmInboxBack">${ICONS.back} Back</button>
      <div class="gm-inbox-account">
        <div class="gm-inbox-avatar">${escapeHtml(email[0].toUpperCase())}</div>
        <div>
          <div class="gm-inbox-email">${escapeHtml(email)}</div>
          <div class="gm-inbox-subtitle">${unreadCount} unread · ${messages.length} total</div>
        </div>
      </div>
    </div>
    <div class="gm-filter-bar">
      <button class="gm-filter-btn ${filter === 'all' ? 'gm-filter-btn--active' : ''}" data-filter="all">All</button>
      <button class="gm-filter-btn ${filter === 'hour' ? 'gm-filter-btn--active' : ''}" data-filter="hour">Past Hour</button>
      <button class="gm-filter-btn ${filter === 'today' ? 'gm-filter-btn--active' : ''}" data-filter="today">Today</button>
      <button class="gm-filter-btn ${filter === 'unread' ? 'gm-filter-btn--active' : ''}" data-filter="unread">Unread</button>
      <span class="gm-filter-count">${filtered.length} messages</span>
    </div>
    <div class="gm-inbox-list">
      ${filtered.length === 0 ? '<div class="gm-no-msgs">No messages match this filter</div>' : ''}
      ${filtered.map(msg => renderMessage(msg, email, expandedIds.has(msg.id))).join('')}
    </div>`;
}

function filterMessages(messages, filter) {
  const now = Date.now();
  return messages.filter(msg => {
    const msgTime = msg.date ? new Date(msg.date).getTime() : 0;
    switch (filter) {
      case 'hour': return !isNaN(msgTime) && (now - msgTime) < 3600000;
      case 'today': return !isNaN(msgTime) && new Date(msgTime).toDateString() === new Date().toDateString();
      case 'unread': return true;
      default: return true;
    }
  });
}

function renderMessage(msg, accountEmail, expanded) {
  const name = extractName(msg.from);
  return `
    <div class="gm-message ${expanded ? 'gm-message--expanded' : ''}" data-msg-id="${escapeHtml(msg.id)}">
      <div class="gm-msg-header">
        <div class="gm-msg-from">${escapeHtml(name)}</div>
        <div class="gm-msg-header-right">
          <span class="gm-msg-time">${formatTime(msg.date)}</span>
          <span class="gm-msg-chevron">${ICONS.chevronDown}</span>
        </div>
      </div>
      <div class="gm-msg-subject">${escapeHtml(msg.subject || '(no subject)')}</div>
      <div class="gm-msg-snippet">${expanded ? escapeHtml(msg.snippet || '') : truncate(escapeHtml(msg.snippet || ''), 120)}</div>
      ${expanded ? `<div class="gm-msg-full-date">${formatFullDate(msg.date)}</div>` : ''}
      <div class="gm-msg-meta">
        <div class="gm-msg-actions">
          <button class="gm-msg-open" data-msg-id="${escapeHtml(msg.id)}" data-email="${escapeHtml(accountEmail)}" title="Open in browser">${ICONS.external}</button>
          <button class="gm-msg-read" data-msg-id="${escapeHtml(msg.id)}" data-email="${escapeHtml(accountEmail)}" title="Mark as read">${ICONS.check}</button>
        </div>
      </div>
    </div>`;
}

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '...';
}

export function renderLoading() {
  return '<div class="gm-loading">Loading...</div>';
}

export function renderError(msg) {
  return `<div class="gm-error">${escapeHtml(msg)}</div>`;
}
