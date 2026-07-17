const { parseLine } = require('./error-parser');
const { Deduplicator } = require('./deduplicator');
const { ErrorStorage } = require('./error-storage');
const { BrowserDiscovery } = require('./browser-discovery');

const PRE_FILTER = /error|warn|fail|exception|deprecat|experimental|unhandled|reject|cannot find|module not found|failed to compile|build failed|command failed|ERR_|ECONNREFUSED|EADDRINUSE|ENOTFOUND|ECONNRESET|ETIMEDOUT|EACCES|EPERM|EISDIR|ENOENT|CORS|Failed to fetch|FetchError|NetworkError|TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError|InternalError|at\s|CRASH/i;

const ERROR_BLOCK_FLUSH_MS = 120;
const MAX_BLOCK_LINES = 80;

class ErrorDetector {
  constructor(storage, notificationService, options = {}) {
    this._storage = storage;
    this._notify = notificationService;
    this._dedup = new Deduplicator();
    this._browserDiscovery = new BrowserDiscovery();
    this._outputAccumulator = [];
    this._sessionId = null;
    this._project = '';
    this._onServerDetected = options.onServerDetected || null;
    this._errorBlock = null;
  }

  startSession(sessionId, project) {
    this._sessionId = sessionId;
    this._project = project || '';
    this._dedup.clear();
    this._browserDiscovery.reset();
    this._outputAccumulator = [];
    this._errorBlock = null;
  }

  endSession() {
    this._flushErrorBlock();
    this._sessionId = null;
    this._dedup.clear();
    this._errorBlock = null;
  }

  _stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  _startNewBlock(parsed, rawLine, timestamp) {
    this._errorBlock = {
      lines: [{ raw: rawLine, parsed }],
      firstParsed: parsed,
      level: parsed.level,
      startTime: timestamp,
      timer: null,
    };
  }

  _appendToBlock(rawLine, parsed) {
    if (!this._errorBlock) return;
    this._errorBlock.lines.push({ raw: rawLine, parsed });
    if (this._errorBlock.lines.length > MAX_BLOCK_LINES) {
      this._flushErrorBlock();
    }
  }

  _scheduleBlockFlush() {
    if (!this._errorBlock) return;
    if (this._errorBlock.timer) clearTimeout(this._errorBlock.timer);
    this._errorBlock.timer = setTimeout(() => {
      this._flushErrorBlock();
    }, ERROR_BLOCK_FLUSH_MS);
  }

  _emitErrorBlock(title, fullText, level, startTime) {
    const now = new Date().toISOString();

    this._storage.insertOccurrence({
      sessionId: this._sessionId,
      fingerprint: '',
      level,
      title,
      message: fullText,
      lineText: fullText,
      timestamp: startTime,
    });

    const dedup = this._dedup.process(title, fullText);

    if (dedup.isNew) {
      const errorId = this._storage.insertError({
        sessionId: this._sessionId,
        project: this._project,
        level,
        source: 'terminal',
        title,
        message: fullText,
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
        message: fullText,
        occurrences: 1,
        firstSeen: dedup.firstSeen,
        lastSeen: dedup.lastSeen,
      };

      this._notify.notifyNewError(error, this._sessionId);
      this._notify.notifyTimelineEvent({
        type: level,
        timestamp: dedup.firstSeen,
        title,
        message: fullText.length > 200 ? fullText.slice(0, 200) + '...' : fullText,
        level,
        sessionId: this._sessionId,
        errorId,
      });

      return error;
    }

    this._storage.updateOccurrences(dedup.fingerprint, dedup.occurrences, dedup.lastSeen);

    this._notify.notifyNewError({
      id: null,
      sessionId: this._sessionId,
      project: this._project,
      timestamp: dedup.lastSeen,
      level,
      source: 'terminal',
      title,
      message: fullText,
      occurrences: dedup.occurrences,
      firstSeen: dedup.firstSeen,
      lastSeen: dedup.lastSeen,
    }, this._sessionId);

    return {
      id: null,
      sessionId: this._sessionId,
      project: this._project,
      timestamp: dedup.lastSeen,
      level,
      title,
      message: fullText,
      occurrences: dedup.occurrences,
      deduplicated: true,
    };
  }

  _flushErrorBlock() {
    if (!this._errorBlock || this._errorBlock.lines.length === 0) return;
    if (this._errorBlock.timer) clearTimeout(this._errorBlock.timer);

    const block = this._errorBlock;
    this._errorBlock = null;

    const first = block.firstParsed;
    const fullText = block.lines.map(l => l.raw).join('\n');
    const title = first.parsed.title || first.parsed.raw.slice(0, 120);

    this._emitErrorBlock(title, fullText, block.level, block.startTime);
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
      if (this._onServerDetected) {
        try { this._onServerDetected(browserInfo); } catch (e) {
          console.error('[ErrorCop] onServerDetected callback failed:', e);
        }
      }
    }

    const stripped = this._stripAnsi(line).trim();
    const passesPreFilter = stripped && PRE_FILTER.test(stripped);
    const parsed = passesPreFilter ? parseLine(line) : null;
    const now = new Date().toISOString();

    if (parsed) {
      if (!this._errorBlock) {
        this._startNewBlock(parsed, stripped || line, now);
      } else {
        this._appendToBlock(stripped || line, parsed);
      }
      this._scheduleBlockFlush();
      return null;
    }

    if (passesPreFilter && this._errorBlock) {
      this._appendToBlock(stripped || line, null);
      this._scheduleBlockFlush();
      return null;
    }

    if (this._errorBlock) {
      this._flushErrorBlock();
    }

    return null;
  }
}

module.exports = { ErrorDetector };
