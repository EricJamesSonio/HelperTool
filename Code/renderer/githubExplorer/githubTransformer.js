export function buildTreeFromPaths(paths) {
  const root = { __files: [], __dirs: {} };

  for (const item of paths) {
    if (item.type !== 'blob') continue;
    const parts = item.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.__dirs[parts[i]]) {
        node.__dirs[parts[i]] = { __files: [], __dirs: {} };
      }
      node = node.__dirs[parts[i]];
    }
    node.__files.push({ name: parts[parts.length - 1], path: item.path, sha: item.sha });
  }

  return root;
}

export function treeToFolderString(root, repoName) {
  const lines = [repoName + '/'];
  const dirNames = Object.keys(root.__dirs).sort();
  const fileCount = (root.__files || []).length;
  const childCount = dirNames.length + fileCount;

  let idx = 0;
  for (const dirName of dirNames) {
    idx++;
    const isLast = idx === childCount;
    const prefix = isLast ? '└─ ' : '├─ ';
    lines.push(prefix + dirName + '/');
    const childLines = _renderNodeLines(root.__dirs[dirName], isLast ? '    ' : '│   ');
    lines.push(...childLines);
  }

  const files = (root.__files || []).sort((a, b) => a.name.localeCompare(b.name));
  for (const file of files) {
    idx++;
    const isLast = idx === childCount;
    const prefix = isLast ? '└─ ' : '├─ ';
    lines.push(prefix + file.name);
  }

  return lines.join('\n');
}

function _renderNodeLines(node, indent) {
  const dirNames = Object.keys(node.__dirs).sort();
  const files = (node.__files || []).sort((a, b) => a.name.localeCompare(b.name));
  const childCount = dirNames.length + files.length;
  const lines = [];
  let idx = 0;

  for (const dirName of dirNames) {
    idx++;
    const isLast = idx === childCount;
    const connector = isLast ? '└─ ' : '├─ ';
    const childIndent = isLast ? indent + '    ' : indent + '│   ';
    lines.push(indent + connector + dirName + '/');
    const childLines = _renderNodeLines(node.__dirs[dirName], childIndent);
    lines.push(...childLines);
  }

  for (const file of files) {
    idx++;
    const isLast = idx === childCount;
    const connector = isLast ? '└─ ' : '├─ ';
    lines.push(indent + connector + file.name);
  }

  return lines;
}

export function buildFilteredTree(paths, selectedPaths) {
  const filtered = paths.filter(p => p.type === 'blob' && selectedPaths.has(p.path));
  return buildTreeFromPaths(filtered);
}
