const { contextBridge, ipcRenderer } = require('electron');

// Inline all bridge modules directly (no require() calls)


const repoBridge = {
    selectRepo:          ()              => ipcRenderer.invoke('select-repo'),
    selectFolder:        ()              => ipcRenderer.invoke('select-folder'),
    getFolderTree:       (repoPath)      => ipcRenderer.invoke('getFolderTree', repoPath),
    getUserDataPath:     ()              => ipcRenderer.invoke('get-user-data-path'),
    openDocignore:       (repoPath)      => ipcRenderer.invoke('open-docignore', repoPath),
    openGlobalDocignore: ()              => ipcRenderer.invoke('open-global-docignore'),
    getDocignore:        (repoPath)      => ipcRenderer.invoke('get-docignore', repoPath),
    getLastSelected:     ()              => ipcRenderer.invoke('get-last-selected'),
    setLastSelected:     (items)         => ipcRenderer.invoke('set-last-selected', items),
    getActiveProject:    ()              => ipcRenderer.invoke('get-active-project'),
    readFile:            (filePath)      => ipcRenderer.invoke('read-file', filePath),
    saveFileDialog:      (actionType)    => ipcRenderer.invoke('save-file-dialog', actionType),
    getIgnoredExtensions: ()             => ipcRenderer.invoke('get-ignored-extensions'),
    setIgnoredExtensions: (exts)         => ipcRenderer.invoke('set-ignored-extensions', exts),
    getFolderFilters:    ()              => ipcRenderer.invoke('get-folder-filters'),
    setFolderFilters:    (filters)       => ipcRenderer.invoke('set-folder-filters', filters),
    getRecentRepos:      ()              => ipcRenderer.invoke('get-recent-repos'),
    setActiveProject:    (repoPath)      => ipcRenderer.invoke('set-active-project', repoPath),
    getSessionNotes:     ()              => ipcRenderer.invoke('get-session-notes'),
    setSessionNotes:     (text)          => ipcRenderer.invoke('set-session-notes', text),
    setSessionNotesPassword: (hash)      => ipcRenderer.invoke('set-session-notes-password', hash),
    getSessionNotesPassword: ()          => ipcRenderer.invoke('get-session-notes-password'),
    verifySessionNotesPassword: (password) => ipcRenderer.invoke('verify-session-notes-password', password),
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

    onPrefetchReady: (callback) => {
        ipcRenderer.removeAllListeners('prefetch:ready');
        ipcRenderer.on('prefetch:ready', (event, { key, ttl }) => callback(key, ttl));
    },

    getPrefetchData: (key) => ipcRenderer.invoke('prefetch:get', key),

    onPrefetchUpdate: (callback) => {
        ipcRenderer.removeAllListeners('prefetch:ready');
        ipcRenderer.on('prefetch:ready', (event, { key, ttl }) => callback(key, null, ttl));
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
        status:      (repoPath)                    => ipcRenderer.invoke('git:status', repoPath),
        stage:       (repoPath, filePaths)         => ipcRenderer.invoke('git:stage', repoPath, filePaths),
        unstage:     (repoPath, filePaths)         => ipcRenderer.invoke('git:unstage', repoPath, filePaths),
        commit:      (repoPath, message, filePaths) => ipcRenderer.invoke('git:commit', repoPath, message, filePaths),
        push:        (repoPath)                    => ipcRenderer.invoke('git:push', repoPath),
        diff:        (repoPath, filePath)          => ipcRenderer.invoke('git:diff', repoPath, filePath),
        log:         (repoPath, maxCount)          => ipcRenderer.invoke('git:log', repoPath, maxCount || 50),
        fileLog:     (repoPath, filePath, maxCount) => ipcRenderer.invoke('git:file-log', repoPath, filePath, maxCount || 50),
        fileContent: (repoPath, commitHash, filePath) => ipcRenderer.invoke('git:file-content', repoPath, commitHash, filePath),
        diffCommits: (repoPath, oldCommit, newCommit, filePath) => ipcRenderer.invoke('git:diff-commits', repoPath, oldCommit, newCommit, filePath),
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
        getIndexedFileList: (repoPath, limit, offset) => ipcRenderer.invoke('symbolIndex:getIndexedFileList', repoPath, limit, offset),
        getFileSymbols:   (repoPath, filePath)     => ipcRenderer.invoke('symbolIndex:getFileSymbols', repoPath, filePath),
        getDirtyFiles:    (repoPath)               => ipcRenderer.invoke('symbolIndex:getDirtyFiles', repoPath),
        reindexFile:      (repoPath, filePath)     => ipcRenderer.invoke('symbolIndex:reindexFile', repoPath, filePath),
        getFileDeps:      (repoPath, filePath, mode) => ipcRenderer.invoke('symbolIndex:getFileDeps', repoPath, filePath, mode),
        proxyIndexFile:   (repoPath, filePath)     => ipcRenderer.invoke('symbolIndex:proxyIndexFile', repoPath, filePath),
        proxySearch:      (query, limit)            => ipcRenderer.invoke('symbolIndex:proxySearch', query, limit),
        proxyGetSymbols:  (filePath)                => ipcRenderer.invoke('symbolIndex:proxyGetSymbols', filePath),
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

const portManagerBridge = {
    portManagerList: () => ipcRenderer.invoke('port-manager:list'),
    portManagerKill: (pid) => ipcRenderer.invoke('port-manager:kill', { pid }),
};

const terminalBridge = {
    terminalSpawn:  (options) => ipcRenderer.invoke('terminal:spawn', options),
    terminalWrite:  (payload) => ipcRenderer.invoke('terminal:write', payload),
    terminalResize: (payload) => ipcRenderer.invoke('terminal:resize', payload),
    terminalKill:   (id)      => ipcRenderer.invoke('terminal:kill', id),
    terminalListShells: ()    => ipcRenderer.invoke('terminal:listShells'),
    onTerminalData: (callback) => {
        ipcRenderer.removeAllListeners('terminal:data');
        ipcRenderer.on('terminal:data', (_, payload) => callback(payload));
    },
    onTerminalExit: (callback) => {
        ipcRenderer.removeAllListeners('terminal:exit');
        ipcRenderer.on('terminal:exit', (_, payload) => callback(payload));
    },
};

const errorCopBridge = {
    getErrors:         (opts)      => ipcRenderer.invoke('error-cop:getErrors', opts),
    getSessionErrors:  (sessionId) => ipcRenderer.invoke('error-cop:getSessionErrors', sessionId),
    getTimeline:       (opts)      => ipcRenderer.invoke('error-cop:getTimeline', opts),
    getSessions:       (limit)     => ipcRenderer.invoke('error-cop:getSessions', limit),
    getSession:        (id)        => ipcRenderer.invoke('error-cop:getSession', id),
    markRead:          ()          => ipcRenderer.invoke('error-cop:markRead'),
    getUnreadCount:    ()          => ipcRenderer.invoke('error-cop:getUnreadCount'),
    getBrowserServers: (sessionId) => ipcRenderer.invoke('error-cop:getBrowserServers', sessionId),
    getAllBrowserServers: () => ipcRenderer.invoke('error-cop:getAllBrowserServers'),
    getSessionOccurrences: (sessionId) => ipcRenderer.invoke('error-cop:getSessionOccurrences', sessionId),
    browserAttach: (opts) => ipcRenderer.invoke('error-cop:browserAttach', opts),
    browserDetach: (port) => ipcRenderer.invoke('error-cop:browserDetach', port),
    browserDetachAll: () => ipcRenderer.invoke('error-cop:browserDetachAll'),
    getAttachedBrowsers: () => ipcRenderer.invoke('error-cop:getAttachedBrowsers'),
    deleteSessions: (ids) => ipcRenderer.invoke('error-cop:deleteSessions', ids),
    onNewError: (callback) => {
        ipcRenderer.removeAllListeners('error-cop:new-error');
        ipcRenderer.on('error-cop:new-error', (_, payload) => callback(payload));
    },
    onUnreadCount: (callback) => {
        ipcRenderer.removeAllListeners('error-cop:unread-count');
        ipcRenderer.on('error-cop:unread-count', (_, payload) => callback(payload));
    },
    onTimelineEvent: (callback) => {
        ipcRenderer.removeAllListeners('error-cop:timeline-event');
        ipcRenderer.on('error-cop:timeline-event', (_, payload) => callback(payload));
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

const teamActivityBridge = {
  teamActivityLog: (repoPath) => ipcRenderer.invoke('team-activity:log', { repoPath }),
  teamActivityDiff: (repoPath, hash, filePath) => ipcRenderer.invoke('team-activity:diff', { repoPath, hash, filePath }),
  teamActivityFileAtCommit: (repoPath, hash, filePath) => ipcRenderer.invoke('team-activity:file-at-commit', { repoPath, hash, filePath }),
  teamActivityCommitFiles: (repoPath, hash) => ipcRenderer.invoke('team-activity:commit-files', { repoPath, hash }),
};

const blueprintBridge = {
  blueprint: {
    getCategories:    ()                 => ipcRenderer.invoke('blueprint:getCategories'),
    createCategory:   (name, type)       => ipcRenderer.invoke('blueprint:createCategory', { name, type }),
    renameCategory:   (id, name)         => ipcRenderer.invoke('blueprint:renameCategory', { id, name }),
    deleteCategory:   (id)               => ipcRenderer.invoke('blueprint:deleteCategory', { id }),
    getByCategory:    (categoryId)       => ipcRenderer.invoke('blueprint:getByCategory', { categoryId }),
    getOne:           (id)               => ipcRenderer.invoke('blueprint:getOne', { id }),
    create:           (data)             => ipcRenderer.invoke('blueprint:create', data),
    update:           (data)             => ipcRenderer.invoke('blueprint:update', data),
    delete:           (id)               => ipcRenderer.invoke('blueprint:delete', { id }),
    search:           (query)            => ipcRenderer.invoke('blueprint:search', { query }),
    seed:             ()                 => ipcRenderer.invoke('blueprint:seed'),
  },
  kit: {
    getByCategory:    (categoryId)       => ipcRenderer.invoke('kit:getByCategory', { categoryId }),
    create:           (data)             => ipcRenderer.invoke('kit:create', data),
    update:           (data)             => ipcRenderer.invoke('kit:update', data),
    delete:           (id)               => ipcRenderer.invoke('kit:delete', { id }),
    reorder:          (data)             => ipcRenderer.invoke('kit:reorder', data),
    getTypes:         ()                 => ipcRenderer.invoke('kit:getTypes'),
  },
  motherbox: {
    get:              ()                 => ipcRenderer.invoke('motherbox:get'),
  },
};

const profileBridge = {
  profile: {
    getAll:       (opts)         => ipcRenderer.invoke('profile:getAll', opts),
    get:          ()             => ipcRenderer.invoke('profile:get'),
    update:       (data)         => ipcRenderer.invoke('profile:update', data),
    getHeatmap:   (year)         => ipcRenderer.invoke('profile:getHeatmap', { year }),
    getStats:     (range)        => ipcRenderer.invoke('profile:getStats', { range }),
    getDonutData: (range)        => ipcRenderer.invoke('profile:getDonutData', { range }),
    getHistory:   (page, repo)   => ipcRenderer.invoke('profile:getHistory', { page, repoPath: repo }),
    getDayDetail: (date)         => ipcRenderer.invoke('profile:getDayDetail', { date }),
    getDayCommits:(date)         => ipcRenderer.invoke('profile:getDayCommits', { date }),
    fileDiff:     (filePath, repoPath, commitHash) => ipcRenderer.invoke('profile:fileDiff', { filePath, repoPath, commitHash }),
    resetStats:   ()             => ipcRenderer.invoke('profile:resetStats'),
    initWatcher:  ()             => ipcRenderer.invoke('profile:initWatcher'),
    stopWatcher:  ()             => ipcRenderer.invoke('profile:stopWatcher'),
    getAvatar:    ()             => ipcRenderer.invoke('profile:getAvatar'),
    uploadAvatar: (dataUrl)      => ipcRenderer.invoke('profile:uploadAvatar', { dataUrl }),
    onDataChanged: (callback) => {
      ipcRenderer.removeAllListeners('profile:dataChanged');
      ipcRenderer.on('profile:dataChanged', () => callback());
    },
  },
};

const docignoreManagerBridge = {
    getGlobalDocignore: () => ipcRenderer.invoke('docignore:get-global'),
    setGlobalDocignore: (payload) => ipcRenderer.invoke('docignore:set-global', payload),
    getRepoDocignore: (payload) => ipcRenderer.invoke('docignore:get-repo', payload),
    setRepoDocignore: (payload) => ipcRenderer.invoke('docignore:set-repo', payload),
    clearDocignoreCache: (repoPath) => ipcRenderer.invoke('docignore:clear-cache', repoPath),
};

// Docker bridge (separate API, not under electronAPI)
// Branch Manager bridge (flat methods on electronAPI)
const branchBridge = {
    gitBranches:          (repoPath) =>
      ipcRenderer.invoke('git:branches', { repoPath }),
    gitCreateBranch:      (repoPath, name, fromBranch) =>
      ipcRenderer.invoke('git:createBranch', { repoPath, name, fromBranch }),
    gitSwitchBranch:      (repoPath, name) =>
      ipcRenderer.invoke('git:switchBranch', { repoPath, name }),
    gitDeleteBranch:      (repoPath, name, force) =>
      ipcRenderer.invoke('git:deleteBranch', { repoPath, name, force }),
    gitDeleteRemoteBranch:(repoPath, remote, name) =>
      ipcRenderer.invoke('git:deleteRemoteBranch', { repoPath, remote, name }),
    gitPushBranch:        (repoPath, name, remote) =>
      ipcRenderer.invoke('git:pushBranch', { repoPath, name, remote }),
    gitPullBranch:        (repoPath, name, remote) =>
      ipcRenderer.invoke('git:pullBranch', { repoPath, name, remote }),
    gitFetchRemote:       (repoPath, remote) =>
      ipcRenderer.invoke('git:fetchRemote', { repoPath, remote }),
    gitMergeBranch:       (repoPath, from, into) =>
      ipcRenderer.invoke('git:mergeBranch', { repoPath, from, into }),
    gitMergeBranchDiff:   (repoPath, filePath) =>
      ipcRenderer.invoke('git:mergeBranchDiff', { repoPath, filePath }),
    gitBranchFileDiff:    (repoPath, source, target, filePath) =>
      ipcRenderer.invoke('git:branchFileDiff', { repoPath, source, target, filePath }),
    gitDiffBranches:      (repoPath, source, target) =>
      ipcRenderer.invoke('git:diffBranches', { repoPath, source, target }),
    gitGetConflictDiff:   (repoPath, filePath) =>
      ipcRenderer.invoke('git:getConflictDiff', { repoPath, filePath }),
    gitAcceptIncoming:    (repoPath, files) =>
      ipcRenderer.invoke('git:acceptIncoming', { repoPath, files }),
    gitAcceptCurrent:     (repoPath, files) =>
      ipcRenderer.invoke('git:acceptCurrent', { repoPath, files }),
    gitMarkResolved:      (repoPath, filePath) =>
      ipcRenderer.invoke('git:markResolved', { repoPath, filePath }),
    gitCompleteMerge:     (repoPath, message) =>
      ipcRenderer.invoke('git:completeMerge', { repoPath, message }),
    gitBranchGraph:       (repoPath, branch, page) =>
      ipcRenderer.invoke('git:branchGraph', { repoPath, branch, page }),
    gitCommitDetail:       (repoPath, hash) =>
      ipcRenderer.invoke('git:commitDetail', { repoPath, hash }),
    gitCommitFileDiff:     (repoPath, hash, filePath) =>
      ipcRenderer.invoke('git:commitFileDiff', { repoPath, hash, filePath }),
};

const dockerBridge = {
    ping:            ()             => ipcRenderer.invoke('docker:ping'),
    listContainers:  ()             => ipcRenderer.invoke('docker:listContainers'),
    startContainer:  (id)           => ipcRenderer.invoke('docker:startContainer', id),
    stopContainer:   (id)           => ipcRenderer.invoke('docker:stopContainer', id),
    restartContainer:(id)           => ipcRenderer.invoke('docker:restartContainer', id),
    removeContainer: (id)           => ipcRenderer.invoke('docker:removeContainer', id),
    listImages:      ()             => ipcRenderer.invoke('docker:listImages'),
    removeImage:     (id)           => ipcRenderer.invoke('docker:removeImage', id),
    getStats:        (id)           => ipcRenderer.invoke('docker:getStats', id),
    getLogs:         (id, tail)     => ipcRenderer.invoke('docker:getLogs', id, tail),
};

const envBridge = {
    listFiles:  (repoPath)              => ipcRenderer.invoke('env:listFiles', { repoPath }),
    readFile:   (repoPath, fileName)    => ipcRenderer.invoke('env:readFile', { repoPath, fileName }),
    saveFile:   (repoPath, fileName, entries) => ipcRenderer.invoke('env:saveFile', { repoPath, fileName, entries }),
    createFile: (repoPath, fileName)    => ipcRenderer.invoke('env:createFile', { repoPath, fileName }),
    deleteFile: (repoPath, fileName)    => ipcRenderer.invoke('env:deleteFile', { repoPath, fileName }),
};

const imageBridge = {
    image: {
        pickFile:       ()              => ipcRenderer.invoke('image:pickFile'),
        pickFiles:      ()              => ipcRenderer.invoke('image:pickFiles'),
        pickOutputFolder: ()            => ipcRenderer.invoke('image:pickOutputFolder'),
        getMetadata:    (payload)       => ipcRenderer.invoke('image:getMetadata', payload),
        toIco:          (payload)       => ipcRenderer.invoke('image:toIco', payload),
        compress:       (payload)       => ipcRenderer.invoke('image:compress', payload),
        revealFile:     (payload)       => ipcRenderer.invoke('image:revealFile', payload),
        onProgress:     (callback) => {
            ipcRenderer.removeAllListeners('image:progress');
            ipcRenderer.on('image:progress', (_event, data) => callback(data));
        },
        onCompressProgress: (callback) => {
            ipcRenderer.removeAllListeners('image:compressProgress');
            ipcRenderer.on('image:compressProgress', (_event, data) => callback(data));
        },
    },
};

const videoBridge = {
    video: {
        pickFile:       ()              => ipcRenderer.invoke('video:pickFile'),
        pickOutputFolder: ()            => ipcRenderer.invoke('video:pickOutputFolder'),
        getMetadata:    (payload)       => ipcRenderer.invoke('video:getMetadata', payload),
        compress:       (payload)       => ipcRenderer.invoke('video:compress', payload),
        revealFile:     (payload)       => ipcRenderer.invoke('video:revealFile', payload),
        onProgress:     (callback) => {
            ipcRenderer.removeAllListeners('video:progress');
            ipcRenderer.on('video:progress', (_event, data) => callback(data));
        },
        gif:            (payload)       => ipcRenderer.invoke('video:gif', payload),
        onGifProgress:  (callback) => {
            ipcRenderer.removeAllListeners('video:gifProgress');
            ipcRenderer.on('video:gifProgress', (_event, data) => callback(data));
        },
        render:         (payload)       => ipcRenderer.invoke('video:render', payload),
        onRenderProgress: (callback) => {
            ipcRenderer.removeAllListeners('video:renderProgress');
            ipcRenderer.on('video:renderProgress', (_event, data) => callback(data));
        },
        preview:        (payload)       => ipcRenderer.invoke('video:preview', payload),
        onPreviewProgress: (callback) => {
            ipcRenderer.removeAllListeners('video:previewProgress');
            ipcRenderer.on('video:previewProgress', (_event, data) => callback(data));
        },
    },
};

const gmailBridge = {
    gmail: {
        addAccount:         ()                 => ipcRenderer.invoke('gmail:addAccount'),
        reAuthAccount:      (payload)          => ipcRenderer.invoke('gmail:reAuthAccount', payload),
        removeAccount:      (payload)          => ipcRenderer.invoke('gmail:removeAccount', payload),
        listAccounts:       ()                 => ipcRenderer.invoke('gmail:listAccounts'),
        fetchMessages:      (payload)          => ipcRenderer.invoke('gmail:fetchMessages', payload),
        fetchInbox:         (payload)          => ipcRenderer.invoke('gmail:fetchInbox', payload),
        fetchAll:           ()                 => ipcRenderer.invoke('gmail:fetchAll'),
        fetchMessageBody:   (payload)          => ipcRenderer.invoke('gmail:fetchMessageBody', payload),
        markRead:           (payload)          => ipcRenderer.invoke('gmail:markRead', payload),
        startPolling:       ()                 => ipcRenderer.invoke('gmail:startPolling'),
        stopPolling:        ()                 => ipcRenderer.invoke('gmail:stopPolling'),
        checkNow:           ()                 => ipcRenderer.invoke('gmail:checkNow'),
        onPollResult:       (callback) => {
            ipcRenderer.removeAllListeners('gmail:pollResult');
            ipcRenderer.on('gmail:pollResult', (_event, data) => callback(data));
        },
        onAccountsChanged:  (callback) => {
            ipcRenderer.removeAllListeners('gmail:accountsChanged');
            ipcRenderer.on('gmail:accountsChanged', (_event, data) => callback(data));
        },
        getIgnoredSenders:      (payload)         => ipcRenderer.invoke('gmail:getIgnoredSenders', payload),
        addIgnoredSender:       (payload)         => ipcRenderer.invoke('gmail:addIgnoredSender', payload),
        removeIgnoredSender:    (payload)         => ipcRenderer.invoke('gmail:removeIgnoredSender', payload),
    },
};

const githubBridge = {
  github: {
    loadTree: (payload) => ipcRenderer.invoke('github:loadTree', payload),
    saveTree: (data) => ipcRenderer.invoke('github:saveTree', data),
    listSaved: () => ipcRenderer.invoke('github:listSaved'),
    loadSaved: (repoUrl) => ipcRenderer.invoke('github:loadSaved', repoUrl),
    deleteSaved: (repoUrl) => ipcRenderer.invoke('github:deleteSaved', repoUrl),
  },
};

const automationBridge = {
  automation: {
    list:     ()                               => ipcRenderer.invoke('automation:list'),
    load:     (payload)                        => ipcRenderer.invoke('automation:load', payload),
    save:     (payload)                        => ipcRenderer.invoke('automation:save', payload),
    delete:   (payload)                        => ipcRenderer.invoke('automation:delete', payload),
    rename:   (payload)                        => ipcRenderer.invoke('automation:rename', payload),
  },
};

const opencodeBridge = {
  discover:           ()                            => ipcRenderer.invoke('opencode:discover'),
  listConversations:  (repoPath)                    => ipcRenderer.invoke('opencode:listConversations', { repoPath }),
  getConversation:    (convId)                      => ipcRenderer.invoke('opencode:getConversation', { convId }),
  run:                (repoPath, message, files, continueConv, sessionId, mode) => ipcRenderer.invoke('opencode:run', { repoPath, message, files, continueConv, sessionId, mode }),
  stop:               ()                            => ipcRenderer.invoke('opencode:stop'),
  listRepos:          ()                            => ipcRenderer.invoke('opencode:listRepos'),
  deleteConversation: (convId)                      => ipcRenderer.invoke('opencode:deleteConversation', { convId }),
  selectFile:         ()                            => ipcRenderer.invoke('opencode:selectFile'),
  onStream:           (callback) => {
    ipcRenderer.removeAllListeners('opencode:stream');
    ipcRenderer.on('opencode:stream', (_, data) => callback(data));
  },
  onDone:             (callback) => {
    ipcRenderer.removeAllListeners('opencode:done');
    ipcRenderer.on('opencode:done', (_, data) => callback(data));
  },
  removeStreamListeners: () => {
    ipcRenderer.removeAllListeners('opencode:stream');
    ipcRenderer.removeAllListeners('opencode:done');
  },
  // Terminal (PTY) methods
  termSpawn:          (opts)                        => ipcRenderer.invoke('opencode:termSpawn', opts),
  termWrite:          (payload)                     => ipcRenderer.invoke('opencode:termWrite', payload),
  termResize:         (payload)                     => ipcRenderer.invoke('opencode:termResize', payload),
  termKill:           (id)                          => ipcRenderer.invoke('opencode:termKill', id),
  onTermData:         (callback) => {
    ipcRenderer.on('opencode:termData', (_, data) => callback(data));
  },
  onTermExited:       (callback) => {
    ipcRenderer.on('opencode:termExited', (_, data) => callback(data));
  },
};

const geminiBridge = {
  discover:           ()                            => ipcRenderer.invoke('gemini:discover'),
  listConversations:  (repoPath)                    => ipcRenderer.invoke('gemini:listConversations', { repoPath }),
};



const codebaseChatBridge = {
  codebaseChat: {
    getFiles:           (opts) => ipcRenderer.invoke('codebaseChat:getFiles', opts),
    getSymbols:         (opts) => ipcRenderer.invoke('codebaseChat:getSymbols', opts),
    getDependencies:    (opts) => ipcRenderer.invoke('codebaseChat:getDependencies', opts),
    getDependents:      (opts) => ipcRenderer.invoke('codebaseChat:getDependents', opts),
    getImportChain:     (opts) => ipcRenderer.invoke('codebaseChat:getImportChain', opts),
    getCircularDeps:    (opts) => ipcRenderer.invoke('codebaseChat:getCircularDeps', opts),
    getConversations:   (opts) => ipcRenderer.invoke('codebaseChat:getConversations', opts),
    newConversation:    (opts) => ipcRenderer.invoke('codebaseChat:newConversation', opts),
    getMessages:        (opts) => ipcRenderer.invoke('codebaseChat:getMessages', opts),
    saveMessage:        (opts) => ipcRenderer.invoke('codebaseChat:saveMessage', opts),
    renameConversation: (opts) => ipcRenderer.invoke('codebaseChat:renameConversation', opts),
    deleteConversation: (opts) => ipcRenderer.invoke('codebaseChat:deleteConversation', opts),
  },
};

const chatGmailBridge = {
  chatGetEmailData: (email, queryType, params) =>
    ipcRenderer.invoke('chat:getEmailData', { email, queryType, params }),
  chatGetConnectedGmailAccounts: () =>
    ipcRenderer.invoke('chat:getConnectedGmailAccounts'),
};

const codebaseMapBridge = {
  codebaseMap: {
    generate: (opts) => ipcRenderer.invoke('codebaseMap:generate', opts),
  },
};

const graphifyBridge = {
  graphifyStart:              (repoPath) => ipcRenderer.invoke('graphify:start', repoPath),
  graphifyStop:               ()          => ipcRenderer.invoke('graphify:stop'),
  graphifyCancelStart:        ()          => ipcRenderer.invoke('graphify:cancelStart'),
  graphifyRestart:            (repoPath) => ipcRenderer.invoke('graphify:restart', repoPath),
  graphifyReload:             ()          => ipcRenderer.invoke('graphify:reload'),
  graphifyIsRunning:          ()          => ipcRenderer.invoke('graphify:isRunning'),
  graphifyStatus:             ()          => ipcRenderer.invoke('graphify:status'),
  graphifyGetPort:            ()          => ipcRenderer.invoke('graphify:getPort'),
  graphifyGetInfo:            ()          => ipcRenderer.invoke('graphify:getInfo'),
  graphifyCheckStatus:        (repoPath) => ipcRenderer.invoke('graphify:checkStatus', repoPath),
  graphifyExportSymbolsJson:  ()          => ipcRenderer.invoke('graphify:exportSymbolsJson'),
  graphifyExportPrompt:       (repoPath) => ipcRenderer.invoke('graphify:exportPrompt', repoPath),
  graphifyLoadGraphFromStorage: (repoPath) => ipcRenderer.invoke('graphify:loadGraphFromStorage', repoPath),
  graphifyDetectChanges:      (repoPath) => ipcRenderer.invoke('graphify:detectChanges', repoPath),
  graphifyGenerateIncrementalPrompt: (repoPath) => ipcRenderer.invoke('graphify:generateIncrementalPrompt', repoPath),
  graphifyCheckGraphSync:     (repoPath) => ipcRenderer.invoke('graphify:checkGraphSync', repoPath),
};

contextBridge.exposeInMainWorld('envAPI', envBridge);

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
    ...portManagerBridge,
    ...terminalBridge,
    ...errorCopBridge,
    ...docignoreManagerBridge,
    ...teamActivityBridge,
    ...blueprintBridge,
    ...profileBridge,
    ...branchBridge,
    ...codebaseChatBridge,
    ...chatGmailBridge,
    ...codebaseMapBridge,
    ...graphifyBridge,
    ...automationBridge,
    ...imageBridge,
    ...videoBridge,
    ...gmailBridge,
    ...githubBridge,
    opencode: opencodeBridge,
    gemini: geminiBridge,
    windowControls,
});

contextBridge.exposeInMainWorld('dockerAPI', dockerBridge);

contextBridge.exposeInMainWorld('serviceTrackerAPI', {
  getAll:    () => ipcRenderer.invoke('serviceTracker:getAll'),
  onUpdate:  (cb) => ipcRenderer.on('serviceTracker:update', (_, data) => cb(data)),
  offUpdate: (cb) => ipcRenderer.removeListener('serviceTracker:update', cb),
});

