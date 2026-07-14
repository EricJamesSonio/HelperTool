// Fast pre-filter: skip 39-pattern parse for lines with no error-like content
const PRE_FILTER = /error|warn|fail|exception|deprecat|experimental|unhandled|reject|cannot find|module not found|failed to compile|build failed|command failed|ERR_|ECONNREFUSED|EADDRINUSE|ENOTFOUND|ECONNRESET|ETIMEDOUT|EACCES|EPERM|EISDIR|ENOENT|CORS|Failed to fetch|FetchError|NetworkError|TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError|InternalError|at\s|CRASH/i;

const RULES = [
  // ── Error types ──
  { pattern: /\b(TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError|InternalError)\b/, level: 'error', title: null },
  { pattern: /\b(UnhandledPromiseRejection)\b/, level: 'error', title: 'Unhandled Promise Rejection' },
  { pattern: /\b(UnhandledPromise)\b/i, level: 'error', title: 'Unhandled Promise' },
  { pattern: /\b(Cannot find module)\b/i, level: 'error', title: 'Module Not Found' },
  { pattern: /\b(Module not found)\b/i, level: 'error', title: 'Module Not Found' },
  { pattern: /\b(Failed to compile)\b/i, level: 'error', title: 'Compilation Failed' },
  { pattern: /\b(Build failed)\b/i, level: 'error', title: 'Build Failed' },
  { pattern: /\b(error Command failed)\b/i, level: 'error', title: 'Command Failed' },
  { pattern: /\b(ERR_PACKAGE_PATH_NOT_EXPORTED)\b/, level: 'error', title: 'Package Path Not Exported' },
  { pattern: /\b(ERR_MODULE_NOT_FOUND)\b/, level: 'error', title: 'Module Not Found' },

  // ── Network / runtime errors ──
  { pattern: /\b(ECONNREFUSED|EADDRINUSE|ENOTFOUND|ECONNRESET|ETIMEDOUT|EACCES|EPERM|EISDIR|ENOENT)\b/, level: 'error', title: null },
  { pattern: /\b(ERR_CONNECTION_REFUSED)\b/, level: 'error', title: 'Connection Refused' },
  { pattern: /HTTP\/?\d?\.?\d?\s+(404|500|502|503|504)\b/, level: 'error', title: null },
  { pattern: /\b(CORS)\b/i, level: 'error', title: 'CORS Error' },
  { pattern: /\b(Failed to fetch)\b/i, level: 'error', title: 'Failed to Fetch' },
  { pattern: /\b(FetchError)\b/i, level: 'error', title: 'Fetch Error' },
  { pattern: /\b(NetworkError)\b/i, level: 'error', title: 'Network Error' },

  // ── Generic error markers ──
  { pattern: /^Error:\s*(.+)/m, level: 'error', title: null },
  { pattern: /^ERROR:\s*(.+)/m, level: 'error', title: null },
  { pattern: /\bERROR\b/, level: 'error', title: 'Error' },
  { pattern: /\b(FAILED|Failed)\b/, level: 'error', title: 'Failed' },
  { pattern: /\b(Exception)\b/, level: 'error', title: 'Exception' },
  { pattern: /\b(UNHANDLED)\b/, level: 'error', title: 'Unhandled Error' },

  // ── Warnings ──
  { pattern: /^(Warning|WARNING):\s*(.+)/m, level: 'warning', title: null },
  { pattern: /\b(Warning|WARNING)\b/, level: 'warning', title: 'Warning' },
  { pattern: /\b(DeprecationWarning)\b/, level: 'warning', title: 'Deprecation Warning' },
  { pattern: /\b(ExperimentalWarning)\b/, level: 'warning', title: 'Experimental Warning' },

  // ── Stack trace frames (info) ──
  { pattern: /^at\s/, level: 'info', title: 'Stack Frame' },
];

function _stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

function parseLine(rawLine) {
  const line = _stripAnsi(rawLine).trim();
  if (!line) return null;

  if (!PRE_FILTER.test(line)) return null;

  for (const rule of RULES) {
    const match = line.match(rule.pattern);
    if (match) {
      const title = rule.title || (match[1] || match[0]);
      const message = line.length > 200 ? line.slice(0, 200) + '...' : line;
      return { level: rule.level, title, message, raw: line };
    }
  }

  return null;
}

module.exports = { parseLine };
