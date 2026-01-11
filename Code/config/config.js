const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Always store config in a writable OS location (works in dev + packaged exe)
const CONFIG_DIR = app.getPath('userData');
const CONFIG_PATH = path.join(CONFIG_DIR, 'helper-config.json');

function readConfig() {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Create default config if missing
    if (!fs.existsSync(CONFIG_PATH)) {
        const defaultConfig = {
            baseStoragePath: path.join(app.getPath('userData'), 'HelperToolStorage'),
            activeProject: null,
            projects: {},
            preferences: {
                docignoreFileName: ".docignore",
                showHiddenFiles: false,
                defaultStructureView: "tree",
                autoSelectLastProject: true
            }
        };

        fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }

    // Read existing config
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function writeConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getActiveProject() {
    const config = readConfig();
    if (config.activeProject) {
        return config.projects[config.activeProject];
    }
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
        if (!fs.existsSync(subPath)) {
            fs.mkdirSync(subPath);
        }
    });

    return storagePath;
}

module.exports = { 
    readConfig, 
    writeConfig, 
    getActiveProject, 
    getLastSelectedItems,
    setLastSelectedItems,
    ensureStorageFolder
};
