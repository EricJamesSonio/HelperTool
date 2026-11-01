'use strict';

// Clipboard and temp-file helpers for the Researcher assist panel.
// The claude.ai BrowserView owns focus after the user copies a reply, so the
// renderer cannot use navigator.clipboard; the main process clipboard works
// regardless of focus.
// Channels are namespaced "researcherAssist:" and every reply is a JSON
// string, so nothing here can collide with another handler or fail to clone.

const { ipcMain, clipboard } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHANNELS = ['researcherAssist:readClipboard', 'researcherAssist:writeClipboard', 'researcherAssist:tempFile'];

function reply(obj) {
    try {
        return JSON.stringify(obj);
    } catch (err) {
        return JSON.stringify({ success: false, error: String(err && err.message ? err.message : err) });
    }
}

function register() {
    for (const ch of CHANNELS) {
        try { ipcMain.removeHandler(ch); } catch (_) {}
    }

    ipcMain.handle('researcherAssist:readClipboard', () => {
        try {
            return reply({ success: true, text: String(clipboard.readText() || '') });
        } catch (err) {
            return reply({ success: false, text: '', error: err.message });
        }
    });

    ipcMain.handle('researcherAssist:writeClipboard', (event, text) => {
        try {
            clipboard.writeText(typeof text === 'string' ? text : '');
            return reply({ success: true });
        } catch (err) {
            return reply({ success: false, error: err.message });
        }
    });

    ipcMain.handle('researcherAssist:tempFile', (event, name) => {
        try {
            const raw = name ? String(name) : 'out.txt';
            const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
            const dir = path.join(os.tmpdir(), 'helpertool-researcher');
            fs.mkdirSync(dir, { recursive: true });
            return reply({ success: true, filePath: path.join(dir, safe) });
        } catch (err) {
            return reply({ success: false, error: err.message });
        }
    });
}

module.exports = { register };