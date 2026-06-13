const simpleGit = require('simple-git');
const path = require('path');

async function getStatus({ repoPath }) {
  const git = simpleGit(repoPath);
  const status = await git.status();
  const workingFiles = [];
  const stagedFiles = [];
  if (status.files) {
    for (const f of status.files) {
      const wd = f.working_dir && f.working_dir.trim();
      const idx = f.index && f.index.trim();
      if (wd) workingFiles.push({ file: f.path, status: wd });
      if (idx && idx !== '?' && idx !== '!') stagedFiles.push({ file: f.path, status: idx });
    }
  }
  return { success: true, workingFiles, stagedFiles, branch: status.current, ahead: status.ahead, behind: status.behind };
}

async function getDiff({ repoPath, filePath }) {
  const git = simpleGit(repoPath);
  const diff = await git.diff([filePath]);
  return { success: true, diff, file: filePath };
}

async function getLog({ repoPath, maxCount }) {
  const git = simpleGit(repoPath);
  const log = await git.log(['--oneline', `-${maxCount || 50}`]);
  return { success: true, commits: log.all };
}

async function getFileLog({ repoPath, filePath, maxCount }) {
  const git = simpleGit(repoPath);
  const relPath = path.relative(repoPath, filePath);
  const log = await git.log({ maxCount: maxCount || 50, file: relPath });
  return {
    success: true,
    commits: log.all.map(c => ({ hash: c.hash, message: c.message, date: c.date, author: c.author_name })),
  };
}

async function getFileContent({ repoPath, commitHash, filePath }) {
  const git = simpleGit(repoPath);
  const relPath = path.relative(repoPath, filePath);
  const content = await git.show([`${commitHash}:${relPath}`]);
  return { success: true, content, hash: commitHash, file: filePath };
}

async function getDiffCommits({ repoPath, oldCommit, newCommit, filePath }) {
  const git = simpleGit(repoPath);
  const relPath = path.relative(repoPath, filePath);
  const diff = await git.diff([oldCommit, newCommit, '--', relPath]);
  return { success: true, diff, oldCommit, newCommit, file: filePath };
}

module.exports = async function handle(payload) {
  const { action } = payload || {};
  switch (action) {
    case 'status': return getStatus(payload);
    case 'diff': return getDiff(payload);
    case 'log': return getLog(payload);
    case 'fileLog': return getFileLog(payload);
    case 'fileContent': return getFileContent(payload);
    case 'diffCommits': return getDiffCommits(payload);
    default: throw new Error('Unknown gitOperations action: ' + action);
  }
};
