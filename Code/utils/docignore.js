const fs = require('fs');
const path = require('path');
const micromatch = require('micromatch');
const { app } = require('electron');

const globalIgnorePath = path.join(app.getPath('userData'), 'global-docignore.json');

/**
 * Get global ignore rules
 * @returns {string[]}
 */
function getGlobalIgnoreRules() {
    if (!fs.existsSync(globalIgnorePath)) return [];
    try {
        const data = fs.readFileSync(globalIgnorePath, 'utf-8');
        console.log('[Docignore] Global ignore rules loaded:', data);
        return JSON.parse(data);
    } catch (err) {
        console.error('[Docignore] Failed to read global ignore:', err);
        return [];
    }
}

/**
 * Get combined ignore rules for a repo (global + optional repo-specific)
 * @param {string} repoPath
 * @returns {Promise<string[]>}
 */
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

        const combinedRules = [...getGlobalIgnoreRules(), ...repoRules];
        console.log('[Docignore] Combined ignore rules for', repoPath, combinedRules);
        return combinedRules;
    } catch (err) {
        console.error('[Docignore] getIgnoreRules error:', err);
        return [];
    }
}

/**
 * Check if a file/folder is ignored
 * @param {string} fullPath
 * @param {string} repoPath
 * @param {string[]} extraRules Optional extra rules (repo-specific)
 */
function isIgnored(fullPath, repoPath, extraRules = []) {
    const relPath = path.relative(repoPath, fullPath).replace(/\\/g, '/');
    const rules = [...getGlobalIgnoreRules(), ...extraRules];
    const ignored = micromatch.isMatch(relPath, rules, { dot: true });
    // debug log
    if (ignored) console.log('[Docignore] Ignored:', relPath);
    return ignored;
}

module.exports = { isIgnored, getGlobalIgnoreRules, getIgnoreRules };
