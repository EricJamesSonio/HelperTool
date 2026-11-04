'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ci = require('./ciWorkflows');
const ciEnv = require('./ciEnv');
const { buildPlan } = require('./ciPlan');
const { preflight } = require('./ciPreflight');
const { resolveShell, writeScript, invocation } = require('./ciShell');
const { extractErrors, failureError } = require('./ciErrors');
const history = require('../../database/consoleDb');

const MAX_RUN_CHARS = 4000;
const STEP_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_KEPT_CI_RUNS = 100;
const SECRETISH_RE = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|PWD|CREDENTIAL)/i;
const EXPR_RE = /\$\{\{([\s\S]*?)\}\}/g;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function readSha(repoPath) {
  try {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
    });
    return result.status === 0 ? String(result.stdout).trim() : '';
  } catch (e) {
    return '';
  }
}

function lookup(values, name) {
  if (Object.prototype.hasOwnProperty.call(values, name)) return values[name];
  return process.env[name] || '';
}

function expand(text, ctx) {
  return String(text).replace(EXPR_RE, (whole, inner) => {
    const expression = inner.trim();
    if (expression === 'github.workspace') return ctx.workspace;
    if (expression === 'github.sha') return ctx.sha;
    const dot = expression.indexOf('.');
    if (dot === -1) return whole;
    const kind = expression.slice(0, dot);
    const name = expression.slice(dot + 1);
    if ((kind === 'env' || kind === 'secrets') && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return lookup(ctx.values, name);
    }
    return whole;
  });
}

function firstLine(text, max) {
  const line = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  return (line || '').slice(0, max || 80);
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    /* temp folder already gone */
  }
}

function cleanupWhenDone(runner, repoPath, jobId, dir) {
  const timer = setInterval(() => {
    const view = runner.getJob(repoPath, false);
    if (view && view.id === jobId && view.status === 'running') return;
    clearInterval(timer);
    removeDir(dir);
  }, 1000);
  if (timer.unref) timer.unref();
}

function checkPlan(plan) {
  if (plan.blockers.length) {
    throw fail(400, 'The plan has blockers: ' + plan.blockers.join(' '));
  }
  for (const job of plan.jobs) {
    if (job.state !== 'ready') {
      throw fail(400, 'Job "' + job.id + '" is not ready to run. ' + (job.reasons || []).join(' '));
    }
  }
}

function collectSecrets(plan, values) {
  const used = new Set();
  for (const job of plan.jobs) {
    for (const step of job.steps) {
      if (step.kind !== 'run') continue;
      for (const name of step.secretNames || []) used.add(name);
    }
  }
  const masked = new Set();
  for (const name of Object.keys(values)) {
    if (used.has(name) || SECRETISH_RE.test(name)) masked.add(values[name]);
  }
  for (const name of used) {
    if (process.env[name]) masked.add(process.env[name]);
  }
  return [...masked].filter((v) => typeof v === 'string' && v.length >= 4);
}

function recordErrors(sink, plan, view, lines, deps) {
  if (!sink.runId || !view || view.status !== 'failed') return;
  try {
    const options = { stepIdx: view.idx, root: plan.repoPath };
    let errors = extractErrors(lines, options);
    if (!errors.length) errors = [failureError(view, options)];
    const write = deps.recordErrors || history.insertErrors;
    write(sink.runId, errors);
  } catch (e) {
    /* history is best effort and must not break the run */
  }
}

function buildSteps(plan, scripts, values, scriptDir, deps, sink) {
  const sha = typeof deps.gitSha === 'function' ? deps.gitSha(plan.repoPath) : readSha(plan.repoPath);
  const platform = (deps.shell && deps.shell.platform) || process.platform;
  const baseEnv = Object.assign({}, values, {
    CI: 'true',
    GITHUB_WORKSPACE: plan.repoPath,
    GITHUB_SHA: sha,
  });
  const stepsOut = [];
  const idsByJob = new Map();

  for (const job of plan.jobs) {
    const needIds = [];
    for (const need of job.needs) {
      if (idsByJob.has(need)) needIds.push(...idsByJob.get(need));
    }

    const ownIds = [];
    let previous = null;

    for (const step of job.steps) {
      if (step.kind !== 'run') continue;

      const raw = scripts[step.key];
      if (typeof raw !== 'string') {
        throw fail(409, 'The command for step ' + step.key + ' could not be read from the workflow. Review the plan again.');
      }
      if (raw.length > MAX_RUN_CHARS) {
        throw fail(400, 'Step "' + firstLine(step.name) + '" in job "' + job.id + '" is longer than ' + MAX_RUN_CHARS + ' characters and cannot be reviewed in full, so it will not run.');
      }

      const shellInfo = resolveShell(Object.assign({ shell: step.shell }, deps.shell || {}));
      if (!shellInfo.ok) {
        throw fail(400, 'Step "' + firstLine(step.name) + '" in job "' + job.id + '": ' + shellInfo.reason);
      }

      const workspace = shellInfo.posix && platform === 'win32' ? plan.repoPath.split(path.sep).join('/') : plan.repoPath;
      const body = expand(raw, { values, workspace, sha });
      const file = writeScript(scriptDir, shellInfo, body);

      stepsOut.push({
        id: step.key,
        title: job.name + ' / ' + firstLine(step.name),
        command: step.command || firstLine(step.name),
        argv: invocation(shellInfo, file, platform),
        cwd: step.cwd,
        env: baseEnv,
        interactive: false,
        timeoutMs: step.timeoutMs || STEP_TIMEOUT_MS,
        dependsOn: previous ? [previous] : needIds.slice(),
        jobId: job.id,
        jobTitle: job.name,
        onEnd: (view, lines) => {
          try {
            fs.rmSync(file, { force: true });
          } catch (e) {
            /* script already removed */
          }
          recordErrors(sink, plan, view, lines, deps);
        },
      });

      ownIds.push(step.key);
      previous = step.key;
    }

    idsByJob.set(job.id, ownIds.length ? [ownIds[ownIds.length - 1]] : needIds);
  }

  if (!stepsOut.length) throw fail(400, 'The plan has no command steps to run.');
  return stepsOut;
}

async function startCiRun(options) {
  const o = options;
  const deps = o.deps || {};
  const runner = o.runner;

  if (o.ack !== true) throw fail(400, 'Confirm the plan before running it.');
  if (runner.isRunning(o.repoPath)) {
    throw fail(409, 'Another job is still running in this repository. Wait for it or press Stop.');
  }

  const workflow = ci.getWorkflow(o.repoPath, o.file);
  if (!workflow) throw fail(404, 'That workflow file was not found.');

  const trusted = !!o.isTrusted(workflow.hash);
  if (!trusted) throw fail(403, 'Trust this workflow before running it.');

  const rebuilt = buildPlan({
    repoPath: o.repoPath,
    workflow,
    mode: o.mode,
    jobIds: o.jobIds,
    approvedSkips: o.approvedSkips,
    trusted,
  });
  if (typeof o.planHash !== 'string' || o.planHash !== rebuilt.planHash) {
    throw fail(409, 'The plan changed since it was reviewed. Build and review the plan again.');
  }

  const plan = rebuilt.plan;
  checkPlan(plan);

  const source = ci.readRunScripts(o.repoPath, o.file);
  if (!source || source.hash !== workflow.hash) {
    throw fail(409, 'The workflow changed while the run was being prepared. Review it again.');
  }

  const values = ciEnv.getValues(o.dataDir, o.repoPath);
  const check = deps.preflight || preflight;
  const pre = await check({ repoPath: o.repoPath, workflow, plan, envValues: values });
  if (pre.blockers.length) {
    throw fail(400, 'Preflight found blockers: ' + pre.blockers.join(' '));
  }

  const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-ci-'));
  const sink = { runId: null };
  try {
    const steps = buildSteps(plan, source.scripts, values, scriptDir, deps, sink);
    const actionId = 'ci:' + o.file;
    const job = runner.startJob(o.repoPath, {
      title: 'CI: ' + workflow.name,
      actionId,
      kind: 'ci',
      targetLabel: o.file,
      danger: false,
      redactValues: collectSecrets(plan, values),
      history: {
        actionId,
        env: 'local',
        appEnv: null,
        host: os.hostname(),
        database: null,
        command: 'CI ' + o.file + ' (' + plan.mode + ')',
        snapshot: plan,
      },
      steps,
    });
    sink.runId = job.id;
    cleanupWhenDone(runner, o.repoPath, job.id, scriptDir);
    try {
      const prune = deps.pruneRuns || history.pruneRuns;
      prune(o.repoPath, MAX_KEPT_CI_RUNS, 'ci');
    } catch (e) {
      /* retention is best effort */
    }
    return { job, planHash: rebuilt.planHash };
  } catch (e) {
    removeDir(scriptDir);
    throw e;
  }
}

module.exports = { startCiRun, expand };