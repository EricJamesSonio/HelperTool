'use strict';

/**
 * Vue SFC block helpers.
 *
 * The tree-sitter Vue grammar parses <template> as markup but keeps the body
 * of <script> and <style> as an opaque `raw_text` node — so no AST targeting
 * is possible inside a .vue file with the Vue grammar alone.
 *
 * This module locates those blocks, re-parses their content with the
 * JavaScript/TypeScript (or CSS) grammar and maps the resulting node offsets
 * back into the original file, so a .vue file gets the same targeting quality
 * as a .ts/.tsx file.
 */

const grammarLoader = require('./grammarLoader');

const SCRIPT_LANG_BY_ATTR = {
    js: 'javascript', javascript: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', typescript: 'typescript', tsx: 'tsx',
};

function attrValue(attrs, name) {
    if (!attrs) return null;
    const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
    return m ? m[1].toLowerCase() : null;
}

function langForScriptBlock(attrs) {
    const lang = attrValue(attrs, 'lang');
    if (lang && SCRIPT_LANG_BY_ATTR[lang]) return SCRIPT_LANG_BY_ATTR[lang];
    return 'javascript';
}

// Blank out everything before the block but keep the newlines, so the parsed
// offsets and line numbers stay absolute to the original file.
function padPrefix(source, start) {
    if (start <= 0) return '';
    return source.slice(0, start).replace(/[^\n]/g, ' ');
}

function collectBlocks(rootNode) {
    const blocks = [];
    (function walk(node) {
        if (node.type === 'script_element' || node.type === 'style_element') {
            const raw = node.children.find(c => c.type === 'raw_text');
            const startTag = node.children.find(c => c.type === 'start_tag');
            if (raw) {
                blocks.push({
                    kind: node.type === 'script_element' ? 'script' : 'style',
                    attrs: startTag ? startTag.text : '',
                    start: raw.startIndex,
                    end: raw.endIndex,
                });
            }
        }
        for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    })(rootNode);
    return blocks;
}

async function getVueBlocks(source) {
    const tree = await grammarLoader.tryParseSource('vue', source);
    if (!tree) return null;
    return collectBlocks(tree.rootNode);
}

/**
 * Find a node inside a <script> block.
 * `finder(rootNode, target)` must return a tree-sitter node or null.
 */
async function findInScript(source, blocks, target, finder) {
    if (!blocks) return null;
    for (const block of blocks) {
        if (block.kind !== 'script') continue;
        const lang = langForScriptBlock(block.attrs);
        const padded = padPrefix(source, block.start) + source.slice(block.start, block.end);
        const tree = await grammarLoader.tryParseSource(lang, padded);
        if (!tree) continue;
        const node = finder(tree.rootNode, target);
        if (node) return { node, viaGrammar: true, block, lang };
    }
    return null;
}

/**
 * Find a CSS rule inside a <style> block.
 */
async function findInStyle(source, blocks, target, finder) {
    if (!blocks) return null;
    for (const block of blocks) {
        if (block.kind !== 'style') continue;
        const padded = padPrefix(source, block.start) + source.slice(block.start, block.end);
        const tree = await grammarLoader.tryParseSource('css', padded);
        if (!tree) continue;
        const node = finder(tree.rootNode, target);
        if (node) return { node, viaGrammar: true, block, lang: 'css' };
    }
    return null;
}

/**
 * Find an element inside the <template> block by tag name or CSS class.
 */
function findTemplateNode(rootNode, target) {
    const wanted = String(target).trim();
    let template = null;
    (function findTpl(node) {
        if (template) return;
        if (node.type === 'template_element') { template = node; return; }
        for (let i = 0; i < node.childCount; i++) findTpl(node.child(i));
    })(rootNode);
    if (!template) return null;

    let found = null;
    (function walk(node) {
        if (found) return;
        if (node.type === 'element' || node.type === 'self_closing_tag') {
            const tag = node.children.find(c => c.type === 'tag_name');
            if (tag && tag.text === wanted) { found = node; return; }
            // attributes live inside the start_tag
            const startTag = node.children.find(c => c.type === 'start_tag');
            if (!startTag) return;
            for (const attr of startTag.children.filter(c => c.type === 'attribute')) {
                const name = attr.children.find(c => c.type === 'attribute_name');
                if (!name || name.text !== 'class') continue;
                const value = attr.children.find(c => c.type === 'quoted_attribute_value' || c.type === 'attribute_value');
                if (!value) continue;
                const classes = value.text.replace(/^["']|["']$/g, '').split(/\s+/);
                if (classes.includes(wanted)) { found = node; return; }
            }
        }
        for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    })(template);
    return found;
}

/**
 * Find the last import statement inside a <script> block.
 * Returns { endIndex, startIndex } in absolute file coordinates, or null.
 */
async function findLastScriptImport(source, blocks) {
    if (!blocks) return null;
    let last = null;
    for (const block of blocks) {
        if (block.kind !== 'script') continue;
        const lang = langForScriptBlock(block.attrs);
        const padded = padPrefix(source, block.start) + source.slice(block.start, block.end);
        const tree = await grammarLoader.tryParseSource(lang, padded);
        if (!tree) continue;
        (function walk(node) {
            if (node.type === 'import_statement') last = node;
            for (let i = 0; i < node.childCount; i++) walk(node.child(i));
        })(tree.rootNode);
    }
    if (!last) return null;
    return { startIndex: last.startIndex, endIndex: last.endIndex, text: last.text };
}

module.exports = {
    getVueBlocks,
    findInScript,
    findInStyle,
    findTemplateNode,
    findLastScriptImport,
    langForScriptBlock,
    attrValue,
};
