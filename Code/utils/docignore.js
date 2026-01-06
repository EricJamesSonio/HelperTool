// file: docignore.js
const fs = require('fs');
const path = require('path');
const micromatch = require('micromatch');
const { app } = require('electron');

const globalIgnorePath = path.join(app.getPath('userData'), 'global-docignore.json');

// ----------------------------
// Cached Global Rules
// ----------------------------
let cachedGlobalRules = null;
const repoRulesCache = new Map();        // repo path -> combined rules
const compiledMatchersCache = new Map(); // repo path -> compiled matcher functions

function loadGlobalIgnoreRules() {
    if (cachedGlobalRules) return cachedGlobalRules;

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
    repoRulesCache.set(repoPath, combinedRules);

    // Precompile matchers for this repo
    const matchers = combinedRules.map(pattern => micromatch.matcher(pattern, { dot: true }));
    compiledMatchersCache.set(repoPath, matchers);

    return combinedRules;
}

// ----------------------------
// Check if path is ignored
// ----------------------------
function isIgnored(fullPath, repoPath) {
    if (!repoPath) return false;

    let relPath = path.relative(repoPath, fullPath).replace(/\\/g, '/');

    // Ignore anything outside the repo
    if (relPath.startsWith('..')) return false;

    const matchers = compiledMatchersCache.get(repoPath) || [];
    return matchers.some(fn => fn(relPath));
}

module.exports = { isIgnored, loadGlobalIgnoreRules, getIgnoreRules };
