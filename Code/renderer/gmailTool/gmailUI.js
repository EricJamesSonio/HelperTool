import { renderEmpty, renderAccountList, renderInboxView, renderLoading, renderError, renderIgnoredManager, renderMessageModal } from './gmailRenderer.js';

export default class GmailUI {
  constructor(state) {
    this._state = state;
    this._container = null;

    this._onAddAccount = null;
    this._onRemoveAccount = null;
    this._onRefresh = null;
    this._onOpenMessage = null;
    this._onMarkRead = null;
    this._onOpenInbox = null;
    this._onBack = null;
    this._onFilterChange = null;
    this._onToggleExpand = null;
    this._onIgnoreSender = null;
    this._onOpenIgnoredManager = null;
    this._onCloseIgnoredManager = null;
    this._onUnignoreSender = null;
    this._onSenderFilter = null;
    this._onOpenModal = null;
    this._onCloseModal = null;
    this._onOpenMessage = null;
    this._onReAuthAccount = null;
  }

  setCallbacks(cbs) {
    this._onAddAccount = cbs.onAddAccount || null;
    this._onRemoveAccount = cbs.onRemoveAccount || null;
    this._onRefresh = cbs.onRefresh || null;
    this._onOpenMessage = cbs.onOpenMessage || null;
    this._onMarkRead = cbs.onMarkRead || null;
    this._onOpenInbox = cbs.onOpenInbox || null;
    this._onBack = cbs.onBack || null;
    this._onFilterChange = cbs.onFilterChange || null;
    this._onToggleExpand = cbs.onToggleExpand || null;
    this._onIgnoreSender = cbs.onIgnoreSender || null;
    this._onOpenIgnoredManager = cbs.onOpenIgnoredManager || null;
    this._onCloseIgnoredManager = cbs.onCloseIgnoredManager || null;
    this._onUnignoreSender = cbs.onUnignoreSender || null;
    this._onSenderFilter = cbs.onSenderFilter || null;
    this._onOpenModal = cbs.onOpenModal || null;
    this._onCloseModal = cbs.onCloseModal || null;
    this._onOpenMessage = cbs.onOpenMessage || null;
    this._onReAuthAccount = cbs.onReAuthAccount || null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = this._getTemplate();
    this._bindEvents();
  }

  update() {
    if (!this._container) return;
    const list = this._container.querySelector('.gm-inbox-list, .gm-accounts-list');
    const listScrollTop = list ? list.scrollTop : null;
    const modalBody = this._container.querySelector('.gm-modal-body');
    const modalBodyScrollTop = modalBody ? modalBody.scrollTop : null;
    this._container.innerHTML = this._getTemplate();
    if (listScrollTop !== null) {
      const newList = this._container.querySelector('.gm-inbox-list, .gm-accounts-list');
      if (newList) newList.scrollTop = listScrollTop;
    }
    if (modalBodyScrollTop !== null) {
      const newModalBody = this._container.querySelector('.gm-modal-body');
      if (newModalBody) newModalBody.scrollTop = modalBodyScrollTop;
    }
    this._bindEvents();
  }

  _getTemplate() {
    const st = this._state;
    let content = '';

    if (st.status === 'loading') content = renderLoading(st.loadingMessage);
    else if (st.error) content = renderError(st.error);
    else if (!st.accounts || st.accounts.length === 0) content = renderEmpty();
    else if (st.showIgnoredManager) {
      const email = st.ignoredManagerEmail;
      const senders = email ? (st.ignoredByAccount[email] || []) : [];
      content = renderIgnoredManager(senders, email);
    } else if (st.view === 'inbox' && st.viewEmail) {
      const messages = st.inboxMessages;
      const result = st.getResult(st.viewEmail);
      const ignoredList = st.ignoredByAccount[st.viewEmail] || [];
      content = renderInboxView(st.viewEmail, messages, st.filter, result ? result.unread : 0, ignoredList, st.senderFilter);
    } else {
      const filteredResults = st.getFilteredResults();
      content = `
        <div class="gm-toolbar">
          <button class="gm-tb-btn" id="gmBackToMainBtn">&larr; Back</button>
          <button class="gm-tb-btn" id="gmAddAccount">${ICONS.plus} Add Account</button>
          <button class="gm-tb-btn" id="gmRefresh">${ICONS.refresh} Refresh</button>
          <span class="gm-tb-status">${st.polling ? '● Live' : ''} ${st.totalUnread > 0 ? '· ' + st.totalUnread + ' unread' : ''}</span>
        </div>
        <div class="gm-accounts-list">
          ${renderAccountList(st.accounts, filteredResults)}
        </div>`;
    }

    if (st.showModal && st.modalMessage && st.modalEmail) {
      const accountIndex = st.accounts.findIndex(a => a.email === st.modalEmail);
      content += renderMessageModal(st.modalMessage, st.modalEmail, accountIndex, st.modalBody);
    }

    return content;
  }

  _bindEvents() {
    if (!this._container) return;

    const addBtn = this._container.querySelector('#gmAddAccount');
    if (addBtn && this._onAddAccount) addBtn.addEventListener('click', () => this._onAddAccount());

    const backMainBtn = this._container.querySelector('#gmBackToMainBtn');
    if (backMainBtn) backMainBtn.addEventListener('click', () => {
      document.getElementById('closeGmailToolBtn')?.click();
    });

    const refBtn = this._container.querySelector('#gmRefresh');
    if (refBtn && this._onRefresh) refBtn.addEventListener('click', () => this._onRefresh());

    this._container.querySelectorAll('.gm-account-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._onRemoveAccount) this._onRemoveAccount(btn.dataset.email);
      });
    });

    this._container.querySelectorAll('.gm-reauth-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._onReAuthAccount) this._onReAuthAccount(btn.dataset.email);
      });
    });

    this._container.querySelectorAll('.gm-account').forEach(card => {
      // Don't open inbox for accounts with auth errors
      if (card.querySelector('.gm-error--auth')) return;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.gm-account-remove')) return;
        if (this._onOpenInbox) this._onOpenInbox(card.dataset.email);
      });
    });

    const backBtn = this._container.querySelector('#gmInboxBack');
    if (backBtn && this._onBack) backBtn.addEventListener('click', () => this._onBack());

    this._container.querySelectorAll('.gm-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._onFilterChange) this._onFilterChange(btn.dataset.filter);
      });
    });

    this._container.querySelectorAll('.gm-message').forEach(msg => {
      msg.addEventListener('click', (e) => {
        if (e.target.closest('.gm-msg-actions')) return;
        if (this._onOpenModal) this._onOpenModal(msg.dataset.email, msg.dataset.msgId);
      });
    });

    this._container.querySelectorAll('.gm-msg-open').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._onOpenMessage) this._onOpenMessage(btn.dataset.email, btn.dataset.msgId);
      });
    });

    this._container.querySelectorAll('.gm-msg-read').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._onMarkRead) this._onMarkRead(btn.dataset.email, btn.dataset.msgId);
      });
    });

    this._container.querySelectorAll('.gm-msg-ignore').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._onIgnoreSender) this._onIgnoreSender(btn.dataset.email, btn.dataset.sender);
      });
    });

    const ignoredBack = this._container.querySelector('#gmIgnoredBack');
    if (ignoredBack && this._onCloseIgnoredManager) ignoredBack.addEventListener('click', () => this._onCloseIgnoredManager());

    this._container.querySelectorAll('.gm-ignored-unignore').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._onUnignoreSender) this._onUnignoreSender(btn.dataset.email, btn.dataset.sender);
      });
    });

    // Open ignored manager from inbox view
    const ignoredBtn = this._container.querySelector('#gmIgnoredBtnInbox');
    if (ignoredBtn && this._onOpenIgnoredManager) ignoredBtn.addEventListener('click', () => this._onOpenIgnoredManager(ignoredBtn.dataset.email));

    this._container.querySelectorAll('.gm-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._onSenderFilter) this._onSenderFilter(btn.dataset.sender);
      });
    });

    const modalOverlay = this._container.querySelector('#gmModalOverlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay && this._onCloseModal) this._onCloseModal();
      });
    }

    const modalClose = this._container.querySelector('#gmModalClose');
    if (modalClose && this._onCloseModal) modalClose.addEventListener('click', () => this._onCloseModal());

    const modalOpenGmail = this._container.querySelector('#gmModalOpenGmail');
    if (modalOpenGmail) {
      modalOpenGmail.addEventListener('click', () => {
        window.open(modalOpenGmail.dataset.url, '_blank');
        if (this._onCloseModal) this._onCloseModal();
      });
    }

    const modalMarkRead = this._container.querySelector('#gmModalMarkRead');
    if (modalMarkRead && this._onMarkRead) {
      modalMarkRead.addEventListener('click', () => {
        this._onMarkRead(modalMarkRead.dataset.email, modalMarkRead.dataset.msgId);
        if (this._onCloseModal) this._onCloseModal();
      });
    }

    const modalIgnore = this._container.querySelector('#gmModalIgnore');
    if (modalIgnore && this._onIgnoreSender) {
      modalIgnore.addEventListener('click', () => {
        this._onIgnoreSender(modalIgnore.dataset.email, modalIgnore.dataset.sender);
        if (this._onCloseModal) this._onCloseModal();
      });
    }
  }
}

const ICONS = {
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 3v14"/><path d="M3 10h14"/></svg>',
  refresh: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10a7 7 0 1 1-1.6-4.5"/><path d="M17 3v5h-5"/></svg>',
  eyeOff: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="10" cy="10" r="2.5"/><path d="M3 3l14 14"/></svg>',
};