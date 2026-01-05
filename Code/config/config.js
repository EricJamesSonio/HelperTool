const fs = require('fs');
const path = require('path');
const { app } = require('electron'); // Add electron app

const CONFIG_PATH = path.join(__dirname, 'helper-config.json');

function readConfig() {
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
    return JSON.parse(fs.readFileSync(CONFIG_PATH));
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

// ✅ New: get last selected items for active project
function getLastSelectedItems() {
    const project = getActiveProject();
    return project?.lastSelectedItems || [];
}

// ✅ New: set last selected items for active project
function setLastSelectedItems(items) {
    const cfg = readConfig();
    if (cfg.activeProject && cfg.projects[cfg.activeProject]) {
        cfg.projects[cfg.activeProject].lastSelectedItems = items;
        writeConfig(cfg);
    }
}

// ✅ Helper to ensure storage folder exists safely
function ensureStorageFolder(storagePath) {
    if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
    const codesPath = path.join(storagePath, 'Codes');
    const structuresPath = path.join(storagePath, 'Structures');
    if (!fs.existsSync(codesPath)) fs.mkdirSync(codesPath);
    if (!fs.existsSync(structuresPath)) fs.mkdirSync(structuresPath);
    return storagePath;
}

module.exports = { 
    readConfig, 
    writeConfig, 
    getActiveProject, 
    getLastSelectedItems,
    setLastSelectedItems,   // ✅ corrected
    ensureStorageFolder
};
