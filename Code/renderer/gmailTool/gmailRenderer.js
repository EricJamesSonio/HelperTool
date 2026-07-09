const ICONS = {
  gmail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8l10 6 10-6"/></svg>',
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 3v14"/><path d="M3 10h14"/></svg>',
  trash: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h14"/><path d="M6 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M8 9v5"/><path d="M12 9v5"/><path d="M5 6l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/></svg>',
  refresh: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10a7 7 0 1 1-1.6-4.5"/><path d="M17 3v5h-5"/></svg>',
  external: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><path d="M13 3h4v4"/><path d="M11 9l6-6"/></svg>',
  check: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4 4 8-8"/></svg>',
  back: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l-6 6 6 6"/></svg>',
  chevronDown: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8l4 4 4-4"/></svg>',
  eyeOff: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="10" cy="10" r="2.5"/><path d="M3 3l14 14"/></svg>',
  settings: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2"/><path d="M10 17v2"/><path d="M1 10h2"/><path d="M17 10h2"/><path d="M3.93 3.93l1.41 1.41"/><path d="M14.66 14.66l1.41 1.41"/><path d="M3.93 16.07l1.41-1.41"/><path d="M14.66 5.34l1.41-1.41"/></svg>',
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

function extractEmail(fromStr) {
  if (!fromStr) return '';
  const match = fromStr.match(/<([^>]+)>/);
  return match ? match[1].trim().toLowerCase() : fromStr.toLowerCase();
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
      <div class="gm-empty-desc">Monitor your inbox from the terminal.</div>
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
          <div class="gm-account-avatar" style="background: linear-gradient(135deg, #5699ff, #6e44ff)">${escapeHtml(acct.email[0].toUpperCase())}</div>
          <div class="gm-account-info">
            <div class="gm-account-details">
              <div class="gm-account-email">${escapeHtml(acct.email)}</div>
              ${unread > 0 ? `<div class="gm-account-badge">${unread > 99 ? '99+' : unread}</div>` : '<div class="gm-account-badge gm-account-badge--none">0</div>'}
            </div>
          </div>
          <button class="gm-account-remove" data-email="${escapeHtml(acct.email)}" title="Remove account">${ICONS.trash}</button>
        </div>
        ${errMsg ? `<div class="gm-error gm-error--auth">
          <span>${escapeHtml(errMsg)}</span>
          <button class="gm-reauth-btn" data-email="${escapeHtml(acct.email)}">Re-authorize</button>
        </div>` : ''}
      </div>`;
  }).join('');
}

export function renderMessageModal(msg, email, accountIndex, body) {
  if (!msg) return '';
  const name = extractName(msg.from);
  const senderEmail = extractEmail(msg.from);
  const color = getSenderColor(msg.from || name);
  const gmailUrl = `https://mail.google.com/mail/u/${Math.max(0, accountIndex)}/#inbox/${msg.id}`;
  const displayBody = body || msg.snippet || '(no content)';
  const loadingClass = !body && msg.snippet ? ' gm-modal-body--loading' : '';

  return `
    <div class="gm-modal-overlay" id="gmModalOverlay">
      <div class="gm-modal">
        <div class="gm-modal-header" style="border-left: 4px solid ${color}">
          <div class="gm-modal-from" style="color:${color}">${escapeHtml(name)}</div>
          <button class="gm-modal-close" id="gmModalClose">&times;</button>
        </div>
        <div class="gm-modal-subject">${escapeHtml(msg.subject || '(no subject)')}</div>
        <div class="gm-modal-date">${formatFullDate(msg.date)}</div>
        <div class="gm-modal-body${loadingClass}">${escapeHtml(displayBody)}</div>
        <div class="gm-modal-footer">
          <button class="gm-modal-btn gm-modal-btn--primary" id="gmModalOpenGmail" data-url="${escapeHtml(gmailUrl)}">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="2" y="4" width="16" height="12" rx="2"/><path d="M2 7l8 5 8-5"/></svg>
            Open in Gmail
          </button>
          <button class="gm-modal-btn" id="gmModalMarkRead" data-email="${escapeHtml(email)}" data-msg-id="${escapeHtml(msg.id)}">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M4 10l4 4 8-8"/></svg>
            Mark Read
          </button>
          <button class="gm-modal-btn" id="gmModalIgnore" data-email="${escapeHtml(email)}" data-sender="${escapeHtml(senderEmail)}">
            ${ICONS.eyeOff}
            Ignore Sender
          </button>
        </div>
      </div>
    </div>`;
}

export function renderInboxView(email, messages, filter, unreadCount, ignoredSenders, senderFilter) {
  const filtered = filterMessages(messages, filter, ignoredSenders, senderFilter);
  const notIgnored = ignoredSenders?.length ? messages.filter(m => !isIgnored(m.from, ignoredSenders)) : messages;
  return `
    <div class="gm-inbox-header">
      <button class="gm-inbox-back" id="gmInboxBack">${ICONS.back}</button>
      <div class="gm-inbox-account">
        <div class="gm-inbox-avatar" style="background: linear-gradient(135deg, #5699ff, #6e44ff)">${escapeHtml(email[0].toUpperCase())}</div>
        <div>
          <div class="gm-inbox-email">${escapeHtml(email)}</div>
          <div class="gm-inbox-subtitle"><span class="gm-inbox-count">${unreadCount} unread</span> · ${messages.length} total</div>
        </div>
      </div>
      <button class="gm-tb-btn gm-inbox-ignored-btn" id="gmIgnoredBtnInbox" data-email="${escapeHtml(email)}" title="Manage ignored senders">${ICONS.eyeOff}</button>
    </div>
    <div class="gm-filter-bar">
      <button class="gm-filter-btn ${filter === 'all' ? 'gm-filter-btn--active' : ''}" data-filter="all">All</button>
      <button class="gm-filter-btn ${filter === 'hour' ? 'gm-filter-btn--active' : ''}" data-filter="hour">Past Hour</button>
      <button class="gm-filter-btn ${filter === 'today' ? 'gm-filter-btn--active' : ''}" data-filter="today">Today</button>
      <button class="gm-filter-btn ${filter === 'unread' ? 'gm-filter-btn--active' : ''}" data-filter="unread">Unread</button>
      <span class="gm-filter-count">${filtered.length} messages</span>
    </div>
    ${renderSenderChips(notIgnored, senderFilter)}
    <div class="gm-inbox-list">
      ${filtered.length === 0 ? '<div class="gm-no-msgs">No messages match this filter</div>' : ''}
      ${filtered.map(msg => renderMessage(msg, email, ignoredSenders)).join('')}
    </div>`;
}

function renderSenderChips(messages, activeSender) {
  const groups = new Map();
  for (const msg of messages) {
    const name = extractName(msg.from);
    const firstWord = name.split(/\s+/)[0].toLowerCase();
    if (!groups.has(firstWord)) {
      groups.set(firstWord, new Set());
    }
    groups.get(firstWord).add(name);
  }
  if (groups.size <= 1) return '';
  const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return `
    <div class="gm-chip-row">
      ${sorted.map(([firstWord, names]) => {
        const label = names.size === 1
          ? [...names][0]
          : firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
        const isActive = activeSender && activeSender.toLowerCase() === firstWord;
        return `<button class="gm-chip ${isActive ? 'gm-chip--active' : ''}" data-sender="${escapeHtml(firstWord)}">${escapeHtml(label)}</button>`;
      }).join('')}
    </div>`;
}

function filterMessages(messages, filter, ignoredSenders, senderFilter) {
  const now = Date.now();
  return messages.filter(msg => {
    if (isIgnored(msg.from, ignoredSenders)) return false;
    if (senderFilter) {
      const name = extractName(msg.from);
      if (!name.toLowerCase().startsWith(senderFilter.toLowerCase())) return false;
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
  const name = fromStr.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim().toLowerCase() || fromStr.toLowerCase();
  return ignoredSenders.some(s => {
    const term = s.toLowerCase();
    return email.includes(term) || name === term;
  });
}

function renderMessage(msg, accountEmail, ignoredSenders) {
  const name = extractName(msg.from);
  const senderEmail = extractEmail(msg.from);
  const ignored = isIgnored(msg.from, ignoredSenders);
  const color = getSenderColor(msg.from || name);
  return `
    <div class="gm-message ${ignored ? 'gm-message--ignored' : ''}" data-msg-id="${escapeHtml(msg.id)}" data-email="${escapeHtml(accountEmail)}" style="border-left: 4px solid ${color}">
      <div class="gm-msg-header">
        <div class="gm-msg-from" style="color:${color}">${escapeHtml(name)}</div>
        <div class="gm-msg-header-right">
          <span class="gm-msg-time">${formatTime(msg.date)}</span>
        </div>
      </div>
      <div class="gm-msg-subject">${escapeHtml(msg.subject || '(no subject)')}</div>
      <div class="gm-msg-snippet gm-msg-snippet--clamp">${escapeHtml(msg.snippet || '')}</div>
      <div class="gm-msg-meta">
        <div class="gm-msg-actions">
          <button class="gm-msg-ignore" data-msg-id="${escapeHtml(msg.id)}" data-email="${escapeHtml(accountEmail)}" data-sender="${escapeHtml(senderEmail)}" title="Ignore this sender">${ICONS.eyeOff}</button>
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

export function renderLoading(msg) {
  return `<div class="gm-loading">
    <div class="gm-loading-spinner"></div>
    <div class="gm-loading-text">${escapeHtml(msg || 'Loading your inbox...')}</div>
  </div>`;
}

export function renderError(msg) {
  return `<div class="gm-error">${escapeHtml(msg)}</div>`;
}