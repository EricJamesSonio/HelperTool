'use strict';

const { grep } = require('../fileScanner');
const { pass, fail } = require('../result');
const { lineCheck, windowCheck } = require('./builders');

const LP = '\\x28';
const RP = '\\x29';
const Q = '[\\x22\\x27]';
const NOT_Q = '[^\\x22\\x27]*';

function rx(source, flags) {
  return new RegExp(source, flags || '');
}

const SQ = String.fromCharCode(39);
const DQ = String.fromCharCode(34);
const BT = String.fromCharCode(96);

const THIRD_PARTY = new Set(['clerk', 'auth0', 'supabase-auth', 'firebase-auth']);
const SAFE_INTERP = /\b(?:escapeHtml|escHtml|escape|esc|sanitize|encodeURIComponent|Number|String)\b/;
const PLACEHOLDER = rx('(?:example|changeme|change-me|your[_-]|xxxx|<[^>]+>|[$][{]|process[.]env|placeholder|dummy|sample|[*]{3,}|[.][.][.])', 'i');
const CREDENTIAL_RE = rx(
  '\\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\\b[\\x22\\x27]?\\s*[:=]\\s*[\\x22\\x27][^\\x22\\x27\\s]{10,}[\\x22\\x27]',
  'i'
);
const CREDENTIAL_VALUE = rx('([\\x22\\x27])[^\\x22\\x27\\s]{10,}\\1');

const SECRET_PATTERNS = [
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: 'Stripe live key', re: /\b[sr]k_live_[0-9A-Za-z]{16,}\b/ },
  { name: 'Hardcoded credential', credential: true, re: CREDENTIAL_RE },
];

const ASSIGN_ANY = rx('[.](?:innerHTML|outerHTML)\\s*[+]?=');
const ASSIGN_VALUE = rx('[.](?:innerHTML|outerHTML)\\s*[+]?=\\s*(.*)$');
const TPL_PART = rx('[$][{][^}]*[}]', 'g');
const EVAL_LITERAL = rx('\\beval\\s*' + LP + '\\s*[\\x22\\x27\\x60]');

function isPlainQuoted(s) {
  const q = s.charAt(0);
  if (q !== SQ && q !== DQ) return false;
  if (s.length < 2 || s.charAt(s.length - 1) !== q) return false;
  return s.slice(1, -1).indexOf(q) === -1;
}

function dynamicAssign(line) {
  const m = ASSIGN_VALUE.exec(line);
  if (!m) return false;
  let rhs = m[1].trim();
  if (rhs.charAt(rhs.length - 1) === ';') rhs = rhs.slice(0, -1).trim();
  if (!rhs) return true;
  if (isPlainQuoted(rhs)) return false;
  if (rhs.charAt(0) === BT) {
    const parts = rhs.match(TPL_PART) || [];
    if (!parts.length) return false;
    if (parts.every((p) => SAFE_INTERP.test(p))) return false;
  }
  return true;
}

function dynamicSink(line) {
  if (ASSIGN_ANY.test(line)) return dynamicAssign(line);
  if (EVAL_LITERAL.test(line)) return false;
  return true;
}

const secrets = {
  id: 'hardcoded-secrets',
  title: 'No secrets are hardcoded in the source',
  category: 'Secrets',
  level: 'basic',
  severity: 'high',
  kind: 'static',
  owasp: 'A02:2021 Cryptographic Failures',
  applies: null,
  run(ctx) {
    const evidence = [];
    for (const p of SECRET_PATTERNS) {
      const hits = grep(ctx.files, p.re, { filter: p.credential ? (line) => !PLACEHOLDER.test(line) : null });
      for (const hit of hits) {
        const shown = p.credential
          ? hit.text.replace(CREDENTIAL_VALUE, '"[redacted]"')
          : hit.text.replace(p.re, (m) => m.slice(0, 4) + '...[redacted]');
        evidence.push({ file: hit.file, line: hit.line, text: p.name + ': ' + shown });
      }
    }
    if (!evidence.length) return pass('No key-like strings or hardcoded credentials were found.');
    return fail(
      evidence.length + ' possible secret(s) in the code.',
      'Move each value to an environment variable, remove it from git history, and rotate it because it is already exposed.',
      evidence.slice(0, 25)
    );
  },
};

const passwordHashing = {
  id: 'password-hashing-present',
  title: 'Passwords are hashed with bcrypt or argon2',
  category: 'Auth and sessions',
  level: 'basic',
  severity: 'high',
  kind: 'static',
  owasp: 'A02:2021 Cryptographic Failures',
  applies: (profile) => profile.auth.mechanism !== 'none-found' && !THIRD_PARTY.has(profile.auth.library),
  run(ctx) {
    if (ctx.profile.auth.hashing) return pass('A password hashing library (' + ctx.profile.auth.hashing + ') is installed.');
    return fail('Authentication code exists but no bcrypt or argon2 dependency was found.', 'Hash passwords with argon2 or bcrypt (cost 12 or higher). Never store plain or fast-hash passwords.');
  },
};

const SQL_CALL = '[.](?:query|execute|exec|run|all|get|prepare|raw|[$]queryRawUnsafe|[$]executeRawUnsafe)\\s*' + LP + '\\s*';
const SQL_WORDS = '\\b(?:SELECT|INSERT|UPDATE|DELETE|DROP)\\b';
const SQL_CONCAT = rx(SQL_CALL + '(?:\\x60[^\\x60]*[$][{]|' + Q + NOT_Q + SQL_WORDS + NOT_Q + Q + '\\s*[+])', 'i');
const EXEC_CONCAT = rx('\\b(?:exec|execSync)\\s*' + LP + '\\s*(?:\\x60[^\\x60]*[$][{]|' + Q + NOT_Q + Q + '\\s*[+])');

const checks = [
  secrets,
  passwordHashing,
  lineCheck({
    id: 'sql-concat',
    title: 'SQL is not built by joining strings',
    category: 'Injection',
    level: 'basic',
    severity: 'high',
    owasp: 'A03:2021 Injection',
    applies: (profile) => !['mongodb', 'firebase', 'redis'].includes(profile.database.dialect),
    re: SQL_CONCAT,
    okText: 'No SQL built from string concatenation was found.',
    failText: 'Check each one: values must be passed as parameters, not joined into the SQL text.',
    fix: 'Use parameterized queries (placeholders such as ? or $1) or your ORM query builder. For table or column names, use a fixed allowlist.',
  }),
  lineCheck({
    id: 'command-injection',
    title: 'Shell commands are not built from variables',
    category: 'Injection',
    level: 'basic',
    severity: 'high',
    owasp: 'A03:2021 Injection',
    re: EXEC_CONCAT,
    okText: 'No exec call built from variables was found.',
    failText: 'If any part comes from user input, an attacker can run commands.',
    fix: 'Use execFile or spawn with an argument array and no shell, and validate every value against an allowlist.',
  }),
  lineCheck({
    id: 'dom-sinks',
    title: 'No dynamic HTML or code sinks (innerHTML, document.write, eval)',
    category: 'Injection',
    level: 'medium',
    severity: 'medium',
    owasp: 'A03:2021 Injection',
    re: [
      ASSIGN_ANY,
      rx('document[.]write(?:ln)?\\s*' + LP),
      rx('[.]insertAdjacentHTML\\s*' + LP),
      rx('\\beval\\s*' + LP),
      rx('new Function\\s*' + LP),
    ],
    filter: (line) => dynamicSink(line),
    okText: 'No dynamic HTML or code sinks were found.',
    failText: 'This is a heuristic. Open each one and confirm every inserted value is escaped. Multi-line templates are not analysed.',
    fix: 'Use textContent, or escape every value before it reaches innerHTML. Replace eval and new Function with plain code.',
  }),
  lineCheck({
    id: 'path-traversal',
    title: 'File paths are not built from request input',
    category: 'Injection',
    level: 'medium',
    severity: 'high',
    owasp: 'A01:2021 Broken Access Control',
    re: [
      rx('\\bfs(?:[.]promises)?[.](?:readFile|readFileSync|createReadStream|writeFile|writeFileSync|unlink|readdir)' + LP + '\\s*[^' + RP + ']*\\breq[.](?:params|query|body)\\b'),
      rx('\\bpath[.](?:join|resolve)' + LP + '[^' + RP + ']*\\breq[.](?:params|query|body)\\b'),
    ],
    okText: 'No file access built directly from request input was found.',
    failText: 'A value like ../../secret could escape the intended folder.',
    fix: 'Resolve the path, then check it still starts with the allowed base folder. Prefer ids mapped to files over raw file names.',
  }),
  lineCheck({
    id: 'mongo-operator-injection',
    title: 'MongoDB queries do not take raw request objects',
    category: 'Injection',
    level: 'medium',
    severity: 'high',
    owasp: 'A03:2021 Injection',
    applies: (profile) => profile.database.dialect === 'mongodb',
    re: [
      rx('[$]where\\b'),
      rx('[.](?:find|findOne|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate)\\s*' + LP + '\\s*req[.](?:body|query|params)\\s*[,' + RP + ']'),
    ],
    okText: 'No raw request objects or $where were found in queries.',
    failText: 'Operators such as $ne or $gt in user input can bypass filters.',
    fix: 'Pick the exact fields from the request, cast them to strings or numbers, and enable mongoose sanitizeFilter. Avoid $where.',
  }),
  lineCheck({
    id: 'token-localstorage',
    title: 'Auth tokens are not kept in localStorage or sessionStorage',
    category: 'Auth and sessions',
    level: 'basic',
    severity: 'medium',
    owasp: 'A07:2021 Identification and Authentication Failures',
    re: rx(
      '(?:localStorage|sessionStorage)[.]setItem' + LP + '\\s*[\\x22\\x27\\x60][^\\x22\\x27\\x60]*(?:token|jwt|auth|session|secret|password)[^\\x22\\x27\\x60]*[\\x22\\x27\\x60]',
      'i'
    ),
    okText: 'No token-like values are saved to web storage.',
    failText: 'Any XSS bug can read web storage.',
    fix: 'Store session tokens in an httpOnly, Secure, SameSite cookie set by the server.',
  }),
  windowCheck({
    id: 'cookie-flags-code',
    title: 'Cookies set in code use httpOnly',
    category: 'Auth and sessions',
    level: 'medium',
    severity: 'medium',
    owasp: 'A05:2021 Security Misconfiguration',
    start: rx('\\b(?:res|reply|response|ctx)[.]cookie' + LP + '|\\bcookies[.]set' + LP + '|\\bsetcookie' + LP, 'i'),
    test: /httpOnly/i,
    span: 6,
    report: 'whenMissing',
    okText: 'Every cookie call sets httpOnly nearby.',
    failText: 'If the options are defined elsewhere this may be a false alarm.',
    fix: 'Pass { httpOnly: true, secure: true, sameSite: "lax" } to every cookie that carries a session.',
  }),
  lineCheck({
    id: 'jwt-hardcoded-secret',
    title: 'JWT secrets are not hardcoded',
    category: 'Auth and sessions',
    level: 'basic',
    severity: 'high',
    owasp: 'A02:2021 Cryptographic Failures',
    re: [
      rx('jwt[.](?:sign|verify)' + LP + '[^,]+,\\s*[\\x22\\x27][^\\x22\\x27]{3,}[\\x22\\x27]'),
      rx('\\b(?:jwt|session)?_?secret\\b\\s*[:=]\\s*[\\x22\\x27](?:secret|changeme|your[-_]?secret|password|jwtsecret|supersecret)[\\x22\\x27]', 'i'),
    ],
    okText: 'No hardcoded JWT secrets were found.',
    failText: 'Anyone with the source can forge tokens.',
    fix: 'Read the secret from an environment variable, use at least 32 random bytes, and rotate it.',
  }),
  windowCheck({
    id: 'jwt-verify-algorithms',
    title: 'jwt.verify pins the allowed algorithms',
    category: 'Auth and sessions',
    level: 'medium',
    severity: 'medium',
    owasp: 'A02:2021 Cryptographic Failures',
    start: rx('\\bjwt[.]verify' + LP),
    test: /algorithms/,
    span: 4,
    report: 'whenMissing',
    okText: 'Every jwt.verify call pins algorithms (or none are used).',
    failText: 'Without a pinned algorithm list, algorithm confusion attacks are possible.',
    fix: 'Pass { algorithms: ["HS256"] } (or your algorithm) to jwt.verify.',
  }),
  windowCheck({
    id: 'weak-password-hash',
    title: 'Passwords are not hashed with md5 or sha1',
    category: 'Auth and sessions',
    level: 'basic',
    severity: 'high',
    owasp: 'A02:2021 Cryptographic Failures',
    start: rx('createHash' + LP + '\\s*[\\x22\\x27](?:md5|sha1)[\\x22\\x27]\\s*' + RP),
    test: /pass|pwd/i,
    span: 3,
    report: 'whenPresent',
    okText: 'No md5 or sha1 hashing of passwords was found.',
    failText: 'These hashes are fast to crack.',
    fix: 'Use argon2id or bcrypt for passwords.',
  }),
  lineCheck({
    id: 'weak-random-token',
    title: 'Tokens and secrets do not use Math.random',
    category: 'Auth and sessions',
    level: 'medium',
    severity: 'medium',
    owasp: 'A02:2021 Cryptographic Failures',
    re: rx('Math[.]random' + LP + RP),
    filter: (line) => /token|secret|password|session|otp|nonce|api[_-]?key/i.test(line),
    okText: 'No Math.random was found near token or secret code.',
    failText: 'Math.random is predictable.',
    fix: 'Use crypto.randomBytes or crypto.randomUUID for anything security related.',
  }),
  lineCheck({
    id: 'cors-code',
    title: 'CORS in code is not open to every origin',
    category: 'Configuration',
    level: 'medium',
    severity: 'medium',
    owasp: 'A05:2021 Security Misconfiguration',
    re: [
      rx('Access-Control-Allow-Origin[\\x22\\x27]\\s*,\\s*[\\x22\\x27][*][\\x22\\x27]', 'i'),
      rx('\\borigin\\s*:\\s*(?:true|[\\x22\\x27][*][\\x22\\x27])'),
      rx('\\bcors' + LP + '\\s*' + RP),
    ],
    okText: 'No open CORS configuration was found.',
    failText: 'Open CORS lets any website call your API from a visitor browser.',
    fix: 'Set an explicit origin allowlist, and never combine a wildcard with credentials.',
  }),
  lineCheck({
    id: 'tls-verify-disabled',
    title: 'TLS certificate checks are not disabled',
    category: 'Configuration',
    level: 'basic',
    severity: 'medium',
    owasp: 'A02:2021 Cryptographic Failures',
    re: [rx('NODE_TLS_REJECT_UNAUTHORIZED\\s*=\\s*[\\x22\\x27]?0'), rx('rejectUnauthorized\\s*:\\s*false')],
    okText: 'TLS verification is never switched off.',
    failText: 'Disabling it allows man-in-the-middle attacks.',
    fix: 'Remove the override and trust the right certificate authority instead.',
  }),
];

module.exports = { checks };