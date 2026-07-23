const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CONFIG_DIR  = app.getPath('userData');
const CONFIG_PATH = path.join(CONFIG_DIR, 'helper-config.json');

// ── In-memory cache — eliminates repeated disk reads ──────────────────────
let _cache = null;
let _writeTimer = null;

function readConfig() {
    if (_cache) return _cache;                   // return cached copy

    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    if (!fs.existsSync(CONFIG_PATH)) {
        const defaultConfig = {
            baseStoragePath: path.join(app.getPath('userData'), 'HelperToolStorage'),
            activeProject: null,
            projects: {},
            preferences: {
                docignoreFileName: '.docignore',
                showHiddenFiles: false,
                defaultStructureView: 'tree',
                autoSelectLastProject: true,
            },
        };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
        _cache = defaultConfig;
        return _cache;
    }

    _cache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return _cache;
}

function _doWriteSync() {
    _writeTimer = null;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(_cache));
}

async function _doWrite() {
    _writeTimer = null;
    try {
        await fs.promises.writeFile(CONFIG_PATH, JSON.stringify(_cache));
    } catch (err) {
        console.error('[Config] Async write failed, falling back to sync:', err.message);
        _doWriteSync();
    }
}

function writeConfig(config) {
    _cache = config;
    if (_writeTimer) clearTimeout(_writeTimer);
    _writeTimer = setTimeout(_doWrite, 500);
}

function flushConfig() {
    if (_writeTimer) {
        clearTimeout(_writeTimer);
        _doWriteSync();
    }
}

function invalidateCache() {
    if (_writeTimer) {
        clearTimeout(_writeTimer);
        _writeTimer = null;
    }
    _cache = null;
}

function getActiveProject() {
    const config = readConfig();
    if (config.activeProject) return config.projects[config.activeProject];
    return null;
}

function getLastSelectedItems() {
    const project = getActiveProject();
    return project?.lastSelectedItems || [];
}

function setLastSelectedItems(items) {
    const cfg = readConfig();
    if (cfg.activeProject && cfg.projects[cfg.activeProject]) {
        cfg.projects[cfg.activeProject].lastSelectedItems = items;
        writeConfig(cfg);
    }
}

function ensureStorageFolder(storagePath) {
    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
    }
    ['Codes', 'Structures'].forEach(sub => {
        const subPath = path.join(storagePath, sub);
        if (!fs.existsSync(subPath)) fs.mkdirSync(subPath);
    });
    return storagePath;
}

module.exports = {
    readConfig,
    writeConfig,
    flushConfig,
    invalidateCache,
    getActiveProject,
    getLastSelectedItems,
    setLastSelectedItems,
    ensureStorageFolder,
};