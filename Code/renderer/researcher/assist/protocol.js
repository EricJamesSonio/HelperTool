// Pure protocol helpers for the Researcher assist panel.
// No DOM and no Electron: unit tested directly by tests/researcherAssist.test.mjs.

export const MARKERS = Object.freeze({
  PROVIDE_CODEBASE: 'provide-codebase',
  SEND_FILE_CONTENTS: 'send-file-contents',
  OUTPUT_RESULTS: 'output-results',
  HUMAN_REVIEW: 'human-review-needed',
  DONE: 'done-ready-review',
});

const MARKER_NAMES = new Set(Object.values(MARKERS));
const STATUS_MARKERS = new Set([MARKERS.HUMAN_REVIEW, MARKERS.DONE]);

const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const START_RE = /^\s*(?:\S+\s+)?<<<+\s*START\s*>*\s*$/i;
const END_RE = /^\s*(?:\S+\s+)?<<<+\s*END\s*>*\s*$/i;
const START_TAIL_RE = /\s*<<<+\s*START\s*>*\s*$/i;

export const PROTOCOL_TITLE = 'TICKET WORKFLOW PROTOCOL';

export const PROTOCOL_PROMPT = [
  PROTOCOL_TITLE + ' (follow exactly)',
  '',
  'A helper tool reads every reply you send and answers for me. Talk to it with these markers.',
  'A marker goes ALONE on the first line of your reply, written exactly as shown (asterisks included).',
  'Never use a marker anywhere else.',
  '',
  '*provide-codebase*',
  'Use when you need the folder structure again. Nothing else in the reply.',
  '',
  '*send-file-contents*',
  'Use when you need to read files. After the marker, list ONE full repo-relative path per line',
  '(forward slashes, no bullets, no backticks, no comments, no paths inside sentences).',
  'Ask for every file you need in a single request.',
  '',
  '*output-results*',
  'Use only when you have everything you need. After the marker, a short explanation, then the code',
  'following /code-output-strict-rule: ONE code container for the whole batch, each file as',
  'path line + <<<START + complete code + <<<END. Explanations go outside the container.',
  '- If something needs a human step (migration, install, env change, manual verification), end the',
  '  reply with *human-review-needed* alone on its own line, then the exact steps.',
  '- If everything is finished and only my review is left, end the reply with *done-ready-review*',
  '  alone on its own line.',
  '',
  '*human-review-needed* or *done-ready-review* as the FIRST line: use when no code is needed in this',
  'reply. Then explain.',
  '',
  'Rules: never guess file contents, ask first. Never ask for .env, credentials or gmail-store.json.',
  'Do not repeat my ticket back.',
].join('\n');

export const REMINDER =
  '(Helper note: reply with ONE marker alone on the first line: *send-file-contents*, *output-results*, ' +
  '*human-review-needed* or *done-ready-review*. Code must follow /code-output-strict-rule: one code ' +
  'container, each file as path line + <<<START + code + <<<END.)';

const normalizeText = (text) => String(text ?? '').replace(/\r\n?/g, '\n');

export function formatChars(n) {
  if (n < 1000) return n + ' chars';
  return (n / 1000).toFixed(1) + 'k chars';
}

// ---------------------------------------------------------------------------
// Sensitive files
// ---------------------------------------------------------------------------

const SENSITIVE_RES = [
  /^credentials(\..+)?\.json$/i,
  /^gmail-store\.json$/i,
  /^\.env(\..+)?$/i,
  /\.(pem|key|p12|pfx)$/i,
  /^id_(rsa|ed25519|ecdsa)(\.pub)?$/i,
  /^\.npmrc$/i,
];
const SAFE_ENV_RE = /^\.env.*\.(example|sample|template|dist)$/i;

export function isSensitivePath(p) {
  const base = String(p ?? '').replace(/\\/g, '/').split('/').pop() || '';
  if (SAFE_ENV_RE.test(base)) return false;
  return SENSITIVE_RES.some((re) => re.test(base));
}

export function stripSensitiveTreeLines(tree) {
  const kept = [];
  let removed = 0;
  for (const line of normalizeText(tree).split('\n')) {
    const name = line
      .replace(/^[\s\u2502\u251c\u2514\u2500|`+\\-]+/, '')
      .replace(/\/$/, '')
      .trim();
    if (name && isSensitivePath(name)) {
      removed += 1;
      continue;
    }
    kept.push(line);
  }
  return { text: kept.join('\n'), removed };
}

// ---------------------------------------------------------------------------
// Marker detection
// ---------------------------------------------------------------------------

export function markerFromLine(line) {
  const t = String(line ?? '')
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .trim()
    .replace(/^[\s*_`#>\[\(-]+/, '')
    .replace(/[\s*_`\]\).:!]+$/, '')
    .toLowerCase();
  return MARKER_NAMES.has(t) ? t : null;
}

/**
 * Looks at the first three non-empty lines only, so a marker quoted deep in
 * a message is ignored. A reply that has no marker but does contain
 * <<<START ... <<<END blocks is treated as output-results (implied).
 */
export function detectReply(text) {
  const src = normalizeText(text);
  if (!src.trim()) return null;
  const lines = src.split('\n');
  let seen = 0;
  for (let i = 0; i < lines.length && seen < 3; i++) {
    if (!lines[i].trim()) continue;
    seen += 1;
    const marker = markerFromLine(lines[i]);
    if (marker) return { marker, lineIndex: i, offFirstLine: seen > 1, implied: false };
  }
  if (lines.some((l) => START_RE.test(l)) && lines.some((l) => END_RE.test(l))) {
    return { marker: MARKERS.OUTPUT_RESULTS, lineIndex: -1, offFirstLine: false, implied: true };
  }
  return null;
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const PATH_CHARS_RE = /^[A-Za-z0-9_.@()\[\]\-/$+~]+$/;

function trimWrappers(token) {
  let s = token
    .replace(/^[`'"\u2018\u2019\u201C\u201D<*]+/, '')
    .replace(/[`'"\u2018\u2019\u201C\u201D>*,;:.]+$/, '');
  while (s.endsWith(')') && (s.match(/\)/g) || []).length > (s.match(/\(/g) || []).length) {
    s = s.slice(0, -1);
  }
  if (s.startsWith('(') && !s.includes(')')) s = s.slice(1);
  return s;
}

/** One line from a "send-file-contents" reply -> clean posix path, or null. */
export function cleanPath(line) {
  let t = String(line ?? '').trim();
  if (!t || FENCE_RE.test(t)) return null;
  t = t.replace(/^(?:[-*+\u2022]\s+|\d+[.)]\s+)/, '');
  const token = trimWrappers(t.split(/\s+/)[0] || '');
  const p = token
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!p || p.includes('://') || !PATH_CHARS_RE.test(p)) return null;
  if (/^\d+(\.\d+)+$/.test(p) || /^(e\.g|i\.e|etc|vs)$/i.test(p)) return null;
  const hasSlash = p.includes('/');
  const hasExt = /\.[A-Za-z0-9]{1,10}$/.test(p);
  return hasSlash || hasExt ? p : null;
}

export function extractPaths(lines) {
  const out = [];
  const seen = new Set();
  for (const raw of lines) {
    if (markerFromLine(raw)) break;
    const p = cleanPath(raw);
    if (!p) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Code blocks (Global Seeder format)
// ---------------------------------------------------------------------------

/**
 * Rebuilds a clean batch from the reply: header + <<<START + body + <<<END
 * for every block, dropping fences and prose between blocks. Block bodies
 * are copied verbatim. Returns null when the reply has no <<<START at all.
 */
export function extractBlockContainer(text) {
  const lines = normalizeText(text).split('\n');
  const out = [];
  let blocks = 0;
  let missingEnd = false;
  let headerless = 0;
  let i = 0;
  while (i < lines.length) {
    if (!START_RE.test(lines[i])) {
      i += 1;
      continue;
    }
    let header = lines[i].trim().replace(START_TAIL_RE, '').trim();
    if (!header) {
      for (let k = i - 1; k >= 0; k--) {
        const t = lines[k].trim();
        if (!t) continue;
        if (FENCE_RE.test(t) || START_RE.test(t) || END_RE.test(t)) break;
        header = t;
        break;
      }
    }
    if (!header) headerless += 1;
    const body = [];
    let j = i + 1;
    let hasEnd = false;
    for (; j < lines.length; j++) {
      if (END_RE.test(lines[j])) {
        hasEnd = true;
        break;
      }
      body.push(lines[j]);
    }
    out.push(header, '<<<START', ...body);
    if (hasEnd) out.push('<<<END');
    else missingEnd = true;
    out.push('');
    blocks += 1;
    i = hasEnd ? j + 1 : j;
  }
  if (!blocks) return null;
  return { text: out.join('\n').replace(/\s+$/, '') + '\n', blocks, missingEnd, headerless };
}

/** A status marker alone on a line after the last <<<END (or anywhere, when there is no block). */
export function extractFinalStatus(text) {
  const lines = normalizeText(text).split('\n');
  let after = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (END_RE.test(lines[i])) {
      after = i;
      break;
    }
  }
  for (let i = after + 1; i < lines.length; i++) {
    const marker = markerFromLine(lines[i]);
    if (marker && STATUS_MARKERS.has(marker)) {
      return { marker, note: lines.slice(i + 1).join('\n').trim() };
    }
  }
  return null;
}

export function parseReply(text) {
  const det = detectReply(text);
  if (!det) return null;
  const lines = normalizeText(text).split('\n');
  const restLines = det.implied ? lines : lines.slice(det.lineIndex + 1);
  const rest = restLines.join('\n');
  const base = {
    marker: det.marker,
    offFirstLine: det.offFirstLine,
    implied: det.implied,
    rest: rest.trim(),
  };
  if (det.marker === MARKERS.SEND_FILE_CONTENTS) {
    return { ...base, paths: extractPaths(restLines) };
  }
  if (det.marker === MARKERS.OUTPUT_RESULTS) {
    return { ...base, container: extractBlockContainer(rest), finalStatus: extractFinalStatus(rest) };
  }
  return { ...base, notes: base.rest };
}

// ---------------------------------------------------------------------------
// Reply builders (text that goes back to Claude)
// ---------------------------------------------------------------------------

export function buildTreeReply({ repoName, tree, removed = 0 }) {
  const extra = removed ? ', ' + removed + ' sensitive file(s) hidden' : '';
  const head = 'Folder structure of ' + (repoName || 'the project') + ' (.docignore applied' + extra + '):';
  return [head, '', String(tree ?? '').replace(/\s+$/, ''), '', REMINDER].join('\n');
}

export function buildFilesReply({
  contents = '',
  missing = [],
  ambiguous = [],
  folders = [],
  blocked = [],
  repeats = [],
} = {}) {
  const notes = [];
  if (blocked.length) notes.push('Not available: ' + blocked.join(', '));
  for (const m of missing) {
    const hint = m.suggestions && m.suggestions.length ? ' (did you mean ' + m.suggestions.join(' or ') + '?)' : '';
    notes.push('Not found: ' + m.request + hint);
  }
  for (const a of ambiguous) {
    notes.push('Ambiguous: ' + a.request + ' matches ' + a.candidates.join(', ') + '. Resend the full path.');
  }
  for (const f of folders) {
    const more = f.total > f.files.length ? ' (+' + (f.total - f.files.length) + ' more)' : '';
    notes.push('Folder, not a file: ' + f.request + '. Files inside: ' + f.files.join(', ') + more);
  }
  if (repeats.length) notes.push('Sent before, fresh copy attached: ' + repeats.join(', '));
  const parts = [];
  if (notes.length) parts.push(notes.join('\n'));
  if (String(contents).trim()) parts.push(String(contents).trim());
  parts.push(REMINDER);
  return parts.join('\n\n');
}

export function buildFixReply({ issues = [], okPaths = [], noBlocks = false, currentFiles = '' } = {}) {
  const out = [];
  if (noBlocks) {
    out.push('Your last reply could not be applied: I found no <<<START / <<<END blocks in it.');
    out.push('');
    out.push(
      'Resend the code following /code-output-strict-rule: ONE code container, each file as ' +
        'path line + <<<START + complete code + <<<END. Explanations go outside the container.'
    );
  } else {
    out.push('The dry run of your last reply found problems:');
    out.push('');
    issues.forEach((it, i) => out.push(i + 1 + '. ' + it.path + ' - ' + it.reason));
    out.push('');
    if (okPaths.length) {
      out.push('These files passed the dry run, do NOT resend them: ' + okPaths.join(', ') + '.');
    }
    out.push(
      'Resend ONLY the failing files, complete (no truncation, ASCII quotes only), in ONE code ' +
        'container following /code-output-strict-rule.'
    );
    out.push(
      'For Replace / Add / Remove patches the target must already exist in the file. Use a full-file ' +
        'block when unsure.'
    );
  }
  if (String(currentFiles).trim()) {
    out.push('', 'Current content of the files whose patches failed:', '', String(currentFiles).trim());
  }
  out.push('', REMINDER);
  return out.join('\n');
}