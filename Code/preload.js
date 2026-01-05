const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectRepo: () => ipcRenderer.invoke('select-repo'),
    getFolderTree: (repoPath) => ipcRenderer.invoke('getFolderTree', repoPath),
    generate: (actionType, repoPath, items, fileName, onProgress) => {
        return ipcRenderer.invoke('generate', actionType, repoPath, items, fileName)
            .then(() => {
                if (onProgress) onProgress(100);
            });
    },
    openStorage: () => ipcRenderer.invoke('open-storage'),
    onProgressUpdate: (callback) => ipcRenderer.on('progress-update', (event, percent) => callback(percent))
});
