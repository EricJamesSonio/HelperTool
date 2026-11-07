const { ipcRenderer } = require('electron');

module.exports = {
    fileSeeder: {
        preview:        (basePath, relPaths) => ipcRenderer.invoke('fileseeder:preview', basePath, relPaths),
        seed:           (basePath, relPaths) => ipcRenderer.invoke('fileseeder:seed', basePath, relPaths),
        previewContent: (basePath, entries)  => ipcRenderer.invoke('fileseeder:previewContent', basePath, entries),
        seedContent:    (basePath, entries)  => ipcRenderer.invoke('fileseeder:seedContent', basePath, entries),
        getPatchedPreview: (basePath, resolved, allEntries) => ipcRenderer.invoke('fileseeder:getPatchedPreview', basePath, resolved, allEntries),
        getAiRule:         () => ipcRenderer.invoke('fileseeder:getAiRule'),
        flowApply:         (basePath, entries, meta) => ipcRenderer.invoke('fileseeder:applyContent', basePath, entries, meta),
        flowHistoryList:   (basePath) => ipcRenderer.invoke('flow:historyList', basePath),
        flowHistoryGet:    (basePath, id) => ipcRenderer.invoke('flow:historyGet', basePath, id),
        flowHistoryRevert: (basePath, id, opts) => ipcRenderer.invoke('flow:historyRevert', basePath, id, opts),
        flowHistoryClear:  (basePath) => ipcRenderer.invoke('flow:historyClear', basePath),
    },
};