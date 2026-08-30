'use strict';

const fs = require('fs');
const { computePatch } = require('./computePatch');

async function applyUpdate(filePath, target, newContent) {
    const result = await computePatch(filePath, 'update', target, newContent);
    console.error('[applyUpdate] filePath=' + filePath + ' target=' + target + ' ok=' + result.ok + ' viaGrammar=' + result.viaGrammar + ' reason=' + (result.reason || 'none'));
    if (!result.ok) return result;
    console.error('[applyUpdate] patched length=' + result.patched.length + ' preview:\n' + result.patched.substring(0, 200));
    fs.writeFileSync(filePath, result.patched, 'utf-8');
    return { ok: true, restoredPrefix: result.restoredPrefix ?? null, viaGrammar: result.viaGrammar };
}

module.exports = { applyUpdate };