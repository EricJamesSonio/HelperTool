const { ErrorStorage } = require('./error-storage');
const { ErrorDetector } = require('./error-detector');
const { NotificationService } = require('./notification-service');
const { BrowserCollector } = require('./browser-collector');
const { detectProject } = require('../terminal-session');

class ErrorEngine {
  constructor(getMainWindow) {
    this._storage = new ErrorStorage();
    this._notify = new NotificationService(getMainWindow);
    this._detectors = new Map();
    this._sessionCommands = new Map();
    this._buffers = new Map();
    this._sessionProjects = new Map();
    this._browserCollector = null;
    this._browserDedup = new Map();
    this._sessionBrowserPorts = new Map();
  }

  _initBrowserCollector() {
    if (!this._browserCollector) {
      this._browserCollector = new BrowserCollector({
        onError: (err) => this._onBrowserError(err),
      });
    }
    return this._browserCollector;
  }

  _onBrowserError(browserError) {
    try {
      const { sessionId, level, title, message, stack, url, fingerprint, timestamp } = browserError;
      if (!sessionId) return;

      const now = timestamp || new Date().toISOString();
      const project = this._sessionProjects.get(sessionId) || '';

      let cache = this._browserDedup.get(sessionId);
      if (!cache) {
        cache = new Map();
        this._browserDedup.set(sessionId, cache);
      }

      const existing = cache.get(fingerprint);
      if (existing) {
        existing.occurrences++;
        existing.lastSeen = now;
        this._storage.updateOccurrences(fingerprint, existing.occurrences, now);
        this._storage.insertOccurrence({
          sessionId, fingerprint, level, title, message,
          lineText: `[Browser] [${url}] ${message}`,
          timestamp: now,
        });
        this._notify.notifyTimelineEvent({
          type: level,
          timestamp: now,
          title,
          message: `[Browser] ${message}`,
          level,
          sessionId,
          errorId: null,
        });
        return;
      }

      const errorId = this._storage.insertError({
        sessionId,
        project,
        level,
        source: 'browser',
        title,
        message,
        stack: stack || null,
        fingerprint,
        firstSeen: now,
        lastSeen: now,
      });

      cache.set(fingerprint, { fingerprint, occurrences: 1, firstSeen: now, lastSeen: now });

      this._storage.insertOccurrence({
        sessionId, fingerprint, level, title, message,
        lineText: `[Browser] [${url}] ${message}`,
        timestamp: now,
      });

      this._notify.notifyNewError({
        id: errorId,
        sessionId,
        project,
        timestamp: now,
        level,
        source: 'browser',
        title,
        message,
        occurrences: 1,
        firstSeen: now,
        lastSeen: now,
      }, sessionId);
      this._notify.notifyTimelineEvent({
        type: level,
        timestamp: now,
        title,
        message: `[Browser] ${message}`,
        level,
        sessionId,
        errorId,
      });

      this._storage.incrementSessionLines(sessionId);
    } catch (e) {
      console.error('[ErrorCop] onBrowserError failed:', e);
    }
  }

  createSession({ cwd, shell, command }) {
    try {
      const project = detectProject(cwd);
      const sessionId = this._storage.createSession({ project, cwd, shell, command });

      const detector = new ErrorDetector(this._storage, this._notify, {
        onServerDetected: (info) => {
          this.attachBrowser(sessionId, info.port, info.url);
        },
      });
      detector.startSession(sessionId, project);

      this._detectors.set(sessionId, detector);
      this._sessionCommands.set(sessionId, command);
      this._sessionProjects.set(sessionId, project);
      this._buffers.set(sessionId, []);

      return { sessionId, project };
    } catch (e) {
      console.error('[ErrorCop] createSession failed:', e);
      return { sessionId: null, project: 'Unknown' };
    }
  }

  updateCommand(sessionId, command) {
    try {
      if (command) {
        this._sessionCommands.set(sessionId, command);
        this._storage.updateSessionCommand(sessionId, command);
      }
    } catch (e) {
      console.error('[ErrorCop] updateCommand failed:', e);
    }
  }

  processOutput(sessionId, data) {
    try {
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
    } catch (e) {
      console.error('[ErrorCop] processOutput failed:', e);
    }
  }

  endSession(sessionId, exitCode) {
    try {
      const detector = this._detectors.get(sessionId);
      if (detector) {
        detector.endSession();
        this._detectors.delete(sessionId);
      }
      this._sessionCommands.delete(sessionId);
      this._sessionProjects.delete(sessionId);
      this._buffers.delete(sessionId);
      this._browserDedup.delete(sessionId);

      const ports = this._sessionBrowserPorts.get(sessionId);
      if (ports && this._browserCollector) {
        for (const port of ports) {
          this._browserCollector.detach(port);
        }
        this._sessionBrowserPorts.delete(sessionId);
      }

      this._storage.endSession(sessionId, exitCode);
    } catch (e) {
      console.error('[ErrorCop] endSession failed:', e);
    }
  }

  attachBrowser(sessionId, port, url) {
    try {
      const collector = this._initBrowserCollector();
      const result = collector.attach(port, url, sessionId);
      if (result) {
        let ports = this._sessionBrowserPorts.get(sessionId);
        if (!ports) {
          ports = new Set();
          this._sessionBrowserPorts.set(sessionId, ports);
        }
        ports.add(port);
        this._notify.notifyTimelineEvent({
          type: 'server',
          timestamp: new Date().toISOString(),
          title: 'Browser monitoring started',
          message: url,
          level: 'info',
          sessionId,
        });
      }
      return result;
    } catch (e) {
      console.error('[ErrorCop] attachBrowser failed:', e);
      return null;
    }
  }

  detachBrowser(port) {
    try {
      if (this._browserCollector) {
        this._browserCollector.detach(port);
        for (const [sessionId, ports] of this._sessionBrowserPorts) {
          if (ports.has(port)) {
            ports.delete(port);
            if (ports.size === 0) this._sessionBrowserPorts.delete(sessionId);
            break;
          }
        }
      }
    } catch (e) {
      console.error('[ErrorCop] detachBrowser failed:', e);
    }
  }

  getAttachedBrowsers() {
    return this._browserCollector ? this._browserCollector.getAttached() : {};
  }

  deleteSessions(ids) {
    if (!ids || !ids.length) return;
    for (const id of ids) {
      // Detach browser collectors
      const ports = this._sessionBrowserPorts.get(id);
      if (ports && this._browserCollector) {
        for (const port of ports) {
          this._browserCollector.detach(port);
        }
        this._sessionBrowserPorts.delete(id);
      }
      // Clean up engine state
      const detector = this._detectors.get(id);
      if (detector) {
        detector.endSession();
        this._detectors.delete(id);
      }
      this._sessionCommands.delete(id);
      this._sessionProjects.delete(id);
      this._buffers.delete(id);
      this._browserDedup.delete(id);
      // Delete from storage (cascade deletes errors, occurrences)
      this._storage.deleteSession(id);
    }
  }

  getStorage() {
    return this._storage;
  }

  getNotify() {
    return this._notify;
  }
}

module.exports = { ErrorEngine };
