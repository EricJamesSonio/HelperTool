'use strict';

// Clipboard and temp-file helpers for the Researcher assist panel.
// The claude.ai BrowserView owns focus after the user copies a reply, so the
// renderer cannot use navigator.clipboard; the main process clipboard works
// regardless of focus.

const { ipcMain, clipboard } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHANNELS = ['researcher:readClipboard', 'researcher:writeClipboard', 'researcher:tempFile'];

function register() {
    for (const ch of CHANNELS) {
        try { ipcMain.removeHandler(ch); } catch (_) {}
    }

    ipcMain.handle('researcher:readClipboard', () => {
        try {
            return { success: true, text: clipboard.readText() || '' };
        } catch (err) {
            return { success: false, text: '', error: err.message };
        }
    });

    ipcMain.handle('researcher:writeClipboard', (event, payload) => {
        try {
            const text = payload && typeof payload.text === 'string' ? payload.text : '';
            clipboard.writeText(text);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('researcher:tempFile', (event, payload) => {
        try {
            const raw = payload && payload.name ? String(payload.name) : 'out.txt';
            const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
            const dir = path.join(os.tmpdir(), 'helpertool-researcher');
            fs.mkdirSync(dir, { recursive: true });
            return { success: true, filePath: path.join(dir, safe) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}

module.exports = { register };