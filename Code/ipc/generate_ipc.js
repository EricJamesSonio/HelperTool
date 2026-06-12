const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const workerProxy = require('./workerProxy.js');

let _progressCallback = null;

function register({ app, config, fileOps, docignoreUtils, codeOps, getMainWindow }) {

    ipcMain.handle('generate', async (event, actionType, repoPath, items, filePath, minify = false, promptText = '') => {

        try {
            if (!repoPath || !items?.length || !filePath) throw new Error('Invalid arguments');

            const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);
            const outputDir = path.dirname(filePath);
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

            const mainWindow = getMainWindow();

            _progressCallback = (percent) => {
                mainWindow.webContents.send('progress-update', percent);
            };
            workerProxy.onProgress(_progressCallback);

            await workerProxy.send('generate', {
                actionType,
                items,
                filePath,
                promptText,
                ignoreRules,
                repoRoot: repoPath,
                minify,
            });

            workerProxy.offProgress(_progressCallback);
            _progressCallback = null;

            await new Promise(resolve => setTimeout(resolve, 100));

            if (fs.existsSync(filePath)) {
                exec(`taskkill /FI "WINDOWTITLE eq helper-output*" /F`, () => {
                    setTimeout(() => {
                        exec(`notepad "${filePath}"`, (err) => {
                            if (err) shell.openPath(filePath);
                        });
                    }, 300);
                });
            }

            return true;
        } catch (err) {
            console.error('[IPC] generate error:', err);
            if (_progressCallback) {
                workerProxy.offProgress(_progressCallback);
                _progressCallback = null;
            }
            dialog.showErrorBox('Generate Error', err.message);
            return false;
        }
    });
}

module.exports = { register };
