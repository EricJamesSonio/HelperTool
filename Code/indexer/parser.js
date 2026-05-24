const path = require('path');
const { Parser, Language } = require('web-tree-sitter');

const GRAMMAR_DIR = path.join(__dirname, '..', 'grammars');
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

function parseFile(sourceCode, filePath) {
  const langInfo = getLanguageForFile(filePath);
  if (!langInfo) return [];

  const lang = _langCache.get(langInfo.name);
  if (!lang) return [];

  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(sourceCode);

  const symbols = [];
  const root = tree.rootNode;

  walkNode(root, null, symbols, langInfo.name, sourceCode);
  parser.delete();

  return symbols;
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

module.exports = { initParser, loadLanguage, parseFile, getLanguageForFile, SUPPORTED_LANGUAGES: Object.keys(SUPPORTED_LANGUAGES) };
