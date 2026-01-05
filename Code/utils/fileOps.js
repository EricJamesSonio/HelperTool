const { isIgnored } = require('./docignore');

/**
 * Recursively builds a folder tree with ignore support
 */
function getFolderTree(dir, ignoreRules = [], repoRoot = dir) {
    const items = [];
    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (isIgnored(fullPath, repoRoot, ignoreRules)) continue;

        if (file.isDirectory()) {
            items.push({
                name: file.name,
                path: fullPath,
                type: 'folder',
                children: getFolderTree(fullPath, ignoreRules, repoRoot)
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
 * Generate folder structure text respecting ignore rules
 */
async function generateStructure(selectedPaths, outputFile, ignoreRules = [], progressCallback = () => {}) {
    let output = '';
    const allItems = [];

    function collectItems(p, repoRoot) {
        if (isIgnored(p, repoRoot, ignoreRules)) return;

        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
            allItems.push(p);
            fs.readdirSync(p).forEach(child => collectItems(path.join(p, child), repoRoot));
        } else {
            allItems.push(p);
        }
    }

    selectedPaths.forEach(p => collectItems(p, p));

    const total = allItems.length;
    let processed = 0;

    function writeItem(p, prefix = '', repoRoot = p) {
        if (isIgnored(p, repoRoot, ignoreRules)) return;

        const stat = fs.statSync(p);
        const name = path.basename(p);

        if (stat.isDirectory()) {
            output += `${prefix}${name}/\n`;
            fs.readdirSync(p).forEach(child => writeItem(path.join(p, child), prefix + '  ', repoRoot));
        } else {
            output += `${prefix}${name}\n`;
        }

        processed++;
        const percent = Math.round((processed / total) * 100);
        progressCallback(percent);
    }

    selectedPaths.forEach(p => writeItem(p, '', p));

    fs.writeFileSync(outputFile, output, 'utf-8');
}

module.exports = {
    getFolderTree,
    generateStructure
};
