const { ipcMain } = require('electron');
const { makeReqLibraryStore } = require('../utils/reqLibraryStore.js');

/**
 * @param {{ app }} deps
 */
function register({ app }) {
    const store = makeReqLibraryStore({ app });

    ipcMain.handle('reqLib:load', () => store.loadAll());
    ipcMain.handle('reqLib:upsertSpec', (event, spec) => store.upsertSpec(spec || {}));
    ipcMain.handle('reqLib:deleteSpec', (event, payload) => store.deleteSpec(payload || {}));
    ipcMain.handle('reqLib:duplicateSpec', (event, payload) => store.duplicateSpec(payload || {}));
    ipcMain.handle('reqLib:toggleFavorite', (event, payload) => store.toggleFavorite(payload || {}));
    ipcMain.handle('reqLib:markViewed', (event, payload) => store.markViewed(payload || {}));
    ipcMain.handle('reqLib:addItem', (event, payload) => store.addItem(payload || {}));
    ipcMain.handle('reqLib:renameItem', (event, payload) => store.renameItem(payload || {}));
    ipcMain.handle('reqLib:deleteItem', (event, payload) => store.deleteItem(payload || {}));
    ipcMain.handle('reqLib:importLibrary', (event, payload) => store.importLibrary(payload || {}));
}

module.exports = { register };