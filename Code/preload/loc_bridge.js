const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('locBridge', {
  scan: (options) => ipcRenderer.invoke('loc:scan', options)
});