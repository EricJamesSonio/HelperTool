const fs = require('fs');
const path = require('path');

/**
 * Recursively collect all file paths from a folder
 * @param {string} folderPath 
 * @param {Array<string>} ignoreRules - optional names to ignore
 * @returns {Array<string>} list of file paths
 */
function getAllFiles(folderPath, ignoreRules = []) {
    let files = [];
    if (!fs.existsSync(folderPath)) return files;

    const items = fs.readdirSync(folderPath);
    for (const item of items) {
        if (ignoreRules.includes(item)) continue; // skip ignored files/folders
        const fullPath = path.join(folderPath, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            files = files.concat(getAllFiles(fullPath, ignoreRules));
        } else if (stat.isFile()) {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * Generate code file by combining selected files/folders
 * @param {Array<string>} selectedItems - files or folders
 * @param {string} outputFile - output .txt path
 * @param {Function} onProgress - callback(percent)
 */
async function generateCode(selectedItems, outputFile, onProgress = () => {}) {
    let allFiles = [];

    for (const item of selectedItems) {
        const stat = fs.statSync(item);
        if (stat.isDirectory()) {
            allFiles = allFiles.concat(getAllFiles(item));
        } else {
            allFiles.push(item);
        }
    }

    const total = allFiles.length;
    if (total === 0) return;

    const writeStream = fs.createWriteStream(outputFile, { flags: 'w', encoding: 'utf-8' });

    for (let i = 0; i < allFiles.length; i++) {
        const filePath = allFiles[i];
        const content = fs.readFileSync(filePath, 'utf-8');

        // Optional: separate each file in output for clarity
        writeStream.write(`\n// ===== File: ${filePath} =====\n`);
        writeStream.write(content + '\n');

        // update progress
        const percent = Math.round(((i + 1) / total) * 100);
        onProgress(percent);
    }

    writeStream.close();
}

module.exports = {
    generateCode
};
