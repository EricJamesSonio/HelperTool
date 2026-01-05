const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const config = require('./config/config.js');

// Utils
const fileOps = require('./utils/fileOps.js');
const docignoreUtils = require('./utils/docignore.js');
const codeOps = require('./utils/codeOps.js');

let mainWindow;
let tray;

// ----------------------------
// Create Main Window
// ----------------------------
function createWindow() {
    console.log('[Main] Creating main window...');
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: true,
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

// ----------------------------
// Tray
// ----------------------------
function createTray() {
    console.log('[Tray] Creating tray icon...');
    tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Open Helper', click: () => mainWindow.show() },
        { label: 'Open Storage Folder', click: () => openStorage() },
        { type: 'separator' },
        { label: 'Select Previous Repo', submenu: getPreviousReposMenu() },
        { type: 'separator' },
        { label: 'Exit', click: () => app.quit() }
    ]);

    tray.setToolTip('Helper Tool');
    tray.setContextMenu(contextMenu);
    console.log('[Tray] Tray menu created');
}

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
                console.log('[Tray] Setting active project:', repoPath);
                cfg.activeProject = repoPath;
                config.writeConfig(cfg);
            }
        });
    }

    if (submenu.length === 0) {
        submenu.push({ label: 'No previous repos', enabled: false });
        console.log('[Tray] No previous repos found');
    }

    return submenu;
}

// ----------------------------
// Open Storage Folder
// ----------------------------
function openStorage() {
    try {
        const activeProject = config.getActiveProject();
        if (activeProject) {
            const storagePath = activeProject.storagePath;
            console.log('[Storage] Opening storage folder:', storagePath);
            if (fs.existsSync(storagePath)) {
                shell.openPath(storagePath);
            } else {
                console.warn('[Storage] Storage folder does not exist:', storagePath);
                dialog.showErrorBox('Storage Not Found', 'Storage folder does not exist.');
            }
        } else {
            console.warn('[Storage] No active project');
            dialog.showErrorBox('No Active Project', 'Select a project first.');
        }
    } catch (err) {
        console.error('[Error] openStorage failed:', err);
    }
}

// ----------------------------
// IPC Handlers
// ----------------------------

// Select repo
ipcMain.handle('select-repo', async () => {
    try {
        console.log('[IPC] select-repo called');
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });

        if (result.canceled || !result.filePaths.length) {
            console.log('[IPC] Repo selection cancelled');
            return null;
        }

        const repoPath = result.filePaths[0];
        console.log('[IPC] Repo selected:', repoPath);

        const cfg = config.readConfig();
        const storageName = path.basename(repoPath).replace(/[^a-zA-Z0-9-_]/g, '_');
        const userDataPath = app.getPath('userData');
        const storagePath = path.join(userDataPath, storageName);

        // Create storage folders
        if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
        if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
        ['Codes', 'Structures'].forEach(sub => {
            const subPath = path.join(storagePath, sub);
            if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
        });
        console.log('[IPC] Storage folders ensured at:', storagePath);

        // Update config
        cfg.projects[repoPath] = {
            storageName,
            storagePath,
            lastUsed: new Date().toISOString()
        };
        cfg.activeProject = repoPath;
        config.writeConfig(cfg);
        console.log('[IPC] Config updated for repo:', repoPath);

        return repoPath;
    } catch (err) {
        console.error('[IPC] select-repo error:', err);
        dialog.showErrorBox('Select Repo Error', err.message);
        return null;
    }
});

// Get folder tree
ipcMain.handle('getFolderTree', async (event, repoPath) => {
    try {
        console.log('[IPC] getFolderTree called for:', repoPath);
        if (!repoPath) return [];

        const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);
        const tree = fileOps.getFolderTree(repoPath, ignoreRules);
        console.log('[IPC] Folder tree returned, nodes:', tree.length);
        return tree;
    } catch (err) {
        console.error('[IPC] getFolderTree error:', err);
        return [];
    }
});

// Generate code or structure
ipcMain.handle('generate', async (event, actionType, repoPath, items, fileName) => {
    try {
        console.log('[IPC] generate called:', { actionType, repoPath, itemsLength: items?.length, fileName });
        if (!repoPath || !items?.length || !fileName) throw new Error('Invalid arguments');

        const activeProject = config.getActiveProject();
        if (!activeProject) throw new Error('No active project found');

        const storagePath = activeProject.storagePath;
        const outputFolder = actionType === 'code'
            ? path.join(storagePath, 'Codes')
            : path.join(storagePath, 'Structures');

        if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });

        const outputFile = path.join(outputFolder, fileName);
        const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);

        if (actionType === 'structure') {
            console.log('[IPC] Generating structure...');
            await fileOps.generateStructure(items, outputFile, ignoreRules, (percent) => {
                mainWindow.webContents.send('progress-update', percent);
                console.log(`[Progress] ${percent}%`);
            });
        } else if (actionType === 'code') {
            console.log('[IPC] Generating code...');
            await codeOps.generateCode(items, outputFile, (percent) => {
                mainWindow.webContents.send('progress-update', percent);
                console.log(`[Progress] ${percent}%`);
            }, repoPath, ignoreRules);
        }

        console.log(`[IPC] Generation complete. Output at: ${outputFile}`);
        return true;
    } catch (err) {
        console.error('[IPC] generate error:', err);
        dialog.showErrorBox('Generate Error', err.message);
        return false;
    }
});

// Get .docignore rules
ipcMain.handle('get-docignore', async (event, repoPath) => {
    try {
        console.log('[IPC] get-docignore called for:', repoPath);
        if (!repoPath) return [];
        return await docignoreUtils.getIgnoreRules(repoPath);
    } catch (err) {
        console.error('[IPC] get-docignore error:', err);
        return [];
    }
});

// Get active project
ipcMain.handle('get-active-project', () => {
    try {
        console.log('[IPC] get-active-project called');
        const activeProjectPath = config.readConfig().activeProject;
        if (!activeProjectPath) return null;
        const projectData = config.readConfig().projects[activeProjectPath];
        console.log('[IPC] Active project data:', projectData);
        return { repoPath: activeProjectPath, ...projectData };
    } catch (err) {
        console.error('[IPC] get-active-project error:', err);
        return null;
    }
});

// Get last selected items
ipcMain.handle('get-last-selected', () => {
    try {
        const items = config.getLastSelectedItems();
        console.log('[IPC] get-last-selected:', items);
        return items;
    } catch (err) {
        console.error('[IPC] get-last-selected error:', err);
        return [];
    }
});

// Set last selected items
ipcMain.handle('set-last-selected', (event, items) => {
    try {
        console.log('[IPC] set-last-selected:', items);
        config.setLastSelectedItems(items);
    } catch (err) {
        console.error('[IPC] set-last-selected error:', err);
    }
});
