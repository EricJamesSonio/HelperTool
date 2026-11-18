'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const GIT_TIMEOUT_MS = 20000;
const MAX_BUFFER = 20 * 1024 * 1024;

function runGit(repoPath, args) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['--no-optional-locks'].concat(args),
      { cwd: repoPath, windowsHide: true, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(String(stdout));
      }
    );
  });
}

function parseStatus(text) {
  const out = { branch: '', upstream: false, ahead: 0, behind: 0, dirty: 0, staged: 0 };
  for (const line of String(text || '').split('\n')) {
    if (!line) continue;
    if (line.startsWith('## ')) {
      const head = line.slice(3);
      const m = /^(?:No commits yet on |Initial commit on )?(.+?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/.exec(head);
      if (m) {
        out.branch = m[1];
        out.upstream = !!m[2];
        const track = m[3] || '';
        const a = /ahead (\d+)/.exec(track);
        const b = /behind (\d+)/.exec(track);
        out.ahead = a ? Number(a[1]) : 0;
        out.behind = b ? Number(b[1]) : 0;
      }
      continue;
    }
    out.dirty += 1;
    if (line[0] !== ' ' && line[0] !== '?') out.staged += 1;
  }
  return out;
}

async function readRepo(repoPath) {
  const base = {
    repoPath,
    name: path.basename(repoPath),
    exists: false,
    isGit: false,
    error: false,
    branch: '',
    upstream: false,
    ahead: 0,
    behind: 0,
    unpushed: 0,
    dirty: 0,
    staged: 0,
    lastCommitAt: 0,
    lastCommitMsg: '',
  };

  let exists = false;
  try {
    exists = fs.statSync(repoPath).isDirectory();
  } catch (_) {
    exists = false;
  }
  if (!exists) return base;
  base.exists = true;
  if (!fs.existsSync(path.join(repoPath, '.git'))) return base;
  base.isGit = true;

  const [status, last] = await Promise.all([
    runGit(repoPath, ['status', '--porcelain=v1', '-b']).catch(() => null),
    runGit(repoPath, ['log', '-1', '--format=%ct%x09%s']).catch(() => ''),
  ]);

  if (status !== null) Object.assign(base, parseStatus(status));
  else base.error = true;

  const parts = String(last).trim().split('\t');
  base.lastCommitAt = Number(parts[0]) || 0;
  base.lastCommitMsg = parts.slice(1).join('\t');

  base.unpushed = base.upstream ? base.ahead : 0;
  if (!base.upstream && base.lastCommitAt) {
    const n = await runGit(repoPath, ['rev-list', '--count', 'HEAD', '--not', '--remotes']).catch(() => '0');
    base.unpushed = Number(String(n).trim()) || 0;
  }
  return base;
}

async function collectRepos(repoPaths, limit) {
  const list = Array.isArray(repoPaths) ? repoPaths : [];
  const out = new Array(list.length);
  let next = 0;

  async function worker() {
    while (next < list.length) {
      const i = next;
      next += 1;
      out[i] = await readRepo(list[i]);
    }
  }

  const size = Math.max(1, Math.min(limit || 4, list.length));
  await Promise.all(Array.from({ length: size }, worker));
  return out;
}

module.exports = { runGit, parseStatus, readRepo, collectRepos };