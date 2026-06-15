import { renderEmpty, renderAccountList, renderLoading, renderError } from './gmailRenderer.js';

export default class GmailUI {
  constructor(state) {
    this._state = state;
    this._container = null;

    this._onAddAccount = null;
    this._onRemoveAccount = null;
    this._onRefresh = null;
    this._onOpenMessage = null;
    this._onMarkRead = null;
  }

  setCallbacks(cbs) {
    this._onAddAccount = cbs.onAddAccount || null;
    this._onRemoveAccount = cbs.onRemoveAccount || null;
    this._onRefresh = cbs.onRefresh || null;
    this._onOpenMessage = cbs.onOpenMessage || null;
    this._onMarkRead = cbs.onMarkRead || null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = this._getTemplate();
    this._bindEvents();
  }

  update() {
    if (!this._container) return;
    const scrollTop = this._container.scrollTop;
    this._container.innerHTML = this._getTemplate();
    this._container.scrollTop = scrollTop;
    this._bindEvents();
  }

  _getTemplate() {
    const st = this._state;

    if (st.status === 'loading') return renderLoading();
    if (st.error) return renderError(st.error);

    if (!st.accounts || st.accounts.length === 0) return renderEmpty();

    return `
      <div class="gm-toolbar">
        <button class="gm-tb-btn" id="gmAddAccount">${ICONS.plus} Add Account</button>
        <button class="gm-tb-btn" id="gmRefresh">${ICONS.refresh} Refresh</button>
        <span class="gm-tb-status">${st.polling ? '● Live' : ''} ${st.totalUnread > 0 ? '· ' + st.totalUnread + ' unread' : ''}</span>
      </div>
      <div class="gm-accounts-list">
        ${renderAccountList(st.accounts, st.results, st.expandedEmail)}
      </div>`;
  }

  _bindEvents() {
    if (!this._container) return;

    // Add account
    const addBtn = this._container.querySelector('#gmAddAccount');
    if (addBtn && this._onAddAccount) addBtn.addEventListener('click', () => this._onAddAccount());

    // Refresh
    const refBtn = this._container.querySelector('#gmRefresh');
    if (refBtn && this._onRefresh) refBtn.addEventListener('click', () => this._onRefresh());

    // Remove account — delegated via click on header buttons
    this._container.querySelectorAll('.gm-account-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._onRemoveAccount) this._onRemoveAccount(btn.dataset.email);
      });
    });

    // Toggle expand/collapse on account header click
    this._container.querySelectorAll('.gm-account-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.gm-account-remove')) return;
        const email = header.dataset.email;
        const st = this._state;
        st.expandedEmail = st.expandedEmail === email ? null : email;
        this.update();
      });
    });

    // Open message in browser
    this._container.querySelectorAll('.gm-msg-open').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._onOpenMessage) this._onOpenMessage(btn.dataset.email, btn.dataset.msgId);
      });
    });

    // Mark as read
    this._container.querySelectorAll('.gm-msg-read').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._onMarkRead) this._onMarkRead(btn.dataset.email, btn.dataset.msgId);
      });
    });
  }
}

const ICONS = {
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 4v12"/><path d="M4 10h12"/></svg>',
  refresh: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 10a7 7 0 1 1-2-5"/><path d="M17 3v5h-5"/></svg>',
};
