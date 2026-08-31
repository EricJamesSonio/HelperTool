export const state = {
    mode: 'content',        // 'structure' | 'content'
    rawInput: '',
    preview: null,             // structure mode: { toCreate, toSkip }
    contentEntries: null,      // content mode: [{ relPath, content, resolved, candidates, ambiguous, mode, target }]
    contentPreview: null,      // content mode: { toCreate, toOverwrite, details, patched }
    isOpen: false,
};

export function resetState() {
    state.mode           = 'content';
    state.rawInput        = '';
    state.preview          = null;
    state.contentEntries   = null;
    state.contentPreview   = null;
    state.isOpen           = false;
}
