const fs = require('fs');
const path = require('path');

/**
 * Recursively builds a folder tree
 * @param {string} dir - directory path
 * @param {string[]} ignoreRules - array of folder/file names to ignore
 * @returns {Array} - tree structure [{ name, path, type, children }]
 */
function getFolderTree(dir, ignoreRules = []) {
    const items = [];

    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
        if (ignoreRules.includes(file.name)) continue;

        const fullPath = path.join(dir, file.name);

        if (file.isDirectory()) {
            items.push({
                name: file.name,
                path: fullPath,
                type: 'folder',
                children: getFolderTree(fullPath, ignoreRules)
            });
        } else {
            items.push({
                name: file.name,
                path: fullPath,
                type: 'file'
            });
        }
    }

    return items;
}

/**
 * Generate folder structure text for selected folders
 * @param {Array} selectedPaths - array of folder paths
 * @param {string} outputFile - path to output txt file
 * @param {Function} progressCallback - callback(percent)
 */
async function generateStructure(selectedPaths, outputFile, progressCallback = () => {}) {
    let output = '';

    function writeFolder(folderPath, prefix = '') {
        const folderName = path.basename(folderPath);
        output += `${prefix}${folderName}/\n`;
        const children = fs.readdirSync(folderPath, { withFileTypes: true });
        for (const child of children) {
            const childPath = path.join(folderPath, child.name);
            if (child.isDirectory()) {
                writeFolder(childPath, prefix + '  ');
            }
        }
    }

    const total = selectedPaths.length;
    selectedPaths.forEach((p, idx) => {
        writeFolder(p);
        const percent = Math.round(((idx + 1) / total) * 100);
        progressCallback(percent);
    });

    fs.writeFileSync(outputFile, output, 'utf-8');
}

module.exports = {
    getFolderTree,
    generateStructure
};
