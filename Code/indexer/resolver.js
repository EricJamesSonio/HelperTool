const path = require('path');
const fs = require('fs');

const TRY_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.html', '.htm', '.css', '.scss', '.less'];

function resolveImport(sourceFileRelPath, importPath, repoRoot) {
  // Skip non-relative imports (npm packages, node built-ins, absolute paths)
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }

  const sourceDir = path.dirname(path.join(repoRoot, sourceFileRelPath));
  const resolved = path.resolve(sourceDir, importPath);

  // Try exact path first
  if (fs.existsSync(resolved)) {
    const stat = fs.statSync(resolved);
    if (stat.isFile()) return resolved;
    if (stat.isDirectory()) {
      // Try index files
      for (const ext of TRY_EXTENSIONS) {
        const indexPath = path.join(resolved, 'index' + ext);
        if (fs.existsSync(indexPath)) return indexPath;
      }
      return null;
    }
  }

  // Try with extensions
  for (const ext of TRY_EXTENSIONS) {
    const withExt = resolved + ext;
    if (fs.existsSync(withExt)) return withExt;
  }

  // Try index files (for directory imports ending without slash)
  for (const ext of TRY_EXTENSIONS) {
    const indexPath = path.join(resolved, 'index' + ext);
    if (fs.existsSync(indexPath)) return indexPath;
  }

  return null;
}

// Get relative path from repo root (normalized)
function toRelPath(fullPath, repoRoot) {
  return path.relative(repoRoot, fullPath).replace(/\\/g, '/');
}

module.exports = { resolveImport, toRelPath };
