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

module.exports = { register, DEFAULT_FEATURES };