require('./utils/log').install();

process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason?.message || String(reason));
});

const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');

// ── IPC timing wrapper (Phase 0 instrumentation) ──
const _origHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function (channel, handler) {
  return _origHandle(channel, async (event, ...args) => {
    const start = performance.now();
    try {
      return await handler(event, ...args);
    } finally {
      const duration = performance.now() - start;
      if (duration > 10) {
        console.warn(`[Perf] IPC ${channel}: ${duration.toFixed(1)}ms`);
      }
    }
  });
};

const config = require('./config/config.js');
const fileOps = require('./utils/fileOps.js');
const docignoreUtils = require('./utils/docignore.js');
const codeOps = require('./utils/codeOps.js');

// Lazy-loaded IPC modules (loaded on first use in registerAllIpc)
let terminalIpc = null;
let symbolIndexIpc = null;
let graphifyIpc = null;
const indexerProxy = require('./ipc/indexerProxy.js');
const workerProxy = require('./ipc/workerProxy.js');

const { initDatabase } = require('./database/db.js');
const { initChatDb, closeChatDb } = require('./database/chatDb.js');
const { initErrorCopDb } = require('./database/errorCopDb.js');
const prefetchService = require('./ipc/prefetchService.js');
const serviceTrackerIpc = require('./ipc/serviceTracker_ipc.js');

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

        // Indexer + prefetch — deferred until first repo selection (or 15s fallback)
        let _indexerStarted = false;
        const startIndexerAndPrefetch = (repoPath) => {
            if (_indexerStarted) return;
            _indexerStarted = true;
            const indexerDbPath = path.join(app.getPath('userData'), 'symbol-index', 'index.db');
            indexerProxy.start(indexerDbPath);
            prefetchService.registerIpc();
            setTimeout(() => {
                prefetchService.start(indexerDbPath, repoPath || '', getMainWindow);
            }, 800);
        };

        registerAllIpc(startIndexerAndPrefetch);
        createTray();

        // Start DB init BEFORE window creation — runs in parallel with page load
        const dbPromise = Promise.all([
            initDatabase(app),
            initChatDb(app),
            initErrorCopDb(app),
        ]);

        // Start worker process BEFORE window creation so it's ready when renderer makes its first getFolderTree call
        workerProxy.start();

        createWindow();
        serviceTrackerIpc.setWindow(mainWindow);

        mainWindow.webContents.once('did-finish-load', () => {
            serviceTrackerIpc.updateService('database', 'running', 'Initializing database...');
            dbPromise.then(async () => {
                setTimeout(async () => {
                  try {
                    const termIpc = require('./ipc/terminal_ipc');
                    const engine = termIpc.getErrorEngine();
                    if (engine) engine.getStorage().cleanupStaleSessions();
                  } catch (e) {
                    console.error('[Main] cleanupStaleSessions failed:', e);
                  }
                }, 0);
                const { getDbPath } = require('./database/db.js');
                const _p = getDbPath();
                try {
                  const { size } = await require('fs').promises.stat(_p);
                  console.log('[DB] size:', (size / 1024 / 1024).toFixed(2), 'MB at', _p);
                } catch {
                  console.log('[DB] size: 0 MB at', _p);
                }
                serviceTrackerIpc.updateService('database', 'done');

                // Start indexer+prefetch for already-active project
                const activeProject = config.readConfig()?.activeProject;
                if (activeProject) {
                    startIndexerAndPrefetch(activeProject);
                } else {
                    setTimeout(() => startIndexerAndPrefetch(''), 15000);
                }
            }).catch(err => {
                console.error('[Main] Failed to init DB:', err);
                serviceTrackerIpc.updateService('database', 'failed', err.message);
            });
        });

        console.log('[Main] Helper Tool app running...');

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('before-quit', () => {
        config.flushConfig();
        cleanupAndExit(false);
    });
}

// ----------------------------
// Register all IPC modules
// ----------------------------
function registerAllIpc(onRepoSelected) {
    const shared = { app, config, fileOps, docignoreUtils, codeOps, getMainWindow, onRepoSelected };

    terminalIpc = require('./ipc/terminal_ipc.js'); terminalIpc.register(shared);
    serviceTrackerIpc.register();
    require('./ipc/opencode_ipc.js').register(shared);

    // Defer non-critical IPC registration to after first paint
    setImmediate(() => {
      const safeRegister = (name, fn) => {
        try { fn(); }
        catch (e) { console.error(`[IPC] Failed to register ${name}:`, e); }
      };
      safeRegister('repo_ipc',        () => require('./ipc/repo_ipc.js').register(shared));
      safeRegister('features_ipc',    () => require('./ipc/features_ipc.js').register(shared));
      safeRegister('secrets_ipc',     () => require('./ipc/secrets_ipc.js').register(shared));
      safeRegister('apitool_ipc',     () => require('./ipc/apitool_ipc.js').register(shared));
      safeRegister('workspace_ipc',   () => require('./ipc/workspace_ipc.js').register(shared));
      safeRegister('prompts_ipc',     () => require('./ipc/prompts_ipc.js').register({ app }));
      safeRegister('canvas_ipc',      () => require('./ipc/canvas_ipc.js').register());
      safeRegister('fileseeder_ipc',  () => require('./ipc/fileseeder_ipc.js').register(shared));
      safeRegister('loc_ipc',         () => require('./ipc/loc_ipc.js').register(shared));
      safeRegister('portManager',     () => require('./ipc/portManager.js').register());
      safeRegister('dbInspector_ipc', () => require('./ipc/dbInspector_ipc.js').register(shared));
      safeRegister('docignoreManager',() => require('./ipc/docignoreManager_ipc.js').register(shared));
      safeRegister('teamActivityFeed',() => require('./ipc/teamActivityFeed.js').register());
      safeRegister('blueprintLibrary',() => require('./ipc/blueprintLibrary/index.js').register());
      safeRegister('profile',         () => require('./ipc/profile.js').register(shared));
      safeRegister('env_ipc',         () => require('./ipc/env_ipc.js').register());
      safeRegister('codebaseManager', () => require('./ipc/codebaseManager_ipc.js').register());
      safeRegister('video_ipc',       () => require('./ipc/video_ipc.js').register(shared));
      safeRegister('image_ipc',       () => require('./ipc/image_ipc.js').register(shared));
      safeRegister('automation_ipc',  () => require('./ipc/automation_ipc.js').register());
      safeRegister('github_ipc',      () => require('./ipc/github_ipc.js').register());
      safeRegister('gemini_ipc',      () => require('./ipc/gemini_ipc.js').register());
      safeRegister('error_cop_ipc',   () => require('./ipc/error_cop_ipc.js').register({ app, getMainWindow }));
    });

    // Deferred another tick
    setImmediate(() => {
      const safeRegister = (name, fn) => {
        try { fn(); }
        catch (e) { console.error(`[IPC] Failed to register ${name}:`, e); }
      };
      safeRegister('watcher_ipc',     () => require('./ipc/watcher_ipc.js').register());
    });

    // Heavier IPC modules — deferred another tick so first paint isn't contested
    setImmediate(() => {
      const safeRegister = (name, fn) => {
        try { fn(); }
        catch (e) { console.error(`[IPC] Failed to register ${name}:`, e); }
      };
      safeRegister('generate_ipc',    () => require('./ipc/generate_ipc.js').register(shared));
      safeRegister('git_ipc',         () => require('./ipc/git_ipc.js').register(shared));
      safeRegister('symbolIndex_ipc', () => { symbolIndexIpc = require('./ipc/symbolIndex_ipc.js'); symbolIndexIpc.register(shared); });
      safeRegister('docker_ipc',      () => require('./ipc/docker_ipc.js').register());
      safeRegister('codebbaseChat_ipc',() => require('./ipc/codebbaseChat_ipc.js').register());
      safeRegister('gmail_ipc',       () => require('./ipc/gmail_ipc.js').register(shared));
      safeRegister('codebaseMap_ipc', () => require('./ipc/codebaseMap_ipc.js').register());
      safeRegister('graphify_ipc',    () => { graphifyIpc = require('./ipc/graphify_ipc.js'); graphifyIpc.register({ app }); });
    });

    // ── Window control IPC (registered once, outside createWindow) ──
    ipcMain.on('window:minimize', () => mainWindow?.minimize());
    ipcMain.on('window:maximize', () => {
        if (!mainWindow) return;
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    });
    ipcMain.on('window:close', () => mainWindow?.close());
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
        frame: false,
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

    // Start maximized (fills screen, keeps custom titlebar)
    mainWindow.maximize();

    // Prevent handler accumulation if createWindow is called more than once
    mainWindow.removeAllListeners('close');
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

    // Power save when hidden to tray (close button → hide → tray)
    mainWindow.on('hide', () => {
        mainWindow.webContents.setFrameRate(1);
    });
    mainWindow.on('show', () => {
        mainWindow.webContents.setFrameRate(60);
    });

    // Notify renderer when maximized state changes
    mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximize-changed', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximize-changed', false));
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
                cleanupAndExit(true);
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

function cleanupAndExit(deleteIndex) {
    if (deleteIndex) {
        try {
            const dbModule = require('./database/db.js');
            const db = dbModule.getDb();
            if (db) {
                db.run('PRAGMA foreign_keys=ON');
                db.run('DELETE FROM repositories');
                dbModule.save();
            }
        } catch (_) {}
        try {
            const flagsPath = path.join(app.getPath('userData'), 'symbol-index', '.restore-flags.json');
            if (require('fs').existsSync(flagsPath)) {
                require('fs').unlinkSync(flagsPath);
            }
        } catch (_) {}
    }
    try { const db = require('./database/db.js'); db.close(); } catch (_) {}
    try { closeChatDb(); } catch (_) {}
    try { const watcher = require('./indexer/watcher.js'); watcher.destroyAllWatchers(); } catch (_) {}
    try { require('./ipc/prefetchService.js').stop(); } catch (_) {}
    try { workerProxy.stop(); } catch (_) {}
    try { indexerProxy.stop(); } catch (_) {}
    try { graphifyIpc.shutdown(); } catch (_) {}
}