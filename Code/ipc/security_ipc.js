'use strict';

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const running = new Set();

const loaded = {};

function lazy(name, rel) {
  if (!loaded[name]) loaded[name] = require(rel);
  return loaded[name];
}

const engine = () => lazy('engine', '../services/security/engine');
const audit = () => lazy('audit', '../services/security/audit');
const reportFile = () => lazy('reportFile', '../services/security/reportFile');
const markdownReport = () => lazy('markdownReport', '../services/security/markdownReport');
const targetGuard = () => lazy('targetGuard', '../services/security/targetGuard');
const targetDetector = () => lazy('targetDetector', '../services/security/targetDetector');
const consoleDb = () => lazy('consoleDb', '../database/consoleDb');

let storeDir = '';
let storeReady = false;

function reportStore() {
  const store = lazy('reportStore', '../services/security/reportStore');
  if (!storeReady) {
    store.init(storeDir);
    storeReady = true;
  }
  return store;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function defaultSettings() {
  return { targetUrl: '', safeMode: true, confirmedHosts: [] };
}

function sendProgress(getMainWindow, repoPath, data) {
  try {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('repoConsole:event', { repoPath, event: 'security-progress', data });
    }
  } catch (e) {
    /* the window may be closing */
  }
}

async function resolveTarget(repoPath, profile, settings, send) {
  const saved = String(settings.targetUrl || '').trim();
  if (saved) return { settings, source: 'saved', assumptions: [] };

  send({ type: 'stage', text: 'No target saved: looking for the app URL in env files, package scripts and config' });
  let found = null;
  try {
    found = await targetDetector().detect(repoPath, profile);
  } catch (e) {
    found = null;
  }
  if (!found || !found.best) {
    send({ type: 'log', text: 'No local app URL could be detected.' });
    return { settings, source: 'none', assumptions: [] };
  }

  const best = found.best;
  const origin = best.sources[0] || 'the project files';
  send({
    type: 'log',
    text: 'Auto-detected target ' + best.url + ' (' + origin + (best.reachable ? ', answering now' : ', not answering yet') + ')',
  });
  const note =
    'The target URL ' +
    best.url +
    ' was auto-detected from ' +
    origin +
    '.' +
    (found.confident ? '' : ' Other URLs were also found, so check that this is your app and change it in the Target box if it is wrong.');
  return { settings: Object.assign({}, settings, { targetUrl: best.url }), source: 'auto', assumptions: [note] };
}

function register({ app, config, getMainWindow }) {
  storeDir = path.join(app.getPath('userData'), 'repo-console');

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

  handle('security:detect', ({ repoPath }) => {
    knownRepo(repoPath);
    const profile = engine().detectStack(repoPath);
    try {
      consoleDb().saveSecurityProfile(repoPath, profile);
    } catch (e) {
      /* history db is optional */
    }
    return { profile };
  });

  handle('security:detectTarget', async ({ repoPath }) => {
    knownRepo(repoPath);
    let profile = null;
    try {
      profile = consoleDb().getSecurityProfile(repoPath);
    } catch (e) {
      profile = null;
    }
    if (!profile) profile = engine().detectStack(repoPath);
    const target = await targetDetector().detect(repoPath, profile);
    return { target };
  });

  handle('security:getSettings', ({ repoPath }) => {
    knownRepo(repoPath);
    const settings = consoleDb().getSecuritySettings(repoPath) || defaultSettings();
    const profile = consoleDb().getSecurityProfile(repoPath);
    let lastReport = null;
    let history = [];
    try {
      const store = reportStore();
      lastReport = store.getLast(repoPath);
      history = store.getHistory(repoPath);
    } catch (e) {
      lastReport = null;
      history = [];
    }
    return { settings, profile, lastReport, history };
  });

  handle('security:setSettings', ({ repoPath, targetUrl, safeMode, confirmHost }) => {
    knownRepo(repoPath);
    const current = consoleDb().getSecuritySettings(repoPath) || defaultSettings();
    const url = String(targetUrl || '').trim();

    if (!url) {
      const saved = Object.assign({}, current, { targetUrl: '', safeMode: safeMode !== false });
      consoleDb().saveSecuritySettings(repoPath, saved);
      return { settings: saved };
    }

    const result = targetGuard().check(url, current.confirmedHosts);
    if (!result.allowed && !confirmHost) {
      return { needsConfirm: true, reason: result.reason, hostname: result.hostname };
    }

    const confirmedHosts = current.confirmedHosts.slice();
    if (!result.allowed && confirmHost && result.hostname && !confirmedHosts.includes(result.hostname)) {
      confirmedHosts.push(result.hostname);
    }

    const saved = { targetUrl: url, safeMode: safeMode !== false, confirmedHosts };
    consoleDb().saveSecuritySettings(repoPath, saved);
    return { settings: saved };
  });

  handle('security:run', async ({ repoPath }) => {
    knownRepo(repoPath);
    if (running.has(repoPath)) throw httpError(409, 'A security test is already running for this repository.');
    running.add(repoPath);
    const send = (data) => sendProgress(getMainWindow, repoPath, Object.assign({ at: Date.now() }, data));
    try {
      const settings = consoleDb().getSecuritySettings(repoPath) || defaultSettings();
      send({ type: 'stage', text: 'Detecting the project stack' });
      const profile = engine().detectStack(repoPath);
      try {
        consoleDb().saveSecurityProfile(repoPath, profile);
      } catch (e) {
        /* history db is optional */
      }

      const resolved = await resolveTarget(repoPath, profile, settings, send);
      const report = await audit().runAudit({
        repoPath,
        profile,
        settings: resolved.settings,
        targetSource: resolved.source,
        extraAssumptions: resolved.assumptions,
        onProgress: send,
      });

      send({ type: 'stage', text: 'Saving the report to the repository' });
      try {
        reportFile().save(repoPath, report);
        send({ type: 'log', text: 'Saved the report to ' + report.savedFile });
      } catch (e) {
        report.saveError = e.message;
        send({ type: 'log', text: 'Could not save the report file: ' + e.message });
      }
      if (!report.markdown) {
        try {
          report.markdown = markdownReport().build(report);
        } catch (e) {
          report.markdown = '';
        }
      }

      let history = [];
      try {
        const store = reportStore();
        store.save(repoPath, report);
        history = store.getHistory(repoPath);
      } catch (e) {
        console.error('[Security] Could not save the report:', e.message);
        history = [];
      }
      return { report, history, profile };
    } finally {
      running.delete(repoPath);
    }
  });
}

module.exports = { register };