const { spawn } = require('child_process');

function _stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
}

function runOpencode(repoPath, prompt, binaryPath = 'opencode', timeoutMs = 60000) {
  return new Promise((resolve) => {
    const args = ['run'];

    let proc;
    try {
      proc = spawn(binaryPath, args, {
        cwd: repoPath,
        env: { ...process.env },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });
    } catch (err) {
      resolve({ output: '', error: err.message, exitCode: -1, duration: 0 });
      return;
    }

    const start = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill(); } catch (_) {}
      resolve({
        output: _stripAnsi(stdout),
        error: `Timed out after ${timeoutMs}ms waiting for opencode`,
        exitCode: -1,
        duration: Date.now() - start,
      });
    }, timeoutMs);

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const duration = Date.now() - start;
      resolve({ output: _stripAnsi(stdout), error: _stripAnsi(stderr), exitCode: code ?? -1, duration });
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ output: stdout, error: err.message, exitCode: -1, duration: Date.now() - start });
    });

    proc.stdin.on('error', () => {});
  });
}

module.exports = { runOpencode };