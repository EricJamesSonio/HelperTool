const ICONS = {
  gmail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8l10 6 10-6"/></svg>',
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 4v12"/><path d="M4 10h12"/></svg>',
  trash: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h14"/><path d="M6 5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M8 9v6"/><path d="M12 9v6"/><path d="M5 5l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"/></svg>',
  refresh: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 10a7 7 0 1 1-2-5"/><path d="M17 3v5h-5"/></svg>',
  external: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><path d="M13 3h4v4"/><path d="M11 9l6-6"/></svg>',
  check: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 10l4 4 8-8"/></svg>',
  back: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 4l-6 6 6 6"/></svg>',
  chevronDown: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 8l4 4 4-4"/></svg>',
  eyeOff: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="10" cy="10" r="2.5"/><path d="M3 3l14 14"/></svg>',
  settings: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.93 3.93l1.41 1.41M14.66 14.66l1.41 1.41M3.93 16.07l1.41-1.41M14.66 5.34l1.41-1.41"/></svg>',
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

const SENDER_COLORS = (() => {
  const colors = [];
  const hues = [0, 210, 120, 30, 270, 190, 340, 80, 160, 300, 50, 230, 100, 20, 280, 170, 350, 140, 250, 60];
  const satLight = [
    [75, 55], [70, 58], [70, 50], [80, 55], [65, 60],
    [75, 50], [70, 55], [75, 52], [65, 48], [70, 58],
    [80, 55], [65, 60], [70, 50], [75, 55], [70, 55],
    [75, 50], [65, 55], [70, 58], [80, 52], [75, 55],
  ];
  for (let i = 0; i < hues.length; i++) {
    colors.push(`hsl(${hues[i]}, ${satLight[i][0]}%, ${satLight[i][1]}%)`);
  }
  return colors;
})();

let _senderColorMap = {};

function getSenderColor(sender) {
  if (_senderColorMap[sender]) return _senderColorMap[sender];
  let hash = 0;
  for (let i = 0; i < sender.length; i++) {
    hash = sender.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % SENDER_COLORS.length;
  const color = SENDER_COLORS[idx];
  _senderColorMap[sender] = color;
  return color;
}

function hexToRgba(hex, alpha) {
  if (hex.startsWith('hsl')) {
    const m = hex.match(/hsl\(([^,]+),([^,]+)%,([^)]+)%\)/);
    if (m) return `hsla(${m[1]},${m[2]}%,${m[3]}%,${alpha})`;
    return hex;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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

export function renderIgnoredManager(senders, email) {
  return `
    <div class="gm-ignored-overlay">
      <div class="gm-ignored-panel">
        <div class="gm-ignored-header">
          <button class="gm-ignored-back" id="gmIgnoredBack">&larr; Back</button>
          <span class="gm-ignored-title">Ignored Senders</span>
          <span class="gm-ignored-email">${escapeHtml(email || '')}</span>
        </div>
        <div class="gm-ignored-desc">Messages from these senders will be hidden from this account's inbox.</div>
        <div class="gm-ignored-list">
          ${senders.length === 0 ? '<div class="gm-no-msgs">No ignored senders for this account.</div>' : ''}
          ${senders.map(s => `
            <div class="gm-ignored-item">
              <span class="gm-ignored-name">${escapeHtml(s)}</span>
              <button class="gm-ignored-unignore" data-email="${escapeHtml(email || '')}" data-sender="${escapeHtml(s)}">${ICONS.trash} Remove</button>
            </div>
          `).join('')}
        </div>
      </div>
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

export function renderInboxView(email, messages, filter, expandedIds, unreadCount, ignoredSenders, senderFilter) {
  const filtered = filterMessages(messages, filter, ignoredSenders, senderFilter);
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
      <button class="gm-tb-btn gm-inbox-ignored-btn" id="gmIgnoredBtnInbox" data-email="${escapeHtml(email)}" title="Manage ignored senders for this account">${ICONS.eyeOff}</button>
    </div>
    <div class="gm-filter-bar">
      <button class="gm-filter-btn ${filter === 'all' ? 'gm-filter-btn--active' : ''}" data-filter="all">All</button>
      <button class="gm-filter-btn ${filter === 'hour' ? 'gm-filter-btn--active' : ''}" data-filter="hour">Past Hour</button>
      <button class="gm-filter-btn ${filter === 'today' ? 'gm-filter-btn--active' : ''}" data-filter="today">Today</button>
      <button class="gm-filter-btn ${filter === 'unread' ? 'gm-filter-btn--active' : ''}" data-filter="unread">Unread</button>
      <span class="gm-filter-count">${filtered.length} messages</span>
    </div>
    ${renderSenderChips(messages, senderFilter)}
    <div class="gm-inbox-list">
      ${filtered.length === 0 ? '<div class="gm-no-msgs">No messages match this filter</div>' : ''}
      ${filtered.map(msg => renderMessage(msg, email, expandedIds.has(msg.id), ignoredSenders)).join('')}
    </div>`;
}

function renderSenderChips(messages, activeSender) {
  const seen = new Set();
  const senders = [];
  for (const msg of messages) {
    const name = extractName(msg.from);
    if (!seen.has(name)) {
      seen.add(name);
      senders.push(name);
    }
  }
  senders.sort();
  if (senders.length <= 1) return '';
  return `
    <div class="gm-chip-row">
      ${senders.map(s => `
        <button class="gm-chip ${s === activeSender ? 'gm-chip--active' : ''}" data-sender="${escapeHtml(s)}">${escapeHtml(s)}</button>
      `).join('')}
    </div>`;
}

function filterMessages(messages, filter, ignoredSenders, senderFilter) {
  const now = Date.now();
  return messages.filter(msg => {
    if (isIgnored(msg.from, ignoredSenders)) return false;
    if (senderFilter) {
      const name = extractName(msg.from);
      if (name.toLowerCase() !== senderFilter.toLowerCase()) return false;
    }
    const msgTime = msg.date ? new Date(msg.date).getTime() : 0;
    switch (filter) {
      case 'hour': return !isNaN(msgTime) && (now - msgTime) < 3600000;
      case 'today': return !isNaN(msgTime) && new Date(msgTime).toDateString() === new Date().toDateString();
      case 'unread': return true;
      default: return true;
    }
  });
}

function isIgnored(fromStr, ignoredSenders) {
  if (!fromStr || !ignoredSenders || ignoredSenders.length === 0) return false;
  const email = fromStr.match(/<([^>]+)>/)?.[1]?.toLowerCase() || fromStr.toLowerCase();
  return ignoredSenders.some(s => email.includes(s.toLowerCase()));
}

function renderMessage(msg, accountEmail, expanded, ignoredSenders) {
  const name = extractName(msg.from);
  const ignored = isIgnored(msg.from, ignoredSenders);
  const color = getSenderColor(msg.from || name);
  const bgTint = hexToRgba(color, 0.06);
  return `
    <div class="gm-message ${expanded ? 'gm-message--expanded' : ''} ${ignored ? 'gm-message--ignored' : ''}" data-msg-id="${escapeHtml(msg.id)}" style="border-left: 4px solid ${color}; background: ${bgTint};${expanded ? ` box-shadow: 0 0 0 1px ${color};` : ''}">
      <div class="gm-msg-header">
        <div class="gm-msg-from" style="color:${color}">${escapeHtml(name)}</div>
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
          <button class="gm-msg-ignore" data-msg-id="${escapeHtml(msg.id)}" data-email="${escapeHtml(accountEmail)}" data-sender="${escapeHtml(extractName(msg.from))}" title="Ignore this sender">${ICONS.eyeOff}</button>
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