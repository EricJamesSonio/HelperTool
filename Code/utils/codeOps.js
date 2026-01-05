const fs = require('fs');
const path = require('path');
const { isIgnored, getIgnoreRules } = require('./docignore');

/**
 * Recursively collect all file paths from a folder, respecting ignore rules
 */
function getAllFiles(folderPath, ignoreRules = [], repoRoot) {
    let files = [];
    if (!fs.existsSync(folderPath)) return files;

    const items = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(folderPath, item.name);

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
 * Generate code file by combining multiple selected folders/files
 * @param {Array<string>} selectedItems - files or folders
 * @param {string} outputFile
 * @param {Function} onProgress - callback(percent)
 * @param {string} repoRoot - repo root path
 * @param {Array<string>} ignoreRules - optional ignore rules
 */
async function generateCode(selectedItems, outputFile, onProgress = () => {}, repoRoot, ignoreRules = []) {
    if (!selectedItems || selectedItems.length === 0) return;

    // Ensure repoRoot is set
    if (!repoRoot) repoRoot = path.dirname(selectedItems[0]);

    // Load ignore rules if not provided
    if (!ignoreRules.length) ignoreRules = await getIgnoreRules(repoRoot);

    // Collect all files from all selected items
    let allFiles = [];
    for (const item of selectedItems) {
        const stat = fs.statSync(item);
        if (stat.isDirectory()) {
            allFiles = allFiles.concat(getAllFiles(item, ignoreRules, repoRoot));
        } else if (stat.isFile()) {
            if (!isIgnored(item, repoRoot, ignoreRules)) allFiles.push(item);
        }
    }

    if (allFiles.length === 0) return;

    // Write combined output
    const writeStream = fs.createWriteStream(outputFile, { flags: 'w', encoding: 'utf-8' });
    for (let i = 0; i < allFiles.length; i++) {
        const filePath = allFiles[i];
        const content = fs.readFileSync(filePath, 'utf-8');

        writeStream.write(`\n// ===== File: ${path.relative(repoRoot, filePath)} =====\n`);
        writeStream.write(content + '\n');

        const percent = Math.round(((i + 1) / allFiles.length) * 100);
        onProgress(percent);
    }

    writeStream.close();
}

module.exports = {
    generateCode
};
