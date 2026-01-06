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

// main.js additions
ipcMain.handle('open-global-docignore', async () => {
    try {
        const globalDocignorePath = path.join(app.getPath('userData'), 'global-docignore.json');

        // Create file if it doesn't exist
        if (!fs.existsSync(globalDocignorePath)) {
            fs.writeFileSync(globalDocignorePath, JSON.stringify([], null, 2), 'utf-8');
            console.log('[Main] Created new global-docignore.json at', globalDocignorePath);
        } else {
            console.log('[Main] global-docignore.json exists at', globalDocignorePath);
        }

        // Open with default editor
        await shell.openPath(globalDocignorePath);
        console.log('[Main] global-docignore.json opened');
        return true;
    } catch (err) {
        console.error('[Main] Failed to open global-docignore.json:', err);
        return false;
    }
});

ipcMain.handle('open-storage', async () => {
    try {
        openStorage(); // just reuse the existing function
        return true;
    } catch (err) {
        console.error('[IPC] open-storage failed:', err);
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

ipcMain.handle('getFolderTree', async (event, repoPath) => {
    try {
        if (!repoPath) return [];

        // No need to load repo-specific docignore anymore
        const ignoreRules = []; // optional: load repo-specific rules if needed
        const tree = fileOps.getFolderTree(repoPath, ignoreRules);
        return tree;
    } catch (err) {
        console.error('[IPC] getFolderTree error:', err);
        return [];
    }
});
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));


ipcMain.handle('generate', async (event, actionType, repoPath, items, filePath) => {
    try {
        console.log('[IPC] generate called:', { actionType, repoPath, itemsLength: items?.length, filePath });
        if (!repoPath || !items?.length || !filePath) throw new Error('Invalid arguments');

        const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);

        // Ensure the directory of the output file exists
        const outputDir = path.dirname(filePath);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        if (actionType === 'structure') {
            console.log('[IPC] Generating structure...');
            await fileOps.generateStructure(items, filePath, ignoreRules, (percent) => {
                mainWindow.webContents.send('progress-update', percent);
                //console.log(`[Progress] ${percent}%`);
            });
        } else if (actionType === 'code') {
            console.log('[IPC] Generating code...');
            await codeOps.generateCode(items, filePath, (percent) => {
                mainWindow.webContents.send('progress-update', percent);
                console.log(`[Progress] ${percent}%`);
            }, repoPath, ignoreRules);
        }

        console.log(`[IPC] Generation complete. Output at: ${filePath}`);
        return true;
    } catch (err) {
        console.error('[IPC] generate error:', err);
        dialog.showErrorBox('Generate Error', err.message);
        return false;
    }
});

// ----------------------------
// Open .docignore file
// ----------------------------
ipcMain.handle('open-docignore', async (event, repoPath) => {
    try {
        if (!repoPath) return false;
        const docignoreFile = path.join(repoPath, '.docignore');

        // If file doesn't exist, create empty
        if (!fs.existsSync(docignoreFile)) {
            fs.writeFileSync(docignoreFile, '# Add patterns to ignore files/folders\n', 'utf-8');
        }

        // Open with default editor
        shell.openPath(docignoreFile);
        console.log('[Main] .docignore opened:', docignoreFile);
        return true;
    } catch (err) {
        console.error('[IPC] open-docignore error:', err);
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

ipcMain.handle('save-file-dialog', async (event, actionType) => {
    const activeProject = config.getActiveProject();
    if (!activeProject) return { filePath: null };

    const defaultFolder = path.join(
        activeProject.storagePath,
        actionType === 'code' ? 'Codes' : 'Structures'
    );

    const result = await dialog.showSaveDialog({
        title: 'Enter output file name',
        defaultPath: path.join(defaultFolder, 'output.txt'),
        buttonLabel: 'Save'
    });

    return { filePath: result.canceled ? null : result.filePath };
});
