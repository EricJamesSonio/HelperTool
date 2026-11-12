const { ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const workerProxy = require('./workerProxy.js');

let _progressCallback = null;

function register({ app, config, fileOps, docignoreUtils, codeOps, getMainWindow }) {

    ipcMain.handle('generate', async (event, actionType, repoPath, items, filePath, minify = false, promptText = '') => {

        try {
            if (!repoPath || !items?.length || !filePath) throw new Error('Invalid arguments');

            const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);
            const outputDir = path.dirname(filePath);
            if (!fs.existsSync(outputDir)) await fs.promises.mkdir(outputDir, { recursive: true });

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
                content = await fs.promises.readFile(filePath, 'utf-8');
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

    ipcMain.handle('generate:structureText', async (event, args) => {
        let tmpFile = '';
        try {
            const repoPath = args && args.repoPath;
            if (typeof repoPath !== 'string' || !repoPath || !path.isAbsolute(repoPath)) {
                return { success: false, error: 'No folder opened' };
            }
            const rawFolders = args && Array.isArray(args.folders) ? args.folders : [];
            const items = [];
            const missing = [];
            if (!rawFolders.length) {
                items.push(repoPath);
            } else {
                for (const f of rawFolders) {
                    if (typeof f !== 'string') continue;
                    const segs = f.replace(/\\/g, '/').split('/').filter(Boolean);
                    if (!segs.length || segs.indexOf('..') !== -1) continue;
                    const full = path.join(repoPath, ...segs);
                    let ok = false;
                    try {
                        const st = await fs.promises.stat(full);
                        ok = st.isDirectory();
                    } catch (_) {
                        ok = false;
                    }
                    if (ok) items.push(full);
                    else missing.push(f);
                }
            }
            if (!items.length) {
                return { success: false, error: 'Folder not found: ' + missing.join(', ') };
            }

            const ignoreRules = await docignoreUtils.getIgnoreRules(repoPath);
            tmpFile = path.join(os.tmpdir(), 'helpertool-chathead-' + Date.now() + '.txt');

            await workerProxy.send('generate', {
                actionType: 'structure',
                items,
                filePath: tmpFile,
                promptText: '',
                ignoreRules,
                repoRoot: repoPath,
                minify: false,
            });

            const text = await fs.promises.readFile(tmpFile, 'utf-8');
            return { success: true, text, missing };
        } catch (err) {
            console.error('[IPC] generate:structureText error:', err);
            return { success: false, error: err && err.message ? err.message : 'Structure failed' };
        } finally {
            if (tmpFile) {
                try {
                    await fs.promises.unlink(tmpFile);
                } catch (_) {}
            }
        }
    });
}

module.exports = { register };