const fs = require('fs');
const path = require('path');
const { isIgnored } = require('./docignore');

/**
 * Get folder tree structure for tree view
 */
function getFolderTree(dir, ignoreRules = [], repoRoot) {
    if (!repoRoot) repoRoot = dir;

    if (isIgnored(dir, repoRoot, ignoreRules)) return [];

    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        return [];
    }

    return entries
        .filter(entry => {
            const fullPath = path.join(dir, entry.name);
            return !isIgnored(fullPath, repoRoot, ignoreRules);
        })
        .map(entry => {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                return {
                    name: entry.name,
                    path: fullPath,
                    type: 'folder',
                    children: getFolderTree(fullPath, ignoreRules, repoRoot),
                };
            }

            return {
                name: entry.name,
                path: fullPath,
                type: 'file',
            };
        });
}

/**
 * Generate folder structure output (text)
 */
async function generateStructure(selectedPaths, outputFile, ignoreRules = [], progressCallback = () => {}) {
    if (!selectedPaths || !selectedPaths.length) return;

    const repoRoot = selectedPaths[0]; // top-level repo root

    const outputLines = [];
    const allItems = [];

    function collect(currentPath, depth = 0) {
        if (isIgnored(currentPath, repoRoot, ignoreRules)) return;

        let stat;
        try {
            stat = fs.statSync(currentPath);
        } catch {
            return;
        }

        allItems.push({ path: currentPath, depth });

        if (stat.isDirectory()) {
            let children = [];
            try {
                children = fs.readdirSync(currentPath);
            } catch {
                return;
            }

            children.forEach(child => collect(path.join(currentPath, child), depth + 1));
        }
    }

    selectedPaths.forEach(p => collect(p, 0));

    allItems.forEach((item, idx) => {
        const stat = fs.statSync(item.path);
        const prefix = '  '.repeat(item.depth);
        outputLines.push(`${prefix}${path.basename(item.path)}${stat.isDirectory() ? '/' : ''}`);

        progressCallback(Math.round(((idx + 1) / allItems.length) * 100));
    });

    fs.writeFileSync(outputFile, outputLines.join('\n'), 'utf-8');
}

module.exports = { getFolderTree, generateStructure };
