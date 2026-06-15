export default class GmailState {
  constructor() {
    this.accounts = [];
    this.results = [];
    this.polling = false;
    this.totalUnread = 0;
    this.status = 'idle';
    this.error = null;

    this.view = 'accounts';
    this.viewEmail = null;
    this.filter = 'all';
    this.expandedMsgIds = new Set();
    this.inboxMessages = [];

    this.ignoredByAccount = {};
    this.showIgnoredManager = false;
    this.ignoredManagerEmail = null;
    this.senderFilter = null;
    this.inboxCache = {};
  }

  reset() {
    this.accounts = [];
    this.results = [];
    this.polling = false;
    this.totalUnread = 0;
    this.status = 'idle';
    this.error = null;
    this.view = 'accounts';
    this.viewEmail = null;
    this.filter = 'all';
    this.expandedMsgIds = new Set();
    this.inboxMessages = [];
    this.ignoredByAccount = {};
    this.showIgnoredManager = false;
    this.ignoredManagerEmail = null;
    this.senderFilter = null;
    this.inboxCache = {};
  }

  getAccount(email) {
    return this.accounts.find(a => a.email === email);
  }

  getResult(email) {
    return this.results.find(r => r.account === email);
  }

  getFilteredMessages() {
    const now = Date.now();
    const email = this.viewEmail;
    const ignored = this.ignoredByAccount[email] || [];
    return this.inboxMessages.filter(msg => {
      if (this._isIgnored(msg.from, ignored)) return false;
      if (this.senderFilter && !msg.from?.toLowerCase().includes(this.senderFilter.toLowerCase())) return false;
      const msgTime = msg.date ? new Date(msg.date).getTime() : 0;
      switch (this.filter) {
        case 'hour': return !isNaN(msgTime) && (now - msgTime) < 3600000;
        case 'today': return !isNaN(msgTime) && new Date(msgTime).toDateString() === new Date().toDateString();
        case 'unread': return true;
        default: return true;
      }
    });
  }

  getFilteredResults() {
    return this.results.map(r => ({
      ...r,
      messages: (r.messages || []).filter(m => this._isNotIgnored(m.from, r.account)),
      unread: (r.messages || []).filter(m => this._isNotIgnored(m.from, r.account)).length,
    }));
  }

  _isIgnored(fromStr, ignoredList) {
    if (!fromStr || !ignoredList || ignoredList.length === 0) return false;
    const email = fromStr.match(/<([^>]+)>/)?.[1]?.toLowerCase() || fromStr.toLowerCase();
    return ignoredList.some(s => email.includes(s.toLowerCase()));
  }

  _isNotIgnored(fromStr, accountEmail) {
    const list = this.ignoredByAccount[accountEmail] || [];
    return !this._isIgnored(fromStr, list);
  }
}