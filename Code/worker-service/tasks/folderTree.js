const path = require('path');
const fs = require('fs');
const micromatch = require('micromatch');

module.exports = async function folderTreeTask({ repoPath, ignoreRules }) {
  const matchers = (ignoreRules || []).map(p =>
    micromatch.matcher(p, { dot: true })
  );

  function isIgnored(fullPath) {
    const rel = path.relative(repoPath, fullPath).replace(/\\/g, '/');
    return matchers.some(m => m(rel));
  }

  function walk(dir, depth) {
    if (depth > 20) return [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return []; }

    const nodes = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (isIgnored(fullPath)) continue;

      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'folder',
          children: walk(fullPath, depth + 1),
        });
      } else if (entry.isFile()) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
        });
      }
    }

    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return nodes;
  }

  return walk(repoPath, 0);
};
