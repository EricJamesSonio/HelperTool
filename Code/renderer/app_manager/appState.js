/**
 * appState.js
 * Single source of truth for shared mutable state.
 * All modules import from here — no state duplication.
 */

import { DEFAULT_PREFERENCES } from '../defaultPreferences.js';

export const state = {
    selectedRepoPath: null,
    selectedItems:    [],       // mutated in-place; do NOT replace the array reference
    cachedTree:       null,
    actionType:       'code',
    generateMinified: false,
    generateOutputType: 'normal', // normal | minified | prompt

    viewMode:         localStorage.getItem('helpertool-viewmode') || DEFAULT_PREFERENCES.app.viewMode,
    selectedPromptText: '',
    selectedPromptId:   null,
    selectedPromptIds:  [],
};
