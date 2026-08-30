'use strict';

const path = require('path');

function extOf(filePath) {
    return path.extname(filePath).slice(1).toLowerCase();
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

module.exports = { extOf, leadingWhitespace, reindent, getLeadingModifiers, reconcileModifiers };