/**
 * ipc/fileseeder_ipc.js
 */

'use strict';

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const fileSeeder  = require('../utils/fileSeeder');
const flowHistory = require('../utils/flowHistory');

/**
 * @param {{ app?: object }} _deps
 */
function register(_deps) {
    try { flowHistory.init(_deps && _deps.app); } catch (_) {}

    // Make handlers idempotent — Electron throws if we register twice (hot-reload)
    for (const ch of [
        'fileseeder:preview', 'fileseeder:seed', 'fileseeder:previewContent', 'fileseeder:seedContent',
        'fileseeder:getPatchedPreview', 'fileseeder:getAiRule',
        'fileseeder:applyContent', 'flow:historyList', 'flow:historyGet', 'flow:historyRevert', 'flow:historyClear',
    ]) {
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

    ipcMain.handle('fileseeder:previewContent', async (event, basePath, entries) => {
        try {
            if (!basePath || !Array.isArray(entries) || !entries.length) {
                return { error: 'Invalid arguments', toCreate: [], toOverwrite: [], toPatch: [], warnings: [], details: [] };
            }
            return await fileSeeder.previewContent(basePath, entries);
        } catch (err) {
            console.error('[IPC] fileseeder:previewContent error:', err);
            return { error: err.message, toCreate: [], toOverwrite: [], toPatch: [], warnings: [], details: [] };
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

    ipcMain.handle('fileseeder:getPatchedPreview', async (event, basePath, resolved, allEntries) => {
        try {
            if (!basePath || !resolved) {
                return { error: 'Invalid arguments', left: '', right: '' };
            }
            const result = await fileSeeder.getPatchedPreview(basePath, resolved, allEntries || []);
            return result;
        } catch (err) {
            console.error('[IPC] fileseeder:getPatchedPreview error:', err);
            return { error: err.message, left: '', right: '' };
        }
    });

    /**
     * Flow Tool apply: same as seedContent, but first saves the original
     * content of every file it touches so the apply can be reverted later.
     */
    ipcMain.handle('fileseeder:applyContent', async (event, basePath, entries, meta) => {
        try {
            if (!basePath || !Array.isArray(entries) || !entries.length) {
                return { error: 'Invalid arguments', created: [], overwritten: [], patched: [], errors: [] };
            }
            return await flowHistory.applyWithHistory(basePath, entries, meta || {});
        } catch (err) {
            console.error('[IPC] fileseeder:applyContent error:', err);
            return { error: err.message, created: [], overwritten: [], patched: [], errors: [] };
        }
    });

    ipcMain.handle('flow:historyList', (event, basePath) => {
        try {
            if (!basePath) return { items: [] };
            return flowHistory.list(basePath);
        } catch (err) {
            console.error('[IPC] flow:historyList error:', err);
            return { error: err.message, items: [] };
        }
    });

    ipcMain.handle('flow:historyGet', (event, basePath, id) => {
        try {
            if (!basePath || !id) return { error: 'Invalid arguments' };
            return flowHistory.get(basePath, id);
        } catch (err) {
            console.error('[IPC] flow:historyGet error:', err);
            return { error: err.message };
        }
    });

    ipcMain.handle('flow:historyRevert', (event, basePath, id, opts) => {
        try {
            if (!basePath || !id) return { error: 'Invalid arguments' };
            return flowHistory.revert(basePath, id, opts || {});
        } catch (err) {
            console.error('[IPC] flow:historyRevert error:', err);
            return { error: err.message };
        }
    });

    ipcMain.handle('flow:historyClear', (event, basePath) => {
        try {
            if (!basePath) return { error: 'Invalid arguments' };
            return flowHistory.clear(basePath);
        } catch (err) {
            console.error('[IPC] flow:historyClear error:', err);
            return { error: err.message };
        }
    });

    /**
     * The AI output rule the Global Seeder expects (AI_RULE.md).
     * The renderer can not read files directly, so it goes through here.
     * Only the "SYSTEM RULE" block is returned — the trailing sections are
     * documentation for humans, not instructions for the model.
     */
    ipcMain.handle('fileseeder:getAiRule', async () => {
        try {
            const rulePath = path.join(__dirname, '..', 'renderer', 'globalSeeder', 'AI_RULE.md');
            const full = await fs.promises.readFile(rulePath, 'utf-8');
            const start = full.indexOf('## SYSTEM RULE');
            const end = full.indexOf('## How the seeder uses this');
            const text = (start !== -1 && end !== -1 && end > start)
                ? full.slice(start, end).trim()
                : full;
            return { text };
        } catch (err) {
            console.error('[IPC] fileseeder:getAiRule error:', err);
            return { error: err.message, text: '' };
        }
    });
}

module.exports = { register };