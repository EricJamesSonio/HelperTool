const { ipcMain } = require('electron');
const path = require('path');
const simpleGit = require('simple-git');

// ── In-memory cache ──────────────────────────────────────────
const _cache = new Map(); // repoPath -> { commits, contributors, timestamp }

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

function _parseLog(stdout) {
  const commits = [];
  const contributors = {};
  let current = null;

  for (const line of stdout.split('\n')) {
    if (!line.trim()) {
      if (current) {
        current.filesChanged = current.files.length;
        commits.push(current);
        current = null;
      }
      continue;
    }

    if (line.includes('|')) {
      // Commit header line
      if (current) {
        current.filesChanged = current.files.length;
        commits.push(current);
      }

      const pipeIdx = line.indexOf('|');
      const hash = line.substring(0, pipeIdx).trim();
      const rest = line.substring(pipeIdx + 1);

      const parts = rest.split('|');
      if (parts.length < 4) continue;

      const author = parts[0].trim();
      const email = parts[1].trim();
      const date = parts[2].trim();
      const message = parts.slice(3).join('|').trim();

      current = {
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
      };

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
    } else if (current) {
      // Numstat line: added\tremoved\tpath
      const parts2 = line.trim().split('\t');
      if (parts2.length < 3) continue;
      const added = parseInt(parts2[0], 10);
      const removed = parseInt(parts2[1], 10);
      const filePath = parts2[2];

      if (isNaN(added) || isNaN(removed)) continue;

      current.files.push({ path: filePath, added, removed, status: _detectStatus(added, removed) });
      current.linesAdded += added;
      current.linesRemoved += removed;

      if (contributors[current.author]) {
        contributors[current.author].linesAdded += added;
        contributors[current.author].linesRemoved += removed;
      }
    }
  }

  // Push last commit
  if (current) {
    current.filesChanged = current.files.length;
    commits.push(current);
  }

  // Finalize contributor stats
  for (const commit of commits) {
    if (contributors[commit.author]) {
      const c = contributors[commit.author];
      c.commits++;
      if (!c.lastCommit || new Date(commit.date) > new Date(c.lastCommit)) {
        c.lastCommit = commit.date;
      }
    }
  }

  return { commits, contributors };
}

function _detectStatus(added, removed) {
  if (added === 0 && removed === 0) return 'unchanged';
  if (added > 0 && removed === 0) return 'added';
  if (added === 0 && removed > 0) return 'deleted';
  return 'modified';
}

async function logHandler({ repoPath }) {
  if (!repoPath) throw new Error('repoPath is required');

  const cached = _cache.get(repoPath);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return { commits: cached.commits, contributors: cached.contributors };
  }

  const git = simpleGit(repoPath);
  const logFormat = ['--all', '--numstat', '--format=%H|%an|%ae|%aI|%s'];
  const stdout = await git.raw(['log', ...logFormat]);

  const result = _parseLog(stdout);

  console.log(`[TeamActivity] Parsed ${result.commits.length} commits, ${Object.keys(result.contributors).length} contributors`);

  _cache.set(repoPath, {
    commits: result.commits,
    contributors: result.contributors,
    timestamp: Date.now(),
  });

  return result;
}

async function commitFilesHandler({ repoPath, hash }) {
  if (!repoPath || !hash) throw new Error('repoPath and hash are required');

  const git = simpleGit(repoPath);
  const stdout = await git.raw(['diff-tree', '--no-commit-id', '-r', '--numstat', hash]);
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

  const git = simpleGit(repoPath);
  try {
    const stdout = await git.raw(['show', `${hash}:${filePath}`]);
    return { content: stdout };
  } catch (err) {
    return { content: '', error: err.message };
  }
}

async function diffHandler({ repoPath, hash, filePath }) {
  if (!repoPath || !hash || !filePath) throw new Error('repoPath, hash, and filePath are required');

  const git = simpleGit(repoPath);
  const stdout = await git.raw(['show', hash, '--', filePath]);

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
