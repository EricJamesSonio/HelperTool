const { ipcMain } = require('electron');
const inspector = require('./inspector');
const store = require('./store');

function register() {
  ipcMain.handle('projectInspector:inspect', async (_e, repoPath) => {
    try {
      if (!repoPath) return { success: false, error: 'No repo path provided' };
      const data = inspector.inspect(repoPath);
      store.saveInspection(repoPath, data);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projectInspector:get', async (_e, repoPath) => {
    try {
      if (!repoPath) return { success: false, error: 'No repo path provided' };
      const data = store.loadInspection(repoPath);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projectInspector:list', async () => {
    try {
      const inspections = store.listInspections();
      return { success: true, inspections };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('projectInspector:delete', async (_e, repoPath) => {
    try {
      if (!repoPath) return { success: false, error: 'No repo path provided' };
      store.deleteInspection(repoPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
