'use strict';

const path = require('path');
const engine = require('./engine');
const targetGuard = require('./targetGuard');
const fileScanner = require('./fileScanner');
const httpClient = require('./httpClient');
const { redactText, skip, na } = require('./result');
const universal = require('./packs/universal');
const staticCode = require('./packs/staticCode');
const frontend = require('./packs/frontend');
const hygiene = require('./packs/hygiene');
const notCovered = require('./packs/notCovered');
const scorer = require('./scorer');
const reporter = require('./report');

const CHECKS = [].concat(universal.checks, staticCode.checks, frontend.checks, hygiene.checks);

async function runOne(check, ctx) {
  const base = {
    id: check.id,
    title: check.title,
    category: check.category,
    level: check.level,
    kind: check.kind,
    owasp: check.owasp || '',
  };
  let res;
  try {
    if (check.kind === 'dynamic' && !ctx.dynamicReady) res = skip(ctx.dynamicReason);
    else if (check.applies && !check.applies(ctx.profile)) res = na('Does not apply to the detected stack.');
    else res = await check.run(ctx);
  } catch (e) {
    res = skip('The check could not finish: ' + (e && e.message ? e.message : e));
  }
  const evidence = (res.evidence || []).map((ev) => ({ file: ev.file, line: ev.line || 0, text: redactText(ev.text) }));
  return Object.assign(base, {
    status: res.status,
    severity: res.severity || check.severity,
    detail: res.detail || '',
    evidence,
    fix: res.fix || '',
  });
}

async function prepareTarget(ctx, cfg) {
  const target = String(cfg.targetUrl || '').trim();
  ctx.target = target;
  if (!target) {
    ctx.dynamicReason = 'No target URL is saved. Save a target to run the live checks.';
    return;
  }
  const guard = targetGuard.check(target, cfg.confirmedHosts);
  if (!guard.allowed) {
    ctx.dynamicReason = guard.reason;
    return;
  }
  const home = await ctx.client.request(target);
  if (home.error) {
    ctx.dynamicReason = 'The target did not answer (' + home.error + '). Start the app and run again.';
    return;
  }
  ctx.target = home.url || target;
  ctx.home = home;
  ctx.dynamicReady = true;
}

async function runScan({ repoPath, settings }) {
  const started = Date.now();
  const cfg = settings || {};
  const profile = engine.detectStack(repoPath);
  const scanned = fileScanner.scan(repoPath);
  const client = httpClient.createClient({ maxRequests: 70, timeoutMs: 6000 });

  const ctx = {
    repoPath,
    profile,
    files: scanned.files,
    envFiles: scanned.envFiles,
    client,
    target: '',
    home: null,
    dynamicReady: false,
    dynamicReason: '',
    tracked: undefined,
    url: (p) => new URL(p, ctx.target).href,
  };

  await prepareTarget(ctx, cfg);

  const findings = [];
  for (const check of CHECKS) findings.push(await runOne(check, ctx));

  const report = {
    repoPath,
    repoName: path.basename(repoPath),
    startedAt: started,
    durationMs: Date.now() - started,
    target: ctx.target,
    targetTested: ctx.dynamicReady,
    dynamicNote: ctx.dynamicReady ? '' : ctx.dynamicReason,
    profile,
    score: scorer.score(findings),
    findings,
    notCovered: notCovered.items,
    scanInfo: { files: scanned.files.length, truncated: scanned.truncated, requests: client.count() },
  };
  report.markdown = reporter.toMarkdown(report);
  return report;
}

module.exports = { runScan };