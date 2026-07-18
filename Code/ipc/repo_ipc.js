const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * @param {{ app, config, fileOps, docignoreUtils, getMainWindow }} deps
 */
function register({ app, config, fileOps, docignoreUtils, getMainWindow }) {

    ipcMain.handle('open-global-docignore', async () => {
        try {
            const globalDocignorePath = path.join(app.getPath('userData'), 'global-docignore.json');
            if (!fs.existsSync(globalDocignorePath)) {
                await fs.promises.writeFile(globalDocignorePath, JSON.stringify([], null, 2), 'utf-8');
            }
            await shell.openPath(globalDocignorePath);
            return true;
        } catch (err) {
            console.error('[IPC] open-global-docignore error:', err);
            return false;
        }
    });

    ipcMain.handle('select-repo', async () => {
        try {
            const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
            if (result.canceled || !result.filePaths.length) return null;

            const repoPath = result.filePaths[0];
            const cfg = config.readConfig();
            const storageName = path.basename(repoPath).replace(/[^a-zA-Z0-9-_]/g, '_');
            const userDataPath = app.getPath('userData');
            const storagePath = path.join(userDataPath, storageName);

            if (!fs.existsSync(userDataPath)) await fs.promises.mkdir(userDataPath, { recursive: true });
            if (!fs.existsSync(storagePath)) await fs.promises.mkdir(storagePath, { recursive: true });
            for (const sub of ['Codes', 'Structures']) {
                const subPath = path.join(storagePath, sub);
                if (!fs.existsSync(subPath)) await fs.promises.mkdir(subPath, { recursive: true });
            }

            cfg.projects[repoPath] = {
                storageName,
                storagePath,
                lastUsed: new Date().toISOString()
            };
            cfg.activeProject = repoPath;
            config.writeConfig(cfg);
            return repoPath;
        } catch (err) {
            console.error('[IPC] select-repo error:', err);
            dialog.showErrorBox('Select Repo Error', err.message);
            return null;
        }
    });

    ipcMain.handle('get-recent-repos', async () => {
        try {
            const cfg = config.readConfig();
            return Object.entries(cfg.projects || {})
                .map(([repoPath, data]) => ({ repoPath, ...data }))
                .filter(r => r.lastUsed)
                .sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed))
                .slice(0, 10);
        } catch (err) {
            console.error('[IPC] get-recent-repos error:', err);
            return [];
        }
    });

    // ── Folder tree disk cache ──
    const TREE_CACHE_DIR = path.join(app.getPath('userData'), 'folder-tree-cache');
    const TREE_CACHE_TTL = 300_000; // 5 min

    function _treeCacheKey(repoPath, ignoreRules) {
        const hash = crypto.createHash('md5').update(repoPath + JSON.stringify(ignoreRules)).digest('hex');
        return path.join(TREE_CACHE_DIR, `${hash}.json`);
    }

    async function _treeCacheRead(cacheFile) {
        try {
            if (!fs.existsSync(cacheFile)) return null;
            const raw = await fs.promises.readFile(cacheFile, 'utf-8');
            const entry = JSON.parse(raw);
            if (Date.now() - entry.ts > TREE_CACHE_TTL) return null;
            return entry.tree;
        } catch { return null; }
    }

    async function _treeCacheWrite(cacheFile, tree) {
        try {
            await fs.promises.mkdir(TREE_CACHE_DIR, { recursive: true });
            await fs.promises.writeFile(cacheFile, JSON.stringify({ ts: Date.now(), tree }));
        } catch { /* best-effort */ }
    }

    ipcMain.handle('getFolderTree', async (event, repoPath) => {
        const t0 = performance.now();
        try {
            if (!repoPath) return [];
            const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);
            const cacheFile = _treeCacheKey(repoPath, ignoreRules);

            // Return cached tree instantly if fresh
            const cached = await _treeCacheRead(cacheFile);
            if (cached) {
                const elapsed = performance.now() - t0;
                if (elapsed > 50) console.warn(`[IPC] getFolderTree cache hit in ${elapsed.toFixed(0)}ms for ${repoPath}`);
                return cached;
            }

            const workerProxy = require('./workerProxy');
            let result;
            if (workerProxy.isReady()) {
                result = await workerProxy.send('folderTree', { repoPath, ignoreRules });
            } else {
                result = await fileOps.getFolderTree(repoPath);
            }

            await _treeCacheWrite(cacheFile, result);

            const elapsed = performance.now() - t0;
            if (elapsed > 200) console.warn(`[IPC] getFolderTree took ${elapsed.toFixed(0)}ms (${workerProxy.isReady() ? 'worker' : 'node'}) for ${repoPath}`);
            return result;
        } catch (err) {
            console.error('[IPC] getFolderTree error:', err);
            return [];
        }
    });

    ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

    ipcMain.handle('open-docignore', async (event, repoPath) => {
        try {
            if (!repoPath) return false;
            const docignoreFile = path.join(repoPath, '.docignore');
            if (!fs.existsSync(docignoreFile)) {
                await fs.promises.writeFile(docignoreFile, '[]\n', 'utf-8');
            }
            shell.openPath(docignoreFile);
            return true;
        } catch (err) {
            console.error('[IPC] open-docignore error:', err);
            return false;
        }
    });

    ipcMain.handle('get-docignore', async (event, repoPath) => {
        try {
            if (!repoPath) return [];
            return await docignoreUtils.getIgnoreRules(repoPath);
        } catch (err) {
            console.error('[IPC] get-docignore error:', err);
            return [];
        }
    });

    ipcMain.handle('get-active-project', () => {
        try {
            const cfg = config.readConfig();
            const activeProjectPath = cfg.activeProject;
            if (!activeProjectPath) return null;
            return { repoPath: activeProjectPath, ...cfg.projects[activeProjectPath] };
        } catch (err) {
            console.error('[IPC] get-active-project error:', err);
            return null;
        }
    });

    ipcMain.handle('get-last-selected', () => {
        try {
            return config.getLastSelectedItems();
        } catch (err) {
            console.error('[IPC] get-last-selected error:', err);
            return [];
        }
    });

    ipcMain.handle('set-last-selected', (event, items) => {
        try {
            config.setLastSelectedItems(items);
        } catch (err) {
            console.error('[IPC] set-last-selected error:', err);
        }
    });

    ipcMain.handle('read-file', async (event, filePath) => {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return { success: true, content };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('save-file-dialog', async () => {
        const tempFile = path.join(app.getPath('temp'), 'helper-output.txt');
        return { filePath: tempFile };
    });

    ipcMain.handle('get-ignored-extensions', () => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return [];
            return cfg.projects[activePath].ignoredExtensions || [];
        } catch (err) {
            console.error('[IPC] get-ignored-extensions error:', err);
            return [];
        }
    });

    ipcMain.handle('set-ignored-extensions', (event, exts) => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return;
            cfg.projects[activePath].ignoredExtensions = Array.isArray(exts) ? exts : [];
            config.writeConfig(cfg);
        } catch (err) {
            console.error('[IPC] set-ignored-extensions error:', err);
        }
    });

    ipcMain.handle('get-folder-filters', () => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return { ignored: [], focused: [] };
            return cfg.projects[activePath].folderFilters || { ignored: [], focused: [] };
        } catch (err) {
            console.error('[IPC] get-folder-filters error:', err);
            return { ignored: [], focused: [] };
        }
    });

    ipcMain.handle('set-active-project', (event, repoPath) => {
        try {
            const cfg = config.readConfig();
            if (cfg.projects[repoPath]) {
                cfg.projects[repoPath].lastUsed = new Date().toISOString();
            }
            cfg.activeProject = repoPath;
            config.writeConfig(cfg);
        } catch (err) {
            console.error('[IPC] set-active-project error:', err);
        }
    });

    ipcMain.handle('select-folder', async () => {
        try {
            const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
            if (result.canceled || !result.filePaths.length) return null;
            return result.filePaths[0];
        } catch (err) {
            console.error('[IPC] select-folder error:', err);
            return null;
        }
    });

    ipcMain.handle('set-folder-filters', (event, filters) => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return;
            cfg.projects[activePath].folderFilters = {
                ignored: Array.isArray(filters?.ignored) ? filters.ignored : [],
                focused: Array.isArray(filters?.focused) ? filters.focused : [],
            };
            config.writeConfig(cfg);
            console.log('[IPC] set-folder-filters saved:', cfg.projects[activePath].folderFilters);
        } catch (err) {
            console.error('[IPC] set-folder-filters error:', err);
        }
    });

    ipcMain.handle('docignore:clear-cache', async (event, repoPath) => {
        try {
            docignoreUtils.clearCache(repoPath || null);
            return { success: true };
        } catch (err) {
            console.error('[IPC] docignore:clear-cache error:', err);
            return { success: false, error: err.message };
        }
    });

    // ── Session Notes ───────────────────────────────────────────────────────

    ipcMain.handle('get-session-notes', () => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return { notes: [], locked: false };
            let notes = [];
            try {
                notes = JSON.parse(cfg.projects[activePath].sessionNotesData || '[]');
            } catch (e) {
                notes = [];
            }
            return {
                notes: Array.isArray(notes) ? notes : [],
                locked: !!cfg.projects[activePath].sessionNotesLock,
            };
        } catch (err) {
            console.error('[IPC] get-session-notes error:', err);
            return { notes: [], locked: false };
        }
    });

    ipcMain.handle('set-session-notes', (event, notesData) => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return;
            cfg.projects[activePath].sessionNotesData = JSON.stringify(notesData || []);
            config.writeConfig(cfg);
        } catch (err) {
            console.error('[IPC] set-session-notes error:', err);
        }
    });

    ipcMain.handle('set-session-notes-password', (event, password) => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return;
            const hash = password ? crypto.createHash('sha256').update(password).digest('hex') : null;
            cfg.projects[activePath].sessionNotesLock = hash;
            config.writeConfig(cfg);
        } catch (err) {
            console.error('[IPC] set-session-notes-password error:', err);
        }
    });

    ipcMain.handle('get-session-notes-password', () => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return null;
            return cfg.projects[activePath].sessionNotesLock || null;
        } catch (err) {
            console.error('[IPC] get-session-notes-password error:', err);
            return null;
        }
    });

    ipcMain.handle('verify-session-notes-password', (event, password) => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return { ok: false };
            const stored = cfg.projects[activePath].sessionNotesLock;
            if (!stored) return { ok: false };
            const hash = crypto.createHash('sha256').update(password || '').digest('hex');
            return { ok: hash === stored };
        } catch (err) {
            console.error('[IPC] verify-session-notes-password error:', err);
            return { ok: false };
        }
    });
}

module.exports = { register };