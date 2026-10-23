export const state = {
    mode: 'content',        // 'structure' | 'content'
    rawInput: '',
    preview: null,             // structure mode: { toCreate, toSkip }
    previewSkipped: null,      // structure mode: Set of relPath skipped by user
    contentEntries: null,      // content mode: [{ relPath, content, resolved, candidates, ambiguous, mode, target, skipped }]
    contentPreview: null,      // content mode: { toCreate, toOverwrite, details, patched }
    contentFormat: null,       // content mode: 'explicit' | 'legacy'
    isOpen: false,
};

export function resetState() {
    state.mode           = 'content';
    state.rawInput        = '';
    state.preview          = null;
    state.previewSkipped   = null;
    state.contentEntries   = null;
    state.contentPreview   = null;
    state.contentFormat    = null;
    state.isOpen           = false;
}

export function isEntrySkipped(idx) {
    return !!(state.contentEntries && state.contentEntries[idx] && state.contentEntries[idx].skipped);
}

export function activeEntryIndices() {
    if (!state.contentEntries) return [];
    const out = [];
    for (let i = 0; i < state.contentEntries.length; i++) {
        if (!state.contentEntries[i].skipped) out.push(i);
    }
    return out;
}
