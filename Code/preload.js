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
    getRecentRepos:      ()              => ipcRenderer.invoke('get-recent-repos'),
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
        getIndexedFileList: (repoPath)              => ipcRenderer.invoke('symbolIndex:getIndexedFileList', repoPath),
        getFileSymbols:   (repoPath, filePath)     => ipcRenderer.invoke('symbolIndex:getFileSymbols', repoPath, filePath),
        getDirtyFiles:    (repoPath)               => ipcRenderer.invoke('symbolIndex:getDirtyFiles', repoPath),
        reindexFile:      (repoPath, filePath)     => ipcRenderer.invoke('symbolIndex:reindexFile', repoPath, filePath),
        getFileDeps:      (repoPath, filePath)     => ipcRenderer.invoke('symbolIndex:getFileDeps', repoPath, filePath),
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

const canvasBridge = {
    canvas: {
        listBoards:   (repoPath)             => ipcRenderer.invoke('canvas:listBoards', repoPath),
        createBoard:  (repoPath, name, data) => ipcRenderer.invoke('canvas:createBoard', repoPath, name, data),
        saveBoard:    (boardId, data)        => ipcRenderer.invoke('canvas:saveBoard', boardId, data),
        loadBoard:    (boardId)              => ipcRenderer.invoke('canvas:loadBoard', boardId),
        deleteBoard:  (boardId)              => ipcRenderer.invoke('canvas:deleteBoard', boardId),
        renameBoard:  (boardId, name)        => ipcRenderer.invoke('canvas:renameBoard', boardId, name),
    },
};

const fileseederBridge = {
    fileSeeder: {
        preview: (basePath, relPaths) =>
            ipcRenderer.invoke('fileseeder:preview', basePath, relPaths),

        seed: (basePath, relPaths) =>
            ipcRenderer.invoke('fileseeder:seed', basePath, relPaths),
    },
};

const locBridge = {
    scan: (options) => ipcRenderer.invoke('loc:scan', options),
    openFile: (filePath) => ipcRenderer.invoke('loc:openFile', filePath),
};

const dbInspectorBridge = {
    dbInspector: {
        testConnection:  (conn)          => ipcRenderer.invoke('dbInspector:testConnection', conn),
        scan:            (conn)          => ipcRenderer.invoke('dbInspector:scan', conn),
        refreshSnapshot: (snapshotId)    => ipcRenderer.invoke('dbInspector:refreshSnapshot', snapshotId),
        listConnections: ()              => ipcRenderer.invoke('dbInspector:listConnections'),
        saveConnection:  (conn)          => ipcRenderer.invoke('dbInspector:saveConnection', conn),
        deleteConnection: (id)           => ipcRenderer.invoke('dbInspector:deleteConnection', id),
        getSnapshots:    (connectionId)  => ipcRenderer.invoke('dbInspector:getSnapshots', connectionId),
        getGraphData:    (snapshotId)    => ipcRenderer.invoke('dbInspector:getGraphData', snapshotId),
        getTableDetails: (snapshotId, tableName) => ipcRenderer.invoke('dbInspector:getTableDetails', snapshotId, tableName),
        executeQuery:    ({ snapshotId, query }) => ipcRenderer.invoke('dbInspector:executeQuery', { snapshotId, query }),
        encrypt:         (text)          => ipcRenderer.invoke('dbInspector:encrypt', text),
        decrypt:         (encrypted)     => ipcRenderer.invoke('dbInspector:decrypt', encrypted),
        listSeeds:       (snapshotId)    => ipcRenderer.invoke('dbInspector:listSeeds', snapshotId),
        saveSeed:        (data)          => ipcRenderer.invoke('dbInspector:saveSeed', data),
        deleteSeed:      (id)            => ipcRenderer.invoke('dbInspector:deleteSeed', id),
    },
};

// ── Window controls ──
const windowControls = {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
    onMaximizeChanged: (callback) => {
        ipcRenderer.on('window:maximize-changed', (_event, maximized) => callback(maximized));
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
    ...canvasBridge,
    ...fileseederBridge,
    ...locBridge,
    ...dbInspectorBridge,
    windowControls,
});

