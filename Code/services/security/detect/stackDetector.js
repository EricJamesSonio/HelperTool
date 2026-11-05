'use strict';

const fs = require('fs');
const path = require('path');

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch (e) {
    return false;
  }
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function detectFrontend(repoPath, pkg) {
  const deps = Object.assign({}, pkg && pkg.dependencies, pkg && pkg.devDependencies);
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);

  let framework = 'unknown';
  let bundler = null;

  if (
    has('next') ||
    exists(path.join(repoPath, 'next.config.js')) ||
    exists(path.join(repoPath, 'next.config.mjs')) ||
    exists(path.join(repoPath, 'next.config.ts'))
  ) {
    framework = 'nextjs';
    bundler = 'next';
  } else if (has('nuxt') || has('nuxt3') || exists(path.join(repoPath, 'nuxt.config.js')) || exists(path.join(repoPath, 'nuxt.config.ts'))) {
    framework = 'nuxt';
  } else if (has('@sveltejs/kit') || exists(path.join(repoPath, 'svelte.config.js'))) {
    framework = 'sveltekit';
  } else if (has('svelte')) {
    framework = 'svelte';
  } else if (has('@angular/core') || exists(path.join(repoPath, 'angular.json'))) {
    framework = 'angular';
  } else if (has('vue')) {
    framework = 'vue';
  } else if (has('react') && has('react-dom')) {
    framework = 'react';
  } else if (exists(path.join(repoPath, 'composer.json'))) {
    const composer = readJson(path.join(repoPath, 'composer.json'));
    const req = composer && composer.require ? composer.require : {};
    if (Object.prototype.hasOwnProperty.call(req, 'laravel/framework')) framework = 'laravel';
  } else if (exists(path.join(repoPath, 'index.html'))) {
    framework = 'html';
  }

  if (!bundler) {
    if (exists(path.join(repoPath, 'vite.config.js')) || exists(path.join(repoPath, 'vite.config.ts'))) bundler = 'vite';
    else if (has('react-scripts')) bundler = 'cra';
    else if (has('webpack')) bundler = 'webpack';
  }

  const language = exists(path.join(repoPath, 'tsconfig.json')) ? 'ts' : 'js';
  const rendering =
    framework === 'nextjs' || framework === 'nuxt' || framework === 'sveltekit' || framework === 'laravel' ? 'ssr' : 'spa';

  return { framework, language, rendering, bundler };
}

function detectBackend(repoPath, pkg) {
  const deps = Object.assign({}, pkg && pkg.dependencies, pkg && pkg.devDependencies);
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);
  let framework = 'unknown';
  if (has('next')) framework = 'next-api';
  else if (has('express')) framework = 'express';
  else if (has('fastify')) framework = 'fastify';
  else if (has('koa')) framework = 'koa';
  else if (has('@nestjs/core')) framework = 'nestjs';
  else if (exists(path.join(repoPath, 'composer.json'))) framework = 'laravel';
  return { framework };
}

function packageManager(repoPath) {
  if (exists(path.join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(path.join(repoPath, 'yarn.lock'))) return 'yarn';
  if (exists(path.join(repoPath, 'package-lock.json'))) return 'npm';
  if (exists(path.join(repoPath, 'composer.lock'))) return 'composer';
  return null;
}

function detect(repoPath) {
  const pkg = readJson(path.join(repoPath, 'package.json'));
  return {
    frontend: detectFrontend(repoPath, pkg),
    backend: detectBackend(repoPath, pkg),
    packageManager: packageManager(repoPath),
    hasPackageJson: !!pkg,
  };
}

module.exports = { detect };