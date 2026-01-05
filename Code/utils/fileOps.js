const fs = require('fs');
const path = require('path');
const { isIgnored } = require('./docignore');

function getFolderTree(dir, ignoreRules = [], repoRoot = dir) {
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter(f => !isIgnored(path.join(dir, f.name), repoRoot, ignoreRules))
        .map(f => f.isDirectory()
            ? { name: f.name, path: path.join(dir, f.name), type: 'folder', children: getFolderTree(path.join(dir, f.name), ignoreRules, repoRoot) }
            : { name: f.name, path: path.join(dir, f.name), type: 'file' }
        );
}

async function generateStructure(selectedPaths, outputFile, ignoreRules = [], progressCallback = () => {}) {
    let output = '';
    const allItems = [];

    function collect(p, repoRoot) {
        if (isIgnored(p, repoRoot, ignoreRules)) return;
        allItems.push(p);
        if (fs.statSync(p).isDirectory())
            fs.readdirSync(p).forEach(c => collect(path.join(p, c), repoRoot));
    }

    selectedPaths.forEach(p => collect(p, p));

    allItems.forEach((p, idx) => {
        const stat = fs.statSync(p);
        output += `${'  '.repeat(p.split(path.sep).length)}${path.basename(p)}${stat.isDirectory() ? '/' : ''}\n`;
        progressCallback(Math.round(((idx + 1) / allItems.length) * 100));
    });

    fs.writeFileSync(outputFile, output, 'utf-8');
}

module.exports = { getFolderTree, generateStructure };
