const fs = require('fs');
const path = require('path');
const { isIgnored } = require('./docignore');

/**
 * Get folder tree structure for tree view
 */
function getFolderTree(dir, ignoreRules = [], repoRoot = dir) {
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter(f => !isIgnored(path.join(dir, f.name), repoRoot, ignoreRules))
        .map(f => f.isDirectory()
            ? { 
                name: f.name, 
                path: path.join(dir, f.name), 
                type: 'folder', 
                children: getFolderTree(path.join(dir, f.name), ignoreRules, repoRoot) 
              }
            : { name: f.name, path: path.join(dir, f.name), type: 'file' }
        );
}

/**
 * Generate folder structure output (text)
 */
async function generateStructure(selectedPaths, outputFile, ignoreRules = [], progressCallback = () => {}) {
    const outputLines = [];
    const allItems = [];

    function collect(p, repoRoot, depth = 0) {
        if (isIgnored(p, repoRoot, ignoreRules)) return;
        allItems.push({ path: p, depth });
        if (fs.statSync(p).isDirectory()) {
            fs.readdirSync(p).forEach(c => collect(path.join(p, c), repoRoot, depth + 1));
        }
    }

    selectedPaths.forEach(p => collect(p, p));

    allItems.forEach((item, idx) => {
        const stat = fs.statSync(item.path);
        const prefix = '  '.repeat(item.depth);
        outputLines.push(`${prefix}${path.basename(item.path)}${stat.isDirectory() ? '/' : ''}`);
        progressCallback(Math.round(((idx + 1) / allItems.length) * 100));
    });

    fs.writeFileSync(outputFile, outputLines.join('\n'), 'utf-8');
}

module.exports = { getFolderTree, generateStructure };
