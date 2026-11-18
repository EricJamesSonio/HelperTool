const SKIP = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.cache', '__pycache__', '.swc',
  '.turbo', '.parcel-cache', '.nuxt', '.svelte-kit', 'vendor', '.venv', 'venv', 'target', '.gradle', '.idea',
]);
const MAX_NODES = 20000;
const BRANCH = '\u251c\u2500 ';
const LAST = '\u2514\u2500 ';
const PIPE = '\u2502   ';
const GAP = '    ';

function byName(a, b) {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

async function readEntries(dirPath) {
  try {
    const res = await window.ideAPI.readDir(dirPath);
    if (res && res.success) return { ok: true, entries: res.entries || [] };
  } catch (_) {
    return { ok: false, entries: [] };
  }
  return { ok: false, entries: [] };
}

async function walk(dirPath, prefix, opts, budget, lines) {
  const res = await readEntries(dirPath);
  const list = res.entries
    .filter((e) => (e.type === 'folder' ? !SKIP.has(e.name.toLowerCase()) : opts.files))
    .sort(byName);
  for (let i = 0; i < list.length; i++) {
    if (budget.left <= 0) {
      budget.cut = true;
      return;
    }
    budget.left--;
    const e = list[i];
    const last = i === list.length - 1;
    const isDir = e.type === 'folder';
    lines.push(prefix + (last ? LAST : BRANCH) + e.name + (isDir ? '/' : ''));
    if (isDir) await walk(e.path, prefix + (last ? GAP : PIPE), opts, budget, lines);
  }
}

function addToTrie(root, segments) {
  let node = root;
  for (const seg of segments) {
    if (!node.kids.has(seg)) node.kids.set(seg, { name: seg, kids: new Map(), target: false });
    node = node.kids.get(seg);
  }
  node.target = true;
}

async function renderTrie(node, dirPath, sep, prefix, opts, budget, lines) {
  const kids = Array.from(node.kids.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i];
    const last = i === kids.length - 1;
    const full = dirPath + sep + kid.name;
    lines.push(prefix + (last ? LAST : BRANCH) + kid.name + '/');
    const childPrefix = prefix + (last ? GAP : PIPE);
    if (kid.target) await walk(full, childPrefix, opts, budget, lines);
    else await renderTrie(kid, full, sep, childPrefix, opts, budget, lines);
  }
}

export async function buildStructure(repo, folders, includeFiles) {
  const sep = repo.indexOf('\\') !== -1 ? '\\' : '/';
  const base = repo.replace(/[\\/]+$/, '');
  const rootName = base.split(/[\\/]/).filter(Boolean).pop() || 'repo';
  const opts = { files: includeFiles !== false };
  const budget = { left: MAX_NODES, cut: false };
  const lines = [rootName + '/'];
  const missing = [];
  if (!folders || !folders.length) {
    await walk(base, '', opts, budget, lines);
  } else {
    const trie = { name: '', kids: new Map(), target: false };
    for (const f of folders) {
      const full = base + sep + f.split('/').join(sep);
      const check = await readEntries(full);
      if (!check.ok) {
        missing.push(f);
        continue;
      }
      addToTrie(trie, f.split('/'));
    }
    await renderTrie(trie, base, sep, '', opts, budget, lines);
  }
  return { text: lines.join('\n'), count: lines.length - 1, missing, cut: budget.cut };
}