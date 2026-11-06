'use strict';

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'release',
]);

const TEXT_EXT = /\.(?:js|jsx|ts|tsx|mjs|cjs|vue|svelte|php|py|rb|go|java|cs|html|htm|json|yml|yaml|toml|sql)$/i;
const SKIP_FILE = /(?:\.min\.|-bundle\.|package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$|composer\.lock$|\.map$)/i;
const MAX_FILE_BYTES = 400 * 1024;
const MAX_FILES = 6000;

function isTestPath(rel) {
  return /(?:^|\/)(?:tests?|__tests__|__test__|fixtures|e2e|specs?|mocks?)(?:\/|$)|\.(?:test|spec)\.[a-z]+$/i.test(rel);
}

function isToolPath(rel) {
  return /(?:^|\/)services\/security\//.test(rel);
}

function scan(repoPath) {
  const files = [];
  const envFiles = [];
  let truncated = false;
  const stack = [repoPath];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(repoPath, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (/^\.env(?:\.|$)/.test(entry.name)) {
        envFiles.push(rel);
        continue;
      }
      if (!TEXT_EXT.test(entry.name) || SKIP_FILE.test(entry.name)) continue;
      if (files.length >= MAX_FILES) {
        truncated = true;
        continue;
      }
      let stat;
      try {
        stat = fs.statSync(full);
      } catch (e) {
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) continue;
      let text;
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch (e) {
        continue;
      }
      files.push({ rel, text, lines: null });
    }
  }

  return { files, envFiles, truncated };
}

function linesOf(file) {
  if (!file.lines) file.lines = file.text.split(/\r?\n/);
  return file.lines;
}

function clip(line) {
  const t = String(line).trim();
  return t.length > 160 ? t.slice(0, 160) + '...' : t;
}

function grep(files, patterns, options) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  const o = options || {};
  const hits = [];
  for (const f of files) {
    if (isToolPath(f.rel)) continue;
    if (!o.includeTests && isTestPath(f.rel)) continue;
    if (o.fileRe && !o.fileRe.test(f.rel)) continue;
    const lines = linesOf(f);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.length > 2000) continue;
      if (!list.some((re) => re.test(line))) continue;
      if (o.filter && !o.filter(line, lines, i, f)) continue;
      hits.push({ file: f.rel, line: i + 1, text: clip(line) });
    }
  }
  return hits;
}

module.exports = { scan, grep, linesOf, isTestPath, isToolPath };