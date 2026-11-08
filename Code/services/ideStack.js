'use strict';

const fs = require('fs');
const path = require('path');

const MONO_DIRS = ['frontend', 'backend', 'client', 'server', 'api', 'web', 'app', 'services'];
const GROUP_DIRS = ['apps', 'packages'];
const CPP_EXTS = new Set(['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx', 'c']);
const PY_MARKERS = ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', 'manage.py', 'setup.cfg'];
const MAX_DIRS = 40;
const MAX_GROUP_CHILDREN = 12;

async function listDir(dir) {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (_) {
    return [];
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch (_) {
    return null;
  }
}
async function readText(file) {
  try {
    const buf = await fs.promises.readFile(file);
    return buf.length > 200000 ? buf.slice(0, 200000).toString('utf8') : buf.toString('utf8');
  } catch (_) {
    return '';
  }
}

async function scanPyDeps(dir, files, label, found) {
  const names = files
    .filter((n) => /^requirements.*\.txt$/i.test(n) || n === 'pyproject.toml' || n === 'Pipfile' || n === 'setup.py' || n === 'setup.cfg' || n === 'manage.py')
    .slice(0, 6);
  for (const n of names) {
    const text = await readText(path.join(dir, n));
    if (!text) continue;
    if (!found.flask && /(^|[^a-z0-9_-])flask([^a-z0-9_-]|$)/i.test(text)) {
      mark(found, 'flask', 'flask in ' + n + ' (' + label + ')');
    }
    if (!found.django && /(^|[^a-z0-9_-])django([^a-z0-9_-]|$)/i.test(text)) {
      mark(found, 'django', 'django in ' + n + ' (' + label + ')');
    }
  }
}

function mark(found, id, reason) {
  if (!found[id]) found[id] = reason;
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

function scanFileNames(names, label, found) {
  let cpp = 0;
  let php = 0;
  let py = 0;
  let vue = 0;
  let cs = 0;
  let astro = 0;
  for (const n of names) {
    const e = extOf(n);
    if (CPP_EXTS.has(e)) cpp++;
    else if (e === 'php') php++;
    else if (e === 'py') py++;
    else if (e === 'vue') vue++;
    else if (e === 'cs') cs++;
    else if (e === 'astro') astro++;
  }
  if (cpp) mark(found, 'cpp', cpp + ' C/C++ source file(s) in ' + label);
  if (php) mark(found, 'php', php + ' PHP file(s) in ' + label);
  if (py) mark(found, 'python', py + ' Python file(s) in ' + label);
  if (vue) mark(found, 'vue', vue + ' Vue file(s) in ' + label);
  if (cs) mark(found, 'dotnet', cs + ' C# file(s) in ' + label);
  if (astro) mark(found, 'astro', astro + ' Astro file(s) in ' + label);
}

async function scanDir(dir, label, found) {
  const entries = await listDir(dir);
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const dirs = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
  const set = new Set(files);

  if (set.has('package.json')) {
    mark(found, 'js', 'package.json in ' + label);
    const pkg = await readJson(path.join(dir, 'package.json'));
    if (pkg) {
      const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      if (deps.next) mark(found, 'nextjs', '"next" dependency in ' + label);
      if (deps['@nestjs/core'] || deps['@nestjs/common']) mark(found, 'nestjs', '@nestjs packages in ' + label);
      if (deps.vue || deps.nuxt || deps['@vue/cli-service']) mark(found, 'vue', '"vue" dependency in ' + label);
      if (deps['@angular/core']) mark(found, 'angular', '@angular/core in ' + label);
      if (deps.prettier) mark(found, 'prettier', '"prettier" dependency in ' + label);
      if (deps.react || deps['react-dom']) mark(found, 'react', '"react" dependency in ' + label);
      if (deps.express) mark(found, 'express', '"express" dependency in ' + label);
      if (deps.astro) mark(found, 'astro', '"astro" dependency in ' + label);
    }
  }
  if (files.some((n) => /^next\.config\.(js|mjs|cjs|ts)$/.test(n))) {
    mark(found, 'js', 'next.config in ' + label);
    mark(found, 'nextjs', 'next.config in ' + label);
  }
  if (files.some((n) => /^astro\.config\.(js|mjs|cjs|ts)$/.test(n))) {
    mark(found, 'js', 'astro.config in ' + label);
    mark(found, 'astro', 'astro.config in ' + label);
  }
  if (files.some((n) => /^(vue|nuxt)\.config\.(js|mjs|cjs|ts)$/.test(n))) {
    mark(found, 'js', 'vue or nuxt config in ' + label);
    mark(found, 'vue', 'vue or nuxt config in ' + label);
  }
  if (set.has('angular.json')) {
    mark(found, 'js', 'angular.json in ' + label);
    mark(found, 'angular', 'angular.json in ' + label);
  }
  if (files.some((n) => /^\.prettierrc(\..+)?$/.test(n) || /^prettier\.config\.(js|cjs|mjs|ts)$/.test(n))) {
    mark(found, 'prettier', 'Prettier config in ' + label);
  }
  if (set.has('nest-cli.json')) {
    mark(found, 'js', 'nest-cli.json in ' + label);
    mark(found, 'nestjs', 'nest-cli.json in ' + label);
  }
  if (set.has('tsconfig.json')) mark(found, 'js', 'tsconfig.json in ' + label);

  if (set.has('composer.json')) {
    mark(found, 'php', 'composer.json in ' + label);
    const composer = await readJson(path.join(dir, 'composer.json'));
    if (composer) {
      const req = Object.assign({}, composer.require, composer['require-dev']);
      if (req['laravel/framework']) mark(found, 'laravel', '"laravel/framework" in ' + label);
    }
  }
  if (set.has('artisan')) {
    mark(found, 'php', 'artisan in ' + label);
    mark(found, 'laravel', 'artisan in ' + label);
  }

  const py = PY_MARKERS.find((n) => set.has(n));
  if (py) {
    mark(found, 'python', py + ' in ' + label);
    await scanPyDeps(dir, files, label, found);
  }

  if (set.has('CMakeLists.txt') || set.has('meson.build')) {
    mark(found, 'cpp', (set.has('CMakeLists.txt') ? 'CMakeLists.txt' : 'meson.build') + ' in ' + label);
  }

  const dn = files.find((n) => /\.(csproj|sln|slnx)$/i.test(n));
  if (dn) mark(found, 'dotnet', dn + ' in ' + label);

  scanFileNames(files, label, found);

  for (const sub of ['src', 'include', 'lib']) {
    if (!dirs.has(sub)) continue;
    const subEntries = await listDir(path.join(dir, sub));
    const names = subEntries.filter((e) => e.isFile()).map((e) => e.name);
    scanFileNames(names, label + '/' + sub, found);
  }

  if (!found.dotnet && dirs.has('src')) {
    const kids = (await listDir(path.join(dir, 'src'))).filter((e) => e.isDirectory()).slice(0, MAX_GROUP_CHILDREN);
    for (const k of kids) {
      const inner = await listDir(path.join(dir, 'src', k.name));
      const proj = inner.find((e) => e.isFile() && /\.(csproj|fsproj)$/i.test(e.name));
      if (proj) {
        mark(found, 'dotnet', proj.name + ' in ' + label + '/src/' + k.name);
        break;
      }
    }
  }
}

async function detectStack(root) {
  const targets = [{ dir: root, label: 'repo root' }];
  const rootEntries = await listDir(root);
  const rootDirs = new Set(rootEntries.filter((e) => e.isDirectory()).map((e) => e.name));

  for (const d of MONO_DIRS) {
    if (rootDirs.has(d)) targets.push({ dir: path.join(root, d), label: d });
  }
  for (const g of GROUP_DIRS) {
    if (!rootDirs.has(g)) continue;
    const children = await listDir(path.join(root, g));
    let count = 0;
    for (const ch of children) {
      if (!ch.isDirectory()) continue;
      if (count++ >= MAX_GROUP_CHILDREN) break;
      targets.push({ dir: path.join(root, g, ch.name), label: g + '/' + ch.name });
    }
  }

  const parts = await Promise.all(targets.slice(0, MAX_DIRS).map(async (t) => {
    const f = {};
    await scanDir(t.dir, t.label, f);
    return f;
  }));
  const found = {};
  for (const part of parts) {
    for (const id of Object.keys(part)) {
      if (!found[id]) found[id] = part[id];
    }
  }
  return found;
}

module.exports = { detectStack };