const ESC_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const INCOMPLETE_RE = /\x1b(?:\[[0-9;?]*[ -\/]*|\][^\x07\x1b]*)?$/;
const OWN_FG_RE = /\x1b\[(?:\d+;)*(?:3[0-8]|9[0-7])(?:;[\d;]*)?m/;
const RESET_RE = /\x1b\[(?:0|39)?m/g;
const ALT_ON_RE = /\x1b\[\?(?:1049|1047|47)h/;
const ALT_OFF_RE = /\x1b\[\?(?:1049|1047|47)l/;
const SPLIT_RE = /(\r\n|\n|\r)/;

const RESET_FG = '\x1b[39m';
const COLORS = {
  prompt: '\x1b[97m',
  out: '\x1b[94m',
  err: '\x1b[91m',
  warn: '\x1b[93m',
};

const PROMPT_RES = [
  /^PS [^>\n]*>/,
  /^[A-Za-z]:\\[^>\n]*>/,
  /^[\w.-]+@[\w.-]+[: ~][^\n]*[$#]\s/,
  /^[$#]\s/,
];

const CLEAN_RE = /\b(?:0|no|zero|without)\s+(?:errors?|warnings?)\b/gi;

const ERR_RES = [
  /\b(?:error|errors|fatal|exception|failed|failure|panic|traceback|unhandled|segmentation fault|not recognized|permission denied|access is denied|cannot find|cannot read|could not|unable to|ENOENT|EADDRINUSE|ECONNREFUSED|EACCES|EPERM)\b/i,
  /\b(?:Type|Reference|Syntax|Range)Error\b/,
  /^\s+at\s+\S+.*:\d+:\d+\)?\s*$/,
  /^npm ERR!/i,
];

const WARN_RES = [
  /\b(?:warn|warns|warning|warnings|deprecated|deprecation)\b/i,
  /^npm WARN/i,
];

function matchesAny(list, text) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].test(text)) return true;
  }
  return false;
}

function classify(text) {
  const t = text.replace(/\r/g, '');
  if (matchesAny(PROMPT_RES, t)) return COLORS.prompt;
  const scan = t.replace(CLEAN_RE, '');
  if (matchesAny(ERR_RES, scan)) return COLORS.err;
  if (matchesAny(WARN_RES, scan)) return COLORS.warn;
  return COLORS.out;
}

export function createColorizer() {
  let atStart = true;
  let color = COLORS.out;
  let tail = '';
  let alt = false;

  function paint(part) {
    const plain = part.replace(ESC_RE, '');
    if (!plain.trim()) return part;
    if (atStart) {
      color = classify(plain);
      atStart = false;
    }
    if (OWN_FG_RE.test(part)) return part;
    return color + part.replace(RESET_RE, '$&' + color) + RESET_FG;
  }

  function process(data) {
    let src = tail + String(data);
    tail = '';
    const m = INCOMPLETE_RE.exec(src);
    if (m) {
      tail = m[0];
      src = src.slice(0, m.index);
    }
    if (alt) {
      if (ALT_OFF_RE.test(src)) alt = false;
      return src;
    }
    if (ALT_ON_RE.test(src)) {
      alt = true;
      return src;
    }
    const parts = src.split(SPLIT_RE);
    let out = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === '\r\n' || part === '\n' || part === '\r') {
        out += part;
        atStart = true;
        continue;
      }
      if (!part) continue;
      out += paint(part);
    }
    return out;
  }

  return { process };
}