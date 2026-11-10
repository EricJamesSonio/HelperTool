const LS_KEY = 'helpertool-ide-prettier-v1';
const MAX_CHARS = 600000;

export const GROUPS = [
  { id: 'js', label: 'JavaScript / TypeScript', exts: ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'], sizes: [2, 4, 'tab'], sample: 'sample.js' },
  { id: 'py', label: 'Python', exts: ['py', 'pyw'], sizes: [2, 4], sample: 'sample.py' },
  { id: 'json', label: 'JSON', exts: ['json'], sizes: [2, 4, 'tab'], sample: 'sample.json' },
  { id: 'css', label: 'CSS / SCSS / Less', exts: ['css', 'scss', 'less'], sizes: [2, 4, 'tab'], sample: 'sample.css' },
  { id: 'html', label: 'HTML / Vue', exts: ['html', 'htm', 'vue', 'xml'], sizes: [2, 4, 'tab'], sample: 'sample.html' },
  { id: 'php', label: 'PHP / C-like', exts: ['php', 'java', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'kt', 'swift', 'dart'], sizes: [2, 4, 'tab'], sample: 'sample.php' },
];

export const PRESETS = [
  {
    id: 'standard',
    label: 'Standard',
    desc: 'Prettier and PEP 8 style. 2 spaces for web code, 4 for Python and PHP, one blank line between functions.',
    opts: { indent: { js: 2, json: 2, css: 2, html: 2, py: 4, php: 4 }, maxBlank: 1, fnGap: 1, pyGap: 2, pyMethodGap: 1 },
  },
  {
    id: 'compact',
    label: 'Compact',
    desc: 'Tight. 2 spaces, single blank lines, no extra spacing added between functions.',
    opts: { indent: { js: 2, json: 2, css: 2, html: 2, py: 4, php: 2 }, maxBlank: 1, fnGap: 0, pyGap: 1, pyMethodGap: 0 },
  },
  {
    id: 'roomy',
    label: 'Roomy',
    desc: 'Airy and easy to scan. 4 spaces and two blank lines between functions and classes.',
    opts: { indent: { js: 4, json: 4, css: 4, html: 4, py: 4, php: 4 }, maxBlank: 2, fnGap: 2, pyGap: 2, pyMethodGap: 1 },
  },
  {
    id: 'tabs',
    label: 'Tabs',
    desc: 'Tabs for everything except Python, which stays at 4 spaces.',
    opts: { indent: { js: 'tab', json: 'tab', css: 'tab', html: 'tab', py: 4, php: 'tab' }, maxBlank: 1, fnGap: 1, pyGap: 2, pyMethodGap: 1 },
  },
];

const DEFAULTS = {
  preset: 'standard',
  indent: { js: 2, json: 2, css: 2, html: 2, py: 4, php: 4 },
  maxBlank: 1,
  fnGap: 1,
  pyGap: 2,
  pyMethodGap: 1,
  trimTrailing: true,
  finalNewline: true,
  formatOnSave: true,
};

const SAMPLES = {
  js:
    "import { readFile } from 'fs'\n" +
    'function load(path) {\n' +
    '   const data = readFile(path)   \n' +
    '   return data\n' +
    '}\n' +
    'function save(path, data) {\n' +
    '    writeFile(path, data)\n' +
    '}\n\n\n\n' +
    'class Store {\n' +
    '    items = []\n' +
    '    add(item) {\n' +
    '        this.items.push(item)\n' +
    '    }\n' +
    '    clear() {\n' +
    '        this.items = []\n' +
    '    }\n' +
    '}\n',
  py:
    'import os\n' +
    'def load(path):\n' +
    '    with open(path) as f:\n' +
    '        return f.read()  \n' +
    'class Store:\n' +
    '    def __init__(self):\n' +
    '        self.items = []\n' +
    '    def add(self, item):\n' +
    '        self.items.append(item)\n' +
    '    def clear(self):\n' +
    '        self.items = []\n' +
    "x = load('a.txt')\n",
  json: '{"name":"demo","version":"1.0.0","scripts":{"dev":"next dev","build":"next build"},"files":["dist","src"]}',
  css:
    '.card {\n' +
    '    color: red;\n' +
    '    padding: 4px;\n' +
    '}\n' +
    '.card:hover {\n' +
    '   color: blue;\n' +
    '}\n' +
    '@media (max-width: 600px) {\n' +
    '    .card {\n' +
    '        display: none;\n' +
    '    }\n' +
    '}\n',
  html:
    '<div class="box">\n' +
    '    <h1>Title</h1>   \n' +
    '        <p>Text</p>\n\n\n\n' +
    '    <ul>\n' +
    '        <li>One</li>\n' +
    '    </ul>\n' +
    '</div>\n',
  php:
    '<?php\n' +
    'class Store\n' +
    '{\n' +
    '    private $items = [];\n' +
    '    public function add($item)\n' +
    '    {\n' +
    '        $this->items[] = $item;\n' +
    '    }\n' +
    '    public function clear()\n' +
    '    {\n' +
    '        $this->items = [];\n' +
    '    }\n' +
    '}\n',
};

const EXT_GROUP = {};
for (const g of GROUPS) {
  for (const e of g.exts) EXT_GROUP[e] = g.id;
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function getOptions() {
  const base = clone(DEFAULTS);
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  } catch (_) {
    saved = null;
  }
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(base)) {
      if (k === 'indent') {
        if (saved.indent && typeof saved.indent === 'object') Object.assign(base.indent, saved.indent);
      } else if (saved[k] !== undefined) {
        base[k] = saved[k];
      }
    }
  }
  return base;
}

function save(o) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(o));
  } catch (_) {}
}

export function setOptions(patch) {
  const cur = getOptions();
  for (const k of Object.keys(patch || {})) {
    if (k === 'indent') Object.assign(cur.indent, patch.indent);
    else cur[k] = patch[k];
  }
  save(cur);
  return cur;
}

export function applyPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return getOptions();
  const cur = getOptions();
  const next = Object.assign({}, cur, clone(p.opts), { preset: id });
  save(next);
  return next;
}

export function sampleFor(id) {
  return SAMPLES[id] || '';
}

function extOf(name) {
  const lower = String(name || '').toLowerCase();
  if (/\.(min|bundle)\.[a-z]+$/.test(lower) || lower.endsWith('.blade.php')) return '';
  const i = lower.lastIndexOf('.');
  return i < 0 ? '' : lower.slice(i + 1);
}

function groupFor(name) {
  return EXT_GROUP[extOf(name)] || null;
}

export function canFormat(name) {
  return !!groupFor(name);
}

function splitIndent(line) {
  let i = 0;
  let tabs = 0;
  let spaces = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\t') tabs++;
    else if (ch === ' ') spaces++;
    else break;
    i++;
  }
  return { tabs, spaces, rest: line.slice(i) };
}

function leadOf(line) {
  return line.slice(0, line.length - line.trimStart().length);
}

function jsProtected(lines) {
  const prot = new Array(lines.length).fill(false);
  let inBlock = false;
  let inTpl = false;
  const stack = [];
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    prot[i] = inTpl;
    let j = 0;
    while (j < s.length) {
      const ch = s[j];
      if (inBlock) {
        const e = s.indexOf('*/', j);
        if (e === -1) break;
        inBlock = false;
        j = e + 2;
        continue;
      }
      if (inTpl) {
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === '`') {
          inTpl = false;
          j++;
          continue;
        }
        if (ch === '$' && s[j + 1] === '{') {
          stack.push(0);
          inTpl = false;
          j += 2;
          continue;
        }
        j++;
        continue;
      }
      if (ch === '/' && s[j + 1] === '/') break;
      if (ch === '/' && s[j + 1] === '*') {
        inBlock = true;
        j += 2;
        continue;
      }
      if (ch === '"' || ch === "'") {
        let k = j + 1;
        while (k < s.length && s[k] !== ch) {
          if (s[k] === '\\') k++;
          k++;
        }
        j = k + 1;
        continue;
      }
      if (ch === '`') {
        inTpl = true;
        j++;
        continue;
      }
      if (ch === '{') {
        if (stack.length) stack[stack.length - 1]++;
        j++;
        continue;
      }
      if (ch === '}') {
        if (stack.length) {
          if (stack[stack.length - 1] === 0) {
            stack.pop();
            inTpl = true;
          } else {
            stack[stack.length - 1]--;
          }
        }
        j++;
        continue;
      }
      if (ch === '/') {
        let p = j - 1;
        while (p >= 0 && (s[p] === ' ' || s[p] === '\t')) p--;
        const prev = p < 0 ? '' : s[p];
        const kw = /(?:^|[^\w$])(?:return|typeof|case|in|of|yield|await|void|delete|throw|else|do)$/.test(s.slice(Math.max(0, p - 8), p + 1));
        const isRe = p < 0 || '(,=:[!&|?{};+-*%<>~^'.indexOf(prev) !== -1 || kw;
        if (isRe) {
          let k = j + 1;
          let cls = false;
          let ok = false;
          while (k < s.length) {
            const cc = s[k];
            if (cc === '\\') {
              k += 2;
              continue;
            }
            if (cc === '[') cls = true;
            else if (cc === ']') cls = false;
            else if (cc === '/' && !cls) {
              ok = true;
              break;
            }
            k++;
          }
          if (ok) {
            j = k + 1;
            continue;
          }
        }
      }
      j++;
    }
  }
  return prot;
}

function pyProtected(lines) {
  const prot = new Array(lines.length).fill(false);
  let tri = null;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    prot[i] = !!tri;
    let j = 0;
    while (j < s.length) {
      if (tri) {
        const e = s.indexOf(tri, j);
        if (e === -1) break;
        tri = null;
        j = e + 3;
        continue;
      }
      const ch = s[j];
      if (ch === '#') break;
      if (ch === '"' || ch === "'") {
        const three = ch + ch + ch;
        if (s.startsWith(three, j)) {
          tri = three;
          j += 3;
          continue;
        }
        let k = j + 1;
        while (k < s.length && s[k] !== ch) {
          if (s[k] === '\\') k++;
          k++;
        }
        j = k + 1;
        continue;
      }
      j++;
    }
  }
  return prot;
}

function htmlProtected(lines) {
  const prot = new Array(lines.length).fill(false);
  let open = 0;
  for (let i = 0; i < lines.length; i++) {
    prot[i] = open > 0;
    const o = (lines[i].match(/<(?:pre|textarea)\b/gi) || []).length;
    const c = (lines[i].match(/<\/(?:pre|textarea)>/gi) || []).length;
    open = Math.max(0, open + o - c);
  }
  return prot;
}

function detectUnit(lines, prot, fallback) {
  const counts = new Map();
  let prev = 0;
  for (let i = 0; i < lines.length; i++) {
    if (prot[i] || !lines[i].trim()) continue;
    const ind = splitIndent(lines[i]);
    if (ind.tabs) continue;
    const d = ind.spaces - prev;
    if (d >= 2 && d <= 8) counts.set(d, (counts.get(d) || 0) + 1);
    prev = ind.spaces;
  }
  let best = fallback;
  let n = 0;
  for (const entry of counts) {
    if (entry[1] > n || (entry[1] === n && entry[0] > best)) {
      best = entry[0];
      n = entry[1];
    }
  }
  return best;
}

function pyConsistent(lines, prot, unit) {
  let n = 0;
  let bad = 0;
  let tabLines = 0;
  let spaceLines = 0;
  for (let i = 0; i < lines.length; i++) {
    if (prot[i] || !lines[i].trim()) continue;
    const ind = splitIndent(lines[i]);
    if (!ind.tabs && !ind.spaces) continue;
    n++;
    if (ind.tabs && !ind.spaces) tabLines++;
    else if (!ind.tabs) {
      spaceLines++;
      if (ind.spaces % unit) bad++;
    }
  }
  if (tabLines && spaceLines) return false;
  return !n || bad / n <= 0.05;
}

function newIndent(ind, unit, size, canSnap) {
  let lvl = ind.tabs + Math.floor(ind.spaces / unit);
  let rem = ind.spaces % unit;
  if (rem && canSnap) {
    if (rem * 2 >= unit) lvl++;
    rem = 0;
  }
  const lead = size === 'tab' ? '\t'.repeat(lvl) : ' '.repeat(lvl * size);
  return lead + ' '.repeat(rem);
}

function collapseBlank(rows, max) {
  const res = [];
  let run = 0;
  for (const r of rows) {
    if (r.prot) {
      res.push(r);
      run = 0;
      continue;
    }
    if (r.blank) {
      if (!res.length || run >= max) continue;
      run++;
      res.push(r);
      continue;
    }
    run = 0;
    res.push(r);
  }
  while (res.length && res[res.length - 1].blank && !res[res.length - 1].prot) res.pop();
  return res;
}

function attachedTop(res, i, test) {
  let s = i;
  while (s > 0) {
    const p = res[s - 1];
    if (p.blank || p.prot) break;
    if (!test(p.t.trim())) break;
    s--;
  }
  return s;
}

function prevSolid(res, s) {
  let p = s - 1;
  while (p >= 0 && res[p].blank) p--;
  return p;
}

function setNeed(ins, res, s, p, need) {
  const have = s - 1 - p;
  if (have < need) ins.set(s, Math.max(ins.get(s) || 0, need - have));
}

const JS_ATTACH = (t) => t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('@');
const JS_DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b|^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\b|^(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[\w$]+\s*=>)|^(?:export\s+)?(?:interface|enum|namespace)\s+\w+|^(?:export\s+)?type\s+\w+/;
const JS_METHOD = /^((?:(?:public|private|protected|static|async|get|set|readonly|override|abstract)\s+)*)([\w$#]+)\s*(?:<[^>]*>)?\(.*\)\s*(?::\s*[^{;=]+)?\{$/;
const JS_CTRL = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'do', 'with']);

function insertsJs(res, o) {
  const ins = new Map();
  if (!o.fnGap) return ins;
  for (let i = 0; i < res.length; i++) {
    const r = res[i];
    if (r.prot || r.blank) continue;
    const t = r.t.trim();
    const lead = leadOf(r.t);
    const s = attachedTop(res, i, JS_ATTACH);
    const p = prevSolid(res, s);
    if (p < 0 || res[p].prot) continue;
    const pt = res[p].t.trim();
    let decl = false;
    if (lead === '' && JS_DECL.test(t)) {
      decl = true;
    } else if (pt === '}' && leadOf(res[p].t) === lead) {
      const mm = JS_METHOD.exec(t);
      if (mm && !JS_CTRL.has(mm[2])) decl = true;
    }
    if (!decl) continue;
    if (/[{(\[,]$/.test(pt) || pt === '=>') continue;
    const multi = /(?:\{|\(|=>)$/.test(t);
    const afterBlock = /^\}[)\];,]*$/.test(pt);
    if (!multi && !afterBlock) continue;
    setNeed(ins, res, s, p, o.fnGap);
  }
  return ins;
}

const PY_DECL = /^(?:async\s+def|def|class)\b/;
const PY_ATTACH = (t) => t.startsWith('#') || t.startsWith('@');

function insertsPy(res, o) {
  const ins = new Map();
  for (let i = 0; i < res.length; i++) {
    const r = res[i];
    if (r.prot || r.blank) continue;
    const t = r.t.trim();
    if (!PY_DECL.test(t)) continue;
    const s = attachedTop(res, i, PY_ATTACH);
    const p = prevSolid(res, s);
    if (p < 0) continue;
    const pt = res[p].t.trim();
    if (pt.endsWith(':') && !pt.startsWith('#')) continue;
    const need = leadOf(r.t) === '' ? o.pyGap : o.pyMethodGap;
    if (need) setNeed(ins, res, s, p, need);
  }
  return ins;
}

const CSS_ATTACH = (t) => t.startsWith('/*') || t.startsWith('*') || t.startsWith('//');

function insertsCss(res, o) {
  const ins = new Map();
  if (!o.fnGap) return ins;
  for (let i = 0; i < res.length; i++) {
    const r = res[i];
    if (r.prot || r.blank) continue;
    const t = r.t.trim();
    if (t.startsWith('}')) continue;
    const s = attachedTop(res, i, CSS_ATTACH);
    const p = prevSolid(res, s);
    if (p < 0 || res[p].prot) continue;
    const pt = res[p].t.trim();
    const sameLead = leadOf(res[s].t) === leadOf(res[p].t);
    const afterRule = pt === '}' && sameLead;
    const importThenRule = leadOf(res[s].t) === '' && leadOf(res[p].t) === '' && /;$/.test(pt) && /\{$/.test(t);
    if (afterRule || importThenRule) setNeed(ins, res, s, p, o.fnGap);
  }
  return ins;
}

const PHP_ATTACH = (t) => t.startsWith('//') || t.startsWith('#') || t.startsWith('/*') || t.startsWith('*');
const PHP_DECL = /^(?:(?:public|private|protected|static|abstract|final|readonly)\s+)*function\b|^(?:abstract\s+|final\s+)?(?:class|interface|trait|enum)\b/;

function insertsPhp(res, o) {
  const ins = new Map();
  if (!o.fnGap) return ins;
  for (let i = 0; i < res.length; i++) {
    const r = res[i];
    if (r.prot || r.blank) continue;
    const t = r.t.trim();
    if (!PHP_DECL.test(t)) continue;
    const s = attachedTop(res, i, PHP_ATTACH);
    const p = prevSolid(res, s);
    if (p < 0) continue;
    const pt = res[p].t.trim();
    if (/[{(\[,]$/.test(pt)) continue;
    if (/[};]$/.test(pt)) setNeed(ins, res, s, p, o.fnGap);
  }
  return ins;
}

function insertsVue(res, o) {
  const ins = new Map();
  if (!o.fnGap) return ins;
  for (let i = 0; i < res.length; i++) {
    const r = res[i];
    if (r.prot || r.blank) continue;
    if (!/^<(?:script|style|template)\b/.test(r.t)) continue;
    const p = prevSolid(res, i);
    if (p < 0) continue;
    if (/^<\/(?:script|style|template)>/.test(res[p].t.trim())) setNeed(ins, res, i, p, 1);
  }
  return ins;
}

function formatLines(text, group, o, name) {
  const lines = text.split('\n');
  let prot;
  if (group === 'js') prot = jsProtected(lines);
  else if (group === 'py') prot = pyProtected(lines);
  else if (group === 'html') prot = htmlProtected(lines);
  else prot = new Array(lines.length).fill(false);
  const size = o.indent[group];
  const unit = detectUnit(lines, prot, typeof size === 'number' ? size : 4);
  const convert = group === 'py' ? pyConsistent(lines, prot, unit) : true;
  const snap = group === 'js' || group === 'css' || group === 'php';
  const rows = [];
  let prevEnd = '';
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (prot[i]) {
      rows.push({ t: raw, prot: true, blank: false });
      continue;
    }
    let s = raw;
    if (o.trimTrailing && prot[i + 1] !== true) s = s.replace(/[ \t]+$/, '');
    if (!s.trim()) {
      rows.push({ t: '', prot: false, blank: true });
      continue;
    }
    const ind = splitIndent(s);
    const tr = ind.rest.trim();
    const isComment = tr.startsWith('//') || tr.startsWith('/*') || tr.startsWith('*') || (group === 'php' && tr.startsWith('#'));
    let t = s;
    if (convert) {
      const canSnap = snap && !tr.startsWith('*') && /[{};]$/.test(prevEnd);
      t = newIndent(ind, unit, size, canSnap) + ind.rest;
    }
    rows.push({ t, prot: false, blank: false });
    if (!isComment) prevEnd = tr[tr.length - 1];
  }
  const max = Math.max(o.maxBlank, o.fnGap, group === 'py' ? o.pyGap : 0);
  const res = collapseBlank(rows, max);
  if (!res.length) return '';
  let ins = new Map();
  if (group === 'js') ins = insertsJs(res, o);
  else if (group === 'py') ins = insertsPy(res, o);
  else if (group === 'css') ins = insertsCss(res, o);
  else if (group === 'php') ins = insertsPhp(res, o);
  else if (group === 'html' && name.endsWith('.vue')) ins = insertsVue(res, o);
  const out = [];
  for (let i = 0; i < res.length; i++) {
    const n = ins.get(i) || 0;
    for (let k = 0; k < n; k++) out.push('');
    out.push(res[i].t);
  }
  const body = out.join('\n');
  return o.finalNewline || text.endsWith('\n') ? body + '\n' : body;
}

function jsonOut(v, ind, lvl) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  const pad = ind.repeat(lvl + 1);
  const end = ind.repeat(lvl);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const parts = v.map((x) => jsonOut(x, ind, lvl + 1));
    const flat = '[' + parts.join(', ') + ']';
    const simple = v.every((x) => x === null || typeof x !== 'object');
    if (simple && flat.length + end.length <= 80) return flat;
    return '[\n' + parts.map((p) => pad + p).join(',\n') + '\n' + end + ']';
  }
  const keys = Object.keys(v);
  if (!keys.length) return '{}';
  for (const k of keys) {
    if (/^\d+$/.test(k)) throw new Error('numeric key');
  }
  return '{\n' + keys.map((k) => pad + JSON.stringify(k) + ': ' + jsonOut(v[k], ind, lvl + 1)).join(',\n') + '\n' + end + '}';
}

function formatJson(text, o) {
  if (/\d{16,}/.test(text)) return null;
  let v;
  try {
    v = JSON.parse(text);
  } catch (_) {
    return null;
  }
  const size = o.indent.json;
  const ind = size === 'tab' ? '\t' : ' '.repeat(size);
  let body;
  try {
    body = jsonOut(v, ind, 0);
  } catch (_) {
    return null;
  }
  return o.finalNewline || text.endsWith('\n') ? body + '\n' : body;
}

export function formatText(text, name, opts) {
  const group = groupFor(name);
  if (!group || typeof text !== 'string' || text.length > MAX_CHARS) return null;
  const o = opts || getOptions();
  if (!text.trim()) return text;
  if (group === 'json') return formatJson(text, o);
  return formatLines(text, group, o, String(name || '').toLowerCase());
}