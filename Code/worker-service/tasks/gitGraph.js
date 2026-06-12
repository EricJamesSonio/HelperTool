const { execFile } = require('child_process');

function execGit(repoPath, args) {
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

async function getBranchCommits({ repoPath, branch, page, pageSize }) {
  const ps = pageSize || 20;
  const skip = ((page || 1) - 1) * ps;
  const logOut = await execGit(repoPath, ['log', branch, `--max-count=${ps}`, `--skip=${skip}`, '--format=%H|%s|%an|%aI|%D']);
  const totalOut = await execGit(repoPath, ['rev-list', '--count', branch]);

  const commits = logOut.trim().split('\n').filter(Boolean).map(line => {
    const idx = line.indexOf('|');
    if (idx === -1) return null;
    const hash = line.slice(0, idx);
    const rest = line.slice(idx + 1);
    const parts = rest.split('|');
    return {
      hash,
      message: parts[0] || '',
      author: parts[1] || '',
      date: parts[2] || '',
      refs: parts.slice(3).join('|') || '',
    };
  }).filter(Boolean);

  const totalCount = parseInt(totalOut.trim()) || 0;
  return {
    commits,
    total: totalCount,
    page: page || 1,
    totalPages: Math.max(1, Math.ceil(totalCount / ps)),
  };
}

async function getCommitDetail({ repoPath, hash }) {
  const numstatOut = await execGit(repoPath, ['diff-tree', '--no-commit-id', '-r', '--numstat', hash]);
  const files = numstatOut.trim().split('\n').filter(Boolean).map(line => {
    const parts = line.split('\t');
    if (parts.length < 3) return null;
    return {
      path: parts.slice(2).join('\t'),
      additions: parseInt(parts[0]) || 0,
      deletions: parseInt(parts[1]) || 0,
    };
  }).filter(Boolean);
  return { files };
}

async function getFileDiff({ repoPath, hash, filePath }) {
  const diffOut = await execGit(repoPath, ['diff-tree', '--no-commit-id', '-p', hash, '--', filePath]);
  return { diff: diffOut };
}

module.exports = async function handle(payload) {
  const { action } = payload || {};
  switch (action) {
    case 'branchCommits':
      return getBranchCommits(payload);
    case 'commitDetail':
      return getCommitDetail(payload);
    case 'fileDiff':
      return getFileDiff(payload);
    default:
      throw new Error('Unknown gitGraph action: ' + action);
  }
};
