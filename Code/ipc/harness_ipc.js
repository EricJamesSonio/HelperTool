const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const { runHarness } = require('../harness/loop');

function _execOpencodeVersion() {
  return new Promise((resolve) => {
    const proc = spawn('opencode', ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });
    let out = '';
    proc.stdout.on('data', (chunk) => { out += chunk.toString(); });
    const timer = setTimeout(() => {
      try { proc.kill(); } catch (_) {}
      resolve(null);
    }, 3000);
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out.trim() : null);
    });
    proc.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

function register({ getMainWindow }) {
  ipcMain.handle('harness:checkStatus', async () => {
    const version = await _execOpencodeVersion();
    return {
      found: version !== null && version !== '',
      binaryPath: 'opencode',
      version: version || 'unknown',
    };
  });

  ipcMain.handle('harness:run', async (event, config) => {
    const win = getMainWindow();

    const send = (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('harness:event', data);
      }
    };

    try {
      await runHarness(config, send);
    } catch (err) {
      send({ type: 'log', attempt: 0, message: `[Error] ${err.message}` });
      send({ type: 'final', success: false, attempts: 0, output: '', error: err.message });
    }
  });

  ipcMain.handle('harness:prewarm', async () => {
    const proc = spawn('opencode', ['run'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });
    proc.stdin.write('hello');
    proc.stdin.end();
    proc.unref();
    return { started: true };
  });

  ipcMain.handle('harness:prewarmStop', async () => {});

  ipcMain.handle('harness:stop', async () => {});
}

module.exports = { register };
