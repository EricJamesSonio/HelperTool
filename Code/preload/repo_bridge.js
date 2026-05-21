const { ipcRenderer } = require('electron');

module.exports = {
    selectRepo:          ()              => ipcRenderer.invoke('select-repo'),
    getFolderTree:       (repoPath)      => ipcRenderer.invoke('getFolderTree', repoPath),
    getUserDataPath:     ()              => ipcRenderer.invoke('get-user-data-path'),
    openDocignore:       (repoPath)      => ipcRenderer.invoke('open-docignore', repoPath),
    openGlobalDocignore: ()              => ipcRenderer.invoke('open-global-docignore'),
    getDocignore:        (repoPath)      => ipcRenderer.invoke('get-docignore', repoPath),
    getLastSelected:     ()              => ipcRenderer.invoke('get-last-selected'),
    setLastSelected:     (items)         => ipcRenderer.invoke('set-last-selected', items),
    getActiveProject:    ()              => ipcRenderer.invoke('get-active-project'),
    saveFileDialog:      (actionType)    => ipcRenderer.invoke('save-file-dialog', actionType),
    getIgnoredExtensions: ()             => ipcRenderer.invoke('get-ignored-extensions'),
    setIgnoredExtensions: (exts)         => ipcRenderer.invoke('set-ignored-extensions', exts),
    getFolderFilters:    ()              => ipcRenderer.invoke('get-folder-filters'),
    setFolderFilters:    (filters)       => ipcRenderer.invoke('set-folder-filters', filters),
};