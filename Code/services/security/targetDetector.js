'use strict';

const fs = require('fs');
const path = require('path');
const { parseEnvFile } = require('../consoleEnv');
const { projectRoots } = require('./engine');
const { isLocalHost } = require('./targetGuard');

const ENV_FILES = ['.env.local', '.env.development.local', '.env.development', '.env'];
const MAX_CANDIDATES = 6;
const MAX_PROBES = 8;
const PROBE_TIMEOUT_MS = 1500;
const MAX_CONFIG_BYTES = 200 * 1024;
const DB_PORTS = new Set([5432, 3306, 6379, 27017, 1433, 9200, 5672, 15672, 2181, 9092]);
const QUOTE_CODES = [34, 39];

const URL_KEY_RULES = [
  {
    re: /^(?:(?:NEXT_PUBLIC|VITE|REACT_APP|NUXT_PUBLIC|PUBLIC)_)?(?:APP|SITE|WEB|FRONTEND|CLIENT|BASE|PUBLIC|HOME)_URL$/,
    kind: 'frontend',
    score: 60,
  },
  { re: /^(?:NEXTAUTH_URL|AUTH_URL|APP_ORIGIN|SITE_ORIGIN|ORIGIN)$/, kind: 'frontend', score: 50 },
  {
    re: /^(?:(?:NEXT_PUBLIC|VITE|REACT_APP|NUXT_PUBLIC|PUBLIC)_)?(?:API|BACKEND|SERVER)(?:_BASE)?_URL$/,
    kind: 'backend',
    score: 35,
  },
];

const PORT_KEY_RULES = [
  { re: /^(?:FRONTEND|CLIENT|WEB|APP|NEXT|VITE)_PORT$/, kind: 'frontend', score: 55 },
  { re: /^(?:API|BACKEND|SERVER)_PORT$/, kind: 'backend', score: 40 },
  { re: /^PORT$/, kind: null, score: 45 },
];

const SCRIPT_NAME_RE = /(?:^|:)(?:dev|start|serve|preview|develop)(?::|$)/;
const PORT_FLAG_RE = /(?:--port(?:=|\s+)|\s-p(?:=|\s*)|\bPORT=)(\d{2,5})(?![\d:])/g;
const COMPOSE_PORT_RE = /^\s*-\s*[\x22\x27]?(?:[\d.]+:)?(\d{2,5}):\d{2,5}(?:\/\w+)?[\x22\x27]?\s*$/gm;
const FRONT_DEFAULTS = { nextjs: 3000, nuxt: 3000, sveltekit: 5173, svelte: 5173, vue: 5173, react: 3000, angular: 4200, laravel: 8000 };
const BACK_DEFAULTS = { nestjs: 3000, express: 3000, fastify: 3000, koa: 3000, laravel: 8000 };

function readText(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) return '';
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return '';
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

function folderKind(name) {
  const n = String(name || '').toLowerCase();
  if (/(back|api|server|service)/.test(n)) return 'backend';
  if (/(front|web|client|ui|app|site)/.test(n)) return 'frontend';
  return null;
}

function labelFor(repoPath, root, fileName) {
  const rel = path.relative(repoPath, root).split(path.sep).join('/');
  return rel ? rel + '/' + fileName : fileName;
}

function cleanValue(value) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (text.length < 2) return text;
  const first = text.charCodeAt(0);
  const last = text.charCodeAt(text.length - 1);
  if (first === last && QUOTE_CODES.includes(first)) return text.slice(1, -1).trim();
  return text;
}

function normalizeUrl(value) {
  let text = cleanValue(value);
  if (!text || text.indexOf('$') !== -1) return null;
  if (/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(text)) text = 'http://' + text;
  if (!/^https?:\/\//i.test(text)) return null;
  let url;
  try {
    url = new URL(text);
  } catch (e) {
    return null;
  }
  let host = url.hostname;
  if (host === '0.0.0.0' || host === '[::]' || host === '::') host = 'localhost';
  const port = url.port ? ':' + url.port : '';
  return url.protocol + '//' + host + port;
}

function urlFromPort(value) {
  const port = parseInt(cleanValue(value), 10);
  if (!Number.isInteger(port) || port < 80 || port > 65535) return null;
  return 'http://localhost:' + port;
}

function createCollector() {
  const map = new Map();

  function add(url, kind, score, source) {
    if (!url) return;
    let host;
    try {
      host = new URL(url).hostname;
    } catch (e) {
      return;
    }
    const key = url.replace('127.0.0.1', 'localhost');
    const found = map.get(key);
    if (!found) {
      map.set(key, { url, kind, topScore: score, score, sources: [source], local: isLocalHost(host), reachable: false });
      return;
    }
    if (!found.sources.includes(source)) found.sources.push(source);
    found.score = Math.max(found.score, score) + 5;
    if (score > found.topScore) {
      found.topScore = score;
      found.kind = kind;
    }
  }

  return { add, list: () => Array.from(map.values()) };
}

function scanEnv(repoPath, roots, add) {
  for (const root of roots) {
    const hint = root === repoPath ? null : folderKind(path.basename(root));
    for (const name of ENV_FILES) {
      const map = parseEnvFile(path.join(root, name));
      if (!map) continue;
      for (const key of Object.keys(map)) {
        const value = map[key];
        const where = labelFor(repoPath, root, name) + ' (' + key + ')';
        const urlRule = URL_KEY_RULES.find((rule) => rule.re.test(key));
        if (urlRule) {
          add(normalizeUrl(value), urlRule.kind, urlRule.score, where);
          continue;
        }
        const portRule = PORT_KEY_RULES.find((rule) => rule.re.test(key));
        if (portRule && /^\d{2,5}$/.test(cleanValue(value))) {
          add(urlFromPort(value), portRule.kind || hint || 'unknown', portRule.score, where);
        }
      }
    }
  }
}

function scriptKind(text, hint) {
  if (/\b(?:next|vite|nuxt|ng serve|react-scripts|svelte-kit|vue-cli-service|astro|webpack serve|webpack-dev-server|artisan)\b/.test(text)) {
    return 'frontend';
  }
  if (/\b(?:nest|nodemon|ts-node|tsx|fastify)\b|\bnode\s/.test(text)) return 'backend';
  return hint || 'unknown';
}

function scanScripts(repoPath, roots, add) {
  for (const root of roots) {
    const pkg = readJson(path.join(root, 'package.json'));
    if (!pkg || !pkg.scripts || typeof pkg.scripts !== 'object') continue;
    const hint = root === repoPath ? null : folderKind(path.basename(root));
    for (const scriptName of Object.keys(pkg.scripts)) {
      if (!SCRIPT_NAME_RE.test(scriptName)) continue;
      const text = String(pkg.scripts[scriptName]);
      const kind = scriptKind(text, hint);
      const score = kind === 'frontend' ? 70 : kind === 'backend' ? 45 : 50;
      PORT_FLAG_RE.lastIndex = 0;
      let match = PORT_FLAG_RE.exec(text);
      while (match) {
        add(urlFromPort(match[1]), kind, score, labelFor(repoPath, root, 'package.json') + ' script ' + scriptName);
        match = PORT_FLAG_RE.exec(text);
      }
    }
  }
}

function scanConfigs(repoPath, roots, add) {
  for (const root of roots) {
    const hint = root === repoPath ? null : folderKind(path.basename(root));
    for (const name of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts']) {
      const text = readText(path.join(root, name));
      if (!text) continue;
      const match = /\bport\s*:\s*(\d{2,5})/.exec(text);
      if (match) add(urlFromPort(match[1]), hint || 'frontend', 60, labelFor(repoPath, root, name));
    }
    for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
      const text = readText(path.join(root, name));
      if (!text) continue;
      COMPOSE_PORT_RE.lastIndex = 0;
      let match = COMPOSE_PORT_RE.exec(text);
      while (match) {
        const port = parseInt(match[1], 10);
        if (!DB_PORTS.has(port)) add(urlFromPort(port), hint || 'unknown', 30, labelFor(repoPath, root, name));
        match = COMPOSE_PORT_RE.exec(text);
      }
    }
  }
}

function addDefaults(profile, add) {
  if (!profile) return;
  const front = profile.frontend || {};
  const back = profile.backend || {};
  let frontPort = null;
  if (front.framework && front.framework !== 'unknown') {
    frontPort = front.bundler === 'vite' ? 5173 : FRONT_DEFAULTS[front.framework] || null;
  }
  if (frontPort) add(urlFromPort(frontPort), 'frontend', 25, 'default port of ' + front.framework);
  const backPort = BACK_DEFAULTS[back.framework] || null;
  if (backPort) add(urlFromPort(backPort), 'backend', 15, 'default port of ' + back.framework);
}

async function probe(url) {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { 'User-Agent': 'HelperTool-SecurityTest/1' },
    });
    try {
      if (res.body) await res.body.cancel();
    } catch (e) {
      /* the body was already closed */
    }
    return true;
  } catch (e) {
    return false;
  }
}

function byScore(a, b) {
  return b.score - a.score || (a.url < b.url ? -1 : 1);
}

async function detect(repoPath, profile) {
  const roots = projectRoots(repoPath);
  const collector = createCollector();
  scanEnv(repoPath, roots, collector.add);
  scanScripts(repoPath, roots, collector.add);
  scanConfigs(repoPath, roots, collector.add);
  addDefaults(profile, collector.add);

  const list = collector.list();
  const probes = list
    .filter((c) => c.local)
    .sort(byScore)
    .slice(0, MAX_PROBES);
  await Promise.all(
    probes.map(async (c) => {
      c.reachable = await probe(c.url);
    })
  );

  for (const c of list) {
    if (c.kind === 'frontend') c.score += 10;
    if (c.reachable) c.score += c.kind === 'backend' ? 10 : 30;
  }
  list.sort(byScore);

  const locals = list.filter((c) => c.local);
  const best = locals.length ? locals[0] : null;
  const second = locals.length > 1 ? locals[1] : null;
  const confident = !!best && (!second || best.score - second.score >= 25);

  const candidates = list.slice(0, MAX_CANDIDATES).map((c) => ({
    url: c.url,
    kind: c.kind,
    local: c.local,
    reachable: c.reachable,
    score: c.score,
    sources: c.sources.slice(0, 3),
  }));
  const bestOut = best ? candidates.find((c) => c.url === best.url) || null : null;

  return { best: bestOut, candidates, confident, checkedAt: Date.now() };
}

module.exports = { detect, normalizeUrl };