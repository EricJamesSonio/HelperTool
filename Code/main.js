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

function createWindow() {
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
    });
}

app.whenReady().then(() => {
    createTray();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

function createTray() {
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
}

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

function openStorage() {
    const activeProject = config.getActiveProject();
    if (activeProject) {
        const storagePath = activeProject.storagePath;
        if (fs.existsSync(storagePath)) {
            shell.openPath(storagePath);
        } else {
            dialog.showErrorBox('Storage Not Found', 'Storage folder does not exist.');
        }
    } else {
        dialog.showErrorBox('No Active Project', 'Select a project first.');
    }
}

/* ===========================
   IPC Handlers
=========================== */

// 1️⃣ Select repo (updated to use userData storage)
ipcMain.handle('select-repo', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });

    if (result.canceled || !result.filePaths.length) return null;
    const repoPath = result.filePaths[0];

    const cfg = config.readConfig();
    const storageName = path.basename(repoPath).replace(/[^a-zA-Z0-9-_]/g, '_');

    // Save inside Electron userData folder
    const userDataPath = app.getPath('userData');
    const storagePath = path.join(userDataPath, storageName);

    try {
        // Ensure base folder exists
        if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
        // Ensure storage folder and subfolders exist
        if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
        ['Codes', 'Structures'].forEach(sub => {
            const subPath = path.join(storagePath, sub);
            if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
        });
    } catch (err) {
        dialog.showErrorBox('Permission Error', `Cannot create storage folder:\n${storagePath}\n\n${err.message}`);
        return null;
    }

    // Add or update project in config
    cfg.projects[repoPath] = {
        storageName,
        storagePath,
        lastUsed: new Date().toISOString()
    };

    // Set active project
    cfg.activeProject = repoPath;
    config.writeConfig(cfg);

    return repoPath;
});

// 2️⃣ Get folder tree
ipcMain.handle('getFolderTree', async (event, repoPath) => {
    if (!repoPath) return [];

    const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);
    return fileOps.getFolderTree(repoPath, ignoreRules);
});

// 3️⃣ Generate structure/code
ipcMain.handle('generate', async (event, actionType, repoPath, items, fileName) => {
    if (!repoPath || !items.length || !fileName) return;

    const activeProject = config.getActiveProject();
    if (!activeProject) {
        dialog.showErrorBox('Error', 'No active project found in config.');
        return;
    }

    const storagePath = activeProject.storagePath;
    const outputFolder = actionType === 'code'
        ? path.join(storagePath, 'Codes')
        : path.join(storagePath, 'Structures');

    if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });

    const outputFile = path.join(outputFolder, fileName);
    const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);

    if (actionType === 'structure') {
        await fileOps.generateStructure(items, outputFile, ignoreRules, (percent) => {
            mainWindow.webContents.send('progress-update', percent);
        });
    } else if (actionType === 'code') {
        await codeOps.generateCode(items, outputFile, (percent) => {
            mainWindow.webContents.send('progress-update', percent);
        }, repoPath, ignoreRules);
    }

    return true;
});

// 4️⃣ Get .docignore rules
ipcMain.handle('get-docignore', async (event, repoPath) => {
    if (!repoPath) return [];
    return await docignoreUtils.getIgnoreRules(repoPath);
});

// 5️⃣ Get last active project
ipcMain.handle('get-active-project', () => {
    return config.getActiveProject();
});

// ✅ IPC: get last selected items
ipcMain.handle('get-last-selected', () => {
    return config.getLastSelectedItems();
});

// ✅ IPC: save last selected items
ipcMain.handle('set-last-selected', (event, items) => {
    config.setLastSelectedItems(items);
});
