'use strict';

const path = require('path');

const MAX_DIAGS = 60;
const MAX_TEXT = 600000;
const MAX_PARSE = 450000;

const JS_LANG = { js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'tsx' };
const CPP_EXT = new Set(['c', 'cc', 'cpp', 'cxx', 'h', 'hh', 'hpp', 'hxx']);
const CLOSE_OF = { '(': ')', '[': ']', '{': '}' };

let wts = null;
const parsers = new Map();

function getWts() {
  if (!wts) {
    const g = require('../utils/astPatch/grammarLoader.js');
    const WTS = require('web-tree-sitter');
    wts = { g, Parser: WTS.Parser || WTS.default || WTS };
  }
  return wts;
}

async function getParser(lang) {
  if (parsers.has(lang)) return parsers.get(lang);
  let p = null;
  try {
    const w = getWts();
    const Lang = await w.g.tryLoadLanguage(lang);
    if (Lang) {
      p = new w.Parser();
      p.setLanguage(Lang);
    }
  } catch (_) {
    p = null;
  }
  parsers.set(lang, p);
  return p;
}

function flag(n, key) {
  const v = n[key];
  return typeof v === 'function' ? !!v.call(n) : !!v;
}

function makeIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function posOf(starts, idx) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= idx) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: idx - starts[lo] };
}

function makeCtx(text) {
  const starts = makeIndex(text);
  const diags = [];
  const seen = new Set();
  function addAt(line, col, len, sev, msg, src) {
    const key = line + ':' + col + ':' + msg;
    if (seen.has(key) || diags.length >= MAX_DIAGS) return;
    seen.add(key);
    diags.push({ line, col: Math.max(0, col), len: Math.max(1, len | 0), sev, msg, src });
  }
  function add(idx, len, sev, msg, src) {
    const p = posOf(starts, idx);
    addAt(p.line, p.col, len, sev, msg, src);
  }
  return { starts, diags, add, addAt };
}

function rx(re, text, fn) {
  re.lastIndex = 0;
  let guard = 0;
  let m = re.exec(text);
  while (m !== null && guard++ < 500) {
    fn(m);
    if (m[0].length === 0) re.lastIndex++;
    m = re.exec(text);
  }
}

function lenOf(x) {
  const mm = /^[\w$]+/.exec(x[0]);
  return mm ? mm[0].length : x[0].length;
}
let extraMod = null;

function getExtra() {
  if (!extraMod) {
    extraMod = require('./ideDiagnosticsExtra.js');
    extraMod.useCore({ mask, rx, lintJs, syntaxErrors, blankOut, sliceKeep, lenOf });
  }
  return extraMod;
}

function extName(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith('.blade.php')) return 'blade';
  const i = lower.lastIndexOf('.');
  return i < 0 ? '' : lower.slice(i + 1);
}

function mask(text, kind) {
  const n = text.length;
  const codes = new Uint16Array(n);
  for (let k = 0; k < n; k++) codes[k] = text.charCodeAt(k);
  const bad = [];
  const blank = (a, b) => {
    for (let k = a; k < b; k++) {
      const ch = codes[k];
      if (ch !== 10 && ch !== 13) codes[k] = 32;
    }
  };
  const isPhp = kind === 'php';
  const isPy = kind === 'py';
  const isCpp = kind === 'cpp';
  const isJs = kind === 'js';
  let inCode = !isPhp;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    const nx = text[i + 1];
    if (!inCode) {
      const k = text.indexOf('<?', i);
      if (k === -1) {
        blank(i, n);
        break;
      }
      blank(i, k);
      let end = k + 2;
      if (text.startsWith('<?php', k)) end = k + 5;
      else if (text.startsWith('<?=', k)) end = k + 3;
      blank(k, end);
      i = end;
      inCode = true;
      continue;
    }
    if (isPhp && ch === '?' && nx === '>') {
      blank(i, i + 2);
      i += 2;
      inCode = false;
      continue;
    }
    if (isPy) {
      if (ch === '#') {
        let e = text.indexOf('\n', i);
        if (e === -1) e = n;
        blank(i, e);
        i = e;
        continue;
      }
    } else {
      const phpHash = isPhp && ch === '#' && nx !== '[';
      if ((ch === '/' && nx === '/') || phpHash) {
        let e = text.indexOf('\n', i);
        if (e === -1) e = n;
        if (isPhp) {
          const q = text.indexOf('?>', i);
          if (q !== -1 && q < e) e = q;
        }
        blank(i, e);
        i = e;
        continue;
      }
      if (ch === '/' && nx === '*') {
        let e = text.indexOf('*/', i + 2);
        e = e === -1 ? n : e + 2;
        blank(i, e);
        i = e;
        continue;
      }
    }
    if (isPy && (text.startsWith('"""', i) || text.startsWith("'''", i))) {
      const q = text.substr(i, 3);
      let j = i + 3;
      let found = -1;
      while (j < n) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text.startsWith(q, j)) {
          found = j;
          break;
        }
        j++;
      }
      if (found < 0) {
        bad.push(i);
        blank(i, n);
        i = n;
      } else {
        blank(i, found + 3);
        i = found + 3;
      }
      continue;
    }
    if (isCpp && ch === '"' && i > 0 && text[i - 1] === 'R') {
      const head = /^"([^()\\\s]{0,16})\(/.exec(text.slice(i, i + 24));
      if (head) {
        const endMark = ')' + head[1] + '"';
        let e = text.indexOf(endMark, i);
        e = e === -1 ? n : e + endMark.length;
        blank(i, e);
        i = e;
        continue;
      }
    }
    if (isCpp && ch === "'" && i > 0 && /[0-9a-fA-F]/.test(text[i - 1]) && /[0-9a-fA-F]/.test(nx || '')) {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || (ch === '`' && isJs)) {
      const multi = ch === '`' || isPhp;
      let j = i + 1;
      let end = -1;
      while (j < n) {
        const cj = text[j];
        if (cj === '\\') {
          j += 2;
          continue;
        }
        if (cj === ch) {
          end = j + 1;
          break;
        }
        if (cj === '\n' && !multi) break;
        j++;
      }
      if (end < 0) {
        bad.push(i);
        const stop = multi ? n : (j < n ? j : n);
        blank(i, stop);
        i = stop;
        continue;
      }
      blank(i, end);
      i = end;
      continue;
    }
    if (isJs && ch === '/') {
      let p = i - 1;
      while (p >= 0 && (text[p] === ' ' || text[p] === '\t')) p--;
      const prev = p < 0 ? '' : text[p];
      let isRe = p < 0 || '(,=:[!&|?{};+-*%<>~^\n'.indexOf(prev) !== -1;
      if (!isRe && /[A-Za-z_$]/.test(prev)) {
        isRe = /(?:^|[^\w$])(?:return|typeof|case|in|of|yield|await|void|delete|throw|else|do)$/.test(text.slice(Math.max(0, p - 8), p + 1));
      }
      if (isRe) {
        let j = i + 1;
        let inClass = false;
        let ok = false;
        while (j < n) {
          const cj = text[j];
          if (cj === '\\') {
            j += 2;
            continue;
          }
          if (cj === '\n') break;
          if (cj === '[') inClass = true;
          else if (cj === ']') inClass = false;
          else if (cj === '/' && !inClass) {
            ok = true;
            break;
          }
          j++;
        }
        if (ok) {
          j++;
          while (j < n && /[a-z]/i.test(text[j])) j++;
          blank(i, j);
          i = j;
          continue;
        }
      }
    }
    i++;
  }
  let out = '';
  for (let k = 0; k < n; k += 8192) {
    out += String.fromCharCode.apply(null, codes.subarray(k, Math.min(n, k + 8192)));
  }
  return { masked: out, bad };
}

function reportError(c, n, lines, label) {
  const sp = n.startPosition;
  const ep = n.endPosition;
  const line = lines[sp.row] || '';
  const hit = /^\S+/.exec(line.slice(sp.column));
  const tok = hit ? hit[0].slice(0, 24) : '';
  let len = tok.length || 1;
  if (ep.row === sp.row && ep.column > sp.column) len = Math.max(1, Math.min(ep.column - sp.column, 40));
  c.addAt(sp.row + 1, sp.column, len, 'error', tok ? 'Syntax error: unexpected "' + tok + '"' : 'Syntax error', label);
}

function reportMissing(c, n, lines, label) {
  const sp = n.startPosition;
  let row = sp.row;
  let col = sp.column;
  const before = (lines[row] || '').slice(0, col);
  if (!before.trim()) {
    let r = row - 1;
    while (r >= 0 && !(lines[r] || '').trim()) r--;
    if (r >= 0) {
      row = r;
      col = (lines[r] || '').replace(/\s+$/, '').length;
    }
  }
  c.addAt(row + 1, col, 1, 'error', 'Missing "' + n.type + '"', label);
}

async function syntaxErrors(c, lang, text, label, onClean) {
  const parser = await getParser(lang);
  if (!parser) return;
  let tree = null;
  try {
    tree = parser.parse(text);
  } catch (_) {
    return;
  }
  if (!tree) return;
  try {
    const root = tree.rootNode;
    if (!flag(root, 'hasError')) {
      if (onClean) {
        try {
          onClean(root);
        } catch (_) {}
      }
      return;
    }
    const lines = text.split('\n');
    const stack = [root];
    let count = 0;
    while (stack.length && count < 25) {
      const n = stack.pop();
      if (flag(n, 'isMissing')) {
        reportMissing(c, n, lines, label);
        count++;
        continue;
      }
      if (flag(n, 'isError')) {
        reportError(c, n, lines, label);
        count++;
        continue;
      }
      if (!flag(n, 'hasError')) continue;
      const kids = n.children || [];
      for (let k = kids.length - 1; k >= 0; k--) stack.push(kids[k]);
    }
  } finally {
    try {
      tree.delete();
    } catch (_) {}
  }
}

function lintJs(c, text, m, ext, label) {
  rx(/\bdebugger\b/g, m, (x) => c.add(x.index, 8, 'warning', 'Remove the debugger statement', label));
  rx(/\bvar\s+[A-Za-z_$]/g, m, (x) => c.add(x.index, 3, 'info', "Prefer 'let' or 'const' over 'var'", label));
  rx(/(?<![=!<>])==(?!=)|!=(?!=)/g, m, (x) => {
    const end = x.index + x[0].length;
    const after = m.slice(end, end + 12);
    const before = m.slice(Math.max(0, x.index - 12), x.index);
    if (/^\s*(null|undefined)\b/.test(after) || /\b(null|undefined)\s*$/.test(before)) return;
    c.add(x.index, 2, 'warning', "Use '" + x[0] + "=' instead of '" + x[0] + "'", label);
  });
  rx(/\b(?:if|while)\s*\(\s*[A-Za-z_$][\w$.[\]]*\s*=(?![=>])/g, m, (x) => {
    c.add(x.index + x[0].length - 1, 1, 'warning', "Assignment in a condition; did you mean '=='?", label);
  });
  rx(/@ts-ignore/g, text, (x) => c.add(x.index, 9, 'info', "Prefer '@ts-expect-error' so stale suppressions get reported", label));
  rx(/\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g, m, (x) => c.add(x.index, 5, 'info', 'Empty catch block hides errors', label));
  if (ext === 'ts' || ext === 'tsx') {
    rx(/(?::\s*any\b|\bas\s+any\b)/g, m, (x) => c.add(x.index, x[0].length, 'info', "Avoid 'any'; use a specific type or 'unknown'", label));
    rx(/@ts-nocheck/g, text, (x) => c.add(x.index, 11, 'info', 'This turns off type checking for the whole file', label));
  }

  const typeofOk = new Set(['undefined', 'object', 'boolean', 'number', 'string', 'function', 'symbol', 'bigint']);
  rx(/\btypeof\b\s*\(?\s*[\w$.]+\s*\)?\s*[!=]==?\s*(['"`])([^'"`\n]*)\1/g, text, (x) => {
    if (m[x.index] !== 't' || x[1] === '`' || typeofOk.has(x[2])) return;
    const len = x[2].length + 2;
    c.add(x.index + x[0].length - len, len, 'error', "Invalid typeof comparison: '" + x[2] + "' is not a type name (expected undefined, object, boolean, number, string, function, symbol or bigint)", label);
  });
  rx(/[!=]==?\s*NaN\b|\bNaN\s*[!=]==?/g, m, (x) => {
    c.add(x.index, x[0].length, 'error', 'Comparing with NaN never works; use Number.isNaN()', label);
  });
  rx(/(?<![\w$.=!<>+\-*\/%&|^])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*=(?!=)\s*\1\s*(?:;|\n|$)/g, m, (x) => {
    c.add(x.index, x[1].length, 'warning', "Self-assignment: '" + x[1] + "' is assigned to itself", label);
  });
  rx(/\bif\s*\(\s*(?:true|false|null|undefined|0|1)\s*\)/g, m, (x) => c.add(x.index, x[0].length, 'info', 'Constant condition: this if always takes the same branch', label));
  rx(/\bnew\s+Promise\s*\(\s*async\b/g, m, (x) => c.add(x.index, x[0].length, 'warning', 'Promise executor should not be async; errors thrown inside are lost', label));
  rx(/\.forEach\s*\(\s*async\b/g, m, (x) => c.add(x.index + 1, 7, 'warning', 'forEach does not wait for async callbacks; use for...of or Promise.all(map())', label));
  rx(/(?<![\w$.])eval\s*\(/g, m, (x) => c.add(x.index, 4, 'warning', 'eval() is dangerous and slows the engine', label));
  rx(/\bnew\s+Function\s*\(/g, m, (x) => c.add(x.index, x[0].replace(/\s*\($/, '').length, 'info', 'new Function() runs code from a string', label));

  const seenMods = new Map();
  rx(/^[ \t]*import\s+(?!type\b)([^'";]*?)\bfrom\s*(['"])([^'"\n]+)\2/gm, text, (x) => {
    const at = x.index + x[0].indexOf('import');
    if (m[at] !== 'i' || x[1].indexOf('*') !== -1) return;
    const mod = x[3];
    if (!seenMods.has(mod)) {
      seenMods.set(mod, at);
      return;
    }
    let line = 1;
    const first = seenMods.get(mod);
    for (let k = 0; k < first; k++) {
      if (text.charCodeAt(k) === 10) line++;
    }
    const q = x.index + x[0].lastIndexOf(x[2] + mod);
    c.add(q, mod.length + 2, 'warning', "Duplicate import from '" + mod + "'; merge it with the import on line " + line, label);
  });
}

function lintNext(c, text, m, file) {
  const f = file.replace(/\\/g, '/');
  const inApp = /(^|\/)app\//.test(f);
  const base = path.basename(f).replace(/\.[^.]+$/, '');
  const dir = /^\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*(['"])use (client|server)\1/.exec(text);
  const isClient = !!(dir && dir[2] === 'client');
  const SERVER_FILES = new Set(['page', 'layout', 'template', 'default', 'not-found', 'loading']);

  if (inApp && !isClient && SERVER_FILES.has(base)) {
    let n = 0;
    rx(/\b(useState|useEffect|useReducer|useRef|useContext|useLayoutEffect|useCallback|useMemo|useTransition|useRouter|usePathname|useSearchParams)\s*\(/g, m, (x) => {
      if (n++ >= 5) return;
      c.add(x.index, x[1].length, 'error', "'" + x[1] + "' only works in Client Components. Add 'use client' at the top of this file.", 'Next.js');
    });
    let h = 0;
    rx(/\bon(?:Click|Change|Submit|Input|KeyDown|KeyUp|Blur|Focus)\s*=\s*\{/g, m, (x) => {
      if (h++ >= 3) return;
      c.add(x.index, x[0].indexOf('=') > 0 ? x[0].indexOf('=') : 2, 'error', "Event handlers need a Client Component. Add 'use client' or move this into a client component.", 'Next.js');
    });
  }
  if (inApp && !isClient && (base === 'error' || base === 'global-error')) {
    c.addAt(1, 0, 1, 'error', "error files must be Client Components ('use client' at the top)", 'Next.js');
  }
  if (isClient && /export\s+default\s+async\s+function/.test(m)) {
    const i = m.search(/export\s+default\s+async\s+function/);
    c.add(i, 6, 'error', 'Client Components cannot be async functions', 'Next.js');
  }
  if (!dir) {
    const idx = text.search(/^[ \t]*['"]use client['"]/m);
    if (idx !== -1) c.add(idx, 12, 'warning', "'use client' must be at the very top of the file, before any imports", 'Next.js');
  }
  if (inApp) {
    rx(/from\s+['"]next\/router['"]/g, text, (x) => c.add(x.index, x[0].length, 'warning', "Use 'next/navigation' in the App Router", 'Next.js'));
  }
  rx(/<img\b/g, m, (x) => c.add(x.index, 4, 'info', 'Use next/image for optimized images', 'Next.js'));
  rx(/<a\b[^>]*\bhref=["']\/(?!\/)/g, text, (x) => c.add(x.index, 2, 'info', 'Use <Link> from next/link for internal navigation', 'Next.js'));
}

function lintNest(c, text, m) {
  const imported = new Set();
  rx(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g, text, (x) => {
    x[1].split(',').forEach((s) => {
      const name = s.trim().split(/\s+as\s+/).pop().trim();
      if (name) imported.add(name);
    });
  });
  const hasStar = /import\s*\*\s*as\s+\w+\s+from/.test(text);
  const DECOS = ['Controller', 'Injectable', 'Module', 'Get', 'Post', 'Put', 'Delete', 'Patch', 'Body', 'Param', 'Query', 'UseGuards', 'Inject', 'Req', 'Res', 'Headers', 'HttpCode', 'Catch', 'UseInterceptors', 'UsePipes'];
  const seen = new Set();
  if (!hasStar) {
    rx(/@(\w+)\s*\(/g, m, (x) => {
      const name = x[1];
      if (DECOS.indexOf(name) === -1 || imported.has(name) || seen.has(name)) return;
      seen.add(name);
      c.add(x.index + 1, name.length, 'error', "'" + name + "' is not imported (expected from '@nestjs/common')", 'NestJS');
    });
  }
  const hasController = /@Controller\s*\(/.test(m);
  if (!hasController) {
    const route = /@(?:Get|Post|Put|Delete|Patch)\s*\(/.exec(m);
    if (route && !/\b(?:Resolver|WebSocketGateway|Gateway)\b/.test(m)) {
      c.add(route.index + 1, route[0].length - 2, 'warning', 'Route decorator used in a class without @Controller()', 'NestJS');
    }
  }
  const ctrl = /\bclass\s+(\w+Controller)\b/.exec(m);
  if (ctrl && !hasController) {
    c.add(ctrl.index + 6, ctrl[1].length, 'warning', "Class '" + ctrl[1] + "' looks like a controller but has no @Controller()", 'NestJS');
  }
  const svc = /\bclass\s+(\w+Service)\b/.exec(m);
  if (svc && !/@Injectable\s*\(/.test(m)) {
    c.add(svc.index + 6, svc[1].length, 'info', "Class '" + svc[1] + "' has no @Injectable() and cannot be injected", 'NestJS');
  }
}

function lintPython(c, m) {
  rx(/^\s*except\s*:/gm, m, (x) => c.add(x.index + x[0].indexOf('except'), 6, 'warning', "Bare 'except' hides errors; catch specific exceptions", 'Python'));
  rx(/\bdef\s+\w+\s*\([^)]*=\s*(?:\[\]|\{\}|set\(\))/g, m, (x) => c.add(x.index, 3, 'warning', 'Mutable default argument is shared between calls', 'Python'));
  rx(/(?:==|!=)\s*None\b/g, m, (x) => c.add(x.index, x[0].length, 'info', "Use 'is None' or 'is not None'", 'Python'));
  rx(/^\s*from\s+[\w.]+\s+import\s+\*/gm, m, (x) => c.add(x.index + x[0].indexOf('from'), x[0].trim().length, 'info', 'Wildcard import hides where names come from', 'Python'));

  const ls = m.split('\n');
  const tabLines = [];
  const spaceLines = [];
  let mixed = 0;
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (!l.trim()) continue;
    const lead = /^[ \t]+/.exec(l);
    if (!lead) continue;
    const hasTab = lead[0].indexOf('\t') !== -1;
    const hasSp = lead[0].indexOf(' ') !== -1;
    if (hasTab && hasSp) {
      if (mixed++ < 5) c.addAt(i + 1, 0, lead[0].length, 'warning', 'Mixed tabs and spaces in indentation', 'Python');
    } else if (hasTab) {
      tabLines.push(i);
    } else {
      spaceLines.push(i);
    }
  }
  if (tabLines.length && spaceLines.length) {
    const minority = tabLines.length < spaceLines.length ? tabLines : spaceLines;
    for (let k = 0; k < minority.length && k < 3; k++) {
      c.addAt(minority[k] + 1, 0, 1, 'warning', 'Inconsistent indentation: this file uses both tabs and spaces', 'Python');
    }
  }
}

function lintPhp(c, m) {
  rx(/\b(?:var_dump|print_r|var_export)\s*\(/g, m, (x) => c.add(x.index, lenOf(x), 'info', 'Debug output left in code', 'PHP'));
  rx(/\bmysql_[a-z_]+\s*\(/g, m, (x) => c.add(x.index, lenOf(x), 'warning', 'mysql_* functions were removed in PHP 7; use PDO or mysqli', 'PHP'));
  rx(/\beval\s*\(/g, m, (x) => c.add(x.index, 4, 'warning', 'eval() is dangerous and hard to debug', 'PHP'));
  rx(/\becho\s+\$_(?:GET|POST|REQUEST|COOKIE)\b/g, m, (x) => c.add(x.index, x[0].length, 'warning', 'Echoing user input without escaping (XSS); use htmlspecialchars()', 'PHP'));
}

function lintLaravel(c, text, m, file) {
  const f = file.replace(/\\/g, '/');
  rx(/(?<![\w$>:])(?:dd|dump|ray|ddd)\s*\(/g, m, (x) => c.add(x.index, lenOf(x), 'warning', 'Leftover debug call; remove before committing', 'Laravel'));
  if (!/(^|\/)(config|bootstrap)\//.test(f)) {
    rx(/(?<![\w$>:])env\s*\(/g, m, (x) => c.add(x.index, 3, 'warning', 'env() outside config/ returns null once the config is cached; use config()', 'Laravel'));
  }
  rx(/\b(?:DB::raw|whereRaw|selectRaw|orderByRaw|havingRaw|groupByRaw|DB::(?:select|statement|unprepared))\s*\(([^;\n]*)/g, text, (x) => {
    const arg = x[1];
    const danger = /"[^"\n]*\$[A-Za-z_]/.test(arg) || /['"]\s*\.\s*\$/.test(arg);
    if (!danger) return;
    const ls = text.lastIndexOf('\n', x.index) + 1;
    if (/^\s*(\/\/|\*|#)/.test(text.slice(ls, x.index + 1))) return;
    c.add(x.index, lenOf(x), 'warning', 'Possible SQL injection: variables inside raw SQL; use bindings', 'Laravel');
  });
  rx(/(?:::create|->update|->fill|::updateOrCreate|->forceFill)\s*\(\s*\$request->all\(\)/g, m, (x) => c.add(x.index, x[0].length, 'warning', 'Mass assignment from $request->all(); use validated() or only()', 'Laravel'));
  rx(/Route::\w+\s*\([^;]*?(['"])[\w\\]+@\w+\1/g, text, (x) => c.add(x.index, 6, 'info', "'Controller@method' strings are deprecated; use [Controller::class, 'method']", 'Laravel'));
}

function checkBlade(c, text) {
  if (/@verbatim\b/.test(text)) return;
  const OPEN = {
    if: 'endif', unless: 'endunless', isset: 'endisset', auth: 'endauth', guest: 'endguest',
    foreach: 'endforeach', forelse: 'endforelse', for: 'endfor', while: 'endwhile',
    section: 'endsection', push: 'endpush', prepend: 'endprepend', once: 'endonce',
    php: 'endphp', switch: 'endswitch', can: 'endcan', cannot: 'endcannot', env: 'endenv',
    production: 'endproduction', component: 'endcomponent', slot: 'endslot', error: 'enderror',
    session: 'endsession', empty: 'endempty',
  };
  const CLOSE = {};
  for (const k of Object.keys(OPEN)) CLOSE[OPEN[k]] = k;
  CLOSE.stop = 'section';
  CLOSE.show = 'section';
  CLOSE.append = 'section';
  CLOSE.overwrite = 'section';

  const t = text.replace(/\{\{--[\s\S]*?--\}\}/g, (s) => s.replace(/[^\n]/g, ' '));
  const stack = [];
  rx(/(?<![\w@])@(\w+)/g, t, (x) => {
    const name = x[1];
    const idx = x.index;
    const after = t.slice(idx + x[0].length, idx + x[0].length + 80);
    if (OPEN[name]) {
      if (name === 'php' && /^\s*\(/.test(after)) return;
      if (name === 'section' && /^\s*\(\s*(['"])[^'"]*\1\s*,/.test(after)) return;
      if (name === 'empty' && !/^\s*\(/.test(after)) return;
      stack.push({ name, idx });
      return;
    }
    const opener = CLOSE[name];
    if (!opener) return;
    let k = stack.length - 1;
    while (k >= 0 && stack[k].name !== opener) k--;
    if (k < 0) {
      c.add(idx, x[0].length, 'error', '@' + name + ' has no matching @' + opener, 'Blade');
      return;
    }
    if (k !== stack.length - 1) {
      const top = stack[stack.length - 1];
      c.add(idx, x[0].length, 'error', '@' + name + ' found but @' + top.name + ' is not closed yet', 'Blade');
    }
    stack.length = k;
  });
  for (const s of stack.slice(0, 5)) {
    c.add(s.idx, s.name.length + 1, 'error', '@' + s.name + ' is never closed (missing @' + OPEN[s.name] + ')', 'Blade');
  }
  let opens = 0;
  rx(/\{\{(?!--)|\{!!/g, t, (x) => {
    if (opens++ > 200) return;
    const close = x[0] === '{{' ? '}}' : '!!}';
    if (t.indexOf(close, x.index + x[0].length) === -1) {
      c.add(x.index, x[0].length, 'error', "Unclosed '" + x[0] + "' (missing '" + close + "')", 'Blade');
    }
  });
  rx(/\{!!/g, t, (x) => c.add(x.index, 3, 'info', 'Unescaped output; make sure the value is trusted', 'Blade'));
  rx(/(?<![\w@])@(?:dd|dump)\s*\(/g, t, (x) => c.add(x.index, x[0].replace(/\s*\($/, '').length, 'warning', 'Leftover debug directive; remove before committing', 'Blade'));
}

function isClassBrace(m, i) {
  let b = i - 1;
  const stop = Math.max(0, i - 400);
  while (b >= stop) {
    const ch = m.charCodeAt(b);
    if (ch === 59 || ch === 123 || ch === 125) break;
    b--;
  }
  const seg = m.slice(b + 1, i);
  return /(^|[^\w])(?:class|struct|union|enum)\b[^;{}()]*$/.test(seg);
}

function checkClassEnd(c, m, i, n) {
  let j = i + 1;
  while (j < n) {
    const ch = m.charCodeAt(j);
    if (ch === 32 || ch === 9 || ch === 10 || ch === 13) j++;
    else break;
  }
  if (j >= n) {
    c.add(i, 1, 'error', "Expected ';' after class/struct definition", 'C++');
    return;
  }
  const nx = m[j];
  if (nx === ';' || nx === ',' || nx === ')' || nx === '*' || nx === '&') return;
  if (/[A-Za-z_]/.test(nx)) {
    let k = j;
    while (k < n && /[\w:]/.test(m[k])) k++;
    let q = k;
    while (q < n && /\s/.test(m[q])) q++;
    const after = m[q] || '';
    if (after === ';' || after === ',' || after === '[' || after === '=' || after === '{') return;
  }
  c.add(i, 1, 'error', "Expected ';' after class/struct definition", 'C++');
}

function checkCpp(c, text, ext) {
  const mk = mask(text, 'cpp');
  const m = mk.masked;
  const n = m.length;
  for (let k = 0; k < mk.bad.length && k < 5; k++) {
    c.add(mk.bad[k], 1, 'error', 'Unterminated string or character literal', 'C++');
  }

  const lines = text.split('\n');
  const cond = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const inc = /^\s*#\s*include\s*(<[^>\n]*|"[^"\n]*)\s*$/.exec(l);
    if (inc) c.addAt(i + 1, l.indexOf(inc[1]), inc[1].length, 'error', 'Unterminated #include path', 'C++');
    if (/^\s*#\s*(?:if|ifdef|ifndef)\b/.test(l)) {
      cond.push(i);
    } else if (/^\s*#\s*endif\b/.test(l)) {
      if (cond.length) cond.pop();
      else c.addAt(i + 1, 0, l.length, 'error', '#endif without a matching #if', 'C++');
    }
  }
  for (let k = 0; k < cond.length && k < 3; k++) {
    c.addAt(cond[k] + 1, 0, (lines[cond[k]] || '').length, 'error', '#if is never closed (missing #endif)', 'C++');
  }

  const stack = [];
  let reports = 0;
  for (let i = 0; i < n && reports < 5; i++) {
    const code = m.charCodeAt(i);
    if (code === 40 || code === 91 || code === 123) {
      stack.push({ ch: m[i], i, cls: code === 123 && isClassBrace(m, i) });
    } else if (code === 41 || code === 93 || code === 125) {
      const want = code === 41 ? '(' : (code === 93 ? '[' : '{');
      if (!stack.length) {
        c.add(i, 1, 'error', "Unmatched '" + m[i] + "'", 'C++');
        reports++;
        continue;
      }
      const top = stack[stack.length - 1];
      if (top.ch === want) {
        stack.pop();
        if (top.cls) checkClassEnd(c, m, i, n);
        continue;
      }
      let k = stack.length - 2;
      while (k >= 0 && stack[k].ch !== want) k--;
      if (k < 0) {
        c.add(i, 1, 'error', "Unmatched '" + m[i] + "'", 'C++');
        reports++;
        continue;
      }
      c.add(i, 1, 'error', "Expected '" + CLOSE_OF[top.ch] + "' before '" + m[i] + "'", 'C++');
      reports++;
      stack.length = k;
    }
  }
  if (reports < 5) {
    let cnt = 0;
    for (let k = stack.length - 1; k >= 0 && cnt < 3; k--, cnt++) {
      c.add(stack[k].i, 1, 'error', "Unclosed '" + stack[k].ch + "'", 'C++');
    }
  }

  rx(/(?<![\w:.>])gets\s*\(/g, m, (x) => c.add(x.index, 4, 'error', 'gets() is unsafe and was removed in C11; use fgets()', 'C++'));
  rx(/(?<![\w:.>])(?:strcpy|strcat|sprintf)\s*\(/g, m, (x) => {
    const name = lenOf(x);
    c.add(x.index, name, 'warning', x[0].slice(0, name) + '() can overflow buffers; prefer the bounded variant', 'C++');
  });
  if (/^(h|hh|hpp|hxx)$/.test(ext)) {
    rx(/^\s*using\s+namespace\b/gm, m, (x) => c.add(x.index + x[0].indexOf('using'), 5, 'warning', "Avoid 'using namespace' in headers", 'C++'));
    if (!/#\s*pragma\s+once/.test(text) && !/^\s*#\s*ifndef\s+\w+/m.test(text)) {
      c.addAt(1, 0, 1, 'warning', 'Header has no include guard (#pragma once or #ifndef)', 'C++');
    }
  }
}

function checkJson(c, text, file) {
  const base = path.basename(file).toLowerCase();
  const f = file.replace(/\\/g, '/');
  if (/^(tsconfig|jsconfig)/.test(base) || /\.jsonc$/.test(base) || /(^|\/)\.vscode\//.test(f)) return;
  if (/^\s*\/\/|\/\*/m.test(text)) return;
  let ok = false;
  try {
    JSON.parse(text);
    ok = true;
  } catch (e) {
    const raw = String((e && e.message) || 'Invalid JSON');
    let line = 1;
    let col = 0;
    let mm = /line (\d+) column (\d+)/.exec(raw);
    if (mm) {
      line = Number(mm[1]);
      col = Number(mm[2]) - 1;
    } else {
      mm = /position (\d+)/.exec(raw);
      if (mm) {
        const p = posOf(c.starts, Number(mm[1]));
        line = p.line;
        col = p.col;
      }
    }
    const msg = raw.replace(/\s*\(line \d+ column \d+\)/, '').replace(/ in JSON at position \d+/, '').slice(0, 120);
    c.addAt(line, col, 1, 'error', msg, 'JSON');
  }
  if (ok) jsonDupKeys(c, text);
}

async function checkJsFamily(c, text, file, ext, has) {
  if (!has('js', 'nextjs', 'nestjs', 'angular', 'react', 'express')) return;
  const label = ext === 'ts' || ext === 'tsx' ? 'TypeScript' : 'JavaScript';
  const scoped = has('js') && (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') && text.length <= 150000;
  const onClean = scoped ? (root) => require('./ideScope.js').findUndefined(root, text, c) : null;
  if (text.length <= MAX_PARSE) await syntaxErrors(c, JS_LANG[ext], text, label, onClean);
  const m = mask(text, 'js').masked;
  if (has('js')) lintJs(c, text, m, ext, label);
  if (has('nextjs')) lintNext(c, text, m, file);
  if (has('nestjs') && (ext === 'ts' || ext === 'js')) lintNest(c, text, m);
  if (has('angular') && ext === 'ts') lintAngular(c, text, m);
  if (has('react')) {
    const ex = getExtra();
    ex.lintReact(c, text, m);
    if (ex.lintReactMore) ex.lintReactMore(c, text, m);
  }
  if (has('express') && (ext === 'js' || ext === 'ts' || ext === 'mjs' || ext === 'cjs')) getExtra().lintExpress(c, text, m);
}

async function checkPhp(c, text, file, has) {
  if (text.length <= MAX_PARSE) await syntaxErrors(c, 'php', text, 'PHP');
  const m = mask(text, 'php').masked;
  if (has('php')) {
    lintPhp(c, m);
    lintPhpStrict(c, text, m);
  }
  if (has('laravel')) lintLaravel(c, text, m, file);
}
const TAG_RE = /<([A-Za-z][\w:-]*)((?:\s+[^\s=<>"'\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>=`]+))?)*)\s*\/?>/g;

function blankOut(s) {
  return s.replace(/[^\n]/g, ' ');
}

function sliceKeep(text, ranges) {
  let out = '';
  let pos = 0;
  for (const r of ranges) {
    out += blankOut(text.slice(pos, r.start)) + text.slice(r.start, r.end);
    pos = r.end;
  }
  return out + blankOut(text.slice(pos));
}

function lintVueScript(c, m, hasSetup, onlyPlain) {
  rx(/\bdata\s*:\s*\{/g, m, (x) => c.add(x.index, 4, 'error', "'data' must be a function returning an object: data() { return {...} }", 'Vue'));
  if (hasSetup) {
    rx(/\bthis\s*\./g, m, (x) => c.add(x.index, 4, 'warning', "'this' is not available in <script setup>", 'Vue'));
  }
  rx(/\bprops\.\w+\s*=(?![=>])/g, m, (x) => c.add(x.index, x[0].replace(/\s*=$/, '').length, 'warning', 'Props are read-only; emit an event or copy the value instead', 'Vue'));
  if (onlyPlain && !/\bexport\s+default\b/.test(m)) {
    c.addAt(1, 0, 1, 'warning', '<script> has no default export, so the component will be empty', 'Vue');
  }
}

function lintVueTemplate(c, t) {
  rx(TAG_RE, t, (x) => {
    const tag = x[1];
    const attrs = x[2] || '';
    if (/(?:^|\s)v-for\s*=/.test(attrs)) {
      const hasKey = /(?:^|\s)(?::|v-bind:)key\s*=/.test(attrs);
      if (!hasKey && tag !== 'template') c.add(x.index + 1, tag.length, 'warning', 'Elements with v-for need a unique :key', 'Vue');
      if (/(?:^|\s)v-if\s*=/.test(attrs)) c.add(x.index + 1, tag.length, 'warning', 'v-if and v-for on one element behave differently in Vue 2 and 3; wrap one in <template>', 'Vue');
      const idx = /v-for\s*=\s*["']\(\s*[\w$]+\s*,\s*([\w$]+)\s*\)\s+in\b/.exec(attrs);
      const key = /(?::|v-bind:)key\s*=\s*["']([\w$]+)["']/.exec(attrs);
      if (idx && key && idx[1] === key[1]) c.add(x.index + 1, tag.length, 'info', 'Using the array index as :key breaks reordering; use a stable id', 'Vue');
    }
    if (/(?:^|\s)v-html\s*=/.test(attrs)) {
      c.add(x.index + x[0].indexOf('v-html'), 6, 'warning', 'v-html renders raw HTML (XSS risk); only use it with trusted content', 'Vue');
    }
  });
  let n = 0;
  rx(/\{\{/g, t, (x) => {
    if (n++ > 200) return;
    if (t.indexOf('}}', x.index + 2) === -1) c.add(x.index, 2, 'error', "Unclosed '{{' (missing '}}')", 'Vue');
  });
}

async function checkVue(c, text) {
  const clean = text.replace(/<!--[\s\S]*?-->/g, blankOut);
  const scripts = [];
  rx(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, clean, (x) => {
    const start = x.index + x[0].length - x[2].length - 9;
    scripts.push({ attrs: x[1], start, end: start + x[2].length });
  });
  if (/<script\b/i.test(clean) && !scripts.length) {
    c.add(clean.search(/<script\b/i), 7, 'error', 'Unclosed <script> tag (missing </script>)', 'Vue');
  }
  const hasSetup = scripts.some((s) => /\bsetup\b/.test(s.attrs));
  const onlyPlain = scripts.length > 0 && scripts.every((s) => !/\bsetup\b/.test(s.attrs));
  const isTs = scripts.some((s) => /lang\s*=\s*["']?tsx?\b/.test(s.attrs));
  const open = /^<template\b[^>]*>/m.exec(clean);
  let tplEnd = -1;
  rx(/^<\/template>/gm, clean, (x) => {
    tplEnd = x.index;
  });
  if (open && tplEnd < 0) c.add(open.index, 9, 'error', 'Unclosed <template> block (missing </template>)', 'Vue');
  if (scripts.length) {
    const code = sliceKeep(clean, scripts.map((s) => ({ start: s.start, end: s.end })));
    if (code.length <= MAX_PARSE) await syntaxErrors(c, isTs ? 'typescript' : 'javascript', code, 'Vue');
    const m = mask(code, 'js').masked;
    lintJs(c, code, m, isTs ? 'ts' : 'js', 'Vue');
    lintVueScript(c, m, hasSetup, onlyPlain);
  }
  if (open && tplEnd > open.index) {
    lintVueTemplate(c, sliceKeep(clean, [{ start: open.index + open[0].length, end: tplEnd }]));
  }
}

function balancedEnd(m, open) {
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    const ch = m[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lintAngular(c, text, m) {
  const imported = new Set();
  rx(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g, text, (x) => {
    x[1].split(',').forEach((s) => {
      const name = s.trim().split(/\s+as\s+/).pop().trim();
      if (name) imported.add(name);
    });
  });
  const hasStar = /import\s*\*\s*as\s+\w+\s+from/.test(text);
  const DECOS = ['Component', 'Directive', 'Injectable', 'NgModule', 'Pipe', 'Input', 'Output', 'ViewChild', 'ViewChildren', 'ContentChild', 'ContentChildren', 'HostListener', 'HostBinding'];
  const seen = new Set();
  if (!hasStar) {
    rx(/@(\w+)\s*\(/g, m, (x) => {
      const name = x[1];
      if (DECOS.indexOf(name) === -1 || imported.has(name) || seen.has(name)) return;
      seen.add(name);
      c.add(x.index + 1, name.length, 'error', "'" + name + "' is not imported (expected from '@angular/core')", 'Angular');
    });
  }
  rx(/@Component\s*\(/g, m, (x) => {
    const open = x.index + x[0].length - 1;
    const end = balancedEnd(m, open);
    if (end < 0) return;
    const body = m.slice(open, end);
    if (!/\btemplate(?:Url)?\s*:/.test(body)) c.add(x.index + 1, 9, 'error', "@Component needs a 'template' or 'templateUrl'", 'Angular');
  });
  const HOOKS = [['ngOnInit', 'OnInit'], ['ngOnDestroy', 'OnDestroy'], ['ngOnChanges', 'OnChanges'], ['ngAfterViewInit', 'AfterViewInit']];
  for (const h of HOOKS) {
    const hit = new RegExp('\\b' + h[0] + '\\s*\\(').exec(m);
    if (hit && !new RegExp('implements[^{]*\\b' + h[1] + '\\b').test(m)) {
      c.add(hit.index, h[0].length, 'info', 'Class defines ' + h[0] + '() but does not implement ' + h[1], 'Angular');
    }
  }
  if (/@(?:Component|Directive)\s*\(/.test(m) && !/\b(?:unsubscribe|takeUntil|takeUntilDestroyed|DestroyRef|toSignal)\b/.test(m)) {
    let n = 0;
    rx(/\.subscribe\s*\(/g, m, (x) => {
      if (n++ < 3) c.add(x.index + 1, 9, 'info', 'Subscription is never cleaned up; use takeUntilDestroyed(), the async pipe or unsubscribe()', 'Angular');
    });
  }
  const svc = /\bclass\s+(\w+Service)\b/.exec(m);
  if (svc && /\bconstructor\s*\(\s*(?:private|public|protected|readonly)/.test(m) && !/@Injectable\s*\(/.test(m)) {
    c.add(svc.index + 6, svc[1].length, 'warning', "Class '" + svc[1] + "' injects dependencies but has no @Injectable()", 'Angular');
  }
}

function checkAngularHtml(c, text, file) {
  const f = file.replace(/\\/g, '/');
  const looksNg = /\*ng(?:If|For|Switch)|\[\(?ng|<ng-|\(click\)|@(?:if|for|switch)\s*\(/.test(text);
  if (!/\.component\.html$/.test(f) && !looksNg) return;
  const t = text.replace(/<!--[\s\S]*?-->/g, blankOut);
  rx(TAG_RE, t, (x) => {
    const attrs = x[2] || '';
    const hasFor = /(?:^|\s)\*ngFor\s*=/.test(attrs);
    const hasIf = /(?:^|\s)\*ngIf\s*=/.test(attrs);
    if (hasFor && hasIf) {
      c.add(x.index + x[0].indexOf('*ngFor'), 6, 'error', "Cannot use *ngFor and *ngIf on one element; wrap one in <ng-container>", 'Angular');
    }
    if (hasFor) {
      const v = /\*ngFor\s*=\s*"([^"]*)"|\*ngFor\s*=\s*'([^']*)'/.exec(attrs);
      const val = v ? (v[1] !== undefined ? v[1] : v[2]) : '';
      const at = x.index + x[0].indexOf('*ngFor');
      if (!/\blet\s+[\w$]+\s+of\b/.test(val)) c.add(at, 6, 'error', "*ngFor expects 'let item of items'", 'Angular');
      else if (!/trackBy/.test(val)) c.add(at, 6, 'info', 'Add trackBy to *ngFor so Angular can reuse DOM nodes', 'Angular');
    }
    if (/(?:^|\s)\[innerHTML\]\s*=/.test(attrs)) {
      c.add(x.index + x[0].indexOf('[innerHTML]'), 11, 'info', '[innerHTML] renders raw HTML; make sure the value is trusted', 'Angular');
    }
  });
  rx(/@for\s*\(([^)]*)\)/g, t, (x) => {
    if (!/;\s*track\b/.test(x[1])) c.add(x.index, 4, 'error', "@for requires a 'track' expression", 'Angular');
  });
  let n = 0;
  rx(/\{\{/g, t, (x) => {
    if (n++ > 200) return;
    if (t.indexOf('}}', x.index + 2) === -1) c.add(x.index, 2, 'error', "Unclosed '{{' (missing '}}')", 'Angular');
  });
}

function jsonDupKeys(c, text) {
  const stack = [];
  let expectKey = false;
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') {
        if (text[j] === '\\') j++;
        j++;
      }
      const top = stack.length ? stack[stack.length - 1] : null;
      if (expectKey && top) {
        const key = text.slice(i + 1, j);
        if (top.has(key)) c.add(i, j + 1 - i, 'warning', "Duplicate key '" + key + "'; only the last value is used", 'JSON');
        top.add(key);
        expectKey = false;
      }
      i = j + 1;
      continue;
    }
    if (ch === '{') {
      stack.push(new Set());
      expectKey = true;
    } else if (ch === '[') {
      stack.push(null);
      expectKey = false;
    } else if (ch === '}' || ch === ']') {
      stack.pop();
      expectKey = false;
    } else if (ch === ',') {
      expectKey = stack.length > 0 && stack[stack.length - 1] !== null;
    } else if (ch === ':') {
      expectKey = false;
    }
    i++;
  }
}

function lintPythonStrict(c, text, m, file) {
  const L = 'Python';
  rx(/(?:==|!=)\s*(?:True|False)\b/g, m, (x) => c.add(x.index, x[0].length, 'info', 'Avoid comparing with True or False using ==; test the value directly', L));
  rx(/\bassert\s*\([^()\n]*,[^()\n]*\)\s*$/gm, m, (x) => c.add(x.index, 6, 'warning', 'Assertion on a tuple is always true; remove the parentheses', L));
  rx(/(?<![\w.])is\s+(?:not\s+)?(?:-?\d|['"]|[bBrRfFuU]{1,2}['"])/g, text, (x) => {
    if (m[x.index] !== 'i') return;
    c.add(x.index, 2, 'warning', "Use '==' to compare with a literal; 'is' compares identity", L);
  });
  rx(/^[ \t]*except\b[^\n]*:[ \t]*\n[ \t]*pass[ \t]*$/gm, m, (x) => {
    c.add(x.index + x[0].indexOf('except'), 6, 'info', 'Exception is silently swallowed; handle or log it', L);
  });
  rx(/(?<![\w.])([rR]?[fF][rR]?)(['"])((?:(?!\2)[^\\\n{}]|\\.)*)\2/g, text, (x) => {
    if (m[x.index] === ' ' || x[3] === '') return;
    if (text[x.index + x[0].length] === x[2]) return;
    c.add(x.index, x[1].length, 'info', "f-string has no placeholders; remove the 'f' prefix", L);
  });

  const lineOf = (idx) => {
    let line = 1;
    for (let k = 0; k < idx; k++) {
      if (text.charCodeAt(k) === 10) line++;
    }
    return line;
  };

  const defs = new Map();
  rx(/^((?:@[^\n]*\n)*)(?:async\s+)?(def|class)\s+(\w+)/gm, m, (x) => {
    if (x[1]) return;
    const name = x[3];
    const at = x.index + x[0].lastIndexOf(name);
    if (defs.has(name)) {
      c.add(at, name.length, 'warning', "'" + name + "' is already defined on line " + lineOf(defs.get(name)), L);
    } else {
      defs.set(name, at);
    }
  });

  if (/__all__/.test(text) || /(^|\/)__init__\.py$/.test(file)) return;
  const imps = [];
  rx(/^(?:import\s+([^\n]+)|from\s+([\w.]+)\s+import\s+(\([^)]*\)|[^\n]+))/gm, m, (x) => {
    if (/\\\s*$/.test(x[0])) return;
    if (x[1] !== undefined) {
      for (const part of x[1].split(',')) {
        const mm = /^\s*([\w.]+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
        if (!mm) continue;
        const name = mm[2] || mm[1].split('.')[0];
        imps.push({ name, idx: x.index + Math.max(0, x[0].indexOf(mm[2] || mm[1])) });
      }
      return;
    }
    if (x[2] === '__future__') return;
    const body = x[3].replace(/[()\\]/g, ' ');
    for (const part of body.split(',')) {
      const mm = /^\s*(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
      if (!mm) continue;
      const name = mm[2] || mm[1];
      imps.push({ name, idx: x.index + Math.max(0, x[0].lastIndexOf(name)) });
    }
  });
  if (!imps.length) return;
  const stripped = text.replace(/^(?:import\s+[^\n]+|from\s+[\w.]+\s+import\s+(?:\([^)]*\)|[^\n]+))/gm, (s) => s.replace(/[^\n]/g, ' '));
  let shown = 0;
  for (const imp of imps) {
    if (shown >= 15) break;
    if (new RegExp('(?<![\\w.])' + imp.name + '(?![\\w])').test(stripped)) continue;
    shown++;
    c.add(imp.idx, imp.name.length, 'info', "'" + imp.name + "' is imported but never used", L);
  }
}

function lintPhpStrict(c, text, m) {
  const L = 'PHP';
  rx(/(?<![\w$>:])(?:exec|shell_exec|system|passthru|popen|proc_open)\s*\([^;\n]*\$/g, text, (x) => {
    if (m[x.index] === ' ') return;
    c.add(x.index, lenOf(x), 'warning', 'Shell command built from a variable (command injection risk); use escapeshellarg()', L);
  });
  rx(/\b(?:include|include_once|require|require_once)\b\s*\(?\s*\$_(?:GET|POST|REQUEST|COOKIE)/g, m, (x) => {
    c.add(x.index, x[0].indexOf('$_') > 0 ? x[0].indexOf('$_') : 7, 'warning', 'Including a file chosen by user input allows file inclusion attacks', L);
  });
  rx(/\bunserialize\s*\(\s*\$_(?:GET|POST|REQUEST|COOKIE)/g, m, (x) => {
    c.add(x.index, 11, 'warning', 'unserialize() on request data can run attacker-controlled code', L);
  });
  rx(/@\s*(?:\$|[A-Za-z_]\w*\s*\()/g, m, (x) => {
    c.add(x.index, 1, 'info', 'The @ operator hides errors; check the result instead', L);
  });
  rx(/(?<![\w$>:])extract\s*\(/g, m, (x) => c.add(x.index, 7, 'info', 'extract() creates variables from array keys and is easy to abuse', L));
  rx(/\$\$[A-Za-z_{]/g, m, (x) => c.add(x.index, 2, 'info', 'Variable variables make code hard to follow', L));
}

function lintCppStrict(c, text, ext) {
  const m = mask(text, 'cpp').masked;
  const L = 'C++';
  rx(/(?<![\w:.>])printf\s*\(\s*[A-Za-z_]\w*\s*\)/g, m, (x) => {
    c.add(x.index, 6, 'warning', 'printf with a non-literal format string is a format-string vulnerability; use printf("%s", value)', L);
  });
  rx(/(?<![\w:.>])scanf\s*\(\s*"[^"\n]*%s/g, text, (x) => {
    if (m[x.index] !== 's') return;
    c.add(x.index, 5, 'warning', 'scanf with %s has no length limit (buffer overflow); use a width like %31s or fgets()', L);
  });
  rx(/(?<![\w:.>])system\s*\(/g, m, (x) => c.add(x.index, 6, 'info', 'system() runs a shell; avoid it with untrusted input', L));
  rx(/\bif\s*\(\s*[A-Za-z_]\w*\s*=(?!=)/g, m, (x) => {
    c.add(x.index + x[0].length - 1, 1, 'warning', "Assignment in a condition; did you mean '=='?", L);
  });
  if (/^(cc|cpp|cxx|hpp|hh|hxx)$/.test(ext)) {
    rx(/\bNULL\b/g, m, (x) => c.add(x.index, 4, 'info', 'Prefer nullptr over NULL in C++', L));
  }
}
async function diagnose(args) {
  const text = args && typeof args.text === 'string' ? args.text : '';
  if (!text || text.length > MAX_TEXT) return [];
  const exts = Array.isArray(args.exts) ? args.exts : [];
  const has = (...ids) => ids.some((id) => exts.indexOf(id) !== -1);
  const file = String(args.file || '').replace(/\\/g, '/');
  const ext = extName(file);
  const c = makeCtx(text);
  try {
    if (ext === 'json') {
      if (has('js')) checkJson(c, text, file);
    } else if (JS_LANG[ext]) {
      await checkJsFamily(c, text, file, ext, has);
    } else if (ext === 'vue') {
      if (has('vue')) await checkVue(c, text);
    } else if (ext === 'astro') {
      if (has('astro')) await getExtra().checkAstro(c, text, file);
    } else if (ext === 'html' || ext === 'htm') {
      if (has('angular')) checkAngularHtml(c, text, file);
    } else if (ext === 'py' || ext === 'pyw') {
      if (has('python', 'flask', 'django')) {
        if (text.length <= MAX_PARSE) await syntaxErrors(c, 'python', text, 'Python');
        const m = mask(text, 'py').masked;
        if (has('python')) {
          lintPython(c, m);
          lintPythonStrict(c, text, m, file);
        }
        if (has('flask')) getExtra().lintFlask(c, text, m);
        if (has('django')) getExtra().lintDjango(c, text, m, file);
      }
    } else if (ext === 'blade') {
      if (has('laravel')) checkBlade(c, text);
    } else if (ext === 'php') {
      if (has('php', 'laravel')) await checkPhp(c, text, file, has);
    } else if (ext === 'cs') {
      if (has('dotnet')) getExtra().checkCs(c, text);
    } else if (CPP_EXT.has(ext)) {
      if (has('cpp')) {
        checkCpp(c, text, ext);
        lintCppStrict(c, text, ext);
      }
    }
  } catch (_) {}
  return c.diags.sort((a, b) => (a.line - b.line) || (a.col - b.col));
}

module.exports = { diagnose };