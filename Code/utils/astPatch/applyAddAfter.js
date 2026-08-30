'use strict';

const fs = require('fs');
const { computePatch } = require('./computePatch');

async function applyAddAfter(filePath, target, newContent) {
    const result = await computePatch(filePath, 'addAfter', target, newContent);
    if (!result.ok) return result;
    fs.writeFileSync(filePath, result.patched, 'utf-8');
    return { ok: true, viaGrammar: result.viaGrammar };
}

module.exports = { applyAddAfter };