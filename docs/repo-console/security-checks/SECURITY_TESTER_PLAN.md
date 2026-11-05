# Security Tester (Repo Console extension) - V1 Plan

## 1. Goal

Add a Security page to Repo Console that:

1. Inspects the selected repo and works out its stack (frontend, database, auth).
2. Picks only the attacks that make sense for that stack.
3. Runs them against the running app (dynamic) and against the code (static).
4. Produces a score, per-level results, and a concrete list of what to improve, with file and line when known.

The core idea of V1: detect first, attack second. Nothing generic is run blindly.

## 2. Safety rules

- Target allowlist: localhost, 127.0.0.1, private ranges. Any other host needs an explicit per-project "I own this" confirmation.
- Safe mode: write and race tests only run when the target is flagged dev or test.
- Canary payloads only. Probes report "reflected" or "executed"; nothing is exfiltrated.
- Hard caps: requests per second, total requests, total run time. Kill switch in the UI.
- The engine reads .env locally in the main process. It uses key names, URL schemes and presence flags only. Secret values are never sent to the AI, stored in the DB, or written to reports.
- Reports redact cookies, tokens, passwords and connection strings.

## 3. Levels

Levels are cumulative and each category has tests per level.

- Basic: the minimum bar every app must meet.
- Medium: common real attack variants and misconfigurations.
- Advanced: bypasses, blind and timing attacks, chained attacks.

A level counts as achieved only when the level below passes.

## 4. Detection layer (runs first)

Output of detection is one Stack Profile object. The user can see it in the UI and override any field.

### 4.1 Frontend and framework detection

Signals, strongest first:

| Stack               | Signals                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Next.js             | `next` in package.json, next.config.js or next.config.mjs, app/ or pages/ folder, .next/ |
| Nuxt                | `nuxt` dependency, nuxt.config.\*                                                        |
| React (Vite or CRA) | `react` and `react-dom`, vite.config.\* or `react-scripts`, src/main.jsx or src/index.js |
| Vue                 | `vue` dependency, .vue files, vite.config.\*                                             |
| Svelte or SvelteKit | `svelte` or `@sveltejs/kit`, svelte.config.js                                            |
| Angular             | `@angular/core`, angular.json                                                            |
| Laravel (Blade)     | composer.json with `laravel/framework`, resources/views/\*.blade.php                     |
| Plain HTML          | index.html with no framework dependency, or only script tags                             |
| Unknown             | fallback: generic header, cookie and injection checks only                               |

Also detect: bundler (vite, webpack, next), SSR or SPA, TypeScript or JavaScript, backend framework (express, fastify, koa, nest, laravel, next api routes), package manager (lockfile), dev server port (scripts, vite config, .env PORT).

### 4.2 Database detection

Signals, checked in this order:

1. ORM or schema files: prisma/schema.prisma (provider field), drizzle config, typeorm config, sequelize config, knex config, mongoose models.
2. Driver dependencies: pg, mysql2, mysql, sqlite3, better-sqlite3, sql.js, mongodb, mongoose, redis, @supabase/supabase-js, firebase and firebase-admin, @prisma/client, @planetscale/database.
3. .env keys and URL scheme only: DATABASE*URL, DB*_, MONGO_, SUPABASE*\*, FIREBASE*\* (scheme such as postgres://, mysql://, mongodb://, file:). Values are never kept.
4. Docker and compose files (database/dockerClient.js area): postgres, mysql, mongo, redis images.
5. Laravel: config/database.php default and .env DB_CONNECTION.

Result: dialect (postgres, mysql, sqlite, mongodb, supabase, firebase, unknown), access layer (raw driver, query builder, ORM), and the list of files that touch the DB.

### 4.3 Authentication detection

Signals:

- Dependencies: next-auth or auth.js, better-auth, lucia, passport, express-session, cookie-session, jsonwebtoken, jose, @clerk/_, @auth0/_, @supabase/auth-helpers or supabase auth, firebase auth, bcrypt or argon2, laravel/sanctum, laravel/passport, laravel/breeze or jetstream.
- Code patterns found via the symbol index: login, signin, refresh, logout routes, middleware that verifies a token or session, cookie set calls.
- .env keys only: JWT*SECRET, NEXTAUTH_SECRET, SESSION_SECRET, AUTH*_, CLERK\__, AUTH0\_\*.

Result: mechanism (session cookie, JWT in header, JWT in cookie, third-party provider, none found), library, where tokens are stored client-side (cookie, localStorage, sessionStorage, memory), and the list of protected and public routes when it can be derived.

### 4.4 Route and surface discovery

Used by every attack pack so attacks target real endpoints:

- Static: Next.js app/api and pages/api route files, express route registrations, Laravel routes/\*.php, form actions, fetch and axios calls found in frontend code.
- OpenAPI or Swagger file if present (reuse renderer/swaggerImport.js parsing).
- Optional crawl of the running app (links, forms, XHR seen), depth-limited.

Result: list of endpoints with method, params, body fields, auth required (guess), and source file:line.

## 5. Stack Profile object (contract)

    {
      "frontend": { "framework": "nextjs", "language": "ts", "rendering": "ssr", "bundler": "next" },
      "backend": { "framework": "next-api", "port": 3000 },
      "database": { "dialect": "postgres", "layer": "prisma", "files": ["..."] },
      "auth": { "mechanism": "jwt-cookie", "library": "next-auth", "clientStorage": "cookie" },
      "env": { "keysPresent": ["DATABASE_URL", "NEXTAUTH_SECRET"], "publicPrefixKeys": ["NEXT_PUBLIC_API"] },
      "surface": { "endpoints": [], "forms": [], "openapi": false },
      "confidence": { "frontend": 0.95, "database": 0.9, "auth": 0.7 }
    }

Each attack module declares which profile values it applies to. A module that does not apply is reported as "Not applicable" and excluded from the score.

## 6. V1 attack packs

Each pack lists tests by level. Dynamic = against the running app. Static = against the code.

### 6.1 Universal pack (always runs)

Basic:

- HTTPS redirect, HSTS present (dynamic)
- Security headers present: CSP, X-Content-Type-Options, frame-ancestors or X-Frame-Options, Referrer-Policy (dynamic)
- Cookie flags: HttpOnly, Secure, SameSite on session cookies (dynamic)
- Sensitive paths: /.env, /.git, backup files, source maps, directory listing, stack traces in errors (dynamic)
- Secrets committed: credentials.json, gmail-store.json, .env not gitignored, hardcoded keys (static)
- npm audit results (static)

Medium:

- CSP quality: unsafe-inline, unsafe-eval, wildcards, missing object-src, base-uri (dynamic)
- Permissions-Policy, COOP, CORP (dynamic)
- CORS: wildcard with credentials, Origin reflection, null origin (dynamic)
- Mixed content, TLS version (dynamic)
- Lockfile integrity, outdated majors (static)

Advanced:

- CSP bypass candidates through allowed hosts, nonce reuse (dynamic)
- Secret entropy scan across git history (static)
- Certificate chain and expiry (dynamic)

### 6.2 Frontend pack (chosen by detected framework)

Shared across frameworks:

- Basic: tokens or JWTs stored in localStorage or sessionStorage (static plus live page check). Recommends httpOnly cookie.
- Basic: reflected XSS probes on every discovered query param and form field (dynamic)
- Medium: stored XSS probes through forms with a canary that tries to read localStorage and document.cookie and reports whether it succeeded (dynamic)
- Medium: dangerous DOM sinks (innerHTML, outerHTML, document.write, eval, new Function, insertAdjacentHTML) fed by non-constant input (static)
- Advanced: context-specific payloads (attribute, script, URL), postMessage origin checks, prototype pollution to XSS (dynamic and static)

Per framework:

| Framework            | Extra tests                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js              | dangerouslySetInnerHTML with dynamic data; NEXT*PUBLIC* variables that look like secrets; API routes missing auth checks; middleware matcher gaps and path-normalization bypass; server actions without CSRF or auth; security headers set in next.config; source maps exposed in production; next/image remote patterns too open (SSRF) |
| React                | dangerouslySetInnerHTML; javascript: URLs in href or src from data; REACT*APP* or VITE\_ secret leakage; tokens in localStorage; source maps exposed                                                                                                                                                                                     |
| Vue and Nuxt         | v-html with dynamic data; dynamic :href and :src; template injection through user-controlled templates; VITE* or NUXT_PUBLIC* secret leakage; Nuxt server routes missing auth                                                                                                                                                            |
| Svelte and SvelteKit | {@html} with dynamic data; form actions missing CSRF origin check; PUBLIC\_ env leakage                                                                                                                                                                                                                                                  |
| Angular              | bypassSecurityTrust\* calls; innerHTML bindings; environment.ts secrets                                                                                                                                                                                                                                                                  |
| Laravel Blade        | {!! !!} unescaped output; missing @csrf in forms; mass assignment ($guarded empty, $fillable all); APP_DEBUG on; routes outside auth middleware                                                                                                                                                                                          |
| Plain HTML           | inline scripts and handlers (blocks strict CSP); missing SRI on CDN scripts; target=\_blank without noopener; forms posting over http; missing CSP                                                                                                                                                                                       |
| Unknown              | universal pack only, plus generic reflected XSS probes                                                                                                                                                                                                                                                                                   |

### 6.3 Database pack (chosen by detected dialect and layer)

Static (all SQL dialects):

- Basic: string-concatenated or template-literal SQL passed to driver calls (query, run, exec, execute), reported with file:line
- Medium: unsafe ORM escape hatches: prisma $queryRawUnsafe and $executeRawUnsafe, sequelize.query with interpolation, knex.raw with interpolation, typeorm query with interpolation
- Medium: user-controlled ORDER BY, column or table names

Dynamic (all SQL dialects), targeted at endpoints that static analysis tied to a DB call:

- Basic: error-based probes (quote breaks, dialect error signatures), boolean-based pairs (true vs false response difference)
- Medium: time-based blind using the detected dialect's delay function; JSON body injection; injection via headers on endpoints that read them; second-order candidates (stored value later used in a query)
- Advanced: stacked queries where the driver allows them, UNION column-count probing, encoding and WAF-evasion variants, chaining with auth bypass probes

Dialect specifics (probe sets are selected from the detected dialect):

- Postgres, MySQL, SQLite: different error signatures and delay functions
- MongoDB or Mongoose: operator injection ($ne, $gt, $regex, $where) in JSON bodies and query strings, strictQuery and sanitize settings, $where and mapReduce usage in code
- Supabase: tables without row level security, anon key access to tables, service role key exposed in frontend env
- Firebase: open Firestore or Realtime rules, public storage bucket
- Redis: unauthenticated exposure check on the configured port (local only)

Codebase-aware step: queries and table or column names used in the attacks come from the real code and schema (prisma schema, models, migrations, DB inspector data), so payloads match how the app actually queries.

### 6.4 Auth pack (chosen by detected mechanism and library)

Basic:

- Protected routes (from discovery) return 401 or 403 without credentials (dynamic)
- Login does not reveal whether a username exists (dynamic)
- Password hashing present: bcrypt or argon2 used, not plain or md5 or sha1 (static)
- JWT secret not hardcoded or weak, secret key only read from env (static)
- Session or token cookie flags (shared with universal pack)

Medium:

- Rate limit on login and password reset (burst test, expects 429) (dynamic)
- Rate limit bypass attempts: X-Forwarded-For rotation, case and whitespace variants (dynamic)
- Session invalidated on logout (dynamic)
- Cookie prefixes and scope (dynamic)
- CSRF protection on state-changing routes for cookie-based auth (dynamic)
- JWT: expiry present and enforced, algorithm pinned (static and dynamic)
- IDOR check using two test users, when test credentials are provided (dynamic)

Advanced:

- JWT attacks: alg none, tampered claims, expired token accepted (dynamic)
- Refresh token rotation and reuse detection (dynamic)
- Auth bypass attempts on protected routes: path tricks (//, /./, trailing slash, case), verb tampering, X-HTTP-Method-Override, X-Original-URL (dynamic)
- Timing-based user enumeration (dynamic)
- Idempotency and race conditions on auth-adjacent actions: parallel login attempts, parallel password reset token use (dynamic, safe mode only)

Library-specific:

- next-auth or auth.js: NEXTAUTH_SECRET set, callbackUrl open redirect, session strategy, cookie settings
- passport and express-session: session store not MemoryStore in production, cookie options, secret strength
- Clerk, Auth0, Supabase auth, Firebase auth: server-side token verification present on API routes, no trust of client-supplied user ids
- Laravel Sanctum or Passport: token abilities, CSRF cookie flow

## 7. Scoring

- Severity weights: critical 10, high 7, medium 4, low 2, info 0.
- Category score = passed weight / applicable weight.
- Overall score = weighted average of categories, shown as a percentage and grade A to F.
- Per-level score: Basic, Medium, Advanced shown separately.
- Not-applicable and skipped tests are excluded from the score and listed separately.
- Low detection confidence is shown next to the score so the user knows what was assumed.

## 8. Finding format and report

Each finding contains:

- id, title, severity, level, category
- what was tested and against which endpoint
- redacted evidence (request and response excerpts)
- OWASP Top 10 and CWE mapping
- file:line when the static pass found the cause
- concrete fix, written for the detected stack (for example "use prisma.$queryRaw with tagged template" or "move token to httpOnly cookie in next-auth config")

Report outputs: on-screen results, JSON, Markdown, HTML. SARIF comes with the CI phase.

The "Make fix ticket" button groups findings into a prompt for the code-output loop, with the Stack Profile and the affected file paths included, so the AI can request the right files and implement the fixes.

## 9. Architecture and files

New:

- services/security/engine.js (orchestrator: detect, select, run, score)
- services/security/targetGuard.js (allowlist, caps, kill switch)
- services/security/httpClient.js (rate-capped requests, redaction)
- services/security/scorer.js
- services/security/report.js
- services/security/remediation.js (stack-specific fix text)
- services/security/detect/stackDetector.js
- services/security/detect/dbDetector.js
- services/security/detect/authDetector.js
- services/security/detect/envReader.js (keys and schemes only)
- services/security/detect/surfaceDiscovery.js
- services/security/static/sinkScanner.js (DOM sinks, secrets, unsafe SQL, unsafe ORM calls; uses database/symbols.js and indexer data)
- services/security/packs/universal.js, frontend.js, database.js, auth.js (each exports modules: id, category, level, severity, applies(profile), run(ctx))
- ipc/security_ipc.js
- preload/security_bridge.js
- worker-service/tasks/securityScan.js (floods and long runs off the main process)
- renderer/repoConsole/security/ (page, state, profileCard, resultsView, findingDetail)
- renderer/styles/repo-console-security.css (added to the css build)
- tests/security\*.test.mjs and tests/fixtures/security/ (see section 11)

Changed (after reading the current files):

- main.js and preload.js (register IPC and bridge)
- renderer/repoConsole/pages.js and index.js (add the Security page and nav entry)
- database/consoleDb.js (tables: security_runs, security_findings, security_profiles)
- scripts/build-css.mjs (include the new css)

## 10. Build phases for V1

Phase 1: detection and shell

- stackDetector, dbDetector, authDetector, envReader, surfaceDiscovery
- Stack Profile shown in a Security page with manual override
- targetGuard and settings (target URL, safe mode flag, test credentials)
- Done when: pointing at a Next, React, Vue and plain HTML sample repo each produces the correct profile.

Phase 2: universal pack and scoring

- universal pack at Basic and Medium, scorer, results view, JSON and Markdown export, run history in consoleDb
- Done when: a hardened fixture scores near 100 percent and a weak fixture lists every planted flaw.

Phase 3: frontend and database packs

- sinkScanner, frontend pack per framework, XSS probes with localStorage canary, database pack static plus dynamic SQL and Mongo probes
- Done when: planted XSS and SQL injection flaws in fixtures are detected, with file:line, and the clean fixture produces no false positives.

Phase 4: auth pack

- auth detection driven tests, rate limit tests, bypass attempts, JWT tests, IDOR with test users
- Done when: planted auth flaws in fixtures are detected.

Phase 5: Advanced level and reports

- advanced tests across packs, race and idempotency tests (safe mode only), HTML report, run diff and trend
- Make fix ticket button

Later (not V1): CI gate stage with threshold and baseline file, SARIF export, change-aware runs, Electron hardening checks, more stacks (Django, Rails, Spring).

## 11. Testing the tester

- tests/fixtures/security/ holds small servers:
  - vulnerable-next-like, vulnerable-express-sql, vulnerable-mongo, vulnerable-html: each with known planted flaws
  - hardened: the same apps done correctly
- Every test module must detect its planted flaw in the vulnerable fixture and pass on the hardened one.
- Detection tests: sample repos (package.json and file layouts) for each stack, expected Stack Profile asserted.
- Safety tests: targetGuard refuses public hosts without confirmation, caps hold, redaction removes planted secrets from reports.

## 12. Open questions

- Test credentials: where should they be stored (secretHolder tool) and how many roles are needed (user A, user B, admin)?
- How should the dev server be started for a run: use the existing console runner, or the user starts it manually and enters the URL?
- Which frameworks and backends do your real projects use most, so Phase 3 packs are done in that order?
- Are test and production databases separated in your projects (needed for safe mode)?
