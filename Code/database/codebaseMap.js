const path = require('path');

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

  const filePaths = files.map(f => f.path);
  const modDeps = {};
  const moduleFiles = {};

  function getModule(filePath) {
    const segs = filePath.replace(/\\/g, '/').split('/');
    return segs.length > 1 ? segs[0] : 'root';
  }

  for (const fp of filePaths) {
    const mod = getModule(fp);
    if (!moduleFiles[mod]) moduleFiles[mod] = [];
    moduleFiles[mod].push(fp);
  }

  const modSymbolCounts = {};
  const modSymbolTypes = {};
  for (const [fp, syms] of Object.entries(byFile)) {
    const mod = getModule(fp);
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
      if (srcMod !== tgtMod) {
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
    totalLangs[f.language] = (totalLangs[f.language] || 0) + 1;
  }
  for (const s of symbols) {
    totalSymbolTypes[s.type] = (totalSymbolTypes[s.type] || 0) + 1;
  }

  const keyFileScores = [];
  for (const fp of filePaths) {
    const symbolCount = (byFile[fp] || []).length;
    const importCount = (depsByFile[fp] || []).length;
    const dependentCount = (revDepsByFile[fp] || []).length;
    const score = dependentCount * 10 + importCount + symbolCount;
    keyFileScores.push({ path: fp, symbolCount, importCount, dependentCount, score });
  }
  keyFileScores.sort((a, b) => b.score - a.score);

  const modules = [];
  for (const [name, fpaths] of Object.entries(moduleFiles)) {
    const fileList = fpaths.map(fp => {
      const f = files.find(x => x.path === fp);
      const syms = byFile[fp] || [];
      return {
        path: fp,
        language: f ? f.language : '',
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
    });
  }
  modules.sort((a, b) => b.fileCount - a.fileCount);

  const circularDeps = _findCircular(moduleFiles, depsByFile, getModule);

  const textMap = _generateTextMap(repoPath, repoName, files, modules, keyFileScores, totalLangs, totalSymbolTypes, circularDeps);

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

function _findCircular(moduleFiles, depsByFile, getModule) {
  const modGraph = {};
  for (const [mod] of Object.entries(moduleFiles)) {
    modGraph[mod] = new Set();
  }
  for (const [fp, deps] of Object.entries(depsByFile)) {
    const srcMod = getModule(fp);
    for (const d of deps) {
      const target = d.resolved_path || d.import_path;
      const tgtMod = getModule(target);
      if (srcMod !== tgtMod && modGraph[srcMod]) {
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

function _generateTextMap(repoPath, repoName, files, modules, keyFileScores, totalLangs, totalSymbolTypes, cycles) {
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
  lines.push('');

  lines.push('## Modules');
  lines.push('');
  for (const m of modules) {
    lines.push(`### ${m.name} (${m.fileCount} file${m.fileCount !== 1 ? 's' : ''}, ${m.symbolCount} symbol${m.symbolCount !== 1 ? 's' : ''})`);
    lines.push(`File${m.fileCount !== 1 ? 's' : ''}: ${m.files.map(f => f.path).join(', ')}`);
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

function _allSymbolCount(files, modules) {
  return modules.reduce((s, m) => s + m.symbolCount, 0);
}

module.exports = { buildCodebaseMap };
