# Repo Console CI Engine - Architecture Audit (Phase 0)

Status: audit complete for the files supplied, read-only. No code was changed.
Date: 2026-11-04
Target: HelperTool (Electron), Repo Console

## 0. Scope of this audit

Inspected (full source read):

- services/consoleRunner.js, services/consoleManifest.js, services/consoleEnv.js
- database/consoleDb.js
- ipc/repoConsole_ipc.js
- preload.js (the real preload) and preload/repo_bridge.js
- renderer/repoConsole.js, renderer/repoConsole/index.js, state.js, pages.js, monitor.js
- terminal/terminal-session.js, terminal/error-cop/command-runner.js, error-parser.js, error-detector.js, error-engine.js, error-storage.js, deduplicator.js, notification-service.js
- database/errorCopDb.js, ipc/error_cop_ipc.js
- harness/testRunner.js
- utils/gitOps.js, ipc/gitService.js
- main.js, config/config.js, package.json
- tests/helpers.mjs, tests/selectShortcuts.test.mjs (as the test convention sample)

Not inspected yet (needed later, see section 10):

- renderer/styles/repo-console.css, repo-console-layout.css, scripts/build-css.mjs
- ipc/terminal_ipc.js, tests/rendererBundle.test.mjs
- A real repository's .github/workflows/*.yml and package.json files

## 1. Executive summary

1. The existing Repo Console pipeline (renderer -> preload -> IPC -> consoleRunner -> consoleDb -> renderer) is a good base for CI. It already provides line-streamed stdout/stderr, process-tree kill, interactive stdin, per-step status, a live output pane, a floating job pill, persisted history with full logs, and a manifest trust model.
2. The runner is missing several things CI needs: step dependencies and skip-on-failure, timeouts, exit reason (signal/timeout), argv execution without a shell, per-job secret masking, and a step end hook.
3. History can be extended in place (console.db). No second database is needed. Schema v2 adds job columns on run_steps, a run_errors table, and uses the already-present but unused runs.meta_json column for the plan snapshot.
4. ErrorCop's CommandRunner must NOT be used to execute CI. It runs commands by typing them into an interactive pty shell, so exit codes and completion are not reliable. Only two pure pieces of ErrorCop are worth reusing: parseLine() and Deduplicator.
5. harness/testRunner.js is a buffered, non-streaming, non-cancellable helper for the harness. Leave it untouched.
6. The preload bridge that the app actually loads is preload.js (inlined bridges). preload/repo_bridge.js does not contain Repo Console methods and is not required by preload.js. New IPC methods go in preload.js.
7. There is no YAML parser in package.json. One dependency must be added (recommended: yaml).
8. There are no tests for consoleManifest or consoleRunner today. Characterization tests must be written before the runner is extended.
9. Tray Exit calls app.exit(0), which per Electron docs does not emit before-quit. The runner's stopAll() is registered on before-quit, so running jobs may be orphaned on that path. Needs verification and a fix.

## 2. Current flow, traced end to end

Renderer: renderer/repoConsole/state.js call(name, payload) -> window.repoConsoleAPI[name](payload). Throws if the response has ok === false.

Preload: preload.js repoConsoleBridge exposes catalog, run, tests, stop, input, job, history, historyRun, historyClear, trust, onEvent. Each is ipcRenderer.invoke('repoConsole:<name>'). onEvent uses removeAllListeners then on('repoConsole:event'), so there is exactly one subscriber at a time.

IPC: ipc/repoConsole_ipc.js register({ app, config, getMainWindow }). handle(channel, fn) wraps every handler and returns { ok: true, ...out } or { ok: false, error, status }. knownRepo(repoPath) rejects paths not in config.readConfig().projects or missing on disk. register() inits consoleDb, marks leftover running rows as interrupted, inits the manifest trust file, creates the runner, and registers app.on('before-quit', runner.stopAll).

Service: consoleManifest.describe(repoPath) builds the catalog (detected actions or .helper/console.json). resolveAction() plans a target (display, command, cwd, appEnv, DB target). The run handler applies risk and confirmation rules and calls runner.startJob(repoPath, spec).

Runner: consoleRunner.createRunner(emit). One context per repoPath. startJob creates a job with steps, emits 'reset', then runAll() runs steps sequentially. runStep spawns step.command with shell: true, pipes stdout/stderr, splits lines, strips ANSI, redacts, pushes to a bounded in-memory log, to a DB buffer and to a pending emit buffer, flushed every 120 ms. Events emitted to the renderer: reset, log, job, finished.

History: consoleDb (node:sqlite, userData/repo-console/console.db) startRun, appendLogs (batched), finishRun. Tables runs, run_steps, run_logs, schema version via PRAGMA user_version.

Renderer back: index.js onEvent updates S.jobs, calls monitor.js (pill, output pane, live log append) and pages.js (cards, history list). Opening a history row calls historyRun and renders the same output pane in non-live mode.

## 3. Component audit

### 3.1 services/consoleRunner.js (reuse, extend)

Already provides:

- Incremental stdout/stderr streaming with partial-line flush after 250 ms (prompts without a newline).
- Start/end timestamps per step and per job, exit code, stopRequested.
- killTree: taskkill /T /F on Windows, process-group SIGTERM then SIGKILL elsewhere (spawn is detached on non-Windows).
- Explicit cwd per step; controlled env through childEnv() (removes APP_ENV, NODE_ENV, ENV_FILE, ELECTRON_RUN_AS_NODE, adds NO_COLOR).
- One running job per repoPath (409 otherwise). Different repos can run concurrently.
- Interactive stdin and autoAnswer.
- Jest/vitest progress parsing and JSON result collection for test steps.
- Emits only through a callback, so it has no Electron dependency and is unit-testable.

Gaps for CI:

| Gap | Evidence | Needed change |
| --- | --- | --- |
| Steps continue after a failure | runAll loops all steps and only sets failed = true | Opt-in dependsOn / stopOnFail per step. Default must stay as today so test runs keep running all suites |
| No timeout | spawn has no timer | Optional step.timeoutMs; on expiry kill the tree, mark reason 'timeout' |
| Exit reason lost | close handler takes (code) only, null code becomes -1 | Capture signal; add step.reason ('exit', 'signal', 'timeout', 'cancelled', 'spawn-error') |
| Command is one string run with shell: true | spawn(step.command, { shell: true }) | Optional step.argv with shell: false, so a CI step can run an explicit interpreter with a script file |
| Secret masking is regex-only | history.redact patterns | Optional per-job redactValues applied in pushLog before the generic redact |
| No per-step hook | none | Optional step.onEnd(stepView, lines) so a caller can extract errors without the runner knowing about CI |
| Flat steps only | stepView has no grouping | Optional step.jobId / jobTitle carried into stepView and history |
| Dropped lines are not shown | job.dropped is tracked, monitor.js never displays it | Show a notice and point to history for the full log |
| Output order between streams is approximate | separate stdout/stderr buffers | Acceptable; document it. Use one merged stream only if exact order becomes a requirement |
| Single job per repo, no queue | startJob throws 409 | Fine for v1 (duplicates are prevented). Queue in Phase 8 |
| New statuses | statuses are pending, running, done, failed, stopped, skipped | Add blocked (dependency failed). unsupported stays plan-level only |

Boundary rule: all additions are generic (dependsOn, timeoutMs, argv, redactValues, onEnd, jobId). Nothing in the runner may know about workflows, GitHub or `uses:`.

### 3.2 services/consoleManifest.js (reuse patterns, small exports)

- Trust model: sha256 of .helper/console.json stored in userData/repo-console/trust.json keyed by repoPath. Actions from an untrusted manifest are blocked. This is the right pattern for workflow files because they are repo-shipped commands too. Needed: export isInside() and generic helpers isTrusted(key, hash) / setTrusted(key, hash), and use a key namespace (for example ci:<repoPath>:<file>) so it cannot collide with the manifest key.
- Risk vocabulary (readonly, adds, changes, destructive) and the confirmation rules in the run handler can be reused for CI step risk badges.
- detect() already finds npm, Composer/artisan, Python, .NET, Go, Rust, Make and CMake actions. CI workflow discovery is separate and must not be folded into detect() (it is slower and has its own model).
- planTarget() validates cwd stays inside the repo. Same rule applies to working-directory in workflows.

### 3.3 services/consoleEnv.js (reuse as is)

resolveTarget() is about database targets. CI does not need it, except to warn when a workflow step looks like it touches a DB. childEnv(extra) merges extra after deleting APP_ENV/NODE_ENV, so workflow env: values such as NODE_ENV=test do reach the child. Good.

### 3.4 database/consoleDb.js (extend, schema v2)

- Uses PRAGMA user_version with a single migration block (if version < 1). Add if (version < 2).
- runs.meta_json exists in the schema but startRun never writes it. Use it for the CI snapshot (workflow file, workflow hash, mode, branch, HEAD, base, selected jobs, changed files with selection reasons, resolved plan). Cap the stored workflow text size.
- run_steps primary key is (run_id, idx). Add job_id, job_name, reason.
- Add run_errors for structured errors (section 6.4).
- lastRun(repoPath, actionId, env) requires an env value. CI runs should store env = 'local' so existing lookups and history filters keep working (decision D5).
- Logs are unbounded in run_logs. getRun reads up to 200000 lines. Add retention (keep last N runs per repo and/or max age) and a per-run line cap with a truncation marker.
- clearRuns and markInterrupted already cover the new tables only if they are extended. Both must delete from run_errors.
- history.redact() masks URL credentials, key=value secrets and Bearer tokens. It cannot mask arbitrary secret values; that is what redactValues in the runner is for.
- Available only when node:sqlite loads; everything no-ops when _db is null. CI must keep working (without history) in that case.

### 3.5 ipc/repoConsole_ipc.js (extend, same file)

- Reuse handle(), knownRepo(), the runner instance and the single event channel.
- Reuse stop, input, job, history, historyRun, historyClear unchanged.
- Add ci* channels (section 6.2). The renderer must never send commands; it sends a workflow file name, job ids, mode, base ref and a planHash. Main re-parses the workflow and rebuilds the plan itself.
- repoConsole_ipc is registered from a separate app.whenReady() block at the bottom of main.js (not through registerAllIpc, not feature-gated). Fine, but the module must also export a way for main.js to ask whether anything is running and to stop everything (section 3.8).

### 3.6 preload.js (extend; not preload/repo_bridge.js)

- main.js creates the window with preload.js, which says "Inline all bridge modules directly (no require() calls)". The Repo Console bridge is the inline repoConsoleBridge exposed as window.repoConsoleAPI.
- preload/repo_bridge.js contains only repo/select/docignore methods and is not loaded by preload.js. Do not add CI methods there.
- onEvent replaces the previous listener. All CI events must flow through the existing onEvent in renderer/repoConsole/index.js. Any new view that calls onEvent itself would silently unsubscribe the main one.

### 3.7 Renderer (extend)

- index.js: NAV array (seeds, database, scripts, tests, history), renderPage switch, onEvent dispatch, S.hooks. Add a ci page entry and handle kind 'ci' in the reset branch (today only kind 'action' auto-opens the live output).
- The environment switch (Local/Production) is shown only for seeds, database and scripts, so the CI page automatically has no env switch.
- state.js: statusLabel / statusChip need labels for blocked, unsupported, ready.
- pages.js: history action filter is built from catalog items and suites; add CI entries (actionId ci:<file>:<job> and ci:<file>:all). openConfirm() is the pattern for the plan confirmation modal.
- monitor.js: summaryTab/stepRow show a flat step list; CI needs job grouping. stageInfo/stageStrip show "step n of m"; for CI show job names. Per-step output is feasible today because log entries carry s (step index). Error-only filtering exists but is regex-based; add an Errors tab fed by run_errors.
- index.js dynamically imports ./importUI.js, which does not exist in the project tree (the "Paste actions" button therefore never appears). Harmless, but unrelated dead path worth knowing about.
- CSS: styles are separate files under renderer/styles plus bundles. How repo-console.css is bundled is unknown until scripts/build-css.mjs is read.

### 3.8 main.js lifecycle (fix needed)

- Closing the window hides it to the tray, so running jobs keep running while the user navigates or hides the app. That satisfies "executions continue while the user navigates away".
- Tray Exit runs cleanupAndExit(true) then app.exit(0). Electron documents that app.exit() does not emit before-quit or will-quit. repoConsole_ipc stops jobs only in a before-quit listener, so on this path running child processes may be left behind. cleanupAndExit() does not stop them either.
- Next app start marks them interrupted in history (markInterrupted), but the OS processes may still be alive.
- No warning exists for active jobs. The plan requires a documented shutdown policy.
- Proposed policy: repoConsole_ipc exports hasRunning() and stopAll(); the tray Exit handler asks for confirmation when hasRunning() is true; cleanupAndExit() always calls stopAll().

### 3.9 ErrorCop and terminal (reuse two pure functions only)

CommandRunner (terminal/error-cop/command-runner.js):

- Spawns an interactive shell in a pty and then types the command into it (p.write(command + newline)). The shell stays open after the command ends, so onExit does not fire when the command finishes. status and exitCode describe the shell, not the command.
- stdout and stderr are merged by the pty; there is no per-stream information.
- A missing cwd silently falls back to the home directory.
- No timeout. stop() deletes the entry from the map.
- Command text is concatenated into a shell line; there is no argv form.
- It also creates an ErrorCop session per run, which feeds the global unread badge and timeline.
- Verdict: unsuitable as the CI executor.

ErrorDetector / error-parser:

- Keyword and regex based over every output line (Error, Warning, Failed, Exception, ERR_*, stack frames). It cannot tell a failing process from a passing test whose name contains these words.
- Verdict: exit code and runner status are the source of truth for pass/fail; parseLine() may be used as a secondary hint only when a step already failed or exited non-zero.
- parseLine(raw) is pure and exported. Deduplicator is pure (md5 of title and message, per instance). Both can be reused without ErrorCop sessions.

ErrorStorage / errorCopDb: sql.js, separate database, sessions-oriented. CI errors are stored in console.db (run_errors) instead. A later optional "send to ErrorCop" action can forward a selected error.

terminal-session.js only contains detectProject/detectCommand. No process infrastructure.

Incidental findings (not part of CI, report only):

- ErrorStorage.purgeOldSessions builds an SQL fragment that looks invalid (datetime('now','localtime',?-||' days')). Not called in the files supplied.
- gitService.raw() uses ttlMs || 30000, so passing 0 cannot disable the cache.

### 3.10 harness/testRunner.js

spawn with shell: true, buffers all output until close, no streaming, no cancel, no timeout. Used by the harness. Leave untouched; do not build CI on it.

### 3.11 Git (new thin layer needed)

- utils/gitOps.js getStatus() (simple-git) returns working/staged files, branch, ahead/behind. Untracked files appear as working files with status '?'. It drops rename source paths and has no base comparison.
- ipc/gitService.js caches raw results (default 30 s, diff 10 s). Change detection must not be cached.
- Plan: services/ci/ciChanges.js uses simple-git directly on a fresh instance: status for staged/unstaged/untracked/renamed/deleted, and git diff --name-status -z -M base...HEAD for a chosen base. The base is chosen by the user; main/development are never assumed. Verify the base ref exists before diffing.

### 3.12 Tests and conventions

- Runner: node --test tests/*.test.mjs (package.json "test").
- Style: node:test + node:assert/strict, helpers mkTmp/rmRf, flat files tests/<name>.test.mjs, fixtures in tests/fixtures.
- Services in services/ are CommonJS and do not require electron at module load (they receive app/config by injection), so they can be required from .mjs tests via createRequire. consoleRunner can be tested by spawning process.execPath.
- New tests should be flat (tests/ci*.test.mjs) so the existing test script picks them up with no change. There are no existing tests for consoleManifest or consoleRunner.
- tests/rendererBundle.test.mjs exists but was not read; new renderer files must not break it.

### 3.13 Dependencies

- No YAML parser. micromatch and minimatch are present and can evaluate workflow paths filters (approximate GitHub glob semantics; report as such). simple-git, node-pty, chokidar are present.
- Recommended: add yaml (YAML 1.2, so the key on stays a string, plus line-position data through parseDocument). Pure JavaScript, no asarUnpack entry needed.

## 4. Requirement coverage

| Requirement from the plan | Today | Action |
| --- | --- | --- |
| Discover and parse workflows | none | New ciWorkflows.js + yaml dependency |
| Classify workflows | none | New ciClassify.js |
| Stream stdout/stderr | yes | reuse |
| Cancel and kill process tree | yes | reuse |
| Timeout | no | runner step.timeoutMs |
| Exit code and signal | code only | add reason/signal |
| Explicit cwd inside repo | yes (manifest) | reuse isInside |
| Controlled env | yes (childEnv) | reuse |
| No unsafe string concatenation | shell string today | argv + script file for CI steps |
| Job dependencies and skipping | no | dependsOn + blocked status |
| Persist history | yes | schema v2 + meta_json |
| Reopen past runs, view output | yes | reuse, add job grouping and Errors tab |
| Compare two runs | no | consoleDb.compareRuns + simple UI (Phase 5) |
| Duplicate-run prevention | yes (one job per repo) | reuse; queue later |
| Navigate away while running | yes (pill, main-process ownership) | reuse |
| App shutdown policy | stopAll on before-quit only | fix tray Exit path (3.8) |
| Secret redaction | regex only | redactValues + local env store |
| Error extraction | keyword heuristics in ErrorCop | ciErrors.js, exit-code driven |
| Change detection | status only, cached service | new ciChanges.js |
| Trust for repo-shipped commands | manifest only | extend to workflow files by hash |

## 5. Risks and findings (ordered)

1. HIGH - Tray Exit may orphan running child processes (app.exit skips before-quit).
2. HIGH - Repo-controlled YAML runs arbitrary commands. Needs hash-based trust, a visible command list, and re-confirmation when the workflow file hash changes.
3. HIGH - runAll ignores failures, so naive reuse would run downstream CI jobs after a failed dependency.
4. HIGH - ErrorCop CommandRunner and keyword detection are not valid sources of pass/fail.
5. MEDIUM - preload.js vs preload/repo_bridge.js confusion; wrong file would silently not expose methods.
6. MEDIUM - Windows shell behavior. spawn(shell: true) means cmd.exe. Workflows written for Linux use bash syntax and multi-line scripts. See D2. C:\Windows\System32\bash.exe is the WSL launcher and must not be treated as Git Bash.
7. MEDIUM - Secrets: ${{ secrets.X }} cannot be resolved from GitHub. A local env store is needed, values must be masked in logs, and the executed script must not persist on disk after the step.
8. MEDIUM - Unbounded run_logs growth; no retention.
9. MEDIUM - Single onEvent subscriber in preload; new views must not re-subscribe.
10. LOW - Dropped in-memory lines are not surfaced in the UI.
11. LOW - Dead dynamic import of importUI.js.

## 6. Revised architecture

### 6.1 Layering

    renderer/repoConsole/ciPage.js        UI only, talks to window.repoConsoleAPI through state.js call()
    preload.js (repoConsoleBridge)        narrow ci* methods
    ipc/repoConsole_ipc.js                ci* handlers; validates repo, file names, ids; rebuilds plan in main
    services/ci/*                         CI knowledge (parse, plan, preflight, changes, errors, executor)
    services/consoleRunner.js             generic process execution (no CI knowledge)
    database/consoleDb.js                 generic run history (+ CI snapshot in meta_json, run_errors)

One CI execution = one runner job (kind 'ci') whose steps are the flattened plan steps carrying jobId. That keeps one history row per execution and reuses the pill, output pane, stop, input and history unchanged. Jobs run sequentially in topological order in v1 (GitHub runs independent jobs in parallel; that difference is documented in the plan screen).

### 6.2 IPC contract (new channels, all through handle())

| Channel | Input | Output |
| --- | --- | --- |
| repoConsole:ciDiscover | repoPath | workflows: file, name, category, triggers, jobCount, support (full, partial, unsupported), parseError, deployBlocked, hash, trusted, lastRun |
| repoConsole:ciWorkflow | repoPath, file | jobs, steps, needs, conditions, unsupported features, line info |
| repoConsole:ciChanges | repoPath, base? | branch, head, base, files (path, status, from?) |
| repoConsole:ciPreflight | repoPath, file, jobIds | blockers, warnings (no secret values) |
| repoConsole:ciPlan | repoPath, file, mode, jobIds, base?, approvedSkips | plan, planHash, preflight |
| repoConsole:ciRun | repoPath, file, mode, jobIds, base?, approvedSkips, planHash, ack | job |
| repoConsole:ciRerun | repoPath, runId, ack | job |
| repoConsole:ciTrust | repoPath, file, hash | trusted |
| repoConsole:ciEnvGet / ciEnvSet | repoPath, names/values | names only on read |

Validation rules: file must match a workflow name pattern and resolve inside .github/workflows; jobIds must exist in the parsed workflow; planHash must equal the hash of the plan main just rebuilt (what the user confirmed is what runs); trusted hash must match the current file; every cwd must be inside the repo. Events keep using the existing repoConsole:event channel (reset, log, job, finished) with job.kind = 'ci'.

### 6.3 Runner step spec additions (all optional, defaults preserve today's behavior)

    {
      id, title, command, cwd, env, interactive, test, autoAnswer,   // existing
      argv: ['bash', '-eo', 'pipefail', 'step.sh'],  // when set, spawn(argv[0], rest, { shell: false })
      timeoutMs: 600000,
      dependsOn: ['stepId'],         // blocked when any dependency is not done
      stopOnFail: false,             // when true, remaining steps become skipped after a failure
      jobId: 'backend', jobTitle: 'Backend',
      onEnd: (stepView, lines) => {} // caller-owned extraction
    }
    job-level: redactValues: ['secret-value', ...]

stepView and history gain jobId, jobTitle, reason. Statuses gain blocked.

### 6.4 History schema v2 (console.db)

    ALTER TABLE run_steps ADD COLUMN job_id TEXT;
    ALTER TABLE run_steps ADD COLUMN job_name TEXT;
    ALTER TABLE run_steps ADD COLUMN reason TEXT;
    CREATE TABLE IF NOT EXISTS run_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      step_idx INTEGER,
      fingerprint TEXT,
      level TEXT,
      title TEXT,
      message TEXT,
      file TEXT,
      line INTEGER,
      col INTEGER,
      stack TEXT,
      count INTEGER DEFAULT 1,
      log_seq INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_run_errors_run ON run_errors (run_id);
    PRAGMA user_version = 2;

runs.meta_json carries: workflow file, workflow hash, workflow name, mode, branch, HEAD, base ref, selected jobs, changed files with per-job selection reasons, resolved plan, user options, approved skips. Retention: keep the last N runs per repo and/or max age (setting under config preferences), executed at init; per-run log line cap with a truncation marker. Raw logs are always kept even when error parsing fails.

### 6.5 Execution plan model

    plan: {
      hash, repoPath,
      workflow: { file, name, hash },
      mode, base, selectedJobs,
      jobs: [{
        id, name, needs, state: ready | blocked | unsupported | review,
        reasons: [],
        steps: [{
          key, index, name,
          kind: run | satisfied | skipped | unsupported,
          shell, cwd, command (display form, secrets unresolved),
          envNames: [], risk, timeoutMs, ifResult, line
        }]
      }],
      preflight: { blockers: [], warnings: [] },
      changes: { files: [], selection: [{ jobId, selected, reason }] }
    }

### 6.6 uses: policy (v1)

| Action | Local behavior |
| --- | --- |
| actions/checkout | satisfied when cwd is the repo and no repository, path or ref inputs are set; otherwise unsupported |
| actions/setup-node, setup-python, setup-java, setup-go, setup-dotnet, shivammathur/setup-php | validate installed runtime against requested version (node-version-file read from the repo); mismatch is a warning or blocker per preflight; nothing is installed |
| actions/cache, actions/upload-artifact | skipped with a visible note |
| actions/download-artifact, docker/*, aws-actions/*, anything unknown | unsupported; the job is blocked unless the user explicitly approves skipping that step in the plan screen (recorded as skipped by user) |

Third-party action code is never executed.

### 6.7 Conditions and expressions (v1 subset)

- Supported: no if, success(), always(), failure(), cancelled(), literal true/false.
- ${{ env.X }}, ${{ secrets.X }} (from the local env store), ${{ github.workspace }}, ${{ github.sha }} resolved; secrets resolved textually into the temporary script only, never into the displayed command.
- Everything else (matrix.*, needs.*, github.event.*, complex comparisons) marks the step or job as review and requires manual confirmation. Never guessed.
- matrix jobs: reported unsupported in v1 (visible, not run).

### 6.8 Shell strategy

- Each run: step is written to a temporary script file under the OS temp dir (restricted permissions, deleted in a finally block) and started with argv and shell: false.
- bash steps: bash -eo pipefail <file>. pwsh/powershell: -NoProfile -File. cmd, sh and python similarly.
- The displayed command and cwd are shown before execution exactly as they will run (secrets unresolved).
- Shell choice: step.shell, then defaults.run.shell, then derived from runs-on (ubuntu/macos -> bash, windows -> pwsh).
- Windows: locate Git Bash under the Git for Windows install and from PATH, excluding the System32 WSL launcher. See D2 for the fallback policy.

### 6.9 Smart CI mapping

Automatic job-to-directory mapping from: step and job working-directory, defaults.run.working-directory, leading "cd <dir> &&" in commands, and on.push.paths / on.pull_request.paths (micromatch, flagged as approximate). A changed file is attributed to a job when it lies under that job's directories. Root config files, lockfiles, shared directories, workflow files and unknown paths select all potentially affected jobs and recommend Full CI. Every selected or skipped job shows its reason. Smart CI only proposes a plan; execution requires the normal plan confirmation. Saved path-to-job rules live in userData per repo (optional import of a repo-shipped file would be trust-gated like the manifest).

### 6.10 Deployment and risk flags

Deploy/release detection from triggers (release, tag pushes), job and step names, environment: key, permissions id-token, commands (npm publish, docker push, kubectl, terraform apply, aws, gcloud, firebase deploy, vercel, gh release, git push) and uses: references. Such workflows are listed but local execution is disabled by default. Individual command risk flags (rm -rf, curl piped to sh, git push, npm ci which deletes node_modules, database commands) map onto the existing readonly/adds/changes/destructive badges and require explicit acknowledgement.

## 7. Decisions needed (recommended defaults in bold)

- D1. YAML parser: **add the yaml package** vs. write a limited parser (not recommended).
- D2. Windows shell policy when bash is missing: **fall back to cmd.exe only for single-line commands without bash-only syntax and show an environment-mismatch warning; otherwise block with an instruction to install Git for Windows**. Alternative: always block.
- D3. Local env and secrets store: **JSON file in userData per repo (never inside the repo), values masked in logs**; integrate with the password-protected Secret Holder later.
- D4. History storage: **extend console.db** (no second database).
- D5. env column for CI runs: **'local'** so lastRun() and filters keep working. Alternative: allow null and adjust lastRun().
- D6. Job execution: **sequential topological order in v1**; parallelism later.
- D7. Matrix jobs: **unsupported in v1**; later expansion for static matrices or "run for installed version only".
- D8. ErrorCop: **reuse parseLine and Deduplicator only; no ErrorCop sessions**; optional "send to ErrorCop" later.
- D9. Trust: **hash trust per workflow file, re-prompt on change**, stored in the existing trust.json under a ci: key.
- D10. Shutdown: **confirm on tray Exit when a job is running; always stopAll() on exit**.

## 8. File-by-file implementation plan

### Modify

| File | Change | Tests |
| --- | --- | --- |
| package.json | add yaml dependency | none |
| preload.js | add ci* methods to repoConsoleBridge (not preload/repo_bridge.js) | rendererBundle test review |
| ipc/repoConsole_ipc.js | ci* handlers; export hasRunning() and stopAll() | ciIpc validation tests (path, file, ids, planHash) |
| services/consoleRunner.js | argv, timeoutMs, dependsOn, stopOnFail, jobId, onEnd, redactValues, reason/signal, blocked status | consoleRunner.test.mjs |
| services/consoleManifest.js | export isInside; add isTrusted/setTrusted by key | consoleManifest.test.mjs |
| database/consoleDb.js | schema v2, meta_json write, run_errors, retention, compareRuns | consoleDb.test.mjs (temp dir) |
| main.js | tray Exit confirmation and stopAll in cleanupAndExit | manual checklist |
| renderer/repoConsole/index.js | NAV entry ci, kind 'ci' handling, page dispatch | manual and bundle test |
| renderer/repoConsole/state.js | S.ci state, status labels | none |
| renderer/repoConsole/pages.js | history filters include CI actions | manual |
| renderer/repoConsole/monitor.js | job grouping, Errors tab, dropped-lines notice, pill meta for CI | manual |

### New services (services/ci/, camelCase to match services/)

| File | Responsibility | Tests |
| --- | --- | --- |
| ciWorkflows.js | discover .github/workflows/*.yml and *.yaml, parse with yaml, normalize model (jobs, steps, needs, if, uses, run, working-directory, env, matrix, services, defaults), line info, parse errors with filename and position, support level per feature | ciWorkflows.test.mjs |
| ciClassify.js | workflow category, deploy detection, command risk flags | ciClassify.test.mjs |
| ciConditions.js | supported if subset, expression resolution, review markers | ciConditions.test.mjs |
| ciPlan.js | dependency graph, cycle and missing-need detection, mode selection (full, selected, single, smart), plan build, planHash | ciPlan.test.mjs |
| ciPreflight.js | runtimes, package manager and lockfile, node_modules, env names present, service ports, cwd validity (no secret values) | ciPreflight.test.mjs |
| ciChanges.js | simple-git status and base diff, change-to-job mapping with reasons | ciChanges.test.mjs (temp git repos) |
| ciShell.js | shell resolution per platform, temp script handling, Git Bash discovery | ciShell.test.mjs |
| ciEnv.js | local env store, secret value list for masking | ciEnv.test.mjs |
| ciErrors.js | exit-driven error extraction (file:line:col for tsc, eslint, jest, python tracebacks, php, dotnet), fingerprinting via Deduplicator, raw output untouched | ciErrors.test.mjs |
| ciExecutor.js | plan to runner spec, onEnd error persistence, rerun-failed plan from stored meta_json | ciExecutor.test.mjs (process.execPath steps) |

### New renderer and styles

- renderer/repoConsole/ciPage.js: overview, workflow list and details, plan confirmation modal, changes and Smart CI panel, env settings.
- renderer/styles/repo-console-ci.css, loaded from ensureInit and included in the CSS build once scripts/build-css.mjs is reviewed.

### Fixtures

tests/fixtures/ci/*.yml: no workflows directory, single ci.yml, multiple yml/yaml, invalid YAML, on-key handling, missing job ids, run and uses steps, working-directory and env, needs chains and cycles, conditions, matrix, services, deploy workflow.

## 9. Revised phases

### Phase 0.5 - Safety net and runner foundation (no CI features)

- Characterization tests for consoleManifest.detect/classify/planTarget and consoleRunner (success, non-zero exit, streaming, stop, interactive input, test-progress parsing) before any change.
- Runner extensions from 6.3 with tests that default behavior is unchanged (tests still run every suite after a failure).
- consoleDb v2 migration with tests (fresh database and upgrade from v1).
- Export hasRunning/stopAll; fix the tray Exit path (D10).
- Acceptance: all existing behavior unchanged; new runner options covered by tests.

### Phase 1 - Discovery (read-only)

- ciWorkflows, ciClassify, ciDiscover/ciWorkflow IPC, preload methods, CI nav page with list and details.
- Acceptance: selecting a repository shows an accurate workflow inventory with parse errors and unsupported features, and nothing is executed.

### Phase 2 - Analysis and plan

- ciConditions, ciPlan, ciPlan IPC, plan confirmation modal, workflow hash trust (D9).
- Acceptance: the user can inspect every command, working directory, satisfied step and unsupported step before anything starts.

### Phase 3 - Preflight

- ciPreflight, ciEnv, ciPreflight IPC, blockers and warnings in the plan screen.

### Phase 4 - Native execution

- ciShell, ciExecutor, ciRun IPC, deploy blocking, timeouts, cancellation, blocked statuses.
- Acceptance: a simple workflow with shell steps runs locally with correct per-step statuses and exit codes; a failed dependency blocks downstream jobs.

### Phase 5 - Errors and history

- ciErrors, run_errors, Errors tab, workflow snapshot in meta_json, run comparison, retention.
- Acceptance: a finished run reopens with commands, errors and output.

### Phase 6 - Git change detection

- ciChanges, base selection, path filters, per-job reasons.

### Phase 7 - Smart CI

- Combine plan, changes and dependency resolution into a proposed plan with confirmation; Full CI always available.

### Phase 8 - Reruns and coordination

- ciRerun from stored plan (workflow hash must be unchanged; earlier setup steps are not rerun because local state persists), queue, background visibility.

### Phase 9 - Profiles and integrations

- Validation profiles, optional pre-commit validation, evaluate act/Docker, scheduled local validation.

## 10. Still needed before implementation

- renderer/styles/repo-console.css, repo-console-layout.css, scripts/build-css.mjs (CSS bundling for the new page).
- ipc/terminal_ipc.js, tests/rendererBundle.test.mjs (confirm no conflict).
- One real repository's workflow files and package.json files (root, server, client) plus a short folder tree, to tune the parser and the Smart CI rules. Do not send .env values or secrets.
- Answers to decisions D1 to D10 (or approval of the recommended defaults).

No implementation starts until this plan is approved.