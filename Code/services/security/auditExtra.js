'use strict';

const TOOL_PATH_RE = /(?:^|\/)services\/security\//;
const COMMENT_RE = /^(?:\/\/|\*|\/\*|#|<!--)/;
const EVIL_HOST = 'evil.example';
const JWT_LIBS = ['jsonwebtoken', 'jose', '@nestjs/jwt', 'jwt-simple', 'njwt', 'fast-jwt', 'express-jwt', '@fastify/jwt'];
const SESSION_NAME_RE = /sess|token|auth|jwt|sid/i;
const WORD_RE = /token|secret|passw|session|otp|nonce|api[_-]?key|csrf|reset/i;

const JWT_NONE_RE = /\balgorithms?\s*:\s*(?:\[[^\]]*)?['"]none['"]/i;
const JWT_IGNORE_EXP_RE = /\bignoreExpiration\s*:\s*true\b/;
const JWT_LITERAL_RE = /\b(?:jwt|jsonwebtoken|jwtService)\.(?:sign|verify)(?:Async)?\s*\([^,]+,\s*['"][^'"]{3,}['"]/;
const JWT_VERIFY_RE = /\b(?:jwt|jsonwebtoken|jwtService)\.verify(?:Async)?\s*\(/;

const TLS_RES = [/NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/, /rejectUnauthorized\s*:\s*false/];

const RANDOM_RE = /\bMath\.random\s*\(\s*\)/;

const COOKIE_CALL_RE = /\b(?:res|reply|response|ctx)\.cookie\s*\(|\bcookies\.set\s*\(|\bsetCookie\s*\(/;
const COOKIE_DEF_RE = /\bfunction\s+setCookie\b|\b(?:const|let|var)\s+setCookie\b|\bsetCookie\s*[:=]/;
const SAMESITE_NONE_RE = /\bsameSite\s*:\s*['"]none['"]/i;
const SECURE_FALSE_RE = /\bsecure\s*:\s*false\b/;
const COOKIE_FLAGS = [
  { name: 'httpOnly', re: /httpOnly/i },
  { name: 'secure', re: /\bsecure\b/i },
  { name: 'sameSite', re: /sameSite/i },
];

const EXEC_BARE_RE = /(?:^|[^.\w$])(?:exec|execSync)\s*\(/;
const EXEC_CP_RE = /\b(?:child_process|childProcess|cp)\.(?:exec|execSync)\s*\(/;
const SHELL_TRUE_RE = /\bshell\s*:\s*true\b/;
const SPAWN_CALL_RE = /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(/;
const INTERP_RE = /\$\{|['"`]\s*\+|\+\s*['"`]/;

const FS_REQ_RE = /\bfs(?:\.promises)?\.(?:readFile|readFileSync|createReadStream|createWriteStream|writeFile|writeFileSync|unlink|unlinkSync|readdir|readdirSync|rm|rmSync)\s*\([^)]*\breq\.(?:params|query|body)\b/;
const SEND_REQ_RE = /\bres\.(?:sendFile|download)\s*\([^)]*\breq\.(?:params|query|body)\b/;
const PATH_REQ_RE = /\bpath\.(?:join|resolve)\s*\([^)]*\breq\.(?:params|query|body)\b/;
const PATH_GUARD_RE = /basename|sanitize|normalize|startsWith|isInside|isSubPath/i;

const REDIRECT_PATHS = ['/', '/login', '/logout', '/signin', '/auth/login'];
const REDIRECT_PARAMS = ['url', 'next', 'redirect', 'redirect_uri', 'returnUrl', 'return_to', 'callbackUrl', 'continue', 'to'];

function* codeLines(ctx) {
  for (const file of ctx.corpus) {
    if (file.isTest || TOOL_PATH_RE.test(file.rel)) continue;
    for (let i = 0; i < file.lines.length; i += 1) {
      const line = file.lines[i];
      if (line.length > 2000) continue;
      const trimmed = line.trim();
      if (!trimmed || COMMENT_RE.test(trimmed)) continue;
      yield { file, index: i, line };
    }
  }
}

function windowText(file, from, to) {
  return file.lines.slice(Math.max(0, from), to + 1).join('\n');
}

function hasChildProcess(file) {
  if (file.cpFlag === undefined) file.cpFlag = file.lines.some((l) => /child_process/.test(l));
  return file.cpFlag;
}

function execArg(line) {
  const m = EXEC_BARE_RE.exec(line) || EXEC_CP_RE.exec(line);
  if (!m) return null;
  return line.slice(m.index + m[0].length);
}

function classifyExecArg(arg) {
  const a = arg.trimStart();
  if (/^`[^`]*\$\{/.test(a)) return 'dynamic';
  if (/^(['"])[^'"]*\1\s*\+/.test(a)) return 'dynamic';
  if (/^[A-Za-z_$][\w$.]*\s*[,)]/.test(a)) return 'variable';
  return null;
}

function cspIssues(csp) {
  const directives = {};
  for (const part of csp.split(';')) {
    const tokens = part.trim().split(/\s+/);
    if (tokens[0]) directives[tokens[0].toLowerCase()] = tokens.slice(1);
  }
  const script = directives['script-src'] || directives['default-src'] || [];
  const strict = script.some((v) => /^'(?:nonce-|sha256-|sha384-|sha512-)/.test(v) || v === "'strict-dynamic'");
  const issues = [];
  if (!directives['script-src'] && !directives['default-src']) {
    issues.push({ severity: 'medium', text: 'no script-src or default-src is set' });
  }
  if (script.includes("'unsafe-inline'") && !strict) {
    issues.push({ severity: 'medium', text: "script-src allows 'unsafe-inline'" });
  }
  if (script.includes("'unsafe-eval'")) {
    issues.push({ severity: 'medium', text: "script-src allows 'unsafe-eval'" });
  }
  if (script.includes('*') || script.includes('http:') || script.includes('data:')) {
    issues.push({ severity: 'medium', text: 'script-src allows a wildcard, http: or data: source' });
  }
  if (!directives['object-src'] && !directives['default-src']) {
    issues.push({ severity: 'low', text: 'object-src is not restricted' });
  }
  if (!directives['base-uri']) {
    issues.push({ severity: 'low', text: 'base-uri is not set' });
  }
  return issues;
}

function createTests(h) {
  const { finding, outcome, na, headerFix, hasAny } = h;

  const at = (item, data) =>
    finding(
      Object.assign(
        { file: item.file.rel, line: item.index + 1, evidence: item.line.trim().slice(0, 180) },
        data
      )
    );

  return [
    {
      id: 'jwt-hardening',
      title: 'JWTs are signed and verified safely',
      category: 'Auth',
      level: 'basic',
      severity: 'high',
      kind: 'static',
      owasp: 'A02:2021 Cryptographic Failures',
      cwe: 'CWE-347',
      why: 'A JWT check that accepts any algorithm, skips expiry or uses a literal secret lets attackers forge or reuse tokens.',
      fixTitle: 'Harden JWT signing and verification',
      run: async (ctx) => {
        if (!hasAny(ctx.deps.names, JWT_LIBS)) return na('Not applicable: no JWT library is a dependency of this project.');
        const findings = [];
        for (const item of codeLines(ctx)) {
          const line = item.line;
          if (JWT_NONE_RE.test(line)) {
            findings.push(
              at(item, {
                severity: 'high',
                title: 'JWT allows the none algorithm',
                detail: 'A token with no signature would be accepted.',
                fix: 'Pin a real algorithm list, for example { algorithms: ["HS256"] }, and never include none.',
              })
            );
          }
          if (JWT_IGNORE_EXP_RE.test(line)) {
            findings.push(
              at(item, {
                severity: 'high',
                title: 'JWT expiry is ignored',
                detail: 'ignoreExpiration: true means a stolen token never stops working.',
                fix: 'Remove ignoreExpiration and keep short expiry times with a refresh flow.',
              })
            );
          }
          if (JWT_LITERAL_RE.test(line)) {
            findings.push(
              at(item, {
                severity: 'high',
                title: 'JWT secret is written in the code',
                detail: 'Anyone with the source can forge tokens.',
                fix: 'Read the secret from an environment variable, use at least 32 random bytes, and rotate it.',
              })
            );
          }
          if (JWT_VERIFY_RE.test(line) && !/algorithms/.test(windowText(item.file, item.index, item.index + 6))) {
            findings.push(
              at(item, {
                severity: 'medium',
                confidence: 'review',
                title: 'jwt.verify does not pin the allowed algorithms',
                detail: 'Without a pinned list, algorithm confusion attacks are possible. If the algorithm is pinned in a shared config, this is safe.',
                fix: 'Pass { algorithms: ["HS256"] } (or your algorithm) to the verify call.',
              })
            );
          }
        }
        return outcome(findings);
      },
    },
    {
      id: 'tls-verify',
      title: 'TLS certificate checks are not disabled',
      category: 'Universal',
      level: 'basic',
      severity: 'medium',
      kind: 'static',
      owasp: 'A02:2021 Cryptographic Failures',
      cwe: 'CWE-295',
      why: 'Turning off certificate checks allows anyone on the network path to read and change HTTPS traffic.',
      fixTitle: 'Re-enable TLS certificate verification',
      run: async (ctx) => {
        const findings = [];
        for (const item of codeLines(ctx)) {
          if (!TLS_RES.some((re) => re.test(item.line))) continue;
          findings.push(
            at(item, {
              severity: 'medium',
              title: 'TLS certificate verification is switched off',
              detail: 'Connections made with this setting accept forged certificates.',
              fix: 'Remove the override and trust the right certificate authority instead (for example with the ca option).',
            })
          );
        }
        return outcome(findings);
      },
    },
    {
      id: 'weak-random',
      title: 'Tokens and secrets do not use Math.random',
      category: 'Auth',
      level: 'medium',
      severity: 'medium',
      kind: 'static',
      owasp: 'A02:2021 Cryptographic Failures',
      cwe: 'CWE-338',
      why: 'Math.random is predictable, so tokens built from it can be guessed.',
      fixTitle: 'Use crypto for tokens and secrets',
      run: async (ctx) => {
        const findings = [];
        for (const item of codeLines(ctx)) {
          if (!RANDOM_RE.test(item.line)) continue;
          if (!WORD_RE.test(windowText(item.file, item.index - 1, item.index + 1))) continue;
          findings.push(
            at(item, {
              severity: 'medium',
              title: 'Math.random is used near a token or secret',
              detail: 'The output of Math.random can be predicted from earlier values.',
              fix: 'Use crypto.randomBytes(32).toString("hex") or crypto.randomUUID() for anything security related.',
            })
          );
        }
        return outcome(findings);
      },
    },
    {
      id: 'cookie-flags-code',
      title: 'Cookies set in code have safe flags',
      category: 'Auth',
      level: 'medium',
      severity: 'medium',
      kind: 'static',
      owasp: 'A05:2021 Security Misconfiguration',
      cwe: 'CWE-1004',
      why: 'HttpOnly, Secure and SameSite protect session cookies from theft and cross-site requests.',
      fixTitle: 'Set httpOnly, secure and sameSite on cookies',
      run: async (ctx) => {
        const findings = [];
        for (const item of codeLines(ctx)) {
          const line = item.line;
          if (COOKIE_CALL_RE.test(line) && !COOKIE_DEF_RE.test(line)) {
            const win = windowText(item.file, item.index, item.index + 6);
            const missing = COOKIE_FLAGS.filter((f) => !f.re.test(win)).map((f) => f.name);
            if (missing.length) {
              findings.push(
                at(item, {
                  severity: SESSION_NAME_RE.test(line) ? 'medium' : 'low',
                  confidence: 'review',
                  title: 'Cookie set without ' + missing.join(', '),
                  detail: 'The options were not found next to this call. If they are built elsewhere, this may be a false alarm.',
                  fix: 'Pass { httpOnly: true, secure: true, sameSite: "lax" } to every cookie that carries a session.',
                })
              );
            }
          }
          if (SAMESITE_NONE_RE.test(line) && !/\bsecure\s*:\s*true/.test(windowText(item.file, item.index - 4, item.index + 4))) {
            findings.push(
              at(item, {
                severity: 'medium',
                title: 'SameSite=None cookie without Secure',
                detail: 'Browsers reject SameSite=None cookies that are not Secure, and the cookie is exposed over plain http.',
                fix: 'Set secure: true together with sameSite: "none", or use "lax".',
              })
            );
          }
          if (SECURE_FALSE_RE.test(line) && /cookie|session/i.test(windowText(item.file, item.index - 3, item.index + 3))) {
            findings.push(
              at(item, {
                severity: 'medium',
                confidence: 'review',
                title: 'Cookie is configured with secure: false',
                detail: 'The cookie is sent over plain http. This is fine only for local development.',
                fix: 'Use secure: process.env.NODE_ENV === "production" so production always sends it over https only.',
              })
            );
          }
        }
        for (const file of ctx.corpus) {
          if (file.isTest || TOOL_PATH_RE.test(file.rel)) continue;
          const importIndex = file.lines.findIndex((l) => /express-session/.test(l) && /require\s*\(|\bfrom\b/.test(l));
          if (importIndex === -1) continue;
          if (file.lines.some((l) => /\bstore\s*:/.test(l))) continue;
          findings.push(
            finding({
              severity: 'medium',
              confidence: 'review',
              title: 'express-session may use the default MemoryStore',
              detail: 'No store option was found in this file. The default store leaks memory and loses sessions on restart, so it is not meant for production.',
              file: file.rel,
              line: importIndex + 1,
              evidence: file.lines[importIndex].trim().slice(0, 180),
              fix: 'Configure a real store (Redis, a database store) in the session options. Ignore this if the store is set in another file.',
            })
          );
        }
        return outcome(findings);
      },
    },
    {
      id: 'command-injection',
      title: 'Shell commands are not built from variables',
      category: 'Universal',
      level: 'basic',
      severity: 'high',
      kind: 'static',
      owasp: 'A03:2021 Injection',
      cwe: 'CWE-78',
      why: 'If any part of a shell command comes from a user, an attacker can run their own commands.',
      fixTitle: 'Use execFile or spawn with argument arrays',
      run: async (ctx) => {
        const findings = [];
        for (const item of codeLines(ctx)) {
          if (!hasChildProcess(item.file)) continue;
          const line = item.line;
          const arg = execArg(line);
          if (arg !== null) {
            const kind = classifyExecArg(arg);
            if (kind === 'dynamic') {
              findings.push(
                at(item, {
                  severity: 'high',
                  title: 'Shell command is built with interpolation',
                  detail: 'The command text includes a value joined into the string. If that value can come from a user, this is command injection.',
                  fix: 'Use execFile or spawn with an argument array and no shell, and validate each value against an allowlist.',
                })
              );
            } else if (kind === 'variable') {
              findings.push(
                at(item, {
                  severity: 'medium',
                  confidence: 'review',
                  title: 'Shell command comes from a variable',
                  detail: 'If the variable holds text that a user can influence, this is command injection. If it is a constant, it is safe.',
                  fix: 'Use execFile or spawn with an argument array and no shell.',
                })
              );
            }
          }
          if (SHELL_TRUE_RE.test(line)) {
            const win = windowText(item.file, item.index - 5, item.index + 1);
            if (SPAWN_CALL_RE.test(win) && INTERP_RE.test(win)) {
              findings.push(
                at(item, {
                  severity: 'high',
                  title: 'spawn with shell: true and interpolated text',
                  detail: 'With shell: true the command line is parsed by the shell, so injected text can run extra commands.',
                  fix: 'Remove shell: true and pass the arguments as an array. Validate every value.',
                })
              );
            }
          }
        }
        return outcome(findings);
      },
    },
    {
      id: 'path-traversal',
      title: 'File paths are not built from request input',
      category: 'Universal',
      level: 'medium',
      severity: 'high',
      kind: 'static',
      owasp: 'A01:2021 Broken Access Control',
      cwe: 'CWE-22',
      why: 'A value such as ../../secret can escape the intended folder and read or overwrite other files.',
      fixTitle: 'Confine file access to an allowed folder',
      run: async (ctx) => {
        const findings = [];
        for (const item of codeLines(ctx)) {
          const line = item.line;
          if (PATH_GUARD_RE.test(line)) continue;
          if (FS_REQ_RE.test(line) || SEND_REQ_RE.test(line)) {
            findings.push(
              at(item, {
                severity: 'high',
                title: 'File access uses request input directly',
                detail: 'The path includes a value from the request, so ../ sequences can reach files outside the intended folder.',
                fix: 'Resolve the path, then check it still starts with the allowed base folder. Prefer ids mapped to files over raw file names.',
              })
            );
          } else if (PATH_REQ_RE.test(line)) {
            findings.push(
              at(item, {
                severity: 'high',
                confidence: 'review',
                title: 'Path is built from request input',
                detail: 'path.join and path.resolve do not stop ../ sequences. If the value is validated before this line, this is safe.',
                fix: 'After building the path, verify it starts with the allowed base folder, or use path.basename on the value.',
              })
            );
          }
        }
        return outcome(findings);
      },
    },
    {
      id: 'dyn-csp-quality',
      title: 'Live: Content-Security-Policy is strict enough',
      category: 'Universal',
      level: 'medium',
      severity: 'medium',
      kind: 'dynamic',
      owasp: 'A05:2021 Security Misconfiguration',
      cwe: 'CWE-693',
      why: 'A weak policy (unsafe-inline, wildcards) gives little protection against injected scripts.',
      fixTitle: 'Tighten the Content-Security-Policy',
      run: async (ctx) => {
        const csp = ctx.net.root.headers.get('content-security-policy') || '';
        if (!csp) return na('There is no Content-Security-Policy to evaluate. The header check reports a missing policy.');
        const findings = cspIssues(csp).map((issue) =>
          finding({
            severity: issue.severity,
            title: 'Content-Security-Policy weakness: ' + issue.text,
            detail: 'Checked on the target used for this run; a production host may differ, so check that too.',
            evidence: 'Content-Security-Policy: ' + csp.slice(0, 200),
            fix: headerFix(ctx.profile, 'a stricter Content-Security-Policy') + " Remove 'unsafe-inline' and 'unsafe-eval' (use nonces), avoid wildcards, and set object-src 'none' and base-uri 'self'.",
          })
        );
        return outcome(findings);
      },
    },
    {
      id: 'dyn-source-maps',
      title: 'Live: source maps are not public',
      category: 'Universal',
      level: 'medium',
      severity: 'low',
      kind: 'dynamic',
      owasp: 'A05:2021 Security Misconfiguration',
      cwe: 'CWE-540',
      why: 'Public source maps hand over your original, readable source code.',
      fixTitle: 'Stop publishing source maps',
      run: async (ctx) => {
        const scriptRe = /<script[^>]+src=["']([^"']+?\.js)(?:\?[^"']*)?["']/gi;
        const srcs = [];
        for (const m of String(ctx.net.root.body || '').matchAll(scriptRe)) {
          if (srcs.length >= 4) break;
          srcs.push(m[1]);
        }
        if (!srcs.length) return na('No script files were found on the home page.');
        const findings = [];
        for (const src of srcs) {
          let abs;
          try {
            abs = new URL(src, ctx.net.base);
          } catch (e) {
            continue;
          }
          if (abs.host !== ctx.net.base.host) continue;
          let res;
          try {
            res = await ctx.net.client.request(abs.pathname + '.map');
          } catch (e) {
            continue;
          }
          if (res.status === 200 && res.body.includes('"sources"') && /"version"\s*:\s*3/.test(res.body)) {
            findings.push(
              finding({
                severity: 'low',
                title: abs.pathname + '.map is publicly readable',
                detail: 'The source map exposes the original source code of the script.',
                evidence: 'GET ' + abs.pathname + '.map -> 200 (content not stored)',
                fix: 'Disable production source maps in the bundler, or upload them only to your error tracker and do not deploy them.',
              })
            );
          }
        }
        return outcome(findings);
      },
    },
    {
      id: 'dyn-open-redirect',
      title: 'Live: no open redirect on common login and logout paths',
      category: 'Universal',
      level: 'medium',
      severity: 'medium',
      kind: 'dynamic',
      owasp: 'A01:2021 Broken Access Control',
      cwe: 'CWE-601',
      why: 'An open redirect lets attackers send victims to a fake site from a link that starts on your domain.',
      fixTitle: 'Only redirect to relative paths or an allowlist',
      run: async (ctx) => {
        const evil = 'https://' + EVIL_HOST;
        const query = new URLSearchParams();
        for (const name of REDIRECT_PARAMS) query.set(name, evil);
        const findings = [];
        for (const p of REDIRECT_PATHS) {
          let res;
          try {
            res = await ctx.net.client.request(p + '?' + query.toString());
          } catch (e) {
            continue;
          }
          const location = res.headers.get('location') || '';
          const dest = location.toLowerCase().replace(/^https?:/, '');
          if (res.status >= 300 && res.status < 400 && dest.indexOf('//' + EVIL_HOST) === 0) {
            findings.push(
              finding({
                severity: 'medium',
                title: 'GET ' + p + ' redirects to an address taken from the URL',
                detail: 'A request with ' + evil + ' in a redirect parameter was answered with a redirect to it.',
                evidence: 'GET ' + p + ' -> ' + res.status + ', Location: ' + location.slice(0, 120),
                fix: 'Only redirect to relative paths, or compare the target host to a fixed allowlist before redirecting.',
              })
            );
          }
        }
        return outcome(findings);
      },
    },
  ];
}

module.exports = { createTests };