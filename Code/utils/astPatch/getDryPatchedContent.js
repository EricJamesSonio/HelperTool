'use strict';

const fs = require('fs');
const { computePatch } = require('./computePatch');

async function getDryPatchedContent(filePath, mode, target, newContent) {
    const exists = fs.existsSync(filePath);
    if (!exists) return newContent ?? '';
    const result = await computePatch(filePath, mode, target, newContent ?? '');
    if (!result.ok) return fs.readFileSync(filePath, 'utf-8');
    return result.patched;
}

module.exports = { getDryPatchedContent };