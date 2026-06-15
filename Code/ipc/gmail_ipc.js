const { ipcMain, Notification } = require('electron');
const gmailService = require('../services/gmailService');

function extractName(fromStr) {
  if (!fromStr) return 'Unknown';
  const match = fromStr.match(/^"?(.+?)"?\s*</);
  return match ? match[1].trim() : fromStr.split('@')[0];
}

function isIgnored(fromStr, ignored) {
  if (!fromStr || ignored.length === 0) return false;
  const lower = fromStr.toLowerCase();
  return ignored.some(s => lower.includes(s.toLowerCase()));
}

function register({ getMainWindow }) {

  // ── Account management ────────────────────────────────────────────────────

  ipcMain.handle('gmail:addAccount', async () => {
    try {
      const result = await gmailService.startAuthFlow();
      const win = getMainWindow();
      if (win && !win.isDestroyed())
        win.webContents.send('gmail:accountsChanged', gmailService.getStoredAccounts());
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gmail:removeAccount', async (event, { email }) => {
    gmailService.removeAccount(email);
    const win = getMainWindow();
    if (win && !win.isDestroyed())
      win.webContents.send('gmail:accountsChanged', gmailService.getStoredAccounts());
    return { success: true };
  });

  ipcMain.handle('gmail:listAccounts', async () => {
    return {
      success: true,
      accounts: gmailService.getStoredAccounts().map(a => ({ email: a.email, addedAt: a.addedAt })),
    };
  });

  // ── Message fetching ──────────────────────────────────────────────────────

  ipcMain.handle('gmail:fetchMessages', async (event, { email, maxResults }) => {
    try {
      const acct = gmailService.findAccount(email);
      if (!acct) return { success: false, error: 'Account not found' };
      const result = await gmailService.fetchRecentMessages(acct, maxResults || 10);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gmail:fetchInbox', async (event, { email, maxResults }) => {
    try {
      const result = await gmailService.fetchInboxMessages(email, maxResults || 50);
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

  // ── Polling ───────────────────────────────────────────────────────────────

  ipcMain.handle('gmail:startPolling', async () => {
    gmailService.setOnNewMail((results) => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;

      const totalUnread = results.reduce((sum, r) => sum + (r.unread > 0 ? r.unread : 0), 0);
      win.webContents.send('gmail:pollResult', { results, totalUnread });

      const ignored = gmailService.getIgnoredSenders();

      for (const r of results) {
        // Only notify for genuinely new messages (newIds populated by service)
        if (!r.newIds || r.newIds.length === 0 || !r.messages) continue;

        const newMsgs = r.messages.filter(m => r.newIds.includes(m.id));
        for (const msg of newMsgs) {
          const senderName = extractName(msg.from);
          if (isIgnored(senderName, ignored)) continue;

          const notification = new Notification({
            title: senderName,
            body: (msg.subject || '(no subject)') + (msg.snippet ? '\n' + msg.snippet : ''),
            silent: false,
          });
          notification.on('click', () => {
            win.show();
            win.focus();
            win.webContents.send('gmail:openMessage', { email: r.account, messageId: msg.id });
          });
          notification.show();
        }
      }
    });

    // FIX: poll every 30 s for a reasonable near-realtime experience
    gmailService.startPolling(30000);
    return { success: true };
  });

  ipcMain.handle('gmail:checkNow', async () => {
    try {
      const results = await gmailService.fetchAllUnread();
      const totalUnread = results.reduce((sum, r) => sum + (r.unread > 0 ? r.unread : 0), 0);
      const win = getMainWindow();
      if (win && !win.isDestroyed())
        win.webContents.send('gmail:pollResult', { results, totalUnread });
      return { success: true, results, totalUnread };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gmail:stopPolling', async () => {
    gmailService.stopPolling();
    return { success: true };
  });

  // ── Ignored senders ───────────────────────────────────────────────────────

  ipcMain.handle('gmail:getIgnoredSenders', async () => {
    return { success: true, senders: gmailService.getIgnoredSenders() };
  });

  ipcMain.handle('gmail:addIgnoredSender', async (event, { sender }) => {
    gmailService.addIgnoredSender(sender);
    return { success: true };
  });

  ipcMain.handle('gmail:removeIgnoredSender', async (event, { sender }) => {
    gmailService.removeIgnoredSender(sender);
    return { success: true };
  });
}

module.exports = { register };