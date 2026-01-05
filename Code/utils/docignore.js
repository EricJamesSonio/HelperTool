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

    const content = fs.readFileSync(cfg, 'utf-8');
    const lines = content.split(/\r?\n/).map(line => line.trim());

    // Remove empty lines and comments
    const rules = lines.filter(line => line && !line.startsWith('#'));

    return rules;
}

/**
 * Check if a given file/folder path should be ignored
 * @param {string} fullPath - absolute path of file/folder
 * @param {string} repoPath - root repo path
 * @param {Array<string>} ignoreRules - array of patterns from getIgnoreRules
 * @returns {boolean}
 */
function isIgnored(fullPath, repoPath, ignoreRules) {
    // Relative path from repo root
    const relPath = path.relative(repoPath, fullPath).replace(/\\/g, '/');

    // Match against patterns using micromatch
    return micromatch.isMatch(relPath, ignoreRules, { dot: true });
}

module.exports = {
    getIgnoreRules,
    isIgnored
};
