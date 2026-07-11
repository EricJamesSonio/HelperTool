const { ErrorStorage } = require('./error-storage');
const { ErrorDetector } = require('./error-detector');
const { NotificationService } = require('./notification-service');
const { detectProject } = require('../terminal-session');

class ErrorEngine {
  constructor(getMainWindow) {
    this._storage = new ErrorStorage();
    this._notify = new NotificationService(getMainWindow);
    this._detectors = new Map();
    this._sessionCommands = new Map();
    this._buffers = new Map();
  }

  createSession({ cwd, shell, command }) {
    const project = detectProject(cwd);
    const sessionId = this._storage.createSession({ project, cwd, shell, command });

    const detector = new ErrorDetector(this._storage, this._notify);
    detector.startSession(sessionId, project);

    this._detectors.set(sessionId, detector);
    this._sessionCommands.set(sessionId, command);
    this._buffers.set(sessionId, []);

    return { sessionId, project };
  }

  updateCommand(sessionId, command) {
    if (command) {
      this._sessionCommands.set(sessionId, command);
      this._storage.updateSessionCommand(sessionId, command);
    }
  }

  processOutput(sessionId, data) {
    const detector = this._detectors.get(sessionId);
    if (!detector) return;

    let buffer = this._buffers.get(sessionId) || [];
    buffer.push(data);
    this._buffers.set(sessionId, buffer);
    if (buffer.length > 200) {
      this._buffers.set(sessionId, buffer.slice(-100));
    }

    const lines = data.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line) {
        detector.processLine(line);
      }
    }
  }

  endSession(sessionId, exitCode) {
    const detector = this._detectors.get(sessionId);
    if (detector) {
      detector.endSession();
      this._detectors.delete(sessionId);
    }
    this._sessionCommands.delete(sessionId);
    this._buffers.delete(sessionId);
    this._storage.endSession(sessionId, exitCode);
  }

  getStorage() {
    return this._storage;
  }

  getNotify() {
    return this._notify;
  }
}

module.exports = { ErrorEngine };
