const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');

const config = require('./config/config.js');
const fileOps = require('./utils/fileOps.js');
const docignoreUtils = require('./utils/docignore.js');
const codeOps = require('./utils/codeOps.js');

// IPC modules
const repoIpc      = require('./ipc/repo_ipc.js');
const featuresIpc  = require('./ipc/features_ipc.js');
const secretsIpc   = require('./ipc/secrets_ipc.js');
const apitoolIpc   = require('./ipc/apitool_ipc.js');
const workspaceIpc = require('./ipc/workspace_ipc.js');
const generateIpc  = require('./ipc/generate_ipc.js');
const gitIpc = require('./ipc/git_ipc.js');
const promptsIpc = require('./ipc/prompts_ipc.js');
const symbolIndexIpc = require('./ipc/symbolIndex_ipc.js');
const { initDatabase } = require('./database/db.js');





// ----------------------------
// GPU / MEMORY REDUCTION FLAGS
// Must be set BEFORE app.whenReady()
// ----------------------------
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('num-raster-threads', '1');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'TranslateUI,AutofillServerCommunication');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');

let mainWindow;
let tray;

// Getter passed to IPC modules that need mainWindow at call-time (not init-time)
function getMainWindow() { return mainWindow; }

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

    app.on('window-all-closed', (e) => {
        e.preventDefault();
    });

    app.whenReady().then(async () => {
        console.log('[Main] App is ready');
        registerAllIpc();
        createTray();
        createWindow();

        // Initialize symbol index database
        try {
            await initDatabase(app);
        } catch (err) {
            console.error('[Main] Failed to init symbol index DB:', err);
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('before-quit', () => {
        const db = require('./database/db.js');
        db.close();
        const watcher = require('./indexer/watcher.js');
        watcher.destroyAllWatchers();
    });
}

// ----------------------------
// Register all IPC modules
// ----------------------------
function registerAllIpc() {
    const shared = { app, config, fileOps, docignoreUtils, codeOps, getMainWindow };

    repoIpc.register(shared);
    featuresIpc.register(shared);
    secretsIpc.register(shared);
    apitoolIpc.register(shared);
    workspaceIpc.register(shared);
    generateIpc.register(shared);
    gitIpc.register(shared);
    promptsIpc.register({ app });
    symbolIndexIpc.register(shared);
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
        backgroundThrottling: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            spellcheck: false,
            enableWebSQL: false,
            devTools: process.env.NODE_ENV !== 'production',
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('close', (e) => {
        e.preventDefault();
        mainWindow.hide();
        console.log('[Main] Main window hidden instead of close');
    });

    mainWindow.on('minimize', () => {
        mainWindow.webContents.setFrameRate(1);
    });

    mainWindow.on('restore', () => {
        mainWindow.webContents.setFrameRate(60);
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