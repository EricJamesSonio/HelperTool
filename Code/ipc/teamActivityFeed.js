const { ipcMain } = require('electron');
const path = require('path');
const gitService = require('./gitService.js');
const prefetchService = require('./prefetchService.js');
const workerProxy = require('./workerProxy.js');

const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function _hashColor(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash) + email.charCodeAt(i);
    hash |= 0;
  }
  const colors = [
    '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399',
    '#22d3ee', '#60a5fa', '#818cf8', '#c084fc', '#e879f9',
    '#f472b6', '#fb7185', '#f97316', '#eab308', '#84cc16',
    '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#a855f7',
    '#ec4899', '#ef4444',
  ];
  return colors[Math.abs(hash) % colors.length];
}

function _parseMeta(stdout) {
  const commits = [];
  const contributors = {};

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format: %H|%an|%ae|%aI|%s
    const parts = trimmed.split('|');
    if (parts.length < 5) continue;

    const hash = parts[0];
    const author = parts[1];
    const email = parts[2];
    const date = parts[3];
    const message = parts.slice(4).join('|');

    commits.push({
      hash,
      author,
      email,
      date: new Date(date).toISOString(),
      message,
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      files: [],
      color: _hashColor(email),
    });

    if (!contributors[author]) {
      contributors[author] = {
        email,
        commits: 0,
        linesAdded: 0,
        linesRemoved: 0,
        lastCommit: null,
        color: _hashColor(email),
      };
    }
  }

  // Count commits and set lastCommit per contributor
  for (const commit of commits) {
    const c = contributors[commit.author];
    if (c) {
      c.commits++;
      if (!c.lastCommit || new Date(commit.date) > new Date(c.lastCommit)) {
        c.lastCommit = commit.date;
      }
    }
  }

  return { commits, contributors };
}

function _parseNumstat(stdout, commits, contributors) {
  const commitMap = {};
  for (const c of commits) commitMap[c.hash] = c;

  let currentHash = null;

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue; // blank lines within a commit section don't reset hash

    // Git log --format=%H outputs only the 40-char hash, followed by a blank line,
    // then numstat lines. Next commit hash follows the last numstat line directly.
    if (!trimmed.includes('\t') && /^[0-9a-f]{40}$/i.test(trimmed)) {
      currentHash = trimmed;
      continue;
    }

    // Numstat line: added\tremoved\tpath
    const parts = trimmed.split('\t');
    if (parts.length < 3) continue;

    const added = parseInt(parts[0], 10);
    const removed = parseInt(parts[1], 10);
    const filePath = parts[2];

    if (isNaN(added) || isNaN(removed)) continue;

    const commit = currentHash ? commitMap[currentHash] : null;
    if (!commit) continue;

    commit.files.push({ path: filePath, added, removed, status: _detectStatus(added, removed) });
    commit.linesAdded += added;
    commit.linesRemoved += removed;
    commit.filesChanged = commit.files.length;

    if (contributors[commit.author]) {
      contributors[commit.author].linesAdded += added;
      contributors[commit.author].linesRemoved += removed;
    }
  }
}

function _detectStatus(added, removed) {
  if (added === 0 && removed === 0) return 'unchanged';
  if (added > 0 && removed === 0) return 'added';
  if (added === 0 && removed > 0) return 'deleted';
  return 'modified';
}

async function logHandler({ repoPath }) {
  if (!repoPath) throw new Error('repoPath is required');

  const cached = prefetchService.get('teamActivity:' + repoPath);
  if (cached) return { commits: cached.commits, contributors: cached.contributors };

  const cached2 = _cache.get(repoPath);
  if (cached2 && (Date.now() - cached2.timestamp) < CACHE_TTL) {
    return { commits: cached2.commits, contributors: cached2.contributors };
  }

  // Offload to worker — parsing happens in child process, not main process
  if (workerProxy.isReady()) {
    try {
      const result = await workerProxy.send('teamActivity', { repoPath }, 120000);
      if (result && result.commits) {
        _cache.set(repoPath, { ...result, timestamp: Date.now() });
        return { commits: result.commits, contributors: result.contributors };
      }
    } catch (err) {
      console.warn('[TeamActivity] Worker failed, falling back:', err.message);
    }
  }

  // Fallback: run in main process
  const metaStdout = await gitService.getCommits(repoPath, {
    format: '%H|%an|%ae|%aI|%s', all: true, noMerges: false, ttl: 120000,
  });
  const { commits, contributors } = _parseMeta(metaStdout);
  const numstatStdout = await gitService.raw(repoPath, ['log', '--all', '--numstat', '--format=%H'], 120000);
  _parseNumstat(numstatStdout, commits, contributors);

  console.log(`[TeamActivity] Parsed ${commits.length} commits, ${Object.keys(contributors).length} contributors`);

  _cache.set(repoPath, { commits, contributors, timestamp: Date.now() });
  return { commits, contributors };
}

async function commitFilesHandler({ repoPath, hash }) {
  if (!repoPath || !hash) throw new Error('repoPath and hash are required');

  const stdout = await gitService.getNumstat(repoPath, hash, { ttl: 60000 });
  const files = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    if (parts.length < 3) continue;
    const added = parseInt(parts[0], 10);
    const removed = parseInt(parts[1], 10);
    const filePath = parts[2];
    if (isNaN(added) || isNaN(removed)) continue;
    const status = added > 0 && removed === 0 ? 'added' : added === 0 && removed > 0 ? 'deleted' : 'modified';
    files.push({ path: filePath, added, removed, status });
  }
  return { files };
}

async function fileAtCommitHandler({ repoPath, hash, filePath }) {
  if (!repoPath || !hash || !filePath) throw new Error('repoPath, hash, and filePath are required');

  try {
    const stdout = await gitService.showFileAtCommit(repoPath, hash, filePath, { ttl: 60000 });
    return { content: stdout };
  } catch (err) {
    return { content: '', error: err.message };
  }
}

async function diffHandler({ repoPath, hash, filePath }) {
  if (!repoPath || !hash || !filePath) throw new Error('repoPath, hash, and filePath are required');

  const stdout = await gitService.show(repoPath, hash, { filePath, ttl: 30000 });

  // Parse diff lines with +/- prefixes
  const lines = stdout.split('\n');
  const diffLines = [];
  for (const line of lines) {
    const ch = line.charAt(0);
    if (ch === '+' || ch === '-' || ch === '@' || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++') || ch === ' ' || ch === '\\') {
      diffLines.push(line);
    }
  }

  return { diff: diffLines.join('\n') };
}

function register() {
  ipcMain.handle('team-activity:log', async (event, { repoPath }) => {
    try {
      return await logHandler({ repoPath });
    } catch (err) {
      return { commits: [], contributors: {}, error: err.message };
    }
  });

  ipcMain.handle('team-activity:diff', async (event, { repoPath, hash, filePath }) => {
    try {
      return await diffHandler({ repoPath, hash, filePath });
    } catch (err) {
      return { diff: '', error: err.message };
    }
  });

  ipcMain.handle('team-activity:file-at-commit', async (event, { repoPath, hash, filePath }) => {
    try {
      return await fileAtCommitHandler({ repoPath, hash, filePath });
    } catch (err) {
      return { content: '', error: err.message };
    }
  });

  ipcMain.handle('team-activity:commit-files', async (event, { repoPath, hash }) => {
    try {
      return await commitFilesHandler({ repoPath, hash });
    } catch (err) {
      return { files: [], error: err.message };
    }
  });
}

module.exports = { register };
