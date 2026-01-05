const fs = require('fs');
const path = require('path');
const { isIgnored, getIgnoreRules } = require('./docignore');

/**
 * Recursively collect files from folder respecting ignore rules
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
 * Generate combined code output
 * @param {string[]} selectedItems
 * @param {string} outputFile
 * @param {function(number):void} onProgress
 * @param {string} repoRoot
 * @param {string[]} ignoreRules
 */
async function generateCode(selectedItems, outputFile, onProgress = () => {}, repoRoot, ignoreRules = []) {
    if (!selectedItems.length) return;
    if (!repoRoot) repoRoot = path.dirname(selectedItems[0]);
    if (!ignoreRules.length) ignoreRules = await getIgnoreRules(repoRoot);

    let allFiles = [];
    for (const item of selectedItems) {
        const stat = fs.statSync(item);
        if (stat.isDirectory()) allFiles = allFiles.concat(getAllFiles(item, ignoreRules, repoRoot));
        else if (stat.isFile() && !isIgnored(item, repoRoot, ignoreRules)) allFiles.push(item);
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

module.exports = { generateCode };
