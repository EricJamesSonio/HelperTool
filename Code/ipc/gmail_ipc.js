const { ipcMain, Notification } = require('electron');
const gmailService = require('../services/gmailService');

function register({ getMainWindow }) {

  ipcMain.handle('gmail:addAccount', async () => {
    try {
      const result = await gmailService.startAuthFlow();
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send('gmail:accountsChanged', gmailService.getStoredAccounts());
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gmail:removeAccount', async (event, { email }) => {
    gmailService.removeAccount(email);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('gmail:accountsChanged', gmailService.getStoredAccounts());
    return { success: true };
  });

  ipcMain.handle('gmail:listAccounts', async () => {
    return { success: true, accounts: gmailService.getStoredAccounts().map(a => ({ email: a.email, addedAt: a.addedAt })) };
  });

  ipcMain.handle('gmail:fetchMessages', async (event, { email, maxResults }) => {
    try {
      const acct = gmailService.findAccount(email);
      if (!acct) return { success: false, error: 'Account not found' };
      const result = await gmailService.fetchUnreadMessages(acct, maxResults || 10);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gmail:fetchAll', async () => {
    try {
      const results = await gmailService.fetchAllUnread();
      return { success: true, results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gmail:markRead', async (event, { email, messageId }) => {
    try {
      await gmailService.markAsRead(email, messageId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gmail:startPolling', async () => {
    gmailService.setOnNewMail((results) => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;

      const totalUnread = results.reduce((sum, r) => sum + (r.unread > 0 ? r.unread : 0), 0);
      win.webContents.send('gmail:pollResult', { results, totalUnread });

      // OS toast for new mail
      for (const r of results) {
        if (r.unread > 0 && r.messages && r.messages.length > 0) {
          const first = r.messages[0];
          const notification = new Notification({
            title: first.from,
            body: first.subject + '\n' + (first.snippet || ''),
            silent: false,
          });
          notification.on('click', () => {
            win.show();
            win.focus();
            win.webContents.send('gmail:openMessage', { email: r.account, messageId: first.id });
          });
          notification.show();
        }
      }
    });
    gmailService.startPolling(60000);
    return { success: true };
  });

  ipcMain.handle('gmail:stopPolling', async () => {
    gmailService.stopPolling();
    return { success: true };
  });
}

module.exports = { register };
