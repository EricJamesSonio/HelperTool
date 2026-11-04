'use strict';

const crypto = require('crypto');
const path = require('path');

const MAX_PER_STEP = 200;
const MAX_MESSAGE = 2000;
const MAX_STACK = 4000;
const LOOKAHEAD = 25;
const OPEN_PAREN = String.fromCharCode(40);
const CLOSE_PAREN = String.fromCharCode(41);

const TS_PAREN_RE = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/;
const TS_COLON_RE = /^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s*(.+)$/;
const GCC_RE = /^(.+?):(\d+):(\d+):\s*(fatal error|error|warning)[:\s]\s*(.+)$/;
const ESLINT_FILE_RE = /^\S.*\.[A-Za-z0-9]{1,5}$/;
const ESLINT_ITEM_RE = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}([@\w/.-]+)\s*$/;
const ANNOTATION_RE = /^::(error|warning)(?:\s+([^:]*))?::(.*)$/;
const PY_TRACE_RE = /^Traceback \(most recent call last\):/;
const PY_END_RE = /^([A-Za-z_][\w.]*)(?::\s*(.*))?$/;
const PY_FRAME_RE = /^\s+File \x22(.+?)\x22, line (\d+)/;
const JS_ERROR_RE = /^\s{0,4}(?:Uncaught\s+)?([A-Z][A-Za-z0-9_]*(?:Error|Exception))(?:\s\[[A-Za-z0-9_]+\])?:\s*(.*)$/;
const STACK_LINE_RE = /^\s+at\s/;
const TEST_FAIL_RE = /^\s*[\u2716\u00d7]\s+(.+?)(?:\s+\([\d.]+\s*m?s\))?\s*$/;
const JEST_FAIL_RE = /^\s*FAIL\s+(\S.*?)\s*$/;
const LOCATION_RE = /^(.+):(\d+):(\d+)$/;

function relFile(file, root) {
  if (!file) return null;
  let out = String(file);
  if (root && path.isAbsolute(out)) {
    const rel = path.relative(root, out);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) out = rel;
  }
  return out.split(path.sep).join('/').replace(/\\/g, '/');
}

function frameLocation(text) {
  let target = String(text).trim();
  if (target.startsWith('at ')) target = target.slice(3).trim();
  const open = target.lastIndexOf(OPEN_PAREN);
  if (open !== -1 && target.charAt(target.length - 1) === CLOSE_PAREN) {
    target = target.slice(open + 1, target.length - 1);
  }
  const match = LOCATION_RE.exec(target);
  if (!match) return null;
  let file = match[1];
  if (file.startsWith('node:') || file.includes('node_modules')) return null;
  if (file.startsWith('file://')) {
    file = file.slice(7);
    if (/^\/[A-Za-z]:/.test(file)) file = file.slice(1);
    try {
      file = decodeURIComponent(file);
    } catch (e) {
      /* keep the raw path */
    }
  }
  return { file, line: Number(match[2]), col: Number(match[3]) };
}

function build(raw, root, stepIdx) {
  const level = raw.level === 'warning' ? 'warning' : 'error';
  const title = String(raw.title || 'Error').slice(0, 200);
  const message = String(raw.message || '').trim().slice(0, MAX_MESSAGE);
  const file = relFile(raw.file, root);
  const line = Number.isFinite(raw.line) ? raw.line : null;
  const col = Number.isFinite(raw.col) ? raw.col : null;
  const fingerprint = crypto
    .createHash('sha1')
    .update([level, title, file || '', line === null ? '' : line, col === null ? '' : col, message.slice(0, 300)].join('|'))
    .digest('hex')
    .slice(0, 16);
  return {
    stepIdx,
    fingerprint,
    level,
    title,
    message,
    file,
    line,
    col,
    stack: raw.stack ? String(raw.stack).slice(0, MAX_STACK) : null,
    count: 1,
    logSeq: null,
  };
}

function extractErrors(lines, options) {
  const o = options || {};
  const stepIdx = Number.isFinite(o.stepIdx) ? o.stepIdx : null;
  const texts = (lines || [])
    .filter((l) => l && l.k !== 'sys' && l.k !== 'in')
    .map((l) => String(l.t === undefined || l.t === null ? '' : l.t).replace(/\s+$/, ''));

  const found = new Map();
  const add = (raw) => {
    const entry = build(raw, o.root, stepIdx);
    const previous = found.get(entry.fingerprint);
    if (previous) {
      previous.count += 1;
      return;
    }
    if (found.size >= MAX_PER_STEP) return;
    found.set(entry.fingerprint, entry);
  };

  let eslintFile = null;

  for (let i = 0; i < texts.length; i += 1) {
    const text = texts[i];
    if (!text.trim()) {
      eslintFile = null;
      continue;
    }

    let m = ANNOTATION_RE.exec(text);
    if (m) {
      const params = {};
      for (const part of String(m[2] || '').split(',')) {
        const eq = part.indexOf('=');
        if (eq > 0) params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
      }
      add({
        level: m[1],
        title: params.title || 'Annotation',
        message: m[3],
        file: params.file || null,
        line: params.line ? Number(params.line) : null,
        col: params.col ? Number(params.col) : null,
      });
      continue;
    }

    m = TS_PAREN_RE.exec(text) || TS_COLON_RE.exec(text);
    if (m) {
      add({ level: m[4], title: m[5], message: m[6], file: m[1], line: Number(m[2]), col: Number(m[3]) });
      continue;
    }

    m = GCC_RE.exec(text);
    if (m) {
      add({
        level: m[4] === 'warning' ? 'warning' : 'error',
        title: m[4] === 'fatal error' ? 'error' : m[4],
        message: m[5],
        file: m[1],
        line: Number(m[2]),
        col: Number(m[3]),
      });
      continue;
    }

    m = eslintFile ? ESLINT_ITEM_RE.exec(text) : null;
    if (m) {
      add({ level: m[3], title: m[5], message: m[4], file: eslintFile, line: Number(m[1]), col: Number(m[2]) });
      continue;
    }

    if (PY_TRACE_RE.test(text)) {
      const stack = [text];
      let loc = null;
      let j = i + 1;
      while (j < texts.length && j - i <= LOOKAHEAD * 2 && /^\s/.test(texts[j])) {
        const frame = PY_FRAME_RE.exec(texts[j]);
        if (frame) loc = { file: frame[1], line: Number(frame[2]) };
        stack.push(texts[j]);
        j += 1;
      }
      const end = j < texts.length ? PY_END_RE.exec(texts[j]) : null;
      if (end) {
        stack.push(texts[j]);
        add({
          title: end[1],
          message: end[2] || end[1],
          file: loc ? loc.file : null,
          line: loc ? loc.line : null,
          stack: stack.join('\n'),
        });
        i = j;
      } else {
        add({ title: 'Traceback', message: text, file: loc ? loc.file : null, line: loc ? loc.line : null, stack: stack.join('\n') });
        i = j - 1;
      }
      continue;
    }

    m = JS_ERROR_RE.exec(text);
    if (m) {
      const stack = [text];
      let loc = null;
      let started = false;
      let j = i + 1;
      for (; j < texts.length && j - i <= LOOKAHEAD; j += 1) {
        const next = texts[j];
        if (STACK_LINE_RE.test(next)) {
          started = true;
          stack.push(next);
          if (!loc) loc = frameLocation(next);
        } else if (started || JS_ERROR_RE.test(next)) {
          break;
        }
      }
      add({
        title: m[1],
        message: m[2] || m[1],
        file: loc ? loc.file : null,
        line: loc ? loc.line : null,
        col: loc ? loc.col : null,
        stack: stack.join('\n'),
      });
      if (started) i = j - 1;
      continue;
    }

    m = JEST_FAIL_RE.exec(text);
    if (m) {
      add({ title: 'Test file failed', message: m[1], file: m[1] });
      continue;
    }

    m = TEST_FAIL_RE.exec(text);
    if (m && !/^failing tests/i.test(m[1])) {
      add({ title: 'Test failed', message: m[1] });
      continue;
    }

    if (ESLINT_FILE_RE.test(text)) eslintFile = text.trim();
  }

  return Array.from(found.values());
}

function failureError(view, options) {
  const o = options || {};
  const stepIdx = Number.isFinite(o.stepIdx) ? o.stepIdx : view && Number.isFinite(view.idx) ? view.idx : null;
  const reason = view ? view.reason : null;
  let message;
  if (reason === 'timeout') message = 'The step timed out and was ended.';
  else if (reason === 'spawn-error') message = 'The step could not be started.';
  else if (view && view.exitCode !== null && view.exitCode !== undefined) message = 'The step exited with code ' + view.exitCode + '.';
  else message = 'The step ended without an exit code' + (view && view.signal ? ' (signal ' + view.signal + ')' : '') + '.';
  return build({ title: 'Step failed', message }, o.root, stepIdx);
}

module.exports = { extractErrors, failureError };