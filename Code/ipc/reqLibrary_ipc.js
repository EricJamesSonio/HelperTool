const { ipcMain, BrowserWindow } = require('electron');
const config = require('../config/config.js');
const { makeReqLibraryStore } = require('../utils/reqLibraryStore.js');

const SHORTCUT_KEY = '.';

const SHORTCUT_SCRIPT = [
    '(function () {',
    '  var el = document.activeElement;',
    '  if (el && el !== document.body) {',
    '    var tag = String(el.tagName || "").toLowerCase();',
    '    var type = String(el.type || "").toLowerCase();',
    '    var textTypes = ["text", "search", "email", "password", "url", "tel", "number", ""];',
    '    if (tag === "textarea" || el.isContentEditable || (tag === "input" && textTypes.indexOf(type) !== -1)) {',
    '      return "skipped: typing in " + tag;',
    '    }',
    '  }',
    '  var panel = document.getElementById("rlPanel");',
    '  if (panel && panel.classList.contains("open")) {',
    '    var closeBtn = panel.querySelector("[data-act=close]");',
    '    if (closeBtn) {',
    '      closeBtn.click();',
    '      return "closed";',
    '    }',
    '  }',
    '  var btn = document.getElementById("reqLibraryBtn");',
    '  if (!btn) return "failed: #reqLibraryBtn not found";',
    '  btn.click();',
    '  return "clicked button (ide-mode: " + document.body.classList.contains("ide-mode") + ")";',
    '})();',
].join('\n');

/**
 * Requirements Library IPC. Every call is scoped to one repository.
 * The renderer sends repoPath in the payload; the active project is only a fallback.
 * Also owns the dot shortcut: pressing "." with no modifier presses the
 * Requirements Library button, unless the user is typing in a text field.
 * Every press logs its outcome to the terminal. Logs use the [Main] prefix
 * because utils/log.js hides every other prefix.
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

    function attachShortcut(win) {
        if (!win || win.isDestroyed() || attached.has(win)) return;
        attached.add(win);
        const wc = win.webContents;
        wc.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown' || input.key !== SHORTCUT_KEY) return;
            if (input.control || input.alt || input.shift || input.meta) return;
            if (input.isAutoRepeat) return;
            let url = '';
            try {
                url = wc.getURL();
            } catch (_) {
                url = '';
            }
            if (!/index\.html/i.test(url)) {
                console.log('[Main] ReqLibrary "." ignored, window url:', url);
                return;
            }
            wc.executeJavaScript(SHORTCUT_SCRIPT, true)
                .then((result) => console.log('[Main] ReqLibrary "." ->', result))
                .catch((err) => console.log('[Main] ReqLibrary "." failed:', err && err.message));
        });
    }

    BrowserWindow.getAllWindows().forEach(attachShortcut);
    app.on('browser-window-created', (_event, win) => attachShortcut(win));

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