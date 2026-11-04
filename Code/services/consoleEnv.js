'use strict';

const fs = require('fs');
const path = require('path');

const RESULT_FILE = '.helper-console-result.json';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', 'host.docker.internal']);

function parseEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return null;
  }
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    out[m[1]] = value;
  }
  return out;
}

/**
 * Reads .env.<appEnv> and .env inside dir. The password is never returned.
 */
function resolveTarget(dir, appEnv) {
  const names = ['.env.' + appEnv, '.env'];
  const files = [];
  let found = null;
  if (process.env.DATABASE_URL) {
    found = { value: process.env.DATABASE_URL, source: 'system environment variable' };
  }
  for (const name of names) {
    const parsed = parseEnvFile(path.join(dir, name));
    if (!parsed) continue;
    files.push(name);
    if (!found && parsed.DATABASE_URL) found = { value: parsed.DATABASE_URL, source: name };
  }
  const base = {
    appEnv,
    files,
    configured: false,
    host: null,
    port: null,
    database: null,
    source: null,
    remote: false,
    systemOverride: !!process.env.DATABASE_URL,
  };
  if (!found) return base;
  try {
    const u = new URL(found.value);
    return Object.assign(base, {
      configured: true,
      host: u.hostname,
      port: u.port || '5432',
      database: decodeURIComponent(u.pathname.replace(/^\//, '')),
      source: found.source,
      remote: !LOCAL_HOSTS.has(u.hostname.toLowerCase()),
    });
  } catch (e) {
    return Object.assign(base, { source: found.source, error: 'DATABASE_URL is not a valid URL' });
  }
}

function childEnv(extra) {
  const env = Object.assign({}, process.env, { NO_COLOR: '1' });
  delete env.APP_ENV;
  delete env.NODE_ENV;
  delete env.ENV_FILE;
  delete env.ELECTRON_RUN_AS_NODE;
  return Object.assign(env, extra || {});
}

module.exports = { RESULT_FILE, LOCAL_HOSTS, parseEnvFile, resolveTarget, childEnv };