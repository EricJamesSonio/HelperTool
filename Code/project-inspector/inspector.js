const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache',
  '__pycache__', 'venv', '.venv', 'env', '.env', 'vendor',
  'bower_components', '.svn', '.hg', 'coverage', '.nyc_output',
  'target', 'bin', 'obj', 'out', '.gradle', 'idea',
]);

const FRAMEWORK_MAP = {
  'react':               { name: 'React', type: 'frontend' },
  'react-dom':           { name: 'React', type: 'frontend' },
  'next':                { name: 'Next.js', type: 'fullstack' },
  'vue':                 { name: 'Vue', type: 'frontend' },
  '@angular/core':       { name: 'Angular', type: 'frontend' },
  'svelte':              { name: 'Svelte', type: 'frontend' },
  'express':             { name: 'Express', type: 'backend' },
  '@nestjs/core':        { name: 'NestJS', type: 'backend' },
  'koa':                 { name: 'Koa', type: 'backend' },
  'fastify':             { name: 'Fastify', type: 'backend' },
  'electron':            { name: 'Electron', type: 'desktop' },
  'react-native':        { name: 'React Native', type: 'mobile' },
  'jquery':              { name: 'jQuery', type: 'frontend' },
  'bootstrap':           { name: 'Bootstrap', type: 'frontend' },
  'tailwindcss':         { name: 'Tailwind CSS', type: 'frontend' },
  'socket.io':           { name: 'Socket.IO', type: 'backend' },
  'gatsby':              { name: 'Gatsby', type: 'frontend' },
  'nuxt':                { name: 'Nuxt', type: 'fullstack' },
  'remix':               { name: 'Remix', type: 'fullstack' },
  'astro':               { name: 'Astro', type: 'frontend' },
};

const DB_MAP = {
  'pg':                  'PostgreSQL',
  'pg-native':           'PostgreSQL',
  'mysql':               'MySQL',
  'mysql2':              'MySQL',
  'mongodb':             'MongoDB',
  'mongoose':            'MongoDB',
  'sql.js':              'SQLite',
  'better-sqlite3':       'SQLite',
  'sqlite3':              'SQLite',
  'redis':               'Redis',
  'ioredis':             'Redis',
  'cassandra-driver':    'Cassandra',
  'neo4j-driver':        'Neo4j',
  'mariadb':             'MariaDB',
  'firebase':            'Firebase',
  'firebase-admin':       'Firebase',
  '@prisma/client':      'Prisma + Database',
  'prisma':              'Prisma + Database',
  'typeorm':             'TypeORM + Database',
  'sequelize':           'Sequelize + Database',
  'knex':                'Knex + Database',
  'drizzle-orm':         'Drizzle ORM + Database',
};

const TOOL_MAP = {
  'googleapis':           'Google APIs',
  '@google-cloud/*':      'Google Cloud',
  'aws-sdk':              'AWS SDK',
  '@aws-sdk/*':           'AWS SDK',
  'sharp':                'Sharp',
  'ffmpeg-static':        'FFmpeg',
  '@ffprobe-installer/*': 'FFprobe',
  'chokidar':             'Chokidar (File Watcher)',
  'simple-git':           'Simple Git',
  'dockerode':            'Docker',
  'ws':                   'WebSocket (ws)',
  'puppeteer':            'Puppeteer',
  'playwright':           'Playwright',
  'cheerio':              'Cheerio',
  'axios':                'Axios',
  'node-fetch':           'node-fetch',
  'graphql':              'GraphQL',
  '@apollo/client':       'Apollo Client',
  'apollo-server':        'Apollo Server',
  'swagger-jsdoc':        'Swagger',
  'swagger-ui-express':   'Swagger',
  'zustand':              'Zustand',
  'redux':                'Redux',
  '@reduxjs/toolkit':     'Redux Toolkit',
  'mobx':                 'MobX',
  'mobx-react':           'MobX',
  'three':                'Three.js',
  'd3':                   'D3.js',
  'chart.js':             'Chart.js',
  'echarts':              'ECharts',
  'lodash':               'Lodash',
  'dayjs':                'Day.js',
  'moment':               'Moment.js',
  'date-fns':             'date-fns',
  'uuid':                 'UUID',
  'bcrypt':               'bcrypt',
  'jsonwebtoken':         'JWT',
  'passport':             'Passport.js',
  'helmet':               'Helmet',
  'cors':                 'CORS',
  'morgan':               'Morgan',
  'winston':              'Winston',
  'pino':                 'Pino',
  'eslint':               'ESLint',
  'prettier':             'Prettier',
  'typescript':           'TypeScript',
  'webpack':              'Webpack',
  'vite':                 'Vite',
  'esbuild':              'ESBuild',
  'rollup':               'Rollup',
  'parcel':               'Parcel',
  'turbo':                'Turborepo',
  'nx':                   'Nx',
  'jest':                 'Jest',
  'vitest':               'Vitest',
  'mocha':                'Mocha',
  'chai':                 'Chai',
  'cypress':              'Cypress',
  'playwright':           'Playwright (Testing)',
  'storybook':            'Storybook',
  'i18next':              'i18next',
  'react-query':          'TanStack Query',
  '@tanstack/react-query':'TanStack Query',
  'swr':                  'SWR',
  'formik':               'Formik',
  'react-hook-form':      'React Hook Form',
  'zod':                  'Zod',
  'yup':                  'Yup',
  'joi':                  'Joi',
  'async':                'Async.js',
  'dotenv':               'dotenv',
  'cross-env':            'cross-env',
  'nodemon':              'Nodemon',
  'concurrently':         'Concurrently',
  'husky':                'Husky',
  'lint-staged':          'lint-staged',
  'commitlint':           'Commitlint',
  'semver':               'semver',
};

const ENV_PATTERNS = [
  '.env', '.env.local', '.env.development', '.env.production',
  '.env.test', '.env.staging', '.env.example',
  '.env.development.local', '.env.production.local',
];

const MONOREPO_NAMED_DIRS = ['frontend', 'backend', 'client', 'server', 'api', 'web', 'mobile'];
const MONOREPO_GLOB_DIRS = ['packages', 'apps'];

const KNOWN_CONFIG_FILES = new Set([
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'tsconfig.json', 'jsconfig.json', '.babelrc', 'babel.config.js',
  '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.prettierrc',
  '.prettierrc.json', 'webpack.config.js', 'vite.config.ts',
  'vite.config.js', 'next.config.js', 'nuxt.config.js',
  'composer.json', 'composer.lock', 'Gemfile', 'Gemfile.lock',
  'requirements.txt', 'Pipfile', 'pyproject.toml', 'setup.py',
  'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  'Makefile', 'Rakefile', '.editorconfig', '.gitignore',
  '.nvmrc', '.node-version', '.python-version',
  'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js',
  'stylelint.config.js',
]);

function isConfigFile(name) {
  return KNOWN_CONFIG_FILES.has(name);
}

function isEnvFile(name) {
  const lower = name.toLowerCase();
  if (ENV_PATTERNS.includes(lower)) return true;
  if (lower.startsWith('.env.')) return true;
  return false;
}

function matchTool(depName) {
  if (TOOL_MAP[depName]) return TOOL_MAP[depName];
  if (depName.startsWith('@')) {
    const scope = depName.split('/')[0] + '/*';
    if (TOOL_MAP[scope]) return TOOL_MAP[scope];
  }
  return null;
}

function scanFileExtensions(dirPath) {
  const extCount = {};
  let total = 0;

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase() || '(none)';
        extCount[ext] = (extCount[ext] || 0) + 1;
        total++;
      }
    }
  }

  walk(dirPath);

  const langMap = {};
  const EXT_LANG_MAP = {
    '.js': 'JavaScript', '.jsx': 'JavaScript (JSX)',
    '.ts': 'TypeScript', '.tsx': 'TypeScript (TSX)',
    '.py': 'Python', '.rb': 'Ruby', '.php': 'PHP',
    '.java': 'Java', '.go': 'Go', '.rs': 'Rust',
    '.cs': 'C#', '.c': 'C', '.h': 'C/C++ Header',
    '.cpp': 'C++', '.hpp': 'C++ Header',
    '.swift': 'Swift', '.kt': 'Kotlin',
    '.html': 'HTML', '.htm': 'HTML',
    '.css': 'CSS', '.scss': 'SCSS', '.sass': 'SASS',
    '.less': 'LESS', '.styl': 'Stylus',
    '.json': 'JSON', '.xml': 'XML', '.yaml': 'YAML',
    '.yml': 'YAML', '.toml': 'TOML', '.md': 'Markdown',
    '.sql': 'SQL', '.sh': 'Shell', '.bash': 'Shell',
    '.zsh': 'Shell', '.ps1': 'PowerShell',
    '.vue': 'Vue', '.svelte': 'Svelte',
    '.astro': 'Astro', '.graphql': 'GraphQL',
    '.gql': 'GraphQL', '.svg': 'SVG',
    '.ejs': 'EJS', '.hbs': 'Handlebars',
    '.pug': 'Pug', '.jade': 'Pug',
    '.dockerfile': 'Docker', '.tf': 'Terraform',
    '.lua': 'Lua', '.pl': 'Perl', '.pm': 'Perl',
    '.r': 'R', '.dart': 'Dart', '.ex': 'Elixir',
    '.exs': 'Elixir', '.erl': 'Erlang',
    '.clj': 'Clojure', '.cljs': 'ClojureScript',
    '.scala': 'Scala', '.hs': 'Haskell',
    '.ml': 'OCaml', '.mjs': 'JavaScript (ESM)',
    '.cjs': 'JavaScript (CommonJS)',
    '.mts': 'TypeScript (ESM)', '.cts': 'TypeScript (CommonJS)',
  };

  for (const [ext, count] of Object.entries(extCount)) {
    const lang = EXT_LANG_MAP[ext] || ext.slice(1).toUpperCase();
    langMap[lang] = (langMap[lang] || 0) + count;
  }

  const languages = Object.entries(langMap)
    .map(([name, count]) => ({ name, fileCount: count, percentage: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.fileCount - a.fileCount);

  return { languages, totalFiles: total };
}

function parseEnvKeys(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const keys = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      if (key) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

function findEnvFiles(dirPath, depth = 0) {
  if (depth > 5) return [];
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
  catch { return results; }

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        results.push(...findEnvFiles(full, depth + 1));
      }
    } else if (entry.isFile() && isEnvFile(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function readPackageJson(pkgPath) {
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function detectPackageManager(rootDir) {
  if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(rootDir, 'package.json'))) return 'npm';
  return null;
}

function detectProjectType(frameworks, languages) {
  const langNames = languages.map(l => l.name.toLowerCase());
  const fwNames = frameworks.map(f => f.name.toLowerCase());

  const isDesktop = fwNames.some(f => f.includes('electron'));
  const isMobile = fwNames.some(f => f.includes('react native') || f.includes('flutter') || f.includes('ionic'));
  const hasFrontend = fwNames.some(f =>
    ['react', 'vue', 'angular', 'svelte', 'next.js', 'gatsby', 'nuxt', 'astro', 'jquery'].includes(f)
  );
  const hasBackend = fwNames.some(f =>
    ['express', 'nestjs', 'koa', 'fastify', 'socket.io', 'laravel', 'django', 'flask', 'rails', 'spring'].includes(f)
  ) || langNames.some(l => l.includes('php') || l.includes('python') || l.includes('ruby') || l.includes('go') || l.includes('rust'));

  if (isDesktop) return 'desktop';
  if (isMobile) return 'mobile';
  if (hasFrontend && hasBackend) return 'fullstack';
  if (hasFrontend) return 'frontend';
  if (hasBackend) return 'backend';
  return 'unknown';
}

function analyzePackageJson(pkg) {
  const frameworks = [];
  const databases = [];
  const tools = [];
  const scripts = pkg.scripts || null;

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const seenFrameworks = new Set();
  const seenDatabases = new Set();
  const seenTools = new Set();

  for (const [depName, depVersion] of Object.entries(allDeps)) {
    const cleanVersion = String(depVersion || '').replace(/^[\^~]/, '');

    const fw = FRAMEWORK_MAP[depName];
    if (fw && !seenFrameworks.has(fw.name)) {
      seenFrameworks.add(fw.name);
      frameworks.push({ name: fw.name, version: cleanVersion || null, type: fw.type });
    }

    const db = DB_MAP[depName];
    if (db && !seenDatabases.has(db)) {
      seenDatabases.add(db);
      databases.push(db);
    }

    const tool = matchTool(depName);
    if (tool && !seenTools.has(tool)) {
      seenTools.add(tool);
      tools.push(tool);
    }
  }

  return { frameworks, databases, tools, scripts };
}

function scanMonorepoSubProjects(rootDir) {
  const subProjects = [];

  for (const dir of MONOREPO_NAMED_DIRS) {
    const pkgPath = path.join(rootDir, dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = readPackageJson(pkgPath);
      if (pkg) {
        subProjects.push({ name: dir, ...analyzePackageJson(pkg) });
      }
    }
  }

  for (const parentDir of MONOREPO_GLOB_DIRS) {
    const parentPath = path.join(rootDir, parentDir);
    if (fs.existsSync(parentPath)) {
      let entries;
      try { entries = fs.readdirSync(parentPath, { withFileTypes: true }); }
      catch { continue; }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pkgPath = path.join(parentPath, entry.name, 'package.json');
          if (fs.existsSync(pkgPath)) {
            const pkg = readPackageJson(pkgPath);
            if (pkg) {
              subProjects.push({ name: parentDir + '/' + entry.name, ...analyzePackageJson(pkg) });
            }
          }
        }
      }
    }
  }

  return subProjects;
}

function inspect(repoPath) {
  const result = {
    repoPath,
    inspectedAt: new Date().toISOString(),
    projectType: 'unknown',
    languages: [],
    frameworks: [],
    databases: [],
    thirdPartyTools: [],
    envKeys: [],
    scripts: null,
    packageManager: null,
    entryPoints: [],
    configFiles: [],
    totalFiles: 0,
    subProjects: [],
  };

  if (!repoPath || !fs.existsSync(repoPath)) {
    return { ...result, error: 'Invalid repo path' };
  }

  // --- Scan config files at root ---
  let rootEntries;
  try { rootEntries = fs.readdirSync(repoPath, { withFileTypes: true }); }
  catch { return { ...result, error: 'Cannot read repo directory' }; }

  for (const entry of rootEntries) {
    if (entry.isFile() && isConfigFile(entry.name)) {
      result.configFiles.push(entry.name);
    }
  }

  // --- Read package.json if exists ---
  const pkg = readPackageJson(path.join(repoPath, 'package.json'));
  if (pkg) {
    result.packageManager = detectPackageManager(repoPath);
    if (pkg.scripts) result.scripts = pkg.scripts;
    if (pkg.main) result.entryPoints.push(pkg.main);
    if (pkg.bin) {
      if (typeof pkg.bin === 'string') result.entryPoints.push(pkg.bin);
      else result.entryPoints.push(...Object.values(pkg.bin));
    }

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const seenFrameworks = new Set();
    const seenDatabases = new Set();
    const seenTools = new Set();

    for (const [depName, depVersion] of Object.entries(allDeps)) {
      const cleanVersion = String(depVersion || '').replace(/^[\^~]/, '');

      const fw = FRAMEWORK_MAP[depName];
      if (fw && !seenFrameworks.has(fw.name)) {
        seenFrameworks.add(fw.name);
        result.frameworks.push({
          name: fw.name,
          version: cleanVersion || null,
          type: fw.type,
        });
      }

      const db = DB_MAP[depName];
      if (db && !seenDatabases.has(db)) {
        seenDatabases.add(db);
        result.databases.push(db);
      }

      const tool = matchTool(depName);
      if (tool && !seenTools.has(tool)) {
        seenTools.add(tool);
        result.thirdPartyTools.push(tool);
      }
    }
  }

  // --- Detect Composer (PHP) ---
  const composerPath = path.join(repoPath, 'composer.json');
  if (fs.existsSync(composerPath)) {
    result.configFiles.push('composer.json');
    try {
      const composer = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
      if (composer.require) {
        for (const [dep] of Object.entries(composer.require)) {
          const lower = dep.toLowerCase();
          if (lower.includes('laravel')) {
            result.frameworks.push({ name: 'Laravel', version: composer.require[dep]?.replace(/^[\^~]/, '') || null, type: 'backend' });
          } else if (lower.includes('symfony')) {
            result.frameworks.push({ name: 'Symfony', version: composer.require[dep]?.replace(/^[\^~]/, '') || null, type: 'backend' });
          } else if (lower.includes('cakephp')) {
            result.frameworks.push({ name: 'CakePHP', version: composer.require[dep]?.replace(/^[\^~]/, '') || null, type: 'backend' });
          } else if (lower.includes('wordpress') || lower.includes('wp-')) {
            result.frameworks.push({ name: 'WordPress', version: null, type: 'frontend' });
          } else if (lower.includes('phpunit')) {
            if (!result.thirdPartyTools.includes('PHPUnit')) result.thirdPartyTools.push('PHPUnit');
          } else if (lower.includes('doctrine')) {
            result.databases.push('Doctrine ORM + Database');
          }
        }
      }
    } catch {}
  }

  // --- Scan monorepo sub-projects ---
  const subProjects = scanMonorepoSubProjects(repoPath);
  if (subProjects.length > 0) {
    result.subProjects = subProjects;

    // If root had no package.json, aggregate frameworks/databases/tools from sub-projects
    if (!pkg) {
      const aggFrameworks = new Set();
      const aggDatabases = new Set();
      const aggTools = new Set();

      for (const sub of subProjects) {
        for (const fw of sub.frameworks || []) {
          if (!aggFrameworks.has(fw.name)) {
            aggFrameworks.add(fw.name);
            result.frameworks.push(fw);
          }
        }
        for (const db of sub.databases || []) {
          if (!aggDatabases.has(db)) {
            aggDatabases.add(db);
            result.databases.push(db);
          }
        }
        for (const tool of sub.tools || []) {
          if (!aggTools.has(tool)) {
            aggTools.add(tool);
            result.thirdPartyTools.push(tool);
          }
        }
      }
    }
  }

  // --- File extension scan ---
  const extScan = scanFileExtensions(repoPath);
  result.languages = extScan.languages;
  result.totalFiles = extScan.totalFiles;

  // --- Determine project type ---
  result.projectType = detectProjectType(result.frameworks, result.languages);

  // --- Entry points heuristics ---
  if (result.entryPoints.length === 0) {
    const commonEntries = ['index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts', 'server.js', 'server.ts', 'index.php', 'app.php'];
    for (const entry of commonEntries) {
      if (fs.existsSync(path.join(repoPath, entry))) {
        result.entryPoints.push(entry);
      }
    }
  }

  // --- Env file scan (keys only) ---
  const envFiles = findEnvFiles(repoPath);
  for (const envFile of envFiles) {
    const relPath = path.relative(repoPath, envFile);
    const keys = parseEnvKeys(envFile);
    if (keys.length > 0) {
      result.envKeys.push({ source: relPath, keys });
    } else {
      result.envKeys.push({ source: relPath, keys: [] });
    }
  }

  return result;
}

module.exports = { inspect };
