'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { RESULT_FILE, resolveTarget } = require('./consoleEnv');

const MANIFEST_REL = path.join('.helper', 'console.json');
const WIPE_PHRASE = 'WIPE EVERYTHING';
const DETECT_DIRS = ['.', 'backend', 'frontend', 'server', 'client', 'api', 'web', 'app'];
const TEST_DIRS = ['__TEST__', '__tests__', 'tests', 'test', 'src'];
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SCRIPT_NAME_RE = /^[A-Za-z0-9:_.-]+$/;
const NODE_FILE_RE = /^[\w./\\-]+$/;
const RISKS = ['readonly', 'adds', 'changes', 'destructive'];
const SKIP_SCRIPTS = new Set(['start', 'dev', 'serve', 'watch', 'install', 'postinstall', 'prepare', 'test']);

let _trustFile = null;

function init(app) {
  _trustFile = path.join(app.getPath('userData'), 'repo-console', 'trust.json');
}

function readTrust() {
  try {
    return JSON.parse(fs.readFileSync(_trustFile, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

function writeTrust(map) {
  fs.mkdirSync(path.dirname(_trustFile), { recursive: true });
  fs.writeFileSync(_trustFile, JSON.stringify(map, null, 2));
}

function readPackage(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
    return { scripts: pkg.scripts || {}, deps };
  } catch (e) {
    return { scripts: {}, deps: {} };
  }
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function countFiles(dir, re) {
  let n = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (re.test(e.name)) n += 1;
    }
  }
  return n;
}

function suiteCommand(runner) {
  if (runner === 'vitest') {
    return 'npm test -- --reporter=default --reporter=json --outputFile.json=' + RESULT_FILE;
  }
  return 'npm test -- --json --outputFile=' + RESULT_FILE;
}

function classify(name) {
  const n = name.toLowerCase();
  let page = 'scripts';
  if (n.includes('seed')) page = 'seeds';
  else if (/migrat|prisma|db:|reset|schema/.test(n)) page = 'database';
  let risk = 'changes';
  if (/reset|wipe|drop|clean|purge|delete/.test(n)) risk = 'destructive';
  else if (/status|audit|inspect|check|lint|generate|typecheck|build/.test(n)) risk = 'readonly';
  const needsDb = (page === 'seeds' || page === 'database') && !/generate/.test(n);
  return { page, risk, needsDb };
}

function bodyAppEnv(body) {
  const m = body ? /APP_ENV=([A-Za-z0-9_-]+)/.exec(body) : null;
  return m ? m[1] : null;
}

function detect(repoPath) {
  const actions = [];
  const suites = [];
  for (const rel of DETECT_DIRS) {
    const dir = path.resolve(repoPath, rel);
    if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
    const { scripts, deps } = readPackage(dir);
    const groups = new Map();
    for (const name of Object.keys(scripts)) {
      if (SKIP_SCRIPTS.has(name)) continue;
      const hook = /^(pre|post)(.+)$/.exec(name);
      if (hook && scripts[hook[2]]) continue;
      const isProd = /:prod(uction)?$/.test(name);
      const base = name.replace(/:prod(uction)?$/, '');
      if (!groups.has(base)) groups.set(base, {});
      groups.get(base)[isProd ? 'production' : 'local'] = name;
    }
    for (const [base, names] of groups) {
      const info = classify(base);
      const targets = {};
      if (names.local) targets.local = { script: names.local, appEnv: bodyAppEnv(scripts[names.local]) || 'development' };
      if (names.production) targets.production = { script: names.production, appEnv: bodyAppEnv(scripts[names.production]) || 'production' };
      let section = 'Scripts';
      if (info.page === 'seeds') section = 'Seeds';
      else if (info.page === 'database') section = 'Database';
      else if (rel !== '.') section = rel.charAt(0).toUpperCase() + rel.slice(1);
      actions.push({
        id: 'pkg:' + rel + ':' + base,
        page: info.page,
        section,
        title: base,
        summary: 'Runs "npm run ' + base + '" in ' + (rel === '.' ? 'the repo root' : rel) + '. Read the script in package.json to see exactly what it does.',
        risk: info.risk,
        warn: null,
        warnProd: info.needsDb ? 'This targets the PRODUCTION database. Take a backup first.' : null,
        does: ['Runs the npm script "' + base + '" from ' + (rel === '.' ? 'the repo root' : rel + '/package.json') + '.'],
        changes: info.risk === 'readonly' ? ['Nothing the console knows about.'] : ['Whatever the script does. Review it before running.'],
        keeps: null,
        twice: null,
        order: null,
        needsDb: info.needsDb,
        cwd: rel,
        targets,
        autoAnswer: null,
      });
    }
    const runner = deps.vitest ? 'vitest' : deps.jest ? 'jest' : null;
    if (runner && scripts.test) {
      const testDir = TEST_DIRS.find((d) => countFiles(path.join(dir, d), TEST_FILE_RE) > 0) || 'src';
      const label = rel === '.' ? 'root' : rel;
      suites.push({
        id: label,
        title: label + ' tests',
        runner,
        command: suiteCommand(runner),
        cwd: rel,
        dir: testDir,
      });
    }
  }
  return { actions, suites };
}

function normalizeManifest(parsed) {
  const actions = [];
  for (const a of Array.isArray(parsed.actions) ? parsed.actions : []) {
    if (!a || typeof a.id !== 'string' || typeof a.title !== 'string') continue;
    const targets = a.targets && typeof a.targets === 'object' ? a.targets : { local: { script: a.script, node: a.node, command: a.command, appEnv: a.appEnv } };
    actions.push({
      id: a.id,
      page: ['seeds', 'database'].includes(a.page) ? a.page : 'scripts',
      section: a.section || 'Scripts',
      title: a.title,
      summary: a.summary || '',
      risk: RISKS.includes(a.risk) ? a.risk : 'changes',
      warn: a.warn || null,
      warnProd: a.warnProd || null,
      does: Array.isArray(a.does) ? a.does : [],
      changes: Array.isArray(a.changes) ? a.changes : [],
      keeps: a.keeps || null,
      twice: a.twice || null,
      order: a.order || null,
      needsDb: a.needsDb !== false && ['seeds', 'database'].includes(a.page),
      cwd: a.cwd || '.',
      targets,
      autoAnswer: a.autoAnswer && typeof a.autoAnswer.when === 'string' ? { when: a.autoAnswer.when } : null,
    });
  }
  const suites = [];
  for (const s of Array.isArray(parsed.suites) ? parsed.suites : []) {
    if (!s || typeof s.id !== 'string' || !['jest', 'vitest'].includes(s.runner)) continue;
    suites.push({
      id: s.id,
      title: s.title || s.id + ' tests',
      runner: s.runner,
      command: suiteCommand(s.runner),
      cwd: s.cwd || '.',
      dir: s.dir || 'src',
    });
  }
  return { actions, suites };
}

function load(repoPath) {
  const file = path.join(repoPath, MANIFEST_REL);
  let raw = null;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    raw = null;
  }
  if (raw === null) {
    return Object.assign({ repoPath, source: 'detected', trusted: true, hash: null, wipePhrase: WIPE_PHRASE, notice: '' }, detect(repoPath));
  }
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return Object.assign(
      { repoPath, source: 'detected', trusted: true, hash: null, wipePhrase: WIPE_PHRASE, notice: '.helper/console.json is not valid JSON, so detected scripts are shown instead.' },
      detect(repoPath)
    );
  }
  const trusted = readTrust()[repoPath] === hash;
  const normalized = normalizeManifest(parsed);
  return Object.assign(
    { repoPath, source: 'manifest', trusted, hash, wipePhrase: typeof parsed.wipePhrase === 'string' ? parsed.wipePhrase : WIPE_PHRASE, notice: '' },
    normalized
  );
}

function planTarget(ctx, item, t) {
  const root = ctx.repoPath;
  const cwd = path.resolve(root, item.cwd || '.');
  const blocked = ctx.source === 'manifest' && !ctx.trusted;
  const plan = {
    display: '',
    command: '',
    cwd,
    missing: false,
    blocked,
    appEnv: 'development',
    scriptBody: null,
    target: null,
    remote: false,
    strong: false,
  };
  if (!t || !isInside(root, cwd) || !fs.existsSync(cwd)) {
    plan.missing = true;
    plan.target = resolveTarget(root, plan.appEnv);
    return plan;
  }
  if (t.script) {
    plan.display = 'npm run ' + t.script;
    plan.command = plan.display;
    if (!SCRIPT_NAME_RE.test(String(t.script))) plan.missing = true;
    else {
      plan.scriptBody = readPackage(cwd).scripts[t.script] || null;
      if (!plan.scriptBody) plan.missing = true;
    }
  } else if (t.node) {
    const rel = String(t.node);
    plan.display = 'node ' + rel;
    plan.command = 'node "' + rel + '"';
    const full = path.resolve(cwd, rel);
    if (!NODE_FILE_RE.test(rel) || !isInside(root, full) || !fs.existsSync(full)) plan.missing = true;
  } else if (typeof t.command === 'string' && t.command.trim()) {
    plan.display = t.command.trim();
    plan.command = plan.display;
  } else {
    plan.missing = true;
  }
  plan.appEnv = bodyAppEnv(plan.scriptBody) || (typeof t.appEnv === 'string' && /^[A-Za-z0-9_-]+$/.test(t.appEnv) ? t.appEnv : 'development');
  plan.target = resolveTarget(cwd, plan.appEnv);
  plan.remote = !!plan.target.remote;
  plan.strong = plan.appEnv === 'production' || plan.remote;
  return plan;
}

function publicPlan(plan) {
  return {
    display: plan.display,
    missing: plan.missing,
    blocked: plan.blocked,
    appEnv: plan.appEnv,
    target: plan.target,
    remote: plan.remote,
    strong: plan.strong,
  };
}

function describe(repoPath) {
  const ctx = load(repoPath);
  const items = ctx.actions.map((item) => {
    const targets = {};
    for (const envKey of ['local', 'production']) {
      if (item.targets && item.targets[envKey]) targets[envKey] = publicPlan(planTarget(ctx, item, item.targets[envKey]));
    }
    const view = Object.assign({}, item, { targets });
    delete view.autoAnswer;
    delete view.cwd;
    return view;
  });
  const suites = ctx.suites.map((s) => ({
    id: s.id,
    title: s.title,
    runner: s.runner,
    files: countFiles(path.join(path.resolve(repoPath, s.cwd), s.dir), TEST_FILE_RE),
  }));
  return {
    source: ctx.source,
    trusted: ctx.trusted,
    hash: ctx.hash,
    wipePhrase: ctx.wipePhrase,
    notice: ctx.notice,
    items,
    suites,
  };
}

function resolveAction(repoPath, id, envKey) {
  const ctx = load(repoPath);
  const key = envKey === 'production' ? 'production' : 'local';
  const item = ctx.actions.find((a) => a.id === id) || null;
  if (!item) return { ctx, item: null, plan: null, envKey: key };
  const t = item.targets ? item.targets[key] : null;
  if (!t) return { ctx, item, plan: null, envKey: key };
  return { ctx, item, plan: planTarget(ctx, item, t), envKey: key };
}

function resolveSuites(repoPath, which) {
  const ctx = load(repoPath);
  const chosen = !which || which === 'all' ? ctx.suites : ctx.suites.filter((s) => s.id === which);
  return chosen.map((s) => {
    const cwd = path.resolve(repoPath, s.cwd);
    return {
      id: s.id,
      title: s.title,
      runner: s.runner,
      command: s.command,
      cwd,
      files: countFiles(path.join(cwd, s.dir), TEST_FILE_RE),
      valid: isInside(repoPath, cwd) && fs.existsSync(cwd),
    };
  }).filter((s) => s.valid);
}

function getContext(repoPath) {
  const ctx = load(repoPath);
  return { source: ctx.source, trusted: ctx.trusted, hash: ctx.hash };
}

function trust(repoPath, hash) {
  const ctx = load(repoPath);
  if (ctx.source !== 'manifest') throw new Error('This repository has no console manifest to trust.');
  if (!hash || hash !== ctx.hash) throw new Error('The manifest changed since you reviewed it. Reload and review it again.');
  const map = readTrust();
  map[repoPath] = hash;
  writeTrust(map);
  return true;
}

module.exports = { init, describe, resolveAction, resolveSuites, getContext, trust, RESULT_FILE, WIPE_PHRASE };