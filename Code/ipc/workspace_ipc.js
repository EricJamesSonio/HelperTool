const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * @param {{ app }} deps
 */
function register({ app }) {

    function getWorkspacePath() {
        return path.join(app.getPath('userData'), 'workspace.json');
    }

    function readWorkspaceFile() {
        const p = getWorkspacePath();
        if (!fs.existsSync(p)) return { projects: [], workers: [], tickets: [], globalLogs: [] };
        try {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        } catch {
            return { projects: [], workers: [], tickets: [], globalLogs: [] };
        }
    }

    function writeWorkspaceFile(data) {
        fs.writeFileSync(getWorkspacePath(), JSON.stringify(data, null, 2), 'utf-8');
    }

    ipcMain.handle('workspaceGetAll', () => {
        try {
            return readWorkspaceFile();
        } catch (err) {
            console.error('[IPC] workspaceGetAll error:', err);
            return { projects: [], workers: [], tickets: [], globalLogs: [] };
        }
    });

    ipcMain.handle('workspaceSaveAll', (event, data) => {
        try {
            if (!data || typeof data !== 'object') throw new Error('Invalid data');
            const validated = {
                projects:   Array.isArray(data.projects)    ? data.projects   : [],
                workers:    Array.isArray(data.workers)      ? data.workers    : [],
                tickets:    Array.isArray(data.tickets)      ? data.tickets    : [],
                globalLogs: Array.isArray(data.globalLogs)   ? data.globalLogs : [],
            };
            writeWorkspaceFile(validated);
            return true;
        } catch (err) {
            console.error('[IPC] workspaceSaveAll error:', err);
            return false;
        }
    });
}

module.exports = { register };