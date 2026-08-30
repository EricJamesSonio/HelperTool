'use strict';

const fs = require('fs');
const { computePatch } = require('./computePatch');

async function applyRemove(filePath, target) {
    const result = await computePatch(filePath, 'remove', target, '');
    if (!result.ok) return result;
    fs.writeFileSync(filePath, result.patched, 'utf-8');
    return { ok: true, viaGrammar: result.viaGrammar };
}

module.exports = { applyRemove };