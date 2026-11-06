'use strict';

const TOOL_PATH_RE = /(?:^|\/)services\/security\//;
const COMMENT_RE = /^(?:\/\/|\*|\/\*|#|<!--)/;
const DEVISH_PATH_RE = /(?:^|[\/._-])(?:dev|development|local|example|sample|template)(?:[\/._-]|$)/i;

const PUBLIC_ENV_REF_RE = /(?:process\.env|import\.meta\.env)\.((?:NEXT_PUBLIC_|VITE_|REACT_APP_|NUXT_PUBLIC_|PUBLIC_|EXPO_PUBLIC_|GATSBY_)[A-Z0-9_]+)/g;
const STRONG_ENV_RE = /SECRET|PRIVATE|PASSW(?:OR)?D|SERVICE_ROLE|DATABASE_URL|DB_URL|CONNECTION_STRING|ACCESS_KEY|SIGNING/;
const SAFE_ENV_RE = /ANON|PUBLISHABLE|PUBLIC_KEY|SITE_KEY|MAPS|MEASUREMENT|CLIENT_ID|APP_ID|PROJECT_ID/;
const WEAK_ENV_RE = /TOKEN|API_KEY|APIKEY|AUTH_KEY|CREDENTIAL/;

const MASS_RULES = [
  {
    re: /\bObject\.assign\s*\(\s*[A-Za-z_$][\w$.]*\s*,\s*req\.body\b/,
    severity: 'high',
    confidence: 'review',
    title: 'Object.assign copies the whole request body onto an object',
    detail: 'If the target is a database entity, a caller can set fields such as role or isAdmin.',
    fix: 'Copy only the fields you allow, or validate the body with a DTO or schema that strips unknown keys.',
  },
  {
    re: /\bdata\s*:\s*(?:\{\s*\.\.\.\s*)?req\.body\b/,
    severity: 'high',
    confidence: 'confirmed',
    title: 'Request body is passed straight to the database as data',
    detail: 'Every field in the body is written, including fields the caller should never control.',
    fix: 'Build the data object from a fixed list of allowed fields, or validate with zod or class-validator using whitelist: true.',
  },
  {
    re: /\bnew\s+[A-Z][\w$]*\s*\(\s*req\.body\s*\)/,
    severity: 'high',
    confidence: 'review',
    title: 'Model is created from the whole request body',
    detail: 'A caller can set any field the model accepts. This is safe only if the model restricts its fillable fields.',
    fix: 'Pick the allowed fields from the body, or make the model accept an explicit whitelist.',
  },
  {
    re: /\.(?:create|update|updateOne|updateMany|insert|insertOne|upsert|findOneAndUpdate|findByIdAndUpdate)\s*\(\s*(?:[^,()]+,\s*)?(?:\{\s*\.\.\.\s*)?req\.body\s*[,)}]/,
    severity: 'high',
    confidence: 'review',
    title: 'Database write takes the whole request body',
    detail: 'A caller can set any field. This is safe only if a schema or DTO strips unknown fields first.',
    fix: 'Pass an object built from allowed fields, or validate the body with a whitelist before this call.',
  },
  {
    re: /(?:create|update|fill|forceFill|updateOrCreate)\s*\(\s*\$request->all\s*\(\s*\)/,
    severity: 'high',
    confidence: 'review',
    title: 'Laravel model is filled from $request->all()',
    detail: 'Unless $fillable is tight, a caller can set protected columns such as is_admin.',
    fix: 'Use $request->validated() with a FormRequest, or $request->only([...]) with an explicit list.',
  },
];

const FETCH_CALL_RE = /\b(?:fetch|axios(?:\.(?:get|post|put|delete|request|head))?|got(?:\.(?:get|post|stream))?|needle\.get|superagent\.get|http\.get|https\.get|http\.request|https\.request|httpService\.(?:get|post)|request)\s*\(/;
const REQ_INPUT_RE = /\breq\.(?:query|body|params)\b/;
const REQ_URLISH_RE = /\breq\.(?:query|body|params)\.(?:url|uri|link|target|endpoint|host|src|image|callback|webhook|redirect)\b/;
const SSRF_GUARD_RE = /allowlist|allowedHosts|allowed_hosts|isAllowed|isPrivate|isInternal|whitelist/i;

const DEBUG_RULES = [
  {
    re: /\bAPP_DEBUG\s*[:=]\s*['"]?true\b/i,
    title: 'APP_DEBUG is set to true',
    detail: 'Debug mode shows stack traces and configuration to anyone who triggers an error.',
    fix: 'Set APP_DEBUG=false in every production config.',
  },
  {
    re: /^\s*DEBUG\s*=\s*True\b/,
    only: /\.py$/i,
    title: 'Django or Python DEBUG is True',
    detail: 'Debug mode shows settings, SQL and stack traces on error pages.',
    fix: 'Read DEBUG from the environment and default it to False.',
  },
  {
    re: /\b(?:FLASK_DEBUG\s*[:=]\s*['"]?(?:1|true)\b|app\.run\s*\([^)]*debug\s*=\s*True)/i,
    title: 'Flask debug mode is enabled',
    detail: 'The Flask debugger allows code execution from the browser if it is reachable.',
    fix: 'Never run with debug enabled in production.',
  },
  {
    re: /\bapp\.set\s*\(\s*['"]env['"]\s*,\s*['"]development['"]/,
    title: 'Express env is forced to development',
    detail: 'Express shows stack traces and skips view caching in development mode.',
    fix: 'Remove the override and let NODE_ENV decide.',
  },
  {
    re: /\bprocess\.env\.NODE_ENV\s*=\s*['"]development['"]/,
    title: 'NODE_ENV is forced to development in code',
    detail: 'Libraries switch to verbose errors and relaxed checks in development mode.',
    fix: 'Remove the assignment and set NODE_ENV from the deployment environment.',
  },
  {
    re: /\bNODE_ENV\s*[:=]\s*['"]?development\b/,
    only: /\.(?:ya?ml|json)$/i,
    title: 'NODE_ENV is set to development in a config file',
    detail: 'If this file is used in production, libraries run in development mode.',
    fix: 'Use NODE_ENV=production in production configs.',
  },
];

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

function classifyEnvKey(key) {
  if (STRONG_ENV_RE.test(key)) return 'strong';
  if (SAFE_ENV_RE.test(key)) return null;
  if (WEAK_ENV_RE.test(key)) return 'weak';
  return null;
}

function createTests(h) {
  const { finding, outcome } = h;

  const at = (item, data) =>
    finding(
      Object.assign(
        { file: item.file.rel, line: item.index + 1, evidence: item.line.trim().slice(0, 180) },
        data
      )
    );

  return [
    {
      id: 'client-env-secrets',
      title: 'No secrets in browser-exposed environment variables',
      category: 'Frontend',
      level: 'basic',
      severity: 'high',
      kind: 'static',
      owasp: 'A02:2021 Cryptographic Failures',
      cwe: 'CWE-200',
      why: 'Variables with a public prefix are copied into the JavaScript bundle, so anyone can read them in the browser.',
      fixTitle: 'Keep secret values out of public environment variables',
      run: async (ctx) => {
        const findings = [];
        const reported = new Set();
        for (const item of codeLines(ctx)) {
          PUBLIC_ENV_REF_RE.lastIndex = 0;
          let m = PUBLIC_ENV_REF_RE.exec(item.line);
          while (m) {
            const key = m[1];
            const kind = classifyEnvKey(key);
            if (kind && !reported.has(key)) {
              reported.add(key);
              findings.push(
                at(item, {
                  severity: kind === 'strong' ? 'high' : 'medium',
                  confidence: kind === 'strong' ? 'confirmed' : 'review',
                  title: key + ' is exposed to the browser',
                  detail:
                    kind === 'strong'
                      ? 'The name suggests a secret, but this prefix ships the value to every visitor.'
                      : 'The name may hold a token or key. If it is meant to be public (for example a maps key), restrict it by domain in the provider dashboard.',
                  fix: 'Remove the public prefix and read the value only on the server. Rotate it if it was ever deployed.',
                })
              );
            }
            m = PUBLIC_ENV_REF_RE.exec(item.line);
          }
        }
        const profileKeys = ctx.profile && ctx.profile.env && Array.isArray(ctx.profile.env.publicPrefixKeys) ? ctx.profile.env.publicPrefixKeys : [];
        for (const key of profileKeys) {
          if (reported.has(key)) continue;
          const kind = classifyEnvKey(key);
          if (!kind) continue;
          reported.add(key);
          findings.push(
            finding({
              severity: kind === 'strong' ? 'high' : 'medium',
              confidence: kind === 'strong' ? 'confirmed' : 'review',
              title: key + ' is defined with a public prefix',
              detail: 'This name appears in an env file with a prefix that is shipped to the browser. Only the name was checked, never the value.',
              evidence: 'Env file key: ' + key,
              fix: 'Rename it without the public prefix and read it only on the server. Rotate the value if it was ever deployed.',
            })
          );
        }
        return outcome(findings);
      },
    },
    {
      id: 'mass-assignment',
      title: 'Request bodies are not written straight to the database',
      category: 'Database',
      level: 'medium',
      severity: 'high',
      kind: 'static',
      owasp: 'A01:2021 Broken Access Control',
      cwe: 'CWE-915',
      why: 'Writing the whole request body lets a caller set fields they should never control, such as role or ownership.',
      fixTitle: 'Whitelist the fields that can be written',
      run: async (ctx) => {
        const findings = [];
        for (const item of codeLines(ctx)) {
          for (const rule of MASS_RULES) {
            if (!rule.re.test(item.line)) continue;
            findings.push(
              at(item, {
                severity: rule.severity,
                confidence: rule.confidence,
                title: rule.title,
                detail: rule.detail,
                fix: rule.fix,
              })
            );
            break;
          }
        }
        return outcome(findings);
      },
    },
    {
      id: 'ssrf',
      title: 'Outbound requests are not built from request input',
      category: 'Universal',
      level: 'medium',
      severity: 'high',
      kind: 'static',
      owasp: 'A10:2021 Server-Side Request Forgery',
      cwe: 'CWE-918',
      why: 'If a caller controls the address the server fetches, they can reach internal services and cloud metadata endpoints.',
      fixTitle: 'Validate outbound request targets against an allowlist',
      run: async (ctx) => {
        const findings = [];
        for (const item of codeLines(ctx)) {
          const line = item.line;
          if (!FETCH_CALL_RE.test(line)) continue;
          const guarded = SSRF_GUARD_RE.test(windowText(item.file, item.index - 6, item.index + 2));
          if (guarded) continue;
          if (REQ_INPUT_RE.test(line)) {
            findings.push(
              at(item, {
                severity: 'high',
                confidence: 'confirmed',
                title: 'Outbound request uses request input in the address',
                detail: 'A caller can point the server at internal addresses such as localhost or a cloud metadata service.',
                fix: 'Parse the URL, allow only known hosts over https, and reject private and loopback addresses before fetching.',
              })
            );
            continue;
          }
          if (REQ_URLISH_RE.test(windowText(item.file, item.index - 3, item.index + 3))) {
            findings.push(
              at(item, {
                severity: 'high',
                confidence: 'review',
                title: 'Outbound request may use a caller-supplied address',
                detail: 'A request field that looks like a URL appears near this call. If it reaches the address unchecked, this is server-side request forgery.',
                fix: 'Validate the address against an allowlist of hosts before fetching.',
              })
            );
          }
        }
        return outcome(findings);
      },
    },
    {
      id: 'debug-mode',
      title: 'Debug mode is not forced on in configuration',
      category: 'Universal',
      level: 'basic',
      severity: 'medium',
      kind: 'static',
      owasp: 'A05:2021 Security Misconfiguration',
      cwe: 'CWE-489',
      why: 'Debug mode exposes stack traces, settings and sometimes an interactive console to anyone who can trigger an error.',
      fixTitle: 'Turn debug mode off in production configuration',
      run: async (ctx) => {
        const findings = [];
        for (const item of codeLines(ctx)) {
          if (DEVISH_PATH_RE.test(item.file.rel)) continue;
          for (const rule of DEBUG_RULES) {
            if (rule.only && !rule.only.test(item.file.rel)) continue;
            if (!rule.re.test(item.line)) continue;
            findings.push(
              at(item, {
                severity: 'medium',
                confidence: 'review',
                title: rule.title,
                detail: rule.detail + ' Ignore this if the file is only used for local development.',
                fix: rule.fix,
              })
            );
            break;
          }
        }
        return outcome(findings);
      },
    },
  ];
}

module.exports = { createTests };