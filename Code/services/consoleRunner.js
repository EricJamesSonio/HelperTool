'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { RESULT_FILE, childEnv } = require('./consoleEnv');
const history = require('../database/consoleDb');

const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const MAX_LOG = 6000;
const FLUSH_MS = 120;
const PARTIAL_MS = 250;

function stripAnsi(text) {
  return String(text).replace(ANSI_RE, '');
}

function clean(text, max) {
  const out = history.redact(stripAnsi(text || '')).trim();
  return out.length > max ? out.slice(0, max) + '\n... (cut)' : out;
}

function firstLine(text) {
  const first = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return first ? first.slice(0, 300) : '';
}

const PARSERS = {
  jest(line) {
    const m = /^\s*(PASS|FAIL)\s+(\S.*?)(?:\s+\([\d.]+\s*m?s\))?\s*$/.exec(line);
    return m ? { file: m[2].trim(), ok: m[1] === 'PASS' } : null;
  },
  vitest(line) {
    const m = /^\s{0,2}(\u2713|\u276F|\u00D7|\u2717)\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)\s+\(\d+ tests?/.exec(line);
    return m ? { file: m[2], ok: m[1] === '\u2713' } : null;
  },
};

function killTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch (e) {
      /* process already gone */
    }
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (e) {
    try {
      child.kill('SIGTERM');
    } catch (err) {
      /* process already gone */
    }
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (e) {
      /* process already gone */
    }
  }, 3000);
}

function summarizeJson(dir, file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const files = (data.testResults || []).map((r) => {
    const assertions = r.assertionResults || [];
    const failures = assertions
      .filter((a) => a.status === 'failed')
      .map((a) => {
        const message = clean((a.failureMessages || []).join('\n'), 5000);
        return { name: a.fullName || a.title || '(unnamed test)', message, summary: firstLine(message) };
      });
    const passed = assertions.filter((a) => a.status === 'passed').length;
    const skipped = assertions.filter((a) => ['pending', 'skipped', 'todo', 'disabled'].includes(a.status)).length;
    const status = r.status === 'passed' ? 'passed' : r.status === 'failed' ? 'failed' : 'skipped';
    const error = status === 'failed' && failures.length === 0 ? clean(r.message, 5000) : '';
    return {
      file: path.relative(dir, r.name).split(path.sep).join('/'),
      status,
      tests: assertions.length,
      passed,
      failed: failures.length,
      skipped,
      failures,
      error,
      errorSummary: firstLine(error),
      durationMs: r.endTime && r.startTime ? r.endTime - r.startTime : null,
    };
  });
  files.sort((a, b) => {
    if (a.status === b.status) return a.file.localeCompare(b.file);
    return a.status === 'failed' ? -1 : b.status === 'failed' ? 1 : 0;
  });
  const totals = files.reduce(
    (t, f) => {
      t.files += 1;
      if (f.status === 'passed') t.passedFiles += 1;
      if (f.status === 'failed') t.failedFiles += 1;
      t.tests += f.tests;
      t.passed += f.passed;
      t.failed += f.failed;
      t.skipped += f.skipped;
      return t;
    },
    { files: 0, passedFiles: 0, failedFiles: 0, tests: 0, passed: 0, failed: 0, skipped: 0 }
  );
  return { files, totals };
}

function collectResult(step) {
  const file = path.join(step.cwd, RESULT_FILE);
  try {
    if (!fs.existsSync(file)) {
      step.result = { kind: 'tests', error: 'The test run ended before it wrote a report. Open the Output tab to see why.' };
      return;
    }
    step.result = Object.assign({ kind: 'tests' }, summarizeJson(step.cwd, file));
  } catch (e) {
    step.result = { kind: 'tests', error: 'The test report could not be read: ' + e.message };
  } finally {
    try {
      fs.rmSync(file, { force: true });
    } catch (e) {
      /* nothing to remove */
    }
  }
}

function initStep(spec) {
  return {
    id: spec.id,
    title: spec.title,
    command: spec.command,
    cwd: spec.cwd,
    env: spec.env || {},
    interactive: !!spec.interactive,
    test: spec.test || null,
    autoAnswer: spec.autoAnswer ? { when: spec.autoAnswer.when, send: spec.autoAnswer.send, done: false } : null,
    status: 'pending',
    exitCode: null,
    startedAt: null,
    endedAt: null,
    progress: spec.test ? { total: spec.test.total || 0, done: 0, passed: 0, failed: 0, files: [] } : null,
    result: null,
    seen: new Set(),
  };
}

function stepView(s, index) {
  return {
    id: s.id,
    idx: index,
    title: s.title,
    command: s.command,
    status: s.status,
    exitCode: s.exitCode,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    progress: s.progress ? Object.assign({}, s.progress, { files: s.progress.files.slice(-20) }) : null,
    result: s.result,
  };
}

function createRunner(emit) {
  const ctxs = new Map();
  let historyWarned = false;

  function ctxFor(repoPath) {
    if (!ctxs.has(repoPath)) {
      ctxs.set(repoPath, { repoPath, job: null, current: null, pending: [], dbBuf: [], flushTimer: null });
    }
    return ctxs.get(repoPath);
  }

  function jobView(ctx, withLog) {
    const j = ctx.job;
    if (!j) return null;
    const view = {
      id: j.id,
      repoPath: ctx.repoPath,
      actionId: j.actionId,
      title: j.title,
      kind: j.kind,
      targetLabel: j.targetLabel,
      danger: j.danger,
      status: j.status,
      startedAt: j.startedAt,
      endedAt: j.endedAt,
      durationMs: j.endedAt ? j.endedAt - j.startedAt : null,
      exitCode: j.exitCode,
      error: j.error,
      stopRequested: j.stopRequested,
      awaiting: j.awaiting,
      dropped: j.dropped,
      activeStep: j.stepIndex,
      env: j.meta.env || null,
      appEnv: j.meta.appEnv || null,
      host: j.meta.host || null,
      database: j.meta.database || null,
      command: j.meta.command || null,
      steps: j.steps.map((s, i) => stepView(s, i)),
    };
    if (withLog) view.log = j.log;
    return view;
  }

  function flush(ctx) {
    ctx.flushTimer = null;
    if (!ctx.job) return;
    if (ctx.dbBuf.length) {
      const batch = ctx.dbBuf;
      ctx.dbBuf = [];
      try {
        history.appendLogs(ctx.job.id, batch);
      } catch (e) {
        if (!historyWarned) {
          historyWarned = true;
          console.error('[RepoConsole] Could not save output to history:', e.message);
        }
      }
    }
    if (ctx.pending.length) {
      emit(ctx.repoPath, 'log', ctx.pending);
      ctx.pending = [];
    }
    emit(ctx.repoPath, 'job', jobView(ctx, false));
  }

  function scheduleFlush(ctx) {
    if (!ctx.flushTimer) ctx.flushTimer = setTimeout(() => flush(ctx), FLUSH_MS);
  }

  function pushLog(ctx, kind, raw) {
    const entry = { s: ctx.job.stepIndex, k: kind, t: history.redact(raw) };
    ctx.job.log.push(entry);
    if (ctx.job.log.length > MAX_LOG) {
      ctx.job.log.shift();
      ctx.job.dropped += 1;
    }
    ctx.pending.push(entry);
    ctx.dbBuf.push(entry);
    scheduleFlush(ctx);
  }

  function parseProgress(step, text) {
    const parse = PARSERS[step.test.runner];
    if (!parse) return;
    const hit = parse(text);
    if (!hit || step.seen.has(hit.file)) return;
    step.seen.add(hit.file);
    step.progress.done += 1;
    if (hit.ok) step.progress.passed += 1;
    else step.progress.failed += 1;
    step.progress.files.push({ file: hit.file, ok: hit.ok });
    if (step.progress.files.length > 4000) step.progress.files.shift();
  }

  function answer(ctx, text, auto) {
    const cur = ctx.current;
    if (!cur || !cur.child || !cur.child.stdin || cur.child.stdin.destroyed) return false;
    try {
      cur.child.stdin.write(text + '\n');
    } catch (e) {
      return false;
    }
    ctx.job.awaiting = false;
    pushLog(ctx, 'in', auto ? text + '   (answered automatically from your confirmation)' : text);
    scheduleFlush(ctx);
    return true;
  }

  function handleLine(ctx, step, kind, raw) {
    const text = stripAnsi(raw).replace(/\s+$/, '');
    pushLog(ctx, kind, text);
    if (step.test) parseProgress(step, text);
    const auto = step.autoAnswer;
    if (auto && !auto.done && auto.when.test(text)) {
      auto.done = true;
      setTimeout(() => answer(ctx, auto.send, true), 150);
    }
  }

  function runStep(ctx, step, index) {
    return new Promise((resolve) => {
      const job = ctx.job;
      job.stepIndex = index;
      step.status = 'running';
      step.startedAt = Date.now();
      pushLog(ctx, 'sys', '> ' + step.title);
      pushLog(ctx, 'sys', '$ ' + step.command + '   (in ' + (path.relative(ctx.repoPath, step.cwd) || '.') + ')');
      scheduleFlush(ctx);

      if (step.test) {
        try {
          fs.rmSync(path.join(step.cwd, RESULT_FILE), { force: true });
        } catch (e) {
          /* nothing to remove */
        }
      }

      let settled = false;
      const finish = (code) => {
        if (settled) return;
        settled = true;
        resolve({ code });
      };

      let child;
      try {
        child = spawn(step.command, {
          cwd: step.cwd,
          shell: true,
          env: childEnv(step.env),
          stdio: [step.interactive ? 'pipe' : 'ignore', 'pipe', 'pipe'],
          windowsHide: true,
          detached: process.platform !== 'win32',
        });
      } catch (e) {
        pushLog(ctx, 'sys', 'Could not start: ' + e.message);
        finish(-1);
        return;
      }

      ctx.current = { child };
      if (child.stdin) child.stdin.on('error', () => {});
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      const buffers = { out: '', err: '' };
      const timers = { out: null, err: null };

      function flushPartial(kind) {
        const rest = buffers[kind];
        if (!rest) return;
        buffers[kind] = '';
        handleLine(ctx, step, kind, rest);
        if (step.interactive && /[:?]\s*$/.test(rest)) {
          job.awaiting = true;
          scheduleFlush(ctx);
        }
      }

      function onData(kind, chunk) {
        buffers[kind] += chunk;
        const parts = buffers[kind].split(/\r\n|\n|\r/);
        buffers[kind] = parts.pop();
        for (const line of parts) handleLine(ctx, step, kind, line);
        clearTimeout(timers[kind]);
        if (buffers[kind]) timers[kind] = setTimeout(() => flushPartial(kind), PARTIAL_MS);
      }

      child.stdout.on('data', (c) => onData('out', c));
      child.stderr.on('data', (c) => onData('err', c));

      child.on('error', (err) => {
        pushLog(ctx, 'sys', 'Could not start: ' + err.message);
        finish(-1);
      });

      child.on('close', (code) => {
        clearTimeout(timers.out);
        clearTimeout(timers.err);
        flushPartial('out');
        flushPartial('err');
        step.exitCode = code;
        ctx.current = null;
        finish(code === null ? -1 : code);
      });
    });
  }

  function conclude(ctx) {
    const job = ctx.job;
    const codes = job.steps.filter((s) => s.exitCode !== null && s.exitCode !== undefined);
    const bad = codes.find((s) => s.exitCode !== 0);
    job.exitCode = bad ? bad.exitCode : codes.length ? codes[codes.length - 1].exitCode : null;
    job.endedAt = Date.now();
    job.awaiting = false;
    pushLog(ctx, 'sys', job.status === 'done' ? 'Finished.' : job.status === 'stopped' ? 'Stopped.' : 'Finished with errors.');
    if (ctx.flushTimer) clearTimeout(ctx.flushTimer);
    flush(ctx);
    const finalView = jobView(ctx, false);
    try {
      history.finishRun(finalView);
    } catch (e) {
      console.error('[RepoConsole] Could not record the finished run:', e.message);
    }
    emit(ctx.repoPath, 'finished', finalView);
  }

  async function runAll(ctx) {
    const job = ctx.job;
    let failed = false;
    for (let i = 0; i < job.steps.length; i += 1) {
      const step = job.steps[i];
      if (job.stopRequested) {
        step.status = 'skipped';
        continue;
      }
      const out = await runStep(ctx, step, i);
      step.endedAt = Date.now();
      if (step.test) collectResult(step);
      if (job.stopRequested) step.status = 'stopped';
      else if (out.code === 0) step.status = 'done';
      else {
        step.status = 'failed';
        failed = true;
      }
      scheduleFlush(ctx);
    }
    job.status = job.stopRequested ? 'stopped' : failed ? 'failed' : 'done';
    conclude(ctx);
  }

  function startJob(repoPath, spec) {
    const ctx = ctxFor(repoPath);
    if (ctx.job && ctx.job.status === 'running') {
      throw Object.assign(new Error('Another job is still running in this repository. Wait for it or press Stop.'), { status: 409 });
    }
    ctx.job = {
      id: crypto.randomBytes(6).toString('hex'),
      actionId: spec.actionId || null,
      title: spec.title,
      kind: spec.kind,
      targetLabel: spec.targetLabel || '',
      danger: !!spec.danger,
      meta: spec.history || {},
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      error: null,
      stopRequested: false,
      awaiting: false,
      dropped: 0,
      stepIndex: 0,
      steps: spec.steps.map(initStep),
      log: [],
    };
    ctx.pending = [];
    ctx.dbBuf = [];
    try {
      history.startRun(jobView(ctx, false), spec.history || {});
    } catch (e) {
      console.error('[RepoConsole] Could not record the run:', e.message);
    }
    emit(repoPath, 'reset', jobView(ctx, true));
    runAll(ctx).catch((e) => {
      ctx.job.status = 'failed';
      ctx.job.error = e.message;
      pushLog(ctx, 'sys', 'Internal error: ' + e.message);
      conclude(ctx);
    });
    return jobView(ctx, false);
  }

  function stopJob(repoPath) {
    const ctx = ctxs.get(repoPath);
    if (!ctx || !ctx.job || ctx.job.status !== 'running') return false;
    ctx.job.stopRequested = true;
    pushLog(ctx, 'sys', 'Stop requested. Ending the process...');
    if (ctx.current && ctx.current.child) killTree(ctx.current.child);
    scheduleFlush(ctx);
    return true;
  }

  function sendInput(repoPath, text) {
    const ctx = ctxs.get(repoPath);
    if (!ctx || !ctx.job || ctx.job.status !== 'running') return false;
    return answer(ctx, String(text).slice(0, 300), false);
  }

  function getJob(repoPath, withLog) {
    const ctx = ctxs.get(repoPath);
    return ctx ? jobView(ctx, !!withLog) : null;
  }

  function isRunning(repoPath) {
    const ctx = ctxs.get(repoPath);
    return !!(ctx && ctx.job && ctx.job.status === 'running');
  }

  function stopAll() {
    for (const repoPath of ctxs.keys()) stopJob(repoPath);
  }

  return { startJob, stopJob, sendInput, getJob, isRunning, stopAll };
}

module.exports = { createRunner, killTree };