const { ipcMain, Notification } = require('electron');
const gmailService = require('../services/gmailService');

function extractName(fromStr) {
  if (!fromStr) return 'Unknown';
  const match = fromStr.match(/^"?(.+?)"?\s*</);
  return match ? match[1].trim() : fromStr.split('@')[0];
}

function _extractEmail(fromStr) {
  if (!fromStr) return '';
  const match = fromStr.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : fromStr.toLowerCase();
}

function isIgnored(fromStr, ignored) {
  if (!fromStr || !ignored || ignored.length === 0) return false;
  const email = _extractEmail(fromStr);
  const name = fromStr.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim().toLowerCase() || fromStr.toLowerCase();
  const matched = ignored.some(s => {
    const term = s.toLowerCase();
    return email.includes(term) || name === term;
  });
  if (matched) {
    console.log(`[Gmail IPC] isIgnored=true for "${fromStr}" (email="${email}" matches ignore list)`);
  }
  return matched;
}

function register({ getMainWindow }) {

  // ── Accounts ──────────────────────────────────────────────────────────────

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

  ipcMain.handle('gmail:listAccounts', async () => ({
    success: true,
    accounts: gmailService.getStoredAccounts().map(a => ({ email: a.email, addedAt: a.addedAt })),
  }));

  // ── Fetch ─────────────────────────────────────────────────────────────────

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
      if (!win || win.isDestroyed()) {
        console.log('[Gmail IPC] onNewMail called but main window is gone');
        return;
      }

      const totalUnread = results.reduce((sum, r) => sum + (r.unread > 0 ? r.unread : 0), 0);
      const totalNewMsgs = results.reduce((sum, r) => sum + (r.newMessages?.length || 0), 0);
      console.log(`[Gmail IPC] onNewMail fired: ${results.length} accounts, ${totalUnread} unread, ${totalNewMsgs} new messages`);

      // Send full poll result to renderer (updates badge + inbox list)
      console.log('[Gmail IPC] Sending gmail:pollResult to renderer');
      win.webContents.send('gmail:pollResult', { results, totalUnread });

      // Fire desktop notifications only for genuinely new messages (via History API)
      const ignoredMap = gmailService.getAllIgnoredSendersMap();
      console.log(`[Gmail IPC] Ignored senders map: ${JSON.stringify(ignoredMap)}`);
      for (const r of results) {
        const newMsgs = r.newMessages || [];
        const ignored = ignoredMap[r.account] || [];
        if (newMsgs.length === 0) {
          console.log(`[Gmail IPC] ${r.account}: no new messages, skipping notifications`);
          continue;
        }
        console.log(`[Gmail IPC] ${r.account}: processing ${newMsgs.length} new messages for notifications`);

        for (const msg of newMsgs) {
          if (isIgnored(msg.from, ignored)) {
            console.log(`[Gmail IPC] Ignored notification for ${msg.from}: "${msg.subject}"`);
            continue;
          }

          const senderName = extractName(msg.from);
          console.log(`[Gmail IPC] FIRING notification: ${senderName} — "${msg.subject}" (id=${msg.id})`);
          const notif = new Notification({
            title: senderName,
            body:  (msg.subject || '(no subject)') + (msg.snippet ? '\n' + msg.snippet.slice(0, 100) : ''),
            silent: false,
          });
          notif.on('click', () => {
            win.show();
            win.focus();
            win.webContents.send('gmail:openMessage', { email: r.account, messageId: msg.id });
          });
          notif.show();
        }
      }
    });

    console.log('[Gmail IPC] Calling gmailService.startPolling(15000)');
    gmailService.startPolling(15000);
    return { success: true };
  });

  ipcMain.handle('gmail:checkNow', async () => {
    try {
      console.log('[Gmail IPC] checkNow called');
      const results     = await gmailService.fetchAllUnread();
      const totalUnread = results.reduce((sum, r) => sum + (r.unread > 0 ? r.unread : 0), 0);
      console.log(`[Gmail IPC] checkNow results: ${results.length} accounts, ${totalUnread} unread`);
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        console.log('[Gmail IPC] checkNow sending gmail:pollResult to renderer');
        win.webContents.send('gmail:pollResult', { results, totalUnread });
      } else {
        console.log('[Gmail IPC] checkNow: main window unavailable');
      }
      return { success: true, results, totalUnread };
    } catch (err) {
      console.error('[Gmail IPC] checkNow error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('gmail:stopPolling', async () => {
    gmailService.stopPolling();
    return { success: true };
  });

  // ── Ignored senders ───────────────────────────────────────────────────────

  ipcMain.handle('gmail:getIgnoredSenders', async (event, { email }) => ({
    success: true,
    senders: gmailService.getIgnoredSenders(email),
  }));

  ipcMain.handle('gmail:addIgnoredSender', async (event, { email, sender }) => {
    gmailService.addIgnoredSender(email, sender);
    return { success: true };
  });

  ipcMain.handle('gmail:removeIgnoredSender', async (event, { email, sender }) => {
    gmailService.removeIgnoredSender(email, sender);
    return { success: true };
  });
}

module.exports = { register };