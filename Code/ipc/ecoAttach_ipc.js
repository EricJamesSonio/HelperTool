const { ipcMain } = require('electron');
const ecoTool = require('../ecoTool');

function register() {
  ipcMain.handle('eco:attach', (event, terminalId) => {
    if (typeof terminalId !== 'number') return { success: false, error: 'Invalid terminal id' };
    return ecoTool.attach(terminalId);
  });
}

module.exports = { register };