const { ipcMain } = require('electron');
const store = require('../services/automationStore');

function register() {
  ipcMain.handle('automation:list', async () => {
    try {
      return { success: true, sketches: store.listSketches() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('automation:load', async (event, { id }) => {
    try {
      const sketch = store.loadSketch(id);
      if (!sketch) return { success: false, error: 'Sketch not found' };
      return { success: true, sketch };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('automation:save', async (event, { sketch }) => {
    try {
      const saved = store.saveSketch(sketch);
      return { success: true, sketch: saved };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('automation:delete', async (event, { id }) => {
    try {
      store.deleteSketch(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('automation:rename', async (event, { id, name }) => {
    try {
      const s = store.renameSketch(id, name);
      if (!s) return { success: false, error: 'Sketch not found' };
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
