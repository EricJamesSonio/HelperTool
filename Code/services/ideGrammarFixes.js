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
  const bare = /&(?![#\w]+;)/g;
  const inline = text.replace(/(?<![=-])([>}])([^<>{}\n]+)/g, (all, open, body) => open + body.replace(bare, ' '));
  return inline.replace(/^[^<>{}=;\n]*&[^<>{}=;\n]*$/gm, (line) => line.replace(bare, ' '));
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

module.exports = { stagesFor, blankExportType, flattenImportTypes, blankJsxAmp };