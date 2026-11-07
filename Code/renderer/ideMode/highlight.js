const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

export function esc(s) {
  return s.replace(/[&<>]/g, (c) => ESC[c]);
}
export function pathKey(p) {
  const n = String(p || '').replace(/\\/g, '/');
  return /^[a-zA-Z]:\//.test(n) ? n.toLowerCase() : n;
}

function span(cls, s) {
  return '<span class="' + cls + '">' + esc(s) + '</span>';
}

function words(s) {
  return new Set(s.split(' '));
}

const JS_WORDS = 'break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await as implements interface enum namespace declare public private protected readonly abstract true false null undefined NaN';
const KW_JS = words(JS_WORDS);
const KW_CLIKE = words(JS_WORDS + ' int long short float double char bool boolean string byte struct union fn func pub mut impl use mod package trait final defer go chan select goto sizeof typedef extern volatile unsigned signed override virtual template typename using foreach echo print require_once include elseif endif model datasource generator');
const KW_PY = words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return try while with yield True False self');
const KW_JSON = words('true false null');
const KW_SH = words('if then else elif fi for while do done case esac function in return export echo cd exit local set unset source alias true false null');

const JS_RE = /(\/\/.*)|(\/\*)|("(?:[^"\\]|\\.)*(?:"|$)|'(?:[^'\\]|\\.)*(?:'|$)|`(?:[^`\\]|\\.)*(?:`|$))|(\b0[xX][\da-fA-F]+\b|\b\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?\b)|([A-Za-z_$][\w$]*)/g;
const CSS_RE = /(\/\*)|("(?:[^"\\]|\\.)*(?:"|$)|'(?:[^'\\]|\\.)*(?:'|$))|(@[\w-]+)|(#[\da-fA-F]{3,8}\b)|(-?\b\d*\.?\d+(?:px|em|rem|%|vh|vw|ms|s|deg|fr|ch)?)|([.#][\w-]+)|((?:--)?[A-Za-z-][\w-]*(?=\s*:))|([A-Za-z-][\w-]*)/g;
const HTML_RE = /(<!--.*?(?:-->|$))|(<\/?[A-Za-z][\w:.-]*)|(?<==\s*)("[^"]*(?:"|$)|'[^']*(?:'|$))|(\/?>)|([A-Za-z_:@#.][\w:.@-]*(?=\s*=))|(&[#\w]+;)/g;
const PY_RE = /(#.*)|("(?:[^"\\]|\\.)*(?:"|$)|'(?:[^'\\]|\\.)*(?:'|$))|(\b\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?\b)|(@[A-Za-z_][\w.]*)|([A-Za-z_]\w*)/g;
const MD_RE = /(^#{1,6}\s.*)|(^\s*(?:[-*+]|\d+\.)\s)|(^```.*)|(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]*\]\([^)]*\))/g;
const CONF_RE = /(#.*)|("(?:[^"\\]|\\.)*(?:"|$)|'(?:[^'\\]|\\.)*(?:'|$))|(^\s*[\w.\-]+(?=\s*[:=]))|(\b\d[\d_.]*\b)|([A-Za-z_]\w*)/g;

const JS_CLS = [0, 't-c', 'bc', 'str', 't-n', 'id'];

const SPECS = {
  js: { re: JS_RE, kw: KW_JS, caps: true, blocks: true, cls: JS_CLS },
  clike: { re: JS_RE, kw: KW_CLIKE, caps: true, blocks: true, cls: JS_CLS },
  json: { re: JS_RE, kw: KW_JSON, json: true, cls: JS_CLS },
  css: { re: CSS_RE, blocks: true, cls: [0, 'bc', 'str', 't-k', 't-n', 't-n', 't-t', 't-p', ''] },
  html: { re: HTML_RE, cls: [0, 't-c', 't-t', 't-s', 't-t', 't-a', 't-n'] },
  py: { re: PY_RE, kw: KW_PY, caps: true, cls: [0, 't-c', 'str', 't-n', 't-f', 'id'] },
  md: { re: MD_RE, cls: [0, 't-k', 't-n', 't-c', 't-s', 't-f', 't-p'] },
  conf: { re: CONF_RE, kw: KW_SH, cls: [0, 't-c', 'str', 't-p', 't-n', 'id'] },
};

const EXT_LANG = {
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js',
  java: 'clike', c: 'clike', h: 'clike', cpp: 'clike', cs: 'clike', go: 'clike', rs: 'clike',
  php: 'clike', kt: 'clike', swift: 'clike', dart: 'clike', prisma: 'clike',
  json: 'json', jsonc: 'json',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', vue: 'html', xml: 'html', svg: 'html',
  md: 'md', markdown: 'md',
  py: 'py',
  sh: 'conf', bash: 'conf', zsh: 'conf', yml: 'conf', yaml: 'conf', env: 'conf',
  toml: 'conf', ini: 'conf', gitignore: 'conf', dockerignore: 'conf',
};

const EXT_LABEL = {
  js: 'JavaScript', jsx: 'JavaScript React', mjs: 'JavaScript', cjs: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript React', json: 'JSON', css: 'CSS', scss: 'SCSS',
  less: 'Less', html: 'HTML', htm: 'HTML', vue: 'Vue', xml: 'XML', svg: 'SVG',
  md: 'Markdown', py: 'Python', sh: 'Shell Script', yml: 'YAML', yaml: 'YAML',
  env: 'Environment', php: 'PHP', java: 'Java', go: 'Go', rs: 'Rust', prisma: 'Prisma',
  c: 'C', cpp: 'C++', cs: 'C#', toml: 'TOML', ini: 'INI', txt: 'Plain Text',
};

export function extOf(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.startsWith('.env')) return 'env';
  const i = lower.lastIndexOf('.');
  return i < 0 ? '' : lower.slice(i + 1);
}

export function langFor(name) {
  return EXT_LANG[extOf(name)] || 'plain';
}

export function langLabel(name) {
  return EXT_LABEL[extOf(name)] || 'Plain Text';
}

let blockState = false;

function okOpen(line, i) {
  if (i === 0) return true;
  if (/[\w'"`*\/.]/.test(line[i - 1])) return false;
  const sl = line.indexOf('//');
  return sl === -1 || sl > i;
}

function openAt(line, pos) {
  let k = line.indexOf('/*', pos);
  while (k !== -1 && !okOpen(line, k)) k = line.indexOf('/*', k + 1);
  return k;
}

function startsInBlock(lines, upto) {
  let inB = false;
  for (let i = 0; i < upto; i++) {
    const l = lines[i];
    if (!inB && l.indexOf('/*') === -1) continue;
    let pos = 0;
    for (;;) {
      if (inB) {
        const j = l.indexOf('*/', pos);
        if (j === -1) break;
        inB = false;
        pos = j + 2;
      } else {
        const k = openAt(l, pos);
        if (k === -1) break;
        inB = true;
        pos = k + 2;
      }
    }
  }
  return inB;
}

function hlLine(line, spec) {
  if (line.length > 2000) return esc(line);
  const re = spec.re;
  re.lastIndex = 0;
  let out = '';
  let pos = 0;
  if (blockState) {
    const end = line.indexOf('*/');
    if (end === -1) return span('t-c', line);
    out = span('t-c', line.slice(0, end + 2));
    pos = end + 2;
    re.lastIndex = pos;
    blockState = false;
  }
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > pos) out += esc(line.slice(pos, m.index));
    let gi = 1;
    while (gi < m.length && m[gi] === undefined) gi++;
    const c = spec.cls[gi];
    if (c === 'bc') {
      if (!okOpen(line, m.index)) {
        out += '/*';
        pos = re.lastIndex;
        continue;
      }
      const end = line.indexOf('*/', m.index + 2);
      if (end === -1) {
        out += span('t-c', line.slice(m.index));
        pos = line.length;
        blockState = true;
        break;
      }
      out += span('t-c', line.slice(m.index, end + 2));
      pos = end + 2;
      re.lastIndex = pos;
      continue;
    }
    let cls;
    if (c === 'id') {
      const w = m[gi];
      const code = w.charCodeAt(0);
      if (spec.kw && spec.kw.has(w)) cls = 't-k';
      else if (line.charCodeAt(re.lastIndex) === 40) cls = 't-f';
      else if (spec.caps && code >= 65 && code <= 90) cls = 't-t';
      else cls = '';
    } else if (c === 'str') {
      cls = spec.json && /^\s*:/.test(line.slice(re.lastIndex)) ? 't-p' : 't-s';
    } else {
      cls = c;
    }
    out += cls ? span(cls, m[0]) : esc(m[0]);
    pos = re.lastIndex;
  }
  if (pos < line.length) out += esc(line.slice(pos));
  return out;
}

export function highlightRange(lines, from, to, lang) {
  const spec = SPECS[lang];
  const parts = [];
  if (!spec) {
    for (let i = from; i <= to; i++) parts.push(esc(lines[i]));
    return parts.join('\n');
  }
  blockState = spec.blocks ? startsInBlock(lines, from) : false;
  for (let i = from; i <= to; i++) parts.push(hlLine(lines[i], spec));
  return parts.join('\n');
}