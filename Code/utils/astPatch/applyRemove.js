'use strict';

const fs = require('fs');
const { computePatch } = require('./computePatch');

async function applyRemove(filePath, target) {
    const result = await computePatch(filePath, 'remove', target, '');
    console.error('[applyRemove] filePath=' + filePath + ' target=' + target + ' ok=' + result.ok + ' viaGrammar=' + result.viaGrammar + ' reason=' + (result.reason || 'none'));
    if (!result.ok) return result;
    console.error('[applyRemove] patched length=' + result.patched.length + ' preview:\n' + result.patched.substring(0, 200));
    fs.writeFileSync(filePath, result.patched, 'utf-8');
    return { ok: true, viaGrammar: result.viaGrammar };
}

module.exports = { applyRemove };