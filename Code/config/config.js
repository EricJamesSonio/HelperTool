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

    const defaultConfig = () => ({
        baseStoragePath: path.join(app.getPath('userData'), 'HelperToolStorage'),
        activeProject: null,
        projects: {},
        preferences: {
            docignoreFileName: '.docignore',
            showHiddenFiles: false,
            defaultStructureView: 'tree',
            autoSelectLastProject: true,
        },
    });

    if (!fs.existsSync(CONFIG_PATH)) {
        const cfg = defaultConfig();
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        _cache = cfg;
        return _cache;
    }

    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        _cache = JSON.parse(raw);
        if (!_cache || typeof _cache !== 'object') throw new Error('Config was not an object');
        if (!_cache.projects || typeof _cache.projects !== 'object') _cache.projects = {};
        if (!_cache.preferences) _cache.preferences = defaultConfig().preferences;
    } catch (e) {
        console.error('[Config] Failed to parse config, backing up and resetting:', e.message);
        try {
            const backupPath = CONFIG_PATH + '.corrupt-' + Date.now() + '.bak';
            fs.copyFileSync(CONFIG_PATH, backupPath);
            console.error('[Config] Corrupted config backed up to:', backupPath);
        } catch (backupErr) {
            console.error('[Config] Could not back up corrupted config:', backupErr.message);
        }
        _cache = defaultConfig();
        try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(_cache, null, 2));
        } catch (writeErr) {
            console.error('[Config] Could not write recovered default config:', writeErr.message);
        }
    }

    return _cache;
}

function _doWriteSync() {
    _writeTimer = null;
    const tmpPath = CONFIG_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(_cache));
    fs.renameSync(tmpPath, CONFIG_PATH);
}

async function _doWrite() {
    _writeTimer = null;
    const tmpPath = CONFIG_PATH + '.tmp';
    try {
        await fs.promises.writeFile(tmpPath, JSON.stringify(_cache));
        await fs.promises.rename(tmpPath, CONFIG_PATH);
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