/**
 * Lightweight regex-based symbol extractor.
 * Parses JS/TS/JSX/TSX source into symbols without tree-sitter.
 * Used for the decoupled indexer service demo.
 */

const EXT_PATTERNS = {
  js:     { comment: /\/\/.*|\/\*[\s\S]*?\*\//g },
  jsx:    { comment: /\/\/.*|\/\*[\s\S]*?\*\//g },
  ts:     { comment: /\/\/.*|\/\*[\s\S]*?\*\//g },
  tsx:    { comment: /\/\/.*|\/\*[\s\S]*?\*\//g },
  py:     { comment: /#.*/g },
};

const SUPPORTED = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py']);

function getLanguage(filePath) {
  const ext = filePath?.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  const mapped = { mjs: 'js', cjs: 'js', jsx: 'jsx', ts: 'ts', tsx: 'tsx', py: 'py' };
  return mapped[ext] || (SUPPORTED.has('.' + ext) ? ext : null);
}

function stripComments(code, lang) {
  const pattern = EXT_PATTERNS[lang];
  if (!pattern) return code;
  return code.replace(pattern.comment, '');
}

/** JS/TS symbol extraction */
function extractJSTS(code, lang) {
  const symbols = [];
  const imports = [];
  const clean = stripComments(code, lang);
  const lines = clean.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      symbols.push({ name: funcMatch[1], type: 'function', line: lineNum });
      continue;
    }

    const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], type: 'class', line: lineNum });
      continue;
    }

    const methodMatch = line.match(/(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/);
    if (methodMatch && !/^(if|for|while|switch|catch|function)\b/.test(methodMatch[1])) {
      symbols.push({ name: methodMatch[1], type: 'method', line: lineNum });
      continue;
    }

    const requireMatch = line.match(/(?:const|let|var)\s+(.+?)\s*=\s*require\(['"](\S+)['"]\)/);
    if (requireMatch) {
      const lhs = requireMatch[1].trim().replace(/\s+/g, '');
      const names = lhs.startsWith('{') && lhs.endsWith('}')
        ? lhs.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
        : [lhs];
      imports.push({ source: requireMatch[2], names });
      for (const name of names) {
        if (name) symbols.push({ name, type: 'variable', line: lineNum });
      }
      continue;
    }

    const importMatch = line.match(/import\s+(?:\{\s*(\w+)\s*\}|(\w+))\s+from\s+['"](\S+)['"]/);
    if (importMatch) {
      imports.push({ source: importMatch[3], names: [importMatch[1] || importMatch[2]] });
      continue;
    }

    const constMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/);
    if (constMatch) {
      symbols.push({ name: constMatch[1], type: 'variable', line: lineNum });
      continue;
    }

    if (lang === 'ts' || lang === 'tsx') {
      const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
      if (interfaceMatch) {
        symbols.push({ name: interfaceMatch[1], type: 'interface', line: lineNum });
        continue;
      }
      const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)\s*=/);
      if (typeMatch) {
        symbols.push({ name: typeMatch[1], type: 'type', line: lineNum });
        continue;
      }
      const enumMatch = line.match(/(?:export\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        symbols.push({ name: enumMatch[1], type: 'enum', line: lineNum });
        continue;
      }
    }

    const exportDefault = line.match(/export\s+default\s+(?:function|class)\s+(\w+)/);
    if (exportDefault) {
      symbols.push({ name: exportDefault[1], type: 'function', line: lineNum });
      continue;
    }
  }

  return { symbols, imports };
}

/** Python symbol extraction */
function extractPython(code) {
  const symbols = [];
  const imports = [];
  const clean = stripComments(code, 'py');
  const lines = clean.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const funcMatch = line.match(/^(\s*)def\s+(\w+)/);
    if (funcMatch) {
      const name = funcMatch[2];
      const indent = funcMatch[1].length;
      symbols.push({ name, type: 'function', line: lineNum });
      continue;
    }

    const classMatch = line.match(/^(\s*)class\s+(\w+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[2], type: 'class', line: lineNum });
      continue;
    }

    const importMatch = line.match(/^import\s+(\w+(?:\.\w+)*)/);
    if (importMatch) {
      imports.push({ source: importMatch[1], names: [] });
      continue;
    }
    const fromImport = line.match(/^from\s+(\w+(?:\.\w+)*)\s+import\s+(.+)/);
    if (fromImport) {
      const names = fromImport[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0]);
      imports.push({ source: fromImport[1], names });
      continue;
    }
  }

  return { symbols, imports };
}

function parseFile(code, filePath) {
  const lang = getLanguage(filePath);
  if (!lang) return { symbols: [], imports: [] };

  if (lang === 'py') return extractPython(code);
  return extractJSTS(code, lang);
}

module.exports = { parseFile, SUPPORTED };
