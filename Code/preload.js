// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ------------------------
    // Repo selection
    // ------------------------
    selectRepo: () => ipcRenderer.invoke('select-repo'),

    // ------------------------
    // Folder tree
    // ------------------------
    getFolderTree: (repoPath) => ipcRenderer.invoke('getFolderTree', repoPath),

    // ------------------------
    // Generate structure/code
    // ------------------------
    generate: (actionType, repoPath, items, filePath) => {
        return ipcRenderer.invoke('generate', actionType, repoPath, items, filePath);
    },

    // ------------------------
    // Open storage folder
    // ------------------------
    openDocignore: (repoPath) => ipcRenderer.invoke('open-docignore', repoPath),
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    openGlobalDocignore: () => ipcRenderer.invoke('open-global-docignore'),

    // ------------------------
    // Progress updates
    // ------------------------
    onProgressUpdate: (callback) => {
        ipcRenderer.removeAllListeners('progress-update');
        ipcRenderer.on('progress-update', (event, percent) => {
            const validPercent = Math.min(Math.max(Math.round(percent), 0), 100);
            callback(validPercent);
        });
    },

    // ------------------------
    // .docignore
    // ------------------------
    getDocignore: (repoPath) => ipcRenderer.invoke('get-docignore', repoPath),

    // ------------------------
    // Last selected items
    // ------------------------
    getLastSelected: () => ipcRenderer.invoke('get-last-selected'),
    setLastSelected: (items) => ipcRenderer.invoke('set-last-selected', items),

    // ------------------------
    // Active project
    // ------------------------
    getActiveProject: () => ipcRenderer.invoke('get-active-project'),

    // ------------------------
    // Save file dialog
    // ------------------------
    saveFileDialog: (actionType) => ipcRenderer.invoke('save-file-dialog', actionType),

    // ------------------------
    // Ignored extensions
    // ------------------------
    getIgnoredExtensions: () => ipcRenderer.invoke('get-ignored-extensions'),
    setIgnoredExtensions: (exts) => ipcRenderer.invoke('set-ignored-extensions', exts),

    // ------------------------
    // Folder filters (ignore + focus)
    // ------------------------
    getFolderFilters: () => ipcRenderer.invoke('get-folder-filters'),
    setFolderFilters: (filters) => ipcRenderer.invoke('set-folder-filters', filters),

    // ------------------------
    // Secret Holder
    // ------------------------
    secretsHasPassword:      ()           => ipcRenderer.invoke('secrets-has-password'),
    secretsSetPassword:      (pw)         => ipcRenderer.invoke('secrets-set-password', pw),
    secretsVerifyPassword:   (pw)         => ipcRenderer.invoke('secrets-verify-password', pw),
    secretsResetPassword:    (old, nw)    => ipcRenderer.invoke('secrets-reset-password', old, nw),
    secretsGetAll:           ()           => ipcRenderer.invoke('secrets-get-all'),
    secretsAdd:              (n, v)       => ipcRenderer.invoke('secrets-add', n, v),
    secretsUpdate:           (id, n, v)   => ipcRenderer.invoke('secrets-update', id, n, v),
    secretsDelete:           (id)         => ipcRenderer.invoke('secrets-delete', id),

    // ------------------------
    // API Tool
    // ------------------------
    apiToolGetAll:  () => ipcRenderer.invoke('apiToolGetAll'),
    apiToolSaveAll: (apis) => ipcRenderer.invoke('apiToolSaveAll', apis),
});