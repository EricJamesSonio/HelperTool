'use strict';

const { execFile } = require('child_process');

const GIT_TIMEOUT_MS = 20000;
const MAX_LIST_BUFFER = 16 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DIFF_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 3000;
const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const HASH_RE = /^[0-9a-f]{7,64}$/i;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._\/+#@-]*$/;
const NO_HISTORY_RE = /unknown revision|does not have any commits|bad revision|ambiguous argument|bad default revision/i;
const FIELD = '\u001f';
const RECORD = '\u001e';

let registered = false;

function fail(message, extra) {
  return Object.assign({ success: false, error: message }, extra || {});
}

function userError(message, extra) {
  return Object.assign(new Error(message), extra || {});
}

function git(repoPath, args, options) {
  const o = options || {};
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd: repoPath,
        encoding: o.buffer ? 'buffer' : 'utf8',
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: o.maxBuffer || MAX_LIST_BUFFER,
        windowsHide: true,
        env: Object.assign({}, process.env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }),
      },
      (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') {
            reject(userError('Git was not found on PATH.', { gitCode: 'ENOENT', stderrText: '' }));
            return;
          }
          const text = String(stderr || err.message || '').trim();
          const first = text.split(/\r?\n/)[0];
          reject(userError(first || 'Git failed.', { gitCode: err.code, stderrText: text }));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function checkRepo(repoPath) {
  if (typeof repoPath !== 'string' || !repoPath.trim()) {
    throw userError('No repository selected.');
  }
}

function isSafeRef(name) {
  return (
    typeof name === 'string' &&
    REF_RE.test(name) &&
    !name.includes('..') &&
    !name.endsWith('/') &&
    !name.endsWith('.lock')
  );
}

function checkRef(name) {
  if (!isSafeRef(name)) throw userError('That branch name is not supported.');
}

function checkHash(hash) {
  if (typeof hash !== 'string' || !HASH_RE.test(hash)) throw userError('That is not a valid commit id.');
}

function checkPath(filePath) {
  if (typeof filePath !== 'string' || !filePath || filePath.length > 4096 || filePath.includes('\0')) {
    throw userError('That is not a valid file path.');
  }
  if (filePath.startsWith('/') || filePath.startsWith('./') || filePath.startsWith('../') || filePath.includes('/../')) {
    throw userError('That is not a valid file path.');
  }
}

function byName(a, b) {
  return a.localeCompare(b);
}

function parseNameStatus(text) {
  const tokens = String(text || '').split('\0');
  const out = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const status = tokens[i];
    const file = tokens[i + 1];
    if (!status || !file) continue;
    out.push({ file, status: status.charAt(0) });
  }
  return out;
}

function parseNumstat(text) {
  const out = [];
  for (const record of String(text || '').split('\0')) {
    if (!record) continue;
    const parts = record.split('\t');
    if (parts.length < 3) continue;
    const binary = parts[0] === '-' || parts[1] === '-';
    out.push({
      file: parts.slice(2).join('\t'),
      additions: binary ? 0 : parseInt(parts[0], 10) || 0,
      deletions: binary ? 0 : parseInt(parts[1], 10) || 0,
      binary,
    });
  }
  return out;
}

async function commitInfo(repoPath, hash) {
  let out;
  try {
    out = await git(repoPath, ['rev-list', '--parents', '-n', '1', hash, '--']);
  } catch (e) {
    if (e.gitCode === 'ENOENT' || /not a git repository/i.test(e.stderrText || '')) throw e;
    throw userError('That commit was not found in this repository.');
  }
  const parts = String(out).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) throw userError('That commit was not found in this repository.');
  return { hash: parts[0], parents: parts.slice(1) };
}

async function listBranches(repoPath) {
  checkRepo(repoPath);
  const refsOut = await git(repoPath, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes']);

  let current = '';
  try {
    current = String(await git(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
  } catch (e) {
    current = '';
  }

  const local = [];
  const remote = [];
  for (const line of String(refsOut).split(/\r?\n/)) {
    const ref = line.trim();
    if (ref.startsWith('refs/heads/')) {
      const name = ref.slice('refs/heads/'.length);
      if (isSafeRef(name)) local.push(name);
    } else if (ref.startsWith('refs/remotes/')) {
      const name = ref.slice('refs/remotes/'.length);
      if (!name.endsWith('/HEAD') && isSafeRef(name)) remote.push(name);
    }
  }

  if (current && isSafeRef(current) && !local.includes(current)) local.push(current);
  local.sort(byName);
  remote.sort(byName);

  return { current, detached: !current, local, remote };
}

async function listCommits(repoPath, branch, page, pageSize) {
  checkRepo(repoPath);
  checkRef(branch);

  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE));
  const pageNo = Math.max(1, parseInt(page, 10) || 1);
  const format = ['%H', '%P', '%an', '%aI', '%D', '%s'].join('%x1f') + '%x1e';

  let out;
  try {
    out = await git(repoPath, ['log', branch, '--max-count=' + size, '--skip=' + (pageNo - 1) * size, '--format=' + format, '--']);
  } catch (e) {
    if (NO_HISTORY_RE.test(e.stderrText || e.message)) {
      return { branch, commits: [], page: 1, pageSize: size, total: 0, totalPages: 0, empty: true };
    }
    throw e;
  }

  const countOut = await git(repoPath, ['rev-list', '--count', branch, '--']);
  const total = parseInt(String(countOut).trim(), 10) || 0;

  const commits = [];
  for (const record of String(out).split(RECORD)) {
    const clean = record.replace(/^[\r\n]+/, '');
    if (!clean) continue;
    const f = clean.split(FIELD);
    if (f.length < 6) continue;
    const parents = f[1] ? f[1].split(' ').filter(Boolean) : [];
    commits.push({
      hash: f[0],
      shortHash: f[0].slice(0, 7),
      parents,
      isMerge: parents.length > 1,
      author: f[2],
      date: f[3],
      refs: f[4]
        ? f[4]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      message: f.slice(5).join(FIELD),
    });
  }

  return {
    branch,
    commits,
    page: pageNo,
    pageSize: size,
    total,
    totalPages: Math.max(1, Math.ceil(total / size)),
    empty: false,
  };
}

async function listFiles(repoPath, hash) {
  checkRepo(repoPath);
  checkHash(hash);

  const info = await commitInfo(repoPath, hash);
  const base = info.parents.length ? info.parents[0] : EMPTY_TREE;
  const common = ['--no-color', '--no-ext-diff', '--no-renames'];

  const results = await Promise.all([
    git(repoPath, ['diff', ...common, '--name-status', '-z', base, info.hash, '--']),
    git(repoPath, ['diff', ...common, '--numstat', '-z', base, info.hash, '--']),
  ]);

  const stats = new Map(parseNumstat(results[1]).map((s) => [s.file, s]));
  const entries = parseNameStatus(results[0]).map((e) => {
    const s = stats.get(e.file);
    return {
      file: e.file,
      status: e.status,
      additions: s ? s.additions : 0,
      deletions: s ? s.deletions : 0,
      binary: s ? s.binary : false,
    };
  });
  entries.sort((a, b) => a.file.localeCompare(b.file));

  return {
    hash: info.hash,
    parent: info.parents.length ? info.parents[0] : null,
    isMerge: info.parents.length > 1,
    files: entries.slice(0, MAX_FILES),
    total: entries.length,
    truncated: entries.length > MAX_FILES,
  };
}

async function readFileAt(repoPath, rev, filePath) {
  checkRepo(repoPath);
  checkHash(rev);
  checkPath(filePath);

  const spec = rev + ':' + filePath;
  let size;
  try {
    size = parseInt(String(await git(repoPath, ['cat-file', '-s', spec])).trim(), 10);
  } catch (e) {
    if (e.gitCode === 'ENOENT' || /not a git repository/i.test(e.stderrText || '')) throw e;
    throw userError('This file does not exist at that commit.', { missing: true });
  }
  if (!(size >= 0)) throw userError('Git could not read the size of this file.');

  if (size > MAX_FILE_BYTES) {
    return { tooLarge: true, binary: false, size };
  }

  let buffer;
  try {
    buffer = await git(repoPath, ['cat-file', 'blob', spec], { buffer: true, maxBuffer: MAX_FILE_BYTES + 4096 });
  } catch (e) {
    if (e.gitCode === 'ENOENT') throw e;
    throw userError('Could not read this path as a file. It may be a folder or a submodule.');
  }

  if (buffer.subarray(0, 8000).includes(0)) {
    return { binary: true, tooLarge: false, size };
  }
  return { binary: false, tooLarge: false, size, content: buffer.toString('utf8') };
}

async function readDiff(repoPath, hash, filePath) {
  checkRepo(repoPath);
  checkHash(hash);
  checkPath(filePath);

  const info = await commitInfo(repoPath, hash);
  const base = info.parents.length ? info.parents[0] : EMPTY_TREE;

  let out;
  try {
    out = await git(
      repoPath,
      ['diff', '--no-color', '--no-ext-diff', '--no-renames', '--unified=3', base, info.hash, '--', filePath],
      { maxBuffer: MAX_DIFF_BYTES }
    );
  } catch (e) {
    if (e.gitCode === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw userError('The diff is too large to show.');
    throw e;
  }
  return { diff: String(out) };
}

function wrap(handler) {
  return async (_event, payload) => {
    try {
      const data = await handler(payload || {});
      return Object.assign({ success: true }, data);
    } catch (err) {
      return fail(err && err.message ? err.message : 'Request failed.', err && err.missing ? { missing: true } : {});
    }
  };
}

function register() {
  if (registered) return;
  let ipcMain;
  try {
    ({ ipcMain } = require('electron'));
  } catch (e) {
    return;
  }
  if (!ipcMain || typeof ipcMain.handle !== 'function') return;
  registered = true;

  ipcMain.handle('git:inspectBranches', wrap(({ repoPath }) => listBranches(repoPath)));
  ipcMain.handle('git:inspectCommits', wrap(({ repoPath, branch, page, pageSize }) => listCommits(repoPath, branch, page, pageSize)));
  ipcMain.handle('git:inspectFiles', wrap(({ repoPath, hash }) => listFiles(repoPath, hash)));
  ipcMain.handle('git:inspectFile', wrap(({ repoPath, hash, filePath }) => readFileAt(repoPath, hash, filePath)));
  ipcMain.handle('git:inspectDiff', wrap(({ repoPath, hash, filePath }) => readDiff(repoPath, hash, filePath)));
}

module.exports = {
  register,
  listBranches,
  listCommits,
  listFiles,
  readFileAt,
  readDiff,
  parseNameStatus,
  parseNumstat,
};