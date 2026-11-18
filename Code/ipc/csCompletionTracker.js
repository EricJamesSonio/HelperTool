'use strict';

const DEFAULT_IDLE_MS = 3000;
const DEFAULT_MIN_OUTPUT_CHARS = 40;
const DEFAULT_MIN_ELAPSED_MS = 1500;
const TAIL_LIMIT = 800;

const ANSI_RE = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

const DEFAULT_WAITING_PATTERNS = [
  /(?:\(y\/n\)|\[y\/n\])\s*[:>]?\s*$/i,
  /continue\?\s*(?:\(y\/n\)|\[y\/n\])?\s*$/i,
  /press\s+enter\s+to\s+(?:continue|approve|confirm)/i,
  /waiting\s+for\s+(?:your\s+)?(?:input|approval|permission)/i,
];

function stripAnsi(text) {
  return String(text || '').replace(ANSI_RE, '');
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

class CompletionTracker {
  constructor(opts = {}) {
    this.idleMs = positiveNumber(opts.idleMs, DEFAULT_IDLE_MS);
    this.minOutputChars = positiveNumber(opts.minOutputChars, DEFAULT_MIN_OUTPUT_CHARS);
    this.minElapsedMs = positiveNumber(opts.minElapsedMs, DEFAULT_MIN_ELAPSED_MS);
    this.waitingPatterns = DEFAULT_WAITING_PATTERNS.concat(
      Array.isArray(opts.waitingPatterns) ? opts.waitingPatterns : []
    );
    this._onDone = typeof opts.onDone === 'function' ? opts.onDone : null;
    this._now = typeof opts.now === 'function' ? opts.now : Date.now;
    this._setTimer = typeof opts.setTimer === 'function' ? opts.setTimer : setTimeout;
    this._clearTimer = typeof opts.clearTimer === 'function' ? opts.clearTimer : clearTimeout;

    this._busy = false;
    this._disposed = false;
    this._timer = null;
    this._submittedAt = 0;
    this._lastDataAt = 0;
    this._outputChars = 0;
    this._tail = '';
  }

  get busy() {
    return this._busy;
  }

  submit() {
    if (this._disposed) return false;
    if (this._busy) {
      this._lastDataAt = this._now();
      this._arm();
      return false;
    }
    const now = this._now();
    this._busy = true;
    this._submittedAt = now;
    this._lastDataAt = now;
    this._outputChars = 0;
    this._tail = '';
    this._arm();
    return true;
  }

  data(chunk) {
    if (this._disposed || !this._busy) return;
    const text = stripAnsi(chunk);
    if (!text) return;
    this._outputChars += text.replace(/\s/g, '').length;
    this._tail = (this._tail + text).slice(-TAIL_LIMIT);
    this._lastDataAt = this._now();
    this._arm();
  }

  cancel() {
    this._clearTimerNow();
    this._busy = false;
    this._outputChars = 0;
    this._tail = '';
  }

  dispose() {
    this._disposed = true;
    this.cancel();
    this._onDone = null;
  }

  _arm() {
    this._clearTimerNow();
    if (this._disposed || !this._busy) return;
    this._timer = this._setTimer(() => this._check(), this.idleMs);
  }

  _clearTimerNow() {
    if (this._timer === null) return;
    try {
      this._clearTimer(this._timer);
    } catch (_) {}
    this._timer = null;
  }

  _check() {
    this._timer = null;
    if (this._disposed || !this._busy) return;

    const now = this._now();
    if (now - this._lastDataAt < this.idleMs) {
      this._arm();
      return;
    }

    if (this._outputChars === 0) {
      this._arm();
      return;
    }

    if (this._outputChars < this.minOutputChars && now - this._submittedAt < this.minElapsedMs) {
      this._arm();
      return;
    }

    if (this._looksWaiting()) {
      this._arm();
      return;
    }

    const payload = {
      outputChars: this._outputChars,
      elapsedMs: now - this._submittedAt,
    };

    this._busy = false;
    this._outputChars = 0;
    this._tail = '';

    if (this._onDone) {
      try {
        this._onDone(payload);
      } catch (_) {}
    }
  }

  _looksWaiting() {
    if (!this.waitingPatterns.length) return false;
    const tail = this._tail.trimEnd();
    if (!tail) return false;
    return this.waitingPatterns.some((re) => re.test(tail));
  }
}

module.exports = {
  CompletionTracker,
  stripAnsi,
  DEFAULT_IDLE_MS,
  DEFAULT_MIN_OUTPUT_CHARS,
  DEFAULT_MIN_ELAPSED_MS,
};
