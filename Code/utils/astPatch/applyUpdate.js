'use strict';

const fs = require('fs');
const { computePatch } = require('./computePatch');

async function applyUpdate(filePath, target, newContent) {
    const result = await computePatch(filePath, 'update', target, newContent);
    if (!result.ok) return result;
    fs.writeFileSync(filePath, result.patched, 'utf-8');
    return { ok: true, restoredPrefix: result.restoredPrefix ?? null, viaGrammar: result.viaGrammar };
}

module.exports = { applyUpdate };