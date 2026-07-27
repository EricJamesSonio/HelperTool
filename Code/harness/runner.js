const { spawn } = require('child_process');

function runOpencode(repoPath, prompt) {
  return new Promise((resolve) => {
    const args = ['--no-color', '--no-progress', '-m', prompt];
    let proc;
    try {
      proc = spawn('opencode', args, {
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

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      const duration = Date.now() - start;
      resolve({ output: stdout, error: stderr, exitCode: code ?? -1, duration });
    });

    proc.on('error', (err) => {
      resolve({ output: stdout, error: err.message, exitCode: -1, duration: Date.now() - start });
    });
  });
}

module.exports = { runOpencode };
