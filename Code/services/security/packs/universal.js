'use strict';

const { pass, fail, skip, na } = require('../result');

const LP = '\\x28';
const RP = '\\x29';

function rx(source, flags) {
  return new RegExp(source, flags || '');
}

function dyn(def) {
  return Object.assign({ kind: 'dynamic', applies: null }, def);
}

function headerAdvice(profile, header, value) {
  const backend = profile && profile.backend ? profile.backend.framework : 'unknown';
  const front = profile && profile.frontend ? profile.frontend.framework : 'unknown';
  if (backend === 'express' || backend === 'nestjs') return 'Add the helmet middleware, or set ' + header + ': ' + value + ' on every response.';
  if (front === 'nextjs') return 'Add ' + header + ' to the headers() list in next.config.js.';
  if (front === 'laravel') return 'Add a middleware that sets ' + header + ': ' + value + ' and register it globally.';
  return 'Send the header ' + header + ': ' + value + ' from your server or reverse proxy.';
}

function headerValue(ctx, name) {
  const v = ctx.home.headers[name];
  return Array.isArray(v) ? v.join(', ') : v || '';
}

function has(body, needles) {
  return needles.some((n) => body.indexOf(n) !== -1);
}

function looksHtml(body) {
  return /^\s*<(?:!doctype|html)/i.test(body);
}

function cspIssues(csp) {
  const directives = {};
  for (const part of csp.split(';')) {
    const tokens = part.trim().split(/\s+/);
    if (tokens[0]) directives[tokens[0].toLowerCase()] = tokens.slice(1);
  }
  const script = directives['script-src'] || directives['default-src'] || [];
  const issues = [];
  const strict = script.some(
    (v) =>
      v.indexOf("'nonce-") === 0 ||
      v.indexOf("'sha256-") === 0 ||
      v.indexOf("'sha384-") === 0 ||
      v.indexOf("'sha512-") === 0 ||
      v === "'strict-dynamic'"
  );
  if (!directives['script-src'] && !directives['default-src']) issues.push('no script-src or default-src is set');
  if (script.includes("'unsafe-inline'") && !strict) issues.push("script-src allows 'unsafe-inline'");
  if (script.includes("'unsafe-eval'")) issues.push("script-src allows 'unsafe-eval'");
  if (script.includes('*') || script.includes('http:') || script.includes('data:')) issues.push('script-src allows a wildcard, http: or data: source');
  if (!directives['object-src'] && !directives['default-src']) issues.push('object-src is not restricted');
  if (!directives['base-uri']) issues.push('base-uri is not set');
  return issues;
}

function simpleHeader(def) {
  return dyn({
    id: def.id,
    title: def.title,
    category: 'Headers and transport',
    level: def.level || 'basic',
    severity: def.severity,
    owasp: 'A05:2021 Security Misconfiguration',
    run(ctx) {
      if (def.test(ctx)) return pass(def.ok);
      return fail(def.bad, headerAdvice(ctx.profile, def.header, def.value));
    },
  });
}

function downloadable(r) {
  return r.status === 200 && r.body.length > 0 && !/text\/html/i.test(r.headers['content-type'] || '');
}

const ENV_LINE = rx('^[A-Z][A-Z0-9_]{2,}\\s*=', 'm');

const SECRET_PATHS = [
  ['/.env', (r) => r.status === 200 && !looksHtml(r.body) && ENV_LINE.test(r.body)],
  ['/.git/config', (r) => r.status === 200 && r.body.indexOf('[core]') !== -1],
  ['/.git/HEAD', (r) => r.status === 200 && r.body.indexOf('ref:') === 0],
  ['/backup.zip', (r) => downloadable(r)],
  ['/backup.sql', (r) => downloadable(r)],
  ['/dump.sql', (r) => downloadable(r)],
  ['/database.sqlite', (r) => downloadable(r)],
  ['/db.sqlite', (r) => downloadable(r)],
];

const META_PATHS = [
  ['/package.json', (r) => r.status === 200 && has(r.body, ['"dependencies"', '"devDependencies"', '"scripts"'])],
  ['/composer.json', (r) => r.status === 200 && has(r.body, ['"require"'])],
  ['/.DS_Store', (r) => r.status === 200 && r.body.indexOf('Bud1') !== -1 && r.body.length < 200000],
  ['/phpinfo.php', (r) => r.status === 200 && has(r.body, ['phpinfo()', 'PHP Version'])],
  ['/server-status', (r) => r.status === 200 && /Apache Server Status/i.test(r.body)],
  ['/actuator/env', (r) => r.status === 200 && has(r.body, ['"propertySources"'])],
];

async function probePaths(ctx, list) {
  const found = [];
  for (const [p, test] of list) {
    const res = await ctx.client.request(ctx.url(p));
    if (!res.error && test(res)) found.push({ file: 'GET ' + p, line: 0, text: 'answered with status ' + res.status });
  }
  return found;
}

const STACK_LEAK = [
  rx('\\bat\\s+[\\w.<>$]+\\s+' + LP + '[^' + RP + ']*:\\d+:\\d+' + RP),
  rx('node_modules[\\\\/]'),
  rx('Traceback ' + LP + 'most recent call last' + RP),
  rx('Stack trace:', 'i'),
  rx('Whoops!|Illuminate[\\\\]'),
  rx('SQLSTATE\\x5b'),
];

const XSS_MARK = 'zq9xk"><b7q>';
const EVIL_HOST = 'evil.example.test';

const checks = [
  simpleHeader({
    id: 'hdr-nosniff',
    title: 'X-Content-Type-Options is nosniff',
    severity: 'medium',
    header: 'X-Content-Type-Options',
    value: 'nosniff',
    test: (ctx) => /nosniff/i.test(headerValue(ctx, 'x-content-type-options')),
    ok: 'X-Content-Type-Options: nosniff is set.',
    bad: 'X-Content-Type-Options is missing, so browsers may guess content types.',
  }),
  simpleHeader({
    id: 'hdr-csp-present',
    title: 'Content-Security-Policy is present',
    severity: 'medium',
    header: 'Content-Security-Policy',
    value: "default-src 'self'",
    test: (ctx) => !!headerValue(ctx, 'content-security-policy'),
    ok: 'A Content-Security-Policy header is set.',
    bad: 'No Content-Security-Policy header. A CSP limits the damage of any XSS bug.',
  }),
  simpleHeader({
    id: 'hdr-frame',
    title: 'Clickjacking protection (frame-ancestors or X-Frame-Options)',
    severity: 'medium',
    header: 'X-Frame-Options',
    value: 'DENY',
    test: (ctx) => /frame-ancestors/i.test(headerValue(ctx, 'content-security-policy')) || !!headerValue(ctx, 'x-frame-options'),
    ok: 'The page cannot be framed by other sites.',
    bad: 'The page can be embedded in another site (clickjacking).',
  }),
  simpleHeader({
    id: 'hdr-referrer',
    title: 'Referrer-Policy is set',
    severity: 'low',
    header: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
    test: (ctx) => !!headerValue(ctx, 'referrer-policy'),
    ok: 'Referrer-Policy is set.',
    bad: 'Referrer-Policy is missing, so full URLs may leak to other sites.',
  }),
  dyn({
    id: 'hdr-hsts',
    title: 'Strict-Transport-Security is set (https)',
    category: 'Headers and transport',
    level: 'basic',
    severity: 'medium',
    owasp: 'A02:2021 Cryptographic Failures',
    run(ctx) {
      if (!/^https:/i.test(ctx.target)) return na('The target is plain http (local). HSTS applies to https production.');
      const v = headerValue(ctx, 'strict-transport-security');
      const m = /max-age=(\d+)/i.exec(v);
      if (m && Number(m[1]) >= 15552000) return pass('HSTS is set with a long max-age.');
      return fail(
        v ? 'HSTS max-age is shorter than 6 months.' : 'HSTS header is missing.',
        headerAdvice(ctx.profile, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
      );
    },
  }),
  dyn({
    id: 'cookie-flags-live',
    title: 'Cookies set on the home page have HttpOnly, SameSite and Secure',
    category: 'Auth and sessions',
    level: 'basic',
    severity: 'high',
    owasp: 'A05:2021 Security Misconfiguration',
    run(ctx) {
      const cookies = [].concat(ctx.home.headers['set-cookie'] || []);
      if (!cookies.length) return na('No cookies are set on the home page. Login cookies are not covered yet.');
      const secure = /^https:/i.test(ctx.target);
      const evidence = [];
      for (const c of cookies) {
        const name = c.split('=')[0].trim();
        const low = c.toLowerCase();
        const missing = [];
        if (!/;\s*httponly/.test(low)) missing.push('HttpOnly');
        if (!/;\s*samesite=/.test(low)) missing.push('SameSite');
        if (secure && !/;\s*secure/.test(low)) missing.push('Secure');
        if (missing.length) evidence.push({ file: 'Set-Cookie', line: 0, text: name + ' is missing ' + missing.join(', ') });
      }
      if (!evidence.length) return pass('All cookies carry the expected flags.');
      return fail(evidence.length + ' cookie(s) are missing flags.', 'Set HttpOnly, SameSite=Lax (or Strict) and Secure on session cookies.', evidence);
    },
  }),
  dyn({
    id: 'exposed-secret-files',
    title: 'No .env, .git or backup files are served',
    category: 'Exposure',
    level: 'basic',
    severity: 'critical',
    owasp: 'A05:2021 Security Misconfiguration',
    async run(ctx) {
      const found = await probePaths(ctx, SECRET_PATHS);
      if (!found.length) return pass('None of the common secret paths were served.');
      return fail(
        found.length + ' sensitive file(s) are reachable from the web.',
        'Remove these files from the public folder and block dotfiles and backups in your server config. Rotate any secret that was exposed.',
        found
      );
    },
  }),
  dyn({
    id: 'exposed-meta-files',
    title: 'No package.json, phpinfo or server status pages are served',
    category: 'Exposure',
    level: 'basic',
    severity: 'medium',
    owasp: 'A05:2021 Security Misconfiguration',
    async run(ctx) {
      const found = await probePaths(ctx, META_PATHS);
      if (!found.length) return pass('None of the common info-leak paths were served.');
      return fail(found.length + ' info-leak file(s) are reachable.', 'Stop serving these paths in production.', found);
    },
  }),
  dyn({
    id: 'sourcemaps-public',
    title: 'Source maps are not public',
    category: 'Exposure',
    level: 'medium',
    severity: 'low',
    owasp: 'A05:2021 Security Misconfiguration',
    async run(ctx) {
      const scriptSrc = rx('<script[^>]+src=[\\x22\\x27]([^\\x22\\x27]+[.]js)[\\x22\\x27]', 'gi');
      const versionKey = rx('[\\x22]version[\\x22]\\s*:\\s*3');
      const srcs = [];
      let m = scriptSrc.exec(ctx.home.body);
      while (m && srcs.length < 4) {
        srcs.push(m[1]);
        m = scriptSrc.exec(ctx.home.body);
      }
      if (!srcs.length) return na('No script files were found on the home page.');
      const found = [];
      for (const src of srcs) {
        let abs;
        try {
          abs = new URL(src, ctx.target);
        } catch (e) {
          continue;
        }
        if (abs.host !== new URL(ctx.target).host) continue;
        const res = await ctx.client.request(abs.href + '.map');
        if (!res.error && res.status === 200 && res.body.indexOf('"sources"') !== -1 && versionKey.test(res.body)) {
          found.push({ file: 'GET ' + abs.pathname + '.map', line: 0, text: 'source map is public' });
        }
      }
      if (!found.length) return pass('No public source maps were found for the main scripts.');
      return fail('Source maps expose your original source code.', 'Disable production source maps, or upload them only to your error tracker.', found);
    },
  }),
  dyn({
    id: 'error-leak',
    title: 'Error pages do not leak stack traces or debug output',
    category: 'Exposure',
    level: 'basic',
    severity: 'medium',
    owasp: 'A05:2021 Security Misconfiguration',
    async run(ctx) {
      const found = [];
      for (const p of ['/__sec_probe_not_found__', '/%', '/api/__sec_probe__']) {
        const res = await ctx.client.request(ctx.url(p));
        if (res.error) continue;
        const hit = STACK_LEAK.find((re) => re.test(res.body));
        if (hit) found.push({ file: 'GET ' + p, line: 0, text: 'response body matches ' + hit.source.slice(0, 40) });
      }
      if (!found.length) return pass('Error responses did not show stack traces.');
      return fail('Error responses expose internal details.', 'Turn off debug mode in production and return a generic error page.', found);
    },
  }),
  dyn({
    id: 'cors-live',
    title: 'CORS does not trust arbitrary origins',
    category: 'Headers and transport',
    level: 'medium',
    severity: 'high',
    owasp: 'A05:2021 Security Misconfiguration',
    async run(ctx) {
      const origin = 'https://' + EVIL_HOST;
      const res = await ctx.client.request(ctx.url('/'), { headers: { Origin: origin } });
      if (res.error) return skip('The request failed: ' + res.error);
      const acao = res.headers['access-control-allow-origin'] || '';
      const acac = String(res.headers['access-control-allow-credentials'] || '').toLowerCase();
      if (acao === origin && acac === 'true') {
        return fail(
          'An unknown origin is trusted with credentials.',
          'Use an allowlist of origins instead of reflecting the Origin header.',
          [{ file: 'GET /', line: 0, text: 'Access-Control-Allow-Origin reflects the request origin with credentials' }],
          'high'
        );
      }
      if (acao === origin) {
        return fail(
          'An unknown origin is reflected.',
          'Use an allowlist of origins instead of reflecting the Origin header.',
          [{ file: 'GET /', line: 0, text: 'Access-Control-Allow-Origin reflects the request origin' }],
          'medium'
        );
      }
      if (acao === '*' && acac === 'true') {
        return fail(
          'Wildcard origin combined with credentials.',
          'Never combine * with credentials. Use an allowlist.',
          [{ file: 'GET /', line: 0, text: 'Access-Control-Allow-Origin: * with credentials' }],
          'high'
        );
      }
      return pass('CORS does not trust an unknown origin.');
    },
  }),
  dyn({
    id: 'server-banner',
    title: 'Server does not advertise its software version',
    category: 'Headers and transport',
    level: 'basic',
    severity: 'low',
    owasp: 'A05:2021 Security Misconfiguration',
    run(ctx) {
      const evidence = [];
      const powered = headerValue(ctx, 'x-powered-by');
      const server = headerValue(ctx, 'server');
      if (powered) evidence.push({ file: 'Header', line: 0, text: 'X-Powered-By: ' + powered });
      if (/\d+\.\d+/.test(server)) evidence.push({ file: 'Header', line: 0, text: 'Server: ' + server });
      if (!evidence.length) return pass('No version banner was found.');
      return fail('The response names the server software.', 'Remove X-Powered-By (app.disable("x-powered-by") in Express) and hide the Server version.', evidence);
    },
  }),
  dyn({
    id: 'csp-quality',
    title: 'Content-Security-Policy is strict enough',
    category: 'Headers and transport',
    level: 'medium',
    severity: 'medium',
    owasp: 'A05:2021 Security Misconfiguration',
    run(ctx) {
      const csp = headerValue(ctx, 'content-security-policy');
      if (!csp) return na('There is no CSP to evaluate.');
      const issues = cspIssues(csp);
      if (!issues.length) return pass('The CSP has no obvious weaknesses.');
      return fail(
        issues.length + ' weakness(es) in the CSP.',
        "Remove 'unsafe-inline' and 'unsafe-eval' (use nonces), avoid wildcards, and set object-src 'none' and base-uri 'self'.",
        issues.map((t) => ({ file: 'Content-Security-Policy', line: 0, text: t }))
      );
    },
  }),
  dyn({
    id: 'isolation-headers',
    title: 'Permissions-Policy and Cross-Origin-Opener-Policy are set',
    category: 'Headers and transport',
    level: 'medium',
    severity: 'low',
    owasp: 'A05:2021 Security Misconfiguration',
    run(ctx) {
      const evidence = [];
      if (!headerValue(ctx, 'permissions-policy')) evidence.push({ file: 'Header', line: 0, text: 'Permissions-Policy is missing' });
      if (!headerValue(ctx, 'cross-origin-opener-policy')) evidence.push({ file: 'Header', line: 0, text: 'Cross-Origin-Opener-Policy is missing' });
      if (!evidence.length) return pass('Both headers are set.');
      return fail(evidence.length + ' header(s) missing.', 'Add Permissions-Policy (disable unused features) and Cross-Origin-Opener-Policy: same-origin.', evidence);
    },
  }),
  dyn({
    id: 'trace-method',
    title: 'HTTP TRACE is disabled',
    category: 'Headers and transport',
    level: 'medium',
    severity: 'low',
    owasp: 'A05:2021 Security Misconfiguration',
    async run(ctx) {
      const res = await ctx.client.request(ctx.url('/'), { method: 'TRACE' });
      if (res.error) return skip('The request failed: ' + res.error);
      if (res.status === 200 && /TRACE/.test(res.body)) {
        return fail('The server answers TRACE requests.', 'Disable the TRACE method in the web server.', [{ file: 'TRACE /', line: 0, text: 'status 200' }]);
      }
      return pass('TRACE is not answered.');
    },
  }),
  dyn({
    id: 'xss-reflected',
    title: 'Reflected XSS canary on common query parameters (home page)',
    category: 'Injection',
    level: 'basic',
    severity: 'high',
    owasp: 'A03:2021 Injection',
    async run(ctx) {
      const params = ['q', 'search', 's', 'query', 'name', 'id', 'redirect', 'next', 'url', 'callbackUrl', 'returnUrl', 'message', 'error'];
      const qs = params.map((p) => p + '=' + encodeURIComponent(XSS_MARK)).join('&');
      const res = await ctx.client.request(ctx.url('/?' + qs));
      if (res.error) return skip('The request failed: ' + res.error);
      if (!/html/i.test(res.headers['content-type'] || '')) return na('The home page is not HTML.');
      const i = res.body.indexOf('<b7q>');
      if (i === -1) return pass('The test input was not reflected unescaped by the home page.');
      const snippet = res.body.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ');
      return fail(
        'User input from the query string is written into the page without escaping.',
        'HTML-encode user input before it is written into the page, and add a Content-Security-Policy.',
        [{ file: 'GET /?q=...', line: 0, text: snippet }]
      );
    },
  }),
  dyn({
    id: 'open-redirect',
    title: 'No open redirect on common login and logout paths',
    category: 'Injection',
    level: 'medium',
    severity: 'medium',
    owasp: 'A01:2021 Broken Access Control',
    async run(ctx) {
      const evil = 'https://' + EVIL_HOST;
      const params = ['url', 'next', 'redirect', 'redirect_uri', 'returnUrl', 'return_to', 'callbackUrl', 'continue', 'to'];
      const qs = params.map((k) => k + '=' + encodeURIComponent(evil)).join('&');
      const found = [];
      for (const p of ['/', '/login', '/logout', '/signin', '/auth/login']) {
        const res = await ctx.client.request(ctx.url(p + '?' + qs));
        if (res.error) continue;
        const loc = String(res.headers.location || '');
        const dest = loc.toLowerCase().replace(/^https?:/, '');
        if (res.status >= 300 && res.status < 400 && dest.indexOf('//' + EVIL_HOST) === 0) {
          found.push({ file: 'GET ' + p, line: 0, text: 'redirects to ' + loc });
        }
      }
      if (!found.length) return pass('No redirect to an outside address was triggered.');
      return fail('The app redirects to any address given in the URL.', 'Only redirect to relative paths or to an allowlist of hosts.', found);
    },
  }),
];

module.exports = { checks };