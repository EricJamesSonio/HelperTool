'use strict';

const { LOG_LEVELS, log } = require('../constants');

const LEVEL_PATTERNS = [
  { re: /\b(ERROR|FATAL|CRASH|UNHANDLED)\b/, level: LOG_LEVELS.ERROR },
  { re: /\b(WARN|WARNING|DEPRECATION)\b/i, level: LOG_LEVELS.WARN },
  { re: /\b(DEBUG|TRACE|DIAG)\b/i, level: LOG_LEVELS.DEBUG },
];

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const STACK_FRAME_RE = /^\s+at\s/;

function stripAnsi(text) {
  return text.replace(ANSI_RE, '');
}

function detectLevel(line) {
  for (let i = 0; i < LEVEL_PATTERNS.length; i++) {
    if (LEVEL_PATTERNS[i].re.test(line)) return LEVEL_PATTERNS[i].level;
  }
  return LOG_LEVELS.INFO;
}

function isErrorLike(line) {
  return /error|fail|exception|traceback|cannot find|ERR_/i.test(line) || STACK_FRAME_RE.test(line);
}

function chunkToLines(data) {
  if (typeof data !== 'string') return [];
  return data.split(/\r?\n/);
}

function createLogEvent(line) {
  const cleaned = stripAnsi(line);
  if (!cleaned) return null;

  const level = detectLevel(cleaned);
  const isError = level === LOG_LEVELS.ERROR || isErrorLike(cleaned);

  return {
    timestamp: Date.now(),
    type: isError ? 'error' : 'log',
    level: level,
    data: {
      raw: cleaned.slice(0, 2000),
      length: cleaned.length,
      isError: isError,
      isStackFrame: STACK_FRAME_RE.test(cleaned),
    },
  };
}

function processChunk(data, sessionId, pushFn) {
  const lines = chunkToLines(data);
  const events = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    const evt = createLogEvent(lines[i]);
    if (evt) events.push(evt);
  }

  if (events.length > 0) {
    pushFn(sessionId, events);
    log('Captured', events.length, 'events for session', sessionId);
  }

  return events;
}

module.exports = {
  processChunk,
  createLogEvent,
  detectLevel,
  stripAnsi,
  chunkToLines,
};
