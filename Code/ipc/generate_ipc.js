const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
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

            let content = '';
            if (fs.existsSync(filePath)) {
                content = fs.readFileSync(filePath, 'utf-8');
            }

            return { success: true, content, filePath };
        } catch (err) {
            console.error('[IPC] generate error:', err);
            if (_progressCallback) {
                workerProxy.offProgress(_progressCallback);
                _progressCallback = null;
            }
            dialog.showErrorBox('Generate Error', err.message);
            return { success: false, content: '', filePath: '' };
        }
    });
}

module.exports = { register };
