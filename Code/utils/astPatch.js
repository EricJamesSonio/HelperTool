'use strict';

const fs = require('fs');
const path = require('path');
const WTS = require('web-tree-sitter');
const Parser = WTS.Parser || WTS.default || WTS;
const Language = WTS.Language || (WTS.Parser && WTS.Parser.Language) || Parser.Language;
const GRAMMAR_DIR = path.join(__dirname, '..', 'grammars');

const EXT_LANG = {
    css: 'css', scss: 'css',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
};

let initPromise = null;
const langCache = new Map();

async function ensureInit() {
    if (!initPromise) initPromise = Parser.init({
        locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'web-tree-sitter', file),
    });
    return initPromise;
}

async function loadLanguage(lang) {
    if (langCache.has(lang)) return langCache.get(lang);
    await ensureInit();
    const wasmPath = path.join(GRAMMAR_DIR, `tree-sitter-${lang}.wasm`);
    const LangCtor = Language || Parser.Language;
    const Lang = await LangCtor.load(wasmPath);
    langCache.set(lang, Lang);
    return Lang;
}

function extOf(filePath) {
    return path.extname(filePath).slice(1).toLowerCase();
}

// ---- CSS: find a rule_set whose selector text matches target exactly ----
function findCssRule(rootNode, target) {
    const norm = target.replace(/\s+/g, ' ').trim();
    let found = null;
    (function walk(node) {
        if (found) return;
        if (node.type === 'rule_set') {
            const block = node.children.find(c => c.type === 'block');
            const selText = node.children
                .filter(c => c !== block)
                .map(c => c.text)
                .join('')
                .replace(/\s+/g, ' ')
                .trim();
            if (selText === norm) { found = node; return; }
        }
        for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    })(rootNode);
    return found;
}

// ---- JSON: dot-path traversal ----
function findJsonPath(rootNode, target) {
    const parts = target.split('.');
    let cur = rootNode;
    for (const key of parts) {
        let found = null;
        // object → pair → key
        for (let i = 0; i < cur.childCount; i++) {
            const child = cur.child(i);
            if (child.type === 'pair') {
                const k = child.childForFieldName('key');
                if (k) {
                    const raw = k.text.replace(/^["']|["']$/g, '');
                    if (raw === key) { found = child; break; }
                }
            }
        }
        if (!found) return null;
        // last segment → return the pair; intermediate → descend into value
        if (key === parts[parts.length - 1]) return found;
        const val = found.childForFieldName('value');
        if (!val || val.type !== 'object') return null;
        cur = val;
    }
    return null;
}

// ---- JS/TS/TSX/Python: find a node whose `name` field matches target ----
function findNamedNode(rootNode, target) {
    let found = null;
    (function walk(node) {
        if (found) return;
        // direct export_statement wrapping a function/class — patch the whole export so `export` is not duplicated
        if (node.type === 'export_statement') {
            for (let i = 0; i < node.namedChildCount; i++) {
                const child = node.namedChild(i);
                const nameNode = child.childForFieldName && child.childForFieldName('name');
                if (nameNode && nameNode.text === target) {
                    found = node;
                    return;
                }
            }
        }
        const nameNode = node.childForFieldName && node.childForFieldName('name');
        if (nameNode && nameNode.text === target) {
            let n = node;
            if (n.type === 'variable_declarator') {
                const parent = n.parent;
                if (parent && (parent.type === 'lexical_declaration' || parent.type === 'variable_declaration')) {
                    const declarators = parent.namedChildren.filter(c => c.type === 'variable_declarator');
                    if (declarators.length === 1) n = parent;
                }
            }
            found = n;
            return;
        }
        // json: also check pair keys as names
        if (node.type === 'pair') {
            const k = node.childForFieldName('key');
            if (k && k.text.replace(/^["']|["']$/g,'') === target) {
                found = node;
                return;
            }
        }
        for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    })(rootNode);
    return found;
}

async function canPatch(filePath, target) {
    const ext = extOf(filePath);
    const lang = EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
    if (!lang) return { ok: false, reason: `no grammar for .${ext}` };
    try {
        const Lang = await loadLanguage(lang === 'javascript' && ext === 'json' ? 'javascript' : lang);
        const source = fs.readFileSync(filePath, 'utf-8');
        const parser = new Parser();
        parser.setLanguage(Lang);
        const tree = parser.parse(source);
        let node = null;
        if (lang === 'css') node = findCssRule(tree.rootNode, target);
        else if (ext === 'json') node = findJsonPath(tree.rootNode, target) || findNamedNode(tree.rootNode, target);
        else node = findNamedNode(tree.rootNode, target);
        if (!node) return { ok: false, reason: `target "${target}" not found` };
        return { ok: true };
    } catch (err) {
        return { ok: false, reason: err.message };
    }
}

function leadingWhitespace(source, index) {
    let start = index;
    while (start > 0 && source[start - 1] !== '\n') start--;
    const line = source.slice(start, index);
    const match = line.match(/^[ \t]*/);
    return match ? match[0] : '';
}

function reindent(newBlock, indent) {
    const lines = newBlock.replace(/\r\n/g, '\n').split('\n');
    return lines.map((l, i) => (i === 0 ? l : indent + l)).join('\n');
}

/**
 * Applies a surgical update to `filePath`, replacing only the node matching
 * `target` with `newContent`. Returns { ok: true } on success or
 * { ok: false, reason } if the target couldn't be located (caller should
 * fall back to a full overwrite).
 */
async function applyUpdate(filePath, target, newContent) {
    const ext = extOf(filePath);
    // JSON handled via json language (same wasm as javascript handles json? use javascript grammar as fallback)
    const lang = EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
    if (!lang) return { ok: false, reason: `no grammar for .${ext}` };

    let Lang;
    try {
        Lang = await loadLanguage(lang === 'javascript' && ext === 'json' ? 'javascript' : lang);
    } catch (err) {
        return { ok: false, reason: `grammar load failed: ${err.message}` };
    }

    const source = fs.readFileSync(filePath, 'utf-8');
    const parser = new Parser();
    parser.setLanguage(Lang);
    const tree = parser.parse(source);

    let node = null;
    if (lang === 'css') {
        node = findCssRule(tree.rootNode, target);
    } else if (ext === 'json') {
        // try dot-path first, then plain name
        node = findJsonPath(tree.rootNode, target) || findNamedNode(tree.rootNode, target);
    } else {
        node = findNamedNode(tree.rootNode, target);
    }

    if (!node) return { ok: false, reason: `target "${target}" not found in ${filePath}` };

    const indent = leadingWhitespace(source, node.startIndex);
    const replacement = reindent(newContent.trim(), indent);
    const patched = source.slice(0, node.startIndex) + replacement + source.slice(node.endIndex);

    fs.writeFileSync(filePath, patched, 'utf-8');
    return { ok: true };
}

module.exports = { applyUpdate, canPatch };
