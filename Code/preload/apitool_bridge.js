const { ipcRenderer } = require('electron');

module.exports = {
    apiToolGetAll:  ()      => ipcRenderer.invoke('apiToolGetAll'),
    apiToolSaveAll: (apis)  => ipcRenderer.invoke('apiToolSaveAll', apis),
};