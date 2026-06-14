const { execFile } = require('child_process');

function execGit(repoPath, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: repoPath, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

function hashColor(email) {
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

function parseMeta(stdout) {
  const commits = [];
  const contributors = {};
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('|');
    if (parts.length < 5) continue;
    const hash = parts[0];
    const author = parts[1];
    const email = parts[2];
    const date = parts[3];
    const message = parts.slice(4).join('|');
    commits.push({
      hash, author, email,
      date: new Date(date).toISOString(),
      message,
      filesChanged: 0, linesAdded: 0, linesRemoved: 0, files: [],
      color: hashColor(email),
    });
    if (!contributors[author]) {
      contributors[author] = { email, commits: 0, linesAdded: 0, linesRemoved: 0, lastCommit: null, color: hashColor(email) };
    }
  }
  for (const c of commits) {
    const con = contributors[c.author];
    if (con) {
      con.commits++;
      if (!con.lastCommit || new Date(c.date) > new Date(con.lastCommit)) con.lastCommit = c.date;
    }
  }
  return { commits, contributors };
}

function parseNumstat(stdout, commits, contributors) {
  const commitMap = {};
  for (const c of commits) commitMap[c.hash] = c;
  let currentHash = null;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.includes('\t') && /^[0-9a-f]{40}$/i.test(trimmed)) {
      currentHash = trimmed;
      continue;
    }
    const parts = trimmed.split('\t');
    if (parts.length < 3) continue;
    const added = parseInt(parts[0], 10);
    const removed = parseInt(parts[1], 10);
    const filePath = parts[2];
    if (isNaN(added) || isNaN(removed)) continue;
    const commit = currentHash ? commitMap[currentHash] : null;
    if (!commit) continue;
    const status = added > 0 && removed === 0 ? 'added' : added === 0 && removed > 0 ? 'deleted' : 'modified';
    commit.files.push({ path: filePath, added, removed, status });
    commit.linesAdded += added;
    commit.linesRemoved += removed;
    commit.filesChanged = commit.files.length;
    if (contributors[commit.author]) {
      contributors[commit.author].linesAdded += added;
      contributors[commit.author].linesRemoved += removed;
    }
  }
}

async function getTeamActivity(repoPath, opts = {}) {
  const limit = opts.limit || 200;
  const since = opts.since || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  })();

  const metaStdout = await execGit(repoPath, [
    'log', '--format=%H|%an|%ae|%aI|%s',
    '--all',
    '--after=' + since,
    '-n', String(limit),
  ]);

  if (!metaStdout.trim()) return { commits: [], contributors: {} };

  const { commits, contributors } = parseMeta(metaStdout);
  if (!commits.length) return { commits, contributors };

  const numstatStdout = await execGit(repoPath, [
    'log', '--numstat', '--format=%H',
    '--all',
    '--after=' + since,
    '-n', String(limit),
  ]);

  parseNumstat(numstatStdout, commits, contributors);
  return { commits, contributors };
}

module.exports = async function handle(payload) {
  const { repoPath, limit, since } = payload || {};
  if (!repoPath) throw new Error('repoPath is required for teamActivity task');
  return getTeamActivity(repoPath, { limit, since });
};
