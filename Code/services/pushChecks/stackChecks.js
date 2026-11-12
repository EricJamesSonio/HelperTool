'use strict';

const fs = require('fs');
const path = require('path');
const { RESULT_FILE } = require('../consoleEnv');

const WIN = process.platform === 'win32';
const KIND_ORDER = ['lint', 'typecheck', 'test', 'build'];
const IGNORE = new Set(['node_modules', 'vendor', 'dist', 'build', 'target', 'bin', 'obj', 'venv', 'env', '__pycache__', 'storage', 'coverage', 'out']);
const COUNT_SKIP = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'out', 'target']);
const GROUPS = ['apps', 'packages', 'services', 'libs', 'modules', 'projects'];
const MARKERS = new Set(['package.json', 'composer.json', 'pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py', 'manage.py', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'Gemfile']);
const TEST_FILE_RE = /\.(test|spec|e2e-spec|e2e-test)\.[cm]?[jt]sx?$/;
const DOC_RE = /\.(md|mdx|txt|png|jpe?g|gif|svg|ico|webp|pdf|csv)$/i;
const SKIP_PREFIX = /^(\.github|\.husky|\.vscode|docs)\//;
const PMS = {
  npm: { run: 'npm run ', exec: 'npx --no-install ' },
  pnpm: { run: 'pnpm run ', exec: 'pnpm exec ' },
  yarn: { run: 'yarn run ', exec: 'yarn ' },
  bun: { run: 'bun run ', exec: 'bunx ' },
};

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
}

function fileNamesOf(dir) {
  return listDir(dir).filter((e) => e.isFile()).map((e) => e.name);
}

function has(dir, name) {
  return fs.existsSync(path.join(dir, name));
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return '';
  }
}

function readJson(file) {
  try {
    return JSON.parse(readText(file).replace(/^\uFEFF/, ''));
  } catch (e) {
    return null;
  }
}

function safe(fn, ...args) {
  try {
    return fn(...args);
  } catch (e) {
    return null;
  }
}

function hasMarker(dir) {
  return fileNamesOf(dir).some((n) => MARKERS.has(n) || /^requirements.*\.txt$/.test(n) || /\.(sln|slnx|csproj)$/i.test(n));
}

function countTestFiles(dir) {
  let count = 0;
  let seen = 0;
  const stack = [dir];
  while (stack.length && seen < 20000) {
    const current = stack.pop();
    for (const e of listDir(current)) {
      seen += 1;
      if (e.name.startsWith('.') || COUNT_SKIP.has(e.name)) continue;
      const full = path.join(current, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (TEST_FILE_RE.test(e.name)) count += 1;
    }
  }
  return count;
}

function findProjects(repoPath) {
  const rels = [];
  if (hasMarker(repoPath)) rels.push('.');
  for (const e of listDir(repoPath)) {
    if (!e.isDirectory() || e.name.startsWith('.') || IGNORE.has(e.name)) continue;
    const full = path.join(repoPath, e.name);
    if (GROUPS.includes(e.name)) {
      for (const c of listDir(full)) {
        if (c.isDirectory() && !c.name.startsWith('.') && !IGNORE.has(c.name) && hasMarker(path.join(full, c.name))) {
          rels.push(e.name + '/' + c.name);
        }
      }
    } else if (hasMarker(full)) {
      rels.push(e.name);
    }
  }
  return rels.slice(0, 30);
}

function pmFor(dir, root) {
  for (const base of [dir, root]) {
    if (has(base, 'pnpm-lock.yaml')) return 'pnpm';
    if (has(base, 'yarn.lock')) return 'yarn';
    if (has(base, 'bun.lockb') || has(base, 'bun.lock')) return 'bun';
  }
  return 'npm';
}

function run(pm, script) {
  return PMS[pm].run + script;
}

function exec(pm, bin, args) {
  return PMS[pm].exec + bin + (args ? ' ' + args : '');
}

function nodeStacks(deps) {
  const list = [];
  if (deps.next) list.push('Next.js');
  else if (deps.nuxt) list.push('Nuxt');
  if (deps['@nestjs/core'] || deps['@nestjs/common']) list.push('NestJS');
  if (deps['@angular/core']) list.push('Angular');
  if (deps.express) list.push('Express');
  if (deps.vue && !deps.nuxt) list.push('Vue');
  if (deps.react && !deps.next) list.push('React');
  if (deps.svelte || deps['@sveltejs/kit']) list.push('Svelte');
  if (deps.astro) list.push('Astro');
  if (deps.electron) list.push('Electron');
  if (!list.length) list.push(deps.typescript ? 'TypeScript' : 'Node.js');
  return list;
}

function nodeChecks(dir, root) {
  const pkg = readJson(path.join(dir, 'package.json'));
  if (!pkg) return null;
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  const pm = pmFor(dir, root);
  const stacks = nodeStacks(deps);
  const skip = has(dir, 'node_modules') || has(root, 'node_modules') ? '' : 'Dependencies are not installed (node_modules was not found).';
  const names = fileNamesOf(dir);
  const checks = [];
  const script = (n) => (typeof scripts[n] === 'string' && scripts[n].trim() ? scripts[n] : '');
  const add = (kind, title, command, extra) => {
    checks.push(Object.assign({ kind, title, command, tool: 'node', stack: stacks[0], skip }, extra || {}));
  };

  const lintName = ['lint:ci', 'lint:check', 'lint'].find(script);
  if (lintName) {
    const body = script(lintName);
    if (/--fix\b|--write\b/.test(body)) {
      const m = /^\s*eslint\s+(.*)$/.exec(body);
      if (m) add('lint', 'ESLint (read-only)', exec(pm, 'eslint', m[1].replace(/\s*--fix\b/g, '').trim()));
      else if (deps.eslint) add('lint', 'ESLint (read-only)', exec(pm, 'eslint', '.'));
    } else {
      add('lint', 'Lint', run(pm, lintName));
    }
  } else if (deps.eslint && names.some((n) => /^(\.eslintrc(\..+)?|eslint\.config\.[cm]?[jt]s)$/.test(n))) {
    add('lint', 'ESLint', exec(pm, 'eslint', '.'));
  }

  const tsconfig = has(dir, 'tsconfig.json');
  const typeName = ['typecheck', 'type-check', 'check-types', 'tsc:check'].find(script);
  if (typeName) add('typecheck', 'Type check', run(pm, typeName));
  else if (deps['vue-tsc'] && tsconfig) add('typecheck', 'Type check (vue-tsc)', exec(pm, 'vue-tsc', '--noEmit'));
  else if (deps['@angular/core'] && has(dir, 'tsconfig.app.json')) add('typecheck', 'Type check (Angular)', exec(pm, 'tsc', '-p tsconfig.app.json --noEmit'));
  else if (deps.typescript && tsconfig && !deps['@angular/core']) add('typecheck', 'Type check (tsc)', exec(pm, 'tsc', '--noEmit'));

  if (deps.vitest || deps.jest) {
    const files = countTestFiles(dir);
    if (files) {
      if (deps.vitest) {
        add('test', 'Tests (vitest)', exec(pm, 'vitest', 'run --reporter=default --reporter=json --outputFile.json=' + RESULT_FILE), { runner: 'vitest', files });
      } else {
        add('test', 'Tests (jest)', exec(pm, 'jest', '--ci --passWithNoTests --json --outputFile=' + RESULT_FILE), { runner: 'jest', files });
      }
    }
  } else if (script('test') && !/no test specified/i.test(script('test'))) {
    const suffix = deps['@angular/core'] ? ' -- --watch=false --browsers=ChromeHeadless' : '';
    add('test', 'Tests', run(pm, 'test') + suffix);
  }

  const buildName = ['build:ci', 'build'].find(script);
  if (buildName) {
    const heavy = !!(deps.next || deps.nuxt);
    add('build', 'Build', run(pm, buildName), { heavy });
  }

  return { checks, stacks };
}

function phpChecks(dir) {
  const composer = readJson(path.join(dir, 'composer.json'));
  if (!composer) return null;
  const req = Object.assign({}, composer.require, composer['require-dev']);
  const scripts = composer.scripts && typeof composer.scripts === 'object' ? composer.scripts : {};
  const laravel = !!req['laravel/framework'] || has(dir, 'artisan');
  const stack = laravel ? 'Laravel' : req['symfony/framework-bundle'] ? 'Symfony' : 'PHP';
  const skip = has(dir, 'vendor') ? '' : 'Dependencies are not installed (vendor was not found).';
  const checks = [];
  const add = (kind, title, command) => checks.push({ kind, title, command, tool: 'php', stack, skip });

  if (req['laravel/pint']) {
    add('lint', 'Pint', 'php vendor/bin/pint --test');
  } else if (req['squizlabs/php_codesniffer'] || has(dir, 'phpcs.xml') || has(dir, 'phpcs.xml.dist')) {
    add('lint', 'PHP_CodeSniffer', 'php vendor/bin/phpcs');
  } else {
    const name = ['lint', 'cs-check', 'phpcs', 'cs'].find((n) => scripts[n]);
    if (name) add('lint', 'Composer ' + name, 'composer run-script ' + name);
  }

  if (has(dir, 'phpstan.neon') || has(dir, 'phpstan.neon.dist') || req['phpstan/phpstan'] || req['larastan/larastan'] || req['nunomaduro/larastan']) {
    add('typecheck', 'PHPStan', 'php vendor/bin/phpstan analyse --no-progress --memory-limit=1G');
  } else if (req['vimeo/psalm'] || has(dir, 'psalm.xml')) {
    add('typecheck', 'Psalm', 'php vendor/bin/psalm --no-progress');
  }

  if (has(dir, 'tests')) {
    if (laravel && has(dir, 'artisan')) add('test', 'Tests (artisan)', 'php artisan test');
    else if (req['pestphp/pest']) add('test', 'Pest', 'php vendor/bin/pest');
    else if (req['phpunit/phpunit']) add('test', 'PHPUnit', 'php vendor/bin/phpunit');
  }

  return { checks, stacks: [stack] };
}

function pythonChecks(dir) {
  const names = fileNamesOf(dir);
  const reqFile = (n) => /^requirements.*\.txt$/.test(n);
  const isPython = names.some((n) => ['pyproject.toml', 'Pipfile', 'setup.py', 'setup.cfg', 'manage.py'].includes(n) || reqFile(n));
  if (!isPython) return null;
  const text = names
    .filter((n) => reqFile(n) || n === 'pyproject.toml' || n === 'Pipfile')
    .map((n) => readText(path.join(dir, n)))
    .join('\n')
    .toLowerCase();
  const prefix = has(dir, 'poetry.lock') ? 'poetry run ' : has(dir, 'uv.lock') ? 'uv run ' : '';
  const py = prefix + (WIN ? 'python' : 'python3');
  const django = has(dir, 'manage.py');
  const stack = django ? 'Django' : text.includes('fastapi') ? 'FastAPI' : text.includes('flask') ? 'Flask' : 'Python';
  const checks = [];
  const add = (kind, title, command) => checks.push({ kind, title, command, tool: 'python', stack, skip: '' });

  if (text.includes('ruff') || has(dir, 'ruff.toml') || has(dir, '.ruff.toml')) add('lint', 'Ruff', py + ' -m ruff check .');
  else if (text.includes('flake8')) add('lint', 'Flake8', py + ' -m flake8');

  if (text.includes('mypy')) add('typecheck', 'mypy', py + ' -m mypy .');
  else if (text.includes('pyright')) add('typecheck', 'Pyright', prefix + 'pyright');

  if (text.includes('pytest') || has(dir, 'pytest.ini')) add('test', 'Tests (pytest)', py + ' -m pytest -q');
  else if (django) add('test', 'Tests (Django)', py + ' manage.py test');

  if (django) add('build', 'Django check', py + ' manage.py check');

  return { checks, stacks: [stack] };
}

function goChecks(dir) {
  if (!has(dir, 'go.mod')) return null;
  const mk = (kind, title, command) => ({ kind, title, command, tool: 'go', stack: 'Go', skip: '' });
  return {
    stacks: ['Go'],
    checks: [mk('typecheck', 'go vet', 'go vet ./...'), mk('test', 'go test', 'go test ./...'), mk('build', 'go build', 'go build ./...')],
  };
}

function rustChecks(dir) {
  if (!has(dir, 'Cargo.toml')) return null;
  const mk = (kind, title, command) => ({ kind, title, command, tool: 'rust', stack: 'Rust', skip: '' });
  return {
    stacks: ['Rust'],
    checks: [mk('typecheck', 'cargo check', 'cargo check'), mk('test', 'cargo test', 'cargo test')],
  };
}

function dotnetChecks(dir) {
  if (!fileNamesOf(dir).some((n) => /\.(sln|slnx|csproj)$/i.test(n))) return null;
  const mk = (kind, title, command) => ({ kind, title, command, tool: 'dotnet', stack: '.NET', skip: '' });
  return {
    stacks: ['.NET'],
    checks: [mk('build', 'dotnet build', 'dotnet build --nologo -v q'), mk('test', 'dotnet test', 'dotnet test --nologo -v q')],
  };
}

function javaChecks(dir) {
  const mk = (stack, kind, title, command) => ({ kind, title, command, tool: 'java', stack, skip: '' });
  if (has(dir, 'pom.xml')) {
    const mvn = has(dir, 'mvnw') ? (WIN ? 'mvnw' : './mvnw') : 'mvn';
    return {
      stacks: ['Maven'],
      checks: [mk('Maven', 'test', 'Tests (Maven)', mvn + ' -B -ntp test'), mk('Maven', 'build', 'Package (Maven)', mvn + ' -B -ntp -DskipTests package')],
    };
  }
  if (has(dir, 'build.gradle') || has(dir, 'build.gradle.kts')) {
    const gradle = has(dir, 'gradlew') ? (WIN ? 'gradlew' : './gradlew') : 'gradle';
    return {
      stacks: ['Gradle'],
      checks: [mk('Gradle', 'test', 'Tests (Gradle)', gradle + ' test'), mk('Gradle', 'build', 'Build (Gradle)', gradle + ' build -x test')],
    };
  }
  return null;
}

function rubyChecks(dir) {
  if (!has(dir, 'Gemfile')) return null;
  const text = readText(path.join(dir, 'Gemfile')).toLowerCase();
  const stack = text.includes('rails') ? 'Rails' : 'Ruby';
  const checks = [];
  const add = (kind, title, command) => checks.push({ kind, title, command, tool: 'ruby', stack, skip: '' });
  if (text.includes('rubocop')) add('lint', 'RuboCop', 'bundle exec rubocop');
  if (text.includes('rspec')) add('test', 'RSpec', 'bundle exec rspec');
  else if (text.includes('rails')) add('test', 'Rails tests', 'bundle exec rails test');
  return { checks, stacks: [stack] };
}

function detectProject(repoPath, rel) {
  const dir = path.resolve(repoPath, rel);
  const parts = [
    safe(nodeChecks, dir, repoPath),
    safe(phpChecks, dir),
    safe(pythonChecks, dir),
    safe(goChecks, dir),
    safe(rustChecks, dir),
    safe(dotnetChecks, dir),
    safe(javaChecks, dir),
    safe(rubyChecks, dir),
  ].filter(Boolean);
  const checks = [];
  const stacks = [];
  for (const part of parts) {
    checks.push(...part.checks);
    for (const s of part.stacks) if (!stacks.includes(s)) stacks.push(s);
  }
  if (!checks.length) return null;
  checks.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return { rel, dir, label: rel === '.' ? 'root' : rel, stacks, checks };
}

function detectProjects(repoPath) {
  return findProjects(repoPath)
    .map((rel) => detectProject(repoPath, rel))
    .filter(Boolean);
}

function assignFiles(projects, files) {
  const picked = new Set();
  const rank = (p) => (p.rel === '.' ? 0 : p.rel.length + 1);
  for (const raw of files) {
    const f = String(raw).replace(/\\/g, '/').replace(/^\.\//, '');
    if (!f || DOC_RE.test(f) || SKIP_PREFIX.test(f)) continue;
    let best = null;
    for (const p of projects) {
      const hit = p.rel === '.' || f === p.rel || f.startsWith(p.rel + '/');
      if (hit && (!best || rank(p) > rank(best))) best = p;
    }
    if (best) picked.add(best.rel);
  }
  return projects.filter((p) => picked.has(p.rel));
}

module.exports = { detectProjects, assignFiles, countTestFiles, KIND_ORDER };