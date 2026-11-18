const { ipcMain } = require('electron');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

function register({ config }) {
    ipcMain.handle('repos:recent', (event, limit) => {
        try {
            const n = Math.max(1, Math.min(MAX_LIMIT, parseInt(limit, 10) || DEFAULT_LIMIT));
            const cfg = config.readConfig();
            return Object.entries(cfg.projects || {})
                .map(([repoPath, data]) => ({ repoPath, ...data }))
                .filter((r) => r.lastUsed)
                .sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed))
                .slice(0, n);
        } catch (err) {
            console.error('[IPC] repos:recent error:', err);
            return [];
        }
    });
}

module.exports = { register };