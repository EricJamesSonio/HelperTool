'use strict';

const fs = require('fs');
const grammarLoader = require('./grammarLoader');
const vueBlocks = require('./vueBlocks');
const { findCssRule, findJsonPath, findNamedNode, findLastImport, findViaString, findPhpUses, findPhpNamespace, findPhpOpenTag } = require('./nodeFinders');
const { extOf, leadingWhitespace, reindent, reconcileModifiers } = require('./textUtils');

// --- Vue: locate a node inside <script> / <style> / <template> -------------

async function locateInVue(source, target) {
    const blocks = await vueBlocks.getVueBlocks(source);
    if (blocks) {
        // 1. <script> — real JS/TS AST
        const inScript = await vueBlocks.findInScript(source, blocks, target, findNamedNode);
        if (inScript) return { node: inScript.node, viaGrammar: true };
        // 2. <style> — CSS rules
        const inStyle = await vueBlocks.findInStyle(source, blocks, target, findCssRule);
        if (inStyle) return { node: inStyle.node, viaGrammar: true };
        // 3. <template> — element by tag name or css class
        const root = await grammarLoader.tryParseSource('vue', source);
        if (root) {
            const tpl = vueBlocks.findTemplateNode(root.rootNode, target);
            if (tpl) return { node: tpl, viaGrammar: true };
        }
    }
    return null;
}

// --- PHP: locate a node ---------------------------------------------------

async function locateInPhp(source, target) {
    const tree = await grammarLoader.tryParseSource('php', source);
    if (tree) {
        const node = findNamedNode(tree.rootNode, target);
        if (node) return { node, viaGrammar: true };
    }
    return null;
}

async function locateNode(ext, source, target) {
    if (ext === 'vue') {
        const viaVue = await locateInVue(source, target);
        if (viaVue) return viaVue;
        const node = findViaString(source, target);
        if (node) return { node, viaGrammar: false };
        return null;
    }
    if (ext === 'php') {
        const viaPhp = await locateInPhp(source, target);
        if (viaPhp) return viaPhp;
        const node = findViaString(source, target);
        if (node) return { node, viaGrammar: false };
        return null;
    }
    const lang = grammarLoader.EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
    if (!lang) return null;
    let tree;
    try {
        tree = await grammarLoader.parseSource(lang === 'javascript' && ext === 'json' ? 'javascript' : lang, source);
    } catch (err) {
        return null;
    }
    let node = null;
    if (lang === 'css') node = findCssRule(tree.rootNode, target);
    else if (ext === 'json') node = findJsonPath(tree.rootNode, target) || findNamedNode(tree.rootNode, target);
    else node = findNamedNode(tree.rootNode, target);
    if (!node) return null;
    return { node, viaGrammar: true };
}

// --- import anchors --------------------------------------------------------

/**
 * Where an "Add after: imports" block should be inserted.
 * PHP: after the last top-level "use X;" statement, else after the
 * "namespace X;" statement, else after the "<?php" tag. Never before the
 * namespace — PHP requires the namespace declaration to be the first
 * statement in the file.
 */
async function findPhpImportAnchor(source) {
    const tree = await grammarLoader.tryParseSource('php', source);
    if (tree) {
        const uses = findPhpUses(tree.rootNode);
        if (uses.length) {
            const last = uses[uses.length - 1];
            return { index: last.endIndex, indent: '' };
        }
        const ns = findPhpNamespace(tree.rootNode);
        if (ns) return { index: ns.endIndex, indent: '' };
        const open = findPhpOpenTag(tree.rootNode);
        if (open) return { index: open.endIndex, indent: '' };
    }
    const m = source.match(/<\?php/);
    if (m) return { index: m.index + m[0].length, indent: '' };
    return { index: 0, indent: '' };
}

/**
 * Where an "Add after: imports" block should be inserted inside a .vue file.
 * After the last import statement of the <script> block — never at the top
 * of the file, which would break the SFC.
 */
async function findVueImportAnchor(source) {
    const blocks = await vueBlocks.getVueBlocks(source);
    if (!blocks) return null;
    const script = blocks.find(b => b.kind === 'script');
    if (!script) return null;
    const last = await vueBlocks.findLastScriptImport(source, blocks);
    if (!last) {
        // No import yet — put it at the top of the script block.
        return { index: script.start, indent: '' };
    }
    return { index: last.endIndex, indent: leadingWhitespace(source, last.startIndex) };
}

/**
 * Build the text inserted before an import anchor.
 * Keeps exactly one blank line between the new import and the next block.
 */
function buildImportInsert(after, newContent) {
    const body = newContent.trim();
    if (after.startsWith('\n\n')) return '\n' + body;
    return '\n' + body + '\n';
}

async function computeAddAfter(ext, source, target, newContent) {    if (target === 'end') {
        const needsNewline = !source.endsWith('\n');
        const toInsert = (needsNewline ? '\n' : '') + newContent.trim() + '\n';
        return { ok: true, patched: source + toInsert };
    }
    if (target === 'imports') {
        if (ext === 'php') {
            const anchor = await findPhpImportAnchor(source);
            const pos = anchor ? anchor.index : 0;
            const before = source.slice(0, pos);
            const after = source.slice(pos);
            const toInsert = buildImportInsert(after, newContent);
            return { ok: true, patched: before + toInsert + after, viaGrammar: true };
        }
        if (ext === 'vue') {
            const anchor = await findVueImportAnchor(source);
            if (!anchor) return { ok: false, reason: 'no <script> block found' };
            const pos = anchor.index;
            const before = source.slice(0, pos);
            const after = source.slice(pos);
            const toInsert = buildImportInsert(after, newContent);
            return { ok: true, patched: before + toInsert + after, viaGrammar: true };
        }
        const lang = grammarLoader.EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
        if (!lang) return { ok: false, reason: `no grammar for .${ext}` };
        let tree;
        try {
            tree = await grammarLoader.parseSource(lang === 'javascript' && ext === 'json' ? 'javascript' : lang, source);
        } catch (err) {
            return { ok: false, reason: `grammar load failed: ${err.message}` };
        }
        const lastImport = findLastImport(tree.rootNode);
        let insertPos = 0;
        let indent = '';
        if (lastImport) {
            insertPos = lastImport.endIndex;
            indent = leadingWhitespace(source, lastImport.startIndex);
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
        return { ok: true, patched: before + toInsert + after };
    }

    const located = await locateNode(ext, source, target);
    if (!located) return { ok: false, reason: `target "${target}" not found` };
    const { node, viaGrammar } = located;
    const indent = leadingWhitespace(source, node.startIndex);
    const before = source.slice(0, node.endIndex);
    const after = source.slice(node.endIndex);
    const needsLeadingNewline = !before.endsWith('\n');
    const needsTrailingNewline = !after.startsWith('\n');
    let toInsert = '';
    if (needsLeadingNewline) toInsert += '\n';
    else if (!before.endsWith('\n\n')) toInsert += '\n';
    toInsert += reindent(newContent.trim(), indent);
    if (needsTrailingNewline) toInsert += '\n';
    else if (!after.startsWith('\n\n')) toInsert += '\n';
    return { ok: true, patched: before + toInsert + after, viaGrammar };
}

async function computeAddBefore(ext, source, target, newContent) {
    const located = await locateNode(ext, source, target);
    if (!located) return { ok: false, reason: `target "${target}" not found` };
    const { node, viaGrammar } = located;
    const indent = leadingWhitespace(source, node.startIndex);
    const before = source.slice(0, node.startIndex);
    const after = source.slice(node.startIndex);
    let toInsert = reindent(newContent.trim(), indent) + '\n';
    if (!before.endsWith('\n')) toInsert = '\n' + toInsert;
    return { ok: true, patched: before + toInsert + after, viaGrammar };
}

async function computeRemove(ext, source, target) {
    const located = await locateNode(ext, source, target);
    if (!located) return { ok: false, reason: `target "${target}" not found` };
    const { node, viaGrammar } = located;
    const start = node.startIndex - leadingWhitespace(source, node.startIndex).length;
    let end = node.endIndex;
    if (source[end] === '\r' && source[end + 1] === '\n') end += 2;
    else if (source[end] === '\n') end += 1;
    let patched = source.slice(0, start) + source.slice(end);
    patched = patched.replace(/\n{3,}/g, '\n\n');
    return { ok: true, patched, viaGrammar };
}

async function computeUpdate(ext, source, target, newContent) {
    const located = await locateNode(ext, source, target);
    if (!located) return { ok: false, reason: `target "${target}" not found` };
    const { node, viaGrammar } = located;

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
    return { ok: true, patched, restoredPrefix, viaGrammar };
}

async function computePatch(filePath, mode, target, newContent) {
    const ext = extOf(filePath);
    const source = fs.readFileSync(filePath, 'utf-8');
    const m = (mode || '').toLowerCase().replace(/\s+/g, '');

    if (m === 'addafter') return computeAddAfter(ext, source, target, newContent ?? '');
    if (m === 'addbefore') return computeAddBefore(ext, source, target, newContent ?? '');
    if (m === 'remove') return computeRemove(ext, source, target);
    return computeUpdate(ext, source, target, newContent ?? '');
}

module.exports = { computePatch, locateNode };