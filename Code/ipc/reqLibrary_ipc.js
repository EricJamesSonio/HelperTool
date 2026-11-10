const { ipcMain, BrowserWindow } = require('electron');
const config = require('../config/config.js');
const { makeReqLibraryStore } = require('../utils/reqLibraryStore.js');

const F5_SCRIPT = [
    '(function () {',
    '  if (document.body.classList.contains("ide-mode")) {',
    '    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F5", code: "F5", keyCode: 116, bubbles: true, cancelable: true }));',
    '    return;',
    '  }',
    '  var btn = document.getElementById("reqLibraryBtn");',
    '  if (btn) btn.click();',
    '})();',
].join('\n');

/**
 * Requirements Library IPC. Every call is scoped to one repository.
 * The renderer sends repoPath in the payload; the active project is only a fallback.
 * Also owns the F5 shortcut: F5 is intercepted before the page sees it, so the
 * default reload never wins, and it presses the Requirements Library button.
 * @param {{ app }} deps
 */
function register({ app }) {
    const store = makeReqLibraryStore({ app });
    const attached = new WeakSet();

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

    function attachF5(win) {
        if (!win || win.isDestroyed() || attached.has(win)) return;
        attached.add(win);
        const wc = win.webContents;
        wc.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown' || input.key !== 'F5') return;
            if (input.control || input.alt || input.shift || input.meta) return;
            let url = '';
            try {
                url = wc.getURL();
            } catch (_) {
                url = '';
            }
            if (!/index\.html/i.test(url)) return;
            event.preventDefault();
            if (input.isAutoRepeat) return;
            wc.executeJavaScript(F5_SCRIPT, true).catch(() => {});
        });
    }

    BrowserWindow.getAllWindows().forEach(attachF5);
    app.on('browser-window-created', (_event, win) => attachF5(win));

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