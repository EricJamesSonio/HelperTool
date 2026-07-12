const ALLOWED_LOG = new Set(['[Main]', '[Tray]', '[Docignore]', '[DocIgnore]']);
const BLOCKED_ERROR = '[ErrorCop] processOutput failed';

let installed = false;

function install() {
  if (installed) return;
  installed = true;

  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  console.log = function (...args) {
    if (args.length && typeof args[0] === 'string') {
      const m = args[0].match(/^\[[^\]]*\]/);
      if (!m || !ALLOWED_LOG.has(m[0])) return;
    }
    return origLog.apply(console, args);
  };

  console.error = function (...args) {
    if (args.length && typeof args[0] === 'string' && args[0].startsWith(BLOCKED_ERROR)) return;
    return origError.apply(console, args);
  };

  console.warn = function (...args) {
    if (args.length && typeof args[0] === 'string' && args[0].startsWith(BLOCKED_ERROR)) return;
    return origWarn.apply(console, args);
  };
}

module.exports = { install };
