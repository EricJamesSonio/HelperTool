const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectRepo: () => ipcRenderer.invoke('select-repo'),
    generateStructure: (items) => ipcRenderer.invoke('generate-structure', items),
    generateCode: (items) => ipcRenderer.invoke('generate-code', items),
    openStorage: () => ipcRenderer.invoke('open-storage')
});
