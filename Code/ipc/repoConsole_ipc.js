'use strict';

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const consoleDb = require('../database/consoleDb');
const manifest = require('../services/consoleManifest');
const { createRunner } = require('../services/consoleRunner');

let _runner = null;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function hasRunning() {
  return !!_runner && _runner.anyRunning();
}

function stopAll(options) {
  if (!_runner) return;
  _runner.stopAll();
  if (options && options.hard) _runner.killAllNow();
}

function register({ app, config, getMainWindow }) {
  consoleDb.init(app);
  consoleDb.markInterrupted();
  manifest.init(app);

  const runner = createRunner((repoPath, event, data) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('repoConsole:event', { repoPath, event, data });
    }
  });
  _runner = runner;

  function knownRepo(repoPath) {
    if (typeof repoPath !== 'string' || !repoPath) throw httpError(400, 'No repository selected.');
    let projects = {};
    try {
      projects = config.readConfig().projects || {};
    } catch (e) {
      projects = {};
    }
    if (!projects[repoPath]) throw httpError(403, 'This repository is not known to the helper.');
    if (!fs.existsSync(repoPath)) throw httpError(400, 'The repository folder was not found.');
    return repoPath;
  }

  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        const out = await fn(payload || {});
        return Object.assign({ ok: true }, out);
      } catch (e) {
        return { ok: false, error: e.message || 'Request failed', status: e.status || 500 };
      }
    });
  }

  handle('repoConsole:catalog', ({ repoPath }) => {
    knownRepo(repoPath);
    const view = manifest.describe(repoPath);
    for (const item of view.items) {
      item.lastRuns = {};
      for (const envKey of ['local', 'production']) {
        item.lastRuns[envKey] = consoleDb.lastRun(repoPath, item.id, envKey);
      }
    }
    view.info = {
      repoName: path.basename(repoPath),
      historyCount: consoleDb.countRuns(repoPath),
      historyAvailable: consoleDb.available(),
    };
    return { catalog: view };
  });

  handle('repoConsole:run', (body) => {
    knownRepo(body.repoPath);
    const { item, plan, envKey, ctx } = manifest.resolveAction(body.repoPath, body.id, body.envKey);
    if (!item) throw httpError(404, 'Unknown action.');
    if (!plan) throw httpError(400, 'This action is not available for ' + envKey + '.');
    if (plan.blocked) throw httpError(403, 'Trust this repository\'s console manifest before running its actions.');
    if (plan.missing) throw httpError(400, plan.display + ' was not found. The console is out of date with the repository.');
    const needsDb = item.needsDb !== false;
    if (needsDb && !plan.target.configured) {
      throw httpError(400, 'No DATABASE_URL was found for APP_ENV=' + plan.appEnv + ' (looked in .env.' + plan.appEnv + ' and .env).');
    }
    if (item.risk !== 'readonly') {
      if (plan.strong && needsDb) {
        if (String(body.phrase || '') !== plan.target.database) {
          throw httpError(400, 'The database name you typed does not match "' + plan.target.database + '".');
        }
        if (item.risk === 'destructive' && String(body.phrase2 || '') !== ctx.wipePhrase) {
          throw httpError(400, 'Type ' + ctx.wipePhrase + ' to confirm.');
        }
      } else if (body.ack !== true) {
        throw httpError(400, 'Please confirm first.');
      }
    }
    let autoAnswer = null;
    if (item.autoAnswer && plan.strong && plan.target.database) {
      try {
        autoAnswer = { when: new RegExp(item.autoAnswer.when, 'i'), send: plan.target.database };
      } catch (e) {
        autoAnswer = null;
      }
    }
    const label = plan.target.configured ? plan.target.host + ' / ' + plan.target.database : '(no database)';
    const job = runner.startJob(body.repoPath, {
      title: item.title + (envKey === 'production' ? ' (PRODUCTION)' : ' (local)'),
      actionId: item.id,
      kind: 'action',
      targetLabel: label,
      danger: plan.strong,
      history: {
        actionId: item.id,
        env: envKey,
        appEnv: plan.appEnv,
        host: plan.target.host,
        database: plan.target.database,
        command: plan.display,
      },
      steps: [
        {
          id: item.id,
          title: item.title,
          command: plan.command,
          cwd: plan.cwd,
          env: needsDb ? { APP_ENV: plan.appEnv } : {},
          interactive: true,
          autoAnswer,
        },
      ],
    });
    return { job };
  });

  handle('repoConsole:tests', ({ repoPath, which }) => {
    knownRepo(repoPath);
    const ctx = manifest.getContext(repoPath);
    if (ctx.source === 'manifest' && !ctx.trusted) {
      throw httpError(403, 'Trust this repository\'s console manifest before running its tests.');
    }
    const suites = manifest.resolveSuites(repoPath, which);
    if (!suites.length) throw httpError(400, 'No test suite was found for this repository.');
    const steps = suites.map((s) => ({
      id: s.id,
      title: s.title,
      command: s.command,
      cwd: s.cwd,
      env: {},
      interactive: false,
      test: { runner: s.runner, total: s.files },
    }));
    const actionId = 'tests:' + (suites.length > 1 ? 'all' : suites[0].id);
    const job = runner.startJob(repoPath, {
      title: suites.length > 1 ? 'All tests' : suites[0].title,
      actionId,
      kind: 'tests',
      targetLabel: '',
      danger: false,
      history: { actionId, command: steps.map((s) => s.command).join(' && ') },
      steps,
    });
    return { job };
  });

  handle('repoConsole:stop', ({ repoPath }) => {
    knownRepo(repoPath);
    return { stopped: runner.stopJob(repoPath) };
  });

  handle('repoConsole:input', ({ repoPath, text }) => {
    knownRepo(repoPath);
    return { sent: runner.sendInput(repoPath, text) };
  });

  handle('repoConsole:job', ({ repoPath, withLog }) => {
    knownRepo(repoPath);
    return { job: runner.getJob(repoPath, !!withLog) };
  });

  handle('repoConsole:history', ({ repoPath, page, limit, action, status, env, q }) => {
    knownRepo(repoPath);
    return consoleDb.listRuns(repoPath, { page, limit, action, status, env, q });
  });

  handle('repoConsole:historyRun', ({ repoPath, id }) => {
    knownRepo(repoPath);
    const detail = consoleDb.getRun(id);
    if (!detail || detail.run.repoPath !== repoPath) throw httpError(404, 'That run was not found.');
    return { detail };
  });

  handle('repoConsole:historyClear', ({ repoPath, ack }) => {
    knownRepo(repoPath);
    if (ack !== true) throw httpError(400, 'Please confirm first.');
    if (runner.isRunning(repoPath)) throw httpError(409, 'A job is still running. Stop it or wait before clearing history.');
    return { cleared: consoleDb.clearRuns(repoPath) };
  });

  handle('repoConsole:trust', ({ repoPath, hash }) => {
    knownRepo(repoPath);
    manifest.trust(repoPath, hash);
    return { trusted: true };
  });

  app.on('before-quit', () => runner.stopAll());
}

module.exports = { register, hasRunning, stopAll };