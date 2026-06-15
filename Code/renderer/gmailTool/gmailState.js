export default class GmailState {
  constructor() {
    this.accounts = [];
    this.results = [];
    this.polling = false;
    this.totalUnread = 0;
    this.expandedEmail = null;
    this.status = 'idle';
    this.error = null;
  }

  reset() {
    this.accounts = [];
    this.results = [];
    this.polling = false;
    this.totalUnread = 0;
    this.expandedEmail = null;
    this.status = 'idle';
    this.error = null;
  }

  getAccount(email) {
    return this.accounts.find(a => a.email === email);
  }

  getResult(email) {
    return this.results.find(r => r.account === email);
  }
}
