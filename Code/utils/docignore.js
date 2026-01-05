const fs = require('fs');
const path = require('path');

/**
 * Read .docignore file from repo
 * @param {string} repoPath - path to the repo
 * @returns {Promise<string[]>} - array of folder/file names to ignore
 */
async function getIgnoreRules(repoPath) {
    const cfg = path.join(repoPath, '.docignore');
    if (!fs.existsSync(cfg)) return [];

    const content = fs.readFileSync(cfg, 'utf-8');
    const lines = content.split(/\r?\n/).map(line => line.trim());
    
    // Remove empty lines and comments (starting with #)
    const rules = lines.filter(line => line && !line.startsWith('#'));

    return rules;
}

module.exports = {
    getIgnoreRules
};
