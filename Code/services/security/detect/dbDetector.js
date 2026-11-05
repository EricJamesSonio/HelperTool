'use strict';

const fs = require('fs');
const path = require('path');
const { readEnv } = require('./envReader');

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
}

const SCHEME_DIALECT = {
  postgres: 'postgres',
  postgresql: 'postgres',
  pg: 'postgres',
  mysql: 'mysql',
  mysql2: 'mysql',
  mariadb: 'mysql',
  mongodb: 'mongodb',
  'mongodb+srv': 'mongodb',
  sqlite: 'sqlite',
  file: 'sqlite',
  redis: 'redis',
  rediss: 'redis',
};

function detect(repoPath) {
  const pkg = readJson(path.join(repoPath, 'package.json'));
  const deps = Object.assign({}, pkg && pkg.dependencies, pkg && pkg.devDependencies);
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);

  let dialect = 'unknown';
  let layer = 'unknown';
  const files = [];

  const prismaSchema = readText(path.join(repoPath, 'prisma', 'schema.prisma'));
  if (prismaSchema) {
    files.push('prisma/schema.prisma');
    layer = 'prisma';
    const m = /provider\s*=\s*"([a-z0-9_-]+)"/i.exec(prismaSchema);
    if (m) dialect = SCHEME_DIALECT[m[1].toLowerCase()] || m[1].toLowerCase();
  }

  if (dialect === 'unknown') {
    if (has('mongoose')) {
      dialect = 'mongodb';
      layer = 'mongoose';
    } else if (has('mongodb')) {
      dialect = 'mongodb';
      layer = 'driver';
    } else if (has('pg')) {
      dialect = 'postgres';
      layer = 'driver';
    } else if (has('mysql2') || has('mysql')) {
      dialect = 'mysql';
      layer = 'driver';
    } else if (has('better-sqlite3') || has('sqlite3') || has('sql.js')) {
      dialect = 'sqlite';
      layer = 'driver';
    } else if (has('@supabase/supabase-js')) {
      dialect = 'supabase';
      layer = 'driver';
    } else if (has('firebase-admin') || has('firebase')) {
      dialect = 'firebase';
      layer = 'driver';
    } else if (has('redis') || has('ioredis')) {
      dialect = 'redis';
      layer = 'driver';
    }
  }

  if (layer === 'unknown') {
    if (has('knex')) layer = 'knex';
    else if (has('sequelize')) layer = 'sequelize';
    else if (has('typeorm')) layer = 'typeorm';
    else if (has('drizzle-orm')) layer = 'drizzle';
  }

  const env = readEnv(repoPath);
  if (dialect === 'unknown') {
    for (const key of Object.keys(env.schemes)) {
      const scheme = env.schemes[key];
      if (SCHEME_DIALECT[scheme]) {
        dialect = SCHEME_DIALECT[scheme];
        break;
      }
    }
  }
  if (dialect === 'unknown' && env.keysPresent.some((k) => /^MONGO/.test(k))) dialect = 'mongodb';
  if (dialect === 'unknown' && env.keysPresent.some((k) => /^SUPABASE_/.test(k))) dialect = 'supabase';
  if (dialect === 'unknown' && env.keysPresent.some((k) => /^FIREBASE_/.test(k))) dialect = 'firebase';

  return {
    dialect,
    layer,
    files,
    envKeysPresent: env.keysPresent.filter((k) => /DB|DATABASE|MONGO|SUPABASE|FIREBASE|REDIS/i.test(k)),
  };
}

module.exports = { detect };