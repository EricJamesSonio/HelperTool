'use strict';

const grammarLoader = require('./grammarLoader');
const { extOf } = require('./textUtils');
const { computePatch } = require('./computePatch');

async function canPatch(filePath, target, mode = 'update') {
    const ext = extOf(filePath);
    const lang = grammarLoader.EXT_LANG[ext] || (ext === 'json' ? 'javascript' : null);
    if (!lang && ext !== 'php' && ext !== 'vue') return { ok: false, reason: `no grammar for .${ext}` };
    const m = (mode || '').toLowerCase().replace(/\s+/g, '');
    if ((m === 'addafter' || m === 'addbefore') && (target === 'end' || target === 'imports')) {
        return { ok: true };
    }
    const result = await computePatch(filePath, mode, target, '');
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true };
}

module.exports = { canPatch };