const fs = require('fs');
const path = require('path');
const { isIgnored, getIgnoreRules } = require('./docignore');

// ----------------------------
// Find common ancestor of multiple paths
// ----------------------------
function getCommonAncestor(paths) {
    if (!paths || paths.length === 0) return '';
    if (paths.length === 1) return path.resolve(path.dirname(paths[0]));

    // Resolve and split each path into parts
    const splitPaths = paths.map(p => path.resolve(p).split(path.sep));

    // Use first path as reference and walk down until parts diverge
    const [first, ...rest] = splitPaths;
    let commonParts = first;

    for (const parts of rest) {
        const len = Math.min(commonParts.length, parts.length);
        let i = 0;
        while (i < len && commonParts[i] === parts[i]) i++;
        commonParts = commonParts.slice(0, i);
    }

    return commonParts.join(path.sep) || path.sep;
}

async function getFolderTree(dir, repoRoot) {
    if (!repoRoot) repoRoot = path.resolve(dir);

    if (isIgnored(dir, repoRoot)) return [];

    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }

    const tree = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (isIgnored(fullPath, repoRoot)) continue;

        if (entry.isDirectory()) {
            tree.push({
                name: entry.name,
                path: fullPath,
                type: 'folder',
                children: await getFolderTree(fullPath, repoRoot),
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

async function generateStructure(selectedPaths, outputFile, progressCallback = () => {}, promptText = '') {

    if (!selectedPaths?.length) return;

    // FIX: derive the true repo root as the common ancestor of ALL selected paths
    // This ensures isIgnored() works correctly when multiple sibling folders are selected
    const repoRoot = getCommonAncestor(selectedPaths);
    await getIgnoreRules(repoRoot);

    async function buildTree(currentPath) {
        if (isIgnored(currentPath, repoRoot)) return null;

        let stat;
        try { stat = fs.statSync(currentPath); } catch { return null; }

        const node = {
            name: path.basename(currentPath),
            path: currentPath,
            type: stat.isDirectory() ? 'folder' : 'file',
            children: []
        };

        if (stat.isDirectory()) {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                const childNode = await buildTree(path.join(currentPath, entry.name));
                if (childNode) node.children.push(childNode);
            }
        }

        return node;
    }

    function treeLines(node, prefix = '', isLast = true, isRoot = true) {
        const lines = [];
        const connector = isRoot ? '' : (isLast ? '└─ ' : '├─ ');
        lines.push(prefix + connector + node.name + (node.type === 'folder' ? '/' : ''));

        node.children?.forEach((child, idx) => {
            const last = idx === node.children.length - 1;
            const newPrefix = prefix + (isRoot ? '' : (isLast ? '    ' : '│   '));
            lines.push(...treeLines(child, newPrefix, last, false));
        });

        return lines;
    }

    const allLines = [];

    const promptBlock = (promptText || '').trim() ? `\n/* ===== Prompt ===== */\n${promptText.trim()}\n/* =================== */\n\n` : '';
    if (promptBlock) allLines.push(...promptBlock.split('\n'));

    for (let i = 0; i < selectedPaths.length; i++) {

        const rootNode = await buildTree(selectedPaths[i]);
        if (rootNode) allLines.push(...treeLines(rootNode));

        const percent = Math.round(((i + 1) / selectedPaths.length) * 100);
        progressCallback(percent);
    }

    try {
        fs.writeFileSync(outputFile, allLines.join('\n'), 'utf-8');
        progressCallback(100);
    } catch (err) {
        console.error('[generateStructure] Failed to write file:', err);
    }
}

module.exports = { getFolderTree, generateStructure };