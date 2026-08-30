'use strict';

const fs = require('fs');
const grammarLoader = require('./grammarLoader');
const { findCssRule, findJsonPath, findNamedNode, findLastImport, findViaString } = require('./nodeFinders');
const { extOf, leadingWhitespace, reindent, reconcileModifiers } = require('./textUtils');

async function locateNode(ext, source, target) {
    if (ext === 'php' || ext === 'vue') {
        const tree = await grammarLoader.tryParseSource(ext, source);
        if (tree) {
            const node = findNamedNode(tree.rootNode, target);
            if (node) return { node, viaGrammar: true };
        }
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

async function computeAddAfter(ext, source, target, newContent) {
    if (target === 'end') {
        const needsNewline = !source.endsWith('\n');
        const toInsert = (needsNewline ? '\n' : '') + newContent.trim() + '\n';
        return { ok: true, patched: source + toInsert };
    }
    if (target === 'imports') {
        if (ext === 'php' || ext === 'vue') {
            const lastImportRe = /(?:import\s+.*?;|require\(.*?\);|<\?php)/g;
            let last = null, m;
            while ((m = lastImportRe.exec(source)) !== null) last = m;
            const pos = last ? last.index + last[0].length : 0;
            const before = source.slice(0, pos);
            const after = source.slice(pos);
            const toInsert = '\n' + newContent.trim() + '\n';
            return { ok: true, patched: before + toInsert + after };
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