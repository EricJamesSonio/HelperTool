const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('serviceTrackerAPI', {
  getAll: () => ipcRenderer.invoke('serviceTracker:getAll'),
  onUpdate: (cb) => ipcRenderer.on('serviceTracker:update', (_, data) => cb(data)),
  offUpdate: (cb) => ipcRenderer.removeListener('serviceTracker:update', cb),
});
