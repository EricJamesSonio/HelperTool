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

    this.ignoredSenders = [];
    this.showIgnoredManager = false;
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
    this.ignoredSenders = [];
    this.showIgnoredManager = false;
  }

  getAccount(email) {
    return this.accounts.find(a => a.email === email);
  }

  getResult(email) {
    return this.results.find(r => r.account === email);
  }

  getFilteredMessages() {
    const now = Date.now();
    return this.inboxMessages.filter(msg => {
      if (this._isIgnored(msg.from)) return false;
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
      messages: (r.messages || []).filter(m => !this._isIgnored(m.from)),
      unread: (r.messages || []).filter(m => !this._isIgnored(m.from)).length,
    }));
  }

  _isIgnored(fromStr) {
    if (!fromStr || this.ignoredSenders.length === 0) return false;
    const lower = fromStr.toLowerCase();
    return this.ignoredSenders.some(s => lower.includes(s.toLowerCase()));
  }
}
