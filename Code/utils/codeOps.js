// file: codeOps.js
const fs = require('fs');
const path = require('path');
const { isIgnored, getIgnoreRules } = require('./docignore');

/**
 * Recursively collect files from folder respecting ignore rules
 * Skips entire ignored folders
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
    return startPath; // fallback to the folder itself
}

/**
 * Generate combined code output from selected items
 */
async function generateCode(selectedItems, outputFile, onProgress = () => {}) {
    if (!selectedItems.length) return;

    const repoRoot = path.resolve(selectedItems[0]);
    await getIgnoreRules(repoRoot); // load & cache rules

    let allFiles = [];
    for (const item of selectedItems) {
        const stat = fs.statSync(item);
        if (stat.isDirectory()) allFiles.push(...getAllFiles(item, repoRoot));
        else if (!isIgnored(item, repoRoot)) allFiles.push(item);
    }

    if (!allFiles.length) return;

    const writeStream = fs.createWriteStream(outputFile, { flags: 'w', encoding: 'utf-8' });
    for (let i = 0; i < allFiles.length; i++) {
        const filePath = allFiles[i];
        writeStream.write(`\n// ===== File: ${path.relative(repoRoot, filePath)} =====\n`);
        writeStream.write(fs.readFileSync(filePath, 'utf-8') + '\n');
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

    return entries
        .filter(entry => !isIgnored(path.join(dir, entry.name), repoRoot))
        .map(entry => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                return {
                    name: entry.name,
                    path: fullPath,
                    type: 'folder',
                    children: getFolderTree(fullPath, repoRoot),
                };
            }
            return { name: entry.name, path: fullPath, type: 'file' };
        });
}

module.exports = { generateCode, getAllFiles, findRepoRoot, getFolderTree };
