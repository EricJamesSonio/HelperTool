const fs = require('fs');
const path = require('path');
const micromatch = require('micromatch'); // npm install micromatch

/**
 * Read .docignore file from repo
 * @param {string} repoPath - path to the repo
 * @returns {Promise<string[]>} - array of patterns to ignore
 */
async function getIgnoreRules(repoPath) {
    const cfg = path.join(repoPath, '.docignore');
    if (!fs.existsSync(cfg)) return [];
    return fs.readFileSync(cfg, 'utf-8')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
}


/**
 * Check if a given file/folder path should be ignored
 * @param {string} fullPath - absolute path of file/folder
 * @param {string} repoPath - root repo path
 * @param {Array<string>} ignoreRules - array of patterns from getIgnoreRules
 * @returns {boolean}
 */
function isIgnored(fullPath, repoPath, ignoreRules) {
    const relPath = path.relative(repoPath, fullPath).replace(/\\/g, '/');
    return micromatch.isMatch(relPath, ignoreRules, { dot: true });
}
module.exports = { getIgnoreRules, isIgnored };
