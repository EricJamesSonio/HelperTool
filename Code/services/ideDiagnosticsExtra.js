'use strict';

const MAX_SCAN = 4000;
const CLOSE_OF = { '(': ')', '[': ']', '{': '}' };

let core = null;

function useCore(c) {
  core = c;
}

function blank(s) {
  return s.replace(/[^\n]/g, ' ');
}

function scanCall(m, open) {
  let depth = 0;
  let commas = 0;
  const lim = Math.min(m.length, open + MAX_SCAN);
  for (let i = open; i < lim; i++) {
    const ch = m.charCodeAt(i);
    if (ch === 40 || ch === 91 || ch === 123) {
      depth++;
    } else if (ch === 41 || ch === 93 || ch === 125) {
      depth--;
      if (depth === 0) return { end: i, commas };
      if (depth < 0) return null;
    } else if (ch === 44 && depth === 1) {
      commas++;
    }
  }
  return null;
}

function braceEnd(m, open) {
  let depth = 0;
  const lim = Math.min(m.length, open + 20000);
  for (let i = open; i < lim; i++) {
    const ch = m.charCodeAt(i);
    if (ch === 123) {
      depth++;
    } else if (ch === 125) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function tagEnd(m, start) {
  let depth = 0;
  const lim = Math.min(m.length, start + 1500);
  for (let j = start + 1; j < lim; j++) {
    const ch = m.charCodeAt(j);
    if (ch === 123) {
      depth++;
    } else if (ch === 125) {
      depth--;
      if (depth < 0) return -1;
    } else if (depth === 0) {
      if (ch === 62 && m.charCodeAt(j - 1) !== 61) return j;
      if (ch === 60 || ch === 59) return -1;
    }
  }
  return -1;
}

/* ───────────────────────── React ───────────────────────── */

function lintReact(c, text, m) {
  const L = 'React';
  const add = (i, len, sev, msg) => c.add(i, len, sev, msg, L);
  const HOOKS = 'use(?:State|Effect|LayoutEffect|Memo|Callback|Ref|Context|Reducer|ImperativeHandle|Transition)';

  let n = 0;
  const cond = new RegExp('\\b(?:if|for|while)\\s*\\([^()\\n]*\\)\\s*\\{?\\s*[^;\\n]*\\b(' + HOOKS + ')\\s*\\(', 'g');
  core.rx(cond, m, (x) => {
    if (n++ >= 5) return;
    add(x.index + x[0].lastIndexOf(x[1]), x[1].length, 'error', 'Hooks must not be called inside conditions or loops');
  });

  core.rx(new RegExp('\\b(' + HOOKS + ')\\s*\\(', 'g'), m, (x) => {
    const open = x.index + x[0].length - 1;
    const info = scanCall(m, open);
    if (!info || info.commas > 0) return;
    const name = x[1];
    if (name === 'useEffect' || name === 'useLayoutEffect') {
      add(x.index, name.length, 'info', name + ' has no dependency array, so it runs after every render');
    } else if (name === 'useMemo' || name === 'useCallback') {
      add(x.index, name.length, 'warning', name + ' needs a dependency array to be useful');
    }
  });

  core.rx(/\buse(?:Layout)?Effect\s*\(\s*async\b/g, m, (x) => {
    add(x.index, x[0].indexOf('(') > 0 ? x[0].indexOf('(') : 9, 'error', 'Effect callbacks cannot be async; define an async function inside and call it');
  });

  core.rx(/\bthis\.state\.[\w$]+\s*=(?!=)/g, m, (x) => {
    add(x.index, x[0].length, 'warning', 'Do not mutate state directly; use setState');
  });

  core.rx(/\bdangerouslySetInnerHTML\b/g, m, (x) => {
    add(x.index, x[0].length, 'warning', 'Renders raw HTML (XSS risk); only use it with trusted content');
  });

  core.rx(/\bkey\s*=\s*\{\s*(?:i|idx|index)\s*\}/g, m, (x) => {
    add(x.index, x[0].length, 'info', 'Using the array index as key breaks reordering; use a stable id');
  });

  core.rx(/\bon[A-Z]\w*\s*=\s*\{\s*[A-Za-z_$][\w$.]*\([^()]*\)\s*\}/g, m, (x) => {
    add(x.index, x[0].indexOf('=') > 0 ? x[0].indexOf('=') : 2, 'info', 'This calls the function during render, not on the event; wrap it in () => ...');
  });

  core.rx(/\.map\s*\(/g, m, (x) => {
    const open = x.index + x[0].length - 1;
    const info = scanCall(m, open);
    if (!info) return;
    const body = m.slice(open, info.end);
    const jsx = /=>\s*\(?\s*<([A-Za-z][\w.]*)|\breturn\s*\(?\s*<([A-Za-z][\w.]*)/.exec(body);
    if (!jsx) return;
    const name = jsx[1] || jsx[2];
    const at = open + jsx.index + jsx[0].lastIndexOf('<');
    const end = tagEnd(m, at);
    if (end < 0) return;
    const tagText = m.slice(at, end);
    if (!/(?:^|\s)key\s*=/.test(tagText)) {
      add(at + 1, name.length, 'warning', 'Elements rendered in a list need a unique key');
    }
  });

  let guard = 0;
  core.rx(/(?<![\w$)\]])<([A-Za-z][\w.]*)(?=[\s/>])/g, m, (x) => {
    if (guard++ > 600) return;
    const tag = x[1];
    if (!/^[a-z]/.test(tag)) return;
    const end = tagEnd(m, x.index);
    if (end < 0) return;
    const base = x.index + x[0].length;
    const attrs = m.slice(base, end);
    let hit = /(?:^|\s)class\s*=/.exec(attrs);
    if (hit) add(base + hit.index + hit[0].indexOf('class'), 5, 'warning', "Use 'className' instead of 'class' in JSX");
    hit = /(?:^|\s)for\s*=/.exec(attrs);
    if (hit && tag === 'label') add(base + hit.index + hit[0].indexOf('for'), 3, 'warning', "Use 'htmlFor' instead of 'for' in JSX");
    hit = /(?:^|\s)(on[a-z]+)\s*=/.exec(attrs);
    if (hit && ['onclick', 'onchange', 'onsubmit', 'oninput', 'onkeydown', 'onkeyup', 'onblur', 'onfocus'].indexOf(hit[1]) !== -1) {
      add(base + hit.index + hit[0].indexOf(hit[1]), hit[1].length, 'warning', 'React event props are camelCase, e.g. onClick');
    }
    if (tag === 'img' && !/(?:^|\s)alt\b/.test(attrs)) {
      add(x.index + 1, 3, 'info', 'Image has no alt text');
    }
  });
}

/* ───────────────────────── Express ───────────────────────── */

function lintExpress(c, text, m) {
  const L = 'Express';
  const isApp = /\bexpress\s*\(\s*\)/.test(m);
  const routed = /\b(?:app|router|api|routes)\.(?:get|post|put|delete|patch|use|all)\s*\(/.test(m);
  if (!isApp && !routed && !/\bRouter\s*\(/.test(m)) return;

  core.rx(/\.use\s*\(\s*(?:async\s*)?(?:function\s*\w*\s*)?\(\s*(err\w*|error)\s*,\s*\w+\s*,\s*\w+\s*\)/g, m, (x) => {
    c.add(x.index + x[0].indexOf(x[1]), x[1].length, 'error', 'Error-handling middleware needs 4 parameters (err, req, res, next) or Express will not treat it as one', L);
  });

  if (isApp && /\breq\.body\b/.test(m) && !/\bexpress\s*\.\s*(?:json|urlencoded)\b|bodyParser|body-parser|multer|busboy|formidable/.test(text)) {
    const at = m.search(/\breq\.body\b/);
    c.add(at, 8, 'warning', 'req.body is undefined unless express.json() or express.urlencoded() is registered', L);
  }

  core.rx(/\bres\.(?:send|write)\s*\(\s*req\.(?:query|params|body)\b/g, m, (x) => {
    c.add(x.index, x[0].length, 'warning', 'Sending request input straight back allows reflected XSS; escape it or return JSON', L);
  });

  let sql = 0;
  core.rx(/(?:CommandText\s*=|\.(?:query|execute|raw)\s*\()\s*(?:`[^`]*\$\{[^`]*`|(['"])[^'"\n]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^'"\n]*\1\s*\+)/gi, text, (x) => {
    if (sql++ >= 5) return;
    if (!/\b(?:SELECT|INSERT|UPDATE|DELETE|WHERE)\b/i.test(x[0])) return;
    c.add(x.index, Math.min(x[0].length, 12), 'warning', 'SQL built from a string with variables; use parameterized queries', L);
  });

  core.rx(/\bcors\s*\(\s*\)/g, m, (x) => {
    c.add(x.index, 4, 'info', 'cors() allows every origin; restrict the origin in production', L);
  });

  core.rx(/\bjwt\.(?:sign|verify)\s*\([^;]*?,\s*(['"])[^'"\n]{1,60}\1/g, text, (x) => {
    c.add(x.index, 8, 'warning', 'Hardcoded JWT secret; read it from the environment', L);
  });

  core.rx(/\bres\.status\s*\(\s*\d{3}\s*\)\s*;/g, m, (x) => {
    c.add(x.index, 10, 'warning', 'res.status() alone does not send a response; chain .send(), .json() or .end()', L);
  });

  core.rx(/\b(?:app|router|api|routes)\.(?:get|post|put|delete|patch)\s*\(\s*(['"`])(?![\/*(\[])[^'"`\n]*\1/g, text, (x) => {
    c.add(x.index + x[0].indexOf(x[1]), 1, 'warning', "Route path should start with '/'", L);
  });

  const hasAsyncGuard = /express-async-errors|asyncHandler|catchAsync|wrapAsync|express-async-handler/.test(text);
  if (!hasAsyncGuard && !/\btry\s*\{/.test(m) && !/\.catch\s*\(/.test(m)) {
    const hit = /\.(?:get|post|put|delete|patch)\s*\([^;]*?\basync\b/.exec(text);
    if (hit) {
      c.add(hit.index + 1, 3, 'info', 'Async handlers do not forward rejections in Express 4; use try/catch or an async wrapper', L);
    }
  }

  const seen = new Set();
  core.rx(/\b(app|router|api|routes)\.(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"`\n]+)\3/g, text, (x) => {
    const key = x[1] + ' ' + x[2] + ' ' + x[4];
    if (seen.has(key)) {
      c.add(x.index, x[0].indexOf('('), 'info', 'This route is already defined above; only the first matching handler runs', L);
    }
    seen.add(key);
  });
}

/* ───────────────────────── Astro ───────────────────────── */

async function checkAstro(c, text, file) {
  const L = 'Astro';
  const open = /^---[ \t]*\r?\n/.exec(text);
  let tplStart = 0;
  if (open) {
    const re = /\r?\n---[ \t]*(?=\r?\n|$)/g;
    re.lastIndex = open[0].length - 1;
    const close = re.exec(text);
    if (!close) {
      c.add(0, 3, 'error', 'Frontmatter fence is never closed (missing closing ---)', L);
      return;
    }
    const codeStart = open[0].length;
    const codeEnd = close.index;
    const code = core.sliceKeep(text, [{ start: codeStart, end: codeEnd }]);
    if (code.length <= 450000) await core.syntaxErrors(c, 'typescript', code, L);
    const fm = core.mask(code, 'js').masked;
    core.lintJs(c, code, fm, 'ts', L);
    tplStart = close.index + close[0].length;
  }

  const clean = text.replace(/<!--[\s\S]*?-->/g, blank);
  let tpl = core.sliceKeep(clean, [{ start: tplStart, end: clean.length }]);

  const openScripts = (tpl.match(/<script\b[^>]*[^/]>/gi) || []).length;
  const closeScripts = (tpl.match(/<\/script\s*>/gi) || []).length;
  if (openScripts > closeScripts) {
    const at = tpl.search(/<script\b/i);
    c.add(at < 0 ? 0 : at, 7, 'error', 'Unclosed <script> tag (missing </script>)', L);
  }
  const openStyles = (tpl.match(/<style\b[^>]*[^/]>/gi) || []).length;
  const closeStyles = (tpl.match(/<\/style\s*>/gi) || []).length;
  if (openStyles > closeStyles) {
    const at = tpl.search(/<style\b/i);
    c.add(at < 0 ? 0 : at, 6, 'error', 'Unclosed <style> tag (missing </style>)', L);
  }

  tpl = tpl.replace(/<(script|style)\b([^>]*)>([\s\S]*?)(<\/\1\s*>)/gi, (all, tag, attrs, body, closing) => {
    return '<' + tag + attrs + '>' + blank(body) + closing;
  });

  const VALID = ['load', 'idle', 'visible', 'media', 'only'];
  let guard = 0;
  const tagRe = /<([A-Za-z][\w.:-]*)((?:[^<>"'{}]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g;
  core.rx(tagRe, tpl, (x) => {
    if (guard++ > 800) return;
    const tag = x[1];
    const attrs = x[2] || '';
    const base = x.index + 1 + tag.length;
    const isHtml = /^[a-z]/.test(tag) && tag.indexOf('-') === -1;
    const dir = /(?:^|\s)client:([\w-]+)(\s*=)?/.exec(attrs);
    if (dir) {
      const at = base + dir.index + dir[0].indexOf('client:');
      if (VALID.indexOf(dir[1]) === -1) {
        c.add(at, 7 + dir[1].length, 'error', "Unknown directive 'client:" + dir[1] + "'; use load, idle, visible, media or only", L);
      } else if (isHtml) {
        c.add(at, 7 + dir[1].length, 'warning', 'client:* directives only work on framework components, not on plain HTML elements', L);
      } else if ((dir[1] === 'media' || dir[1] === 'only') && !dir[2]) {
        c.add(at, 7 + dir[1].length, 'error', dir[1] === 'media' ? 'client:media needs a media query value' : 'client:only needs the framework name, e.g. client:only="react"', L);
      }
    }
    const setHtml = /(?:^|\s)set:html\b/.exec(attrs);
    if (setHtml) {
      c.add(base + setHtml.index + setHtml[0].indexOf('set:html'), 8, 'info', 'set:html injects raw HTML; make sure the value is trusted', L);
    }
    if (tag === 'img' && !/(?:^|\s)alt\b/.test(attrs)) {
      c.add(x.index + 1, 3, 'info', 'Image has no alt text', L);
    }
  });

  const f = file.replace(/\\/g, '/');
  const name = f.split('/').pop();
  if (/\/pages\//.test(f) && /^\[.+\]\.astro$/.test(name) && !/\bgetStaticPaths\b/.test(text) && !/\bprerender\s*=\s*false\b/.test(text)) {
    c.addAt(1, 0, 1, 'info', 'Dynamic route without getStaticPaths(); it only works with server output (SSR)', L);
  }
}

/* ───────────────────────── Python frameworks ───────────────────────── */

function sqlPy(c, text, L) {
  let n = 0;
  core.rx(/\.(execute|executemany|raw|extra)\s*\(\s*(?:[rR]?f['"]|[rR]?['"][^'"\n]*['"]\s*(?:%|\+|\.format))/g, text, (x) => {
    if (n++ >= 5) return;
    c.add(x.index + 1, x[1].length, 'warning', 'SQL built from a string; pass parameters instead (injection risk)', L);
  });
}

function flaskNames(text) {
  if (/^[ \t]*import\s+flask\b/m.test(text)) return null;
  const names = new Set();
  let found = false;
  let star = false;
  core.rx(/^[ \t]*from\s+flask\s+import\s+(\([^)]*\)|[^\n]*)/gm, text, (x) => {
    found = true;
    const body = x[1].replace(/#[^\n]*/g, ' ').replace(/[()\\]/g, ' ');
    if (body.indexOf('*') !== -1) star = true;
    body.split(',').forEach((s) => {
      const nm = s.trim().split(/\s+as\s+/).pop().trim();
      if (nm) names.add(nm);
    });
  });
  return found && !star ? names : null;
}

function lintFlask(c, text, m) {
  const L = 'Flask';

  core.rx(/\.run\s*\([^)\n]*\bdebug\s*=\s*True\b/g, m, (x) => {
    c.add(x.index + x[0].indexOf('debug'), 5, 'warning', 'debug=True exposes the interactive debugger; never ship it', L);
  });

  const seen = new Set();
  core.rx(/@(\w+)\.(?:route|get|post|put|delete|patch)\s*\([^\n]*\)\s*\n(?:[ \t]*@[^\n]*\n)*[ \t]*(?:async\s+)?def\s+(\w+)/g, m, (x) => {
    const key = x[1] + ':' + x[2];
    if (seen.has(key)) {
      c.add(x.index + x[0].lastIndexOf(x[2]), x[2].length, 'error', "View function '" + x[2] + "' is already defined; Flask raises an endpoint overwrite error", L);
    }
    seen.add(key);
  });

  core.rx(/\brender_template_string\s*\(\s*(?:f['"]|[^)'"\n]*\+|['"][^'"\n]*['"]\s*(?:%|\.format))/g, text, (x) => {
    c.add(x.index, 22, 'warning', 'render_template_string with dynamic input allows template injection; use render_template', L);
  });

  core.rx(/\bsecret_key\s*=\s*['"][^'"\n]+['"]|\bconfig\[['"]SECRET_KEY['"]\]\s*=\s*['"][^'"\n]+['"]/gi, text, (x) => {
    c.add(x.index, 10, 'info', 'Hardcoded secret key; read it from the environment', L);
  });

  sqlPy(c, text, L);

  const names = flaskNames(text);
  if (!names) return;
  const USES = [
    ['jsonify', /(?<![\w.])jsonify\s*\(/],
    ['render_template', /(?<![\w.])render_template\s*\(/],
    ['redirect', /(?<![\w.])redirect\s*\(/],
    ['url_for', /(?<![\w.])url_for\s*\(/],
    ['abort', /(?<![\w.])abort\s*\(/],
    ['flash', /(?<![\w.])flash\s*\(/],
    ['make_response', /(?<![\w.])make_response\s*\(/],
  ];
  for (const u of USES) {
    if (names.has(u[0])) continue;
    if (new RegExp('\\bdef\\s+' + u[0] + '\\b').test(m)) continue;
    const hit = u[1].exec(m);
    if (hit) c.add(hit.index, u[0].length, 'error', "'" + u[0] + "' is not imported from flask", L);
  }
  const rq = /(?<![\w.])request\s*\./.exec(m);
  if (rq && !names.has('request')
    && !/\bdef\s+\w+\s*\([^)]*\brequest\b/.test(m)
    && !/(?<![\w.])request\s*=[^=]/.test(m)
    && !/\bimport\s+[^\n]*\brequest\b/.test(m)) {
    c.add(rq.index, 7, 'error', "'request' is not imported from flask", L);
  }
}

function lintDjango(c, text, m, file) {
  const L = 'Django';
  const base = file.split('/').pop();

  if (/^settings(?:_\w+)?\.py$/.test(base) || /\/settings\//.test(file)) {
    core.rx(/^[ \t]*DEBUG\s*=\s*True\b/gm, m, (x) => {
      c.add(x.index + x[0].indexOf('DEBUG'), 5, 'warning', 'DEBUG = True must be off in production', L);
    });
    core.rx(/ALLOWED_HOSTS\s*=\s*\[\s*['"]\*['"]/g, text, (x) => {
      c.add(x.index, 13, 'warning', "ALLOWED_HOSTS = ['*'] accepts any Host header", L);
    });
    core.rx(/^[ \t]*SECRET_KEY\s*=\s*['"][^'"\n]{8,}['"]/gm, text, (x) => {
      c.add(x.index + x[0].indexOf('SECRET_KEY'), 10, 'info', 'Hardcoded SECRET_KEY; read it from the environment', L);
    });
  }

  core.rx(/@csrf_exempt\b/g, m, (x) => {
    c.add(x.index, x[0].length, 'warning', 'csrf_exempt disables CSRF protection for this view', L);
  });

  core.rx(/(?<![\w.])mark_safe\s*\(/g, m, (x) => {
    c.add(x.index, 9, 'info', 'mark_safe skips escaping; only use it on trusted content', L);
  });

  if (base === 'urls.py' || /\burlpatterns\b/.test(m)) {
    core.rx(/(?<![\w.])url\s*\(\s*r?['"]/g, text, (x) => {
      c.add(x.index, 3, 'warning', 'url() was removed in Django 4.0; use path() or re_path()', L);
    });
    core.rx(/from\s+django\.conf\.urls\s+import[^\n]*\burl\b/g, text, (x) => {
      c.add(x.index, x[0].length, 'warning', 'django.conf.urls.url was removed in Django 4.0', L);
    });
  }

  if (/\bdjango\.db\b/.test(text)) {
    const FIELDS = 'CharField|SlugField|EmailField|URLField|TextField|ForeignKey|OneToOneField';
    core.rx(new RegExp('(?<![\\w.])(?:models\\.)?(' + FIELDS + ')\\s*\\(', 'g'), m, (x) => {
      const open = x.index + x[0].length - 1;
      const info = scanCall(m, open);
      if (!info) return;
      const body = m.slice(open, info.end);
      const name = x[1];
      const at = x.index + x[0].indexOf(name);
      if ((name === 'CharField' || name === 'SlugField' || name === 'EmailField' || name === 'URLField') && name === 'CharField' && !/\bmax_length\b/.test(body)) {
        c.add(at, name.length, 'error', 'CharField requires max_length', L);
      }
      if ((name === 'ForeignKey' || name === 'OneToOneField') && !/\bon_delete\b|\b(?:CASCADE|PROTECT|SET_NULL|SET_DEFAULT|DO_NOTHING|RESTRICT)\b|\bSET\s*\(/.test(body)) {
        c.add(at, name.length, 'error', name + ' requires on_delete', L);
      }
      if ((name === 'CharField' || name === 'TextField' || name === 'SlugField' || name === 'EmailField' || name === 'URLField') && /\bnull\s*=\s*True\b/.test(body)) {
        c.add(at, name.length, 'info', 'Avoid null=True on text fields; use blank=True so there is a single empty value', L);
      }
    });
  }

  sqlPy(c, text, L);
}

/* ───────────────────────── C# / .NET ───────────────────────── */

function maskCs(text) {
  const n = text.length;
  const codes = new Uint16Array(n);
  for (let k = 0; k < n; k++) codes[k] = text.charCodeAt(k);
  const bad = [];
  const wipe = (a, b) => {
    for (let k = a; k < b; k++) {
      const ch = codes[k];
      if (ch !== 10 && ch !== 13) codes[k] = 32;
    }
  };
  let i = 0;
  let lineStart = true;
  while (i < n) {
    const ch = text[i];
    const nx = text[i + 1];
    if (ch === '\n') {
      lineStart = true;
      i++;
      continue;
    }
    if (lineStart) {
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        i++;
        continue;
      }
      lineStart = false;
      if (ch === '#') {
        let e = text.indexOf('\n', i);
        if (e === -1) e = n;
        wipe(i, e);
        i = e;
        continue;
      }
    }
    if (ch === '/' && nx === '/') {
      let e = text.indexOf('\n', i);
      if (e === -1) e = n;
      wipe(i, e);
      i = e;
      continue;
    }
    if (ch === '/' && nx === '*') {
      let e = text.indexOf('*/', i + 2);
      e = e === -1 ? n : e + 2;
      wipe(i, e);
      i = e;
      continue;
    }
    if (ch === '"') {
      if (text.startsWith('"""', i)) {
        let q = 3;
        while (text[i + q] === '"') q++;
        const closing = '"'.repeat(q);
        let e = text.indexOf(closing, i + q);
        e = e === -1 ? n : e + q;
        wipe(i, e);
        i = e;
        continue;
      }
      const verbatim = i > 0 && text[i - 1] === '@';
      let j = i + 1;
      let end = -1;
      while (j < n) {
        const cj = text[j];
        if (verbatim) {
          if (cj === '"') {
            if (text[j + 1] === '"') {
              j += 2;
              continue;
            }
            end = j + 1;
            break;
          }
          j++;
          continue;
        }
        if (cj === '\\') {
          j += 2;
          continue;
        }
        if (cj === '"') {
          end = j + 1;
          break;
        }
        if (cj === '\n') break;
        j++;
      }
      if (end < 0) {
        bad.push(i);
        const stop = verbatim ? n : Math.min(j, n);
        wipe(i, stop);
        i = stop;
        continue;
      }
      wipe(i, end);
      i = end;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      let end = -1;
      while (j < n && j < i + 12) {
        const cj = text[j];
        if (cj === '\\') {
          j += 2;
          continue;
        }
        if (cj === "'") {
          end = j + 1;
          break;
        }
        if (cj === '\n') break;
        j++;
      }
      if (end < 0) {
        bad.push(i);
        const stop = Math.min(j, n);
        wipe(i, stop);
        i = stop;
        continue;
      }
      wipe(i, end);
      i = end;
      continue;
    }
    i++;
  }
  let out = '';
  for (let k = 0; k < n; k += 8192) {
    out += String.fromCharCode.apply(null, codes.subarray(k, Math.min(n, k + 8192)));
  }
  return { masked: out, bad };
}

function csDirectives(c, text, L) {
  const lines = text.split('\n');
  const ifs = [];
  const regs = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/^\s*#/.test(l)) continue;
    if (/^\s*#\s*if\b/.test(l)) {
      ifs.push(i);
    } else if (/^\s*#\s*endif\b/.test(l)) {
      if (ifs.length) ifs.pop();
      else c.addAt(i + 1, 0, l.length, 'error', '#endif without a matching #if', L);
    } else if (/^\s*#\s*region\b/.test(l)) {
      regs.push(i);
    } else if (/^\s*#\s*endregion\b/.test(l)) {
      if (regs.length) regs.pop();
      else c.addAt(i + 1, 0, l.length, 'error', '#endregion without a matching #region', L);
    }
  }
  for (let k = 0; k < ifs.length && k < 3; k++) {
    c.addAt(ifs[k] + 1, 0, (lines[ifs[k]] || '').length, 'error', '#if is never closed (missing #endif)', L);
  }
  for (let k = 0; k < regs.length && k < 3; k++) {
    c.addAt(regs[k] + 1, 0, (lines[regs[k]] || '').length, 'error', '#region is never closed (missing #endregion)', L);
  }
}

function csBrackets(c, m, L) {
  const stack = [];
  const n = m.length;
  let reports = 0;
  for (let i = 0; i < n && reports < 5; i++) {
    const code = m.charCodeAt(i);
    if (code === 40 || code === 91 || code === 123) {
      stack.push({ ch: m[i], i });
    } else if (code === 41 || code === 93 || code === 125) {
      const want = code === 41 ? '(' : (code === 93 ? '[' : '{');
      if (!stack.length) {
        c.add(i, 1, 'error', "Unmatched '" + m[i] + "'", L);
        reports++;
        continue;
      }
      const top = stack[stack.length - 1];
      if (top.ch === want) {
        stack.pop();
        continue;
      }
      let k = stack.length - 2;
      while (k >= 0 && stack[k].ch !== want) k--;
      if (k < 0) {
        c.add(i, 1, 'error', "Unmatched '" + m[i] + "'", L);
        reports++;
        continue;
      }
      c.add(i, 1, 'error', "Expected '" + CLOSE_OF[top.ch] + "' before '" + m[i] + "'", L);
      reports++;
      stack.length = k;
    }
  }
  if (reports < 5) {
    let cnt = 0;
    for (let k = stack.length - 1; k >= 0 && cnt < 3; k--, cnt++) {
      c.add(stack[k].i, 1, 'error', "Unclosed '" + stack[k].ch + "'", L);
    }
  }
}

function lintCs(c, text, m, L) {
  core.rx(/\)\s*\.\s*Result\b|\.\s*Wait\s*\(\s*\)|\.\s*GetAwaiter\s*\(\s*\)\s*\.\s*GetResult\s*\(\s*\)/g, m, (x) => {
    c.add(x.index, x[0].length, 'warning', 'Blocking on a Task can deadlock; use await instead', L);
  });

  core.rx(/\basync\s+void\s+(\w+)\s*\(([^)]*)/g, m, (x) => {
    if (/\bobject\s+\w+\s*,/.test(x[2])) return;
    c.add(x.index + x[0].indexOf('void'), 4, 'warning', "async void swallows exceptions; return Task unless '" + x[1] + "' is an event handler", L);
  });

  core.rx(/\bthrow\s+(\w+)\s*;/g, m, (x) => {
    if (!/^(?:ex|e|exception|err|error)$/i.test(x[1])) return;
    c.add(x.index, x[0].length, 'warning', "'throw " + x[1] + ";' resets the stack trace; use 'throw;'", L);
  });

  core.rx(/\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g, m, (x) => {
    c.add(x.index, 5, 'info', 'Empty catch block hides errors', L);
  });

  core.rx(/\bnew\s+HttpClient\s*\(/g, m, (x) => {
    c.add(x.index, 3, 'info', 'Creating HttpClient per call exhausts sockets; reuse one or use IHttpClientFactory', L);
  });

  core.rx(/\block\s*\(\s*(?:this|typeof\b[^)]*)\)/g, m, (x) => {
    c.add(x.index, 4, 'info', 'Locking on this or a Type is unsafe; lock a private object', L);
  });

  core.rx(/\bGC\.Collect\s*\(/g, m, (x) => {
    c.add(x.index, 10, 'info', 'Forcing garbage collection rarely helps; remove it', L);
  });

  let sql = 0;
  core.rx(/(?:CommandText\s*=|new\s+\w*Command\s*\(|FromSqlRaw\s*\(|ExecuteSqlRaw\s*\(|\bQuery(?:<[^>\n]*>)?\s*\(|\bExecute\s*\()\s*(?:(?:\$@?|@\$)"[^"\n]*\{|@?"[^"\n]*"\s*\+)/g, text, (x) => {
    if (sql++ >= 5) return;
    c.add(x.index, Math.min(x[0].length, 12), 'warning', 'SQL built with string interpolation or concatenation; use parameters', L);
  });

  let guard = 0;
  core.rx(/\basync\s+(?:Task|ValueTask)(?:<[^>\n]*>)?\s+(\w+)\s*\(/g, m, (x) => {
    if (guard++ > 120) return;
    const open = x.index + x[0].length - 1;
    const info = scanCall(m, open);
    if (!info) return;
    let j = info.end + 1;
    while (j < m.length && /\s/.test(m[j])) j++;
    if (m.startsWith('where', j)) {
      const k = m.indexOf('{', j);
      if (k < 0) return;
      j = k;
    }
    if (m[j] !== '{') return;
    const end = braceEnd(m, j);
    if (end < 0) return;
    if (!/\bawait\b/.test(m.slice(j, end))) {
      c.add(x.index + x[0].lastIndexOf(x[1]), x[1].length, 'warning', "Async method '" + x[1] + "' has no await and runs synchronously", L);
    }
  });
}

function checkCs(c, text) {
  const L = 'C#';
  const mk = maskCs(text);
  for (let k = 0; k < mk.bad.length && k < 5; k++) {
    c.add(mk.bad[k], 1, 'error', 'Unterminated string or character literal', L);
  }
  csDirectives(c, text, L);
  csBrackets(c, mk.masked, L);
  lintCs(c, text, mk.masked, L);
}

module.exports = {
  useCore,
  lintReact,
  lintExpress,
  checkAstro,
  lintFlask,
  lintDjango,
  checkCs,
};
function lintReactMore(c, text, m) {
  const L = 'React';
  const inJsxTag = (idx) => {
    const p = m.lastIndexOf('<', idx);
    if (p < 0 || idx - p > 400) return false;
    return /^<[A-Za-z][\w.]*(?:\s[^<>;]*)?$/.test(m.slice(p, idx));
  };

  core.rx(/\bReactDOM\.render\s*\(/g, m, (x) => {
    c.add(x.index, 15, 'warning', 'ReactDOM.render is deprecated in React 18 and removed in React 19; use createRoot()', L);
  });
  core.rx(/\bcomponentWill(?:Mount|ReceiveProps|Update)\b/g, m, (x) => {
    c.add(x.index, x[0].length, 'warning', x[0] + ' is deprecated; use componentDidMount, componentDidUpdate or hooks', L);
  });
  core.rx(/\bfindDOMNode\s*\(/g, m, (x) => {
    c.add(x.index, 11, 'warning', 'findDOMNode is deprecated; use a ref instead', L);
  });
  core.rx(/(?<![\w$.])style\s*=\s*(["'])/g, text, (x) => {
    if (m[x.index] !== 's' || !inJsxTag(x.index)) return;
    c.add(x.index, 5, 'error', 'The style prop expects an object, e.g. style={{ color: "red" }}', L);
  });
  core.rx(/(?<![\w$.])ref\s*=\s*(["'])/g, text, (x) => {
    if (m[x.index] !== 'r' || !inJsxTag(x.index)) return;
    c.add(x.index, 3, 'warning', 'String refs are deprecated; use useRef or createRef', L);
  });
  core.rx(/(?<![\w$.])target\s*=\s*(["'])_blank\1/g, text, (x) => {
    if (m[x.index] !== 't' || !inJsxTag(x.index)) return;
    const p = m.lastIndexOf('<', x.index);
    const tag = text.slice(p, x.index + 300);
    if (/\brel\s*=/.test(tag)) return;
    c.add(x.index, 6, 'info', 'Add rel="noopener noreferrer" to links that open a new tab', L);
  });
}

module.exports.lintReactMore = lintReactMore;
