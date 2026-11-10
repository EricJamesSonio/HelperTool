const { ipcMain } = require('electron');
const config = require('../config/config.js');
const { makeReqLibraryStore } = require('../utils/reqLibraryStore.js');

/**
 * Requirements Library IPC. Every call is scoped to one repository.
 * The renderer sends repoPath in the payload; the active project is only a fallback.
 * @param {{ app }} deps
 */
function register({ app }) {
    const store = makeReqLibraryStore({ app });

    function withRepo(payload) {
        const p = payload && typeof payload === 'object' ? payload : {};
        if (p.repoPath) return p;
        let active = '';
        try {
            active = (config.readConfig() || {}).activeProject || '';
        } catch (_) {
            active = '';
        }
        return Object.assign({}, p, { repoPath: active });
    }

    function handle(channel, fn) {
        ipcMain.handle(channel, (event, payload) => fn(withRepo(payload)));
    }

    handle('reqLib:load', store.loadAll);
    handle('reqLib:updateProfile', store.updateProfile);
    handle('reqLib:syncPresets', store.syncPresets);
    handle('reqLib:upsertSpec', store.upsertSpec);
    handle('reqLib:deleteSpec', store.deleteSpec);
    handle('reqLib:duplicateSpec', store.duplicateSpec);
    handle('reqLib:toggleFavorite', store.toggleFavorite);
    handle('reqLib:markViewed', store.markViewed);
    handle('reqLib:addItem', store.addItem);
    handle('reqLib:renameItem', store.renameItem);
    handle('reqLib:deleteItem', store.deleteItem);
    handle('reqLib:importLibrary', store.importLibrary);
}

module.exports = { register };