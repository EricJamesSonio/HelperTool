const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

module.exports = async function handle({ repoPath, activationDate }) {
  const today = new Date().toISOString().slice(0, 10);

  let log = '';
  try {
    const { stdout } = await execFileAsync('git', [
      'log', '--format=>>>%H|%ad', '--date=short', '--no-merges', '--name-only',
      '--after=' + activationDate + 'T00:00:00',
      '--before=' + today + 'T23:59:59',
    ], { cwd: repoPath, maxBuffer: 50 * 1024 * 1024 });
    log = stdout;
  } catch (_) {
    return { dates: [] };
  }

  if (!log.trim()) return { dates: [] };

  const dateCounts = {};
  const dateFiles = {};
  let currentDate = null;

  for (const line of log.split('\n')) {
    if (line.startsWith('>>>')) {
      const pipeIdx = line.indexOf('|');
      currentDate = pipeIdx >= 0 ? line.substring(pipeIdx + 1).trim() : null;
      if (currentDate && currentDate >= activationDate) {
        dateCounts[currentDate] = (dateCounts[currentDate] || 0) + 1;
        if (!dateFiles[currentDate]) dateFiles[currentDate] = new Set();
      } else {
        currentDate = null;
      }
    } else if (currentDate && line.trim()) {
      dateFiles[currentDate].add(line.trim());
    }
  }

  return {
    dates: Object.entries(dateCounts).map(([date, count]) => ({
      date,
      commits: count,
      files: dateFiles[date]?.size || 0,
    })),
  };
};
