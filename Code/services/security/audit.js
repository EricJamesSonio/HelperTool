'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const targetGuard = require('./targetGuard');
const { projectRoots } = require('./engine');
const { killTree } = require('../consoleRunner');
const { redact } = require('../../database/consoleDb');

const WEIGHTS = { critical: 10, high: 7, medium: 4, low: 2, info: 0 };
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', 'out', 'vendor', '.cache', 'grammars', '.venv', '__pycache__',
]);
const MAX_FILES = 6000;
const MAX_FILE_BYTES = 400 * 1024;
const MAX_CORPUS_BYTES = 48 * 1024 * 1024;
const MAX_FINDINGS_PER_TEST = 40;
const MAX_REQUESTS = 40;
const REQUEST_TIMEOUT_MS = 8000;
const NPM_AUDIT_TIMEOUT_MS = 45000;
const TOTAL_TIME_MS = 150000;
const MAX_LOG_LINES = 600;

const QUOTES = '\\x27\\x22\\x60';
const QUOTES2 = '\\x27\\x22';

const SCAN_EXT_RE = /\.(?:js|jsx|mjs|cjs|ts|tsx|vue|svelte|php|py|html|yml|yaml|json|env)$/i;
const SKIP_FILE_RE = /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock)$|bundle|\.min\.|\.map$/i;
const TEST_PATH_RE = /(?:^|\/)(?:tests?|__tests__|fixtures|spec|e2e|mocks?)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const SENSITIVE_RE = new RegExp(
  '(?:^|\\/)(?:\\.env(?:\\.(?!example$|sample$|template$|dist$)[^\\/]+)?|credentials\\.json|client_secret[^\\/]*\\.json|service-account[^\\/]*\\.json|secrets?\\.json|id_rsa|id_ed25519|[^\\/]+\\.(?:pem|p12|pfx|key))$',
  'i'
);

/* ---------- helpers ---------- */

function finding(data) {
  return {
    severity: data.severity || 'medium',
    title: data.title,
    detail: data.detail || '',
    file: data.file || null,
    line: data.line || null,
    evidence: data.evidence ? redact(String(data.evidence)).slice(0, 400) : '',
    fix: data.fix || '',
    confidence: data.confidence || 'confirmed',
  };
}

function outcome(findings, extra) {
  if (!findings.length) return Object.assign({ status: 'pass', findings: [] }, extra);
  const allReview = findings.every((f) => f.confidence === 'review');
  return Object.assign({ status: allReview ? 'review' : 'fail', findings }, extra);
}

function skip(reason) {
  return { status: 'skip', reason, findings: [] };
}

function na(reason) {
  return { status: 'na', reason, findings: [] };
}

function topSeverity(list) {
  let best = null;
  for (const item of list) {
    if (best === null || SEV_RANK[item.severity] < SEV_RANK[best]) best = item.severity;
  }
  return best;
}

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length && out.length < MAX_FILES) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      let size = 0;
      try {
        size = fs.statSync(abs).size;
      } catch (e) {
        continue;
      }
      out.push({ abs, rel: path.relative(root, abs).split(path.sep).join('/'), size });
      if (out.length >= MAX_FILES) break;
    }
  }
  return out;
}

function buildCorpus(files) {
  const corpus = [];
  let bytes = 0;
  for (const f of files) {
    const base = f.rel.split('/').pop();
    if (/^\.env/i.test(base)) continue;
    if (!SCAN_EXT_RE.test(base) || SKIP_FILE_RE.test(f.rel) || SENSITIVE_RE.test(f.rel)) continue;
    if (f.size === 0 || f.size > MAX_FILE_BYTES) continue;
    if (bytes + f.size > MAX_CORPUS_BYTES) break;
    let text;
    try {
      text = fs.readFileSync(f.abs, 'utf8');
    } catch (e) {
      continue;
    }
    if (text.indexOf('\0') !== -1) continue;
    bytes += f.size;
    corpus.push({ rel: f.rel, lines: text.split(/\r?\n/), isTest: TEST_PATH_RE.test(f.rel) });
  }
  return corpus;
}

const COMMENT_START_RE = new RegExp('^(?:\\/\\/|\\*|\\/\\*|#|<!--)');

function scanCorpus(ctx, rules, options) {
  const o = options || {};
  const hits = [];
  for (const file of ctx.corpus) {
    if (file.isTest && !o.includeTests) continue;
    if (o.only && !o.only.test(file.rel)) continue;
    for (let i = 0; i < file.lines.length; i += 1) {
      const line = file.lines[i];
      if (line.length > 2000) continue;
      const trimmed = line.trim();
      if (!trimmed || COMMENT_START_RE.test(trimmed)) continue;
      for (const rule of rules) {
        const match = rule.re.exec(line);
        if (!match) continue;
        if (rule.skip && rule.skip(line, match, file)) continue;
        hits.push({ rule, file: file.rel, line: i + 1, match, text: line });
      }
    }
  }
  return hits;
}

function hitsToFindings(hits) {
  return hits.map((hit) =>
    finding({
      severity: hit.rule.severity,
      title: hit.rule.title,
      detail: hit.rule.detail,
      file: hit.file,
      line: hit.line,
      evidence: hit.text.trim().slice(0, 180),
      fix: hit.rule.fix,
      confidence: hit.rule.confidence || 'confirmed',
    })
  );
}

/* ---------- Prisma raw-query analysis (multi-line) ---------- */

const PRISMA_RAW_RE = /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(/g;

function readPrismaCall(lines, startLine, openCol) {
  const args = [];
  let current = '';
  let depth = 0;
  let started = false;
  let mode = 'code';
  let tplDepth = 0;

  const pushArg = () => {
    args.push(current.trim());
    current = '';
  };

  for (let li = startLine; li < lines.length; li += 1) {
    const line = lines[li];
    for (let ci = li === startLine ? openCol : 0; ci < line.length; ci += 1) {
      const ch = line[ci];
      const next = line[ci + 1];

      if (mode === 'lineComment') break;
      if (mode === 'blockComment') {
        if (ch === '*' && next === '/') {
          mode = 'code';
          ci += 1;
        }
        continue;
      }
      if (mode === 'sq' || mode === 'dq') {
        current += ch;
        if (ch === '\\') {
          current += next || '';
          ci += 1;
          continue;
        }
        if ((mode === 'sq' && ch === "'") || (mode === 'dq' && ch === '"')) mode = 'code';
        continue;
      }
      if (mode === 'tpl') {
        current += ch;
        if (ch === '\\') {
          current += next || '';
          ci += 1;
          continue;
        }
        if (ch === '`') {
          mode = 'code';
          continue;
        }
        if (ch === '$' && next === '{') {
          current += next;
          ci += 1;
          mode = 'tplExpr';
          tplDepth = 1;
        }
        continue;
      }
      if (mode === 'tplExpr') {
        current += ch;
        if (ch === '\\') {
          current += next || '';
          ci += 1;
          continue;
        }
        if (ch === '{') tplDepth += 1;
        else if (ch === '}') {
          tplDepth -= 1;
          if (tplDepth === 0) mode = 'tpl';
        } else if (ch === "'") mode = 'sq';
        else if (ch === '"') mode = 'dq';
        else if (ch === '`') mode = 'tpl';
        continue;
      }

      if (!started) {
        if (ch === '(') {
          started = true;
          depth = 1;
        }
        continue;
      }

      if (ch === '/' && next === '/') {
        mode = 'lineComment';
        ci += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        mode = 'blockComment';
        ci += 1;
        continue;
      }
      if (ch === "'") {
        current += ch;
        mode = 'sq';
        continue;
      }
      if (ch === '"') {
        current += ch;
        mode = 'dq';
        continue;
      }
      if (ch === '`') {
        current += ch;
        mode = 'tpl';
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') {
        depth += 1;
        current += ch;
        continue;
      }
      if (ch === ')' || ch === ']' || ch === '}') {
        depth -= 1;
        if (depth === 0) {
          pushArg();
          return args;
        }
        current += ch;
        continue;
      }
      if (ch === ',' && depth === 1) {
        pushArg();
        continue;
      }
      current += ch;
    }
    current += '\n';
  }
  return null;
}

function literalInfo(text) {
  const s = String(text || '').trim();
  if (!s) return { kind: 'empty' };
  const quote = s[0];
  if (quote === "'" || quote === '"') {
    let i = 1;
    let closed = false;
    for (; i < s.length; i += 1) {
      if (s[i] === '\\') {
        i += 1;
        continue;
      }
      if (s[i] === quote) {
        closed = true;
        break;
      }
    }
    if (!closed) return { kind: 'expression' };
    const rest = s.slice(i + 1).trim();
    if (rest && rest[0] === '+') return { kind: 'concat' };
    if (rest) return { kind: 'expression' };
    return { kind: 'literal', quote, body: s.slice(1, i) };
  }
  if (quote === '`') {
    for (let i = 1; i < s.length; i += 1) {
      if (s[i] === '\\') {
        i += 1;
        continue;
      }
      if (s[i] === '$' && s[i + 1] === '{') return { kind: 'template-dynamic' };
      if (s[i] === '`') {
        const rest = s.slice(i + 1).trim();
        if (rest && rest[0] === '+') return { kind: 'concat' };
        if (rest) return { kind: 'expression' };
        return { kind: 'literal', quote: '`', body: s.slice(1, i) };
      }
    }
    return { kind: 'expression' };
  }
  if (s.includes('+')) return { kind: 'concat' };
  return { kind: 'expression' };
}

function resolveSqlIdentifier(file, name) {
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\b(?:const|let|var)\\s+' + safeName + '\\s*=\\s*(.+?);?\\s*$');
  for (let i = 0; i < file.lines.length; i += 1) {
    const m = re.exec(file.lines[i]);
    if (m) return { value: m[1], line: i + 1 };
  }
  return null;
}

function prismaVerdict(file, args) {
  const first = (args[0] || '').trim();
  if (!first) {
    return {
      severity: 'medium',
      confidence: 'review',
      detail: 'The first argument could not be read, so check whether the SQL text is a constant.',
    };
  }

  const info = literalInfo(first);
  if (info.kind === 'literal') return { safe: true };
  if (info.kind === 'template-dynamic') {
    return {
      severity: 'high',
      confidence: 'confirmed',
      detail: 'The SQL text uses a template literal that interpolates a value into the query.',
    };
  }
  if (info.kind === 'concat') {
    return {
      severity: 'high',
      confidence: 'confirmed',
      detail: 'The SQL text is joined with a value using +, which is injection-prone.',
    };
  }

  if (/^[A-Za-z_$][\w$]*$/.test(first)) {
    const decl = resolveSqlIdentifier(file, first);
    if (decl) {
      const resolved = literalInfo(decl.value);
      if (resolved.kind === 'literal') return { safe: true };
      if (resolved.kind === 'template-dynamic' || resolved.kind === 'concat') {
        return {
          severity: 'high',
          confidence: 'confirmed',
          detail: 'The SQL text variable "' + first + '" (line ' + decl.line + ') is built with a value, which is injection-prone.',
        };
      }
    }
    return {
      severity: 'high',
      confidence: 'review',
      detail: 'The SQL text comes from "' + first + '". If that variable is a constant, this is safe; otherwise it is injection-prone.',
    };
  }

  return {
    severity: 'high',
    confidence: 'review',
    detail: 'The first argument is an expression, so check whether it can contain user input.',
  };
}

function scanPrismaRawCalls(ctx) {
  const out = [];
  for (const file of ctx.corpus) {
    if (file.isTest) continue;
    for (let i = 0; i < file.lines.length; i += 1) {
      const line = file.lines[i];
      if (line.length > 2000) continue;
      const trimmed = line.trim();
      if (!trimmed || COMMENT_START_RE.test(trimmed)) continue;
      PRISMA_RAW_RE.lastIndex = 0;
      let m = PRISMA_RAW_RE.exec(line);
      while (m) {
        const openCol = m.index + m[0].lastIndexOf('(');
        const args = readPrismaCall(file.lines, i, openCol);
        const verdict = args
          ? prismaVerdict(file, args)
          : {
              severity: 'high',
              confidence: 'review',
              detail: 'The call could not be read across lines, so check it manually.',
            };
        if (!verdict.safe) {
          out.push(
            finding({
              severity: verdict.severity,
              confidence: verdict.confidence,
              title: 'Uses an unsafe Prisma raw query',
              detail: verdict.detail,
              file: file.rel,
              line: i + 1,
              evidence: line.trim().slice(0, 180),
              fix: 'Pass values as bound parameters (for example $1 with a values array). Use prisma.$queryRaw with a tagged template literal so values are parameterized. If every part is a constant, this is safe and can be ignored.',
            })
          );
        }
        if (m[0].length === 0) PRISMA_RAW_RE.lastIndex += 1;
        m = PRISMA_RAW_RE.exec(line);
      }
    }
  }
  return out;
}

/* ---------- CORS analysis (multi-line, HTTP vs WebSocket) ---------- */

const CORS_ORIGIN_RE = /\borigin\s*:\s*(?:['"]([^'"]+)['"]|(true)\b)/i;
const CORS_HEADER_RE = /Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]/i;
const CORS_DEFAULT_RE = /\bcors\s*\(\s*\)/;
const CORS_CREDS_RE = /\bcredentials\s*:\s*true\b/i;
const CORS_CONTEXT_RE = /(?:@WebSocketGateway|\bcors\b|enableCors|Access-Control-Allow-Origin)/i;
const GATEWAY_COOKIE_RE = /\b(?:handshake[.]headers[.]cookie|req[.]cookies|withCredentials|express-session|cookie-session)\b/i;

function scanCors(ctx) {
  const out = [];
  for (const file of ctx.corpus) {
    if (file.isTest) continue;
    const text = file.lines.join('\n');
    const isGateway = /@WebSocketGateway/.test(text) || /(?:^|\/)[^/]*gateway\.[cm]?[jt]sx?$/i.test(file.rel);
    const gatewayCookieAuth = GATEWAY_COOKIE_RE.test(text);

    for (let i = 0; i < file.lines.length; i += 1) {
      const line = file.lines[i];
      if (line.length > 2000) continue;
      const trimmed = line.trim();
      if (COMMENT_START_RE.test(trimmed)) continue;

      const origin = CORS_ORIGIN_RE.exec(line);
      const header = CORS_HEADER_RE.test(line);
      const bare = CORS_DEFAULT_RE.test(line);
      if (!origin && !header && !bare) continue;

      const windowText = file.lines.slice(Math.max(0, i - 4), i + 5).join('\n');
      if (!CORS_CONTEXT_RE.test(windowText)) continue;
      const creds = CORS_CREDS_RE.test(windowText);

      let severity;
      let confidence;
      let title;
      let detail;
      let fix;

      if (bare) {
        severity = 'low';
        confidence = 'review';
        title = 'cors() is used with its default settings';
        detail = 'The default cors() allows every origin.';
        fix = 'Pass an options object with an explicit origin allowlist.';
      } else if (origin && origin[1] === 'null') {
        severity = 'medium';
        confidence = 'confirmed';
        title = 'CORS trusts the null origin';
        detail = 'Sandboxed pages and local files send Origin: null.';
        fix = 'Remove null from the allowlist.';
      } else if (origin && origin[2]) {
        severity = creds ? 'high' : 'medium';
        confidence = 'confirmed';
        title = creds ? 'CORS reflects any origin with credentials' : 'CORS reflects any origin';
        detail = 'origin: true echoes whatever origin asks, which is the same as allowing all.';
        fix = 'Compare the Origin to a fixed allowlist and answer only for entries on it.';
      } else {
        const wildcard = origin ? origin[1] === '*' : true;
        if (!wildcard) continue;
        if (isGateway) {
          const risky = gatewayCookieAuth && creds;
          severity = risky ? 'medium' : 'low';
          confidence = risky ? 'confirmed' : 'review';
          title = 'WebSocket gateway CORS allows every origin';
          detail = risky
            ? 'The gateway allows every origin with credentials and reads a session cookie. Validate the Origin and use an allowlist.'
            : 'The gateway allows every origin. Browsers do not enforce CORS on WebSocket frames, and this gateway does not read a session cookie here, so this is hardening, not a cross-site hijack. Validate Origin in handleConnection if cookies are used elsewhere.';
          fix = 'Set origin to an explicit list of front-end origins, and validate the Origin header in handleConnection if cookies are ever used.';
        } else {
          severity = creds ? 'high' : 'medium';
          confidence = 'confirmed';
          title = creds ? 'CORS allows every origin with credentials' : 'CORS allows every origin';
          detail = creds
            ? 'Any website can read credentialed responses from this API from a visitor browser.'
            : 'Any website can read responses from this API from a visitor browser.';
          fix = 'Set origin to an explicit list of your own front-end origins, and never combine a wildcard with credentials.';
        }
      }

      out.push(
        finding({
          severity,
          confidence,
          title,
          detail,
          file: file.rel,
          line: i + 1,
          evidence: line.trim().slice(0, 180),
          fix,
        })
      );
    }
  }
  return out;
}

function readDeps(repoPath) {
  const byRoot = [];
  const names = new Set();
  for (const root of projectRoots(repoPath)) {
    let pkg = null;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    } catch (e) {
      pkg = null;
    }
    if (!pkg) continue;
    const deps = new Set(Object.keys(Object.assign({}, pkg.dependencies, pkg.devDependencies)));
    deps.forEach((d) => names.add(d));
    const rel = path.relative(repoPath, root).split(path.sep).join('/');
    byRoot.push({ root, rel, deps, file: (rel ? rel + '/' : '') + 'package.json' });
  }
  return { names, byRoot };
}

function hasAny(set, list) {
  return list.some((name) => set.has(name));
}

function git(repoPath, args) {
  try {
    const r = spawnSync('git', args, { cwd: repoPath, encoding: 'utf8', timeout: 15000, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    if (r.error || r.status !== 0) return null;
    return r.stdout;
  } catch (e) {
    return null;
  }
}

function trackedFiles(repoPath) {
  const out = git(repoPath, ['ls-files', '-z']);
  return out === null ? null : new Set(out.split('\0').filter(Boolean));
}

function isIgnored(repoPath, file) {
  try {
    const r = spawnSync('git', ['check-ignore', '-q', '--', file], { cwd: repoPath, timeout: 5000, windowsHide: true });
    return r.status === 0;
  } catch (e) {
    return false;
  }
}

function headerFix(profile, name) {
  const front = profile.frontend.framework;
  const back = profile.backend.framework;
  if (front === 'nextjs') return 'Set ' + name + ' in the headers() function of next.config for source "/(.*)".';
  if (back === 'express') return 'Use helmet: app.use(helmet()), then adjust the policy for ' + name + '.';
  if (back === 'fastify') return 'Register @fastify/helmet and configure ' + name + '.';
  if (back === 'nestjs') return 'Call app.use(helmet()) in main.ts and configure ' + name + '.';
  if (front === 'laravel') return 'Add a middleware that sets ' + name + ' on every response.';
  return 'Set ' + name + ' in the web server or CDN that serves the app (nginx add_header, or the headers file of Vercel or Netlify).';
}

/* ---------- static rules ---------- */

const WEAK_VALUE_WORDS_RE = /^[A-Za-z_-]+$/;
const WEAK_VALUE_TEMPLATE_RE = new RegExp('\\$\\x7B|\\*{3}');
const WEAK_VALUE_PLACEHOLDER_RE = new RegExp('^(?:process|import\\.meta|example|changeme|your[_-]|x{4,}|<|https?:|[.\\/])', 'i');
const ENV_READ_RE = /process\.env|getenv|os\.environ/;

function weakSecretSkip(line, match) {
  const value = match[1] || '';
  if (WEAK_VALUE_WORDS_RE.test(value)) return true;
  if (WEAK_VALUE_TEMPLATE_RE.test(value)) return true;
  if (WEAK_VALUE_PLACEHOLDER_RE.test(value)) return true;
  return ENV_READ_RE.test(line);
}

const SECRET_RULES = [
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/, severity: 'critical' },
  { name: 'Private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, severity: 'critical', noMask: true },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/, severity: 'high' },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, severity: 'critical' },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, severity: 'high' },
  {
    name: 'Hard-coded credential',
    re: new RegExp(
      '\\b(?:api[_-]?key|secret|passw(?:or)?d|token|client[_-]?secret)\\b[' + QUOTES2 + ']?\\s*[:=]\\s*[' + QUOTES2 + ']([^' + QUOTES2 + '\\s]{12,})[' + QUOTES2 + ']',
      'i'
    ),
    group: 1,
    severity: 'medium',
    weak: true,
    skip: weakSecretSkip,
  },
];

const CODE_EXEC_RULES = [
  {
    re: new RegExp('(?:^|[^.\\w$])eval\\s*\\('),
    severity: 'high',
    title: 'Uses eval()',
    detail: 'eval runs text as code. If any part of that text can come from a user, file or network response, it becomes code execution.',
    fix: 'Replace eval with JSON.parse for data, or a lookup table or function map for behavior.',
  },
  {
    re: /\bnew Function\s*\(/,
    severity: 'high',
    title: 'Uses new Function()',
    detail: 'new Function compiles text into code, which has the same risk as eval.',
    fix: 'Replace it with a normal function or a lookup of allowed functions.',
  },
];

const CONSTANT_STRING_RE = new RegExp('^\\s*(?:([' + QUOTES + '])\\s*\\1|([' + QUOTES2 + '])[^' + QUOTES + '$+]*\\2)\\s*;?\\s*$');

const DOM_RULES = [
  {
    re: new RegExp('\\.(?:innerHTML|outerHTML)\\s*\\+?=\\s*(.+)$'),
    skip: (line, match) => CONSTANT_STRING_RE.test(match[1]),
    severity: 'medium',
    title: 'Assigns HTML from a non-constant value',
    detail: 'If the value contains user-controlled text, this is a cross-site scripting (XSS) hole.',
    fix: 'Use textContent for text or build elements with createElement. If HTML is required, sanitize it first (for example DOMPurify).',
  },
  {
    re: /dangerouslySetInnerHTML/,
    severity: 'medium',
    title: 'Uses dangerouslySetInnerHTML',
    detail: 'React will not escape this content, so unsanitized data becomes XSS.',
    fix: 'Render the data as normal JSX text, or sanitize the HTML with DOMPurify before passing it in.',
  },
  {
    re: /\bv-html\s*=/,
    severity: 'medium',
    title: 'Uses v-html',
    detail: 'Vue will not escape this content, so unsanitized data becomes XSS.',
    fix: 'Use text interpolation instead, or sanitize the HTML before binding it.',
  },
  {
    re: /document\.write(?:ln)?\s*\(/,
    severity: 'medium',
    title: 'Uses document.write',
    detail: 'document.write inserts raw markup and is a common XSS sink.',
    fix: 'Build the elements with DOM methods instead.',
  },
  {
    re: /\.insertAdjacentHTML\s*\(/,
    severity: 'medium',
    title: 'Uses insertAdjacentHTML',
    detail: 'The markup is parsed as HTML, so untrusted data becomes XSS.',
    fix: 'Use insertAdjacentText or createElement, or sanitize the HTML first.',
  },
];

const TOKEN_STORAGE_RULES = [
  {
    re: new RegExp(
      '(?:localStorage|sessionStorage)\\.setItem\\(\\s*[' + QUOTES + '][^' + QUOTES + ']*(?:token|jwt|auth|session|secret)[^' + QUOTES + ']*[' + QUOTES + ']',
      'i'
    ),
    severity: 'medium',
    title: 'Stores a token or session value in web storage',
    detail: 'Any XSS bug can read localStorage and sessionStorage, so a stolen token gives full account access.',
    fix: 'Keep the session in an httpOnly, Secure, SameSite cookie set by the server, so scripts cannot read it.',
  },
];

const SQL_KEYWORD = '(?:SELECT|INSERT|UPDATE|DELETE|WITH|REPLACE|DROP|ALTER|CREATE)';
const SQL_RULES = [
  {
    re: new RegExp('\\.\\w+\\s*\\(\\s*\\x60\\s*' + SQL_KEYWORD + '\\b[^\\x60]*\\$\\x7B', 'i'),
    severity: 'high',
    confidence: 'review',
    title: 'SQL text built with template-literal values',
    detail: 'Values placed inside the SQL text are not escaped. If any of them can come from a user, this is SQL injection.',
    fix: 'Pass values as parameters (placeholders such as ? or $1). If the inserted part is built only from constants, it is safe and you can ignore this.',
  },
  {
    re: new RegExp('\\.\\w+\\s*\\(\\s*([' + QUOTES2 + '])\\s*' + SQL_KEYWORD + '\\b[^' + QUOTES2 + ']*\\1\\s*\\+', 'i'),
    severity: 'high',
    confidence: 'review',
    title: 'SQL text joined with + to other values',
    detail: 'Joining strings into SQL is injection-prone when any part can come from a user.',
    fix: 'Use placeholders for values. If the joined part is built only from constants (for example a fixed column list), it is safe.',
  },
];

const ELECTRON_RULES = [
  { re: /nodeIntegration\s*:\s*true/, severity: 'high', title: 'Electron nodeIntegration is enabled', detail: 'Any XSS in a window with Node access becomes full control of the computer.', fix: 'Set nodeIntegration: false and expose only what is needed through a preload script with contextBridge.' },
  { re: /contextIsolation\s*:\s*false/, severity: 'high', title: 'Electron contextIsolation is disabled', detail: 'Page scripts can reach the preload scope and Electron internals.', fix: 'Set contextIsolation: true and use contextBridge.exposeInMainWorld.' },
  { re: /webSecurity\s*:\s*false/, severity: 'high', title: 'Electron webSecurity is disabled', detail: 'The same-origin policy is turned off for this window.', fix: 'Remove webSecurity: false and fix the underlying cross-origin need with proper CORS or a main-process request.' },
  { re: /allowRunningInsecureContent\s*:\s*true/, severity: 'medium', title: 'Electron allows insecure content', detail: 'HTTP content can load inside an HTTPS page.', fix: 'Remove allowRunningInsecureContent and serve every resource over HTTPS.' },
  { re: /enableRemoteModule\s*:\s*true/, severity: 'medium', title: 'Electron remote module is enabled', detail: 'The remote module lets the renderer call main-process APIs directly.', fix: 'Remove enableRemoteModule and use explicit ipcMain.handle channels.' },
];

const WEAK_HASH_RULES = [
  {
    re: new RegExp('createHash\\(\\s*[' + QUOTES2 + '](?:md5|sha1)[' + QUOTES2 + ']\\s*\\)[^;\\n]*passw', 'i'),
    severity: 'high',
    title: 'Password hashed with MD5 or SHA-1',
    detail: 'Fast hashes can be cracked at billions of guesses per second.',
    fix: 'Use bcrypt or argon2 with a per-user salt (both handle salting for you).',
  },
];

/* ---------- npm audit ---------- */

function npmEnv() {
  const env = Object.assign({}, process.env);
  for (const key of [
    'npm_config_allow_scripts',
    'NPM_CONFIG_ALLOW_SCRIPTS',
    'npm_config_ignore_scripts',
    'NPM_CONFIG_IGNORE_SCRIPTS',
  ]) {
    delete env[key];
  }
  return env;
}

function classifyNpmFailure(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (/allow-scripts|allowScripts|project-scoped/i.test(text)) {
    return {
      code: 'config',
      message:
        'npm config rejected the audit (' +
        text.slice(0, 160) +
        '). This is a tooling issue, not a dependency result. Remove --allow-scripts from project config, or move the entries to package.json "allowScripts" and re-run.',
    };
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|offline|network/i.test(text)) {
    return { code: 'offline', message: 'The npm registry could not be reached (' + text.slice(0, 160) + ').' };
  }
  if (/timed out/i.test(text)) return { code: 'timeout', message: text };
  if (/E401|E403|E404/i.test(text)) {
    return { code: 'registry', message: 'The npm registry rejected the request (' + text.slice(0, 160) + ').' };
  }
  return { code: 'tooling', message: text || 'npm audit failed without a readable reason.' };
}

function runNpmAudit(cwd) {
  return new Promise((resolve) => {
    let out = '';
    let errOut = '';
    let settled = false;
    let timer = null;
    let child = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    try {
      child = spawn('npm', ['audit', '--json', '--no-color', '--ignore-scripts'], {
        cwd,
        shell: process.platform === 'win32',
        windowsHide: true,
        env: npmEnv(),
      });
    } catch (e) {
      const failure = classifyNpmFailure(e.message);
      finish({ error: 'npm could not be started: ' + failure.message, reasonCode: failure.code });
      return;
    }

    timer = setTimeout(() => {
      killTree(child);
      finish({
        error: 'npm audit timed out after ' + Math.round(NPM_AUDIT_TIMEOUT_MS / 1000) + 's.',
        reasonCode: 'timeout',
      });
    }, NPM_AUDIT_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (out.length < 8 * 1024 * 1024) out += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      if (errOut.length < 64 * 1024) errOut += chunk;
    });
    child.on('error', (err) => {
      const failure = classifyNpmFailure(err.message);
      finish({ error: 'npm could not be started: ' + failure.message, reasonCode: failure.code });
    });
    child.on('close', (code) => {
      const stderr = errOut.trim();
      if (!out.trim()) {
        const failure = classifyNpmFailure(stderr || (code ? 'npm audit exited with code ' + code : ''));
        finish({ error: failure.message, reasonCode: failure.code });
        return;
      }
      let json;
      try {
        json = JSON.parse(out);
      } catch (e) {
        const failure = classifyNpmFailure(stderr || 'npm audit did not return a readable report.');
        finish({ error: failure.message, reasonCode: failure.code });
        return;
      }
      if (json && json.error) {
        const failure = classifyNpmFailure(json.error.summary || json.error.code || stderr);
        finish({ error: failure.message, reasonCode: failure.code });
        return;
      }
      finish({ json });
    });
  });
}

/* ---------- live probes ---------- */

function makeClient(baseUrl, say) {
  let count = 0;
  async function request(pathname, options) {
    if (count >= MAX_REQUESTS) throw new Error('The request cap of ' + MAX_REQUESTS + ' was reached.');
    count += 1;
    const o = options || {};
    const url = new URL(pathname, baseUrl);
    const started = Date.now();
    const res = await fetch(url, {
      method: o.method || 'GET',
      headers: Object.assign({ 'User-Agent': 'HelperTool-SecurityTest/1', Accept: '*/*' }, o.headers || {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let setCookies = [];
    if (typeof res.headers.getSetCookie === 'function') setCookies = res.headers.getSetCookie();
    else if (res.headers.get('set-cookie')) setCookies = [res.headers.get('set-cookie')];
    say((o.method || 'GET') + ' ' + url.pathname + ' -> ' + res.status + ' (' + (Date.now() - started) + ' ms)');
    return {
      status: res.status,
      headers: res.headers,
      setCookies,
      body: text.slice(0, 200000),
      contentType: res.headers.get('content-type') || '',
    };
  }
  return { request };
}

async function setupNet(ctx, settings) {
  const url = settings && settings.targetUrl ? String(settings.targetUrl).trim() : '';
  if (!url) {
    ctx.netReason = 'No target URL was found. Add one in the Target box (for example http://localhost:3000) to run the live checks.';
    return;
  }
  const guard = targetGuard.check(url, settings.confirmedHosts);
  if (!guard.allowed) {
    ctx.netReason = guard.reason || 'The target is not allowed.';
    return;
  }
  const client = makeClient(url, ctx.say);
  try {
    const root = await client.request('/');
    ctx.net = { client, base: new URL(url), root };
    ctx.say('Target reachable: ' + url + ' answered ' + root.status);
  } catch (e) {
    const reason = e && e.cause && e.cause.code ? e.cause.code : e.message;
    ctx.netReason = 'Could not reach ' + url + ' (' + reason + '). Start the app and run the test again.';
  }
}

const ENV_LINE_RE = /^[ \t]*[A-Z][A-Z0-9_]{2,}[ \t]*=[ \t]*\S+/m;
const CREDENTIALS_FILE_RE = new RegExp('\\x22(?:private_key|client_secret|refresh_token)\\x22');

const SENSITIVE_PROBES = [
  { p: '/.env', re: ENV_LINE_RE, label: '.env file' },
  { p: '/.env.local', re: ENV_LINE_RE, label: '.env.local file' },
  { p: '/.git/config', re: /\[core\]/, label: 'git config' },
  { p: '/.git/HEAD', re: /^ref:\s*refs\//, label: 'git HEAD' },
  { p: '/credentials.json', re: CREDENTIALS_FILE_RE, label: 'credentials file' },
];

const ERROR_SIGNATURES = [
  new RegExp('\\bat\\s+[^\\n(]+\\([^)\\n]*:\\d+:\\d+\\)'),
  /node_modules[\\/]/,
  /Traceback/,
  /SQLSTATE/,
  /Whoops!/,
  /Illuminate\\/,
  /<b>(?:Warning|Fatal error)<\/b>/,
];

/* ---------- tests ---------- */

const TESTS = [
  {
    id: 'secrets-files',
    title: 'Secret files are not committed to git',
    category: 'Universal',
    level: 'basic',
    severity: 'critical',
    kind: 'static',
    owasp: 'A05:2021 Security Misconfiguration',
    cwe: 'CWE-540',
    why: 'A committed key or env file gives everyone with repository access, and every past clone, your credentials.',
    fixTitle: 'Remove committed secret files and rotate the secrets',
    run: async (ctx) => {
      const sensitive = ctx.files.filter((f) => SENSITIVE_RE.test(f.rel));
      if (!sensitive.length) return outcome([]);
      const tracked = trackedFiles(ctx.repoPath);
      const findings = [];
      for (const f of sensitive) {
        if (tracked && tracked.has(f.rel)) {
          findings.push(
            finding({
              severity: 'critical',
              title: f.rel + ' is committed to git',
              detail: 'This file normally holds secrets. Anyone who can read the repository, or any old clone, can read it.',
              file: f.rel,
              fix: 'Run git rm --cached "' + f.rel + '", add it to .gitignore, and rotate every secret inside it, because it stays in git history.',
            })
          );
        } else if (!tracked) {
          findings.push(
            finding({
              severity: 'high',
              confidence: 'review',
              title: f.rel + ' exists and git ignore rules could not be checked',
              detail: 'This folder is not a git repository (or git is missing), so the check could not tell whether the file is protected.',
              file: f.rel,
              fix: 'Make sure this file is listed in .gitignore before the folder is ever committed.',
            })
          );
        } else if (!isIgnored(ctx.repoPath, f.rel)) {
          findings.push(
            finding({
              severity: 'high',
              title: f.rel + ' is not ignored by git',
              detail: 'It is not committed yet, but a single "git add ." would commit it.',
              file: f.rel,
              fix: 'Add "' + f.rel + '" to .gitignore.',
            })
          );
        }
      }
      return outcome(findings);
    },
  },
  {
    id: 'secrets-hardcoded',
    title: 'No keys or passwords written in the source code',
    category: 'Universal',
    level: 'basic',
    severity: 'high',
    kind: 'static',
    owasp: 'A07:2021 Identification and Authentication Failures',
    cwe: 'CWE-798',
    why: 'Secrets in source code are copied to every clone, backup and build, and cannot be rotated without a code change.',
    fixTitle: 'Move hard-coded secrets into environment variables',
    run: async (ctx) => {
      const hits = scanCorpus(ctx, SECRET_RULES);
      const findings = hits.map((hit) => {
        const value = hit.rule.group ? hit.match[hit.rule.group] : hit.match[0];
        const masked = hit.rule.noMask ? hit.match[0] : value.slice(0, 4) + '***';
        return finding({
          severity: hit.rule.severity,
          confidence: hit.rule.weak ? 'review' : 'confirmed',
          title: hit.rule.name + ' in source code',
          detail: hit.rule.weak
            ? 'This looks like a credential assigned to a literal value. Check whether it is a real secret.'
            : 'A value that matches the format of a real ' + hit.rule.name + ' was found.',
          file: hit.file,
          line: hit.line,
          evidence: hit.text.replace(value, masked).trim().slice(0, 180),
          fix: 'Move the value to an environment variable (read it with process.env), keep the env file out of git, and rotate the secret if it was ever committed.',
        });
      });
      return outcome(findings);
    },
  },
  {
    id: 'npm-audit',
    title: 'Dependencies have no known vulnerabilities',
    category: 'Universal',
    level: 'basic',
    severity: 'high',
    kind: 'static',
    owasp: 'A06:2021 Vulnerable and Outdated Components',
    cwe: 'CWE-1104',
    why: 'Known vulnerabilities in packages are attacked automatically and in bulk.',
    fixTitle: 'Update vulnerable dependencies',
    run: async (ctx) => {
      const targets = ctx.deps.byRoot
        .filter((r) => fs.existsSync(path.join(r.root, 'package-lock.json')) || fs.existsSync(path.join(r.root, 'npm-shrinkwrap.json')))
        .slice(0, 3);
      if (!targets.length) return skip('No package-lock.json was found, so npm audit cannot run.');
      const findings = [];
      const problems = [];
      const errorCodes = [];
      let audited = 0;
      for (const target of targets) {
        const label = target.rel || 'root';
        ctx.say('npm audit in ' + label + ' ...');
        const res = await runNpmAudit(target.root);
        if (res.error) {
          problems.push(label + ': ' + res.error);
          if (res.reasonCode) errorCodes.push(res.reasonCode);
          continue;
        }
        audited += 1;
        const meta = (res.json.metadata && res.json.metadata.vulnerabilities) || {};
        const all = Object.values(res.json.vulnerabilities || {});
        for (const [npmSev, sev] of [['critical', 'critical'], ['high', 'high'], ['moderate', 'medium'], ['low', 'low']]) {
          const count = meta[npmSev] || 0;
          if (!count) continue;
          const names = all.filter((v) => v.severity === npmSev).map((v) => v.name).slice(0, 6).join(', ');
          findings.push(
            finding({
              severity: sev,
              title: count + ' ' + npmSev + ' vulnerabilit' + (count === 1 ? 'y' : 'ies') + ' in ' + label + ' dependencies',
              detail: 'npm audit reports known security advisories for packages this project uses.',
              file: target.file,
              evidence: names ? 'Packages: ' + names : '',
              fix: 'Run "npm audit fix" in ' + (target.rel || 'the project folder') + '. Use --force only after reading what it changes, and run the tests afterwards.',
            })
          );
        }
      }
      if (!audited) {
        const reason = problems.join(' ') || 'npm audit could not run.';
        return Object.assign(skip(reason), { reasonCode: errorCodes[0] || 'tooling' });
      }
      const result = outcome(findings);
      if (problems.length) result.reason = 'Some folders could not be audited: ' + problems.join(' ');
      return result;
    },
  },
  {
    id: 'electron-hardening',
    title: 'Electron windows use safe settings',
    category: 'Universal',
    level: 'basic',
    severity: 'high',
    kind: 'static',
    owasp: 'A05:2021 Security Misconfiguration',
    cwe: 'CWE-693',
    why: 'In Electron, one XSS bug becomes remote code execution when Node access is enabled in the page.',
    fixTitle: 'Harden Electron window settings',
    run: async (ctx) => {
      if (!ctx.deps.names.has('electron')) return na('Not applicable: electron is not a dependency of this project.');
      return outcome(hitsToFindings(scanCorpus(ctx, ELECTRON_RULES)));
    },
  },
  {
    id: 'code-exec',
    title: 'No eval or new Function',
    category: 'Frontend',
    level: 'basic',
    severity: 'high',
    kind: 'static',
    owasp: 'A03:2021 Injection',
    cwe: 'CWE-95',
    why: 'Dynamic code execution turns any untrusted string into running code.',
    fixTitle: 'Remove eval and new Function',
    run: async (ctx) => outcome(hitsToFindings(scanCorpus(ctx, CODE_EXEC_RULES))),
  },
  {
    id: 'token-storage',
    title: 'Tokens are not kept in web storage',
    category: 'Frontend',
    level: 'basic',
    severity: 'medium',
    kind: 'static',
    owasp: 'A04:2021 Insecure Design',
    cwe: 'CWE-922',
    why: 'Anything in localStorage can be read by any script on the page, including injected ones.',
    fixTitle: 'Move session tokens to httpOnly cookies',
    run: async (ctx) => outcome(hitsToFindings(scanCorpus(ctx, TOKEN_STORAGE_RULES))),
  },
  {
    id: 'sql-concat',
    title: 'SQL is not built from strings',
    category: 'Database',
    level: 'basic',
    severity: 'high',
    kind: 'static',
    owasp: 'A03:2021 Injection',
    cwe: 'CWE-89',
    why: 'SQL assembled from text lets an attacker change what the query does.',
    fixTitle: 'Use parameterized queries',
    run: async (ctx) =>
      outcome(hitsToFindings(scanCorpus(ctx, SQL_RULES)).concat(scanPrismaRawCalls(ctx))),
  },
  {
    id: 'password-hashing',
    title: 'Passwords use a slow hash (bcrypt or argon2)',
    category: 'Auth',
    level: 'basic',
    severity: 'high',
    kind: 'static',
    owasp: 'A02:2021 Cryptographic Failures',
    cwe: 'CWE-916',
    why: 'If the database leaks, weakly hashed passwords are cracked within hours.',
    fixTitle: 'Hash passwords with bcrypt or argon2',
    run: async (ctx) => {
      const mechanism = ctx.profile.auth.mechanism;
      if (!['jwt', 'session-cookie', 'session-or-jwt-cookie'].includes(mechanism)) {
        return skip('Not applicable: no self-managed login was detected (third-party provider or none).');
      }
      const weak = hitsToFindings(scanCorpus(ctx, WEAK_HASH_RULES));
      if (weak.length) return outcome(weak);
      if (ctx.profile.auth.hashing) return outcome([]);
      const strongRule = { re: /\b(?:bcrypt|bcryptjs|argon2|scrypt|pbkdf2)/i, severity: 'info', title: '', detail: '', fix: '' };
      const strong = scanCorpus(ctx, [strongRule], { includeTests: true });
      if (strong.length) return outcome([]);
      return outcome([
        finding({
          severity: 'high',
          title: 'No password hashing was found',
          detail: 'The project handles logins (' + mechanism + ') but no bcrypt, argon2 or scrypt usage was found.',
          fix: 'Hash passwords with bcrypt or argon2 before storing them, and compare with the library compare function.',
        }),
      ]);
    },
  },
  {
    id: 'server-hardening',
    title: 'Server has security headers, rate limiting and input validation',
    category: 'Universal',
    level: 'basic',
    severity: 'medium',
    kind: 'static',
    owasp: 'A05:2021 Security Misconfiguration',
    cwe: 'CWE-693',
    why: 'These three layers stop most automated attacks before they reach your own code.',
    fixTitle: 'Add helmet, rate limiting and input validation to the server',
    run: async (ctx) => {
      const servers = ctx.deps.byRoot.filter((r) => hasAny(r.deps, ['express', 'fastify', 'koa', '@nestjs/core']));
      if (!servers.length) return skip('Not applicable: no express, fastify, koa or NestJS server was found.');
      const findings = [];
      for (const server of servers) {
        if (!hasAny(server.deps, ['helmet', '@fastify/helmet', 'koa-helmet'])) {
          findings.push(
            finding({
              severity: 'medium',
              title: 'No helmet (security headers) in ' + (server.rel || 'root'),
              detail: 'helmet sets headers such as CSP, X-Content-Type-Options and frame protection.',
              file: server.file,
              fix: headerFix(ctx.profile, 'the security headers'),
            })
          );
        }
        if (!hasAny(server.deps, ['express-rate-limit', 'rate-limiter-flexible', '@nestjs/throttler', '@fastify/rate-limit', 'koa-ratelimit', 'express-slow-down'])) {
          findings.push(
            finding({
              severity: 'medium',
              title: 'No rate limiting in ' + (server.rel || 'root'),
              detail: 'Without a limit, login and reset endpoints can be brute-forced and the API can be flooded.',
              file: server.file,
              fix: 'Add express-rate-limit (Express), @nestjs/throttler (NestJS) or @fastify/rate-limit, with a strict limit on login and password reset.',
            })
          );
        }
        if (!hasAny(server.deps, ['zod', 'joi', 'class-validator', 'yup', 'ajv', 'express-validator', 'valibot', '@sinclair/typebox'])) {
          findings.push(
            finding({
              severity: 'low',
              confidence: 'review',
              title: 'No input validation library in ' + (server.rel || 'root'),
              detail: 'Validating every request body, query and parameter blocks many injection and logic bugs.',
              file: server.file,
              fix: 'Validate request input with zod or joi (Express), class-validator (NestJS) or JSON schemas (Fastify).',
            })
          );
        }
      }
      return outcome(findings);
    },
  },
  {
    id: 'auth-present',
    title: 'The backend has authentication',
    category: 'Auth',
    level: 'medium',
    severity: 'medium',
    kind: 'static',
    owasp: 'A01:2021 Broken Access Control',
    cwe: 'CWE-306',
    why: 'An API without authentication exposes its data and actions to anyone who can reach it.',
    fixTitle: 'Confirm the API is protected by authentication',
    run: async (ctx) => {
      if (ctx.profile.backend.framework === 'unknown') return skip('Not applicable: no backend framework was detected.');
      if (ctx.profile.auth.mechanism !== 'none-found') return outcome([]);
      return outcome([
        finding({
          severity: 'medium',
          confidence: 'review',
          title: 'No authentication was detected for the ' + ctx.profile.backend.framework + ' backend',
          detail: 'No auth library, token handling or session package was found. If the API serves private data, it is open to anyone.',
          fix: 'Add authentication (sessions, JWT or a provider such as Clerk or Auth0) and a guard or middleware that checks it on every private route. Ignore this if you use a custom approach.',
        }),
      ]);
    },
  },
  {
    id: 'lockfile',
    title: 'Dependency lockfiles are present',
    category: 'Universal',
    level: 'medium',
    severity: 'low',
    kind: 'static',
    owasp: 'A06:2021 Vulnerable and Outdated Components',
    cwe: 'CWE-1104',
    why: 'Without a lockfile, installs can pull a newer, possibly compromised, version of a package.',
    fixTitle: 'Commit a lockfile for every package.json',
    run: async (ctx) => {
      const names = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock'];
      const findings = [];
      for (const r of ctx.deps.byRoot) {
        if (names.some((n) => fs.existsSync(path.join(r.root, n)))) continue;
        findings.push(
          finding({
            severity: 'low',
            title: 'No lockfile next to ' + r.file,
            detail: 'Installs are not reproducible and can pick up unreviewed versions.',
            file: r.file,
            fix: 'Run npm install (or your package manager install) once and commit the generated lockfile.',
          })
        );
      }
      return outcome(findings);
    },
  },
  {
    id: 'cors-static',
    title: 'CORS is restricted in code',
    category: 'Universal',
    level: 'medium',
    severity: 'medium',
    kind: 'static',
    owasp: 'A05:2021 Security Misconfiguration',
    cwe: 'CWE-942',
    why: 'Open CORS lets any website read API responses with a visitor browser.',
    fixTitle: 'Restrict CORS to your own origins',
    run: async (ctx) => outcome(scanCors(ctx)),
  },
  {
    id: 'dom-sinks',
    title: 'HTML is not injected from non-constant values',
    category: 'Frontend',
    level: 'medium',
    severity: 'medium',
    kind: 'static',
    owasp: 'A03:2021 Injection',
    cwe: 'CWE-79',
    why: 'These sinks turn unsanitized data into running scripts (cross-site scripting).',
    fixTitle: 'Replace raw HTML sinks with safe rendering',
    run: async (ctx) => outcome(hitsToFindings(scanCorpus(ctx, DOM_RULES))),
  },
  {
    id: 'dyn-headers',
    title: 'Live: security headers are sent',
    category: 'Universal',
    level: 'basic',
    severity: 'medium',
    kind: 'dynamic',
    owasp: 'A05:2021 Security Misconfiguration',
    cwe: 'CWE-693',
    why: 'Headers tell the browser to block framing, content sniffing and injected scripts.',
    fixTitle: 'Send the missing security headers',
    run: async (ctx) => {
      const res = ctx.net.root;
      const hd = res.headers;
      const csp = hd.get('content-security-policy') || '';
      const note = ' Checked on the target used for this run; a production host may differ, so check that too.';
      const out = [];
      const add = (severity, name, why) =>
        out.push(finding({ severity, title: 'Missing ' + name + ' header', detail: why + note, evidence: 'GET / -> ' + res.status + ', header absent', fix: headerFix(ctx.profile, name) }));
      if (!csp) add('medium', 'Content-Security-Policy', 'A CSP limits where scripts can load from and blunts XSS.');
      if ((hd.get('x-content-type-options') || '').toLowerCase() !== 'nosniff') add('low', 'X-Content-Type-Options', 'Without nosniff the browser may treat files as a different type.');
      if (!hd.get('x-frame-options') && !/frame-ancestors/i.test(csp)) add('medium', 'X-Frame-Options (or CSP frame-ancestors)', 'Without it the app can be embedded in another site for clickjacking.');
      if (!hd.get('referrer-policy')) add('low', 'Referrer-Policy', 'Without it full URLs can leak to other sites.');
      if (ctx.net.base.protocol === 'https:' && !hd.get('strict-transport-security')) add('medium', 'Strict-Transport-Security', 'Without HSTS browsers can be downgraded to http.');
      return outcome(out);
    },
  },
  {
    id: 'dyn-info-leak',
    title: 'Live: server does not announce its software',
    category: 'Universal',
    level: 'basic',
    severity: 'low',
    kind: 'dynamic',
    owasp: 'A05:2021 Security Misconfiguration',
    cwe: 'CWE-200',
    why: 'Version banners help attackers pick known exploits.',
    fixTitle: 'Hide server and framework banners',
    run: async (ctx) => {
      const hd = ctx.net.root.headers;
      const out = [];
      const powered = hd.get('x-powered-by');
      if (powered) {
        out.push(finding({ severity: 'low', title: 'X-Powered-By reveals "' + powered + '"', detail: 'The framework is announced on every response.', evidence: 'X-Powered-By: ' + powered, fix: 'Express: app.disable("x-powered-by") or use helmet. Other stacks: remove the header in server config.' }));
      }
      const server = hd.get('server') || '';
      if (/\d/.test(server)) {
        out.push(finding({ severity: 'low', title: 'Server header reveals a version ("' + server + '")', detail: 'The exact server version helps attackers pick exploits.', evidence: 'Server: ' + server, fix: 'Hide the version (nginx: server_tokens off; Apache: ServerTokens Prod).' }));
      }
      return outcome(out);
    },
  },
  {
    id: 'dyn-cookies',
    title: 'Live: cookies have safe flags',
    category: 'Universal',
    level: 'basic',
    severity: 'medium',
    kind: 'dynamic',
    owasp: 'A05:2021 Security Misconfiguration',
    cwe: 'CWE-1004',
    why: 'HttpOnly, Secure and SameSite protect session cookies from theft and cross-site requests.',
    fixTitle: 'Set HttpOnly, Secure and SameSite on cookies',
    run: async (ctx) => {
      const cookies = ctx.net.root.setCookies;
      if (!cookies.length) return Object.assign(outcome([]), { reason: 'No cookies were set on the home page.' });
      const secureNeeded = ctx.net.base.protocol === 'https:';
      const out = [];
      for (const raw of cookies) {
        const name = String(raw).split('=')[0].trim();
        const session = /sess|token|auth|jwt|sid/i.test(name);
        const missing = [];
        if (!/;\s*httponly/i.test(raw)) missing.push('HttpOnly');
        if (secureNeeded && !/;\s*secure/i.test(raw)) missing.push('Secure');
        if (!/;\s*samesite=/i.test(raw)) missing.push('SameSite');
        if (!missing.length) continue;
        out.push(
          finding({
            severity: session ? 'medium' : 'low',
            confidence: session ? 'confirmed' : 'review',
            title: 'Cookie "' + name + '" is missing ' + missing.join(', '),
            detail: session ? 'This looks like a session cookie.' : 'This may not be a session cookie, so check whether it matters.',
            evidence: 'Set-Cookie: ' + name + '=*** (flags missing: ' + missing.join(', ') + ')',
            fix: 'Set the flags where the cookie is created, for example httpOnly true, secure true and sameSite lax.',
          })
        );
      }
      return outcome(out);
    },
  },
  {
    id: 'dyn-sensitive-paths',
    title: 'Live: secret files are not served',
    category: 'Universal',
    level: 'basic',
    severity: 'critical',
    kind: 'dynamic',
    owasp: 'A05:2021 Security Misconfiguration',
    cwe: 'CWE-538',
    why: 'An exposed .env or .git folder hands over credentials and source code.',
    fixTitle: 'Stop serving secret files',
    run: async (ctx) => {
      const out = [];
      for (const probe of SENSITIVE_PROBES) {
        let res;
        try {
          res = await ctx.net.client.request(probe.p);
        } catch (e) {
          continue;
        }
        if (res.status === 200 && !/^\s*</.test(res.body) && probe.re.test(res.body)) {
          out.push(
            finding({
              severity: 'critical',
              title: probe.p + ' is publicly readable',
              detail: 'The ' + probe.label + ' is served to anyone who asks.',
              evidence: 'GET ' + probe.p + ' -> 200 with matching content (content not stored)',
              fix: 'Stop serving the project root. Serve only a public/dist folder, deny dotfiles in the web server, and rotate every secret in the exposed file.',
            })
          );
        }
      }
      return outcome(out);
    },
  },
  {
    id: 'dyn-errors',
    title: 'Live: error pages do not leak internals',
    category: 'Universal',
    level: 'basic',
    severity: 'medium',
    kind: 'dynamic',
    owasp: 'A05:2021 Security Misconfiguration',
    cwe: 'CWE-209',
    why: 'Stack traces show file paths, libraries and queries that help an attacker.',
    fixTitle: 'Hide stack traces from users',
    run: async (ctx) => {
      const paths = ['/__hsx_probe_' + crypto.randomBytes(3).toString('hex') + '__', '/%E0%A4%A'];
      const out = [];
      for (const p of paths) {
        let res;
        try {
          res = await ctx.net.client.request(p);
        } catch (e) {
          continue;
        }
        if (ERROR_SIGNATURES.some((re) => re.test(res.body))) {
          out.push(
            finding({
              severity: 'medium',
              title: 'Error response exposes internal details',
              detail: 'The error page contains a stack trace or framework debug output.',
              evidence: 'GET ' + p + ' -> ' + res.status + ' with stack trace markers',
              fix: 'Run with NODE_ENV=production (or APP_DEBUG=false) and return a generic error message, logging the details on the server.',
            })
          );
          break;
        }
      }
      return outcome(out);
    },
  },
  {
    id: 'dyn-cors',
    title: 'Live: CORS does not trust arbitrary origins',
    category: 'Universal',
    level: 'medium',
    severity: 'high',
    kind: 'dynamic',
    owasp: 'A05:2021 Security Misconfiguration',
    cwe: 'CWE-942',
    why: 'If a foreign origin is trusted, its pages can read private responses with the visitor cookies.',
    fixTitle: 'Do not reflect or wildcard CORS origins',
    run: async (ctx) => {
      const evil = 'https://evil.example';
      const res = await ctx.net.client.request('/', { headers: { Origin: evil } });
      const allow = res.headers.get('access-control-allow-origin');
      const creds = /true/i.test(res.headers.get('access-control-allow-credentials') || '');
      const out = [];
      if (allow === evil) {
        out.push(
          finding({
            severity: creds ? 'high' : 'medium',
            title: 'The server reflects any Origin' + (creds ? ' and allows credentials' : ''),
            detail: 'A request from ' + evil + ' was allowed.',
            evidence: 'Access-Control-Allow-Origin: ' + allow + (creds ? ', Access-Control-Allow-Credentials: true' : ''),
            fix: 'Compare the Origin to a fixed allow-list and answer only for entries on it.',
          })
        );
      } else if (allow === '*' && creds) {
        out.push(finding({ severity: 'high', title: 'CORS answers * together with credentials', detail: 'This combination is invalid and shows a misconfigured policy.', evidence: 'Access-Control-Allow-Origin: *', fix: 'Use an explicit origin list.' }));
      } else if (allow === 'null') {
        out.push(finding({ severity: 'medium', title: 'CORS trusts the null origin', detail: 'Sandboxed pages and local files send Origin: null.', evidence: 'Access-Control-Allow-Origin: null', fix: 'Remove null from the allow-list.' }));
      }
      return outcome(out);
    },
  },
  {
    id: 'dyn-xss-reflect',
    title: 'Live: input is not reflected unescaped',
    category: 'Frontend',
    level: 'basic',
    severity: 'high',
    kind: 'dynamic',
    owasp: 'A03:2021 Injection',
    cwe: 'CWE-79',
    why: 'Reflected input that is not escaped lets an attacker run scripts through a crafted link.',
    fixTitle: 'Escape reflected input',
    run: async (ctx) => {
      const marker = 'hsx' + crypto.randomBytes(3).toString('hex');
      const canary = marker + '<' + String.fromCharCode(34, 39) + '>';
      const query = new URLSearchParams();
      for (const name of ['q', 's', 'search', 'query', 'name', 'id', 'redirect']) query.set(name, canary);
      const res = await ctx.net.client.request('/?' + query.toString());
      if (/html/i.test(res.contentType) && res.body.includes(canary)) {
        return outcome([
          finding({
            severity: 'high',
            title: 'Query parameters are reflected without escaping',
            detail: 'A harmless canary containing < and quotes came back unchanged in an HTML page.',
            evidence: 'GET /?q=' + marker + '... -> the canary appeared raw in the HTML',
            fix: 'Escape output with your template engine default escaping, avoid raw HTML helpers, and add a Content-Security-Policy.',
          }),
        ]);
      }
      return Object.assign(outcome([]), { reason: 'Only the home page and common parameter names were probed.' });
    },
  },
];
const auditExtra3 = require('./auditExtra3');

TESTS.push(...auditExtra3.createTests({ finding, outcome, skip, na, headerFix, hasAny }));

const auditExtra2 = require('./auditExtra2');

TESTS.push(...auditExtra2.createTests({ finding, outcome, skip, na, headerFix, hasAny }));

const auditExtra = require('./auditExtra');

TESTS.push(...auditExtra.createTests({ finding, outcome, skip, na, headerFix, hasAny }));

/* ---------- scoring ---------- */

function addToBucket(bucket, test) {
  if (test.status === 'skip' || test.status === 'na') {
    if (test.status === 'na') bucket.na += 1;
    else bucket.skipped += 1;
    return;
  }
  const effectiveSeverity = test.effectiveSeverity || test.severity;
  const weight = WEIGHTS[effectiveSeverity] || 0;
  bucket.total += weight;
  if (test.status === 'pass') {
    bucket.earned += weight;
    bucket.passed += 1;
  } else if (test.status === 'review') {
    bucket.earned += weight * 0.5;
    bucket.review += 1;
  } else {
    bucket.failed += 1;
  }
}

function newBucket() {
  return { earned: 0, total: 0, passed: 0, failed: 0, review: 0, skipped: 0, na: 0 };
}

function percent(bucket) {
  return bucket.total > 0 ? Math.round((bucket.earned / bucket.total) * 100) : null;
}

function gradeFor(pct) {
  if (pct === null) return '-';
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

function computeScore(tests) {
  const overall = newBucket();
  const levels = { basic: newBucket(), medium: newBucket() };
  const categories = {};
  for (const test of tests) {
    addToBucket(overall, test);
    if (levels[test.level]) addToBucket(levels[test.level], test);
    if (!categories[test.category]) categories[test.category] = newBucket();
    addToBucket(categories[test.category], test);
  }

  const levelOut = (name, previousOk) => {
    const bucket = levels[name];
    const pct = percent(bucket);
    const blocking = tests.some(
      (t) =>
        t.level === name &&
        t.status === 'fail' &&
        ((t.effectiveSeverity || t.severity) === 'critical' || (t.effectiveSeverity || t.severity) === 'high')
    );
    const achieved = pct === null ? null : previousOk && pct >= 80 && !blocking;
    return { pct, achieved, passed: bucket.passed, failed: bucket.failed, review: bucket.review, skipped: bucket.skipped, na: bucket.na };
  };

  const basic = levelOut('basic', true);
  const medium = levelOut('medium', basic.achieved === true);
  const pct = percent(overall);

  const byCategory = {};
  for (const name of Object.keys(categories)) {
    const b = categories[name];
    byCategory[name] = { pct: percent(b), passed: b.passed, failed: b.failed, review: b.review, skipped: b.skipped, na: b.na };
  }

  return {
    overall: pct,
    grade: gradeFor(pct),
    levels: { basic, medium, advanced: { status: 'not-available' } },
    byCategory,
  };
}

/* ---------- report ---------- */

function buildImprovements(tests, findings) {
  const out = [];
  for (const test of tests) {
    if (test.status !== 'fail' && test.status !== 'review') continue;
    const mine = findings.filter((f) => f.testId === test.id);
    out.push({
      testId: test.id,
      title: test.fixTitle,
      severity: topSeverity(mine) || test.severity,
      status: test.status,
      review: mine.length > 0 && mine.every((f) => f.confidence === 'review'),
      count: test.findingCount,
      why: test.why,
      fixes: Array.from(new Set(mine.map((f) => f.fix).filter(Boolean))).slice(0, 4),
      files: Array.from(new Set(mine.map((f) => f.file).filter(Boolean))).slice(0, 8),
    });
  }
  out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.count - a.count);
  return out;
}

function buildNotCovered(ctx) {
  const list = [];
  if (!ctx.net) list.push({ title: 'All live checks (headers, cookies, exposed files, CORS, error pages, XSS canary)', reason: ctx.netReason });
  list.push({ title: 'SQL injection probes against live endpoints', reason: 'Planned for the database attack pack. The code check above only finds risky SQL text.' });
  list.push({ title: 'Login rate limits, JWT tampering, session handling and IDOR', reason: 'Planned for the auth pack. It also needs test accounts, which are not configured yet.' });
  list.push({ title: 'Stored XSS and data-flow tracing from inputs to HTML sinks', reason: 'The sink check lists risky places but does not prove that user input reaches them.' });
  list.push({ title: 'Advanced level (bypasses, timing and race attacks)', reason: 'Planned for a later phase.' });
  return list;
}

function buildHeadline(score, totals, findings) {
  if (score.overall === null) return 'No check could be scored in this run.';
  const all = findings || [];
  const confirmedUrgent = all.filter((f) => (f.severity === 'critical' || f.severity === 'high') && f.confidence !== 'review').length;
  const reviewUrgent = all.filter((f) => (f.severity === 'critical' || f.severity === 'high') && f.confidence === 'review').length;
  const first = 'Score ' + score.overall + '% (grade ' + score.grade + '). ';
  let second;
  if (confirmedUrgent) {
    second = confirmedUrgent + ' confirmed critical or high finding' + (confirmedUrgent === 1 ? '' : 's') + ' should be fixed first. ';
  } else if (reviewUrgent) {
    second = reviewUrgent + ' high-priority item' + (reviewUrgent === 1 ? '' : 's') + ' need review before they are treated as confirmed. ';
  } else {
    second = 'No confirmed critical or high findings came from the checks that ran. ';
  }
  const third = totals.skipped ? totals.skipped + ' check' + (totals.skipped === 1 ? '' : 's') + ' did not run (see Tests).' : 'Every check ran.';
  return first + second + third;
}

async function runAudit(options) {
  const o = options;
  const started = Date.now();
  const output = [];

  const emit = (data) => {
    if (typeof o.onProgress !== 'function') return;
    try {
      o.onProgress(data);
    } catch (e) {
      /* progress is only a display aid */
    }
  };

  const say = (text) => {
    if (output.length < MAX_LOG_LINES) output.push(text);
    emit({ type: 'log', text, at: Date.now() });
  };

  emit({
    type: 'plan',
    total: TESTS.length,
    tests: TESTS.map((t) => ({ id: t.id, title: t.title, category: t.category, level: t.level, kind: t.kind, severity: t.severity })),
    at: Date.now(),
  });

  emit({ type: 'stage', text: 'Scanning project files', at: Date.now() });
  const files = walk(o.repoPath);
  const corpus = buildCorpus(files);
  say('Scanned ' + files.length + ' files, read ' + corpus.length + ' source files (secret files are never read).');

  const ctx = {
    repoPath: o.repoPath,
    profile: o.profile,
    files,
    corpus,
    deps: readDeps(o.repoPath),
    net: null,
    netReason: '',
    say,
  };

  const hasTarget = !!(o.settings && o.settings.targetUrl);
  emit({
    type: 'stage',
    text: hasTarget ? 'Checking that the target answers' : 'No target URL: the live checks will be skipped',
    at: Date.now(),
  });
  await setupNet(ctx, o.settings);
  if (!ctx.net) say('Live checks will not run: ' + ctx.netReason);
  else say('All live checks are read-only GET requests (cap ' + MAX_REQUESTS + ').');

  emit({ type: 'stage', text: 'Running checks', at: Date.now() });
  const tests = [];
  const findings = [];

  for (let index = 0; index < TESTS.length; index += 1) {
    const def = TESTS[index];
    const t0 = Date.now();
    emit({ type: 'test-start', id: def.id, title: def.title, kind: def.kind, index: index + 1, total: TESTS.length, at: t0 });

    let res;
    if (t0 - started > TOTAL_TIME_MS) {
      res = skip('The time limit for this run was reached.');
    } else if (def.kind === 'dynamic' && !ctx.net) {
      res = skip(ctx.netReason);
    } else {
      try {
        res = await def.run(ctx);
      } catch (e) {
        res = skip('The check could not finish: ' + e.message);
      }
    }

    const all = res.findings || [];
    const kept = all.slice(0, MAX_FINDINGS_PER_TEST);
    tests.push({
      id: def.id,
      title: def.title,
      category: def.category,
      level: def.level,
      severity: def.severity,
      effectiveSeverity: topSeverity(all) || def.severity,
      kind: def.kind,
      owasp: def.owasp,
      cwe: def.cwe,
      why: def.why,
      fixTitle: def.fixTitle,
      status: res.status,
      reason: res.reason || '',
      reasonCode: res.reasonCode || '',
      findingCount: all.length,
      truncated: all.length - kept.length,
      durationMs: Date.now() - t0,
    });
    for (const item of kept) {
      findings.push(Object.assign({ id: 'F' + (findings.length + 1), testId: def.id, category: def.category, level: def.level }, item));
    }
    say('[' + res.status.toUpperCase() + '] ' + def.title + ' (' + all.length + ' finding' + (all.length === 1 ? '' : 's') + ', ' + (Date.now() - t0) + ' ms)' + (res.reason ? ' - ' + res.reason : ''));
    emit({
      type: 'test-done',
      id: def.id,
      title: def.title,
      status: res.status,
      findingCount: all.length,
      reason: res.reason || '',
      durationMs: Date.now() - t0,
      at: Date.now(),
    });
  }

  emit({ type: 'stage', text: 'Building the report', at: Date.now() });
  findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);

  const bySeverity = {};
  for (const item of findings) bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
  const totals = {
    tests: tests.length,
    passed: tests.filter((t) => t.status === 'pass').length,
    failed: tests.filter((t) => t.status === 'fail').length,
    review: tests.filter((t) => t.status === 'review').length,
    skipped: tests.filter((t) => t.status === 'skip').length,
    na: tests.filter((t) => t.status === 'na').length,
    findings: findings.length,
    bySeverity,
  };

  const score = computeScore(tests);
  const profile = o.profile;
  const assumptions = [];
  for (const key of ['frontend', 'database', 'auth']) {
    if (profile.confidence[key] < 0.5) {
      assumptions.push('Detection confidence for ' + key + ' is ' + Math.round(profile.confidence[key] * 100) + '%, so checks for it may be missing. Check the detected stack below.');
    }
  }
  if (Array.isArray(o.extraAssumptions)) {
    for (const note of o.extraAssumptions) assumptions.push(note);
  }

  const finishedAt = Date.now();
  return {
    id: crypto.randomBytes(6).toString('hex'),
    repoName: path.basename(o.repoPath),
    startedAt: started,
    finishedAt,
    durationMs: finishedAt - started,
    target: {
      url: o.settings && o.settings.targetUrl ? o.settings.targetUrl : '',
      source: o.targetSource || 'saved',
      reachable: !!ctx.net,
      note: ctx.net ? 'Live checks ran as read-only GET requests.' : ctx.netReason,
    },
    stack: {
      frontend: profile.frontend.framework,
      backend: profile.backend.framework,
      database: profile.database.dialect + (profile.database.layer !== 'unknown' ? ' / ' + profile.database.layer : ''),
      auth: profile.auth.mechanism + (profile.auth.library ? ' / ' + profile.auth.library : ''),
      folders: profile.projectFolders || ['.'],
    },
    score,
    totals,
    headline: buildHeadline(score, totals, findings),
    tests,
    findings,
    improvements: buildImprovements(tests, findings),
    notCovered: buildNotCovered(ctx),
    assumptions,
    output,
  };
}

module.exports = {
  runAudit,
  computeScore,
  _internals: {
    scanPrismaRawCalls,
    scanCors,
    readPrismaCall,
    literalInfo,
    classifyNpmFailure,
  },
};