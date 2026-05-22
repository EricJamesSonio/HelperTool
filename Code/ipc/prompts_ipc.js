const { ipcMain } = require('electron');
const { makePromptStore } = require('../utils/promptStore.js');

/**
 * @param {{ app }} deps
 */
function register({ app }) {
    const store = makePromptStore({ app });

    // Load all data (categories + prompts)
    ipcMain.handle('prompts-load', () => {
        return store.loadAll();
    });

    ipcMain.handle('prompts-createCategory', (event, payload) => {
        return store.createCategory(payload || {});
    });

    ipcMain.handle('prompts-updateCategory', (event, payload) => {
        return store.updateCategory(payload || {});
    });

    ipcMain.handle('prompts-deleteCategory', (event, payload) => {
        return store.deleteCategory(payload || {});
    });

    ipcMain.handle('prompts-upsertPrompt', (event, payload) => {
        return store.upsertPrompt(payload || {});
    });

    ipcMain.handle('prompts-deletePrompt', (event, payload) => {
        return store.deletePrompt(payload || {});
    });

    ipcMain.handle('prompts-toggleFavorite', (event, payload) => {
        return store.toggleFavorite(payload || {});
    });

    ipcMain.handle('prompts-togglePin', (event, payload) => {
        return store.togglePin(payload || {});
    });

    ipcMain.handle('prompts-getApplicable', (event, mode) => {
        return store.getApplicablePrompts({ mode });
    });
}

module.exports = { register };


