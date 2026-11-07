const __appStartTime = Date.now();
require('./utils/log').install();

process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason?.message || String(reason));
});

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, screen } = require('electron');
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

// Features whose code talks to the indexer process (indexer-service/indexer.js).
// The process only runs while at least one of them is enabled.
const INDEXER_FLAGS = ['symbolIndex', 'codebbaseChat', 'codebaseMap', 'graphify'];

function readFeatures() {
    try { return config.readConfig()?.features ?? null; } catch (_) { return null; }
}

// null features (first launch) means everything is on
function indexerWanted(feats) {
    return !feats || INDEXER_FLAGS.some((id) => feats[id] !== false);
}

// ----------------------------
// GPU / MEMORY REDUCTION FLAGS
// Must be set BEFORE app.whenReady()
// ----------------------------
app.commandLine.appendSwitch('disable-gpu-sandbox');
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
        performance.mark('app:ready');
        console.log('[Main] App is ready');

        const indexerDbPath = path.join(app.getPath('userData'), 'symbol-index', 'index.db');

        // Start or stop the indexer process to match the enabled features
        const syncIndexer = (feats) => {
            const map = feats === undefined ? readFeatures() : feats;
            if (indexerWanted(map)) {
                indexerProxy.start(indexerDbPath);
            } else {
                indexerProxy.stop();
                try { require('./indexer/watcher.js').destroyAllWatchers(); } catch (_) {}
                console.log('[Main] Indexer stopped: no enabled feature needs it');
            }
        };

        // Keep the indexer off from the start when no enabled feature needs it
        if (!indexerWanted(readFeatures())) indexerProxy.stop();

        // Indexer + prefetch — deferred until first repo selection (or 15s fallback)
        let _indexerStarted = false;
        const startIndexerAndPrefetch = (repoPath) => {
            if (_indexerStarted) return;
            _indexerStarted = true;
            if (indexerWanted(readFeatures())) {
                indexerProxy.start(indexerDbPath);
            } else {
                console.log('[Main] Indexer not started: no enabled feature needs it');
            }
            prefetchService.registerIpc();
            setTimeout(() => {
                prefetchService.start(indexerDbPath, repoPath || '', getMainWindow);
            }, 800);
        };

        registerAllIpc(startIndexerAndPrefetch, syncIndexer);

        try {
            createTray();
        } catch (e) {
            console.error('[Tray] createTray failed:', e);
        }

        // ── Start DB init before window creation ──
        // Each init*Db yields internally before sync I/O, so the event loop
        // processes renderer IPC between them. Running in parallel lets them
        // all start their async file reads concurrently.
        const dbPromise = Promise.all([
            initDatabase(app),
            initChatDb(app),
            initErrorCopDb(app),
        ]);

        // ── Worker fork (non-blocking) ──
        workerProxy.start();

        // ── Create window ──
        createWindow();
        serviceTrackerIpc.setWindow(mainWindow);

        mainWindow.webContents.once('did-finish-load', () => {
            performance.mark('startup:renderer-loaded');
            performance.measure('startup:critical-path', 'app:ready', 'startup:renderer-loaded');
            const measures = performance.getEntriesByType('measure').filter(m => m.name.startsWith('startup:'));
            for (const m of measures) {
              console.log(`[Perf] ${m.name}: ${m.duration.toFixed(1)}ms`);
            }
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
    }).catch((e) => {
        console.error('[Main] Fatal error during app startup:', e);
        try {
            if (!tray) createTray();
        } catch (_) {}
    });

    app.on('before-quit', () => {
        config.flushConfig();
        cleanupAndExit(false);
    });
}

// ----------------------------
// Register all IPC modules
// Staggered to free event loop for first paint + renderer init
// ----------------------------
function registerAllIpc(onRepoSelected, syncIndexer) {
    const shared = { app, config, fileOps, docignoreUtils, codeOps, getMainWindow, onRepoSelected };

    ipcMain.handle('get-app-start-time', () => __appStartTime);

    const safeRegister = (name, fn) => {
      try { fn(); } catch (e) { console.error(`[IPC] Failed to register ${name}:`, e); }
    };

    // Feature-gated IPC modules. null features (first launch) means everything is on.
    const featureOn = (feats, flags) => !feats || flags.some((id) => feats[id] !== false);
    const registeredFeatureIpc = new Set();

    const FEATURE_IPC = [
      { name: 'workspace_ipc',    tier: 1, flags: ['workspaceTool', 'codeswampChat'],          load: () => require('./ipc/workspace_ipc.js').register(shared) },
      { name: 'apitool_ipc',      tier: 1, flags: ['apiTool', 'swagger'],                      load: () => require('./ipc/apitool_ipc.js').register(shared) },
      { name: 'canvas_ipc',       tier: 1, flags: ['canvasTool'],                              load: () => require('./ipc/canvas_ipc.js').register() },
      { name: 'env_ipc',          tier: 1, flags: ['envManager'],                              load: () => require('./ipc/env_ipc.js').register() },
      { name: 'github_ipc',       tier: 1, flags: ['githubExplorer'],                          load: () => require('./ipc/github_ipc.js').register() },
      { name: 'codebbaseChat_ipc',tier: 1, flags: ['codebbaseChat'],                           load: () => require('./ipc/codebbaseChat_ipc.js').register() },
      { name: 'projectInspector', tier: 1, flags: ['projectInspector', 'apiTool'],             load: () => require('./project-inspector/ipc.js').register() },
      { name: 'researcher_ipc',   tier: 1, flags: ['researcherTool'],                          load: () => { const r = require('./ipc/researcher_ipc.js'); r.register(shared); } },

      { name: 'fileseeder_ipc',   tier: 2, flags: ['fileSeeder', 'globalSeeder', 'flowTool'],  load: () => require('./ipc/fileseeder_ipc.js').register(shared) },
      { name: 'loc_ipc',          tier: 2, flags: ['locDetector'],                             load: () => require('./ipc/loc_ipc.js').register(shared) },
      { name: 'portManager',      tier: 2, flags: ['portManagerTool'],                         load: () => require('./ipc/portManager.js').register() },
      { name: 'dbInspector_ipc',  tier: 2, flags: ['dbInspector'],                             load: () => require('./ipc/dbInspector_ipc.js').register(shared) },
      { name: 'teamActivityFeed', tier: 2, flags: ['teamActivityTool'],                        load: () => require('./ipc/teamActivityFeed.js').register() },
      { name: 'video_ipc',        tier: 2, flags: ['videoTool'],                               load: () => require('./ipc/video_ipc.js').register(shared) },
      { name: 'image_ipc',        tier: 2, flags: ['videoTool'],                               load: () => require('./ipc/image_ipc.js').register(shared) },
      { name: 'automation_ipc',   tier: 2, flags: ['automationSketch'],                        load: () => require('./ipc/automation_ipc.js').register() },
      { name: 'docker_ipc',       tier: 2, flags: ['dockerTool'],                              load: () => require('./ipc/docker_ipc.js').register() },
      { name: 'gmail_ipc',        tier: 2, flags: ['gmailTool', 'codebbaseChat'],              load: () => require('./ipc/gmail_ipc.js').register(shared) },
      { name: 'codebaseMap_ipc',  tier: 2, flags: ['codebaseMap'],                             load: () => require('./ipc/codebaseMap_ipc.js').register() },
      { name: 'graphify_ipc',     tier: 2, flags: ['graphify'],                                load: () => { graphifyIpc = require('./ipc/graphify_ipc.js'); graphifyIpc.register({ app }); } },
    ];

    const registerFeatureIpc = (tier) => {
      let feats = null;
      try { feats = config.readConfig()?.features ?? null; } catch (_) {}
      for (const m of FEATURE_IPC) {
        if (tier && m.tier !== tier) continue;
        if (registeredFeatureIpc.has(m.name)) continue;
        if (!featureOn(feats, m.flags)) continue;
        registeredFeatureIpc.add(m.name);
        safeRegister(m.name, m.load);
      }
    };

    // Called by features-set so newly enabled features work without an app restart,
    // and so the indexer process follows the enabled features
    shared.onFeaturesChanged = (feats) => {
      registerFeatureIpc();
      if (typeof syncIndexer === 'function') syncIndexer(feats);
    };

    // Tier 0: Eager - needed before first paint
    require('./ipc/harness_ipc.js').register(shared);
    terminalIpc = require('./ipc/terminal_ipc.js'); terminalIpc.register(shared);
    serviceTrackerIpc.register();
    require('./ipc/opencode_ipc.js').register(shared);

    // Tier 1 (100ms): core modules + enabled common tools
    setTimeout(() => {
      safeRegister('repo_ipc',        () => require('./ipc/repo_ipc.js').register(shared));
      safeRegister('features_ipc',    () => require('./ipc/features_ipc.js').register(shared));
      safeRegister('secrets_ipc',     () => require('./ipc/secrets_ipc.js').register(shared));
      safeRegister('watcher_ipc',     () => require('./ipc/watcher_ipc.js').register(getMainWindow));
      safeRegister('git_ipc',         () => require('./ipc/git_ipc.js').register(shared));
      safeRegister('profile',         () => require('./ipc/profile.js').register(shared));
      safeRegister('generate_ipc',    () => require('./ipc/generate_ipc.js').register(shared));
      safeRegister('symbolIndex_ipc', () => { symbolIndexIpc = require('./ipc/symbolIndex_ipc.js'); symbolIndexIpc.register(shared); });
      safeRegister('codebaseManager', () => require('./ipc/codebaseManager_ipc.js').register());
      safeRegister('prompts_ipc',     () => require('./ipc/prompts_ipc.js').register({ app }));
      safeRegister('shortcut_ipc',    () => require('./ipc/shortcut_ipc.js').register(shared));
      registerFeatureIpc(1);
      performance.mark('tier1:done');
      performance.measure('startup:tier1-ready', 'app:ready', 'tier1:done');
      console.log(`[Perf] Tier 1 (${performance.getEntriesByName('startup:tier1-ready')[0]?.duration.toFixed(1)}ms): core + enabled IPC modules loaded`);
    }, 100);

    // Tier 1b (600ms): Error Cop - before user can open terminal but not blocking first paint
    setTimeout(() => {
      safeRegister('error_cop_ipc',   () => require('./ipc/error_cop_ipc.js').register({ app, getMainWindow }));
    }, 600);

    // Tier 2 (4s): heavy / rarely used tools - only the enabled ones
    setTimeout(() => {
      safeRegister('docignoreManager',() => require('./ipc/docignoreManager_ipc.js').register(shared));
      safeRegister('blueprintLibrary',() => require('./ipc/blueprintLibrary/index.js').register());
      safeRegister('gemini_ipc',      () => require('./ipc/gemini_ipc.js').register());
      registerFeatureIpc(2);
      console.log('[Main] Tier 2: enabled heavy IPC modules loaded');
    }, 4000);

    // Window control IPC (registered once, outside createWindow)
    ipcMain.on('window:minimize', () => mainWindow?.minimize());
    ipcMain.on('window:maximize', () => {
        if (!mainWindow) return;
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    });
    ipcMain.on('window:close', () => mainWindow?.close());

    ipcMain.handle('shell:openExternal', (event, url) => {
      if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
        shell.openExternal(url);
      }
    });
}

// ----------------------------
// Window
// ----------------------------
function fitToWorkArea(win) {
  const display = screen.getDisplayMatching(win.getBounds());
  win.setBounds(display.workArea);
}

function createWindow() {
    console.log('[Main] Creating main window...');
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
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
    mainWindow.once('ready-to-show', () => mainWindow.show());

    // Immediately size to the display's workArea to avoid the frameless
    // maximize overflow bug on Windows (invisible resize-border padding
    // pushes content past visible screen area).
    fitToWorkArea(mainWindow);

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
    mainWindow.on('maximize', () => {
        fitToWorkArea(mainWindow);
        mainWindow.webContents.send('window:maximize-changed', true);
    });
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximize-changed', false));
    mainWindow.webContents.on('unresponsive', () => { console.warn('[Main] renderer unresponsive'); mainWindow.webContents.send('app:unresponsive'); });
    mainWindow.webContents.on('render-process-gone', (e, details) => { console.warn('[Main] render-process-gone', details); mainWindow.webContents.send('app:render-gone', details); });
    mainWindow.webContents.on('did-fail-load', (e, code, desc) => { console.warn('[Main] did-fail-load', code, desc); });
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
                try {
                    const repoConsole = require('./ipc/repoConsole_ipc.js');
                    if (repoConsole.hasRunning()) {
                        const { dialog } = require('electron');
                        const choice = dialog.showMessageBoxSync({
                            type: 'warning',
                            buttons: ['Stop jobs and exit', 'Cancel'],
                            defaultId: 1,
                            cancelId: 1,
                            title: 'Repo Console job running',
                            message: 'A Repo Console job is still running.',
                            detail: 'Exiting now will stop it.'
                        });
                        if (choice !== 0) return;
                    }
                } catch (e) {
                    console.error('[Tray] Running-job check failed:', e);
                }
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
    let cfg;
    try {
        cfg = config.readConfig();
    } catch (e) {
        console.error('[Config] readConfig failed in getPreviousReposMenu:', e);
    }

    const submenu = [];
    const projects = (cfg && cfg.projects) ? cfg.projects : {};

    for (const repoPath in projects) {
        submenu.push({
            label: path.basename(repoPath),
            click: () => {
                const liveCfg = config.readConfig() || {};
                liveCfg.activeProject = repoPath;
                config.writeConfig(liveCfg);
            }
        });
    }

    if (submenu.length === 0) {
        submenu.push({ label: 'No previous repos', enabled: false });
    }

    return submenu;
}

function cleanupAndExit(deleteIndex) {
    try { require('./ipc/repoConsole_ipc.js').stopAll({ hard: true }); } catch (_) {}
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
    try { require('./ipc/researcher_ipc.js').cleanup(); } catch (_) {}
}
app.whenReady().then(() => {
  try {
    require('./ipc/repoConsole_ipc.js').register({ app, config, getMainWindow });
  } catch (e) {
    console.error('[IPC] Failed to register repoConsole_ipc:', e);
  }
});
try {
  require('./ipc/perfMonitor.js').install();
} catch (e) {
  console.error('[Perf] Performance monitor failed to install:', e.message);
}
app.whenReady().then(() => {
  try {
    require('./ipc/security_ipc.js').register({ app, config, getMainWindow });
  } catch (e) {
    console.error('[IPC] Failed to register security_ipc:', e);
  }
});
app.whenReady().then(() => {
  try {
    require('./ipc/ide_ipc.js').register();
  } catch (e) {
    console.error('[IPC] Failed to register ide_ipc:', e);
  }
});
app.whenReady().then(() => {
  try {
    require('./ipc/gitAccounts_ipc.js').register();
  } catch (e) {
    console.error('[IPC] Failed to register gitAccounts_ipc:', e);
  }
});
