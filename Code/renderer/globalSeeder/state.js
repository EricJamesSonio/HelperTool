export const state = {
    mode: 'structure',        // 'structure' | 'content'
    rawInput: '',
    preview: null,             // structure mode: { toCreate, toSkip }
    contentEntries: null,      // content mode: [{ relPath, content }]
    contentPreview: null,      // content mode: { toCreate, toOverwrite }
    isOpen: false,
};

export function resetState() {
    state.mode           = 'structure';
    state.rawInput        = '';
    state.preview          = null;
    state.contentEntries   = null;
    state.contentPreview   = null;
    state.isOpen           = false;
}