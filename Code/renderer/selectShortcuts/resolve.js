// ===== File: Code\renderer\selectShortcuts\resolve.js =====
// Pure helpers that turn a shortcut's target list into concrete paths.
// No imports on purpose — this module is unit tested directly.

const norm = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();

/**
 * Clean up a user typed target.
 * "client/src/"  -> "client/src"
 * "'backend'"    -> "backend"
 * "./frontend"   -> "frontend"
 */
export function normalizeTarget(raw) {
  let t = String(raw ?? '').trim();
  if (!t) return '';
  t = t.replace(/^['"`]+/, '').replace(/['"`]+$/, '').trim();
  t = t.replace(/\\/g, '/');
  t = t.replace(/^\.\//, '');
  t = t.replace(/^\/+/, '');
  t = t.replace(/\/+$/, '');
  return t;
}

export function isFileNode(node) {
  if (!node) return false;
  if (node.type === 'file') return true;
  if (node.type === 'folder') return false;
  return !(node.children && node.children.length);
}

/**
 * Find the node a target refers to.
 *
 * Match order:
 *   1. exact repo-relative path  ("client/src" -> the "client/src" folder)
 *   2. path suffix               ("src" -> "client/src", "main.js" -> "client/src/main.js")
 *   3. bare name                 ("Resort.php" -> the first node with that name)
 *
 * Returns null when nothing matches.
 */
export function findTargetNode(target, flatList) {
  const t = norm(normalizeTarget(target));
  if (!t || !flatList?.length) return null;

  // 1. exact relative path
  for (const node of flatList) {
    if (norm(node.displayPath || node.name) === t) return node;
  }
  // 2. suffix
  for (const node of flatList) {
    const dp = norm(node.displayPath || node.name);
    if (dp === t || dp.endsWith('/' + t)) return node;
  }
  // 3. bare name
  for (const node of flatList) {
    if (norm(node.name) === t) return node;
  }
  return null;
}

/**
 * All files below a node (absolute paths).
 */
export function collectFilesUnder(node, flatList) {
  const out = [];
  if (!node) return out;
  if (isFileNode(node)) {
    if (node.path) out.push(node.path);
    return out;
  }
  const base = norm(node.displayPath || node.name);
  if (!base) return out;
  const prefix = base + '/';
  for (const n of flatList) {
    const dp = norm(n.displayPath || n.name);
    if (dp.startsWith(prefix) && isFileNode(n) && n.path) out.push(n.path);
  }
  return out;
}

/**
 * Resolve a shortcut's targets against the current tree.
 *
 * @param {string[]} targets        folder / file targets
 * @param {Array}    flatList       tree nodes ({ name, path, displayPath, type })
 * @param {'code'|'structure'} mode
 * @returns {{ files: string[], folders: string[], missing: string[], resolved: Array }}
 *
 *   code mode     -> a folder target contributes every file below it
 *   structure mode-> a folder target contributes the folder itself
 */
export function resolveTargets(targets, flatList, mode = 'code') {
  const files = [];
  const folders = [];
  const missing = [];
  const resolved = [];
  const seen = new Set();

  const push = (arr, path) => {
    if (!path) return;
    const key = norm(path);
    if (seen.has(key)) return;
    seen.add(key);
    arr.push(path);
  };

  for (const raw of targets || []) {
    const target = normalizeTarget(raw);
    if (!target) continue;

    const node = findTargetNode(target, flatList);
    if (!node) {
      missing.push(target);
      continue;
    }

    if (isFileNode(node)) {
      push(files, node.path);
      resolved.push({ target, path: node.path, type: 'file' });
      continue;
    }

    if (mode === 'structure') {
      push(folders, node.path);
      resolved.push({ target, path: node.path, type: 'folder' });
    } else {
      const under = collectFilesUnder(node, flatList);
      for (const p of under) push(files, p);
      resolved.push({ target, path: node.path, type: 'folder', count: under.length });
    }
  }

  return { files, folders, missing, resolved };
}

/**
 * The paths a shortcut contributes in the given mode.
 */
export function selectPathsForMode(result, mode) {
  return mode === 'structure' ? result.folders : result.files;
}
