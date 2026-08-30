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
    php: 'php',
    vue: 'vue',
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
async function tryLoadLanguage(lang) {
    try {
        return await loadLanguage(lang);
    } catch (err) {
        return null;
    }
}

async function findGrammarNode(filePath, lang, target) {
    const Lang = await tryLoadLanguage(lang);
    if (!Lang) return null;
    const source = fs.readFileSync(filePath, 'utf-8');
    const parser = new Parser();
    parser.setLanguage(Lang);
    const tree = parser.parse(source);
    const node = findNamedNode(tree.rootNode, target);
    if (!node) return null;
    return { node, source };
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
    // Tree-sitter JSON wraps in expression_statement > object; find the root object
    let cur = rootNode;
    if (cur.type === 'program' && cur.namedChildCount === 1) {
        const only = cur.namedChild(0);
        if (only.type === 'expression_statement') {
            const obj = only.childForFieldName('value') || only.namedChild(0);
            if (obj && obj.type === 'object') cur = obj;
        } else if (only.type === 'object') {
            cur = only;
        }
    }
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
                    return; // stop walk — don't let inner variable_declarator overwrite found
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
            // climb from lexical/variable/function_declaration into export_statement so the
            // whole `export const ...` / `export function ...` is patched (avoids orphaned `export` keyword)
            if ((n.type === 'lexical_declaration' || n.type === 'variable_declaration' || n.type === 'function_declaration' || n.type === 'class_declaration') && n.parent && n.parent.type === 'export_statement') {
                n = n.parent;
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

function findLastImport(rootNode) {
    let last = null;
    (function walk(node) {
        if (node.type === 'import_statement') last = node;
        for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    })(rootNode);
    return last;
}

function findViaString(source, target) {
    // Fallback for php/vue or when wasm missing: simple regex for function/class/const
    const esc = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
        `function\\s+${esc}\\b`,
        `class\\s+${esc}\\b`,
        `(?:const|let|var)\\s+${esc}\\b`,
        `def\\s+${esc}\\b`, // python
        `<\\s*${esc}[\\s>]`, // html/vue tag
        `\\$${esc}\\b`, // php variable
        `\\b${esc}\\s*\\(`, // method like calculateTotal( for vue/js object
    ];
    for (const pat of patterns) {
        const re = new RegExp(pat, 'm');
        const m = re.exec(source);
        if (m) {
            const start = m.index;
            // Find end of block: for function/class, find matching closing } via simple brace count
            // For fallback, just return a small range around the match (will be used for replace)
            // We return the line containing the match as a minimal node
            let end = source.indexOf('\n', start);
            if (end === -1) end = source.length;
            // Try to find the block end by braces
            const after = source.slice(start);
            let depth = 0, foundBrace = false;
            for (let i = 0; i < after.length; i++) {
                if (after[i] === '{') { depth++; foundBrace = true; }
                else if (after[i] === '}') { depth--; if (foundBrace && depth === 0) { end = start + i + 1; break; } }
            }
            if (end <= start) end = start + m[0].length;
            return { startIndex: start, endIndex: end, text: source.slice(start, end) };
        }
    }
    return null;
}

async function canPatch(filePath, target, mode = 'update') {
    const ext = extOf(filePath);
    const lang = EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
    if (!lang && ext !== 'php' && ext !== 'vue') return { ok: false, reason: `no grammar for .${ext}` };
    if ((mode === 'addAfter' || mode === 'addBefore') && (target === 'end' || target === 'imports')) {
        return { ok: true };
    }
    if (ext === 'php' || ext === 'vue') {
        const grammarLang = ext === 'php' ? 'php' : 'vue';
        const found = await findGrammarNode(filePath, grammarLang, target);
        if (found) return { ok: true };
        // fall back to string match
        try {
            const src = fs.readFileSync(filePath, 'utf-8');
            const node = findViaString(src, target);
            if (!node) return { ok: false, reason: `target "${target}" not found` };
            return { ok: true };
        } catch (e) { return { ok: false, reason: e.message }; }
    }
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
function getLeadingModifiers(text) {
    const m = text.match(/^\s*(export\s+default\s+|export\s+)?(async\s+)?/);
    return {
        exportPrefix: m && m[1] ? m[1].trim().replace(/\s+/g, ' ') + ' ' : '',
        asyncPrefix: m && m[2] ? 'async ' : '',
    };
}

function reconcileModifiers(originalNodeText, newContent) {
    const orig = getLeadingModifiers(originalNodeText);
    const trimmedNew = newContent.trim();
    const incoming = getLeadingModifiers(trimmedNew);
    let restored = '';
    if (orig.exportPrefix && !incoming.exportPrefix) restored += orig.exportPrefix;
    if (orig.asyncPrefix && !incoming.asyncPrefix) restored += orig.asyncPrefix;
    if (!restored) return { content: newContent, restoredPrefix: null };
    return { content: restored + trimmedNew, restoredPrefix: restored.trim() };
}

async function applyAddAfter(filePath, target, newContent) {
    const ext = extOf(filePath);
    if (ext === 'php' || ext === 'vue') {
        const source = fs.readFileSync(filePath, 'utf-8');
        if (target === 'end') {
            const toInsert = (source.endsWith('\n') ? '' : '\n') + newContent.trim() + '\n';
            fs.writeFileSync(filePath, source + toInsert, 'utf-8');
            return { ok: true };
        }
        if (target === 'imports') {
            const lastImportRe = /(?:import\s+.*?;|require\(.*?\);|<\?php)/g;
            let last = null, m;
            while ((m = lastImportRe.exec(source)) !== null) last = m;
            const pos = last ? last.index + last[0].length : 0;
            const before = source.slice(0, pos);
            const after = source.slice(pos);
            const toInsert = '\n' + newContent.trim() + '\n';
            fs.writeFileSync(filePath, before + toInsert + after, 'utf-8');
            return { ok: true };
        }
        const grammarLang = ext === 'php' ? 'php' : 'vue';
        const found = await findGrammarNode(filePath, grammarLang, target);
        if (found) {
            const { node, source: src } = found;
            const indent = leadingWhitespace(src, node.startIndex);
            const before = src.slice(0, node.endIndex);
            const after = src.slice(node.endIndex);
            const needsLeadingNewline = !before.endsWith('\n');
            let toInsert = needsLeadingNewline ? '\n' : '';
            toInsert += reindent(newContent.trim(), indent) + '\n';
            fs.writeFileSync(filePath, before + toInsert + after, 'utf-8');
            return { ok: true, viaGrammar: true };
        }
        const node = findViaString(source, target);
        if (!node) return { ok: false, reason: `target "${target}" not found` };
        const before = source.slice(0, node.endIndex);
        const after = source.slice(node.endIndex);
        const toInsert = '\n' + newContent.trim() + '\n';
        fs.writeFileSync(filePath, before + toInsert + after, 'utf-8');
        return { ok: true };
    }
    const lang = EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
    if (!lang) return { ok: false, reason: `no grammar for .${ext}` };
    const Lang = await loadLanguage(lang === 'javascript' && ext === 'json' ? 'javascript' : lang);
    const source = fs.readFileSync(filePath, 'utf-8');
    const parser = new Parser();
    parser.setLanguage(Lang);
    const tree = parser.parse(source);
    let insertPos = null;
    let indent = '';
    if (target === 'end') {
        insertPos = source.length;
        const needsNewline = !source.endsWith('\n');
        const toInsert = (needsNewline ? '\n' : '') + newContent.trim() + '\n';
        fs.writeFileSync(filePath, source + toInsert, 'utf-8');
        return { ok: true };
    }
    if (target === 'imports') {
        const lastImport = findLastImport(tree.rootNode);
        if (lastImport) {
            insertPos = lastImport.endIndex;
            indent = leadingWhitespace(source, lastImport.startIndex);
        } else {
            insertPos = 0;
        }
    } else {
        let node = null;
        if (lang === 'css') node = findCssRule(tree.rootNode, target);
        else if (ext === 'json') node = findJsonPath(tree.rootNode, target) || findNamedNode(tree.rootNode, target);
        else node = findNamedNode(tree.rootNode, target);
        if (!node) return { ok: false, reason: `target "${target}" not found` };
        insertPos = node.endIndex;
        indent = leadingWhitespace(source, node.startIndex);
    }
    const before = source.slice(0, insertPos);
    const after = source.slice(insertPos);
    const needsLeadingNewline = !before.endsWith('\n');
    const needsTrailingNewline = !after.startsWith('\n');
    let toInsert = '';
    if (needsLeadingNewline) toInsert += '\n';
    else if (!before.endsWith('\n\n')) toInsert += '\n';
    toInsert += reindent(newContent.trim(), indent);
    if (needsTrailingNewline) toInsert += '\n';
    else if (!after.startsWith('\n\n')) toInsert += '\n';
    fs.writeFileSync(filePath, before + toInsert + after, 'utf-8');
    return { ok: true };
}

async function applyAddBefore(filePath, target, newContent) {
    const ext = extOf(filePath);
    if (ext === 'php' || ext === 'vue') {
        const grammarLang = ext === 'php' ? 'php' : 'vue';
        const found = await findGrammarNode(filePath, grammarLang, target);
        if (found) {
            const { node, source } = found;
            const indent = leadingWhitespace(source, node.startIndex);
            const before = source.slice(0, node.startIndex);
            const after = source.slice(node.startIndex);
            let toInsert = reindent(newContent.trim(), indent) + '\n';
            if (!before.endsWith('\n')) toInsert = '\n' + toInsert;
            fs.writeFileSync(filePath, before + toInsert + after, 'utf-8');
            return { ok: true, viaGrammar: true };
        }
        const source = fs.readFileSync(filePath, 'utf-8');
        const node = findViaString(source, target);
        if (!node) return { ok: false, reason: `target "${target}" not found` };
        const before = source.slice(0, node.startIndex);
        const after = source.slice(node.startIndex);
        const toInsert = newContent.trim() + '\n';
        fs.writeFileSync(filePath, before + toInsert + after, 'utf-8');
        return { ok: true };
    }
    const lang = EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
    if (!lang) return { ok: false, reason: `no grammar for .${ext}` };
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
    const indent = leadingWhitespace(source, node.startIndex);
    const before = source.slice(0, node.startIndex);
    const after = source.slice(node.startIndex);
    let toInsert = reindent(newContent.trim(), indent) + '\n';
    if (!before.endsWith('\n')) toInsert = '\n' + toInsert;
    fs.writeFileSync(filePath, before + toInsert + after, 'utf-8');
    return { ok: true };
}

async function applyRemove(filePath, target) {
    const ext = extOf(filePath);
    if (ext === 'php' || ext === 'vue') {
        const grammarLang = ext === 'php' ? 'php' : 'vue';
        const found = await findGrammarNode(filePath, grammarLang, target);
        if (found) {
            const { node, source } = found;
            let start = node.startIndex - leadingWhitespace(source, node.startIndex).length;
            let end = node.endIndex;
            if (source[end] === '\r' && source[end+1] === '\n') end += 2;
            else if (source[end] === '\n') end += 1;
            let patched = source.slice(0, start) + source.slice(end);
            patched = patched.replace(/\n{3,}/g, '\n\n');
            fs.writeFileSync(filePath, patched, 'utf-8');
            return { ok: true, viaGrammar: true };
        }
        const source = fs.readFileSync(filePath, 'utf-8');
        const node = findViaString(source, target);
        if (!node) return { ok: false, reason: `target "${target}" not found` };
        let start = node.startIndex;
        while (start > 0 && source[start-1] !== '\n') start--;
        const wsLen = source.slice(start, node.startIndex).match(/^[ \t]*/)[0].length;
        start = node.startIndex - wsLen;
        let end = node.endIndex;
        if (source[end] === '\r' && source[end+1] === '\n') end+=2;
        else if (source[end] === '\n') end+=1;
        let patched = source.slice(0, start) + source.slice(end);
        patched = patched.replace(/\n{3,}/g, '\n\n');
        fs.writeFileSync(filePath, patched, 'utf-8');
        return { ok: true };
    }
    const lang = EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
    if (!lang) return { ok: false, reason: `no grammar for .${ext}` };
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
    const start = node.startIndex - leadingWhitespace(source, node.startIndex).length;
    let end = node.endIndex;
    if (source[end] === '\r' && source[end+1] === '\n') end += 2;
    else if (source[end] === '\n') end += 1;
    let patched = source.slice(0, start) + source.slice(end);
    patched = patched.replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(filePath, patched, 'utf-8');
    return { ok: true };
}

async function applySurgical(filePath, mode, target, newContent) {
    const m = (mode||'').toLowerCase();
    if (m === 'addafter') return applyAddAfter(filePath, target, newContent);
    if (m === 'addbefore') return applyAddBefore(filePath, target, newContent);
    if (m === 'remove') return applyRemove(filePath, target);
    // replace/update
    return applyUpdate(filePath, target, newContent);
}

/**
 * Applies a surgical update to `filePath`, replacing only the node matching
 * `target` with `newContent`. Returns { ok: true } on success or
 * { ok: false, reason } if the target couldn't be located (caller should
 * fall back to a full overwrite).
 */
async function applyUpdate(filePath, target, newContent) {
    const ext = extOf(filePath);
    if (ext === 'php' || ext === 'vue') {
        const grammarLang = ext === 'php' ? 'php' : 'vue';
        const found = await findGrammarNode(filePath, grammarLang, target);
        if (found) {
            const { node, source } = found;
            const indent = leadingWhitespace(source, node.startIndex);
            const { content: reconciled, restoredPrefix } = reconcileModifiers(node.text, newContent);
            const replacement = reindent(reconciled.trim(), indent);
            const patched = source.slice(0, node.startIndex) + replacement + source.slice(node.endIndex);
            fs.writeFileSync(filePath, patched, 'utf-8');
            return { ok: true, restoredPrefix, viaGrammar: true };
        }
        // fall back to string match
        const source = fs.readFileSync(filePath, 'utf-8');
        const node = findViaString(source, target);
        if (!node) return { ok: false, reason: `target "${target}" not found` };
        const ws = source.slice(0, node.startIndex).split('\n').pop().match(/^[ \t]*/)[0];
        const { content: reconciled, restoredPrefix } = reconcileModifiers(node.text, newContent);
        const reindented = reconciled.trim().split('\n').map((l,i)=> i===0?l: ws + l).join('\n');
        const patched = source.slice(0, node.startIndex) + reindented + source.slice(node.endIndex);
        fs.writeFileSync(filePath, patched, 'utf-8');
        return { ok: true, restoredPrefix };
    }
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
        node = findJsonPath(tree.rootNode, target) || findNamedNode(tree.rootNode, target);
    } else {
        node = findNamedNode(tree.rootNode, target);
    }

    if (!node) return { ok: false, reason: `target "${target}" not found in ${filePath}` };

    let replaceNode = node;
    if (node.type === 'pair') {
        const val = node.childForFieldName('value');
        if (val) replaceNode = val;
    }

    let contentToWrite = newContent;
    let restoredPrefix = null;
    if (replaceNode.type === 'export_statement' || /^(export|async)\b/.test(replaceNode.text.trim())) {
        const reconciled = reconcileModifiers(replaceNode.text, newContent);
        contentToWrite = reconciled.content;
        restoredPrefix = reconciled.restoredPrefix;
    }

    const indent = leadingWhitespace(source, replaceNode.startIndex);
    const replacement = reindent(contentToWrite.trim(), indent);
    const patched = source.slice(0, replaceNode.startIndex) + replacement + source.slice(replaceNode.endIndex);

    fs.writeFileSync(filePath, patched, 'utf-8');
    return { ok: true, restoredPrefix };
}


async function getDryPatchedContent(filePath, mode, target, newContent) {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const exists = fs.existsSync(filePath);
    if (!exists) {
        return newContent ?? '';
    }
    const source = fs.readFileSync(filePath, 'utf-8');
    const m = (mode||'').toLowerCase();
    if (m === 'addafter') {
        if (target === 'end') return source + (source.endsWith('\n') ? '' : '\n') + (newContent||'').trim() + '\n';
        if (target === 'imports') {
            const lastImportRe = /(?:import\s+.*?;|require\(.*?\);|<\?php)/g;
            let last = null, mm;
            while ((mm = lastImportRe.exec(source)) !== null) last = mm;
            if (last) {
                const pos = last.index + last[0].length;
                return source.slice(0, pos) + '\n' + (newContent||'').trim() + '\n' + source.slice(pos);
            }
            return (newContent||'').trim() + '\n' + source;
        }
        if (ext === 'php' || ext === 'vue') {
            const grammarLang = ext === 'php' ? 'php' : 'vue';
            const found = await findGrammarNode(filePath, grammarLang, target);
            if (found) {
                const { node, source: src } = found;
                const indent = leadingWhitespace(src, node.startIndex);
                const before = src.slice(0, node.endIndex);
                const after = src.slice(node.endIndex);
                return before + '\n' + reindent((newContent||'').trim(), indent) + '\n' + after;
            }
            const node = findViaString(source, target);
            if (!node) return source;
            const before = source.slice(0, node.endIndex);
            const after = source.slice(node.endIndex);
            return before + '\n' + (newContent||'').trim() + '\n' + after;
        }
        try {
            const lang = EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
            if (!lang) return source;
            const Lang = await loadLanguage(lang === 'javascript' && ext === 'json' ? 'javascript' : lang);
            const parser = new Parser();
            parser.setLanguage(Lang);
            const tree = parser.parse(source);
            let node2 = null;
            if (lang === 'css') node2 = findCssRule(tree.rootNode, target);
            else if (ext === 'json') node2 = findJsonPath(tree.rootNode, target) || findNamedNode(tree.rootNode, target);
            else node2 = findNamedNode(tree.rootNode, target);
            if (!node2) return source;
            const before2 = source.slice(0, node2.endIndex);
            const after2 = source.slice(node2.endIndex);
            const indent = leadingWhitespace(source, node2.startIndex);
            const toInsert = '\n' + reindent((newContent||'').trim(), indent) + '\n';
            return before2 + toInsert + after2;
        } catch { return source; }
    }
    if (m === 'addbefore') {
        if (ext === 'php' || ext === 'vue') {
            const grammarLang = ext === 'php' ? 'php' : 'vue';
            const found = await findGrammarNode(filePath, grammarLang, target);
            if (found) {
                const { node, source: src } = found;
                const indent = leadingWhitespace(src, node.startIndex);
                return src.slice(0, node.startIndex) + reindent((newContent||'').trim(), indent) + '\n' + src.slice(node.startIndex);
            }
            const node = findViaString(source, target);
            if (!node) return source;
            return source.slice(0, node.startIndex) + (newContent||'').trim() + '\n' + source.slice(node.startIndex);
        }
        try {
            const lang = EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
            if (!lang) return source;
            const Lang = await loadLanguage(lang === 'javascript' && ext === 'json' ? 'javascript' : lang);
            const parser = new Parser();
            parser.setLanguage(Lang);
            const tree = parser.parse(source);
            let node2 = null;
            if (lang === 'css') node2 = findCssRule(tree.rootNode, target);
            else if (ext === 'json') node2 = findJsonPath(tree.rootNode, target) || findNamedNode(tree.rootNode, target);
            else node2 = findNamedNode(tree.rootNode, target);
            if (!node2) return source;
            const indent = leadingWhitespace(source, node2.startIndex);
            return source.slice(0, node2.startIndex) + reindent((newContent||'').trim(), indent) + '\n' + source.slice(node2.startIndex);
        } catch { return source; }
    }
    if (m === 'remove') {
        if (ext === 'php' || ext === 'vue') {
            const grammarLang = ext === 'php' ? 'php' : 'vue';
            const found = await findGrammarNode(filePath, grammarLang, target);
            if (found) {
                const { node, source: src } = found;
                let start = node.startIndex - leadingWhitespace(src, node.startIndex).length;
                let end = node.endIndex;
                if (src[end] === '\n') end++;
                let patched = src.slice(0, start) + src.slice(end);
                patched = patched.replace(/\n{3,}/g, '\n\n');
                return patched;
            }
            const node = findViaString(source, target);
            if (!node) return source;
            let start = node.startIndex;
            while (start > 0 && source[start-1] !== '\n') start--;
            let end = node.endIndex;
            if (source[end] === '\n') end++;
            let patched = source.slice(0, start) + source.slice(end);
            patched = patched.replace(/\n{3,}/g, '\n\n');
            return patched;
        }
        try {
            const lang = EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
            if (!lang) return source;
            const Lang = await loadLanguage(lang === 'javascript' && ext === 'json' ? 'javascript' : lang);
            const parser = new Parser();
            parser.setLanguage(Lang);
            const tree = parser.parse(source);
            let node2 = null;
            if (lang === 'css') node2 = findCssRule(tree.rootNode, target);
            else if (ext === 'json') node2 = findJsonPath(tree.rootNode, target) || findNamedNode(tree.rootNode, target);
            else node2 = findNamedNode(tree.rootNode, target);
            if (!node2) return source;
            const start = node2.startIndex - leadingWhitespace(source, node2.startIndex).length;
            let end = node2.endIndex;
            if (source[end] === '\n') end++;
            let patched = source.slice(0, start) + source.slice(end);
            patched = patched.replace(/\n{3,}/g, '\n\n');
            return patched;
        } catch { return source; }
    }
    const node = ext === 'php' || ext === 'vue' ? findViaString(source, target) : null;
    if (ext === 'php' || ext === 'vue') {
        if (!node) return source;
        const ws = source.slice(0, node.startIndex).split('\n').pop().match(/^[ \t]*/)[0];
        const reindented = (newContent||'').trim().split('\n').map((l,i)=> i===0?l: ws + l).join('\n');
        return source.slice(0, node.startIndex) + reindented + source.slice(node.endIndex);
    }
    try {
        const lang = EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
        if (!lang) return source;
        const Lang = await loadLanguage(lang === 'javascript' && ext === 'json' ? 'javascript' : lang);
        const parser = new Parser();
        parser.setLanguage(Lang);
        const tree = parser.parse(source);
        let node2 = null;
        if (lang === 'css') node2 = findCssRule(tree.rootNode, target);
        else if (ext === 'json') node2 = findJsonPath(tree.rootNode, target) || findNamedNode(tree.rootNode, target);
        else node2 = findNamedNode(tree.rootNode, target);
        if (!node2) return source;
        const indent = leadingWhitespace(source, node2.startIndex);
        const replacement = reindent((newContent||'').trim(), indent);
        return source.slice(0, node2.startIndex) + replacement + source.slice(node2.endIndex);
    } catch { return source; }
}

module.exports = { applyUpdate, canPatch, applyAddAfter, applyAddBefore, applyRemove, applySurgical, getDryPatchedContent };
