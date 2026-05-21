const { ipcRenderer } = require('electron');

module.exports = {
    workspaceGetAll:  ()      => ipcRenderer.invoke('workspaceGetAll'),
    workspaceSaveAll: (data)  => ipcRenderer.invoke('workspaceSaveAll', data),
};