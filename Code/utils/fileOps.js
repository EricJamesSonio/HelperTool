const fs = require('fs');
const path = require('path');
const { isIgnored, getIgnoreRules } = require('./docignore');

/**
 * Recursively get folder tree structure for tree view
 */
async function getFolderTree(dir, ignoreRules = [], repoRoot) {
    if (!repoRoot) repoRoot = path.resolve(dir);
    if (!ignoreRules.length) ignoreRules = await getIgnoreRules(repoRoot);

    if (isIgnored(dir, repoRoot, ignoreRules)) return [];

    let entries;
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
 * Generate tree-style structure text respecting repo ignore rules
 * with progress updates
 */
async function generateStructure(selectedPaths, outputFile, ignoreRules = [], progressCallback = () => {}) {
    if (!selectedPaths || !selectedPaths.length) return;

    const repoRoot = path.resolve(selectedPaths[0]);
    if (!ignoreRules.length) ignoreRules = await getIgnoreRules(repoRoot);

    // Helper: build tree nodes recursively
    async function buildTree(currentPath) {
        if (isIgnored(currentPath, repoRoot, ignoreRules)) return null;

        let stat;
        try { stat = fs.statSync(currentPath); } catch { return null; }

        const node = {
            name: path.basename(currentPath),
            path: currentPath,
            type: stat.isDirectory() ? 'folder' : 'file',
            children: []
        };

        if (stat.isDirectory()) {
            const entries = fs.readdirSync(currentPath);
            for (const entry of entries) {
                const childNode = await buildTree(path.join(currentPath, entry));
                if (childNode) node.children.push(childNode);
            }
        }

        return node;
    }

    // Helper: convert tree node to text lines
    function treeLines(node, prefix = '', isLast = true, isRoot = true) {
        const lines = [];
        const connector = isRoot ? '' : (isLast ? '└─ ' : '├─ ');
        lines.push(prefix + connector + node.name + (node.type === 'folder' ? '/' : ''));

        if (node.children && node.children.length > 0) {
            node.children.forEach((child, idx) => {
                const last = idx === node.children.length - 1;
                const newPrefix = prefix + (isRoot ? '' : (isLast ? '    ' : '│   '));
                lines.push(...treeLines(child, newPrefix, last, false));
            });
        }

        return lines;
    }

    const allLines = [];
    for (let i = 0; i < selectedPaths.length; i++) {
        const p = selectedPaths[i];
        const rootNode = await buildTree(p);
        if (rootNode) allLines.push(...treeLines(rootNode));

        // Incremental progress per root path
        const percent = Math.round(((i + 1) / selectedPaths.length) * 100);
        progressCallback(percent);
    }

    // Write to file
    try {
        fs.writeFileSync(outputFile, allLines.join('\n'), 'utf-8');
        progressCallback(100); // ensure 100% at end
    } catch (err) {
        console.error('[generateStructure] Failed to write file:', err);
    }
}

module.exports = { getFolderTree, generateStructure };
