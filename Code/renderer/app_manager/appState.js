/**
 * appState.js
 * Single source of truth for shared mutable state.
 * All modules import from here — no state duplication.
 */

export const state = {
    selectedRepoPath: null,
    selectedItems:    [],       // mutated in-place; do NOT replace the array reference
    cachedTree:       null,
    actionType:       'code',
    generateMinified: false,
    viewMode:         localStorage.getItem('helpertool-viewmode') || 'list',
};