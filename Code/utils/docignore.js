// file: docignore.js
const fs = require('fs');
const path = require('path');
const micromatch = require('micromatch');
const { app, dialog, shell } = require('electron');

const globalIgnorePath = path.join(app.getPath('userData'), 'global-docignore.json');

// ----------------------------
// Cached Global Rules
// ----------------------------
let cachedGlobalRules = null;
const repoRulesCache = new Map();
const compiledMatchersCache = new Map();
const _CACHE_MAX = 20;

function _lruSet(cache, key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > _CACHE_MAX) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

function loadGlobalIgnoreRules(force) {
    if (cachedGlobalRules && !force) return cachedGlobalRules;

    if (!fs.existsSync(globalIgnorePath)) {
        cachedGlobalRules = [];
        return cachedGlobalRules;
    }

    try {
        cachedGlobalRules = JSON.parse(fs.readFileSync(globalIgnorePath, 'utf-8'));
        console.log('[Docignore] Global ignore rules loaded:', cachedGlobalRules);
        return cachedGlobalRules;
    } catch (err) {
        console.error('[Docignore] Failed to read global ignore:', err);
        const btn = dialog.showMessageBoxSync({
            type: 'error',
            title: 'Invalid Global Docignore',
            message: `The global docignore file has invalid JSON:\n\n${err.message}\n\nOpen the file to fix it?`,
            buttons: ['Open File', 'Exit App'],
            defaultId: 0,
            cancelId: 1,
        });
        if (btn === 0) {
            shell.openPath(globalIgnorePath);
        } else {
            app.quit();
        }
        cachedGlobalRules = [];
        return cachedGlobalRules;
    }
}

// ----------------------------
// Repo-specific + combined rules (cached)
// ----------------------------
async function getIgnoreRules(repoPath) {
    if (repoRulesCache.has(repoPath)) return repoRulesCache.get(repoPath);

    let repoRules = [];
    const repoIgnoreFile = path.join(repoPath, '.docignore');

    if (fs.existsSync(repoIgnoreFile)) {
        try {
            repoRules = JSON.parse(fs.readFileSync(repoIgnoreFile, 'utf-8'));
        } catch (err) {
            console.warn('[Docignore] Failed to parse repo .docignore:', err.message);
        }
    }

    const combinedRules = [...loadGlobalIgnoreRules(), ...repoRules];
    _lruSet(repoRulesCache, repoPath, combinedRules);

    // Precompile matchers for this repo
    const matchers = combinedRules.map(pattern => micromatch.matcher(pattern, { dot: true }));
    _lruSet(compiledMatchersCache, repoPath, matchers);

    return combinedRules;
}

// ----------------------------
// Check if path is ignored
// ----------------------------
function isIgnored(fullPath, repoPath) {
    if (!repoPath) return false;

    let relPath = path.relative(repoPath, fullPath).replace(/\\/g, '/');
    if (relPath.startsWith('..')) return false;

    const matchers = compiledMatchersCache.get(repoPath) || [];
    return matchers.some(fn => fn(relPath));
}


function clearCache(repoPath) {
    cachedGlobalRules = null;
    if (repoPath) {
        repoRulesCache.delete(repoPath);
        compiledMatchersCache.delete(repoPath);
    } else {
        repoRulesCache.clear();
        compiledMatchersCache.clear();
    }
}

module.exports = { isIgnored, loadGlobalIgnoreRules, getIgnoreRules, clearCache };
