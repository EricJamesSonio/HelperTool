'use strict';

const fs = require('fs');
const { computePatch } = require('./computePatch');

async function applyAddBefore(filePath, target, newContent) {
    const result = await computePatch(filePath, 'addBefore', target, newContent);
    if (!result.ok) return result;
    fs.writeFileSync(filePath, result.patched, 'utf-8');
    return { ok: true, viaGrammar: result.viaGrammar };
}

module.exports = { applyAddBefore };