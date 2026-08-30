'use strict';

const { canPatch } = require('./canPatch');
const { applyUpdate } = require('./applyUpdate');
const { applyAddAfter } = require('./applyAddAfter');
const { applyAddBefore } = require('./applyAddBefore');
const { applyRemove } = require('./applyRemove');
const { applySurgical } = require('./applySurgical');
const { getDryPatchedContent } = require('./getDryPatchedContent');

module.exports = {
    applyUpdate,
    canPatch,
    applyAddAfter,
    applyAddBefore,
    applyRemove,
    applySurgical,
    getDryPatchedContent,
};