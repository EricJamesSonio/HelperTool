const { ipcRenderer } = require('electron');

module.exports = {
    git: {
        status:   (repoPath)                    => ipcRenderer.invoke('git:status', repoPath),
        stage:    (repoPath, filePaths)          => ipcRenderer.invoke('git:stage', repoPath, filePaths),
        unstage:  (repoPath, filePaths)          => ipcRenderer.invoke('git:unstage', repoPath, filePaths),
        commit:   (repoPath, message, filePaths) => ipcRenderer.invoke('git:commit', repoPath, message, filePaths),
        push:     (repoPath)                     => ipcRenderer.invoke('git:push', repoPath),
        diff:     (repoPath, filePath)           => ipcRenderer.invoke('git:diff', repoPath, filePath),
        log:      (repoPath, maxCount)           => ipcRenderer.invoke('git:log', repoPath, maxCount || 50),
    },
};