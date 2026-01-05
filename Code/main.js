const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const config = require('./config/config.js');

// Utils (we'll implement them next)
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
        {
            label: 'Select Previous Repo',
            submenu: getPreviousReposMenu()
        },
        { type: 'separator' },
        { label: 'Exit', click: () => app.quit() }
    ]);
    tray.setToolTip('Helper Tool');
    tray.setContextMenu(contextMenu);
}

// Helper to build previous repos submenu
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

// 1️⃣ Select Repo
ipcMain.handle('select-repo', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });

    if (result.canceled || !result.filePaths.length) return null;
    const repoPath = result.filePaths[0];

    // Check if repo exists in config
    const cfg = config.readConfig();
    if (!cfg.projects[repoPath]) {
        // Ask for storage folder name
        const { response, checkboxChecked } = await dialog.showMessageBox({
            type: 'question',
            buttons: ['OK'],
            defaultId: 0,
            title: 'New Storage',
            message: 'Enter a name for this storage folder:',
            detail: 'This will create a storage folder inside C:/Storage'
        });

        // For now we just auto-generate a folder name using repo basename
        const storageName = path.basename(repoPath);
        const storagePath = path.join(cfg.baseStoragePath, storageName);
        if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
        if (!fs.existsSync(path.join(storagePath, 'Codes'))) fs.mkdirSync(path.join(storagePath, 'Codes'));
        if (!fs.existsSync(path.join(storagePath, 'Structures'))) fs.mkdirSync(path.join(storagePath, 'Structures'));

        cfg.projects[repoPath] = {
            storageName,
            storagePath,
            lastUsed: new Date().toISOString()
        };
    }

    cfg.activeProject = repoPath;
    config.writeConfig(cfg);

    return repoPath;
});

// 2️⃣ Get Folder Tree
ipcMain.handle('getFolderTree', async (event, repoPath) => {
    if (!repoPath) return [];

    // Read .docignore rules if exist
    const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);

    // Build tree recursively
    const tree = fileOps.getFolderTree(repoPath, ignoreRules);
    return tree;
});

// 3️⃣ Generate Structure / Code
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

    if (actionType === 'structure') {
        await fileOps.generateStructure(items, outputFile, (percent) => {
            mainWindow.webContents.send('progress-update', percent);
        });
    } else if (actionType === 'code') {
        await codeOps.generateCode(items, outputFile, (percent) => {
            mainWindow.webContents.send('progress-update', percent);
        });
    }

    return true;
});
