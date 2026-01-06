const fs = require('fs');
const path = require('path');
const micromatch = require('micromatch');
const { app } = require('electron');

const globalIgnorePath = path.join(app.getPath('userData'), 'global-docignore.json');

// ----------------------------
// Cached Global Rules
// ----------------------------
let cachedGlobalRules = null;

function loadGlobalIgnoreRules() {
    if (cachedGlobalRules) return cachedGlobalRules;

    if (!fs.existsSync(globalIgnorePath)) {
        cachedGlobalRules = [];
        return cachedGlobalRules;
    }

    try {
        const data = fs.readFileSync(globalIgnorePath, 'utf-8');
        cachedGlobalRules = JSON.parse(data);
        console.log('[Docignore] Global ignore rules loaded:', cachedGlobalRules);
        return cachedGlobalRules;
    } catch (err) {
        console.error('[Docignore] Failed to read global ignore:', err);
        cachedGlobalRules = [];
        return cachedGlobalRules;
    }
}

// ----------------------------
// Repo-specific + combined rules
// ----------------------------
async function getIgnoreRules(repoPath) {
    try {
        let repoRules = [];
        const repoIgnoreFile = path.join(repoPath, '.docignore');

        if (fs.existsSync(repoIgnoreFile)) {
            const data = fs.readFileSync(repoIgnoreFile, 'utf-8');
            try {
                repoRules = JSON.parse(data);
            } catch (err) {
                console.warn('[Docignore] Failed to parse repo .docignore, skipping:', err.message);
            }
        }

        // ----------------------------
        // Default hardcoded rules
        // ----------------------------
        const defaultRules = [
            'node_modules/**',
            '.git/**',
            '.DS_Store',
            'dist/**',
            'build/**'
        ];

        // Combine defaults + global + repo rules
        const combinedRules = [...defaultRules, ...loadGlobalIgnoreRules(), ...repoRules];
        console.log('[Docignore] Combined ignore rules for', repoPath, combinedRules);
        return combinedRules;
    } catch (err) {
        console.error('[Docignore] getIgnoreRules error:', err);
        return [];
    }
}

// ----------------------------
// Check if path is ignored
// ----------------------------
function isIgnored(fullPath, repoPath, rules = []) {
    if (!repoPath) return false;

    let relPath = path.relative(repoPath, fullPath);

    // Normalize for Windows + micromatch
    relPath = relPath.replace(/\\/g, '/');

    // Ignore anything outside the repo
    if (relPath.startsWith('..')) return false;

    // Check against rules
    const ignored = micromatch.isMatch(relPath, rules, { dot: true });

    isIgnored.loggedFiles = isIgnored.loggedFiles || new Set();
    if (ignored && !isIgnored.loggedFiles.has(relPath)) {
        console.log('[Docignore] Ignored:', relPath);
        isIgnored.loggedFiles.add(relPath);
    }

    return ignored;
}

module.exports = { isIgnored, loadGlobalIgnoreRules, getIgnoreRules };
