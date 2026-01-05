const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Repo selection
    selectRepo: () => ipcRenderer.invoke('select-repo'),

    // Folder tree
    getFolderTree: (repoPath) => ipcRenderer.invoke('getFolderTree', repoPath),

    // Generate structure/code
    generate: (actionType, repoPath, items, fileName) => {
        return ipcRenderer.invoke('generate', actionType, repoPath, items, fileName);
    },

    // Open storage folder
    openStorage: () => ipcRenderer.invoke('open-storage'),

    // Progress updates
    onProgressUpdate: (callback) => {
        ipcRenderer.removeAllListeners('progress-update'); // avoid duplicate callbacks
        ipcRenderer.on('progress-update', (event, percent) => {
            const validPercent = Math.min(Math.max(Math.round(percent), 0), 100);
            callback(validPercent);
        });
    },

    // .docignore
    getDocignore: (repoPath) => ipcRenderer.invoke('get-docignore', repoPath),

    // Last selected items
    getLastSelected: () => ipcRenderer.invoke('get-last-selected'),
    setLastSelected: (items) => ipcRenderer.invoke('set-last-selected', items),

    // Active project
    getActiveProject: () => ipcRenderer.invoke('get-active-project')
});
