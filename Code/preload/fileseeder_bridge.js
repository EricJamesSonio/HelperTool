/**
 * preload/fileseeder_bridge.js
 */

const { ipcRenderer } = require('electron');

module.exports = {
    fileSeeder: {
        preview: (basePath, relPaths) => ipcRenderer.invoke('fileseeder:preview', basePath, relPaths),
        seed:    (basePath, relPaths) => ipcRenderer.invoke('fileseeder:seed',    basePath, relPaths),
    },
};