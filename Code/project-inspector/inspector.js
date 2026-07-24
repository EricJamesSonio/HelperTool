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
  'laravel-vite-plugin': { name: 'Laravel', type: 'backend' },
  'inertiajs/inertia':   { name: 'Inertia.js', type: 'fullstack' },
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

const COMPOSER_FRAMEWORK_MAP = {
  'laravel/framework': { name: 'Laravel', type: 'backend' },
  'livewire/livewire': { name: 'Livewire', type: 'frontend' },
  'filament/filament': { name: 'Filament', type: 'frontend' },
  'symfony/symfony': { name: 'Symfony', type: 'backend' },
  'symfony/http-kernel': { name: 'Symfony', type: 'backend' },
  'cakephp/cakephp': { name: 'CakePHP', type: 'backend' },
  'codeigniter4/framework': { name: 'CodeIgniter', type: 'backend' },
  'yiisoft/yii2': { name: 'Yii2', type: 'backend' },
  'slim/slim': { name: 'Slim', type: 'backend' },
  'phalcon/cphalcon': { name: 'Phalcon', type: 'backend' },
  'zendframework/zend-mvc': { name: 'Zend', type: 'backend' },
  'laminas/laminas-mvc': { name: 'Laminas', type: 'backend' },
  'laravel/lumen-framework': { name: 'Lumen', type: 'backend' },
  'october/rain': { name: 'October CMS', type: 'backend' },
  'roots/bedrock': { name: 'WordPress', type: 'frontend' },
};
const COMPOSER_DB_MAP = {
  'doctrine/dbal': 'Doctrine DBAL',
  'doctrine/orm': 'Doctrine ORM',
  'doctrine/mongodb-odm': 'Doctrine MongoDB ODM',
  'mongodb/mongodb': 'MongoDB',
  'predis/predis': 'Redis',
};
const COMPOSER_TOOL_MAP = {
  'phpunit/phpunit': 'PHPUnit',
  'phpstan/phpstan': 'PHPStan',
  'squizlabs/php_codesniffer': 'PHP_CodeSniffer',
  'friendsofphp/php-cs-fixer': 'PHP-CS-Fixer',
  'barryvdh/laravel-debugbar': 'Laravel Debugbar',
  'barryvdh/laravel-ide-helper': 'Laravel IDE Helper',
  'spatie/laravel-permission': 'Spatie Permissions',
  'spatie/laravel-medialibrary': 'Spatie Media Library',
  'laravel/tinker': 'Laravel Tinker',
  'laravel/sanctum': 'Laravel Sanctum',
  'laravel/horizon': 'Laravel Horizon',
  'laravel/telescope': 'Laravel Telescope',
  'laravel/passport': 'Laravel Passport',
};

const PYPI_FRAMEWORK_MAP = {
  'django': { name: 'Django', type: 'backend' },
  'flask': { name: 'Flask', type: 'backend' },
  'fastapi': { name: 'FastAPI', type: 'backend' },
  'starlette': { name: 'Starlette', type: 'backend' },
  'tornado': { name: 'Tornado', type: 'backend' },
  'aiohttp': { name: 'aiohttp', type: 'backend' },
  'bottle': { name: 'Bottle', type: 'backend' },
  'pyramid': { name: 'Pyramid', type: 'backend' },
  'sanic': { name: 'Sanic', type: 'backend' },
  'streamlit': { name: 'Streamlit', type: 'frontend' },
  'gradio': { name: 'Gradio', type: 'frontend' },
  'djangorestframework': { name: 'Django REST Framework', type: 'backend' },
  'wagtail': { name: 'Wagtail CMS', type: 'backend' },
  'flask-restful': { name: 'Flask-RESTful', type: 'backend' },
  'flet': { name: 'Flet', type: 'frontend' },
  'reflex': { name: 'Reflex', type: 'fullstack' },
  'kivy': { name: 'Kivy', type: 'mobile' },
};
const PYPI_DB_MAP = {
  'sqlalchemy': 'SQLAlchemy',
  'psycopg2': 'PostgreSQL',
  'psycopg': 'PostgreSQL',
  'pymongo': 'MongoDB',
  'redis': 'Redis',
  'django-redis': 'Redis',
};
const PYPI_TOOL_MAP = {
  'celery': 'Celery',
  'gunicorn': 'Gunicorn',
  'uvicorn': 'Uvicorn',
  'pytest': 'Pytest',
  'black': 'Black',
  'ruff': 'Ruff',
  'mypy': 'Mypy',
  'pylint': 'Pylint',
  'flake8': 'Flake8',
  'poetry': 'Poetry',
  'pre-commit': 'pre-commit',
  'sphinx': 'Sphinx',
};

const GEM_FRAMEWORK_MAP = {
  'rails': { name: 'Ruby on Rails', type: 'fullstack' },
  'sinatra': { name: 'Sinatra', type: 'backend' },
  'rack': { name: 'Rack', type: 'backend' },
  'hanami': { name: 'Hanami', type: 'backend' },
  'jekyll': { name: 'Jekyll', type: 'frontend' },
  'middleman': { name: 'Middleman', type: 'frontend' },
};
const GEM_DB_MAP = {
  'activerecord': 'ActiveRecord',
  'mongoid': 'MongoDB (Mongoid)',
  'sequel': 'Sequel',
  'pg': 'PostgreSQL',
  'mysql2': 'MySQL',
  'sqlite3': 'SQLite',
};
const GEM_TOOL_MAP = {
  'rspec': 'RSpec',
  'rspec-rails': 'RSpec',
  'rubocop': 'RuboCop',
  'brakeman': 'Brakeman',
  'sidekiq': 'Sidekiq',
  'devise': 'Devise',
  'pundit': 'Pundit',
  'carrierwave': 'CarrierWave',
  'paperclip': 'Paperclip',
  'sassc': 'SassC',
};

const GO_FRAMEWORK_MAP = {
  'github.com/gin-gonic/gin': { name: 'Gin', type: 'backend' },
  'github.com/labstack/echo': { name: 'Echo', type: 'backend' },
  'github.com/gofiber/fiber': { name: 'Fiber', type: 'backend' },
  'github.com/gorilla/mux': { name: 'Gorilla Mux', type: 'backend' },
  'github.com/beego/beego': { name: 'Beego', type: 'backend' },
  'github.com/revel/revel': { name: 'Revel', type: 'backend' },
  'github.com/go-chi/chi': { name: 'Chi', type: 'backend' },
  'github.com/gofiber/fiber/v2': { name: 'Fiber', type: 'backend' },
  'github.com/bufbuild/connect-go': { name: 'Connect', type: 'backend' },
  'google.golang.org/grpc': { name: 'gRPC Go', type: 'backend' },
};
const GO_TOOL_MAP = {
  'github.com/spf13/cobra': 'Cobra',
  'github.com/spf13/viper': 'Viper',
  'go.uber.org/zap': 'Zap',
  'github.com/sirupsen/logrus': 'Logrus',
  'gorm.io/gorm': 'GORM',
  'github.com/jmoiron/sqlx': 'SQLx',
  'github.com/stretchr/testify': 'Testify',
  'github.com/golang/mock': 'GoMock',
  'github.com/rs/zerolog': 'Zerolog',
};

const CRATE_FRAMEWORK_MAP = {
  'actix-web': { name: 'Actix Web', type: 'backend' },
  'axum': { name: 'Axum', type: 'backend' },
  'rocket': { name: 'Rocket', type: 'backend' },
  'warp': { name: 'Warp', type: 'backend' },
  'tide': { name: 'Tide', type: 'backend' },
  'salvo': { name: 'Salvo', type: 'backend' },
  'leptos': { name: 'Leptos', type: 'fullstack' },
  'yew': { name: 'Yew', type: 'frontend' },
  'dioxus': { name: 'Dioxus', type: 'fullstack' },
  'tauri': { name: 'Tauri', type: 'desktop' },
};
const CRATE_DB_MAP = {
  'diesel': 'Diesel ORM',
  'sqlx': 'SQLx',
  'mongodb': 'MongoDB',
  'redis': 'Redis',
};
const CRATE_TOOL_MAP = {
  'tokio': 'Tokio',
  'serde': 'Serde',
  'reqwest': 'Reqwest',
  'clap': 'Clap',
  'tracing': 'Tracing',
  'anyhow': 'Anyhow',
  'thiserror': 'ThisError',
  'rayon': 'Rayon',
};

const MAVEN_FRAMEWORK_MAP = {
  'spring-boot-starter-web': { name: 'Spring Boot', type: 'backend' },
  'spring-boot': { name: 'Spring Boot', type: 'backend' },
  'spring-core': { name: 'Spring', type: 'backend' },
  'spring-webmvc': { name: 'Spring MVC', type: 'backend' },
  'spring-webflux': { name: 'Spring WebFlux', type: 'backend' },
  'quarkus': { name: 'Quarkus', type: 'backend' },
  'micronaut': { name: 'Micronaut', type: 'backend' },
  'jakarta.platform': { name: 'Jakarta EE', type: 'backend' },
  'javax': { name: 'Java EE', type: 'backend' },
  'hibernate': { name: 'Hibernate', type: 'backend' },
  'struts': { name: 'Struts', type: 'backend' },
  'vaadin': { name: 'Vaadin', type: 'frontend' },
  'wicket': { name: 'Wicket', type: 'frontend' },
  'grails': { name: 'Grails', type: 'fullstack' },
  'dropwizard': { name: 'Dropwizard', type: 'backend' },
  'helidon': { name: 'Helidon', type: 'backend' },
};
const MAVEN_DB_MAP = {
  'hibernate-core': 'Hibernate ORM',
  'hibernate-entitymanager': 'Hibernate ORM',
  'mybatis': 'MyBatis',
  'mongodb-driver': 'MongoDB',
  'jedis': 'Redis',
  'spring-data-jpa': 'Spring Data JPA',
  'spring-data-mongodb': 'Spring Data MongoDB',
  'spring-data-redis': 'Spring Data Redis',
};
const MAVEN_TOOL_MAP = {
  'lombok': 'Lombok',
  'mapstruct': 'MapStruct',
  'logback': 'Logback',
  'log4j': 'Log4j',
  'junit': 'JUnit',
  'junit-jupiter': 'JUnit 5',
  'mockito': 'Mockito',
  'assertj': 'AssertJ',
  'spring-boot-maven-plugin': 'Spring Boot Maven',
};

function readScriptSources(dirPath) {
  const commands = [];

  const npm = path.join(dirPath, 'package.json');
  if (fs.existsSync(npm)) {
    const pkg = readPackageJson(npm);
    if (pkg && pkg.scripts) {
      for (const [name, cmd] of Object.entries(pkg.scripts)) {
        commands.push({ name: name, cmd: cmd, source: 'npm' });
      }
    }
  }

  const composer = path.join(dirPath, 'composer.json');
  if (fs.existsSync(composer)) {
    try {
      const data = JSON.parse(fs.readFileSync(composer, 'utf-8'));
      if (data.scripts) {
        for (const [name, raw] of Object.entries(data.scripts)) {
          const cmd = Array.isArray(raw) ? raw.join(' && ') : raw;
          commands.push({ name: name, cmd: cmd, source: 'composer' });
        }
      }
    } catch {}
  }

  const makefile = path.join(dirPath, 'Makefile');
  if (fs.existsSync(makefile)) {
    try {
      const content = fs.readFileSync(makefile, 'utf-8');
      const targetRe = /^([a-zA-Z0-9_-]+):/gm;
      let m;
      while ((m = targetRe.exec(content)) !== null) {
        commands.push({ name: m[1], cmd: 'make ' + m[1], source: 'make' });
      }
    } catch {}
  }

  return commands;
}

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

function analyzeNpmPackage(pkg) {
  const result = { frameworks: [], databases: [], tools: [], scripts: pkg.scripts || null };
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const seenFrameworks = new Set();
  const seenDatabases = new Set();
  const seenTools = new Set();

  for (const [depName, depVersion] of Object.entries(allDeps)) {
    const cleanVersion = String(depVersion || '').replace(/^[\^~]/, '');
    const fw = FRAMEWORK_MAP[depName];
    if (fw && !seenFrameworks.has(fw.name)) {
      seenFrameworks.add(fw.name);
      result.frameworks.push({ name: fw.name, version: cleanVersion || null, type: fw.type });
    }
    const db = DB_MAP[depName];
    if (db && !seenDatabases.has(db)) {
      seenDatabases.add(db);
      result.databases.push(db);
    }
    const tool = matchTool(depName);
    if (tool && !seenTools.has(tool)) {
      seenTools.add(tool);
      result.tools.push(tool);
    }
  }
  return result;
}

function analyzeComposerFile(filePath) {
  const result = { frameworks: [], databases: [], tools: [] };
  const content = fs.readFileSync(filePath, 'utf-8');
  const composer = JSON.parse(content);
  const allReqs = { ...composer.require, ...composer['require-dev'] };
  const seen = { frameworks: new Set(), databases: new Set(), tools: new Set() };

  for (const [dep, ver] of Object.entries(allReqs || {})) {
    const cleanVersion = String(ver || '').replace(/^[\^~]/, '');
    const fw = COMPOSER_FRAMEWORK_MAP[dep];
    if (fw && !seen.frameworks.has(fw.name)) {
      seen.frameworks.add(fw.name);
      result.frameworks.push({ name: fw.name, version: cleanVersion || null, type: fw.type });
    }
    const db = COMPOSER_DB_MAP[dep];
    if (db && !seen.databases.has(db)) { seen.databases.add(db); result.databases.push(db); }
    const tool = COMPOSER_TOOL_MAP[dep];
    if (tool && !seen.tools.has(tool)) { seen.tools.add(tool); result.tools.push(tool); }
    if (!fw && !db && !tool && dep.toLowerCase().includes('laravel') && !seen.frameworks.has('Laravel')) {
      seen.frameworks.add('Laravel');
      result.frameworks.push({ name: 'Laravel', version: cleanVersion || null, type: 'backend' });
    }
  }
  return result;
}

function analyzePipFile(filePath) {
  const result = { frameworks: [], databases: [], tools: [] };
  const content = fs.readFileSync(filePath, 'utf-8');
  const seen = { frameworks: new Set(), databases: new Set(), tools: new Set() };

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed.startsWith('git+')) continue;
    const pkgName = trimmed.split(/[=<>!~@#]/)[0].trim().toLowerCase().replace(/_/g, '-');
    if (!pkgName) continue;
    const fw = PYPI_FRAMEWORK_MAP[pkgName];
    if (fw && !seen.frameworks.has(fw.name)) { seen.frameworks.add(fw.name); result.frameworks.push({ name: fw.name, version: null, type: fw.type }); }
    const db = PYPI_DB_MAP[pkgName];
    if (db && !seen.databases.has(db)) { seen.databases.add(db); result.databases.push(db); }
    const tool = PYPI_TOOL_MAP[pkgName];
    if (tool && !seen.tools.has(tool)) { seen.tools.add(tool); result.tools.push(tool); }
  }
  return result;
}

function analyzeGoModFile(filePath) {
  const result = { frameworks: [], databases: [], tools: [] };
  const content = fs.readFileSync(filePath, 'utf-8');
  const seen = { frameworks: new Set(), databases: new Set(), tools: new Set() };

  for (const line of content.split('\n')) {
    const m = line.match(/^\s+([a-zA-Z0-9_.\/-]+)\s+v/);
    if (m) {
      const modPath = m[1].toLowerCase();
      const fw = GO_FRAMEWORK_MAP[modPath];
      if (fw && !seen.frameworks.has(fw.name)) { seen.frameworks.add(fw.name); result.frameworks.push({ name: fw.name, version: null, type: fw.type }); }
      const tool = GO_TOOL_MAP[modPath];
      if (tool && !seen.tools.has(tool)) { seen.tools.add(tool); result.tools.push(tool); }
    }
  }
  return result;
}

function analyzeCargoFile(filePath) {
  const result = { frameworks: [], databases: [], tools: [] };
  const content = fs.readFileSync(filePath, 'utf-8');
  const seen = { frameworks: new Set(), databases: new Set(), tools: new Set() };

  const depSection = content.match(/\[dependencies\]([^[]*)/);
  if (depSection) {
    for (const line of depSection[1].split('\n')) {
      const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*=/);
      if (m) {
        const crate = m[1].toLowerCase().replace(/_/g, '-');
        const fw = CRATE_FRAMEWORK_MAP[crate];
        if (fw && !seen.frameworks.has(fw.name)) { seen.frameworks.add(fw.name); result.frameworks.push({ name: fw.name, version: null, type: fw.type }); }
        const db = CRATE_DB_MAP[crate];
        if (db && !seen.databases.has(db)) { seen.databases.add(db); result.databases.push(db); }
        const tool = CRATE_TOOL_MAP[crate];
        if (tool && !seen.tools.has(tool)) { seen.tools.add(tool); result.tools.push(tool); }
      }
    }
  }
  return result;
}

function analyzeGemFile(filePath) {
  const result = { frameworks: [], databases: [], tools: [] };
  const content = fs.readFileSync(filePath, 'utf-8');
  const seen = { frameworks: new Set(), databases: new Set(), tools: new Set() };
  const gemRe = /gem\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = gemRe.exec(content)) !== null) {
    const gem = m[1].toLowerCase().replace(/_/g, '-');
    const fw = GEM_FRAMEWORK_MAP[gem];
    if (fw && !seen.frameworks.has(fw.name)) { seen.frameworks.add(fw.name); result.frameworks.push({ name: fw.name, version: null, type: fw.type }); }
    const db = GEM_DB_MAP[gem];
    if (db && !seen.databases.has(db)) { seen.databases.add(db); result.databases.push(db); }
    const tool = GEM_TOOL_MAP[gem];
    if (tool && !seen.tools.has(tool)) { seen.tools.add(tool); result.tools.push(tool); }
  }
  return result;
}

function analyzePomFile(filePath) {
  const result = { frameworks: [], databases: [], tools: [] };
  const content = fs.readFileSync(filePath, 'utf-8');
  const seen = { frameworks: new Set(), databases: new Set(), tools: new Set() };
  const artifactRe = /<artifactId>([^<]+)<\/artifactId>/gi;
  let m;
  while ((m = artifactRe.exec(content)) !== null) {
    const artifact = m[1].toLowerCase().replace(/_/g, '-');
    const fw = MAVEN_FRAMEWORK_MAP[artifact];
    if (fw && !seen.frameworks.has(fw.name)) { seen.frameworks.add(fw.name); result.frameworks.push({ name: fw.name, version: null, type: fw.type }); }
    const db = MAVEN_DB_MAP[artifact];
    if (db && !seen.databases.has(db)) { seen.databases.add(db); result.databases.push(db); }
    const tool = MAVEN_TOOL_MAP[artifact];
    if (tool && !seen.tools.has(tool)) { seen.tools.add(tool); result.tools.push(tool); }
  }
  return result;
}

function detectDependencies(dirPath) {
  const result = { frameworks: [], databases: [], tools: [], scripts: null, packageManager: null, commands: [] };
  const mergeResult = (sub) => {
    for (const fw of sub.frameworks || []) { if (!result.frameworks.some(f => f.name === fw.name)) result.frameworks.push(fw); }
    for (const db of sub.databases || []) { if (!result.databases.includes(db)) result.databases.push(db); }
    for (const tool of sub.tools || []) { if (!result.tools.includes(tool)) result.tools.push(tool); }
  };

  const pkgPath = path.join(dirPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = readPackageJson(pkgPath);
    if (pkg) {
      result.packageManager = detectPackageManager(dirPath);
      if (pkg.scripts) result.scripts = pkg.scripts;
      mergeResult(analyzeNpmPackage(pkg));
    }
  }
  const composerPath = path.join(dirPath, 'composer.json');
  if (fs.existsSync(composerPath)) mergeResult(analyzeComposerFile(composerPath));
  const reqPath = path.join(dirPath, 'requirements.txt');
  if (fs.existsSync(reqPath)) mergeResult(analyzePipFile(reqPath));
  const pipfilePath = path.join(dirPath, 'Pipfile');
  if (fs.existsSync(pipfilePath)) mergeResult(analyzePipFile(pipfilePath));
  const gemfilePath = path.join(dirPath, 'Gemfile');
  if (fs.existsSync(gemfilePath)) mergeResult(analyzeGemFile(gemfilePath));
  const goModPath = path.join(dirPath, 'go.mod');
  if (fs.existsSync(goModPath)) mergeResult(analyzeGoModFile(goModPath));
  const cargoPath = path.join(dirPath, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) mergeResult(analyzeCargoFile(cargoPath));
  const pomPath = path.join(dirPath, 'pom.xml');
  if (fs.existsSync(pomPath)) mergeResult(analyzePomFile(pomPath));

  result.commands = readScriptSources(dirPath);

  return result;
}

function scanMonorepoSubProjects(rootDir) {
  const subProjects = [];
  const scanDir = (name, dirPath) => {
    const deps = detectDependencies(dirPath);
    if (deps.frameworks.length > 0 || deps.databases.length > 0 || deps.tools.length > 0 || deps.commands.length > 0) {
      subProjects.push({ name, ...deps });
    }
  };

  for (const dir of MONOREPO_NAMED_DIRS) {
    const fullPath = path.join(rootDir, dir);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) scanDir(dir, fullPath);
  }
  for (const parentDir of MONOREPO_GLOB_DIRS) {
    const parentPath = path.join(rootDir, parentDir);
    if (fs.existsSync(parentPath)) {
      let entries;
      try { entries = fs.readdirSync(parentPath, { withFileTypes: true }); }
      catch { continue; }
      for (const entry of entries) {
        if (entry.isDirectory()) scanDir(parentDir + '/' + entry.name, path.join(parentPath, entry.name));
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

  // --- Detect dependencies (all ecosystems) ---
  const deps = detectDependencies(repoPath);
  result.packageManager = deps.packageManager;
  if (deps.scripts) result.scripts = deps.scripts;
  result.frameworks = deps.frameworks;
  result.databases = deps.databases;
  result.thirdPartyTools = deps.tools;

  // --- Entry points from root package.json ---
  const pkg = readPackageJson(path.join(repoPath, 'package.json'));
  if (pkg) {
    if (pkg.main) result.entryPoints.push(pkg.main);
    if (pkg.bin) {
      if (typeof pkg.bin === 'string') result.entryPoints.push(pkg.bin);
      else result.entryPoints.push(...Object.values(pkg.bin));
    }
  }

  // --- Scan monorepo sub-projects ---
  const subProjects = scanMonorepoSubProjects(repoPath);
  if (subProjects.length > 0) {
    result.subProjects = subProjects;

    // If root had no detectable dependencies, aggregate frameworks/databases/tools from sub-projects
    if (deps.frameworks.length === 0 && deps.databases.length === 0 && deps.tools.length === 0) {
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
