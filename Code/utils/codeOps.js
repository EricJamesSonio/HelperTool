const fs = require('fs');
const path = require('path');
const { isIgnored, getIgnoreRules } = require('./docignore');

/**
 * Minify a source file's text content.
 * Strategy: strip blank lines, line comments, collapse leading whitespace.
 * Keeps string literals intact (no full AST parse — fast & safe for output readability).
 */
function minifySource(src) {
    const lines = src.split('\n');
    const out = [];

    for (let raw of lines) {
        // Collapse all leading whitespace to a single space (preserves indentation signal
        // without eating blank-line budget) then trim trailing space
        let line = raw.replace(/^\s+/, ' ').trimEnd();

        // Skip blank / whitespace-only lines
        if (line.trim() === '') continue;

        // Strip full-line // comments (won't touch URLs inside strings — good enough)
        if (/^\s*\/\//.test(line)) continue;

        // Strip full-line # comments (Python / shell / yaml style)
        if (/^\s*#/.test(line)) continue;

        // Strip full-line /* … */ single-line block comments
        if (/^\s*\/\*.*\*\/\s*$/.test(line)) continue;

        out.push(line);
    }

    return out.join('\n');
}

/**
 * Recursively collect files from folder respecting ignore rules
 */
function getAllFiles(folderPath, repoRoot) {
    if (isIgnored(folderPath, repoRoot)) return [];
    if (!fs.existsSync(folderPath)) return [];

    const items = fs.readdirSync(folderPath, { withFileTypes: true });
    let files = [];

    for (const item of items) {
        const fullPath = path.join(folderPath, item.name);
        if (isIgnored(fullPath, repoRoot)) continue;
        if (item.isDirectory()) files.push(...getAllFiles(fullPath, repoRoot));
        else files.push(fullPath);
    }

    return files;
}

/**
 * Find repo root starting from a folder (optional fallback)
 */
function findRepoRoot(startPath) {
    let dir = path.resolve(startPath);
    while (dir && dir !== path.parse(dir).root) {
        if (fs.existsSync(path.join(dir, '.docignore')) || fs.existsSync(path.join(dir, 'package.json'))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    return startPath;
}

/**
 * Generate combined code output from selected items.
 * @param {string[]} selectedItems
 * @param {string}   outputFile
 * @param {Function} onProgress
 * @param {string}   [repoRoot]
 * @param {string[]} [ignoreRules]
 * @param {boolean}  [minify=false]  — when true, strips blanks/comments per file
 */
async function generateCode(selectedItems, outputFile, onProgress = () => {}, repoRoot, ignoreRules, minify = false) {
    if (!selectedItems.length) return;

    const root = repoRoot || path.resolve(selectedItems[0]);
    await getIgnoreRules(root);

    let allFiles = [];
    for (const item of selectedItems) {
        const stat = fs.statSync(item);
        if (stat.isDirectory()) allFiles.push(...getAllFiles(item, root));
        else if (!isIgnored(item, root)) allFiles.push(item);
    }

    if (!allFiles.length) return;

    const writeStream = fs.createWriteStream(outputFile, { flags: 'w', encoding: 'utf-8' });

    for (let i = 0; i < allFiles.length; i++) {
        const filePath = allFiles[i];
        const relativeName = path.relative(root, filePath) || path.basename(filePath);

        // Header separator — keep it even in minified mode so files stay identifiable
        writeStream.write(`\n// ===== File: ${relativeName} =====\n`);

        const raw = fs.readFileSync(filePath, 'utf-8');
        const content = minify ? minifySource(raw) : raw;
        writeStream.write(content + '\n');

        onProgress(Math.round(((i + 1) / allFiles.length) * 100));
    }

    writeStream.close();
}

/**
 * Get folder tree structure for tree view respecting ignore rules
 */
async function getFolderTree(dir, repoRoot = null) {
    if (!repoRoot) repoRoot = path.resolve(dir);
    await getIgnoreRules(repoRoot);

    if (isIgnored(dir, repoRoot)) return [];

    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }

    const validEntries = entries.filter(entry =>
        !isIgnored(path.join(dir, entry.name), repoRoot)
    );

    const results = await Promise.all(
        validEntries.map(async (entry) => {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                const children = await getFolderTree(fullPath, repoRoot);
                return {
                    name: entry.name,
                    path: fullPath,
                    type: 'folder',
                    children,
                };
            }

            return { name: entry.name, path: fullPath, type: 'file' };
        })
    );

    return results;
}

module.exports = { generateCode, getAllFiles, findRepoRoot, getFolderTree };