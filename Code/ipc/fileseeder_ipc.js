/**
 * ipc/fileseeder_ipc.js
 */

'use strict';

const { ipcMain } = require('electron');
const fileSeeder  = require('../utils/fileSeeder');

/**
 * @param {{}} _deps
 */
function register(_deps) {

    /**
     * Preview: returns which paths will be created vs skipped.
     * Called after the user confirms the parsed list.
     */
    ipcMain.handle('fileseeder:preview', (event, basePath, relPaths) => {
        try {
            if (!basePath || !Array.isArray(relPaths) || !relPaths.length) {
                return { error: 'Invalid arguments', toCreate: [], toSkip: [] };
            }
            return fileSeeder.preview(basePath, relPaths);
        } catch (err) {
            console.error('[IPC] fileseeder:preview error:', err);
            return { error: err.message, toCreate: [], toSkip: [] };
        }
    });

    /**
     * Seed: actually creates the files on disk.
     * Only receives paths that the user confirmed should be created.
     */
    ipcMain.handle('fileseeder:seed', (event, basePath, relPaths) => {
        try {
            if (!basePath || !Array.isArray(relPaths) || !relPaths.length) {
                return { error: 'Invalid arguments', created: [], errors: [] };
            }
            return fileSeeder.seed(basePath, relPaths);
        } catch (err) {
            console.error('[IPC] fileseeder:seed error:', err);
            return { error: err.message, created: [], errors: [] };
        }
    });
}

module.exports = { register };