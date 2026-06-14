const path = require('path');
const fs = require('fs');
const micromatch = require('micromatch');

const SUPPORTED_EXTS = new Set([
  '.js','.jsx','.mjs','.cjs','.ts','.tsx','.py','.html','.htm','.css','.scss','.less'
]);

const DEFAULT_IGNORE = [
  '**/node_modules/**','**/.git/**','**/dist/**','**/build/**',
  '**/.next/**','**/target/**','**/coverage/**'
];

module.exports = async function walkDirTask({ repoPath, ignoreRules }) {
  const matchers = [...DEFAULT_IGNORE, ...(ignoreRules || [])].map(p =>
    micromatch.matcher(p, { dot: true })
  );
  const files = [];

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(repoPath, full).replace(/\\/g, '/');
      if (matchers.some(m => m(rel))) continue;
      if (entry.isDirectory()) { walk(full); }
      else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTS.has(ext)) files.push(full);
      }
    }
  }

  walk(repoPath);
  return { files, total: files.length };
};
