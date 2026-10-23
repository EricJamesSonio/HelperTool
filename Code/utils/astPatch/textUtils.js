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

function shiftLine(line, shift) {
    if (!line.trim() || shift === 0) return line;
    if (shift > 0) return ' '.repeat(shift) + line;
    const m = line.match(/^[ \t]*/);
    const cur = m ? m[0].length : 0;
    return line.slice(Math.min(cur, -shift));
}

/**
 * Re-indent a pasted block so it sits at `indent`.
 *
 * The pasted block's first line is written at column 0 (the caller places it
 * after the existing leading whitespace), so only the body lines are shifted.
 * The shift is derived from the block's OWN body indent, which means both
 * shapes work:
 *   - hand written at column 0  -> body indent 0, shifted by the target indent
 *   - copied out of a file       -> body indent already equals the target, unchanged
 * Without this the body of a PHP method ends up one level too deep.
 */
function reindent(newBlock, indent) {
    const lines = newBlock.replace(/\r\n/g, '\n').split('\n');
    if (lines.length <= 1) return lines.join('\n');
    let common = null;
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const m = lines[i].match(/^[ \t]*/);
        const ind = m ? m[0].length : 0;
        if (common === null || ind < common) common = ind;
    }
    if (common === null) common = 0;
    const shift = indent.length - common;
    const out = [lines[0]];
    for (let i = 1; i < lines.length; i++) out.push(shiftLine(lines[i], shift));
    return out.join('\n');
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