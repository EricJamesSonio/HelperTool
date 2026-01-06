// file: fileOps.js
const fs = require('fs');
const path = require('path');
const { isIgnored, getIgnoreRules } = require('./docignore');

/**
 * Get folder tree structure for tree view
 * @param {string} dir - starting directory
 * @param {string[]} ignoreRules - optional ignore rules
 * @param {string} repoRoot - repo root path
 */
async function getFolderTree(dir, ignoreRules = [], repoRoot) {
    if (!repoRoot) repoRoot = path.resolve(dir);
    if (!ignoreRules.length) ignoreRules = await getIgnoreRules(repoRoot);

    if (isIgnored(dir, repoRoot, ignoreRules)) return [];

    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        return [];
    }

    const tree = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (isIgnored(fullPath, repoRoot, ignoreRules)) continue;

        if (entry.isDirectory()) {
            tree.push({
                name: entry.name,
                path: fullPath,
                type: 'folder',
                children: await getFolderTree(fullPath, ignoreRules, repoRoot),
            });
        } else {
            tree.push({
                name: entry.name,
                path: fullPath,
                type: 'file',
            });
        }
    }

    return tree;
}

/**
 * Generate folder structure output (text) respecting repo ignore rules
 * @param {string[]} selectedPaths - folders/files selected by user
 * @param {string} outputFile - path to write structure text
 * @param {function(number):void} progressCallback - optional progress update
 */
async function generateStructure(selectedPaths, outputFile, progressCallback = () => {}) {
    if (!selectedPaths || !selectedPaths.length) return;

    // Use the first selected path as repo root
    const repoRoot = path.resolve(selectedPaths[0]);

    // Load ignore rules for this repo
    const ignoreRules = await getIgnoreRules(repoRoot);

    const outputLines = [];
    const allItems = [];

function collect(currentPath, depth = 0) {
    if (isIgnored(currentPath, repoRoot, ignoreRules)) return;

    let stat;
    try { stat = fs.statSync(currentPath); } catch { return; }

    if (stat.isFile() || (stat.isDirectory() && fs.readdirSync(currentPath).length > 0)) {
        allItems.push({ path: currentPath, depth });
    }

    if (stat.isDirectory()) {
        const children = fs.readdirSync(currentPath);
        for (const child of children) {
            collect(path.join(currentPath, child), depth + 1);
        }
    }
}


    selectedPaths.forEach(p => collect(p, 0));

    // Build output lines for folder structure
    allItems.forEach((item, idx) => {
        const stat = fs.statSync(item.path);
        const prefix = '  '.repeat(item.depth);
        outputLines.push(`${prefix}${path.basename(item.path)}${stat.isDirectory() ? '/' : ''}`);

        progressCallback(Math.round(((idx + 1) / allItems.length) * 100));
    });

    fs.writeFileSync(outputFile, outputLines.join('\n'), 'utf-8');
}

module.exports = { getFolderTree, generateStructure };
