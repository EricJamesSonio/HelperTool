const { ipcMain } = require('electron');

/**
 * @param {{ config }} deps
 */
function register({ config }) {

    ipcMain.handle('apiToolGetAll', () => {
        try {
            const cfg = config.readConfig();
            return cfg.apis || [];
        } catch (err) {
            console.error('[IPC] apiToolGetAll error:', err);
            return [];
        }
    });

    ipcMain.handle('apiToolSaveAll', (event, apis) => {
        try {
            const cfg = config.readConfig();
            cfg.apis = apis;
            config.writeConfig(cfg);
            return true;
        } catch (err) {
            console.error('[IPC] apiToolSaveAll error:', err);
            return false;
        }
    });
}

module.exports = { register };