const { google } = require('googleapis');
const { OAuth2 } = google.auth;
const http = require('http');
const url = require('url');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const STORE_PATH = path.join(__dirname, '..', 'gmail-store.json');
const TOKEN_KEY = 'gmail.accounts';
const IGNORED_KEY = 'gmail.ignoredSenders';
const SEEN_IDS_KEY = 'gmail.seenIds';           // FIX: persist seen IDs across restarts
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');

// ─── Store helpers ────────────────────────────────────────────────────────────

function readStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch { return {}; }
}

function writeStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

// ─── Seen-IDs: persisted so restarts don't flood notifications ───────────────

function loadSeenIds() {
  const raw = readStore()[SEEN_IDS_KEY];
  return new Set(Array.isArray(raw) ? raw : []);
}

function saveSeenIds(set) {
  // Keep only the most recent 500 to avoid unbounded growth
  const arr = [...set].slice(-500);
  const data = readStore();
  data[SEEN_IDS_KEY] = arr;
  writeStore(data);
}

// Initialise from disk on module load
const _seenIds = loadSeenIds();

// ─── Auth / credentials ───────────────────────────────────────────────────────

let credentials = null;
let pollTimer = null;
let onNewMailCallback = null;

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
  const oauth2Client = new OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uris?.[0] || 'http://localhost'
  );
  if (tokens) oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

function getGmail(auth) {
  return google.gmail({ version: 'v1', auth });
}

// ─── Account storage ──────────────────────────────────────────────────────────

function getStoredAccounts() {
  return readStore()[TOKEN_KEY] || [];
}

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
  const server = await startLocalServer();
  const port = server.address().port;
  const redirectUri = 'http://127.0.0.1:' + port;

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
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
        res.end('Waiting for auth callback...');
      }
    });
    setTimeout(() => reject(new Error('Auth timeout')), 120000);
  });

  const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUri });
  oauth2Client.setCredentials(tokens);

  const gmail = getGmail(oauth2Client);
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const email = profile.data.emailAddress;

  const accounts = getStoredAccounts();
  const existing = accounts.findIndex(a => a.email === email);
  const entry = { email, tokens, addedAt: Date.now() };
  if (existing >= 0) accounts[existing] = entry;
  else accounts.push(entry);
  saveAccounts(accounts);

  // Seed seen IDs with current inbox so we don't notify on first connect
  await _seedSeenIds(oauth2Client);

  return { email, tokens };
}

/**
 * Seed _seenIds with existing messages so the first poll after adding an
 * account doesn't treat every inbox message as "new".
 */
async function _seedSeenIds(oauth2Client) {
  try {
    const gmail = getGmail(oauth2Client);
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 100,
      labelIds: ['INBOX'],
    });
    for (const m of res.data.messages || []) _seenIds.add(m.id);
    saveSeenIds(_seenIds);
  } catch (e) {
    console.warn('[Gmail] Could not seed seenIds:', e.message);
  }
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshToken(account) {
  const oauth2Client = getAuthClient(account.tokens);
  const { credentials: newTokens } = await oauth2Client.refreshAccessToken();
  account.tokens = newTokens;
  const accounts = getStoredAccounts();
  const idx = accounts.findIndex(a => a.email === account.email);
  if (idx >= 0) { accounts[idx].tokens = newTokens; saveAccounts(accounts); }
  return account;
}

async function ensureValidTokens(account) {
  const expiry = account.tokens.expiry_date || 0;
  if (Date.now() >= expiry - 60000) return refreshToken(account);
  return account;
}

// ─── Message fetching ─────────────────────────────────────────────────────────

/**
 * FIX: fetch only INBOX messages and detect genuinely new ones by comparing
 * against the persisted _seenIds set.
 */
async function fetchRecentMessages(account, maxResults = 50) {
  await ensureValidTokens(account);
  const auth = getAuthClient(account.tokens);
  const gmail = getGmail(auth);

  // FIX: scope to INBOX only so we don't pick up sent/drafts/spam
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    labelIds: ['INBOX'],
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) {
    return { account: account.email, unread: 0, messages: [], newIds: [] };
  }

  const newIds = [];
  const details = await Promise.all(messages.slice(0, 50).map(async (msg) => {
    const isNew = !_seenIds.has(msg.id);
    if (isNew) newIds.push(msg.id);
    _seenIds.add(msg.id);

    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      const headers = detail.data.payload?.headers || [];
      const from    = headers.find(h => h.name === 'From')?.value    || 'Unknown';
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const date    = headers.find(h => h.name === 'Date')?.value    || '';
      const snippet = detail.data.snippet || '';
      const labelIds = detail.data.labelIds || [];
      return {
        id: msg.id,
        from, subject, date, snippet,
        threadId: detail.data.threadId,
        unread: labelIds.includes('UNREAD'),
      };
    } catch (e) {
      return { id: msg.id, from: 'Error', subject: 'Failed to load', date: '', snippet: '', unread: false };
    }
  }));

  // Persist updated seen set
  saveSeenIds(_seenIds);

  const unreadCount = details.filter(d => d.unread).length;
  return { account: account.email, unread: unreadCount, messages: details, newIds };
}

/**
 * FIX: also scope inbox view to INBOX label so counts/messages are consistent.
 */
async function fetchInboxMessages(accountEmail, maxResults = 50) {
  const accounts = getStoredAccounts();
  const acct = accounts.find(a => a.email === accountEmail);
  if (!acct) throw new Error('Account not found');
  await ensureValidTokens(acct);
  const auth = getAuthClient(acct.tokens);
  const gmail = getGmail(auth);

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    labelIds: ['INBOX'],    // FIX: was missing
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0)
    return { account: accountEmail, unread: 0, messages: [] };

  let unreadCount = 0;
  const details = await Promise.all(messages.slice(0, 50).map(async (msg) => {
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
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
  const results = [];
  for (const acct of accounts) {
    try {
      const res = await fetchRecentMessages(acct);
      results.push(res);
    } catch (e) {
      results.push({ account: acct.email, unread: -1, messages: [], error: e.message, newIds: [] });
    }
  }
  return results;
}

// ─── Polling ──────────────────────────────────────────────────────────────────

/**
 * FIX: default interval reduced to 30 s (was 60 s in service, overridden to
 * 20 s in IPC — keep 30 s as a sensible default; the IPC layer can override).
 * Gmail push notifications via Pub/Sub would be the proper solution, but
 * polling at 30 s is a reasonable improvement over 60 s.
 */
function startPolling(intervalMs = 30000) {
  if (pollTimer) return;   // already running
  pollTimer = setInterval(async () => {
    try {
      const results = await fetchAllUnread();
      if (onNewMailCallback) onNewMailCallback(results);
    } catch (e) {
      console.error('[Gmail] Poll error:', e.message);
    }
  }, intervalMs);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function setOnNewMail(cb) {
  onNewMailCallback = cb;
}

// ─── Account management ───────────────────────────────────────────────────────

function removeAccount(email) {
  const accounts = getStoredAccounts().filter(a => a.email !== email);
  saveAccounts(accounts);
  if (accounts.length === 0) stopPolling();
}

async function markAsRead(accountEmail, messageId) {
  const accounts = getStoredAccounts();
  const acct = accounts.find(a => a.email === accountEmail);
  if (!acct) throw new Error('Account not found');
  await ensureValidTokens(acct);
  const auth = getAuthClient(acct.tokens);
  const gmail = getGmail(auth);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

// ─── Ignored senders ──────────────────────────────────────────────────────────

function getIgnoredSenders() {
  return readStore()[IGNORED_KEY] || [];
}

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
  getStoredAccounts,
  findAccount,
  startAuthFlow,
  removeAccount,
  fetchAllUnread,
  fetchRecentMessages,
  fetchInboxMessages,
  startPolling,
  stopPolling,
  setOnNewMail,
  markAsRead,
  refreshToken,
  getIgnoredSenders,
  addIgnoredSender,
  removeIgnoredSender,
};