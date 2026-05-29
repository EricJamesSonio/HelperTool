/**
 * renderer/fileSeederTool/state.js
 */

export const state = {
    /** Absolute path of the folder the user right-clicked */
    targetPath: null,

    /** Display name shown in the panel header */
    targetLabel: null,

    /** Raw textarea content */
    rawInput: '',

    /**
     * Preview result from IPC — populated after Parse is clicked.
     * @type {{ toCreate: string[], toSkip: string[] } | null}
     */
    preview: null,

    /** Whether the panel is currently visible */
    isOpen: false,
};

export function resetState() {
    state.targetPath  = null;
    state.targetLabel = null;
    state.rawInput    = '';
    state.preview     = null;
    state.isOpen      = false;
}