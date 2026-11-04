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
const SAFE_NAME_RE = /^[A-Za-z0-9:_.-]+$/;
const SAFE_PATH_RE = /^[A-Za-z0-9_./-]+$/;
const IGNORE_DIRS = new Set(['node_modules', 'vendor', 'bin', 'obj', 'target', 'venv', 'env', '__pycache__', 'dist', 'build', 'storage']);
const MAKE_SKIP = new Set(['all', 'default', 'help', 'install', 'uninstall', 'run', 'dev', 'serve', 'watch', 'start']);
const COMPOSER_SKIP = new Set(['dev', 'start', 'serve', 'watch', 'install']);
const LARAVEL_ACTIONS = [
  {
    name: 'migrate:status',
    page: 'database',
    risk: 'readonly',
    db: true,
    force: false,
    summary: 'Lists every migration and whether it has run.',
    does: ['Reads the migrations table and prints which migrations have run.'],
  },
  {
    name: 'migrate',
    page: 'database',
    risk: 'changes',
    db: true,
    force: true,
    summary: 'Runs every migration that has not run yet.',
    does: ['Applies the pending migrations in order.'],
    twice: 'Yes. Migrations that already ran are skipped.',
  },
  {
    name: 'migrate:rollback',
    page: 'database',
    risk: 'destructive',
    db: true,
    force: true,
    summary: 'Undoes the last batch of migrations.',
    does: ['Runs the down() method of the last batch of migrations.'],
    changes: ['Can drop tables and columns, and the data in them.'],
  },
  {
    name: 'migrate:fresh',
    page: 'database',
    risk: 'destructive',
    db: true,
    force: true,
    summary: 'Drops every table, then runs all migrations again.',
    does: ['Drops all tables in the database.', 'Runs every migration from the start.'],
    changes: ['Deletes all data in the database.'],
  },
  {
    name: 'migrate:fresh --seed',
    page: 'database',
    risk: 'destructive',
    db: true,
    force: true,
    summary: 'Drops every table, runs all migrations, then runs the seeders.',
    does: ['Drops all tables in the database.', 'Runs every migration from the start.', 'Runs DatabaseSeeder.'],
    changes: ['Deletes all data in the database and fills it with seed data.'],
  },
  {
    name: 'db:seed',
    page: 'seeds',
    risk: 'adds',
    db: true,
    force: true,
    summary: 'Runs DatabaseSeeder.',
    does: ['Runs the seeders listed in database/seeders/DatabaseSeeder.php.'],
    changes: ['Adds rows. Whether it is safe to run twice depends on the seeders.'],
  },
  {
    name: 'route:list',
    page: 'scripts',
    risk: 'readonly',
    db: false,
    force: false,
    summary: 'Lists every route of the application.',
    does: ['Prints the registered routes.'],
  },
  {
    name: 'optimize:clear',
    page: 'scripts',
    risk: 'changes',
    db: false,
    force: false,
    summary: 'Clears the route, config, view and event caches.',
    does: ['Deletes the cached framework files.'],
    changes: ['Cached files only. No database data is touched.'],
    twice: 'Yes.',
  },
];


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

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return '';
  }
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
}

function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

function where(rel) {
  return rel === '.' ? 'the repo root' : rel;
}

function findFiles(dir, re, depth) {
  const out = [];
  const walk = (current, level) => {
    for (const e of listDir(current)) {
      if (e.name.startsWith('.') || IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        if (level < depth) walk(full, level + 1);
      } else if (re.test(e.name)) {
        out.push(full);
      }
    }
  };
  walk(dir, 0);
  return out;
}

function sectionFor(page, label, rel) {
  if (page === 'seeds') return 'Seeds';
  if (page === 'database') return 'Database';
  return rel === '.' ? label : label + ' / ' + rel;
}

function classifyTool(name) {
  const info = classify(name);
  const readonlyRe = /(^|[:_.-])(test|tests|phpunit|pest|phpstan|psalm|analy[sz]e|stan|vet|clippy)($|[:_.-])/i;
  if (info.risk !== 'destructive' && readonlyRe.test(name)) info.risk = 'readonly';
  return info;
}

function makeAction(o) {
  const targets = {};
  if (o.local) targets.local = { command: o.local, appEnv: 'development' };
  if (o.production) targets.production = { command: o.production, appEnv: 'production' };
  const needsDb = !!o.needsDb;
  const risk = o.risk || 'changes';
  return {
    id: o.id,
    page: o.page || 'scripts',
    section: o.section,
    title: o.title,
    summary: o.summary || '',
    risk,
    warn: o.warn || null,
    warnProd: needsDb ? 'This targets the PRODUCTION database. Take a backup first.' : null,
    does: o.does || [],
    changes: o.changes || (risk === 'readonly' ? ['Nothing the console knows about.'] : ['Whatever the command does. Review it before running.']),
    keeps: null,
    twice: o.twice || null,
    order: null,
    needsDb,
    cwd: o.cwd || '.',
    targets,
    autoAnswer: null,
  };
}

function simpleAction(prefix, label, rel, name, cmd, risk) {
  return makeAction({
    id: prefix + ':' + rel + ':' + name,
    page: 'scripts',
    section: sectionFor('scripts', label, rel),
    title: name,
    summary: 'Runs "' + cmd + '" in ' + where(rel) + '.',
    risk,
    cwd: rel,
    local: cmd,
    does: ['Runs "' + cmd + '" from ' + where(rel) + '.'],
  });
}

function detectNode(dir, rel, actions, suites) {
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
      summary: 'Runs "npm run ' + base + '" in ' + where(rel) + '. Read the script in package.json to see exactly what it does.',
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

function detectPhp(repoPath, dir, rel) {
  const out = [];
  const composerText = readText(path.join(dir, 'composer.json'));
  if (composerText) {
    let scripts = {};
    try {
      const parsed = JSON.parse(composerText).scripts;
      scripts = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      scripts = {};
    }
    for (const name of Object.keys(scripts)) {
      if (!SAFE_NAME_RE.test(name) || /^(pre|post)-/.test(name) || COMPOSER_SKIP.has(name)) continue;
      const info = classifyTool(name);
      const cmd = 'composer run-script ' + name;
      out.push(
        makeAction({
          id: 'composer:' + rel + ':' + name,
          page: info.page,
          section: sectionFor(info.page, 'Composer', rel),
          title: name,
          summary: 'Runs "' + cmd + '" in ' + where(rel) + '. Read the script in composer.json to see exactly what it does.',
          risk: info.risk,
          needsDb: info.needsDb,
          cwd: rel,
          local: cmd,
          production: info.needsDb ? cmd : null,
          does: ['Runs the Composer script "' + name + '" from ' + where(rel) + '.'],
        })
      );
    }
  }
  if (fs.existsSync(path.join(dir, 'artisan'))) {
    for (const a of LARAVEL_ACTIONS) {
      const cmd = 'php artisan ' + a.name;
      out.push(
        makeAction({
          id: 'artisan:' + rel + ':' + a.name.replace(/\s+/g, '-'),
          page: a.page,
          section: sectionFor(a.page, 'Laravel', rel),
          title: a.name,
          summary: a.summary,
          risk: a.risk,
          needsDb: a.db,
          cwd: rel,
          local: cmd,
          production: a.db ? cmd + ' --env=production' + (a.force ? ' --force' : '') : null,
          does: a.does,
          changes: a.changes,
          twice: a.twice,
        })
      );
    }
    const seederFiles = findFiles(path.join(dir, 'database', 'seeders'), /Seeder\.php$/, 2).slice(0, 20);
    for (const file of seederFiles) {
      const cls = path.basename(file, '.php');
      if (cls === 'DatabaseSeeder' || !/^[A-Za-z0-9_]+$/.test(cls)) continue;
      const cmd = 'php artisan db:seed --class=' + cls;
      out.push(
        makeAction({
          id: 'artisan:' + rel + ':seed:' + cls,
          page: 'seeds',
          section: 'Seeds',
          title: cls,
          summary: 'Runs only the ' + cls + ' seeder.',
          risk: 'adds',
          needsDb: true,
          cwd: rel,
          local: cmd,
          production: cmd + ' --env=production --force',
          does: ['Runs the seeder class ' + cls + ' from database/seeders.'],
          changes: ['Adds rows. Whether it is safe to run twice depends on the seeder.'],
        })
      );
    }
  }
  return out;
}

function detectPython(repoPath, dir, rel) {
  const has = (name) => fs.existsSync(path.join(dir, name));
  if (!has('pyproject.toml') && !has('requirements.txt') && !has('alembic.ini') && !has('manage.py')) return [];
  const deps = (readText(path.join(dir, 'pyproject.toml')) + '\n' + readText(path.join(dir, 'requirements.txt'))).toLowerCase();
  const label = has('manage.py') ? 'Django' : deps.includes('fastapi') ? 'FastAPI' : 'Python';
  const prefix = has('poetry.lock') ? 'poetry run ' : has('uv.lock') ? 'uv run ' : '';
  const py = prefix + (process.platform === 'win32' ? 'python' : 'python3');
  const out = [];
  const db = (id, title, cmd, risk, summary, does, twice) => {
    out.push(
      makeAction({
        id: 'py:' + rel + ':' + id,
        page: 'database',
        section: 'Database',
        title,
        summary,
        risk,
        needsDb: true,
        cwd: rel,
        local: cmd,
        production: cmd,
        does,
        twice,
      })
    );
  };
  if (has('alembic.ini')) {
    db('alembic-current', 'alembic current', prefix + 'alembic current', 'readonly', 'Shows which Alembic revision the database is on.', ['Reads the alembic_version table.']);
    db('alembic-upgrade', 'alembic upgrade head', prefix + 'alembic upgrade head', 'changes', 'Applies every Alembic migration that has not run yet.', ['Upgrades the database to the latest revision.'], 'Yes. Revisions that already ran are skipped.');
    db('alembic-downgrade', 'alembic downgrade -1', prefix + 'alembic downgrade -1', 'destructive', 'Undoes the most recent Alembic migration.', ['Runs the downgrade of the current revision.']);
    out.push(simpleAction('py', label, rel, 'alembic-history', prefix + 'alembic history', 'readonly'));
  }
  if (has('manage.py')) {
    db('django-showmigrations', 'showmigrations', py + ' manage.py showmigrations', 'readonly', 'Lists every Django migration and whether it has run.', ['Reads the django_migrations table.']);
    db('django-migrate', 'migrate', py + ' manage.py migrate', 'changes', 'Applies every Django migration that has not run yet.', ['Runs the pending migrations in order.'], 'Yes. Migrations that already ran are skipped.');
    out.push(simpleAction('py', label, rel, 'django-check', py + ' manage.py check', 'readonly'));
  }
  if (deps.includes('ruff')) out.push(simpleAction('py', label, rel, 'ruff-check', prefix + 'ruff check .', 'readonly'));
  if (deps.includes('mypy')) out.push(simpleAction('py', label, rel, 'mypy', prefix + 'mypy .', 'readonly'));
  if (deps.includes('pytest')) out.push(simpleAction('py', label, rel, 'pytest', prefix + 'pytest', 'readonly'));
  const seedFiles = findFiles(dir, /^seed.*\.py$/i, 3).slice(0, 8);
  for (const file of seedFiles) {
    const relFile = toPosix(path.relative(dir, file));
    if (!SAFE_PATH_RE.test(relFile) || /(^|\/)tests?\//.test(relFile)) continue;
    const cmd = py + ' ' + relFile;
    out.push(
      makeAction({
        id: 'py:' + rel + ':seed:' + relFile,
        page: 'seeds',
        section: 'Seeds',
        title: relFile,
        summary: 'Runs the seed script ' + relFile + '. Read it to see exactly what it adds.',
        risk: 'adds',
        needsDb: true,
        cwd: rel,
        local: cmd,
        production: cmd,
        does: ['Runs ' + relFile + ' with Python.'],
        changes: ['Adds rows. Whether it is safe to run twice depends on the script.'],
      })
    );
  }
  return out;
}

function detectDotnet(repoPath, dir, rel) {
  const names = listDir(dir).filter((e) => e.isFile()).map((e) => e.name);
  const hasRoot = names.some((n) => /\.(sln|slnx|csproj)$/i.test(n));
  const projects = findFiles(dir, /\.csproj$/i, 3);
  if (!hasRoot && !projects.length) return [];
  const out = [];
  if (hasRoot) {
    out.push(simpleAction('dotnet', '.NET', rel, 'build', 'dotnet build', 'readonly'));
    out.push(simpleAction('dotnet', '.NET', rel, 'test', 'dotnet test', 'readonly'));
    out.push(simpleAction('dotnet', '.NET', rel, 'restore', 'dotnet restore', 'adds'));
  }
  const efProjects = projects.filter((p) => readText(p).includes('Microsoft.EntityFrameworkCore')).slice(0, 4);
  for (const proj of efProjects) {
    const projDir = path.dirname(proj);
    const cwdRel = toPosix(path.relative(repoPath, projDir)) || '.';
    if (!SAFE_PATH_RE.test(cwdRel)) continue;
    const suffix = efProjects.length > 1 ? ' (' + path.basename(projDir) + ')' : '';
    const defs = [
      ['migrations-list', 'ef migrations list', 'dotnet ef migrations list', 'readonly', 'Lists the EF Core migrations and whether each one is applied.', ['Connects to the database and compares it with the migrations in the project.']],
      ['database-update', 'ef database update', 'dotnet ef database update', 'changes', 'Applies every EF Core migration that has not run yet.', ['Updates the database to the latest migration.']],
    ];
    for (const [key, title, cmd, risk, summary, does] of defs) {
      out.push(
        makeAction({
          id: 'dotnet-ef:' + cwdRel + ':' + key,
          page: 'database',
          section: 'Database',
          title: title + suffix,
          summary,
          risk,
          needsDb: true,
          cwd: cwdRel,
          local: cmd,
          production: cmd + ' -- --environment Production',
          does,
          twice: key === 'database-update' ? 'Yes. Migrations that already ran are skipped.' : null,
        })
      );
    }
  }
  return out;
}

function detectGo(repoPath, dir, rel) {
  if (!fs.existsSync(path.join(dir, 'go.mod'))) return [];
  return [
    ['build', 'go build ./...', 'readonly'],
    ['vet', 'go vet ./...', 'readonly'],
    ['test', 'go test ./...', 'readonly'],
  ].map(([name, cmd, risk]) => simpleAction('go', 'Go', rel, name, cmd, risk));
}

function detectRust(repoPath, dir, rel) {
  if (!fs.existsSync(path.join(dir, 'Cargo.toml'))) return [];
  return [
    ['build', 'cargo build', 'readonly'],
    ['check', 'cargo check', 'readonly'],
    ['test', 'cargo test', 'readonly'],
  ].map(([name, cmd, risk]) => simpleAction('cargo', 'Rust', rel, name, cmd, risk));
}

function detectMake(repoPath, dir, rel) {
  const file = ['Makefile', 'makefile', 'GNUmakefile'].find((n) => fs.existsSync(path.join(dir, n)));
  if (!file) return [];
  const names = [];
  for (const line of readText(path.join(dir, file)).split(/\r?\n/)) {
    const m = /^([A-Za-z0-9][A-Za-z0-9_-]*)\s*:(?![=:])/.exec(line);
    if (!m || MAKE_SKIP.has(m[1]) || names.includes(m[1])) continue;
    names.push(m[1]);
  }
  return names.slice(0, 30).map((name) => {
    const info = classifyTool(name);
    const cmd = 'make ' + name;
    return makeAction({
      id: 'make:' + rel + ':' + name,
      page: info.page,
      section: sectionFor(info.page, 'Make', rel),
      title: name,
      summary: 'Runs "' + cmd + '" in ' + where(rel) + '. Read the target in the Makefile to see exactly what it does.',
      risk: info.risk,
      needsDb: info.needsDb,
      cwd: rel,
      local: cmd,
      production: info.needsDb ? cmd : null,
      does: ['Runs the Makefile target "' + name + '" from ' + where(rel) + '.'],
    });
  });
}

function detectCMake(repoPath, dir, rel) {
  if (!fs.existsSync(path.join(dir, 'CMakeLists.txt'))) return [];
  return [
    ['configure', 'cmake -S . -B build', 'adds'],
    ['build', 'cmake --build build', 'adds'],
    ['ctest', 'ctest --test-dir build', 'readonly'],
  ].map(([name, cmd, risk]) => simpleAction('cmake', 'CMake', rel, name, cmd, risk));
}
function detect(repoPath) {
  const actions = [];
  const suites = [];
  const detectors = [detectPhp, detectPython, detectDotnet, detectGo, detectRust, detectMake, detectCMake];
  for (const rel of DETECT_DIRS) {
    const dir = path.resolve(repoPath, rel);
    if (!fs.existsSync(dir)) continue;
    if (fs.existsSync(path.join(dir, 'package.json'))) detectNode(dir, rel, actions, suites);
    for (const run of detectors) {
      try {
        actions.push(...run(repoPath, dir, rel));
      } catch (e) {
        /* an unreadable project file must not hide the other actions */
      }
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