'use strict';

function pass(detail) {
  return { status: 'pass', detail: detail || '', evidence: [], fix: '' };
}

function fail(detail, fix, evidence, severity) {
  return { status: 'fail', detail: detail || '', evidence: evidence || [], fix: fix || '', severity: severity || null };
}

function skip(detail) {
  return { status: 'skip', detail: detail || '', evidence: [], fix: '' };
}

function na(detail) {
  return { status: 'na', detail: detail || '', evidence: [], fix: '' };
}

const SECRET_CONTEXT = new RegExp('(secret|passw|token|api[_-]?key|credential|private[_-]?key)', 'i');
const QUOTED_VALUE = new RegExp('([\\x22\\x27\\x60])[^\\x22\\x27\\x60\\s]{8,}\\1', 'g');

function redactText(text) {
  const s = String(text === null || text === undefined ? '' : text);
  if (!SECRET_CONTEXT.test(s)) return s;
  return s.replace(QUOTED_VALUE, '"[redacted]"');
}

module.exports = { pass, fail, skip, na, redactText };