'use strict';

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const engine = require('../services/security/engine');
const audit = require('../services/security/audit');
const reportStore = require('../services/security/reportStore');
const targetGuard = require('../services/security/targetGuard');
const consoleDb = require('../database/consoleDb');

const running = new Set();

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function defaultSettings() {
  return { targetUrl: '', safeMode: true, confirmedHosts: [] };
}

function register({ app, config, getMainWindow }) {
  reportStore.init(path.join(app.getPath('userData'), 'repo-console'));

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
    const profile = engine.detectStack(repoPath);
    try {
      consoleDb.saveSecurityProfile(repoPath, profile);
    } catch (e) {
      /* history db is optional */
    }
    return { profile };
  });

  handle('security:getSettings', ({ repoPath }) => {
    knownRepo(repoPath);
    const settings = consoleDb.getSecuritySettings(repoPath) || defaultSettings();
    const profile = consoleDb.getSecurityProfile(repoPath);
    let lastReport = null;
    let history = [];
    try {
      lastReport = reportStore.getLast(repoPath);
      history = reportStore.getHistory(repoPath);
    } catch (e) {
      lastReport = null;
      history = [];
    }
    return { settings, profile, lastReport, history };
  });

  handle('security:setSettings', ({ repoPath, targetUrl, safeMode, confirmHost }) => {
    knownRepo(repoPath);
    const current = consoleDb.getSecuritySettings(repoPath) || defaultSettings();
    const url = String(targetUrl || '').trim();

    if (!url) {
      const saved = Object.assign({}, current, { targetUrl: '', safeMode: safeMode !== false });
      consoleDb.saveSecuritySettings(repoPath, saved);
      return { settings: saved };
    }

    const result = targetGuard.check(url, current.confirmedHosts);
    if (!result.allowed && !confirmHost) {
      return { needsConfirm: true, reason: result.reason, hostname: result.hostname };
    }

    const confirmedHosts = current.confirmedHosts.slice();
    if (!result.allowed && confirmHost && result.hostname && !confirmedHosts.includes(result.hostname)) {
      confirmedHosts.push(result.hostname);
    }

    const saved = { targetUrl: url, safeMode: safeMode !== false, confirmedHosts };
    consoleDb.saveSecuritySettings(repoPath, saved);
    return { settings: saved };
  });

  handle('security:run', async ({ repoPath }) => {
    knownRepo(repoPath);
    if (running.has(repoPath)) throw httpError(409, 'A security test is already running for this repository.');
    running.add(repoPath);
    try {
      const settings = consoleDb.getSecuritySettings(repoPath) || defaultSettings();
      const profile = engine.detectStack(repoPath);
      try {
        consoleDb.saveSecurityProfile(repoPath, profile);
      } catch (e) {
        /* history db is optional */
      }
      const report = await audit.runAudit({ repoPath, profile, settings });
      try {
        reportStore.save(repoPath, report);
      } catch (e) {
        console.error('[Security] Could not save the report:', e.message);
      }
      let history = [];
      try {
        history = reportStore.getHistory(repoPath);
      } catch (e) {
        history = [];
      }
      return { report, history, profile };
    } finally {
      running.delete(repoPath);
    }
  });
}

module.exports = { register };