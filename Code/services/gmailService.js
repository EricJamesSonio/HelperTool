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
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');

function readStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch { return {}; }
}

function writeStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

let credentials = null;
let pollTimer = null;
let pollAccounts = [];
let onNewMailCallback = null;

function loadCredentials() {
  if (credentials) return credentials;
  const p = CREDENTIALS_PATH;
  if (!fs.existsSync(p)) throw new Error('credentials.json not found at ' + p);
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw);
  credentials = parsed.installed || parsed.web || parsed;
  return credentials;
}

function getAuthClient(tokens) {
  const creds = loadCredentials();
  const oauth2Client = new OAuth2(creds.client_id, creds.client_secret, creds.redirect_uris?.[0] || 'http://localhost');
  if (tokens) oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

function getGmail(auth) {
  return google.gmail({ version: 'v1', auth });
}

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

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function startAuthFlow() {
  const creds = loadCredentials();
  const oauth2Client = getAuthClient();
  const server = await startLocalServer();
  const port = server.address().port;
  const redirectUri = 'http://127.0.0.1:' + port;

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify'],
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

  // Get profile to get email address
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

  return { email, tokens };
}

async function refreshToken(account) {
  const creds = loadCredentials();
  const oauth2Client = getAuthClient(account.tokens);
  const { credentials: newTokens } = await oauth2Client.refreshAccessToken();
  account.tokens = newTokens;
  const accounts = getStoredAccounts();
  const idx = accounts.findIndex(a => a.email === account.email);
  if (idx >= 0) {
    accounts[idx].tokens = newTokens;
    saveAccounts(accounts);
  }
  return account;
}

async function ensureValidTokens(account) {
  const creds = loadCredentials();
  const oauth2Client = getAuthClient(account.tokens);
  const expiry = account.tokens.expiry_date || 0;
  if (Date.now() >= expiry - 60000) {
    return refreshToken(account);
  }
  return account;
}

async function fetchUnreadMessages(account, maxResults = 50) {
  await ensureValidTokens(account);
  const auth = getAuthClient(account.tokens);
  const gmail = getGmail(auth);

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults: maxResults,
  });

  const messages = listRes.data.messages || [];

  if (messages.length === 0) return { account: account.email, unread: 0, messages: [] };

  const details = await Promise.all(messages.slice(0, 50).map(async (msg) => {
    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
      const headers = detail.data.payload?.headers || [];
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      const snippet = detail.data.snippet || '';
      return { id: msg.id, from, subject, date, snippet, threadId: detail.data.threadId };
    } catch (e) {
      return { id: msg.id, from: 'Error', subject: 'Failed to load', date: '', snippet: '' };
    }
  }));

  return { account: account.email, unread: details.length, messages: details };
}

async function fetchInboxMessages(accountEmail, maxResults = 50) {
  const accounts = getStoredAccounts();
  const acct = accounts.find(a => a.email === accountEmail);
  if (!acct) throw new Error('Account not found');
  await ensureValidTokens(acct);
  const auth = getAuthClient(acct.tokens);
  const gmail = getGmail(auth);

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: maxResults,
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return { account: accountEmail, unread: 0, messages: [] };

  let unreadCount = 0;
  const details = await Promise.all(messages.slice(0, 50).map(async (msg) => {
    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
      const headers = detail.data.payload?.headers || [];
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      const snippet = detail.data.snippet || '';
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
      const res = await fetchUnreadMessages(acct);
      results.push(res);
    } catch (e) {
      results.push({ account: acct.email, unread: -1, messages: [], error: e.message });
    }
  }
  return results;
}

function startPolling(intervalMs = 60000) {
  if (pollTimer) return;
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
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function setOnNewMail(cb) {
  onNewMailCallback = cb;
}

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

function getIgnoredSenders() {
  return readStore()[IGNORED_KEY] || [];
}

function addIgnoredSender(sender) {
  const data = readStore();
  const list = data[IGNORED_KEY] || [];
  if (!list.includes(sender)) {
    list.push(sender);
    data[IGNORED_KEY] = list;
    writeStore(data);
  }
}

function removeIgnoredSender(sender) {
  const data = readStore();
  data[IGNORED_KEY] = (data[IGNORED_KEY] || []).filter(s => s !== sender);
  writeStore(data);
}

module.exports = {
  getStoredAccounts,
  findAccount,
  startAuthFlow,
  removeAccount,
  fetchAllUnread,
  fetchUnreadMessages,
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
