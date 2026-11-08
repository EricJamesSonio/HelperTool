const simpleGitFactory = require('simple-git');
const gitAccountsAuth = require('./gitAccounts_ipc.js');

const simpleGit = (repoPath, ...rest) => gitAccountsAuth.authedGit(simpleGitFactory, repoPath, ...rest);

async function getUpstream(git, branch) {
  try {
    const out = await git.raw(['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]);
    return out.trim() || null;
  } catch (_) {
    return null;
  }
}

async function getRemote(git, branch) {
  try {
    const out = await git.raw(['config', '--get', `branch.${branch}.remote`]);
    return out.trim() || 'origin';
  } catch (_) {
    return 'origin';
  }
}

async function countAheadBehind(git, branch, upstream) {
  const out = await git.raw(['rev-list', '--left-right', '--count', `${branch}...${upstream}`]);
  const parts = out.trim().split(/\s+/).map((n) => parseInt(n, 10) || 0);
  return { ahead: parts[0] || 0, behind: parts[1] || 0 };
}

async function syncWithUpstream(git, branch) {
  const upstream = await getUpstream(git, branch);
  if (!upstream) return { upstream: null, fetchError: null, diverged: false, fastForwarded: 0 };

  const remote = await getRemote(git, branch);
  let fetchError = null;
  try {
    await git.fetch(remote, ['--prune']);
  } catch (err) {
    fetchError = err.message;
  }

  const { ahead, behind } = await countAheadBehind(git, branch, upstream);
  if (behind > 0 && ahead > 0) {
    return { upstream, fetchError, diverged: true, ahead, behind, fastForwarded: 0 };
  }
  if (behind > 0) {
    await git.merge([upstream, '--ff-only']);
    return { upstream, fetchError, diverged: false, fastForwarded: behind };
  }
  return { upstream, fetchError, diverged: false, fastForwarded: 0 };
}

async function pushIfNeeded(git, branch) {
  const upstream = await getUpstream(git, branch);
  if (!upstream) {
    return { pushed: false, pushError: null, pushSkipped: 'no-upstream' };
  }
  const { ahead } = await countAheadBehind(git, branch, upstream);
  if (ahead === 0) {
    return { pushed: false, pushError: null, pushSkipped: 'nothing-to-push' };
  }
  const remote = await getRemote(git, branch);
  try {
    await git.push(remote, branch);
    return { pushed: true, pushError: null, pushSkipped: null };
  } catch (err) {
    return { pushed: false, pushError: err.message, pushSkipped: null };
  }
}

function extractConflictFiles(err) {
  const fromGit = err && err.git && Array.isArray(err.git.conflicts)
    ? err.git.conflicts.map((c) => c && c.file).filter(Boolean)
    : [];
  if (fromGit.length) return fromGit;

  const msg = (err && err.message) || '';
  const fromText = msg
    .split('\n')
    .filter((l) => l.includes('CONFLICT'))
    .map((l) => {
      const m = l.match(/CONFLICT\s+\([^)]+\):\s+(\S+)/);
      return m ? m[1] : '';
    })
    .filter(Boolean);
  return fromText.length ? fromText : ['(unknown)'];
}

async function mergeBranch(repoPath, from, into) {
  const git = simpleGit(repoPath);
  try {
    await git.checkout(into);

    let sync;
    try {
      sync = await syncWithUpstream(git, into);
    } catch (syncErr) {
      return {
        success: false,
        error: `Could not update "${into}" from its remote before merging: ${syncErr.message}`,
      };
    }
    if (sync.diverged) {
      return {
        success: false,
        error: `Local "${into}" has diverged from ${sync.upstream} (ahead ${sync.ahead}, behind ${sync.behind}). Pull and resolve that first, then merge again.`,
      };
    }

    console.debug('[git:mergeBranch] merging', from, 'into', into, 'at', repoPath);
    const before = await git.revparse(['HEAD']);
    const result = await git.merge([from, '--no-ff', '--no-edit']);
    const after = await git.revparse(['HEAD']);
    const isUpToDate = before === after;
    console.debug('[git:mergeBranch] result:', result);

    const files = (result.files || []).map((f) => ({
      file: f,
      insertions: (result.insertions && result.insertions[f]) || 0,
      deletions: (result.deletions && result.deletions[f]) || 0,
    }));

    const push = await pushIfNeeded(git, into);
    if (push.pushError) {
      console.debug('[git:mergeBranch] push failed:', push.pushError);
    }

    return {
      success: true,
      isUpToDate,
      result: result.result || 'Merge successful',
      files,
      summary: result.summary || { changes: 0, insertions: 0, deletions: 0 },
      pushed: push.pushed,
      pushError: push.pushError,
      pushSkipped: push.pushSkipped,
      syncedFromUpstream: sync.fastForwarded,
      fetchError: sync.fetchError,
    };
  } catch (err) {
    const msg = err.message || '';
    console.debug('[git:mergeBranch] error:', msg);
    const hasConflicts = (err.git && Array.isArray(err.git.conflicts) && err.git.conflicts.length > 0)
      || msg.includes('CONFLICT')
      || msg.includes('conflict');
    if (hasConflicts) {
      return { success: false, conflict: true, files: extractConflictFiles(err) };
    }
    return { success: false, error: msg };
  }
}

module.exports = { mergeBranch };