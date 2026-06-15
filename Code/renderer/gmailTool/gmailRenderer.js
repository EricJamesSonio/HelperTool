const ICONS = {
  gmail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8l10 6 10-6"/></svg>',
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 4v12"/><path d="M4 10h12"/></svg>',
  trash: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h14"/><path d="M6 5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M8 9v6"/><path d="M12 9v6"/><path d="M5 5l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"/></svg>',
  refresh: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 10a7 7 0 1 1-2-5"/><path d="M17 3v5h-5"/></svg>',
  external: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><path d="M13 3h4v4"/><path d="M11 9l6-6"/></svg>',
  check: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 10l4 4 8-8"/></svg>',
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

export function renderAccountList(accounts, results, expandedEmail) {
  return accounts.map(acct => {
    const result = results.find(r => r.account === acct.email);
    const unread = result ? result.unread : 0;
    const isExpanded = expandedEmail === acct.email;
    const messages = result && result.messages ? result.messages : [];
    const errMsg = result && result.error ? result.error : null;

    return `
      <div class="gm-account ${isExpanded ? 'gm-account--expanded' : ''}">
        <div class="gm-account-header" data-email="${escapeHtml(acct.email)}">
          <div class="gm-account-info">
            <div class="gm-account-avatar">${escapeHtml(acct.email[0].toUpperCase())}</div>
            <div class="gm-account-details">
              <div class="gm-account-email">${escapeHtml(acct.email)}</div>
              ${unread > 0 ? `<div class="gm-account-badge">${unread}</div>` : '<div class="gm-account-badge gm-account-badge--none">0</div>'}
            </div>
          </div>
          <button class="gm-account-remove" data-email="${escapeHtml(acct.email)}" title="Remove account">${ICONS.trash}</button>
        </div>
        <div class="gm-account-body">
          ${errMsg ? `<div class="gm-error">${escapeHtml(errMsg)}</div>` : ''}
          ${messages.slice(0, 10).map(msg => renderMessage(msg, acct.email)).join('')}
          ${messages.length === 0 && !errMsg ? '<div class="gm-no-msgs">No unread messages</div>' : ''}
        </div>
      </div>`;
  }).join('');
}

function renderMessage(msg, accountEmail) {
  const name = extractName(msg.from);
  return `
    <div class="gm-message" data-msg-id="${escapeHtml(msg.id)}" data-email="${escapeHtml(accountEmail)}">
      <div class="gm-msg-from">${escapeHtml(name)}</div>
      <div class="gm-msg-subject">${escapeHtml(msg.subject || '(no subject)')}</div>
      <div class="gm-msg-snippet">${escapeHtml(msg.snippet || '')}</div>
      <div class="gm-msg-meta">
        <span class="gm-msg-time">${formatTime(msg.date)}</span>
        <div class="gm-msg-actions">
          <button class="gm-msg-open" data-msg-id="${escapeHtml(msg.id)}" data-email="${escapeHtml(accountEmail)}" title="Open in browser">${ICONS.external}</button>
          <button class="gm-msg-read" data-msg-id="${escapeHtml(msg.id)}" data-email="${escapeHtml(accountEmail)}" title="Mark as read">${ICONS.check}</button>
        </div>
      </div>
    </div>`;
}

export function renderLoading() {
  return '<div class="gm-loading">Loading accounts...</div>';
}

export function renderError(msg) {
  return `<div class="gm-error">${escapeHtml(msg)}</div>`;
}
