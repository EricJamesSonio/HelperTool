'use strict';

const http = require('http');
const https = require('https');
const { isLocalHost } = require('./targetGuard');

const COMMENT_RE = /^(?:\/\/|\*|\/\*|#|<!--)/;
const TOOL_PATH_RE = /(?:^|\/)services\/security\//;
const TRACE_TIMEOUT_MS = 8000;
const TRACE_MAX_BODY = 65536;
const HSTS_MIN_SECONDS = 15552000;

const ISOLATION_HEADERS = [
  { name: 'Permissions-Policy', key: 'permissions-policy', why: 'It lets the page switch off browser features it does not use, such as camera, microphone and geolocation.' },
  { name: 'Cross-Origin-Opener-Policy', key: 'cross-origin-opener-policy', why: 'It isolates the page from windows opened by other sites.' },
  { name: 'Cross-Origin-Resource-Policy', key: 'cross-origin-resource-policy', why: 'It stops other sites from loading your responses as images or scripts.' },
];

const GRAPHQL_SERVER_DEPS = [
  '@apollo/server',
  'apollo-server',
  'apollo-server-express',
  'apollo-server-core',
  'apollo-server-fastify',
  'graphql-yoga',
  '@graphql-yoga/node',
  '@nestjs/graphql',
  '@nestjs/apollo',
  'mercurius',
  'express-graphql',
  'graphql-http',
  'type-graphql',
  '@pothos/core',
];
const GRAPHQL_LIMIT_DEPS = [
  'graphql-depth-limit',
  'graphql-query-complexity',
  'graphql-validation-complexity',
  'graphql-armor',
  '@escape.tech/graphql-armor',
  'graphql-cost-analysis',
  '@envelop/depth-limit',
];
const GRAPHQL_LIMIT_PREFIXES = ['@graphql-armor/'];
const GRAPHQL_LIMIT_CODE_RE = /\bdepthLimit\s*\(|createComplexityRule|queryComplexity|\bmaxDepth\s*:|\bcostLimit\s*:|\bGraphQLArmor\b|ProtectionPlugin/;
const INTROSPECTION_ON_RE = /\bintrospection\s*:\s*true\b/;
const PLAYGROUND_ON_RE = /\b(?:playground|graphiql)\s*:\s*true\b|\bApolloServerPluginLandingPageGraphQLPlayground\s*\(/;
const ENV_GATE_RE = /NODE_ENV|isProd|isProduction|isDev|isDevelopment|process\.env\.(?:APP_ENV|ENVIRONMENT)/i;

const DEPENDABOT_RE = /^\.github\/dependabot\.ya?ml$/i;
const RENOVATE_RE = /^(?:\.github\/|\.gitlab\/)?(?:renovate\.json5?|\.renovaterc(?:\.json5?)?)$/i;
const SAST_RE = /github\/codeql-action|\bcodeql\b|\bsemgrep\b|\bsnyk\b|sonarcloud|sonarqube|\bnjsscan\b|\btrivy\b/i;

function sendTrace(base, token) {
  return new Promise((resolve) => {
    const lib = base.protocol === 'https:' ? https : http;
    const hostname = base.hostname.replace(/^\[|\]$/g, '');
    let settled = false;
    let req = null;

    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      req = lib.request(
        {
          protocol: base.protocol,
          hostname,
          port: base.port || undefined,
          path: '/',
          method: 'TRACE',
          agent: false,
          headers: { 'User-Agent': 'HelperTool-SecurityTest/1', 'X-Trace-Probe': token },
          timeout: TRACE_TIMEOUT_MS,
        },
        (res) => {
          const chunks = [];
          let size = 0;
          const finish = () => done({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
          res.on('data', (chunk) => {
            size += chunk.length;
            if (size <= TRACE_MAX_BODY) chunks.push(chunk);
            else res.destroy();
          });
          res.on('end', finish);
          res.on('close', finish);
          res.on('error', finish);
        }
      );
    } catch (e) {
      done({ error: e && e.message ? e.message : 'request failed' });
      return;
    }

    req.on('timeout', () => {
      req.destroy();
      done({ error: 'timed out' });
    });
    req.on('error', (e) => done({ error: (e && (e.code || e.message)) || 'request failed' }));
    req.end();
  });
}

function depMatches(deps, names, prefixes) {
  for (const dep of deps) {
    if (names.includes(dep)) return true;
    if (prefixes && prefixes.some((p) => dep.startsWith(p))) return true;
  }
  return false;
}

function createTests(h) {
  const { finding, outcome, skip, na, headerFix, hasAny } = h;

  return [
    {
      id: 'dyn-isolation-headers',
      title: 'Live: isolation headers are sent',
      category: 'Universal',
      level: 'medium',
      severity: 'low',
      kind: 'dynamic',
      owasp: 'A05:2021 Security Misconfiguration',
      cwe: 'CWE-693',
      why: 'These headers reduce what other sites and injected scripts can do with your pages.',
      fixTitle: 'Send Permissions-Policy and cross-origin isolation headers',
      run: async (ctx) => {
        const res = ctx.net.root;
        const note = ' Checked on the target used for this run; a production host may differ, so check that too.';
        const findings = [];
        for (const item of ISOLATION_HEADERS) {
          if (res.headers.get(item.key)) continue;
          findings.push(
            finding({
              severity: 'low',
              title: 'Missing ' + item.name + ' header',
              detail: item.why + note,
              evidence: 'GET / -> ' + res.status + ', header absent',
              fix: headerFix(ctx.profile, item.name),
            })
          );
        }
        return outcome(findings);
      },
    },
    {
      id: 'dyn-trace',
      title: 'Live: HTTP TRACE is disabled',
      category: 'Universal',
      level: 'medium',
      severity: 'low',
      kind: 'dynamic',
      owasp: 'A05:2021 Security Misconfiguration',
      cwe: 'CWE-16',
      why: 'A server that answers TRACE echoes request headers back, which can expose cookies and credentials to scripts.',
      fixTitle: 'Disable the TRACE method',
      run: async (ctx) => {
        const token = 'hsx' + Math.random().toString(36).slice(2, 10);
        const res = await sendTrace(ctx.net.base, token);
        if (res.error) return skip('The TRACE request could not be sent (' + res.error + ').');
        if (res.status === 200 && res.body.toLowerCase().includes(token)) {
          return outcome([
            finding({
              severity: 'low',
              title: 'The server answers TRACE and echoes the request',
              detail: 'A random header sent with a TRACE request came back in the response body.',
              evidence: 'TRACE / -> 200, probe header echoed',
              fix: 'Disable the TRACE method in the web server or reverse proxy (nginx: return 405 for TRACE; Apache: TraceEnable off).',
            }),
          ]);
        }
        return outcome([]);
      },
    },
    {
      id: 'dyn-https',
      title: 'Live: HTTPS is enforced',
      category: 'Universal',
      level: 'basic',
      severity: 'medium',
      kind: 'dynamic',
      owasp: 'A02:2021 Cryptographic Failures',
      cwe: 'CWE-319',
      why: 'Without HTTPS and a long HSTS lifetime, traffic and logins can be read or downgraded on the network.',
      fixTitle: 'Redirect http to https and set a long HSTS max-age',
      run: async (ctx) => {
        const base = ctx.net.base;
        const root = ctx.net.root;

        if (base.protocol === 'https:') {
          const hsts = root.headers.get('strict-transport-security') || '';
          if (!hsts) return na('The target has no Strict-Transport-Security header. The security headers check reports that.');
          const m = /max-age=(\d+)/i.exec(hsts);
          if (m && Number(m[1]) >= HSTS_MIN_SECONDS) return outcome([]);
          return outcome([
            finding({
              severity: 'low',
              title: 'HSTS max-age is shorter than 6 months or missing',
              detail: 'A short lifetime lets browsers fall back to http soon after the last visit.',
              evidence: 'Strict-Transport-Security: ' + hsts.slice(0, 120),
              fix: headerFix(ctx.profile, 'Strict-Transport-Security: max-age=31536000; includeSubDomains'),
            }),
          ]);
        }

        if (isLocalHost(base.hostname.replace(/^\[|\]$/g, ''))) {
          return na('The target is plain http on this computer. HTTPS applies to the production host.');
        }

        const location = root.headers.get('location') || '';
        if (root.status >= 300 && root.status < 400 && /^https:/i.test(location)) return outcome([]);
        return outcome([
          finding({
            severity: 'medium',
            confidence: 'review',
            title: 'The http address does not redirect to https',
            detail: 'The target is served over plain http and answered without a redirect to https. If this is a staging host on a private network, this may be intended.',
            evidence: 'GET / -> ' + root.status + (location ? ', Location: ' + location.slice(0, 120) : ''),
            fix: 'Redirect all http requests to https at the web server or CDN, then add Strict-Transport-Security.',
          }),
        ]);
      },
    },
    {
      id: 'graphql-hardening',
      title: 'GraphQL servers are hardened',
      category: 'Universal',
      level: 'medium',
      severity: 'medium',
      kind: 'static',
      owasp: 'A05:2021 Security Misconfiguration',
      cwe: 'CWE-400',
      why: 'Open introspection and unlimited query depth make it easy to map the API and to exhaust the server with one request.',
      fixTitle: 'Disable introspection in production and limit query cost',
      run: async (ctx) => {
        if (!hasAny(ctx.deps.names, GRAPHQL_SERVER_DEPS)) return na('Not applicable: no GraphQL server library is a dependency of this project.');
        const findings = [];

        for (const file of ctx.corpus) {
          if (file.isTest || TOOL_PATH_RE.test(file.rel)) continue;
          for (let i = 0; i < file.lines.length; i += 1) {
            const line = file.lines[i];
            if (line.length > 2000) continue;
            const trimmed = line.trim();
            if (!trimmed || COMMENT_RE.test(trimmed)) continue;
            const introspection = INTROSPECTION_ON_RE.test(line);
            const playground = PLAYGROUND_ON_RE.test(line);
            if (!introspection && !playground) continue;
            const around = file.lines.slice(Math.max(0, i - 4), i + 5).join('\n');
            if (ENV_GATE_RE.test(around)) continue;
            findings.push(
              finding({
                severity: introspection ? 'medium' : 'low',
                confidence: 'review',
                title: introspection ? 'GraphQL introspection is enabled' : 'GraphQL playground or GraphiQL is enabled',
                detail: introspection
                  ? 'Introspection returns the whole schema to anyone, which maps every query and type for an attacker. No environment check was found nearby; if it is only on in development, this is fine.'
                  : 'The interactive explorer is turned on. No environment check was found nearby; if it is only on in development, this is fine.',
                file: file.rel,
                line: i + 1,
                evidence: trimmed.slice(0, 180),
                fix: 'Set it to process.env.NODE_ENV !== "production" so it is off in production.',
              })
            );
          }
        }

        const limiterInCode = ctx.corpus.some((file) => !file.isTest && file.lines.some((l) => l.length < 2000 && GRAPHQL_LIMIT_CODE_RE.test(l)));
        if (!limiterInCode) {
          for (const r of ctx.deps.byRoot) {
            if (!hasAny(r.deps, GRAPHQL_SERVER_DEPS)) continue;
            if (depMatches(r.deps, GRAPHQL_LIMIT_DEPS, GRAPHQL_LIMIT_PREFIXES)) continue;
            findings.push(
              finding({
                severity: 'low',
                confidence: 'review',
                title: 'No GraphQL depth or complexity limit in ' + (r.rel || 'root'),
                detail: 'No limiter package or setup was found, so one deeply nested query can use a lot of CPU and memory. If a gateway enforces limits in front of this server, ignore this.',
                file: r.file,
                fix: 'Add graphql-depth-limit and graphql-query-complexity (or GraphQL Armor) as validation rules, and cap the query size.',
              })
            );
          }
        }

        return outcome(findings);
      },
    },
    {
      id: 'automation-hygiene',
      title: 'Dependency updates and code scanning are automated',
      category: 'Universal',
      level: 'medium',
      severity: 'low',
      kind: 'static',
      owasp: 'A06:2021 Vulnerable and Outdated Components',
      cwe: 'CWE-1104',
      why: 'Automatic update pull requests and code scanning catch problems early. This is hygiene, not a vulnerability.',
      fixTitle: 'Enable Dependabot or Renovate and a code scanning workflow',
      run: async (ctx) => {
        const paths = ctx.files.map((f) => f.rel);
        if (!paths.some((p) => p.startsWith('.github/'))) return na('Not applicable: no .github folder was found, so GitHub automation does not apply.');

        const findings = [];
        const hasUpdates = paths.some((p) => DEPENDABOT_RE.test(p) || RENOVATE_RE.test(p));
        if (!hasUpdates) {
          findings.push(
            finding({
              severity: 'low',
              confidence: 'review',
              title: 'No Dependabot or Renovate configuration was found',
              detail: 'Nothing proposes dependency updates automatically. If another service handles this outside the repository, ignore it.',
              fix: 'Add .github/dependabot.yml with the npm ecosystem (and github-actions), or a renovate.json file.',
            })
          );
        }

        const hasScan = ctx.corpus.some((file) => file.rel.startsWith('.github/workflows/') && file.lines.some((l) => SAST_RE.test(l)));
        if (!hasScan) {
          findings.push(
            finding({
              severity: 'low',
              confidence: 'review',
              title: 'No CodeQL or other code scanning workflow was found',
              detail: 'No workflow runs CodeQL, Semgrep, Snyk or Sonar. A scanner that runs outside GitHub, such as a Snyk app, cannot be seen from the files.',
              fix: 'Add the CodeQL workflow (GitHub: Security, Code scanning, Set up) or a Semgrep workflow.',
            })
          );
        }

        return outcome(findings);
      },
    },
  ];
}

module.exports = { createTests };