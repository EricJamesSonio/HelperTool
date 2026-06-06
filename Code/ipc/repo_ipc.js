const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * @param {{ app, config, fileOps, docignoreUtils, getMainWindow }} deps
 */
function register({ app, config, fileOps, docignoreUtils, getMainWindow }) {

    ipcMain.handle('open-global-docignore', async () => {
        try {
            const globalDocignorePath = path.join(app.getPath('userData'), 'global-docignore.json');
            if (!fs.existsSync(globalDocignorePath)) {
                fs.writeFileSync(globalDocignorePath, JSON.stringify([], null, 2), 'utf-8');
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

            if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
            if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
            ['Codes', 'Structures'].forEach(sub => {
                const subPath = path.join(storagePath, sub);
                if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
            });

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

    ipcMain.handle('getFolderTree', async (event, repoPath) => {
        try {
            if (!repoPath) return [];
            const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);
            console.log('[IPC] Ignore rules loaded:', ignoreRules.length);
            return await fileOps.getFolderTree(repoPath);
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
                fs.writeFileSync(docignoreFile, '[]\n', 'utf-8');
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

    // ── Session Notes ───────────────────────────────────────────────────────

    ipcMain.handle('get-session-notes', () => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return { text: '', locked: false };
            return {
                text: cfg.projects[activePath].sessionNotes || '',
                locked: !!cfg.projects[activePath].sessionNotesLock,
            };
        } catch (err) {
            console.error('[IPC] get-session-notes error:', err);
            return { text: '', locked: false };
        }
    });

    ipcMain.handle('set-session-notes', (event, text) => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return;
            cfg.projects[activePath].sessionNotes = text || '';
            config.writeConfig(cfg);
        } catch (err) {
            console.error('[IPC] set-session-notes error:', err);
        }
    });

    ipcMain.handle('set-session-notes-password', (event, hash) => {
        try {
            const cfg = config.readConfig();
            const activePath = cfg.activeProject;
            if (!activePath || !cfg.projects[activePath]) return;
            cfg.projects[activePath].sessionNotesLock = hash || null;
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
}

module.exports = { register };