'use strict';

const fs = require('fs');
const path = require('path');
const { getProvider } = require('../utils/deployProviders.js');

const SUBDIRS = ['frontend', 'backend', 'client', 'server', 'api', 'web', 'app'];
const MARKER_FILES = [
  'vercel.json', '.vercel', 'netlify.toml', 'render.yaml', 'fly.toml', 'railway.json', 'railway.toml',
  'Procfile', 'amplify.yml', 'firebase.json', 'wrangler.toml', 'wrangler.json', 'wrangler.jsonc', 'Dockerfile',
];
const PER_ROLE = 4;

const LABELS = {
  nextjs: 'Next.js', react: 'React', vue: 'Vue', angular: 'Angular', astro: 'Astro', nuxt: 'Nuxt', svelte: 'Svelte',
  sveltekit: 'SvelteKit', nestjs: 'NestJS', express: 'Express', fastify: 'Fastify', koa: 'Koa', laravel: 'Laravel',
  php: 'PHP', python: 'Python', flask: 'Flask', django: 'Django', dotnet: '.NET', html: 'Static HTML',
  postgres: 'PostgreSQL', mysql: 'MySQL', mongodb: 'MongoDB', sqlite: 'SQLite', redis: 'Redis', supabase: 'Supabase', firebase: 'Firebase',
};

function suggestFrom(signals) {
  const s = signals || {};
  const stack = new Set((s.stackIds || []).map(String));
  const frameworks = new Set((s.frameworks || []).map(String));
  const markers = new Set((s.markers || []).map(String));
  const envKeys = (s.envKeys || []).map(String);
  const dialect = String(s.dialect || '');
  const out = new Map();

  const add = (role, providerId, reason, score) => {
    if (!getProvider(providerId)) return;
    const key = role + '|' + providerId;
    const prev = out.get(key);
    if (!prev || prev.score < score) out.set(key, { role, providerId, reason, score });
  };
  const has = (id) => stack.has(id) || frameworks.has(id);
  const anyKey = (re) => envKeys.some((k) => re.test(k));

  if (markers.has('vercel.json') || markers.has('.vercel')) add('frontend', 'vercel', 'Vercel config found in the repo', 100);
  if (markers.has('netlify.toml')) add('frontend', 'netlify', 'netlify.toml found in the repo', 100);
  if (markers.has('render.yaml')) add('backend', 'render', 'render.yaml found in the repo', 100);
  if (markers.has('fly.toml')) add('backend', 'fly', 'fly.toml found in the repo', 100);
  if (markers.has('railway.json') || markers.has('railway.toml')) add('backend', 'railway', 'Railway config found in the repo', 100);
  if (markers.has('Procfile')) add('backend', 'heroku', 'Procfile found in the repo', 90);
  if (markers.has('amplify.yml')) add('frontend', 'aws', 'amplify.yml found in the repo', 95);
  if (markers.has('firebase.json')) add('frontend', 'firebase', 'firebase.json found in the repo', 90);
  if (markers.has('wrangler.toml') || markers.has('wrangler.json') || markers.has('wrangler.jsonc')) {
    add('backend', 'cloudflare', 'Wrangler config found in the repo', 85);
    add('frontend', 'cloudflare', 'Wrangler config found in the repo', 70);
  }
  if (markers.has('Dockerfile')) {
    add('backend', 'render', 'Dockerfile found in the repo', 35);
    add('backend', 'fly', 'Dockerfile found in the repo', 35);
  }

  if (has('nextjs')) {
    add('frontend', 'vercel', 'Next.js project', 80);
    add('frontend', 'netlify', 'Next.js project', 50);
    add('frontend', 'cloudflare', 'Next.js project', 40);
  }
  if (['react', 'vue', 'angular', 'astro', 'nuxt', 'svelte', 'sveltekit'].some(has)) {
    add('frontend', 'vercel', 'Single page or static front end', 60);
    add('frontend', 'netlify', 'Single page or static front end', 55);
    add('frontend', 'cloudflare', 'Single page or static front end', 45);
  }
  if (has('html')) {
    add('frontend', 'netlify', 'Static HTML site', 50);
    add('frontend', 'github', 'Static HTML site (GitHub Pages)', 45);
  }
  if (['nestjs', 'express', 'fastify', 'koa', 'flask', 'django', 'python'].some(has)) {
    add('backend', 'render', 'Server framework detected', 60);
    add('backend', 'railway', 'Server framework detected', 55);
    add('backend', 'fly', 'Server framework detected', 50);
  }
  if (has('laravel') || has('php')) {
    add('backend', 'hostinger', 'PHP project', 60);
    add('backend', 'digitalocean', 'PHP project', 40);
  }
  if (has('dotnet')) add('backend', 'azure', '.NET project', 60);

  if (dialect === 'postgres') {
    add('database', 'aiven', 'PostgreSQL detected', 70);
    add('database', 'neon', 'PostgreSQL detected', 70);
    add('database', 'supabase', 'PostgreSQL detected', 65);
    add('database', 'render', 'PostgreSQL detected', 55);
  } else if (dialect === 'mysql') {
    add('database', 'aiven', 'MySQL detected', 65);
    add('database', 'planetscale', 'MySQL detected', 60);
  } else if (dialect === 'mongodb') {
    add('database', 'mongodb-atlas', 'MongoDB detected', 90);
  } else if (dialect === 'redis') {
    add('database', 'upstash', 'Redis detected', 70);
    add('database', 'redis-cloud', 'Redis detected', 60);
  } else if (dialect === 'sqlite') {
    add('database', 'turso', 'SQLite detected', 60);
  } else if (dialect === 'supabase') {
    add('database', 'supabase', 'Supabase detected', 95);
  } else if (dialect === 'firebase') {
    add('database', 'firebase', 'Firebase detected', 90);
  }
  if (anyKey(/^(MONGO|MONGODB)_/)) add('database', 'mongodb-atlas', 'Mongo variables in .env', 85);

  if (anyKey(/^CLOUDINARY_/)) add('images', 'cloudinary', 'Cloudinary variables in .env', 95);
  if (anyKey(/^(AWS_S3|S3_|AWS_BUCKET|AWS_ACCESS)/)) add('images', 'aws', 'S3 or AWS variables in .env', 85);
  if (anyKey(/^UPLOADTHING/)) add('images', 'uploadthing', 'UploadThing variables in .env', 90);
  if (anyKey(/^IMAGEKIT/)) add('images', 'imagekit', 'ImageKit variables in .env', 90);
  if (anyKey(/^(R2_|CLOUDFLARE_R2)/)) add('images', 'cloudflare', 'R2 variables in .env', 85);
  if (anyKey(/^BUNNY/)) add('images', 'bunny', 'Bunny variables in .env', 85);
  if (anyKey(/SUPABASE/)) {
    add('images', 'supabase', 'Supabase variables in .env', 60);
    add('database', 'supabase', 'Supabase variables in .env', 90);
  }
  if (anyKey(/^FIREBASE_/)) add('images', 'firebase', 'Firebase variables in .env', 55);
  add('images', 'cloudinary', 'Common image host', 20);
  add('images', 'imagekit', 'Common image host', 15);

  const byRole = new Map();
  for (const item of out.values()) {
    if (!byRole.has(item.role)) byRole.set(item.role, []);
    byRole.get(item.role).push(item);
  }
  const result = [];
  for (const list of byRole.values()) {
    list.sort((a, b) => (b.score - a.score) || a.providerId.localeCompare(b.providerId));
    for (const item of list.slice(0, PER_ROLE)) result.push(item);
  }
  return result;
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (_) {
    return false;
  }
}

function detectedLabels(stackIds, frameworks, dialect, envKeys) {
  const labels = [];
  const push = (l) => {
    if (l && labels.indexOf(l) === -1) labels.push(l);
  };
  for (const id of stackIds.concat(frameworks)) push(LABELS[id]);
  push(LABELS[dialect]);
  if (envKeys.some((k) => /^CLOUDINARY_/.test(k))) push('Cloudinary');
  return labels;
}

async function suggestForRepo(root) {
  const base = String(root || '');
  if (!base || !isDir(base)) return { success: false, error: 'Open a repository first' };

  const dirs = [base].concat(SUBDIRS.map((d) => path.join(base, d)).filter(isDir));
  const signals = { stackIds: [], frameworks: [], dialect: '', envKeys: [], markers: [] };

  try {
    const { detectStack } = require('./ideStack.js');
    signals.stackIds = Object.keys(await detectStack(base));
  } catch (_) {
    signals.stackIds = [];
  }

  let stackDetector = null;
  let dbDetector = null;
  let envReader = null;
  try { stackDetector = require('./security/detect/stackDetector.js'); } catch (_) { stackDetector = null; }
  try { dbDetector = require('./security/detect/dbDetector.js'); } catch (_) { dbDetector = null; }
  try { envReader = require('./security/detect/envReader.js'); } catch (_) { envReader = null; }

  for (const dir of dirs) {
    for (const name of MARKER_FILES) {
      if (fs.existsSync(path.join(dir, name)) && signals.markers.indexOf(name) === -1) signals.markers.push(name);
    }
    try {
      if (stackDetector) {
        const s = stackDetector.detect(dir);
        if (s.frontend.framework !== 'unknown') signals.frameworks.push(s.frontend.framework);
        if (s.backend.framework !== 'unknown') signals.frameworks.push(s.backend.framework);
      }
    } catch (_) {}
    try {
      if (dbDetector && !signals.dialect) {
        const d = dbDetector.detect(dir);
        if (d.dialect && d.dialect !== 'unknown') signals.dialect = d.dialect;
      }
    } catch (_) {}
    try {
      if (envReader) {
        for (const key of envReader.readEnv(dir).keysPresent) {
          if (signals.envKeys.indexOf(key) === -1) signals.envKeys.push(key);
        }
      }
    } catch (_) {}
  }

  return {
    success: true,
    detected: detectedLabels(signals.stackIds, signals.frameworks, signals.dialect, signals.envKeys),
    suggestions: suggestFrom(signals),
  };
}

module.exports = { suggestFrom, suggestForRepo };