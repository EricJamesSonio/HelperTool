'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE_NAME = 'ci-env.json';
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_ENTRIES = 200;
const MAX_VALUE_LENGTH = 16384;

function repoKey(repoPath) {
  return crypto.createHash('sha256').update(path.resolve(repoPath)).digest('hex');
}

function storePath(dataDir) {
  if (typeof dataDir !== 'string' || !dataDir) {
    throw new Error('The CI environment storage location is unavailable.');
  }
  return path.join(dataDir, FILE_NAME);
}

function readStore(dataDir) {
  const file = storePath(dataDir);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('The local CI environment store is invalid JSON: ' + error.message);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The local CI environment store has an invalid format.');
  }
  return parsed;
}

function writeStore(dataDir, data) {
  const file = storePath(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';

  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    try {
      fs.unlinkSync(temp);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function repoValues(dataDir, repoPath) {
  const value = readStore(dataDir)[repoKey(repoPath)];
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The local CI environment entry has an invalid format.');
  }
  return value;
}

function getNames(dataDir, repoPath) {
  return Object.keys(repoValues(dataDir, repoPath)).sort();
}

function getValues(dataDir, repoPath) {
  return Object.assign({}, repoValues(dataDir, repoPath));
}

function setValues(dataDir, repoPath, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw Object.assign(new Error('Environment values must be an object.'), { status: 400 });
  }

  const map = repoValues(dataDir, repoPath);
  const keys = Object.keys(values);
  if (keys.length > MAX_ENTRIES) {
    throw Object.assign(new Error('Too many environment values were supplied.'), { status: 400 });
  }

  for (const name of keys) {
    if (!NAME_RE.test(name)) {
      throw Object.assign(new Error('Invalid environment variable name: ' + name), { status: 400 });
    }
    const value = values[name];
    if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) {
      throw Object.assign(new Error('Environment values must be text no longer than 16384 characters.'), { status: 400 });
    }
    map[name] = value;
  }

  if (Object.keys(map).length > MAX_ENTRIES) {
    throw Object.assign(new Error('The local CI environment store is full.'), { status: 400 });
  }

  const store = readStore(dataDir);
  store[repoKey(repoPath)] = map;
  writeStore(dataDir, store);
  return Object.keys(map).sort();
}

function deleteValue(dataDir, repoPath, name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    throw Object.assign(new Error('Invalid environment variable name.'), { status: 400 });
  }

  const store = readStore(dataDir);
  const key = repoKey(repoPath);
  const map = store[key] && typeof store[key] === 'object' && !Array.isArray(store[key]) ? store[key] : {};
  delete map[name];

  if (Object.keys(map).length) store[key] = map;
  else delete store[key];

  writeStore(dataDir, store);
  return Object.keys(map).sort();
}

module.exports = { getNames, getValues, setValues, deleteValue };