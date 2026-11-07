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

const LIB_SIGNALS = [
  ['next-auth', 'next-auth'],
  ['@auth/core', 'auth.js'],
  ['better-auth', 'better-auth'],
  ['lucia', 'lucia'],
  ['passport', 'passport'],
  ['express-session', 'express-session'],
  ['cookie-session', 'cookie-session'],
  ['jsonwebtoken', 'jsonwebtoken'],
  ['jose', 'jose'],
  ['@clerk/nextjs', 'clerk'],
  ['@clerk/clerk-react', 'clerk'],
  ['@auth0/nextjs-auth0', 'auth0'],
  ['@auth0/auth0-react', 'auth0'],
  ['@supabase/auth-helpers-nextjs', 'supabase-auth'],
  ['@supabase/supabase-js', 'supabase-auth'],
  ['firebase', 'firebase-auth'],
  ['firebase-admin', 'firebase-auth'],
];

function detect(repoPath) {
  const pkg = readJson(path.join(repoPath, 'package.json'));
  const deps = Object.assign({}, pkg && pkg.dependencies, pkg && pkg.devDependencies);
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);

  let library = null;
  for (const [dep, lib] of LIB_SIGNALS) {
    if (has(dep)) {
      library = lib;
      break;
    }
  }

  let hashing = null;
  if (has('bcrypt') || has('bcryptjs')) hashing = 'bcrypt';
  else if (has('argon2')) hashing = 'argon2';

  const composer = readJson(path.join(repoPath, 'composer.json'));
  if (!library && composer && composer.require) {
    if (Object.prototype.hasOwnProperty.call(composer.require, 'laravel/sanctum')) library = 'laravel-sanctum';
    else if (Object.prototype.hasOwnProperty.call(composer.require, 'laravel/passport')) library = 'laravel-passport';
    else if (Object.prototype.hasOwnProperty.call(composer.require, 'laravel/breeze')) library = 'laravel-breeze';
    else if (Object.prototype.hasOwnProperty.call(composer.require, 'laravel/jetstream')) library = 'laravel-jetstream';
  }

  const env = readEnv(repoPath);
  const authEnvKeys = env.keysPresent.filter((k) => /^(JWT_SECRET|NEXTAUTH_SECRET|SESSION_SECRET|AUTH_SECRET|CLERK_|AUTH0_)/.test(k));

  let mechanism = 'none-found';
  if (library === 'next-auth' || library === 'auth.js') mechanism = 'session-or-jwt-cookie';
  else if (library === 'clerk' || library === 'auth0' || library === 'supabase-auth' || library === 'firebase-auth') mechanism = 'third-party-provider';
  else if (has('jsonwebtoken') || has('jose')) mechanism = 'jwt';
  else if (has('express-session') || has('cookie-session') || library === 'passport') mechanism = 'session-cookie';
  else if (authEnvKeys.length) mechanism = 'jwt';

  return { mechanism, library, hashing, envKeysPresent: authEnvKeys };
}

module.exports = { detect };