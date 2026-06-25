const { ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');

function execAsync(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: opts.timeout || 10000, windowsHide: true, cwd: opts.cwd, ...opts }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
}

async function findGemini() {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'where gemini' : 'which gemini';
  const out = await execAsync(cmd, { timeout: 3000 });
  if (out) {
    const firstLine = out.split('\n')[0].trim();
    return firstLine || 'gemini';
  }
  return 'gemini';
}

function parseSessionList(output) {
  const sessions = [];
  if (!output) return sessions;

  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*\d+\.\s+(.+?)\s+\(([^)]+)\)\s+\[([a-f0-9-]+)\]$/);
    if (!match) continue;

    const relative = match[2].toLowerCase().trim();
    const now = Date.now();
    let timestamp = now;

    if (relative === 'just now') {
      timestamp = now;
    } else {
      const timeMatch = relative.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/);
      if (timeMatch) {
        const num = parseInt(timeMatch[1]);
        const unit = timeMatch[2];
        const units = {
          second: 1000, minute: 60000, hour: 3600000,
          day: 86400000, week: 604800000, month: 2592000000, year: 31536000000,
        };
        timestamp = now - num * (units[unit] || 0);
      }
    }

    sessions.push({
      id: match[3],
      title: match[1].trim() || 'Untitled',
      date: new Date(timestamp).toISOString(),
      messageCount: 0,
    });
  }

  return sessions;
}

function register() {
  ipcMain.handle('gemini:discover', async () => {
    const binaryPath = await findGemini();
    let version = 'unknown';
    const isWin = process.platform === 'win32';
    const out = await execAsync(`"${binaryPath}" --version 2>${isWin ? 'nul' : '/dev/null'}`, { timeout: 3000 });
    if (out) version = out.split('\n')[0].trim();
    return { binaryPath, version, available: out !== null };
  });

  ipcMain.handle('gemini:listConversations', async (_, { repoPath }) => {
    const binaryPath = await findGemini();
    const isWin = process.platform === 'win32';
    const cwd = repoPath && require('fs').existsSync(repoPath) ? repoPath : undefined;
    const out = await execAsync(
      `"${binaryPath}" --list-sessions 2>${isWin ? 'nul' : '/dev/null'}`,
      { timeout: 10000, cwd }
    );
    if (!out) return [];
    return parseSessionList(out);
  });
}

module.exports = { register };
