const fs = require('fs');
const path = require('path');
const micromatch = require('micromatch'); // npm install micromatch

/**
 * Read .docignore from repo
 * @param {string} repoPath
 * @returns {Promise<string[]>} patterns
 */
async function getIgnoreRules(repoPath) {
    const cfgPath = path.join(repoPath, '.docignore');
    if (!fs.existsSync(cfgPath)) return [];
    return fs.readFileSync(cfgPath, 'utf-8')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
}

/**
 * Check if a path is ignored
 * @param {string} fullPath
 * @param {string} repoPath
 * @param {string[]} ignoreRules
 * @returns {boolean}
 */
function isIgnored(fullPath, repoPath, ignoreRules) {
    const relPath = path.relative(repoPath, fullPath).replace(/\\/g, '/');
    return micromatch.isMatch(relPath, ignoreRules, { dot: true });
}

module.exports = { getIgnoreRules, isIgnored };
