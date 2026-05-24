const { contextBridge, ipcRenderer } = require('electron');

// Inline all bridge modules directly (no require() calls)


const repoBridge = {
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

const generateBridge = {
    generate: (actionType, repoPath, items, filePath, minify = false, promptText = '') =>
        ipcRenderer.invoke('generate', actionType, repoPath, items, filePath, minify, promptText),

    onProgressUpdate: (callback) => {
        ipcRenderer.removeAllListeners('progress-update');
        ipcRenderer.on('progress-update', (event, percent) => {
            const validPercent = Math.min(Math.max(Math.round(percent), 0), 100);
            callback(validPercent);
        });
    },
};

const featuresBridge = {
    featuresGet: ()  => ipcRenderer.invoke('features-get'),
    featuresSet: (f) => ipcRenderer.invoke('features-set', f),
};

const secretsBridge = {
    secretsHasPassword:    ()            => ipcRenderer.invoke('secrets-has-password'),
    secretsSetPassword:    (pw)          => ipcRenderer.invoke('secrets-set-password', pw),
    secretsVerifyPassword: (pw)          => ipcRenderer.invoke('secrets-verify-password', pw),
    secretsResetPassword:  (old, nw)     => ipcRenderer.invoke('secrets-reset-password', old, nw),
    secretsGetAll:         ()            => ipcRenderer.invoke('secrets-get-all'),
    secretsAdd:            (n, v)        => ipcRenderer.invoke('secrets-add', n, v),
    secretsUpdate:         (id, n, v)    => ipcRenderer.invoke('secrets-update', id, n, v),
    secretsDelete:         (id)          => ipcRenderer.invoke('secrets-delete', id),
};

const apitoolBridge = {
    apiToolGetAll:  ()      => ipcRenderer.invoke('apiToolGetAll'),
    apiToolSaveAll: (apis)  => ipcRenderer.invoke('apiToolSaveAll', apis),
};

const workspaceBridge = {
    workspaceGetAll:  ()      => ipcRenderer.invoke('workspaceGetAll'),
    workspaceSaveAll: (data)  => ipcRenderer.invoke('workspaceSaveAll', data),
};

const gitBridge = {
    git: {
        status:   (repoPath)                    => ipcRenderer.invoke('git:status', repoPath),
        stage:    (repoPath, filePaths)         => ipcRenderer.invoke('git:stage', repoPath, filePaths),
        unstage:  (repoPath, filePaths)         => ipcRenderer.invoke('git:unstage', repoPath, filePaths),
        commit:   (repoPath, message, filePaths) => ipcRenderer.invoke('git:commit', repoPath, message, filePaths),
        push:     (repoPath)                    => ipcRenderer.invoke('git:push', repoPath),
        diff:     (repoPath, filePath)          => ipcRenderer.invoke('git:diff', repoPath, filePath),
        log:      (repoPath, maxCount)          => ipcRenderer.invoke('git:log', repoPath, maxCount || 50),
    },
};

const promptsBridge = {
    prompts: {
        load:              () => ipcRenderer.invoke('prompts-load'),
        getApplicable:    (mode) => ipcRenderer.invoke('prompts-getApplicable', mode),
        createCategory:   (payload) => ipcRenderer.invoke('prompts-createCategory', payload),
        updateCategory:   (payload) => ipcRenderer.invoke('prompts-updateCategory', payload),
        deleteCategory:   (payload) => ipcRenderer.invoke('prompts-deleteCategory', payload),
        upsertPrompt:     (payload) => ipcRenderer.invoke('prompts-upsertPrompt', payload),
        deletePrompt:     (payload) => ipcRenderer.invoke('prompts-deletePrompt', payload),
        toggleFavorite:   (payload) => ipcRenderer.invoke('prompts-toggleFavorite', payload),
        togglePin:        (payload) => ipcRenderer.invoke('prompts-togglePin', payload),
    },
};

const symbolIndexBridge = {
    symbolIndex: {
        init:             ()                       => ipcRenderer.invoke('symbolIndex:init'),
        check:            (repoPath)               => ipcRenderer.invoke('symbolIndex:check', repoPath),
        startIndexing:    (repoPath)               => ipcRenderer.invoke('symbolIndex:startIndexing', repoPath),
        getStatus:        (repoPath)               => ipcRenderer.invoke('symbolIndex:getStatus', repoPath),
        search:           (repoPath, query, limit) => ipcRenderer.invoke('symbolIndex:search', repoPath, query, limit),
        getDirtyCount:    (repoPath)               => ipcRenderer.invoke('symbolIndex:getDirtyCount', repoPath),
        reindexDirty:     (repoPath)               => ipcRenderer.invoke('symbolIndex:reindexDirty', repoPath),
        reset:            (repoPath)               => ipcRenderer.invoke('symbolIndex:reset', repoPath),
        delete:           (repoPath)               => ipcRenderer.invoke('symbolIndex:delete', repoPath),
        stopWatcher:      (repoPath)               => ipcRenderer.invoke('symbolIndex:stopWatcher', repoPath),
        getManaged:       ()                       => ipcRenderer.invoke('symbolIndex:getManaged'),
        getSymbolTypes:   (repoPath)               => ipcRenderer.invoke('symbolIndex:getSymbolTypes', repoPath),
        getIndexedFiles:  (repoPath)               => ipcRenderer.invoke('symbolIndex:getIndexedFiles', repoPath),
        onProgress:       (callback) => {
            ipcRenderer.removeAllListeners('symbolIndex:progress');
            ipcRenderer.on('symbolIndex:progress', (_, data) => callback(data));
        },
        onError:          (callback) => {
            ipcRenderer.removeAllListeners('symbolIndex:error');
            ipcRenderer.on('symbolIndex:error', (_, msg) => callback(msg));
        },
        onDirtyChanged:   (callback) => {
            ipcRenderer.removeAllListeners('symbolIndex:dirtyChanged');
            ipcRenderer.on('symbolIndex:dirtyChanged', (_, count) => callback(count));
        },
    },
};

// Expose everything to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
    ...repoBridge,
    ...generateBridge,
    ...featuresBridge,
    ...secretsBridge,
    ...apitoolBridge,
    ...workspaceBridge,
    ...gitBridge,
    ...promptsBridge,
    ...symbolIndexBridge,
});

