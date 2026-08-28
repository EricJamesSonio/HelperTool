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
    // For php/vue without wasm, use string fallback
    const needsWasm = !(ext === 'php' || ext === 'vue');
    if (!needsWasm) {
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

async function applyAddAfter(filePath, target, newContent) {
    const ext = extOf(filePath);
    // PHP/Vue fallback via string
    if (ext === 'php' || ext === 'vue') {
        const source = fs.readFileSync(filePath, 'utf-8');
        if (target === 'end') {
            const toInsert = (source.endsWith('\n') ? '' : '\n') + newContent.trim() + '\n';
            fs.writeFileSync(filePath, source + toInsert, 'utf-8');
            return { ok: true };
        }
        if (target === 'imports') {
            // for php/vue just prepend after <?php or after <script>
            const lastImportRe = /(?:import\s+.*?;|require\(.*?\);|<\?php)/g;
            let last = null, m;
            while ((m = lastImportRe.exec(source)) !== null) last = m;
            const pos = last ? last.index + last[0].length : 0;
            const indent = '';
            const before = source.slice(0, pos);
            const after = source.slice(pos);
            const toInsert = '\n' + newContent.trim() + '\n';
            fs.writeFileSync(filePath, before + toInsert + after, 'utf-8');
            return { ok: true };
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
        // ensure file ends with newline before adding
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
            // no imports, insert at top (after possible "use strict" or comments)
            insertPos = 0;
            // skip initial comments/directives? For simplicity insert at 0
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
    // Ensure we insert after the node's line, with a blank line separation
    const before = source.slice(0, insertPos);
    const after = source.slice(insertPos);
    // Avoid duplicating newlines: ensure one blank line before and after
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
    // keep one blank line before target? Inserted block already has newline after
    fs.writeFileSync(filePath, before + toInsert + after, 'utf-8');
    return { ok: true };
}

async function applyRemove(filePath, target) {
    const ext = extOf(filePath);
    if (ext === 'php' || ext === 'vue') {
        const source = fs.readFileSync(filePath, 'utf-8');
        const node = findViaString(source, target);
        if (!node) return { ok: false, reason: `target "${target}" not found` };
        let start = node.startIndex;
        while (start > 0 && source[start-1] !== '\n') start--;
        // include leading whitespace line
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
    // Remove node plus its leading indent and one trailing newline, but leave a single blank line
    const start = node.startIndex - leadingWhitespace(source, node.startIndex).length;
    let end = node.endIndex;
    // consume one trailing newline if present
    if (source[end] === '\r' && source[end+1] === '\n') end += 2;
    else if (source[end] === '\n') end += 1;
    // If next char is also newline (blank line), keep one blank line
    let patched = source.slice(0, start) + source.slice(end);
    // Ensure we leave exactly one blank line where node was (so file doesn't have triple blanks)
    // If patched has \n\n\n where node was, collapse to \n\n
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
        const source = fs.readFileSync(filePath, 'utf-8');
        const node = findViaString(source, target);
        if (!node) return { ok: false, reason: `target "${target}" not found` };
        const indent = source.slice(node.startIndex - (source.slice(0, node.startIndex).split('\n').pop().match(/^[ \t]*/)[0].length), node.startIndex).match(/^[ \t]*/)?.[0] || '';
        // simpler indent
        const ws = source.slice(0, node.startIndex).split('\n').pop().match(/^[ \t]*/)[0];
        const reindented = newContent.trim().split('\n').map((l,i)=> i===0?l: ws + l).join('\n');
        const patched = source.slice(0, node.startIndex) + reindented + source.slice(node.endIndex);
        fs.writeFileSync(filePath, patched, 'utf-8');
        return { ok: true };
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

module.exports = { applyUpdate, canPatch, applyAddAfter, applyAddBefore, applyRemove, applySurgical };
