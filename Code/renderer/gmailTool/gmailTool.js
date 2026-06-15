import GmailState from './gmailState.js';
import GmailUI from './gmailUI.js';

export default class GmailTool {
  constructor() {
    this.state = new GmailState();
    this.ui = null;
    this._container = null;
  }

  async init() {
    await this._loadAccounts();
  }

  render(container) {
    this._container = container;
    this.ui = new GmailUI(this.state);
    this.ui.setCallbacks({
      onAddAccount: () => this._handleAddAccount(),
      onRemoveAccount: (email) => this._handleRemoveAccount(email),
      onRefresh: () => this._handleRefresh(),
      onOpenMessage: (email, msgId) => this._handleOpenMessage(email, msgId),
      onMarkRead: (email, msgId) => this._handleMarkRead(email, msgId),
    });
    this.ui.render(container);

    // Listen for poll updates from main process
    window.electronAPI.gmail.onPollResult((data) => {
      this.state.results = data.results;
      this.state.totalUnread = data.totalUnread;
      this._updateBadge();
      if (this.ui) this.ui.update();
    });

    // Listen for account changes
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

  async _loadAccounts() {
    this.state.status = 'loading';
    if (this.ui) this.ui.update();
    const res = await window.electronAPI.gmail.listAccounts();
    if (res.success) {
      this.state.accounts = res.accounts;
      if (this.state.accounts.length > 0) {
        await this._handleRefresh();
        await window.electronAPI.gmail.startPolling();
        this.state.polling = true;
      }
    }
    this.state.status = 'idle';
    if (this.ui) this.ui.update();
  }

  async _handleAddAccount() {
    const res = await window.electronAPI.gmail.addAccount();
    if (res.success) {
      // accountsChanged event will update the list
      await this._handleRefresh();
      await window.electronAPI.gmail.startPolling();
      this.state.polling = true;
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
    if (this.ui) this.ui.update();
  }

  async _handleRefresh() {
    this.state.status = 'loading';
    if (this.ui) this.ui.update();
    const res = await window.electronAPI.gmail.fetchAll();
    if (res.success) {
      this.state.results = res.results;
      this.state.totalUnread = res.results.reduce((sum, r) => sum + (r.unread > 0 ? r.unread : 0), 0);
      this._updateBadge();
    } else {
      this.state.error = res.error;
    }
    this.state.status = 'idle';
    if (this.ui) this.ui.update();
  }

  _handleOpenMessage(email, msgId) {
    const url = 'https://mail.google.com/mail/u/0/#inbox/' + msgId;
    window.open(url, '_blank');
  }

  async _handleMarkRead(email, msgId) {
    await window.electronAPI.gmail.markRead(email, msgId);
    // Refresh to update unread counts
    await this._handleRefresh();
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
