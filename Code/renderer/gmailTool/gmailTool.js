import GmailState from './gmailState.js';
import GmailUI from './gmailUI.js';

export default class GmailTool {
  constructor() {
    this.state = new GmailState();
    this.ui = null;
    this._container = null;
  }

  async init() {
    await this._loadIgnoredSenders();
    await this._loadAccounts();
  }

  render(container) {
    this._container = container;
    this.ui = new GmailUI(this.state);
    this.ui.setCallbacks({
      onAddAccount:        () => this._handleAddAccount(),
      onRemoveAccount:     (email) => this._handleRemoveAccount(email),
      onRefresh:           () => this._handleRefresh(),
      onOpenMessage:       (email, msgId) => this._handleOpenMessage(email, msgId),
      onMarkRead:          (email, msgId) => this._handleMarkRead(email, msgId),
      onOpenInbox:         (email) => this._handleOpenInbox(email),
      onBack:              () => this._handleBack(),
      onFilterChange:      (filter) => this._handleFilterChange(filter),
      onToggleExpand:      (msgId) => this._handleToggleExpand(msgId),
      onIgnoreSender:      (sender) => this._handleIgnoreSender(sender),
      onOpenIgnoredManager: () => this._handleOpenIgnoredManager(),
      onCloseIgnoredManager: () => this._handleCloseIgnoredManager(),
      onUnignoreSender:    (sender) => this._handleUnignoreSender(sender),
      onSenderFilter:      (sender) => this._handleSenderFilter(sender),
    });
    this.ui.render(container);

    window.electronAPI.gmail.onPollResult((data) => {
      console.log('[GmailTool] onPollResult received:', JSON.stringify({
        accounts: data.results?.length,
        totalUnread: data.totalUnread,
        newPerAccount: data.results?.map(r => ({ acct: r.account, new: r.newMessages?.length, unread: r.unread })),
      }));
      this.state.results = data.results;
      this.state.totalUnread = data.results.reduce((sum, r) => sum + (r.unread > 0 ? r.unread : 0), 0);
      for (const r of data.results) {
        if (r.messages && r.messages.length > 0) {
          this.state.inboxCache[r.account] = r.messages;
        }
      }
      if (this.state.view === 'inbox' && this.state.viewEmail && this.state.inboxCache[this.state.viewEmail]) {
        this.state.inboxMessages = this.state.inboxCache[this.state.viewEmail];
      }
      this._updateBadge();
      if (this.ui) this.ui.update();
    });

    window.electronAPI.gmail.onAccountsChanged((accounts) => {
      this.state.accounts = accounts;
      if (this.ui) this.ui.update();
    });
  }

  destroy() {
    window.electronAPI.gmail.stopPolling();
    window.electronAPI.gmail.onPollResult(() => {});
    window.electronAPI.gmail.onAccountsChanged(() => {});
    this.ui = null;
    this.state.reset();
    this._container = null;
  }

  async _loadIgnoredSenders() {
    const res = await window.electronAPI.gmail.getIgnoredSenders();
    if (res.success) {
      this.state.ignoredSenders = res.senders;
      console.log('[GmailTool] Loaded ignored senders:', this.state.ignoredSenders);
    }
  }

  async _loadAccounts() {
    this.state.status = 'loading';
    if (this.ui) this.ui.update();
    const res = await window.electronAPI.gmail.listAccounts();
    if (res.success) {
      this.state.accounts = res.accounts;
      console.log('[GmailTool] Loaded accounts:', this.state.accounts.map(a => a.email));
      if (this.state.accounts.length > 0) {
        console.log('[GmailTool] Accounts found, calling checkNow then startPolling');
        await window.electronAPI.gmail.checkNow();
        await window.electronAPI.gmail.startPolling();
        this.state.polling = true;
        console.log('[GmailTool] Polling started');
      } else {
        console.log('[GmailTool] No accounts found, not starting polling');
      }
    } else {
      console.log('[GmailTool] Failed to load accounts:', res.error);
    }
    this.state.status = 'idle';
    if (this.ui) this.ui.update();
  }

  async _handleAddAccount() {
    console.log('[GmailTool] Adding new account...');
    const res = await window.electronAPI.gmail.addAccount();
    if (res.success) {
      console.log('[GmailTool] Account added, calling checkNow then startPolling');
      await window.electronAPI.gmail.checkNow();
      await window.electronAPI.gmail.startPolling();
      this.state.polling = true;
      console.log('[GmailTool] Polling started after add account');
    } else {
      this.state.error = res.error;
      if (this.ui) this.ui.update();
      setTimeout(() => { this.state.error = null; if (this.ui) this.ui.update(); }, 3000);
    }
  }

  async _handleRemoveAccount(email) {
    await window.electronAPI.gmail.removeAccount(email);
    this.state.accounts = this.state.accounts.filter(a => a.email !== email);
    this.state.results = this.state.results.filter(r => r.account !== email);
    this._updateBadge();
    if (this.state.accounts.length === 0) {
      await window.electronAPI.gmail.stopPolling();
      this.state.polling = false;
    }
    if (this.state.view === 'inbox' && this.state.viewEmail === email) {
      this.state.view = 'accounts';
      this.state.viewEmail = null;
    }
    if (this.ui) this.ui.update();
  }

  async _handleRefresh() {
    this.state.status = 'loading';
    if (this.ui) this.ui.update();
    const res = await window.electronAPI.gmail.fetchAll();
    if (res.success) {
      for (const r of res.results) {
        if (r.messages) {
          this.state.inboxCache[r.account] = r.messages;
        }
      }
      this.state.results = res.results;
      this.state.totalUnread = res.results.reduce((sum, r) => sum + (r.unread > 0 ? r.unread : 0), 0);
      this._updateBadge();
      if (this.state.view === 'inbox' && this.state.viewEmail && this.state.inboxCache[this.state.viewEmail]) {
        this.state.inboxMessages = this.state.inboxCache[this.state.viewEmail];
      }
    } else {
      this.state.error = res.error;
    }
    this.state.status = 'idle';
    if (this.ui) this.ui.update();
  }

  async _handleOpenInbox(email) {
    this.state.view = 'inbox';
    this.state.viewEmail = email;
    this.state.filter = 'all';
    this.state.expandedMsgIds = new Set();

    if (this.state.inboxCache[email]) {
      this.state.inboxMessages = this.state.inboxCache[email];
      if (this.ui) this.ui.update();
      return;
    }

    this.state.status = 'loading';
    if (this.ui) this.ui.update();

    const res = await window.electronAPI.gmail.fetchInbox({ email, maxResults: 50 });
    if (res.success) {
      this.state.inboxMessages = res.messages || [];
      this.state.inboxCache[email] = res.messages || [];
    } else {
      this.state.inboxMessages = [];
    }
    this.state.status = 'idle';
    if (this.ui) this.ui.update();
  }

  _handleBack() {
    this.state.view = 'accounts';
    this.state.viewEmail = null;
    this.state.inboxMessages = [];
    this.state.expandedMsgIds = new Set();
    if (this.ui) this.ui.update();
  }

  _handleFilterChange(filter) {
    this.state.filter = filter;
    if (this.ui) this.ui.update();
  }

  _handleToggleExpand(msgId) {
    if (this.state.expandedMsgIds.has(msgId)) {
      this.state.expandedMsgIds.delete(msgId);
    } else {
      this.state.expandedMsgIds.add(msgId);
    }
    if (this.ui) this.ui.update();
  }

  async _handleIgnoreSender(sender) {
    if (this.state.ignoredSenders.includes(sender)) return;
    await window.electronAPI.gmail.addIgnoredSender({ sender });
    this.state.ignoredSenders.push(sender);
    this._updateBadge();
    if (this.ui) this.ui.update();
  }

  async _handleOpenIgnoredManager() {
    this.state.showIgnoredManager = true;
    if (this.ui) this.ui.update();
  }

  _handleCloseIgnoredManager() {
    this.state.showIgnoredManager = false;
    if (this.ui) this.ui.update();
  }

  async _handleUnignoreSender(sender) {
    await window.electronAPI.gmail.removeIgnoredSender({ sender });
    this.state.ignoredSenders = this.state.ignoredSenders.filter(s => s !== sender);
    this._updateBadge();
    if (this.ui) this.ui.update();
  }

  _handleSenderFilter(sender) {
    this.state.senderFilter = this.state.senderFilter === sender ? null : sender;
    if (this.ui) this.ui.update();
  }

  _handleOpenMessage(email, msgId) {
    const url = 'https://mail.google.com/mail/u/0/#inbox/' + msgId;
    window.open(url, '_blank');
  }

  async _handleMarkRead(email, msgId) {
    await window.electronAPI.gmail.markRead(email, msgId);
    await window.electronAPI.gmail.checkNow();
  }

  _updateBadge() {
    const total = this.state.totalUnread;
    const badge = document.getElementById('gmailBadge');
    if (badge) {
      if (total > 0) {
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }
}
