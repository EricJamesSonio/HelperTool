const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const config = require('./config/config.js');
const { exec } = require('child_process'); 

// Utils
const fileOps = require('./utils/fileOps.js');
const docignoreUtils = require('./utils/docignore.js');
const codeOps = require('./utils/codeOps.js');

let mainWindow;
let tray;

// ----------------------------
// SINGLE INSTANCE LOCK
// ----------------------------
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    // ----------------------------
    // KEEP TRAY ALIVE
    // ----------------------------
    app.on('window-all-closed', (e) => {
        e.preventDefault();
    });

    // ----------------------------
    // App Ready
    // ----------------------------
    app.whenReady().then(() => {
        console.log('[Main] App is ready');
        createTray();
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

// ----------------------------
// Window
// ----------------------------
function createWindow() {
    console.log('[Main] Creating main window...');
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: true,
        frame: true,
        maximizable: true,
        minimizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('close', (e) => {
        e.preventDefault();
        mainWindow.hide();
        console.log('[Main] Main window hidden instead of close');
    });
}

// ----------------------------
// Tray
// ----------------------------
function createTray() {
    console.log('[Tray] Creating tray icon...');
    tray = new Tray(path.join(__dirname, 'assets', 'helpertool.png'));

    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Open Helper',
            click: () => {
                if (!mainWindow) createWindow();
                mainWindow.show();
                mainWindow.focus();
            }
        },
        { type: 'separator' },
        { label: 'Select Previous Repo', submenu: getPreviousReposMenu() },
        { type: 'separator' },
        { 
            label: 'Exit',
            click: () => {
                tray.destroy();
                app.exit(0);
            }
        }
    ]);

    tray.setToolTip('Helper Tool');
    tray.setContextMenu(contextMenu);
    console.log('[Tray] Tray menu created');
}

// ----------------------------
// Open Global Docignore
// ----------------------------
ipcMain.handle('open-global-docignore', async () => {
    try {
        const globalDocignorePath = path.join(app.getPath('userData'), 'global-docignore.json');
        if (!fs.existsSync(globalDocignorePath)) {
            fs.writeFileSync(globalDocignorePath, JSON.stringify([], null, 2), 'utf-8');
        }
        await shell.openPath(globalDocignorePath);
        return true;
    } catch (err) {
        console.error('[Main] Failed to open global-docignore.json:', err);
        return false;
    }
});

// ----------------------------
// Previous Repos Menu
// ----------------------------
function getPreviousReposMenu() {
    const cfg = config.readConfig();
    const submenu = [];

    for (const repoPath in cfg.projects) {
        submenu.push({
            label: path.basename(repoPath),
            click: () => {
                cfg.activeProject = repoPath;
                config.writeConfig(cfg);
            }
        });
    }

    if (submenu.length === 0) {
        submenu.push({ label: 'No previous repos', enabled: false });
    }

    return submenu;
}

// ----------------------------
// IPC Handlers
// ----------------------------

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

ipcMain.handle('generate', async (event, actionType, repoPath, items, filePath) => {
    try {
        if (!repoPath || !items?.length || !filePath) throw new Error('Invalid arguments');

        const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);
        const outputDir = path.dirname(filePath);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        if (actionType === 'structure') {
            await fileOps.generateStructure(items, filePath, (percent) => {
                mainWindow.webContents.send('progress-update', percent);
            });
        } else if (actionType === 'code') {
            await codeOps.generateCode(items, filePath, (percent) => {
                mainWindow.webContents.send('progress-update', percent);
            }, repoPath, ignoreRules);
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        if (fs.existsSync(filePath)) {
            exec(`taskkill /FI "WINDOWTITLE eq helper-output*" /F`, () => {
                setTimeout(() => {
                    exec(`notepad "${filePath}"`, (err) => {
                        if (err) shell.openPath(filePath);
                    });
                }, 300);
            });
        }

        return true;
    } catch (err) {
        console.error('[IPC] generate error:', err);
        dialog.showErrorBox('Generate Error', err.message);
        return false;
    }
});

ipcMain.handle('open-docignore', async (event, repoPath) => {
    try {
        if (!repoPath) return false;
        const docignoreFile = path.join(repoPath, '.docignore');
        if (!fs.existsSync(docignoreFile)) {
            fs.writeFileSync(docignoreFile, '# Add patterns to ignore files/folders\n', 'utf-8');
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
        const activeProjectPath = config.readConfig().activeProject;
        if (!activeProjectPath) return null;
        const projectData = config.readConfig().projects[activeProjectPath];
        return { repoPath: activeProjectPath, ...projectData };
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

ipcMain.handle('save-file-dialog', async (event, actionType) => {
    const tempFile = path.join(app.getPath('temp'), 'helper-output.txt');
    return { filePath: tempFile };
});

// ----------------------------
// Ignored Extensions
// ----------------------------
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

// ----------------------------
// Folder Filters (ignore + focus)
// ----------------------------
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

// ===== ADD TO main.js — Secret Holder IPC =====

const crypto = require('crypto');

// Storage path for secrets (in userData)
function getSecretsPath() {
    return path.join(app.getPath('userData'), 'secrets.json');
}

function readSecretsFile() {
    const p = getSecretsPath();
    if (!fs.existsSync(p)) return { passwordHash: null, secrets: [] };
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return { passwordHash: null, secrets: [] }; }
}

function writeSecretsFile(data) {
    fs.writeFileSync(getSecretsPath(), JSON.stringify(data, null, 2), 'utf-8');
}

function hashPassword(pw) {
    return crypto.createHash('sha256').update(pw).digest('hex');
}

// Has password been set?
ipcMain.handle('secrets-has-password', () => {
    return !!readSecretsFile().passwordHash;
});

// Set password (first time)
ipcMain.handle('secrets-set-password', (event, pw) => {
    const data = readSecretsFile();
    if (data.passwordHash) return false; // already set
    data.passwordHash = hashPassword(pw);
    writeSecretsFile(data);
    return true;
});

// Verify password
ipcMain.handle('secrets-verify-password', (event, pw) => {
    const data = readSecretsFile();
    if (!data.passwordHash) return false;
    return data.passwordHash === hashPassword(pw);
});

// Reset password (requires old password)
ipcMain.handle('secrets-reset-password', (event, oldPw, newPw) => {
    const data = readSecretsFile();
    if (data.passwordHash !== hashPassword(oldPw)) return false;
    data.passwordHash = hashPassword(newPw);
    writeSecretsFile(data);
    return true;
});

// Get all secrets (requires password verification done client-side — server trusts unlock state)
ipcMain.handle('secrets-get-all', () => {
    return readSecretsFile().secrets || [];
});

// Add secret
ipcMain.handle('secrets-add', (event, name, value) => {
    const data = readSecretsFile();
    const id = Date.now().toString();
    data.secrets = data.secrets || [];
    data.secrets.push({ id, name: name.trim(), value: value.trim() });
    data.secrets.sort((a, b) => a.name.localeCompare(b.name));
    writeSecretsFile(data);
    return true;
});

// Update secret
ipcMain.handle('secrets-update', (event, id, name, value) => {
    const data = readSecretsFile();
    const idx = data.secrets.findIndex(s => s.id === id);
    if (idx === -1) return false;
    data.secrets[idx] = { id, name: name.trim(), value: value.trim() };
    data.secrets.sort((a, b) => a.name.localeCompare(b.name));
    writeSecretsFile(data);
    return true;
});

// Delete secret
ipcMain.handle('secrets-delete', (event, id) => {
    const data = readSecretsFile();
    data.secrets = (data.secrets || []).filter(s => s.id !== id);
    writeSecretsFile(data);
    return true;
});