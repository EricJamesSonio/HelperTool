const { spawn } = require('child_process');

function runTest(repoPath, command) {
  return new Promise((resolve) => {
    if (!command) {
      resolve({ pass: true, output: '', error: '' });
      return;
    }
    let proc;
    try {
      proc = spawn(command, [], {
        cwd: repoPath,
        env: { ...process.env },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });
    } catch (err) {
      resolve({ pass: false, output: '', error: err.message });
      return;
    }

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      resolve({ pass: code === 0, output: stdout, error: stderr });
    });

    proc.on('error', (err) => {
      resolve({ pass: false, output: stdout, error: err.message });
    });
  });
}

module.exports = { runTest };
