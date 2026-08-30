'use strict';

const { applyUpdate } = require('./applyUpdate');
const { applyAddAfter } = require('./applyAddAfter');
const { applyAddBefore } = require('./applyAddBefore');
const { applyRemove } = require('./applyRemove');

async function applySurgical(filePath, mode, target, newContent) {
    const m = (mode || '').toLowerCase();
    if (m === 'addafter') return applyAddAfter(filePath, target, newContent);
    if (m === 'addbefore') return applyAddBefore(filePath, target, newContent);
    if (m === 'remove') return applyRemove(filePath, target);
    return applyUpdate(filePath, target, newContent);
}

module.exports = { applySurgical };