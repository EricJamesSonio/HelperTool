class NotificationService {
  constructor(getMainWindow) {
    this._getMainWindow = getMainWindow;
    this._unreadCount = 0;
  }

  send(event, payload) {
    const win = this._getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(event, payload);
    }
  }

  notifyNewError(error, sessionId) {
    this._unreadCount++;
    this.send('error-cop:new-error', { error, sessionId });
    this.send('error-cop:unread-count', { count: this._unreadCount });
  }

  notifyTimelineEvent(event) {
    this.send('error-cop:timeline-event', event);
  }

  resetUnreadCount() {
    this._unreadCount = 0;
    this.send('error-cop:unread-count', { count: 0 });
  }

  getUnreadCount() {
    return this._unreadCount;
  }
}

module.exports = { NotificationService };
