'use strict';

const fs = require('fs');
const path = require('path');

const RESULT_FILE = '.helper-console-result.json';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', 'host.docker.internal']);
const URL_KEYS = ['DATABASE_URL', 'DB_URL', 'SQLALCHEMY_DATABASE_URL', 'SQLALCHEMY_DATABASE_URI'];
const DEFAULT_PORTS = {
  postgres: '5432',
  postgresql: '5432',
  pgsql: '5432',
  mysql: '3306',
  mariadb: '3306',
  mongodb: '27017',
  sqlserver: '1433',
  sqlsrv: '1433',
  mssql: '1433',
  redis: '6379',
};

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

function isLocalHost(host) {
  const h = String(host || '').toLowerCase().replace(/^tcp:/, '');
  if (LOCAL_HOSTS.has(h)) return true;
  return h === '.' || h === '(local)' || h.startsWith('(localdb)') || h.startsWith('.\\');
}

function describeUrl(value) {
  const u = new URL(value);
  const scheme = u.protocol.replace(/:$/, '').split('+')[0].toLowerCase();
  if (scheme === 'sqlite') {
    const file = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'sqlite';
    return { host: 'localhost', port: null, database: file };
  }
  return {
    host: u.hostname,
    port: u.port || DEFAULT_PORTS[scheme] || null,
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}

function describeConn(value) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return describeUrl(value);
  const parts = {};
  for (const seg of String(value).split(';')) {
    const i = seg.indexOf('=');
    if (i === -1) continue;
    parts[seg.slice(0, i).trim().toLowerCase()] = seg.slice(i + 1).trim();
  }
  let host = parts.host || parts.server || parts['data source'] || parts.address || parts['server name'] || '';
  let port = parts.port || null;
  const m = /^(?:tcp:)?([^,:]+)[,:](\d+)$/.exec(host);
  if (m) {
    host = m[1];
    port = port || m[2];
  }
  let database = parts.database || parts['initial catalog'] || '';
  if (!database && /\.(db|sqlite3?)$/i.test(host)) {
    database = host;
    host = 'localhost';
  }
  if (!host || !database) throw new Error('The connection string has no host or database');
  return { host, port, database };
}

function fromEnvMap(map, source) {
  for (const key of URL_KEYS) {
    if (map[key]) return { kind: 'url', value: map[key], source };
  }
  const connection = String(map.DB_CONNECTION || '').toLowerCase();
  if (connection === 'sqlite') {
    return { kind: 'parts', value: { host: 'localhost', port: null, database: map.DB_DATABASE || 'database.sqlite' }, source };
  }
  const host = map.DB_HOST || map.POSTGRES_SERVER || map.MYSQL_HOST || map.DATABASE_HOST;
  const database = map.DB_DATABASE || map.DB_NAME || map.POSTGRES_DB || map.MYSQL_DATABASE || map.DATABASE_NAME;
  if (host && database) {
    const port = map.DB_PORT || map.POSTGRES_PORT || map.MYSQL_PORT || map.DATABASE_PORT || DEFAULT_PORTS[connection] || null;
    return { kind: 'parts', value: { host, port, database }, source };
  }
  return null;
}

function readJsonLoose(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return null;
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, '').replace(/^\s*\/\/.*$/gm, ''));
  } catch (e) {
    return {};
  }
}

function fromAppSettings(dir, appEnv, files) {
  const cap = appEnv.charAt(0).toUpperCase() + appEnv.slice(1);
  for (const name of ['appsettings.' + cap + '.json', 'appsettings.json']) {
    const data = readJsonLoose(path.join(dir, name));
    if (data === null) continue;
    files.push(name);
    const conns = data.ConnectionStrings;
    if (!conns || typeof conns !== 'object') continue;
    const key = conns.DefaultConnection ? 'DefaultConnection' : Object.keys(conns).find((k) => typeof conns[k] === 'string');
    if (key && typeof conns[key] === 'string') return { kind: 'conn', value: conns[key], source: name };
  }
  return null;
}

/**
 * Reads .env.<appEnv>, .env and appsettings*.json inside dir. The password is never returned.
 */
function resolveTarget(dir, appEnv) {
  const names = ['.env.' + appEnv, '.env'];
  const files = [];
  let found = null;
  if (process.env.DATABASE_URL) {
    found = { kind: 'url', value: process.env.DATABASE_URL, source: 'system environment variable' };
  }
  for (const name of names) {
    const parsed = parseEnvFile(path.join(dir, name));
    if (!parsed) continue;
    files.push(name);
    if (!found) found = fromEnvMap(parsed, name);
  }
  if (!found) found = fromAppSettings(dir, appEnv, files);
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
    const d = found.kind === 'url' ? describeUrl(found.value) : found.kind === 'conn' ? describeConn(found.value) : found.value;
    return Object.assign(base, {
      configured: true,
      host: d.host,
      port: d.port ? String(d.port) : null,
      database: d.database,
      source: found.source,
      remote: !isLocalHost(d.host),
    });
  } catch (e) {
    return Object.assign(base, { source: found.source, error: 'The database setting could not be read' });
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