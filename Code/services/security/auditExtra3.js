'use strict';

const fs = require('fs');

const TOOL_PATH_RE = /(?:^|\/)services\/security\//;
const COMMENT_RE = /^(?:\/\/|\*|\/\*|#|<!--)/;
const DEVISH_PATH_RE = /(?:^|[\/._-])(?:dev|development|local|example|sample|template)(?:[\/._-]|$)/i;
const MAX_DOCKERFILE_BYTES = 200 * 1024;

const DOCKERFILE_RE = /^Dockerfile(?:\..+)?$|\.dockerfile$/i;
const WORKFLOW_RE = /^\.github\/workflows\/[^/]+\.ya?ml$/i;
const SECRET_NAME_RE = /PASSWORD|PASSWD|SECRET|TOKEN|PRIVATE_KEY|API_KEY|APIKEY|ACCESS_KEY|CREDENTIAL/i;
const FILE_SUFFIX_RE = /_FILE$/i;

const FIRST_PARTY_ACTION_OWNERS = new Set(['actions', 'github']);
const SHA_RE = /^[0-9a-f]{40}$/;
const RUN_BLOCK_RE = /^[|>][+-]?\d*\s*(?:#.*)?$/;
const SECRETS_EXPR_RE = /\$\{\{\s*secrets\./;
const INJECTION_EXPR_RE = /\$\{\{\s*(?:github\.head_ref|github\.event\.(?:issue\.(?:title|body)|pull_request\.(?:title|body|head\.ref|head\.label)|comment\.body|review\.body|review_comment\.body|head_commit\.(?:message|author\.(?:email|name))|commits\[[^\]]*\]\.(?:message|author\.(?:email|name))|pages\[[^\]]*\]\.page_name|discussion\.(?:title|body)))\s*\}\}/;
const NPM_INSTALL_RE = /\bnpm\s+(?:install|i)(?:\s*$|\s+--)/;
const PR_HEAD_REF_RE = /\bref:\s*\$\{\{\s*github\.(?:event\.pull_request\.head\.(?:sha|ref)|head_ref)/;

const WEBHOOK_ROUTE_RE = /\.(?:post|all|route|use)\s*\(\s*['"`][^'"`]*webhook[^'"`]*['"`]|@(?:Post|All)\s*\(\s*['"`][^'"`]*webhook|stripe-signature|x-hub-signature|x-slack-signature|svix-signature/i;
const WEBHOOK_INPUT_RE = /\b(?:req|request|ctx)\.(?:body|headers|rawBody)\b|@Body\s*\(|@Headers\s*\(|@Req\s*\(/;
const WEBHOOK_VERIFY_RE = /constructEvent|verifyHeader|verifySignature|verifyWebhook|validateRequest|createHmac|timingSafeEqual|subtle\.verify|new\s+Webhook\s*\(|webhooks?\.verify|@UseGuards\s*\(|\.verify\s*\(\s*(?:payload|body|rawBody|req\.rawBody)/i;

const MULTER_LITERAL_RE = /\bmulter\s*\(\s*(?:\{|\))/;
const NEST_UPLOAD_RE = /\b(?:FileInterceptor|FilesInterceptor)\s*\(\s*['"`][^'"`]+['"`](?:\s*,\s*\d+)?\s*\)|\bAnyFilesInterceptor\s*\(\s*\)/;
const ORIGINALNAME_RE = /\.originalname\b/;
const ORIGINALNAME_SINK_RE = /(?:path\.)?(?:join|resolve)\s*\(|writeFile|createWriteStream|\.mv\s*\(|rename\s*\(/;
const ORIGINALNAME_SAFE_RE = /basename|sanitize|slugify|uuid|randomUUID|randomBytes|Date\.now/i;

const COOKIE_AUTH = new Set(['session-cookie', 'session-or-jwt-cookie', 'jwt-cookie']);
const CSRF_LIBS = ['csurf', 'csrf-csrf', 'csrf-sync', 'lusca', '@fastify/csrf-protection', 'csrf', 'tiny-csrf', '@dr.pogodin/csurf'];
const BUILTIN_CSRF_AUTH = new Set(['next-auth', '@auth/core', 'better-auth', 'lucia', 'clerk', 'auth0']);
const CSRF_TOKEN_RE = /\b(?:csrf|xsrf)/i;
const SAMESITE_STRICT_RE = /\bsameSite\s*:\s*['"](?:lax|strict)['"]/i;

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

/* ---------- Dockerfile analysis ---------- */

function dockerInstructions(text) {
  const out = [];
  const raw = text.split(/\r?\n/);
  let buf = '';
  let start = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
    const trimmed = line.trim();
    if (!buf) {
      if (!trimmed || trimmed[0] === '#') continue;
      start = i;
    } else if (trimmed[0] === '#') {
      continue;
    }
    const continues = /\\\s*$/.test(line);
    buf += (buf ? ' ' : '') + trimmed.replace(/\\\s*$/, '').trim();
    if (!continues) {
      out.push({ line: start + 1, text: buf });
      buf = '';
    }
  }
  if (buf) out.push({ line: start + 1, text: buf });
  return out;
}

function envPairs(rest) {
  const pairs = [];
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(rest)) {
    const re = /([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S*)/g;
    let m = re.exec(rest);
    while (m) {
      pairs.push({ name: m[1], value: m[2].replace(/^["']|["']$/g, '') });
      m = re.exec(rest);
    }
    return pairs;
  }
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s+(.*)$/.exec(rest);
  if (m) pairs.push({ name: m[1], value: m[2].trim() });
  return pairs;
}

function analyzeDockerfile(text, skipRootCheck) {
  const issues = [];
  const stages = [];
  const instructions = dockerInstructions(text);

  for (const item of instructions) {
    const m = /^(\w+)\s*(.*)$/.exec(item.text);
    if (!m) continue;
    const cmd = m[1].toUpperCase();
    const rest = m[2];

    if (cmd === 'FROM') {
      const tokens = rest.split(/\s+/).filter((t) => t && !t.startsWith('--'));
      const image = tokens[0] || '';
      const alias = tokens[1] && tokens[1].toUpperCase() === 'AS' && tokens[2] ? tokens[2].toLowerCase() : null;
      const lower = image.toLowerCase();
      const parent = stages.find((s) => s.alias && s.alias === lower);
      if (image && lower !== 'scratch' && !parent && image.indexOf('$') === -1) {
        const hasDigest = image.indexOf('@sha256:') !== -1;
        const tagMatch = /:([^/@]+)(?:@.*)?$/.exec(image);
        const tag = tagMatch ? tagMatch[1] : '';
        if (tag === 'latest' || (!tag && !hasDigest)) {
          issues.push({
            line: item.line,
            severity: 'low',
            confidence: 'confirmed',
            title: 'Base image "' + image + '" is not pinned to a version',
            detail: 'A floating tag changes without notice, so builds are not reproducible and can pull in unreviewed changes.',
            evidence: item.text.slice(0, 160),
            fix: 'Pin an exact version tag (for example node:20.11-alpine), or a digest (image@sha256:...).',
          });
        }
      }
      stages.push({ alias, fromLine: item.line, user: parent ? parent.user : null });
      continue;
    }

    const current = stages[stages.length - 1];

    if (cmd === 'USER' && current) {
      current.user = rest.trim().split(':')[0];
      continue;
    }

    if (cmd === 'ADD') {
      const tokens = rest.split(/\s+/).filter((t) => t && !t.startsWith('--'));
      if (tokens[0] && /^https?:\/\//i.test(tokens[0]) && !/--checksum/.test(rest)) {
        issues.push({
          line: item.line,
          severity: 'medium',
          confidence: 'confirmed',
          title: 'ADD downloads a remote file with no checksum',
          detail: 'The file is fetched at build time and is not verified, so a changed or hijacked download goes straight into the image.',
          evidence: item.text.slice(0, 160),
          fix: 'Use ADD --checksum=sha256:... or download with curl and verify the hash, or COPY a file that is committed to the repository.',
        });
      }
      continue;
    }

    if (cmd === 'ENV') {
      for (const pair of envPairs(rest)) {
        if (!SECRET_NAME_RE.test(pair.name) || FILE_SUFFIX_RE.test(pair.name) || !pair.value) continue;
        const literal = pair.value.charAt(0) !== '$';
        issues.push({
          line: item.line,
          severity: literal ? 'high' : 'medium',
          confidence: literal ? 'confirmed' : 'review',
          title: 'Secret-looking ENV ' + pair.name + ' is stored in the image',
          detail: 'ENV values are saved in the image layers and in docker history, so anyone who can pull the image can read them.',
          evidence: 'ENV ' + pair.name + '=***',
          fix: 'Pass the value at run time (docker run -e, orchestrator secrets) or mount it as a file. Rotate it if the image was ever shared.',
        });
      }
      continue;
    }

    if (cmd === 'ARG') {
      const am = /^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/.exec(rest.trim());
      if (!am || !SECRET_NAME_RE.test(am[1]) || FILE_SUFFIX_RE.test(am[1])) continue;
      const def = (am[2] || '').replace(/^["']|["']$/g, '');
      const literal = !!def && def.charAt(0) !== '$';
      issues.push({
        line: item.line,
        severity: literal ? 'high' : 'medium',
        confidence: literal ? 'confirmed' : 'review',
        title: 'Secret-looking ARG ' + am[1] + ' is visible in the image history',
        detail: 'Build arguments are recorded in docker history, so a secret passed this way can be read from the image.',
        evidence: 'ARG ' + am[1] + (def ? '=***' : ''),
        fix: 'Use BuildKit secret mounts (RUN --mount=type=secret) instead of build arguments for secrets.',
      });
    }
  }

  if (stages.length && !skipRootCheck) {
    const final = stages[stages.length - 1];
    if (!final.user || /^(?:root|0)$/i.test(final.user)) {
      issues.push({
        line: final.fromLine,
        severity: 'medium',
        confidence: 'confirmed',
        title: 'The container runs as root',
        detail: final.user
          ? 'The final stage switches to the root user, so a bug in the app gives full control inside the container.'
          : 'No USER instruction was found in the final stage, so the app runs as root.',
        evidence: 'Final stage starts at line ' + final.fromLine,
        fix: 'Create an unprivileged user and add USER (for example USER node on the official Node images) before CMD.',
      });
    }
  }

  return issues;
}

/* ---------- GitHub Actions analysis ---------- */

function analyzeWorkflow(file) {
  const out = [];
  const lines = file.lines;
  const usesPullRequestTarget = lines.some((l) => !COMMENT_RE.test(l.trim()) && /(?:^|[\s\[,])pull_request_target\b/.test(l));
  let run = null;

  const add = (index, data) => {
    out.push(Object.assign({ line: index + 1, evidence: lines[index].trim().slice(0, 180) }, data));
  };

  const checkRunText = (text, index) => {
    if (INJECTION_EXPR_RE.test(text)) {
      add(index, {
        severity: 'high',
        confidence: 'confirmed',
        title: 'Untrusted text is placed directly into a shell command',
        detail: 'Titles, bodies and branch names are controlled by whoever opens the issue or pull request, so this lets them run commands in the workflow.',
        fix: 'Pass the value through an env: variable and read it as "$VAR" in the script instead of using ${{ }} inside run.',
      });
    }
    if (SECRETS_EXPR_RE.test(text)) {
      add(index, {
        severity: 'medium',
        confidence: 'confirmed',
        title: 'A secret is interpolated directly into a run script',
        detail: 'The value is expanded into the script text, which can leak it through logs, error output or shell quoting problems.',
        fix: 'Map the secret to an environment variable with env: and read it as "$NAME" in the script.',
      });
    }
    if (NPM_INSTALL_RE.test(text) && !/(?:\s|^)(?:-g|--global)\b/.test(text)) {
      add(index, {
        severity: 'low',
        confidence: 'review',
        title: 'npm install is used instead of npm ci',
        detail: 'npm install can change versions and the lockfile during CI. If the project has no lockfile, ignore this.',
        fix: 'Use npm ci so CI installs exactly the versions in the lockfile.',
      });
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || COMMENT_RE.test(trimmed)) continue;
    const indent = line.length - line.trimStart().length;

    if (run) {
      if (indent > run.keyIndent) {
        checkRunText(line, i);
        continue;
      }
      run = null;
    }

    const runMatch = /^(\s*)(-\s+)?run:\s*(.*)$/.exec(line);
    if (runMatch) {
      const keyIndent = runMatch[1].length + (runMatch[2] ? 2 : 0);
      const rest = runMatch[3].trim();
      if (RUN_BLOCK_RE.test(rest)) run = { keyIndent };
      else if (rest) checkRunText(rest, i);
      continue;
    }

    if (/^\s*permissions:\s*write-all\b/.test(line)) {
      add(i, {
        severity: 'medium',
        confidence: 'confirmed',
        title: 'Workflow grants write-all permissions',
        detail: 'Every job token can change code, packages, issues and more, so one compromised step has wide reach.',
        fix: 'Set permissions: contents: read at the top, and grant extra scopes only to the jobs that need them.',
      });
    }

    const usesMatch = /^\s*(?:-\s+)?uses:\s*([^\s#'"]+)/.exec(line);
    if (usesMatch) {
      const spec = usesMatch[1];
      if (spec.startsWith('./') || spec.startsWith('docker://')) continue;
      const at = spec.indexOf('@');
      const ref = at === -1 ? '' : spec.slice(at + 1);
      const owner = spec.split('/')[0].toLowerCase();
      if (FIRST_PARTY_ACTION_OWNERS.has(owner)) continue;
      if (!SHA_RE.test(ref)) {
        add(i, {
          severity: 'low',
          confidence: 'confirmed',
          title: 'Third-party action is not pinned to a commit SHA',
          detail: 'A tag or branch can be moved by the action owner, so a compromised action would run with your secrets.',
          fix: 'Pin the full 40-character commit SHA (uses: owner/repo@<sha> # v1.2.3) and update it with Dependabot or Renovate.',
        });
      }
      continue;
    }

    if (usesPullRequestTarget && PR_HEAD_REF_RE.test(line)) {
      add(i, {
        severity: 'high',
        confidence: 'confirmed',
        title: 'pull_request_target checks out code from the pull request',
        detail: 'This trigger runs with repository secrets and a write token, so running code from an outside pull request lets it steal them.',
        fix: 'Use the pull_request trigger for untrusted code, or never check out or run the PR head in a pull_request_target workflow.',
      });
    }
  }
  return out;
}

/* ---------- tests ---------- */

function createTests(h) {
  const { finding, outcome, na, hasAny } = h;

  const at = (item, data) =>
    finding(
      Object.assign(
        { file: item.file.rel, line: item.index + 1, evidence: item.line.trim().slice(0, 180) },
        data
      )
    );

  return [
    {
      id: 'docker-hardening',
      title: 'Dockerfiles follow basic hardening',
      category: 'Universal',
      level: 'medium',
      severity: 'medium',
      kind: 'static',
      owasp: 'A05:2021 Security Misconfiguration',
      cwe: 'CWE-250',
      why: 'Root containers, floating base images and baked-in secrets turn a small bug into a large incident.',
      fixTitle: 'Harden Dockerfiles',
      run: async (ctx) => {
        const dockerfiles = ctx.files.filter((f) => DOCKERFILE_RE.test(f.rel.split('/').pop()));
        if (!dockerfiles.length) return na('Not applicable: no Dockerfile was found.');
        const findings = [];
        for (const f of dockerfiles) {
          if (f.size > MAX_DOCKERFILE_BYTES) continue;
          let text;
          try {
            text = fs.readFileSync(f.abs, 'utf8');
          } catch (e) {
            continue;
          }
          const issues = analyzeDockerfile(text, DEVISH_PATH_RE.test(f.rel));
          for (const issue of issues) {
            findings.push(
              finding({
                severity: issue.severity,
                confidence: issue.confidence,
                title: issue.title,
                detail: issue.detail,
                file: f.rel,
                line: issue.line,
                evidence: issue.evidence,
                fix: issue.fix,
              })
            );
          }
        }
        return outcome(findings);
      },
    },
    {
      id: 'github-actions',
      title: 'GitHub Actions workflows are hardened',
      category: 'Universal',
      level: 'medium',
      severity: 'high',
      kind: 'static',
      owasp: 'A08:2021 Software and Data Integrity Failures',
      cwe: 'CWE-1357',
      why: 'CI runs with your secrets and write access, so an injectable or unpinned workflow is a direct route into the project.',
      fixTitle: 'Harden GitHub Actions workflows',
      run: async (ctx) => {
        const files = ctx.corpus.filter((f) => !f.isTest && WORKFLOW_RE.test(f.rel));
        if (!files.length) return na('Not applicable: no GitHub Actions workflows were found.');
        const findings = [];
        for (const file of files) {
          for (const issue of analyzeWorkflow(file)) {
            findings.push(
              finding({
                severity: issue.severity,
                confidence: issue.confidence,
                title: issue.title,
                detail: issue.detail,
                file: file.rel,
                line: issue.line,
                evidence: issue.evidence,
                fix: issue.fix,
              })
            );
          }
        }
        return outcome(findings);
      },
    },
    {
      id: 'webhook-signature',
      title: 'Webhook handlers verify the sender signature',
      category: 'Universal',
      level: 'medium',
      severity: 'high',
      kind: 'static',
      owasp: 'A07:2021 Identification and Authentication Failures',
      cwe: 'CWE-345',
      why: 'Without a signature check, anyone who finds the webhook URL can send fake payment, push or message events.',
      fixTitle: 'Verify webhook signatures',
      run: async (ctx) => {
        const findings = [];
        for (const file of ctx.corpus) {
          if (file.isTest || TOOL_PATH_RE.test(file.rel)) continue;
          let routeIndex = -1;
          for (let i = 0; i < file.lines.length; i += 1) {
            const line = file.lines[i];
            if (line.length > 2000) continue;
            const trimmed = line.trim();
            if (!trimmed || COMMENT_RE.test(trimmed)) continue;
            if (WEBHOOK_ROUTE_RE.test(line)) {
              routeIndex = i;
              break;
            }
          }
          const text = file.lines.join('\n');
          if (routeIndex === -1 && /webhook/i.test(file.rel) && WEBHOOK_INPUT_RE.test(text)) routeIndex = 0;
          if (routeIndex === -1) continue;
          if (WEBHOOK_VERIFY_RE.test(text)) continue;
          findings.push(
            finding({
              severity: 'high',
              confidence: 'review',
              title: 'Webhook handler does not verify a signature',
              detail: 'No signature check was found in this file. If verification happens in a guard or service in another file, this is safe.',
              file: file.rel,
              line: routeIndex + 1,
              evidence: file.lines[routeIndex].trim().slice(0, 180),
              fix: 'Verify the provider signature on the raw request body before trusting the payload (Stripe constructEvent, GitHub and Slack HMAC with timingSafeEqual).',
            })
          );
        }
        return outcome(findings);
      },
    },
    {
      id: 'upload-hardening',
      title: 'File uploads have size limits and safe names',
      category: 'Universal',
      level: 'medium',
      severity: 'medium',
      kind: 'static',
      owasp: 'A04:2021 Insecure Design',
      cwe: 'CWE-434',
      why: 'Unlimited uploads exhaust disk and memory, and client file names can overwrite files or escape the upload folder.',
      fixTitle: 'Add limits, filters and safe names to uploads',
      run: async (ctx) => {
        const findings = [];
        for (const item of codeLines(ctx)) {
          const line = item.line;
          if (MULTER_LITERAL_RE.test(line)) {
            const win = windowText(item.file, item.index, item.index + 10);
            if (!/\blimits\b/.test(win)) {
              findings.push(
                at(item, {
                  severity: 'medium',
                  confidence: 'confirmed',
                  title: 'multer is configured without a file size limit',
                  detail: 'A single large upload can fill the disk or exhaust memory.',
                  fix: 'Add limits: { fileSize: 5 * 1024 * 1024, files: 1 } to the multer options.',
                })
              );
            }
            if (!/\bfileFilter\b/.test(win)) {
              findings.push(
                at(item, {
                  severity: 'low',
                  confidence: 'review',
                  title: 'multer is configured without a fileFilter',
                  detail: 'Any file type is accepted. If the type is checked later in the handler, this is fine.',
                  fix: 'Add a fileFilter that accepts only the MIME types and extensions you expect.',
                })
              );
            }
          }
          if (NEST_UPLOAD_RE.test(line)) {
            findings.push(
              at(item, {
                severity: 'medium',
                confidence: 'review',
                title: 'Upload interceptor has no size limit or file filter',
                detail: 'Only the field name is configured. If limits are set globally on the module, this is fine.',
                fix: 'Pass options such as { limits: { fileSize: 5 * 1024 * 1024 }, fileFilter } as the second argument.',
              })
            );
          }
          if (ORIGINALNAME_RE.test(line) && ORIGINALNAME_SINK_RE.test(line) && !ORIGINALNAME_SAFE_RE.test(line)) {
            findings.push(
              at(item, {
                severity: 'medium',
                confidence: 'review',
                title: 'The client file name is used to build a file path',
                detail: 'The name comes from the uploader and can overwrite existing files or contain path tricks.',
                fix: 'Generate the stored name yourself (randomUUID plus a checked extension) and keep the original name only as metadata.',
              })
            );
          }
        }
        return outcome(findings);
      },
    },
    {
      id: 'csrf-protection',
      title: 'Cookie-based auth has CSRF protection',
      category: 'Auth',
      level: 'medium',
      severity: 'medium',
      kind: 'static',
      owasp: 'A01:2021 Broken Access Control',
      cwe: 'CWE-352',
      why: 'When the browser sends the session cookie automatically, another website can trigger actions as the logged-in user.',
      fixTitle: 'Add CSRF protection for cookie sessions',
      run: async (ctx) => {
        const auth = ctx.profile.auth || {};
        const backend = ctx.profile.backend ? ctx.profile.backend.framework : 'unknown';
        if (!COOKIE_AUTH.has(auth.mechanism)) return na('Not applicable: no cookie-based login was detected.');
        if (backend === 'unknown') return na('Not applicable: no backend framework was detected.');
        if (backend === 'laravel') return na('Not applicable: Laravel includes CSRF protection by default.');
        if (auth.library && BUILTIN_CSRF_AUTH.has(String(auth.library).toLowerCase())) return outcome([]);
        if (hasAny(ctx.deps.names, CSRF_LIBS)) return outcome([]);

        let tokenSeen = false;
        let sameSiteSeen = false;
        for (const item of codeLines(ctx)) {
          if (CSRF_TOKEN_RE.test(item.line)) tokenSeen = true;
          if (SAMESITE_STRICT_RE.test(item.line)) sameSiteSeen = true;
          if (tokenSeen) break;
        }
        if (tokenSeen) return outcome([]);

        if (sameSiteSeen) {
          return outcome([
            finding({
              severity: 'low',
              confidence: 'review',
              title: 'CSRF protection relies on SameSite cookies only',
              detail: 'SameSite lax or strict blocks most cross-site requests, but not same-site subdomains or older browsers, and no CSRF token or library was found.',
              fix: 'Add a CSRF token (csrf-csrf, or @fastify/csrf-protection) for state-changing routes, or check the Origin header on them.',
            }),
          ]);
        }
        return outcome([
          finding({
            severity: 'medium',
            confidence: 'review',
            title: 'No CSRF protection was found for cookie-based login',
            detail: 'No CSRF library, token handling or SameSite lax/strict setting was found. If the API only accepts an Authorization header, ignore this.',
            fix: 'Set sameSite: "lax" (or "strict") on the session cookie and add a CSRF token (csrf-csrf, @fastify/csrf-protection) or an Origin check on state-changing routes.',
          }),
        ]);
      },
    },
  ];
}

module.exports = { createTests };