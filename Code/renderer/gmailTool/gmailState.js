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
      const msgTime = msg.date ? new Date(msg.date).getTime() : 0;
      switch (this.filter) {
        case 'hour': return !isNaN(msgTime) && (now - msgTime) < 3600000;
        case 'today': return !isNaN(msgTime) && new Date(msgTime).toDateString() === new Date().toDateString();
        case 'unread': return true;
        default: return true;
      }
    });
  }
}
