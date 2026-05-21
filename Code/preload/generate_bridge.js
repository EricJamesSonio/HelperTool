const { ipcRenderer } = require('electron');

module.exports = {
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

