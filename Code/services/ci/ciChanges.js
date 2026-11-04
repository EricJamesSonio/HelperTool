'use strict';

const { execFile } = require('child_process');

const GIT_TIMEOUT_MS = 15000;
const MAX_BUFFER = 32 * 1024 * 1024;
const MAX_FILES = 2000;
const REF_RE = new RegExp('^[A-Za-z0-9][A-Za-z0-9._/-]*$');
const DEFAULT_BASES = ['origin/main', 'origin/master', 'main', 'master'];

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    const options = {
      cwd,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      env: Object.assign({}, process.env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }),
    };
    execFile('git', args, options, (err, stdout, stderr) => {
      if (err) {
        const first = String(stderr || err.message || '').trim().split(/\r?\n/)[0];
        reject(Object.assign(new Error(first || 'Git failed.'), { gitCode: err.code }));
        return;
      }
      resolve(String(stdout));
    });
  });
}

async function tryGit(cwd, args) {
  try {
    return await git(cwd, args);
  } catch (e) {
    if (e && e.gitCode === 'ENOENT') throw fail(500, 'Git was not found on PATH.');
    return null;
  }
}

function parseNameStatus(text) {
  const tokens = String(text || '').split('\0');
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const code = tokens[i];
    if (!code) {
      i += 1;
      continue;
    }
    const letter = code.charAt(0);
    if (letter === 'R' || letter === 'C') {
      const target = tokens[i + 2];
      if (target) out.push({ file: target, status: letter });
      i += 3;
      continue;
    }
    const file = tokens[i + 1];
    if (file) out.push({ file, status: letter });
    i += 2;
  }
  return out;
}

function statusLetter(x, y) {
  if (x === '?' && y === '?') return '?';
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) return 'U';
  return y !== ' ' ? y : x;
}

function parseStatus(text) {
  const tokens = String(text || '').split('\0');
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const entry = tokens[i];
    if (entry.length < 4) continue;
    const x = entry.charAt(0);
    const y = entry.charAt(1);
    const file = entry.slice(3);
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') i += 1;
    if (x === '!' && y === '!') continue;
    out.push({ file, status: statusLetter(x, y) });
  }
  return out;
}

async function resolveCommit(cwd, ref) {
  const out = await tryGit(cwd, ['rev-parse', '--verify', '--quiet', ref + '^{commit}']);
  return out && out.trim() ? out.trim() : null;
}

async function pickBase(cwd, requested) {
  if (requested) {
    if (!REF_RE.test(requested) || requested.includes('..')) {
      throw fail(400, 'That is not a valid branch or ref name.');
    }
    const sha = await resolveCommit(cwd, requested);
    if (!sha) throw fail(400, 'The base "' + requested + '" was not found in this repository.');
    return { ref: requested, sha };
  }

  const candidates = [];
  const remoteHead = await tryGit(cwd, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (remoteHead && remoteHead.trim()) candidates.push(remoteHead.trim());
  for (const name of DEFAULT_BASES) {
    if (!candidates.includes(name)) candidates.push(name);
  }

  for (const ref of candidates) {
    if (!REF_RE.test(ref)) continue;
    const sha = await resolveCommit(cwd, ref);
    if (sha) return { ref, sha };
  }
  return null;
}

function addEntry(files, entry, source) {
  const existing = files.get(entry.file);
  if (existing) {
    existing.sources.push(source);
    if (source === 'working') existing.status = entry.status;
    return;
  }
  files.set(entry.file, { file: entry.file, status: entry.status, sources: [source] });
}

async function getChanges(options) {
  const o = options || {};
  if (typeof o.repoPath !== 'string' || !o.repoPath) throw fail(400, 'No repository selected.');
  if (o.base !== undefined && o.base !== null && typeof o.base !== 'string') throw fail(400, 'The base must be text.');
  const requested = typeof o.base === 'string' ? o.base.trim() : '';

  const top = await tryGit(o.repoPath, ['rev-parse', '--show-toplevel']);
  if (!top || !top.trim()) throw fail(400, 'This folder is not a Git repository.');
  const cwd = top.trim();

  const headOut = await tryGit(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  const head = headOut && headOut.trim() ? headOut.trim() : null;
  const branchOut = await tryGit(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const branch = branchOut && branchOut.trim() ? branchOut.trim() : null;

  const files = new Map();
  let base = null;
  let note = '';

  if (!head) {
    note = 'The repository has no commits yet, so only working tree changes are shown.';
  } else {
    const picked = await pickBase(cwd, requested);
    if (!picked) {
      note = 'No base branch was found (looked for origin/HEAD, origin/main, origin/master, main and master), so only working tree changes are shown.';
    } else {
      const mergeBase = await tryGit(cwd, ['merge-base', head, picked.sha]);
      if (!mergeBase || !mergeBase.trim()) {
        throw fail(400, 'HEAD and "' + picked.ref + '" share no common history.');
      }
      base = { ref: picked.ref, sha: picked.sha, mergeBase: mergeBase.trim() };
      const diff = await tryGit(cwd, ['diff', '--name-status', '-z', '--no-renames', base.mergeBase, head]);
      if (diff === null) throw fail(500, 'Git could not compare HEAD with the base.');
      for (const entry of parseNameStatus(diff)) addEntry(files, entry, 'committed');
    }
  }

  const status = await tryGit(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (status === null) throw fail(500, 'Git could not read the working tree status.');
  for (const entry of parseStatus(status)) addEntry(files, entry, 'working');

  const list = Array.from(files.values()).sort((a, b) => a.file.localeCompare(b.file));
  const committed = list.filter((f) => f.sources.includes('committed')).length;
  const working = list.filter((f) => f.sources.includes('working')).length;

  return {
    topLevel: cwd,
    branch,
    head,
    base,
    note,
    committed,
    working,
    total: list.length,
    truncated: list.length > MAX_FILES,
    files: list.slice(0, MAX_FILES),
  };
}

module.exports = { getChanges, parseStatus, parseNameStatus };