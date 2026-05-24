const path = require('path');
const { Parser, Language } = require('web-tree-sitter');

const GRAMMAR_DIR = path.join(__dirname, '..', 'grammars');
const MAX_FILE_SIZE = 512 * 1024; // skip files > 512KB for AST parsing

const SUPPORTED_LANGUAGES = {
  '.js':     { wasm: 'tree-sitter-javascript.wasm',  name: 'javascript' },
  '.jsx':    { wasm: 'tree-sitter-javascript.wasm',  name: 'javascript' },
  '.mjs':    { wasm: 'tree-sitter-javascript.wasm',  name: 'javascript' },
  '.cjs':    { wasm: 'tree-sitter-javascript.wasm',  name: 'javascript' },
  '.ts':     { wasm: 'tree-sitter-typescript.wasm',  name: 'typescript' },
  '.tsx':    { wasm: 'tree-sitter-tsx.wasm',         name: 'tsx' },
  '.py':     { wasm: 'tree-sitter-python.wasm',      name: 'python' },
  '.html':   { wasm: 'tree-sitter-html.wasm',        name: 'html' },
  '.htm':    { wasm: 'tree-sitter-html.wasm',        name: 'html' },
  '.css':    { wasm: 'tree-sitter-css.wasm',         name: 'css' },
  '.scss':   { wasm: 'tree-sitter-css.wasm',         name: 'css' },
  '.less':   { wasm: 'tree-sitter-css.wasm',         name: 'css' },
};

let _initialized = false;
const _langCache = new Map();
const _parserPool = new Map();

async function initParser() {
  if (_initialized) return;
  await Parser.init();
  _initialized = true;
}

async function loadLanguage(ext) {
  const info = SUPPORTED_LANGUAGES[ext];
  if (!info) return null;
  if (_langCache.has(info.name)) return _langCache.get(info.name);

  const wasmPath = path.join(GRAMMAR_DIR, info.wasm);
  const lang = await Language.load(wasmPath);
  _langCache.set(info.name, lang);
  return lang;
}

function getLanguageForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const info = SUPPORTED_LANGUAGES[ext];
  if (!info) return null;
  return { ext, ...info };
}

function getParserForLanguage(langName) {
  if (_parserPool.has(langName)) return _parserPool.get(langName);
  const lang = _langCache.get(langName);
  if (!lang) return null;
  const parser = new Parser();
  parser.setLanguage(lang);
  _parserPool.set(langName, parser);
  return parser;
}

function parseFile(sourceCode, filePath) {
  if (sourceCode.length > MAX_FILE_SIZE) return { symbols: [], imports: [] };

  const langInfo = getLanguageForFile(filePath);
  if (!langInfo) return { symbols: [], imports: [] };

  const parser = getParserForLanguage(langInfo.name);
  if (!parser) return { symbols: [], imports: [] };

  const tree = parser.parse(sourceCode);

  const symbols = [];
  const imports = [];
  const root = tree.rootNode;

  walkNode(root, null, symbols, langInfo.name, sourceCode);
  extractImports(root, imports, langInfo.name, sourceCode);

  return { symbols, imports };
}

function walkNode(node, parentInfo, symbols, language, sourceCode) {
  const extracted = extractSymbol(node, parentInfo, language, sourceCode);
  if (extracted) {
    symbols.push(extracted);
  }

  for (const child of node.namedChildren) {
    const parentCtx = extracted
      ? { ...(parentInfo || {}), className: extracted.type === 'class' ? extracted.name : (parentInfo?.className || null) }
      : parentInfo;
    walkNode(child, parentCtx || parentInfo, symbols, language, sourceCode);
  }
}

function extractSymbol(node, parentInfo, language, sourceCode) {
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
      return extractJSTS(node, parentInfo, sourceCode);
    case 'python':
      return extractPython(node, parentInfo, sourceCode);
    case 'css':
      return extractCSS(node, parentInfo);
    case 'html':
      return null;
    default:
      return null;
  }
}

function extractJSTS(node, parentInfo, sourceCode) {
  const type = node.type;
  const isExported = parentInfo?.isExported || false;

  // function name() {} / async function name() {}
  if (type === 'function_declaration') {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;
    const paramsNode = node.childForFieldName('parameters');
    const signature = paramsNode ? sourceCode.slice(paramsNode.startIndex, paramsNode.endIndex) : '()';
    return {
      name: sourceCode.slice(nameNode.startIndex, nameNode.endIndex),
      type: 'function',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      is_exported: isExported,
      class_name: parentInfo?.className || null,
      signature: `(${signature.slice(1, -1)})`,
    };
  }

  // class Name {}
  if (type === 'class_declaration') {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;
    return {
      name: sourceCode.slice(nameNode.startIndex, nameNode.endIndex),
      type: 'class',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      is_exported: isExported,
      class_name: null,
      signature: null,
    };
  }

  // class method
  if (type === 'method_definition') {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;
    const paramsNode = node.childForFieldName('parameters');
    const signature = paramsNode ? sourceCode.slice(paramsNode.startIndex, paramsNode.endIndex) : '()';
    return {
      name: sourceCode.slice(nameNode.startIndex, nameNode.endIndex),
      type: 'method',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      is_exported: false,
      class_name: parentInfo?.className || null,
      signature: `(${signature.slice(1, -1)})`,
    };
  }

  // const/let/var x
  if (type === 'lexical_declaration' || type === 'variable_declaration') {
    const results = [];
    const isConst = type === 'lexical_declaration' && node.type === 'lexical_declaration';

    for (const declarator of node.namedChildren) {
      if (declarator.type !== 'variable_declarator') continue;
      const nameNode = declarator.childForFieldName('name');
      if (!nameNode) continue;

      const valueNode = declarator.childForFieldName('value');
      let symbolType = 'variable';
      let signature = null;

      if (valueNode) {
        if (valueNode.type === 'arrow_function' || valueNode.type === 'function') {
          symbolType = 'function';
          const paramsNode = valueNode.childForFieldName('parameters');
          if (paramsNode) {
            signature = sourceCode.slice(paramsNode.startIndex, paramsNode.endIndex);
          }
        } else if (valueNode.type === 'class') {
          symbolType = 'class';
        }
      }

      // Determine if it's a const (constant)
      const actualType = sourceCode.slice(node.startIndex, node.startIndex + 5);
      if (actualType.startsWith('const')) {
        symbolType = symbolType === 'function' ? 'function' : 'constant';
      }

      const name = sourceCode.slice(nameNode.startIndex, nameNode.endIndex);

      return {
        name,
        type: symbolType,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        is_exported: isExported,
        class_name: parentInfo?.className || null,
        signature: signature || null,
      };
    }
    return null;
  }

  // interface Name {} (TypeScript)
  if (type === 'interface_declaration') {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;
    return {
      name: sourceCode.slice(nameNode.startIndex, nameNode.endIndex),
      type: 'interface',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      is_exported: isExported,
      class_name: null,
      signature: null,
    };
  }

  // type Name = ... (TypeScript)
  if (type === 'type_alias_declaration') {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;
    return {
      name: sourceCode.slice(nameNode.startIndex, nameNode.endIndex),
      type: 'type',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      is_exported: isExported,
      class_name: null,
      signature: null,
    };
  }

  // enum Name {} (TypeScript)
  if (type === 'enum_declaration') {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;
    return {
      name: sourceCode.slice(nameNode.startIndex, nameNode.endIndex),
      type: 'enum',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      is_exported: isExported,
      class_name: null,
      signature: null,
    };
  }

  // export statement — propagate isExported to children, don't create a symbol
  if (type === 'export_statement') {
    for (const child of node.namedChildren) {
      const childResult = extractJSTS(child, { ...(parentInfo || {}), isExported: true }, sourceCode);
      if (childResult) return childResult;
    }
    return null;
  }

  // export default ... — handle named exports inside
  if (type === 'export_default') {
    for (const child of node.namedChildren) {
      const childResult = extractJSTS(child, { ...(parentInfo || {}), isExported: true }, sourceCode);
      if (childResult) {
        childResult.name = 'default';
        return childResult;
      }
    }
    return null;
  }

  return null;
}

function extractPython(node, parentInfo, sourceCode) {
  const type = node.type;

  // def name():
  if (type === 'function_definition') {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;
    const paramsNode = node.childForFieldName('parameters');
    const signature = paramsNode ? sourceCode.slice(paramsNode.startIndex, paramsNode.endIndex) : '()';
    return {
      name: sourceCode.slice(nameNode.startIndex, nameNode.endIndex),
      type: 'function',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      is_exported: false,
      class_name: parentInfo?.className || null,
      signature: `(${signature.slice(1, -1)})`,
    };
  }

  // class Name:
  if (type === 'class_definition') {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;
    return {
      name: sourceCode.slice(nameNode.startIndex, nameNode.endIndex),
      type: 'class',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      is_exported: false,
      class_name: null,
      signature: null,
    };
  }

  // async def — wrapper, check child
  if (type === 'decorated_definition') {
    for (const child of node.namedChildren) {
      const result = extractPython(child, parentInfo, sourceCode);
      if (result) return result;
    }
    return null;
  }

  return null;
}

function extractCSS(node, parentInfo) {
  if (node.type === 'class_name') {
    return {
      name: '.' + node.text,
      type: 'class',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      is_exported: false,
      class_name: null,
      signature: null,
    };
  }
  if (node.type === 'id_name') {
    return {
      name: '#' + node.text,
      type: 'id',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      is_exported: false,
      class_name: null,
      signature: null,
    };
  }
  return null;
}

function extractImports(node, imports, language, sourceCode) {
  // Handle language-specific extraction for this node
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
      extractJSTSImports(node, imports, sourceCode);
      break;
    case 'python':
      extractPythonImports(node, imports, sourceCode);
      break;
    case 'css':
      extractCSSImports(node, imports, sourceCode);
      break;
    case 'html':
      extractHTMLImports(node, imports, sourceCode);
      break;
  }

  // Recurse into children for all languages
  for (const child of node.namedChildren) {
    extractImports(child, imports, language, sourceCode);
  }
}

function extractJSTSImports(node, imports, sourceCode) {
  const type = node.type;

  // Debug: log import-related node types
  if (type === 'import_declaration' || type === 'export_statement' || type === 'call_expression' || type === 'import_statement') {
    console.log('[Parser] JS node type=%s text=%s', type, sourceCode.slice(node.startIndex, node.endIndex).substring(0, 80));
  }

  // import X from 'path' / import { X } from 'path' / import * as X from 'path'
  if (type === 'import_declaration') {
    console.log('[Parser] found import_declaration:', sourceCode.slice(node.startIndex, node.endIndex).substring(0, 80));
    const sourceNode = node.childForFieldName('source');
    if (!sourceNode) return;
    const importPath = sourceNode.text.replace(/['"]/g, '');

    // Determine import type
    const clause = node.childForFieldName('import_clause');
    let importType = 'side-effect';
    if (clause) {
      if (clause.type === 'namespace_import') {
        importType = 'namespace';
      } else if (clause.type === 'named_imports') {
        importType = 'named';
      } else {
        const defaultName = clause.childForFieldName('name');
        if (defaultName) {
          importType = 'default';
          const namedSeen = clause.namedChildren.some(c => c.type === 'named_imports');
          if (namedSeen) importType = 'default-named';
        }
      }
    }

    imports.push({
      import_path: importPath,
      import_type: importType,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
    });
    return;
  }

  // export { X } from 'path' / export { default } from 'path'
  if (type === 'export_statement') {
    const sourceNode = node.childForFieldName('source');
    if (!sourceNode) return;
    const importPath = sourceNode.text.replace(/['"]/g, '');
    imports.push({
      import_path: importPath,
      import_type: 're-export',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
    });
    return;
  }

  // require('...')
  if (type === 'call_expression') {
    const fnNode = node.childForFieldName('function');
    if (!fnNode || fnNode.type !== 'identifier') return;
    if (fnNode.text !== 'require') return;
    const argsNode = node.childForFieldName('arguments');
    if (!argsNode) return;
    for (const arg of argsNode.namedChildren) {
      if (arg.type === 'string' || arg.type === 'template_string') {
        const importPath = arg.text.replace(/['"`]/g, '');
        imports.push({
          import_path: importPath,
          import_type: 'require',
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
        });
      }
    }
    return;
  }

  // import.meta.url / dynamic import() - skip these nodes  
  if (type === 'import_expression') return;
}

function extractPythonImports(node, imports, sourceCode) {
  const type = node.type;

  // import X / import X.Y.Z / import X as A
  if (type === 'import_statement') {
    for (const child of node.namedChildren) {
      if (child.type === 'dotted_name') {
        imports.push({
          import_path: child.text,
          import_type: 'module',
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
        });
      }
    }
    return;
  }

  // from X import Y / from X import Y as Z
  if (type === 'import_from_statement') {
    const moduleNode = node.childForFieldName('module_name');
    if (!moduleNode) return;
    const modulePath = moduleNode.text;
    imports.push({
      import_path: modulePath,
      import_type: 'from-import',
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
    });
    return;
  }
}

function extractCSSImports(node, imports, sourceCode) {
  if (node.type === 'import_rule') {
    for (const child of node.namedChildren) {
      if (child.type === 'string_value') {
        imports.push({
          import_path: child.text.replace(/['"]/g, ''),
          import_type: 'css-import',
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
        });
      }
    }
    return;
  }
}

function extractHTMLImports(node, imports, sourceCode) {
  if (node.type !== 'element') {
    // Recurse into children for non-element nodes (e.g., document root)
    for (const child of node.namedChildren) {
      extractHTMLImports(child, imports, sourceCode);
    }
    return;
  }

  let tagName = '';
  let src = null;
  let href = null;
  let rel = null;

  for (const child of node.namedChildren) {
    if (child.type === 'tag_name') {
      tagName = child.text;
    } else if (child.type === 'attribute') {
      const name = child.childForFieldName('attribute_name');
      const val = child.childForFieldName('attribute_value');
      if (!name || !val) continue;
      const n = name.text;
      const v = val.text.replace(/['"]/g, '');
      if (n === 'src') src = v;
      else if (n === 'href') href = v;
      else if (n === 'rel') rel = v;
    }
  }

  if (tagName === 'script' && src) {
    imports.push({ import_path: src, import_type: 'script', line: node.startPosition.row + 1, column: node.startPosition.column + 1 });
  } else if (tagName === 'link' && href && rel === 'stylesheet') {
    imports.push({ import_path: href, import_type: 'stylesheet', line: node.startPosition.row + 1, column: node.startPosition.column + 1 });
  }

  // Recurse into child elements (nested HTML)
  for (const child of node.namedChildren) {
    if (child.type === 'element') {
      extractHTMLImports(child, imports, sourceCode);
    }
  }
}

module.exports = { initParser, loadLanguage, parseFile, getLanguageForFile, SUPPORTED_LANGUAGES: Object.keys(SUPPORTED_LANGUAGES) };
