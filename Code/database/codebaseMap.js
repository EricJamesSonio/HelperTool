const path = require('path');

function _detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'tsx',
    '.py': 'python',
    '.html': 'html', '.htm': 'html',
    '.css': 'css', '.scss': 'css', '.less': 'css',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
    '.md': 'markdown',
  };
  return map[ext] || null;
}

function _camelToWords(str) {
  return str.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
}

function _findCommonPrefix(paths) {
  if (paths.length === 0) return '';
  const first = paths[0].replace(/\\/g, '/').split('/')[0];
  if (!first) return '';
  for (const p of paths) {
    if (!p.replace(/\\/g, '/').startsWith(first + '/')) return '';
  }
  return first + '/';
}

function buildCodebaseMap({ files, symbols, imports, repoPath }) {
  const repoName = repoPath ? repoPath.split(/[\\/]/).pop() || 'Repository' : 'Repository';

  const byFile = {};
  for (const s of symbols) {
    if (!byFile[s.file_path]) byFile[s.file_path] = [];
    byFile[s.file_path].push(s);
  }

  const depsByFile = {};
  const revDepsByFile = {};
  for (const imp of imports) {
    const src = imp.source_path;
    if (!depsByFile[src]) depsByFile[src] = [];
    depsByFile[src].push(imp);

    const resolved = imp.resolved_path || imp.import_path;
    if (!revDepsByFile[resolved]) revDepsByFile[resolved] = [];
    revDepsByFile[resolved].push({ source_path: src, import_type: imp.import_type, imported_symbols: imp.imported_symbols });
  }

  const rawPaths = files.map(f => f.path);
  const modDeps = {};
  const moduleFiles = {};

  const _rootPrefix = _findCommonPrefix(rawPaths);
  function _stripRoot(p) {
    const norm = p.replace(/\\/g, '/');
    return _rootPrefix && norm.startsWith(_rootPrefix) ? norm.slice(_rootPrefix.length) : norm;
  }

  function getModule(filePath) {
    const stripped = _stripRoot(filePath);
    const segs = stripped.split('/');
    return segs.length > 1 ? segs[0] : 'root';
  }

  const filePaths = rawPaths.map(_stripRoot);
  const origByStripped = {};
  for (let i = 0; i < rawPaths.length; i++) {
    origByStripped[filePaths[i]] = rawPaths[i];
  }

  for (const fp of filePaths) {
    const mod = getModule(fp);
    if (!moduleFiles[mod]) moduleFiles[mod] = [];
    moduleFiles[mod].push(fp);
  }

  const knownModules = new Set(Object.keys(moduleFiles));

  const modSymbolCounts = {};
  const modSymbolTypes = {};
  for (const [origFp, syms] of Object.entries(byFile)) {
    const mod = getModule(origFp);
    modSymbolCounts[mod] = (modSymbolCounts[mod] || 0) + syms.length;
    for (const s of syms) {
      if (!modSymbolTypes[mod]) modSymbolTypes[mod] = {};
      modSymbolTypes[mod][s.type] = (modSymbolTypes[mod][s.type] || 0) + 1;
    }
  }

  for (const [fp, deps] of Object.entries(depsByFile)) {
    const srcMod = getModule(fp);
    for (const d of deps) {
      const target = d.resolved_path || d.import_path;
      const tgtMod = getModule(target);
      if (srcMod !== tgtMod && knownModules.has(tgtMod)) {
        if (!modDeps[srcMod]) modDeps[srcMod] = { importsFrom: new Set(), importedBy: new Set() };
        modDeps[srcMod].importsFrom.add(tgtMod);
        if (!modDeps[tgtMod]) modDeps[tgtMod] = { importsFrom: new Set(), importedBy: new Set() };
        modDeps[tgtMod].importedBy.add(srcMod);
      }
    }
  }

  const totalLangs = {};
  const totalSymbolTypes = {};
  for (const f of files) {
    const lang = f.language || _detectLanguage(f.path);
    totalLangs[lang] = (totalLangs[lang] || 0) + 1;
  }
  for (const s of symbols) {
    totalSymbolTypes[s.type] = (totalSymbolTypes[s.type] || 0) + 1;
  }

  const moduleSet = new Set(Object.keys(moduleFiles));

  const keyFileScores = [];
  for (let i = 0; i < rawPaths.length; i++) {
    const origFp = rawPaths[i];
    const fp = filePaths[i];
    const symbolCount = (byFile[origFp] || []).length;
    const importCount = (depsByFile[origFp] || []).length;
    const dependentCount = (revDepsByFile[origFp] || []).length;
    const entropy = (importCount + dependentCount) > 0
      ? Math.min((symbolCount + 1) / (importCount + dependentCount + 1), 3)
      : 0;
    const isEntryLike = /^(main|index|app|start)\.[^/]*$/.test(path.basename(origFp));
    const isConfigLike = /\.(json|ya?ml|toml)$/.test(origFp);
    const score = isEntryLike ? 9999
                 : isConfigLike ? 0
                 : Math.round(symbolCount * 0.5 + importCount * 2 + dependentCount * 5 + entropy * 10);
    keyFileScores.push({ path: origFp, symbolCount, importCount, dependentCount, score });
  }
  keyFileScores.sort((a, b) => b.score - a.score);

  const modules = [];
  for (const [name, fpaths] of Object.entries(moduleFiles)) {
    const fileList = fpaths.map(fp => {
      const origFp = origByStripped[fp];
      const f = files.find(x => x.path === origFp);
      const syms = f ? byFile[origFp] || [] : [];
      return {
        path: origFp,
        language: f ? (f.language || _detectLanguage(f.path) || '') : '',
        symbolCount: syms.length,
        exports: syms.filter(s => s.is_exported).map(s => ({ name: s.name, type: s.type, line: s.line })),
      };
    });
    const deps = modDeps[name];
    modules.push({
      name,
      fileCount: fpaths.length,
      symbolCount: modSymbolCounts[name] || 0,
      symbolTypes: modSymbolTypes[name] || {},
      importsFrom: deps ? [...deps.importsFrom].sort() : [],
      importedBy: deps ? [...deps.importedBy].sort() : [],
      files: fileList.sort((a, b) => b.symbolCount - a.symbolCount),
      tree: _buildModuleTree(fpaths, origByStripped, files, byFile, depsByFile, revDepsByFile),
    });
  }
  modules.sort((a, b) => b.fileCount - a.fileCount);

  const circularDeps = _findCircular(moduleFiles, depsByFile, getModule);

  const textMap = _generateTextMap(repoPath, repoName, files, modules, keyFileScores, totalLangs, totalSymbolTypes, circularDeps, filePaths);

  return {
    overview: {
      totalFiles: files.length,
      totalSymbols: symbols.length,
      totalImports: imports.length,
      languages: totalLangs,
      symbolTypes: totalSymbolTypes,
    },
    modules,
    keyFiles: keyFileScores.slice(0, 15),
    circularDeps,
    textMap,
  };
}

function _buildModuleTree(fpaths, origByStripped, files, byFile, depsByFile, revDepsByFile) {
  const root = { name: '', type: 'root', children: [] };
  const sorted = [...fpaths].sort();

  for (const fp of sorted) {
    const origFp = origByStripped[fp] || fp;
    const parts = fp.replace(/\\/g, '/').split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      let child = current.children.find(c => c.name === part);
      if (!child) {
        if (isLeaf) {
          const f = files.find(x => x.path === origFp);
          const syms = byFile[origFp] || [];
          child = {
            name: part, type: 'file', path: origFp,
            language: f ? (f.language || _detectLanguage(f.path) || '') : '',
            symbolCount: syms.length,
            exports: syms.filter(s => s.is_exported).map(s => ({ name: s.name, type: s.type, line: s.line })),
            importCount: (depsByFile[origFp] || []).length,
            dependentCount: (revDepsByFile[origFp] || []).length,
            role: _inferRole(origFp, depsByFile[origFp] || [], revDepsByFile[origFp] || []),
            summary: _inferFileSummary(origFp, syms, depsByFile[origFp] || [], revDepsByFile[origFp] || []),
          };
        } else {
          child = { name: part, type: 'directory', children: [] };
        }
        current.children.push(child);
      }
      current = child;
    }
  }

  _sortTreeChildren(root.children);
  return root.children;
}

function _sortTreeChildren(children) {
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of children) {
    if (child.children) _sortTreeChildren(child.children);
  }
}

function _inferFileSummary(filePath, syms, deps, revDeps) {
  const fname = path.basename(filePath).toLowerCase();

  if (fname === 'index.js' || fname === 'index.ts' || fname === 'index.tsx') {
    return 'Module entry point — re-exports public API';
  }
  if (fname === 'main.js' || fname === 'main.ts' || fname === 'app.js' || fname === 'app.ts') {
    return 'Application bootstrap and initialization';
  }
  if (fname === 'config.js' || fname === 'configuration.js' || filePath.includes('/config/')) {
    return 'Configuration and environment settings';
  }

  const exportNames = syms.filter(s => s.is_exported).map(s => s.name);
  const classExports = exportNames.filter(n => /^[A-Z]/.test(n));
  const functionExports = exportNames.filter(n => /^[a-z]/.test(n));

  const words = [];

  const dir = path.dirname(filePath).split(/[\\/]/).filter(Boolean).pop();
  if (dir && !/^(src|lib|app|dist)$/.test(dir)) {
    words.push(dir.replace(/([_-])/g, ' '));
  }

  if (classExports.length === 1) {
    words.push(`Defines ${_camelToWords(classExports[0])}`);
  } else if (classExports.length > 1) {
    words.push(`Defines ${classExports.length} classes`);
  }

  if (functionExports.length <= 3 && functionExports.length > 0) {
    for (const fn of functionExports) {
      words.push(_camelToWords(fn));
    }
  } else if (functionExports.length > 3) {
    words.push(`${functionExports.length} utility functions`);
  }

  if (revDeps.length > 5) {
    words.push(`Used by ${revDeps.length} dependents — core utility`);
  }

  return words.length > 0 ? words.join('; ') : null;
}

function _inferRole(filePath, deps, revDeps) {
  const fname = filePath.split('/').pop().toLowerCase();
  const dependentCount = revDeps.length;
  const importCount = deps.length;

  if (/^(main|index|app|start)\./.test(fname) && dependentCount === 0 && importCount > 3) return 'entry-point';
  if (dependentCount > 10) return 'core';
  if (dependentCount > 3) return 'shared';
  if (filePath.includes('/config/') || /\.(json|ya?ml|toml)$/.test(fname)) return 'config';
  if (filePath.includes('/test/') || filePath.includes('/__tests__/') || /\.(spec|test)\./.test(fname)) return 'test';
  if (fname.endsWith('.d.ts')) return 'type-def';
  return 'module';
}

function _findCircular(moduleFiles, depsByFile, getModule) {
  const modGraph = {};
  for (const [mod] of Object.entries(moduleFiles)) {
    modGraph[mod] = new Set();
  }
  const known = new Set(Object.keys(modGraph));
  for (const [fp, deps] of Object.entries(depsByFile)) {
    const srcMod = getModule(fp);
    for (const d of deps) {
      const target = d.resolved_path || d.import_path;
      const tgtMod = getModule(target);
      if (srcMod !== tgtMod && modGraph[srcMod] && known.has(tgtMod)) {
        modGraph[srcMod].add(tgtMod);
      }
    }
  }

  const visited = new Set();
  const stack = new Set();
  const cycles = [];

  function dfs(mod, path) {
    if (stack.has(mod)) {
      const idx = path.indexOf(mod);
      if (idx >= 0) cycles.push([...path.slice(idx), mod]);
      return;
    }
    if (visited.has(mod)) return;
    visited.add(mod);
    stack.add(mod);
    path.push(mod);
    for (const neighbor of (modGraph[mod] || [])) {
      dfs(neighbor, [...path]);
    }
    stack.delete(mod);
  }

  for (const mod of Object.keys(modGraph)) {
    dfs(mod, []);
  }

  return cycles.slice(0, 10);
}

function _detectArchPatterns(modules, filePaths) {
  const patterns = [];
  const modNames = modules.map(m => m.name);
  const modSet = new Set(modNames);

  const hasApi = modNames.some(m => /^api/.test(m) || /^api$/.test(m));
  const hasClient = modNames.some(m => /^(client|app|ui|web)$/.test(m));
  const hasServer = modNames.some(m => /^(server|backend|api)$/.test(m));
  const hasDb = modNames.some(m => /^(db|database|models|schema)$/.test(m));
  const hasUtils = modNames.some(m => /^(util|utils|helper|helpers|lib|common|shared)$/.test(m));

  if (hasClient && hasServer && hasDb) patterns.push('client-server-database (3-tier)');
  else if (hasApi && hasClient) patterns.push('client-server (API-driven)');
  else if (hasClient && hasUtils && hasApi) patterns.push('layered architecture');
  else if (hasServer && hasDb) patterns.push('server-database');

  if (modNames.some(m => /^(routes|controllers|views|middleware)$/.test(m))) {
    patterns.push('MVC-inspired');
  }
  if (modNames.some(m => /^(components|features|pages|screens)$/.test(m))) {
    patterns.push('component-based (feature-sliced)');
  }
  if (modNames.some(m => /^(core|foundation|base)$/.test(m))) {
    patterns.push('core-module pattern');
  }

  // Detect package-based monorepo
  const packageCount = modNames.filter(m => /^(packages|modules)\//.test(m)).length;
  if (packageCount > 1) patterns.push(`monorepo (${packageCount} packages)`);

  return patterns;
}

function _generateTextMap(repoPath, repoName, files, modules, keyFileScores, totalLangs, totalSymbolTypes, cycles, filePaths) {
  const lines = [];

  lines.push(`# Codebase Map: ${repoName}`);
  lines.push('');

  const langSummary = Object.entries(totalLangs)
    .filter(([k]) => k)
    .map(([lang, count]) => `${lang.toUpperCase()} (${count})`)
    .join(', ');

  const symSummary = Object.entries(totalSymbolTypes)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type} (${count})`)
    .join(', ');

  lines.push('## Architecture Overview');
  lines.push(`- Modular structure with **${modules.length}** modules`);
  lines.push(`- **${files.length}** files total, **${_allSymbolCount(files, modules)}** symbols, **${keyFileScores.reduce((s, k) => s + k.importCount, 0)}** imports`);
  if (langSummary) lines.push(`- Languages: ${langSummary}`);
  if (symSummary) lines.push(`- Symbols: ${symSummary}`);
  if (cycles.length > 0) {
    lines.push(`- ⚠️ **${cycles.length}** circular dependenc${cycles.length !== 1 ? 'ies' : 'y'} detected`);
  }

  const archPatterns = _detectArchPatterns(modules, filePaths);
  if (archPatterns.length) {
    for (const ap of archPatterns) lines.push(`- Pattern: ${ap}`);
  }
  lines.push('');

  lines.push('## Modules');
  lines.push('');
  for (const m of modules) {
    lines.push(`### ${m.name} (${m.fileCount} file${m.fileCount !== 1 ? 's' : ''}, ${m.symbolCount} symbol${m.symbolCount !== 1 ? 's' : ''})`);
    lines.push(`Files:`);
    const treeLines = _renderTreeLines(m.tree, '');
    for (const tl of treeLines) lines.push(tl);
    if (m.importsFrom.length) {
      lines.push(`👉 Depends on: ${m.importsFrom.join(', ')}`);
    } else {
      lines.push(`👉 Depends on: (standalone)`);
    }
    if (m.importedBy.length) {
      lines.push(`👈 Used by: ${m.importedBy.join(', ')}`);
    }
    const topSyms = Object.entries(m.symbolTypes).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topSyms.length) {
      lines.push(`Symbols: ${topSyms.map(([t, c]) => `${t} (${c})`).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Key Files');
  lines.push('');
  for (const kf of keyFileScores.slice(0, 10)) {
    const label = kf.dependentCount === 0 && kf.importCount > 5 ? '(entry point)' :
                  kf.dependentCount > 10 ? '(core/shared)' :
                  kf.dependentCount > 3 ? '(shared utility)' : '';
    lines.push(`- ${kf.path} — ${kf.importCount} imports, ${kf.dependentCount} dependents${label ? ' ' + label : ''}`);
  }
  lines.push('');

  if (cycles.length > 0) {
    lines.push('## ⚠️ Circular Dependencies');
    lines.push('');
    for (let i = 0; i < cycles.length; i++) {
      lines.push(`Cycle ${i + 1}: ${cycles[i].join(' → ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function _renderTreeLines(nodes, prefix) {
  const lines = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const linePrefix = prefix + connector;
    const childPrefix = prefix + (isLast ? '    ' : '│   ');

    if (node.type === 'directory') {
      lines.push(linePrefix + node.name + '/');
      const childLines = _renderTreeLines(node.children, childPrefix);
      for (const cl of childLines) lines.push(cl);
    } else {
      const tags = [];
      if (node.symbolCount > 0) tags.push(`${node.symbolCount} syms`);
      if (node.importCount > 0) tags.push(`${node.importCount} imports`);
      if (node.dependentCount > 0) tags.push(`${node.dependentCount} dependents`);
      if (node.exports.length > 0) tags.push(`${node.exports.length} exports`);
      if (node.language) tags.push(node.language);
      const tagStr = tags.length > 0 ? ` (${tags.join(', ')})` : '';
      const roleStr = node.role && node.role !== 'module' ? ` ← ${node.role}` : '';
      const line = linePrefix + node.name + tagStr + roleStr;
      lines.push(line);
      if (node.summary) {
        lines.push(childPrefix + '  // ' + node.summary);
      }
    }
  }
  return lines;
}

function _allSymbolCount(files, modules) {
  return modules.reduce((s, m) => s + m.symbolCount, 0);
}

module.exports = { buildCodebaseMap };
