const { parseLine } = require('./error-parser');
const { Deduplicator } = require('./deduplicator');
const { ErrorStorage } = require('./error-storage');
const { BrowserDiscovery } = require('./browser-discovery');

class ErrorDetector {
  constructor(storage, notificationService) {
    this._storage = storage;
    this._notify = notificationService;
    this._dedup = new Deduplicator();
    this._browserDiscovery = new BrowserDiscovery();
    this._outputAccumulator = [];
    this._sessionId = null;
    this._project = '';
  }

  startSession(sessionId, project) {
    this._sessionId = sessionId;
    this._project = project || '';
    this._dedup.clear();
    this._browserDiscovery.reset();
    this._outputAccumulator = [];
  }

  endSession() {
    this._sessionId = null;
    this._dedup.clear();
  }

  processLine(line) {
    if (!this._sessionId) return null;
    this._outputAccumulator.push(line);
    if (this._outputAccumulator.length > 10000) {
      this._outputAccumulator.splice(0, 1000);
    }

    this._storage.incrementSessionLines(this._sessionId);

    const browserInfo = this._browserDiscovery.scanLine(line, this._sessionId, this._outputAccumulator);
    if (browserInfo) {
      this._storage.insertBrowserServer({
        sessionId: this._sessionId,
        ...browserInfo,
      });
      this._notify.notifyTimelineEvent({
        type: 'server',
        timestamp: new Date().toISOString(),
        title: `${browserInfo.framework} server started`,
        message: browserInfo.url,
        level: 'info',
        sessionId: this._sessionId,
      });
    }

    const parsed = parseLine(line);
    if (!parsed) return null;

    const { level, title, message } = parsed;
    const dedup = this._dedup.process(title, message);

    if (dedup.isNew) {
      const errorId = this._storage.insertError({
        sessionId: this._sessionId,
        project: this._project,
        level,
        source: 'terminal',
        title,
        message,
        stack: null,
        fingerprint: dedup.fingerprint,
        firstSeen: dedup.firstSeen,
        lastSeen: dedup.lastSeen,
      });

      const error = {
        id: errorId,
        sessionId: this._sessionId,
        project: this._project,
        timestamp: dedup.firstSeen,
        level,
        source: 'terminal',
        title,
        message,
        occurrences: 1,
        firstSeen: dedup.firstSeen,
        lastSeen: dedup.lastSeen,
      };

      this._notify.notifyNewError(error, this._sessionId);
      this._notify.notifyTimelineEvent({
        type: level,
        timestamp: dedup.firstSeen,
        title,
        message,
        level,
        sessionId: this._sessionId,
        errorId,
      });

      return error;
    }

    this._storage.updateOccurrences(dedup.fingerprint, dedup.occurrences, dedup.lastSeen);

    return {
      id: null,
      sessionId: this._sessionId,
      project: this._project,
      timestamp: dedup.lastSeen,
      level,
      title,
      message,
      occurrences: dedup.occurrences,
      deduplicated: true,
    };
  }
}

module.exports = { ErrorDetector };
