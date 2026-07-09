const { ipcMain } = require('electron');
const { TIERS } = require('./motherBoxData.js');

function register() {
  ipcMain.handle('motherbox:get', () => {
    return TIERS;
  });
}

module.exports = { register };
