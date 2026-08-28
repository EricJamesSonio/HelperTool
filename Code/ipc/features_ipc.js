const { ipcMain } = require('electron');

const DEFAULT_FEATURES = {
    apiTool:       true,
    secretHolder:  true,
    themeEngine:   true,
    folderFilters: true,
    swagger:       true,
};

/**
 * @param {{ config }} deps
 */
function register({ config }) {

    ipcMain.handle('features-get', () => {
        try {
            const cfg = config.readConfig();
            // null means "never been asked" → trigger first-launch wizard
            return cfg.features ?? null;
        } catch (err) {
            console.error('[IPC] features-get error:', err);
            return DEFAULT_FEATURES;
        }
    });

    ipcMain.handle('features-set', (event, features) => {
        try {
            const cfg = config.readConfig();
            cfg.features = { ...DEFAULT_FEATURES, ...features };
            config.writeConfig(cfg);
            return true;
        } catch (err) {
            console.error('[IPC] features-set error:', err);
            return false;
        }
    });
}

    ipcMain.handle('fileseeder:previewContent', (event, basePath, entries) => {
        try {
            if (!basePath || !Array.isArray(entries) || !entries.length) {
                return { error: 'Invalid arguments', toCreate: [], toOverwrite: [] };
            }
            return fileSeeder.previewContent(basePath, entries);
        } catch (err) {
            console.error('[IPC] fileseeder:previewContent error:', err);
            return { error: err.message, toCreate: [], toOverwrite: [] };
        }
    });

    ipcMain.handle('fileseeder:seedContent', (event, basePath, entries) => {
        try {
            if (!basePath || !Array.isArray(entries) || !entries.length) {
                return { error: 'Invalid arguments', created: [], overwritten: [], errors: [] };
            }
            return fileSeeder.seedContent(basePath, entries);
        } catch (err) {
            console.error('[IPC] fileseeder:seedContent error:', err);
            return { error: err.message, created: [], overwritten: [], errors: [] };
        }
    });
module.exports = { register, DEFAULT_FEATURES };