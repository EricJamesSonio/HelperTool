const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const micromatch = require('micromatch');

function compileRules(rules) {
  return (rules || []).map(pattern => micromatch.matcher(pattern, { dot: true }));
}

function isIgnored(fullPath, repoRoot, matchers) {
  if (!repoRoot) return false;
  let rel = path.relative(repoRoot, fullPath).replace(/\\/g, '/');
  if (rel.startsWith('..')) return false;
  return matchers.some(fn => fn(rel));
}

function getCommonAncestor(paths) {
  if (!paths || paths.length === 0) return '';
  if (paths.length === 1) return path.resolve(path.dirname(paths[0]));
  const splitPaths = paths.map(p => path.resolve(p).split(path.sep));
  const [first, ...rest] = splitPaths;
  let commonParts = first;
  for (const parts of rest) {
    const len = Math.min(commonParts.length, parts.length);
    let i = 0;
    while (i < len && commonParts[i] === parts[i]) i++;
    commonParts = commonParts.slice(0, i);
  }
  return commonParts.join(path.sep) || path.sep;
}

async function buildTree(currentPath, repoRoot, matchers) {
  if (isIgnored(currentPath, repoRoot, matchers)) return null;
  let stat;
  try { stat = await fsp.stat(currentPath); } catch { return null; }
  const node = {
    name: path.basename(currentPath),
    path: currentPath,
    type: stat.isDirectory() ? 'folder' : 'file',
    children: [],
  };
  if (stat.isDirectory()) {
    let entries;
    try { entries = await fsp.readdir(currentPath, { withFileTypes: true }); } catch { return node; }
    for (const entry of entries) {
      const childNode = await buildTree(path.join(currentPath, entry.name), repoRoot, matchers);
      if (childNode) node.children.push(childNode);
    }
  }
  return node;
}

function treeLines(node, prefix = '', isLast = true, isRoot = true) {
  const lines = [];
  const connector = isRoot ? '' : (isLast ? '└─ ' : '├─ ');
  lines.push(prefix + connector + node.name + (node.type === 'folder' ? '/' : ''));
  if (node.children) {
    node.children.forEach((child, idx) => {
      const last = idx === node.children.length - 1;
      const newPrefix = prefix + (isRoot ? '' : (isLast ? '    ' : '│   '));
      lines.push(...treeLines(child, newPrefix, last, false));
    });
  }
  return lines;
}

function minifySource(src) {
  const lines = src.split('\n');
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('//')) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('/*') && line.endsWith('*/')) continue;
    if (line.startsWith('*')) continue;
    out.push(line);
  }
  return out.join(' ');
}

async function getAllFiles(folderPath, repoRoot, matchers) {
  if (isIgnored(folderPath, repoRoot, matchers)) return [];
  try { await fsp.access(folderPath); } catch { return []; }
  let items;
  try { items = await fsp.readdir(folderPath, { withFileTypes: true }); } catch { return []; }
  let files = [];
  for (const item of items) {
    const fullPath = path.join(folderPath, item.name);
    if (isIgnored(fullPath, repoRoot, matchers)) continue;
    if (item.isDirectory()) {
      const sub = await getAllFiles(fullPath, repoRoot, matchers);
      files.push(...sub);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function generateStructure(payload, onProgress) {
  const { items, filePath, promptText, ignoreRules, repoRoot } = payload;
  if (!items?.length) throw new Error('No items selected');
  const root = repoRoot || getCommonAncestor(items);
  const matchers = compileRules(ignoreRules || []);
  const allLines = [];
  const promptBlock = (promptText || '').trim()
    ? `\n/* ===== Prompt ===== */\n${promptText.trim()}\n/* =================== */\n\n`
    : '';
  if (promptBlock) allLines.push(...promptBlock.split('\n'));
  for (let i = 0; i < items.length; i++) {
    const rootNode = await buildTree(items[i], root, matchers);
    if (rootNode) allLines.push(...treeLines(rootNode));
    onProgress(Math.round(((i + 1) / items.length) * 100));
  }
  const outputDir = path.dirname(filePath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  await fsp.writeFile(filePath, allLines.join('\n'), 'utf-8');
  return { success: true, filePath };
}

async function generateCode(payload, onProgress) {
  const { items, filePath, promptText, ignoreRules, repoRoot, minify } = payload;
  if (!items?.length) throw new Error('No items selected');
  const root = repoRoot || path.resolve(items[0]);
  const matchers = compileRules(ignoreRules || []);
  let allFiles = [];
  for (const item of items) {
    let stat;
    try { stat = await fsp.stat(item); } catch { continue; }
    if (stat.isDirectory()) {
      const sub = await getAllFiles(item, root, matchers);
      allFiles.push(...sub);
    } else if (!isIgnored(item, root, matchers)) {
      allFiles.push(item);
    }
  }
  if (!allFiles.length) return { success: true, filePath, filesCount: 0 };
  const outputDir = path.dirname(filePath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const writeStream = fs.createWriteStream(filePath, { flags: 'w', encoding: 'utf-8' });
  const promptBlock = (promptText || '').trim()
    ? `\n/* ===== Prompt ===== */\n${promptText.trim()}\n/* =================== */\n\n`
    : '';
  writeStream.write(promptBlock);
  for (let i = 0; i < allFiles.length; i++) {
    const fp = allFiles[i];
    const relativeName = path.relative(root, fp) || path.basename(fp);
    writeStream.write(`\n// ===== File: ${relativeName} =====\n`);
    let raw;
    try { raw = await fsp.readFile(fp, 'utf-8'); } catch { raw = ''; }
    const content = minify ? minifySource(raw) : raw;
    writeStream.write(content + '\n');
    onProgress(Math.round(((i + 1) / allFiles.length) * 100));
  }
  writeStream.close();
  return { success: true, filePath, filesCount: allFiles.length };
}

module.exports = async function (payload, onProgress) {
  const { actionType } = payload;
  if (actionType === 'structure') return generateStructure(payload, onProgress);
  if (actionType === 'code') return generateCode(payload, onProgress);
  throw new Error('Unknown generate actionType: ' + actionType);
};
