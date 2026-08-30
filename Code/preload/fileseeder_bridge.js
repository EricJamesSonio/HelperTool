const { ipcRenderer } = require('electron');

module.exports = {
    fileSeeder: {
        preview:        (basePath, relPaths) => ipcRenderer.invoke('fileseeder:preview', basePath, relPaths),
        seed:           (basePath, relPaths) => ipcRenderer.invoke('fileseeder:seed', basePath, relPaths),
        previewContent: (basePath, entries)  => ipcRenderer.invoke('fileseeder:previewContent', basePath, entries),
        seedContent:    (basePath, entries)  => ipcRenderer.invoke('fileseeder:seedContent', basePath, entries),
        getPatchedPreview: (basePath, resolved, allEntries) => ipcRenderer.invoke('fileseeder:getPatchedPreview', basePath, resolved, allEntries),
        debugLog:       (msg)               => ipcRenderer.invoke('fileseeder:debugLog', msg),
    },
};