const fs = require('fs');
const path = require('path');
const { isIgnored, getIgnoreRules } = require('./docignore');

/**
 * Minify a source file's text content.
 * - Removes all blank lines
 * - Removes full-line // comments
 * - Removes full-line # comments
 * - Removes full-line /* ... *\/ block comments
 * - Strips ALL leading and trailing whitespace from each line
 * - Joins everything with no separator (pure wall of code)
 */
function minifySource(src) {
    const lines = src.split('\n');
    const out = [];

    for (const raw of lines) {
        const line = raw.trim();

        // Skip blank lines
        if (line === '') continue;

        // Skip full-line // comments
        if (line.startsWith('//')) continue;

        // Skip full-line # comments
        if (line.startsWith('#')) continue;

        // Skip full-line /* ... */ block comments
        if (line.startsWith('/*') && line.endsWith('*/')) continue;

        // Skip full-line * ... (inside block comments)
        if (line.startsWith('*')) continue;

        out.push(line);
    }

    // Join with a single space so tokens don't merge (e.g. "return" + "{" stays readable)
    return out.join(' ');
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
 * @param {boolean}  [minify=false]
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

        // Always keep the file header so files stay identifiable
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