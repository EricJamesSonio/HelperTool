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
    // Make handlers idempotent — Electron throws if we register twice (hot-reload)
    for (const ch of ['fileseeder:preview', 'fileseeder:seed', 'fileseeder:previewContent', 'fileseeder:seedContent']) {
        try { ipcMain.removeHandler(ch); } catch (_) {}
    }

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

    ipcMain.handle('fileseeder:previewContent', (event, basePath, entries) => {
        try {
            if (!basePath || !Array.isArray(entries) || !entries.length) {
                return { error: 'Invalid arguments', toCreate: [], toOverwrite: [], toPatch: [], details: [] };
            }
            return fileSeeder.previewContent(basePath, entries);
        } catch (err) {
            console.error('[IPC] fileseeder:previewContent error:', err);
            return { error: err.message, toCreate: [], toOverwrite: [], toPatch: [], details: [] };
        }
    });

    ipcMain.handle('fileseeder:seedContent', async (event, basePath, entries) => {
        try {
            if (!basePath || !Array.isArray(entries) || !entries.length) {
                return { error: 'Invalid arguments', created: [], overwritten: [], patched: [], errors: [] };
            }
            return await fileSeeder.seedContent(basePath, entries);
        } catch (err) {
            console.error('[IPC] fileseeder:seedContent error:', err);
            return { error: err.message, created: [], overwritten: [], patched: [], errors: [] };
        }
    });
}

module.exports = { register };