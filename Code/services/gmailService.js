const { google } = require('googleapis');
const { OAuth2 } = google.auth;
const http = require('http');
const url = require('url');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const STORE_PATH       = path.join(__dirname, '..', 'gmail-store.json');
const TOKEN_KEY        = 'gmail.accounts';
const IGNORED_KEY      = 'gmail.ignoredSenders';
const HISTORY_ID_KEY   = 'gmail.historyIds';   // { [email]: lastHistoryId }
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');

// ─── Store helpers ────────────────────────────────────────────────────────────

function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); }
  catch { return {}; }
}

function writeStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

// ─── History ID persistence ───────────────────────────────────────────────────
// historyId is Gmail's cursor — it marks "I have seen everything up to here".
// By storing it per-account we only fetch changes since the last poll.

function getHistoryIds() {
  return readStore()[HISTORY_ID_KEY] || {};
}

function saveHistoryId(email, historyId) {
  const data = readStore();
  data[HISTORY_ID_KEY] = data[HISTORY_ID_KEY] || {};
  data[HISTORY_ID_KEY][email] = historyId;
  writeStore(data);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

let credentials = null;
let pollTimer    = null;
let onNewMailCallback = null;
let _notifiedMessageIds = new Set(); // tracks IDs we've already notified across all accounts

function loadCredentials() {
  if (credentials) return credentials;
  if (!fs.existsSync(CREDENTIALS_PATH))
    throw new Error('credentials.json not found at ' + CREDENTIALS_PATH);
  const parsed = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  credentials = parsed.installed || parsed.web || parsed;
  return credentials;
}

function getAuthClient(tokens) {
  const creds = loadCredentials();
  const client = new OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris?.[0] || 'http://localhost'
  );
  if (tokens) client.setCredentials(tokens);
  return client;
}

function getGmail(auth) {
  return google.gmail({ version: 'v1', auth });
}

// ─── Account storage ──────────────────────────────────────────────────────────

function getStoredAccounts() { return readStore()[TOKEN_KEY] || []; }

function saveAccounts(accounts) {
  const data = readStore();
  data[TOKEN_KEY] = accounts;
  writeStore(data);
}

function findAccount(email) {
  return getStoredAccounts().find(a => a.email === email);
}

// ─── OAuth flow ───────────────────────────────────────────────────────────────

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function startAuthFlow() {
  loadCredentials();
  const oauth2Client = getAuthClient();
  const server       = await startLocalServer();
  const port         = server.address().port;
  const redirectUri  = 'http://127.0.0.1:' + port;

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    redirect_uri: redirectUri,
  });

  execSync('start "" "' + authUrl + '"', { shell: true, stdio: 'ignore' });

  const { code } = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const query = url.parse(req.url, true).query;
      if (query.code) {
        res.end('<script>window.close()</script><p>Auth complete. You can close this tab.</p>');
        server.close();
        resolve({ code: query.code });
      } else if (query.error) {
        res.end('<p>Auth failed: ' + query.error + '</p>');
        server.close();
        reject(new Error(query.error));
      } else {
        res.end('Waiting...');
      }
    });
    setTimeout(() => reject(new Error('Auth timeout')), 120000);
  });

  const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUri });
  oauth2Client.setCredentials(tokens);

  const gmail   = getGmail(oauth2Client);
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const email   = profile.data.emailAddress;

  // Persist account
  const accounts = getStoredAccounts();
  const idx      = accounts.findIndex(a => a.email === email);
  const entry    = { email, tokens, addedAt: Date.now() };
  if (idx >= 0) accounts[idx] = entry; else accounts.push(entry);
  saveAccounts(accounts);

  // Seed the historyId so first poll doesn't flood notifications
  await _seedHistoryId(email, gmail);

  return { email, tokens };
}

/**
 * Get the current historyId from Gmail's profile and store it.
 * This means "I acknowledge everything up to now — only tell me about NEW stuff."
 */
async function _seedHistoryId(email, gmail) {
  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const historyId = profile.data.historyId;
    if (historyId) {
      saveHistoryId(email, historyId);
      console.log(`[Gmail] Seeded historyId for ${email}: ${historyId}`);
    }
  } catch (e) {
    console.warn('[Gmail] Could not seed historyId:', e.message);
  }
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshToken(account) {
  const client = getAuthClient(account.tokens);
  const { credentials: newTokens } = await client.refreshAccessToken();
  account.tokens = newTokens;
  const accounts = getStoredAccounts();
  const idx      = accounts.findIndex(a => a.email === account.email);
  if (idx >= 0) { accounts[idx].tokens = newTokens; saveAccounts(accounts); }
  return account;
}

async function ensureValidTokens(account) {
  if (Date.now() >= (account.tokens.expiry_date || 0) - 60000)
    return refreshToken(account);
  return account;
}

// ─── Core: History-based new-mail detection ───────────────────────────────────
//
// Instead of re-fetching the same N messages and guessing which are "new",
// we use Gmail's history.list API which returns only changes since a given
// historyId. This is accurate, quota-friendly, and truly detects new arrivals.

async function fetchNewMessagesSinceLastCheck(account) {
  await ensureValidTokens(account);
  const auth   = getAuthClient(account.tokens);
  const gmail  = getGmail(auth);
  const email  = account.email;

  // Get stored cursor
  const historyIds  = getHistoryIds();
  const lastHistId  = historyIds[email];

  console.log(`[Gmail History] ${email}: stored historyId = ${lastHistId || 'NONE (will seed)'}`);

  // If no cursor yet, seed it now (first run after update)
  if (!lastHistId) {
    console.log(`[Gmail History] ${email}: No historyId, seeding...`);
    await _seedHistoryId(email, gmail);
    return { account: email, newMessages: [], historySeeded: true };
  }

  let newMessages = [];

  try {
    // Ask Gmail for everything that changed since lastHistId
    console.log(`[Gmail History] ${email}: Calling history.list with startHistoryId=${lastHistId}`);
    const histRes = await gmail.users.history.list({
      userId:          'me',
      startHistoryId:  lastHistId,
      historyTypes:    ['messageAdded'],
      labelId:         'INBOX',            // only care about inbox arrivals
    });

    const historyItems = histRes.data.history || [];
    const newHistoryId = histRes.data.historyId;

    console.log(`[Gmail History] ${email}: Got ${historyItems.length} history items, newHistoryId=${newHistoryId || 'N/A'}`);

    // Collect all added message IDs
    const addedIds = [];
    for (const item of historyItems) {
      for (const added of (item.messagesAdded || [])) {
        // Double-check it's in INBOX (filter is advisory, not always strict)
        const labelIds = added.message.labelIds || [];
        if (labelIds.includes('INBOX')) {
          addedIds.push(added.message.id);
        }
      }
    }

    console.log(`[Gmail History] ${email}: Found ${addedIds.length} new messages via history API: ${JSON.stringify(addedIds)}`);

    // Fetch metadata for each new message
    if (addedIds.length > 0) {
      newMessages = await Promise.all(addedIds.map(async (msgId) => {
        try {
          const detail  = await gmail.users.messages.get({
            userId: 'me',
            id:     msgId,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date'],
          });
          const headers  = detail.data.payload?.headers || [];
          const from     = headers.find(h => h.name === 'From')?.value    || 'Unknown';
          const subject  = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
          const date     = headers.find(h => h.name === 'Date')?.value    || '';
          const snippet  = detail.data.snippet || '';
          return { id: msgId, from, subject, date, snippet, threadId: detail.data.threadId };
        } catch (e) {
          return { id: msgId, from: 'Error', subject: 'Failed to load', date: '', snippet: '' };
        }
      }));
    }

    // Advance cursor so next poll picks up from here
    if (newHistoryId) {
      saveHistoryId(email, newHistoryId);
      console.log(`[Gmail History] ${email}: Advanced historyId to ${newHistoryId}`);
    } else {
      console.log(`[Gmail History] ${email}: No newHistoryId in response, keeping old cursor`);
    }

  } catch (err) {
    // historyId too old (410 Gone) — re-seed and try next cycle
    if (err.code === 410 || (err.message && err.message.includes('Invalid historyId'))) {
      console.warn(`[Gmail] historyId expired for ${email}, re-seeding`);
      await _seedHistoryId(email, gmail);
    } else {
      throw err;
    }
  }

  console.log(`[Gmail History] ${email}: Returning ${newMessages.length} new messages`);
  return { account: email, newMessages };
}

// ─── fetchRecentMessages: used for polling result + unread count ──────────────
//
// Still used to compute the unread badge count and populate the inbox UI.
// Now also returns newMessages detected via history API.

async function fetchRecentMessages(account, maxResults = 50) {
  await ensureValidTokens(account);
  const auth  = getAuthClient(account.tokens);
  const gmail = getGmail(auth);

  // Run history check and inbox fetch in parallel
  const [historyResult, listRes] = await Promise.all([
    fetchNewMessagesSinceLastCheck(account).catch(e => {
      console.error('[Gmail] History check failed:', e.message);
      return { account: account.email, newMessages: [] };
    }),
    gmail.users.messages.list({
      userId:    'me',
      maxResults,
      labelIds:  ['INBOX'],
      q:         'in:inbox',
    }),
  ]);

  const messages = listRes.data.messages || [];

  const details = await Promise.all(messages.slice(0, 50).map(async (msg) => {
    try {
      const detail   = await gmail.users.messages.get({
        userId: 'me', id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      const headers  = detail.data.payload?.headers || [];
      const from     = headers.find(h => h.name === 'From')?.value    || 'Unknown';
      const subject  = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const date     = headers.find(h => h.name === 'Date')?.value    || '';
      const snippet  = detail.data.snippet || '';
      const labelIds = detail.data.labelIds || [];
      return { id: msg.id, from, subject, date, snippet, threadId: detail.data.threadId, unread: labelIds.includes('UNREAD') };
    } catch (e) {
      return { id: msg.id, from: 'Error', subject: 'Failed to load', date: '', snippet: '', unread: false };
    }
  }));

  const unreadCount  = details.filter(d => d.unread).length;
  const historyNew   = historyResult.newMessages || [];
  const historyNewIds = new Set(historyNew.map(m => m.id));

  // Find inbox messages that are NOT yet in _notifiedMessageIds and NOT already
  // covered by the history API. This catches emails that arrived before seeding
  // or in edge cases where history.list misses them.
  const unseenMessages = details
    .filter(d => !_notifiedMessageIds.has(d.id) && !historyNewIds.has(d.id))
    .map(d => ({ id: d.id, from: d.from, subject: d.subject, date: d.date, snippet: d.snippet, threadId: d.threadId }));

  if (unseenMessages.length > 0) {
    console.log(`[Gmail] Adding ${unseenMessages.length} messages from inbox list that were not yet notified`);
    for (const m of unseenMessages) {
      console.log(`[Gmail]   Unseen: ${m.from} — "${m.subject}"`);
    }
  }

  // Merge both sources, keeping history results first, then unseen inbox messages
  const allNew = [...historyNew, ...unseenMessages];

  // Track ALL message IDs so we never double-notify
  for (const d of details) {
    _notifiedMessageIds.add(d.id);
  }

  return {
    account:     account.email,
    unread:      unreadCount,
    messages:    details,
    newMessages: allNew,
    newIds:      allNew.map(m => m.id),
  };
}

async function fetchInboxMessages(accountEmail, maxResults = 50) {
  const accounts = getStoredAccounts();
  const acct = accounts.find(a => a.email === accountEmail);
  if (!acct) throw new Error('Account not found');
  await ensureValidTokens(acct);
  const auth  = getAuthClient(acct.tokens);
  const gmail = getGmail(auth);

  const listRes = await gmail.users.messages.list({
    userId: 'me', maxResults,
    labelIds: ['INBOX'],
    q:        'in:inbox',
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return { account: accountEmail, unread: 0, messages: [] };

  let unreadCount = 0;
  const details = await Promise.all(messages.slice(0, 50).map(async (msg) => {
    try {
      const detail  = await gmail.users.messages.get({
        userId: 'me', id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      const headers  = detail.data.payload?.headers || [];
      const from     = headers.find(h => h.name === 'From')?.value    || 'Unknown';
      const subject  = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const date     = headers.find(h => h.name === 'Date')?.value    || '';
      const snippet  = detail.data.snippet || '';
      const labelIds = detail.data.labelIds || [];
      if (labelIds.includes('UNREAD')) unreadCount++;
      return { id: msg.id, from, subject, date, snippet, threadId: detail.data.threadId };
    } catch (e) {
      return { id: msg.id, from: 'Error', subject: 'Failed to load', date: '', snippet: '' };
    }
  }));

  return { account: accountEmail, unread: unreadCount, messages: details };
}

async function fetchAllUnread() {
  const accounts = getStoredAccounts();
  const results  = [];
  for (const acct of accounts) {
    try {
      results.push(await fetchRecentMessages(acct));
    } catch (e) {
      results.push({ account: acct.email, unread: -1, messages: [], newMessages: [], newIds: [], error: e.message });
    }
  }
  return results;
}

// ─── Polling ──────────────────────────────────────────────────────────────────

function startPolling(intervalMs = 15000) {
  if (pollTimer) {
    console.log('[Gmail Poll] startPolling called but timer already running');
    return;
  }
  console.log(`[Gmail Poll] Starting polling at ${intervalMs}ms interval`);
  pollTimer = setInterval(async () => {
    console.log('[Gmail Poll] Tick — fetching all accounts...');
    try {
      const results = await fetchAllUnread();
      const totalNew = results.reduce((s, r) => s + (r.newMessages?.length || 0), 0);
      console.log(`[Gmail Poll] fetchAllUnread returned ${results.length} accounts, ${totalNew} new messages across all`);
      for (const r of results) {
        console.log(`[Gmail Poll]   ${r.account}: unread=${r.unread}, newMessages=${r.newMessages?.length || 0}, newIds=${JSON.stringify(r.newIds || [])}`);
      }
      if (onNewMailCallback) onNewMailCallback(results);
    } catch (e) {
      console.error('[Gmail Poll] Poll error:', e.message);
    }
  }, intervalMs);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function setOnNewMail(cb) { onNewMailCallback = cb; }

// ─── Account management ───────────────────────────────────────────────────────

function removeAccount(email) {
  saveAccounts(getStoredAccounts().filter(a => a.email !== email));
  stopPolling();
}

async function markAsRead(accountEmail, messageId) {
  const acct = findAccount(accountEmail);
  if (!acct) throw new Error('Account not found');
  await ensureValidTokens(acct);
  const gmail = getGmail(getAuthClient(acct.tokens));
  await gmail.users.messages.modify({
    userId: 'me', id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

// ─── Ignored senders ──────────────────────────────────────────────────────────

function getIgnoredSenders() { return readStore()[IGNORED_KEY] || []; }

function addIgnoredSender(sender) {
  const data = readStore();
  const list = data[IGNORED_KEY] || [];
  if (!list.includes(sender)) { list.push(sender); data[IGNORED_KEY] = list; writeStore(data); }
}

function removeIgnoredSender(sender) {
  const data = readStore();
  data[IGNORED_KEY] = (data[IGNORED_KEY] || []).filter(s => s !== sender);
  writeStore(data);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getStoredAccounts, findAccount,
  startAuthFlow, removeAccount,
  fetchAllUnread, fetchRecentMessages, fetchInboxMessages,
  startPolling, stopPolling, setOnNewMail,
  markAsRead, refreshToken,
  getIgnoredSenders, addIgnoredSender, removeIgnoredSender,
};