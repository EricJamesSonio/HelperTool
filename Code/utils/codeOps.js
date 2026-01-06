// file: codeOps.js
const fs = require('fs');
const path = require('path');
const { isIgnored, getIgnoreRules } = require('./docignore');

/**
 * Recursively collect files from folder respecting ignore rules
 * @param {string} folderPath
 * @param {string[]} ignoreRules
 * @param {string} repoRoot
 */
function getAllFiles(folderPath, ignoreRules = [], repoRoot) {
    let files = [];
    if (!fs.existsSync(folderPath)) return files;

    const items = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(folderPath, item.name);

        // Skip ignored files/folders
        if (isIgnored(fullPath, repoRoot, ignoreRules)) continue;

        if (item.isDirectory()) {
            files = files.concat(getAllFiles(fullPath, ignoreRules, repoRoot));
        } else if (item.isFile()) {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * Find repo root starting from a folder (optional fallback)
 * @param {string} startPath
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
 * @param {string[]} selectedItems - user-selected files/folders
 * @param {string} outputFile - output file path
 * @param {function(number):void} onProgress - optional progress callback
 */
async function generateCode(selectedItems, outputFile, onProgress = () => {}) {
    if (!selectedItems.length) return;

    // Use the folder the user selected as repo root
    const repoRoot = path.resolve(selectedItems[0]);

    // Load ignore rules from the target repo only
    const ignoreRules = await getIgnoreRules(repoRoot);

    let allFiles = [];
    for (const item of selectedItems) {
        const stat = fs.statSync(item);
        if (stat.isDirectory()) {
            allFiles = allFiles.concat(getAllFiles(item, ignoreRules, repoRoot));
        } else if (stat.isFile() && !isIgnored(item, repoRoot, ignoreRules)) {
            allFiles.push(item);
        }
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
 * @param {string} dir
 * @param {string[]} ignoreRules
 * @param {string} repoRoot
 */
function getFolderTree(dir, ignoreRules = [], repoRoot) {
    if (!repoRoot) repoRoot = path.resolve(dir);

    if (isIgnored(dir, repoRoot, ignoreRules)) return [];

    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
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
            return { name: entry.name, path: fullPath, type: 'file' };
        });
}

module.exports = { generateCode, getAllFiles, findRepoRoot, getFolderTree };
