const os = require('os');
const fs = require('fs');
const pty = require('node-pty');
const { BrowserDiscovery } = require('./browser-discovery');

class CommandRunner {
  constructor(errorEngine, urlTracker) {
    this._errorEngine = errorEngine;
    this._urlTracker = urlTracker;
    this._processes = new Map();
    this._nextId = 1;
  }

  run({ command, cwd, shell } = {}) {
    if (!command) throw new Error('command is required');

    const resolvedCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
    const shellCmd = shell || this._defaultShell();
    const id = this._nextId++;
    const discovery = new BrowserDiscovery();
    const outputBuffer = [];
    let sessionId = null;

    if (this._errorEngine) {
      try {
        const session = this._errorEngine.createSession({
          cwd: resolvedCwd,
          shell: shellCmd,
          command,
          label: `ai-run: ${command.slice(0, 60)}`,
        });
        sessionId = session.sessionId;
      } catch (e) {
        console.error('[CommandRunner] createSession failed:', e);
      }
    }

    const p = pty.spawn(shellCmd, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: resolvedCwd,
      env: Object.assign({}, process.env),
    });

    const entry = {
      id,
      sessionId,
      pty: p,
      command,
      cwd: resolvedCwd,
      shell: shellCmd,
      outputBuffer,
      startedAt: new Date().toISOString(),
      status: 'running',
      exitCode: null,
      detectedUrls: [],
    };

    this._processes.set(id, entry);

    p.onData((data) => {
      outputBuffer.push(data);
      if (outputBuffer.length > 1000) {
        outputBuffer.splice(0, 100);
      }

      if (this._errorEngine && sessionId) {
        try {
          this._errorEngine.processOutput(sessionId, data);
        } catch (e) {
          console.error('[CommandRunner] processOutput failed:', e);
        }
      }

      const lines = data.split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        try {
          const info = discovery.scanLine(line, sessionId, outputBuffer);
          if (info && this._urlTracker) {
            this._urlTracker.register({
              port: info.port,
              url: info.url,
              framework: info.framework,
              sessionId,
              source: 'command-runner',
            });
            if (!entry.detectedUrls.find(u => u.port === info.port)) {
              entry.detectedUrls.push(info);
            }
          }
        } catch (e) {
          console.error('[CommandRunner] scanLine failed:', e);
        }
      }
    });

    p.onExit(({ exitCode, signal }) => {
      entry.status = exitCode === 0 ? 'ended' : 'failed';
      entry.exitCode = exitCode;

      if (this._errorEngine && sessionId) {
        try {
          this._errorEngine.endSession(sessionId, exitCode);
        } catch (e) {
          console.error('[CommandRunner] endSession failed:', e);
        }
      }
    });

    p.write(`${command}\n`);

    return { id, sessionId, command, cwd: resolvedCwd };
  }

  stop(id) {
    const entry = this._processes.get(id);
    if (!entry) return false;
    try { entry.pty.kill(); } catch {}
    entry.status = 'killed';
    if (this._errorEngine && entry.sessionId) {
      try {
        this._errorEngine.endSession(entry.sessionId, 0, 'killed');
      } catch (e) {
        console.error('[CommandRunner] endSession failed:', e);
      }
    }
    this._processes.delete(id);
    return true;
  }

  stopBySessionId(sessionId) {
    for (const [id, entry] of this._processes) {
      if (entry.sessionId === sessionId) {
        return this.stop(id);
      }
    }
    return false;
  }

  list() {
    const result = [];
    for (const [id, entry] of this._processes) {
      result.push({
        id,
        sessionId: entry.sessionId,
        command: entry.command,
        cwd: entry.cwd,
        status: entry.status,
        exitCode: entry.exitCode,
        startedAt: entry.startedAt,
        detectedUrls: entry.detectedUrls,
        outputLength: entry.outputBuffer.reduce((acc, s) => acc + s.length, 0),
      });
    }
    return result;
  }

  getStatus(id) {
    const entry = this._processes.get(id);
    if (!entry) return null;
    return {
      id,
      sessionId: entry.sessionId,
      command: entry.command,
      cwd: entry.cwd,
      status: entry.status,
      exitCode: entry.exitCode,
      startedAt: entry.startedAt,
      detectedUrls: entry.detectedUrls,
      outputLength: entry.outputBuffer.reduce((acc, s) => acc + s.length, 0),
    };
  }

  getOutput(id, { tail = 100 } = {}) {
    const entry = this._processes.get(id);
    if (!entry) return '';
    const text = entry.outputBuffer.join('');
    if (tail <= 0) return text;
    const lines = text.split('\n');
    return lines.slice(-tail).join('\n');
  }

  _defaultShell() {
    if (process.platform === 'win32') return 'powershell.exe';
    return process.env.SHELL || 'bash';
  }
}

module.exports = { CommandRunner };
