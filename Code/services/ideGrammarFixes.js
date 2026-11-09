'use strict';

const TS_LANGS = new Set(['typescript', 'tsx']);
const JSX_LANGS = new Set(['tsx', 'javascript']);

function blankExportType(text) {
  return text.replace(/\bexport(\s+)type(\s*)\*/g, (all, a, b) => 'export' + a + '    ' + b + '*');
}

function flattenImportTypes(text) {
  return text.replace(/(?<=<\s*|,\s*|\btypeof\s+)import\(\s*(['"])[^'"\n]*\1\s*\)/g, (all) => '_'.repeat(all.length));
}

function blankJsxAmp(text) {
  const bare = /(?<!&)&(?!&|[#\w]+;)/g;
  const inline = text.replace(/(?<![=-])([>}])([^<>{}\n]+)/g, (all, open, body) => open + body.replace(bare, ' '));
  return inline.replace(/^[^<>{}=;\n]*&[^<>{}=;\n]*$/gm, (line) => line.replace(bare, ' '));
}

function flag(n, key) {
  const v = n[key];
  return typeof v === 'function' ? !!v.call(n) : !!v;
}

function inJsx(n) {
  let p = n.parent;
  for (let d = 0; p && d < 8; d++, p = p.parent) {
    if (p.type.indexOf('jsx') === 0) return true;
  }
  return false;
}

function ampErrorIndexes(root, src) {
  const out = [];
  const stack = [root];
  while (stack.length && out.length < 30) {
    const n = stack.pop();
    const err = flag(n, 'isError');
    if (err && src[n.startIndex] === '&' && inJsx(n)) {
      out.push(n.startIndex);
      continue;
    }
    if (n.type === '&' && n.parent && flag(n.parent, 'isError') && inJsx(n)) {
      out.push(n.startIndex);
      continue;
    }
    if (!err && !flag(n, 'hasError')) continue;
    for (const k of n.children || []) stack.push(k);
  }
  return out;
}

function blankAt(src, idxs) {
  const set = new Set(idxs);
  let out = '';
  for (let i = 0; i < src.length; i++) out += set.has(i) ? ' ' : src[i];
  return out;
}

function usesJsx(lang) {
  return JSX_LANGS.has(lang);
}

function stagesFor(lang, text) {
  const out = [];
  let cur = text;
  if (TS_LANGS.has(lang)) {
    const s1 = flattenImportTypes(blankExportType(cur));
    if (s1 !== cur) {
      out.push({ src: s1, always: true });
      cur = s1;
    }
  }
  if (JSX_LANGS.has(lang)) {
    const s2 = blankJsxAmp(cur);
    if (s2 !== cur) out.push({ src: s2, always: false });
  }
  return out;
}

module.exports = { stagesFor, usesJsx, ampErrorIndexes, blankAt, blankExportType, flattenImportTypes, blankJsxAmp };