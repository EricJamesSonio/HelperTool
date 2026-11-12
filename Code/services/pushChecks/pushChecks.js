'use strict';

const fs = require('fs');
const path = require('path');
const manifest = require('../consoleManifest');
const history = require('../../database/consoleDb');
const { extractErrors, failureError } = require('../ci/ciErrors');
const stackChecks = require('./stackChecks');

const KINDS = ['lint', 'typecheck', 'test', 'build'];
const KIND_LABEL = { lint: 'Lint', typecheck: 'Type check', test: 'Tests', build: 'Build' };
const TIMEOUT_MS = 20 * 60 * 1000;
const KEEP_RUNS = 50;
const DEFAULT_KINDS = { lint: true, typecheck: true, test: true, build: true };

const queue = new Map();
const metaByRun = new Map();

function settingsFile() {
  return path.join(manifest.getRepoConsoleDir(), 'push-checks.json');
}

function getSettings() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {};
  } catch (e) {
    saved = {};
  }
  return {
    enabled: saved.enabled !== false,
    kinds: Object.assign({}, DEFAULT_KINDS, saved.kinds || {}),
    heavyBuilds: saved.heavyBuilds === true,
    buildMode: saved.buildMode === 'always' ? 'always' : 'fallback',
  };
}

function setSettings(patch) {
  const current = getSettings();
  const p = patch && typeof patch === 'object' ? patch : {};
  const next = {
    enabled: typeof p.enabled === 'boolean' ? p.enabled : current.enabled,
    kinds: Object.assign({}, current.kinds),
    heavyBuilds: typeof p.heavyBuilds === 'boolean' ? p.heavyBuilds : current.heavyBuilds,
    buildMode: p.buildMode === 'always' || p.buildMode === 'fallback' ? p.buildMode : current.buildMode,
  };
  if (p.kinds && typeof p.kinds === 'object') {
    for (const kind of KINDS) {
      if (typeof p.kinds[kind] === 'boolean') next.kinds[kind] = p.kinds[kind];
    }
  }
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}

function buildPlan(repoPath, files) {
  const settings = getSettings();
  const all = stackChecks.detectProjects(repoPath);
  const projects = Array.isArray(files) ? stackChecks.assignFiles(all, files) : all;
  const steps = [];
  const skipped = [];
  const view = [];

  for (const project of projects) {
    const entry = { rel: project.rel, label: project.label, stacks: project.stacks, checks: [] };
    const hasTests = project.checks.some((c) => c.kind === 'test');
    for (const kind of KINDS) {
      for (const check of project.checks.filter((c) => c.kind === kind)) {
        let reason = '';
        let quiet = false;
        if (!settings.kinds[kind]) {
          reason = KIND_LABEL[kind] + ' checks are turned off.';
          quiet = true;
        } else if (kind === 'build' && settings.buildMode === 'fallback' && hasTests) {
          reason = 'Build only runs when a project has no tests. Turn on "always run the build" to include it.';
          quiet = true;
        } else if (check.skip) {
          reason = check.skip;
        } else if (check.heavy && !settings.heavyBuilds) {
          reason = 'Skipped: this build can clash with a running dev server. Turn on heavy builds to include it.';
        }
        entry.checks.push({ kind, title: check.title, command: check.command, stack: check.stack, skip: reason });
        if (reason) {
          if (!quiet) skipped.push({ project: project.label, kind, title: check.title, reason });
          continue;
        }
        steps.push({
          id: [project.rel, kind, check.tool].join('|'),
          title: project.label + ' / ' + check.title,
          command: check.command,
          cwd: project.dir,
          env: { CI: 'true' },
          interactive: false,
          timeoutMs: TIMEOUT_MS,
          stopOnFail: false,
          jobId: project.rel,
          jobTitle: project.label,
          test: check.runner ? { runner: check.runner, total: check.files || 0 } : null,
        });
      }
    }
    view.push(entry);
  }
  return { steps, skipped, projects: view, settings };
}

function planView(repoPath) {
  const plan = buildPlan(repoPath, null);
  return { projects: plan.projects, settings: plan.settings };
}

function recordErrors(sink, repoPath, view, lines) {
  if (!sink.runId || !view || view.status !== 'failed') return;
  try {
    const options = { stepIdx: view.idx, root: repoPath };
    let errors = extractErrors(lines, options);
    if (!errors.length) errors = [failureError(view, options)];
    history.insertErrors(sink.runId, errors);
  } catch (e) {
    /* history is best effort and must not break the run */
  }
}

function launch(runner, repoPath, plan, o) {
  const sink = { runId: null };
  const steps = plan.steps.map((s) => Object.assign({}, s, { onEnd: (view, lines) => recordErrors(sink, repoPath, view, lines) }));
  const projects = Array.from(new Set(plan.steps.map((s) => s.jobTitle)));
  const trigger = o.trigger || 'manual';
  const actionId = 'checks:' + trigger;
  const job = runner.startJob(repoPath, {
    title: (trigger === 'push' ? 'Push checks: ' : 'Checks: ') + projects.join(', '),
    actionId,
    kind: 'checks',
    targetLabel: projects.join(', '),
    danger: false,
    history: {
      actionId,
      env: 'local',
      appEnv: null,
      host: null,
      database: null,
      command: steps.length + ' checks: ' + projects.join(', '),
    },
    steps,
  });
  sink.runId = job.id;
  metaByRun.set(job.id, { skipped: plan.skipped, trigger });
  if (metaByRun.size > 50) metaByRun.delete(metaByRun.keys().next().value);
  try {
    history.pruneRuns(repoPath, KEEP_RUNS, 'checks');
  } catch (e) {
    /* retention is best effort */
  }
  return { started: true, runId: job.id, projects, steps: steps.length, skipped: plan.skipped.length };
}

function start(runner, repoPath, opts) {
  const o = opts || {};
  const settings = getSettings();
  if (!o.manual && !settings.enabled) return { skipped: 'disabled' };
  const plan = buildPlan(repoPath, o.files);
  if (!plan.steps.length) return { skipped: 'nothing', reasons: plan.skipped.map((s) => s.reason) };
  const projects = Array.from(new Set(plan.steps.map((s) => s.jobTitle)));
  if (runner.isRunning(repoPath)) {
    queue.set(repoPath, o);
    return { queued: true, projects };
  }
  try {
    return launch(runner, repoPath, plan, o);
  } catch (e) {
    if (e && e.status === 409) {
      queue.set(repoPath, o);
      return { queued: true, projects };
    }
    throw e;
  }
}

function summarize(repoPath, view, log, meta) {
  const steps = (view.steps || []).map((s) => {
    const parts = String(s.id || '').split('|');
    const lines = log
      .filter((l) => l.s === s.idx && l.k !== 'sys')
      .map((l) => String(l.t || ''))
      .filter((t) => t.trim());
    const failed = s.status === 'failed' || s.status === 'blocked';
    const totals = s.result && s.result.totals ? s.result.totals : null;
    const failedFiles = s.result && Array.isArray(s.result.files) ? s.result.files.filter((f) => f.status === 'failed').slice(0, 6).map((f) => f.file) : [];
    return {
      id: s.id,
      project: parts[0] || '',
      kind: parts[1] || '',
      title: s.title,
      status: s.status,
      exitCode: s.exitCode,
      durationMs: s.startedAt && s.endedAt ? s.endedAt - s.startedAt : null,
      tests: totals,
      failedFiles,
      excerpt: failed ? lines.slice(-12).join('\n').slice(0, 1800) : '',
    };
  });
  const counts = {
    total: steps.length,
    passed: steps.filter((s) => s.status === 'done').length,
    failed: steps.filter((s) => s.status === 'failed' || s.status === 'blocked').length,
    other: steps.filter((s) => !['done', 'failed', 'blocked'].includes(s.status)).length,
  };
  return {
    repoPath,
    runId: view.id,
    title: view.title,
    status: view.status,
    durationMs: view.durationMs,
    trigger: meta.trigger || 'manual',
    steps,
    skipped: meta.skipped || [],
    counts,
  };
}

function onRunnerEvent(ctx) {
  const { runner, repoPath, event, data, send } = ctx;
  if (!data) return;
  if (event === 'reset' && data.kind === 'checks') {
    send('pushChecks:event', { type: 'started', repoPath, runId: data.id, title: data.title });
  }
  if (event !== 'finished') return;
  if (data.kind === 'checks') {
    const full = runner.getJob(repoPath, true);
    const log = full && full.id === data.id && Array.isArray(full.log) ? full.log : [];
    const meta = metaByRun.get(data.id) || {};
    metaByRun.delete(data.id);
    send('pushChecks:event', { type: 'finished', summary: summarize(repoPath, data, log, meta) });
  }
  if (queue.has(repoPath)) {
    const next = queue.get(repoPath);
    queue.delete(repoPath);
    setTimeout(() => {
      try {
        start(runner, repoPath, Object.assign({}, next));
      } catch (e) {
        console.error('[RepoConsole] Queued checks could not start:', e.message);
      }
    }, 400);
  }
}

module.exports = { getSettings, setSettings, buildPlan, planView, start, onRunnerEvent };