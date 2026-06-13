const { execFile } = require('child_process');

function execGit(repoPath, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

async function getBranches(repoPath) {
  const stdout = await execGit(repoPath, ['branch', '-vv', '--all']);
  const lines = stdout.split('\n').filter(l => l.trim());

  const local = [];
  const remote = [];
  let current = '';

  for (const line of lines) {
    const isCurrent = line.startsWith('* ');
    const raw = isCurrent ? line.slice(2).trim() : line.trim();
    if (!raw) continue;

    const isRemote = raw.startsWith('remotes/');

    if (isRemote) {
      const displayName = raw.replace('remotes/', '');
      const remoteName = displayName.split('/')[0];
      if (!remote.some(r => r.name === displayName)) {
        remote.push({ name: displayName, remote: remoteName });
      }
      continue;
    }

    const aheadMatch = raw.match(/\[ahead\s+(\d+)\](?:,\s*behind\s+(\d+))?/);
    const behindMatch = raw.match(/\[behind\s+(\d+)\](?:,\s*ahead\s+(\d+))?/);
    const ahead = aheadMatch ? parseInt(aheadMatch[1]) : behindMatch ? parseInt(behindMatch[2] || 0) : 0;
    const behind = behindMatch ? parseInt(behindMatch[1]) : aheadMatch ? parseInt(aheadMatch[2] || 0) : 0;

    const afterBracket = raw.replace(/\[.*?\]/, '').trim();
    const parts = afterBracket.split(/\s+/);
    const name = parts[0];
    const lastCommit = parts.length > 1 ? parts[1].substring(0, 7) : '';
    const message = parts.slice(2).join(' ') || '';

    if (isCurrent) current = name;
    local.push({ name, ahead, behind, lastCommit, message });
  }

  const localNames = local.map(b => b.name);
  const defaultBranch = localNames.includes('main') ? 'main'
    : localNames.includes('master') ? 'master'
    : null;

  if (defaultBranch) {
    const vsResults = await Promise.all(local.map(async (b) => {
      if (b.name === defaultBranch) return { name: b.name, vsDefaultAhead: 0, vsDefaultBehind: 0 };
      try {
        const [a, be] = await Promise.all([
          execGit(repoPath, ['rev-list', '--count', `${defaultBranch}..${b.name}`]),
          execGit(repoPath, ['rev-list', '--count', `${b.name}..${defaultBranch}`])
        ]);
        return { name: b.name, vsDefaultAhead: parseInt(a.trim()) || 0, vsDefaultBehind: parseInt(be.trim()) || 0 };
      } catch {
        return { name: b.name, vsDefaultAhead: 0, vsDefaultBehind: 0 };
      }
    }));
    for (const r of vsResults) {
      const b = local.find(l => l.name === r.name);
      if (b) { b.vsDefaultAhead = r.vsDefaultAhead; b.vsDefaultBehind = r.vsDefaultBehind; }
    }
  }

  return { success: true, current, local, remote, defaultBranch };
}

module.exports = async function handle(payload) {
  const { repoPath } = payload || {};
  if (!repoPath) throw new Error('repoPath is required for gitBranches task');
  return await getBranches(repoPath);
};
