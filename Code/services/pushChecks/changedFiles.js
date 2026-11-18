'use strict';

const { execFile } = require('child_process');
const { parseNameStatus } = require('../ci/ciChanges');
const { scopeFiles } = require('../ci/ciSmart');

const REF_OK = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function git(cwd, args) {
  return new Promise((resolve) => {
    const options = {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      env: Object.assign({}, process.env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }),
    };
    execFile('git', args, options, (err, stdout) => resolve(err ? null : String(stdout)));
  });
}

async function commitOf(cwd, ref) {
  const out = await git(cwd, ['rev-parse', '--verify', '--quiet', ref + '^{commit}']);
  return out && out.trim() ? out.trim() : null;
}

/**
 * Files changed by the commits that are about to be pushed, relative to repoPath.
 * Returns null when git cannot answer. Call it BEFORE the push.
 */
async function unpushed(repoPath) {
  const topOut = await git(repoPath, ['rev-parse', '--show-toplevel']);
  if (!topOut || !topOut.trim()) return null;
  const top = topOut.trim();
  const head = await commitOf(top, 'HEAD');
  if (!head) return [];

  const branchOut = await git(top, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const branch = branchOut ? branchOut.trim() : '';

  let base = null;
  const tracked = ['@{u}', branch && REF_OK.test(branch) ? 'origin/' + branch : null];
  for (const ref of tracked) {
    if (!ref) continue;
    const sha = await commitOf(top, ref);
    if (!sha) continue;
    if (sha === head) return [];
    base = sha;
    break;
  }

  if (!base) {
    const defaults = [];
    const remoteHead = await git(top, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    if (remoteHead && remoteHead.trim()) defaults.push(remoteHead.trim());
    defaults.push('origin/main', 'origin/master', 'main', 'master');
    for (const ref of defaults) {
      if (!REF_OK.test(ref) || ref === branch) continue;
      const sha = await commitOf(top, ref);
      if (sha && sha !== head) {
        base = sha;
        break;
      }
    }
  }

  let out;
  if (base) {
    const mb = await git(top, ['merge-base', head, base]);
    const from = mb && mb.trim() ? mb.trim() : base;
    out = await git(top, ['diff', '--name-status', '-z', '--no-renames', from, head]);
  } else {
    out = await git(top, ['diff-tree', '--no-commit-id', '--root', '-r', '--name-status', '-z', '--no-renames', head]);
  }
  if (out === null) return null;

  const list = Array.from(new Set(parseNameStatus(out).map((entry) => entry.file))).slice(0, 5000);
  return scopeFiles(list, top, repoPath);
}

module.exports = { unpushed };