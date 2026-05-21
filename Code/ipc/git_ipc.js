const { ipcMain } = require('electron');
const GitOperations = require('../utils/gitOps');

/**
 * @param {{}} _deps - no shared deps needed; GitOperations is instantiated per-call
 */
function register(_deps) {

    ipcMain.handle('git:status', async (event, repoPath) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.getStatus();
        } catch (err) {
            console.error('[IPC] git:status error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:stage', async (event, repoPath, filePaths) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.stage(filePaths);
        } catch (err) {
            console.error('[IPC] git:stage error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:unstage', async (event, repoPath, filePaths) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.unstage(filePaths);
        } catch (err) {
            console.error('[IPC] git:unstage error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:commit', async (event, repoPath, message, filePaths) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.commit(message, filePaths);
        } catch (err) {
            console.error('[IPC] git:commit error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:push', async (event, repoPath) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.push();
        } catch (err) {
            console.error('[IPC] git:push error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:diff', async (event, repoPath, filePath) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.getDiff(filePath);
        } catch (err) {
            console.error('[IPC] git:diff error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:log', async (event, repoPath, maxCount) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.getLog(maxCount || 50);
        } catch (err) {
            console.error('[IPC] git:log error:', err);
            return { error: err.message, success: false };
        }
    });
}

module.exports = { register };