const { ipcMain } = require('electron');
const GitOperations = require('../utils/gitOps');
const simpleGit = require('simple-git');

/**
 * @param {{}} _deps - no shared deps needed; GitOperations is instantiated per-call
 */
function register(_deps) {

    ipcMain.handle('git:status', async (event, repoPath) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.getStatus();
        } catch (err) {
            console.error('[IPC] git:status error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:stage', async (event, repoPath, filePaths) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.stage(filePaths);
        } catch (err) {
            console.error('[IPC] git:stage error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:unstage', async (event, repoPath, filePaths) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.unstage(filePaths);
        } catch (err) {
            console.error('[IPC] git:unstage error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:commit', async (event, repoPath, message, filePaths) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.commit(message, filePaths);
        } catch (err) {
            console.error('[IPC] git:commit error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:push', async (event, repoPath) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.push();
        } catch (err) {
            console.error('[IPC] git:push error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:diff', async (event, repoPath, filePath) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.getDiff(filePath);
        } catch (err) {
            console.error('[IPC] git:diff error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:log', async (event, repoPath, maxCount) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.getLog(maxCount || 50);
        } catch (err) {
            console.error('[IPC] git:log error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:file-log', async (event, repoPath, filePath, maxCount) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.getFileLog(filePath, maxCount || 50);
        } catch (err) {
            console.error('[IPC] git:file-log error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:file-content', async (event, repoPath, commitHash, filePath) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.getFileContentAtCommit(commitHash, filePath);
        } catch (err) {
            console.error('[IPC] git:file-content error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:diff-commits', async (event, repoPath, oldCommit, newCommit, filePath) => {
        try {
            const gitOps = new GitOperations(repoPath);
            return await gitOps.getDiffBetweenCommits(oldCommit, newCommit, filePath);
        } catch (err) {
            console.error('[IPC] git:diff-commits error:', err);
            return { error: err.message, success: false };
        }
    });

    // ── Branch Manager IPC handlers ──

    ipcMain.handle('git:branches', async (_e, { repoPath }) => {
        try {
            const git = simpleGit(repoPath);
            const branchSummary = await git.branch(['-vv', '--all']);
            const current = branchSummary.current;
            const local = [];
            const remote = [];
            for (const [name, info] of Object.entries(branchSummary.branches)) {
                const isRemote = name.startsWith('remotes/');
                const displayName = isRemote ? name.replace('remotes/', '') : name;
                const ahead = info.ahead || 0;
                const behind = info.behind || 0;
                const label = info.label || '';
                const parts = label.split(' ');
                const commitHash = parts[0] || '';
                const message = parts.slice(1).join(' ') || '';
                if (isRemote) {
                    remote.push({ name: displayName, remote: displayName.split('/')[0] });
                } else {
                    local.push({ name: displayName, ahead, behind, lastCommit: commitHash?.substring(0, 7) || '', message });
                }
            }
            return { success: true, current, local, remote };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:createBranch', async (_e, { repoPath, name, fromBranch }) => {
        try {
            const git = simpleGit(repoPath);
            await git.checkoutBranch(name, fromBranch || 'HEAD');
            return { success: true, name };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:switchBranch', async (_e, { repoPath, name }) => {
        try {
            const git = simpleGit(repoPath);
            await git.checkout(name);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:deleteBranch', async (_e, { repoPath, name, force }) => {
        try {
            const git = simpleGit(repoPath);
            await git.deleteLocalBranch(name, force);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:deleteRemoteBranch', async (_e, { repoPath, remote, name }) => {
        try {
            const git = simpleGit(repoPath);
            await git.push(remote, `:${name}`);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:pushBranch', async (_e, { repoPath, name, remote }) => {
        try {
            const git = simpleGit(repoPath);
            await git.push(remote || 'origin', name, ['--set-upstream']);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:pullBranch', async (_e, { repoPath, name, remote }) => {
        try {
            const git = simpleGit(repoPath);
            await git.pull(remote || 'origin', name);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:fetchRemote', async (_e, { repoPath, remote }) => {
        try {
            const git = simpleGit(repoPath);
            await git.fetch(remote || 'origin', ['--prune']);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:mergeBranch', async (_e, { repoPath, from, into }) => {
        try {
            const git = simpleGit(repoPath);
            await git.checkout(into);
            await git.mergeFromTo(from, into);
            return { success: true };
        } catch (err) {
            const msg = err.message || '';
            if (msg.includes('CONFLICT') || msg.includes('conflict')) {
                const lines = msg.split('\n').filter(l => l.includes('CONFLICT'));
                const files = lines.map(l => {
                    const m = l.match(/CONFLICT\s+\([^)]+\):\s+(\S+)/);
                    return m ? m[1] : '';
                }).filter(Boolean);
                return { success: false, conflict: true, files: files.length ? files : ['(unknown)'] };
            }
            return { success: false, error: msg };
        }
    });

    ipcMain.handle('git:getConflictDiff', async (_e, { repoPath, filePath }) => {
        try {
            const git = simpleGit(repoPath);
            const diff = await git.diff(['--diff-filter=U', '--', filePath]);
            return { success: true, diff };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:acceptIncoming', async (_e, { repoPath, files }) => {
        try {
            const git = simpleGit(repoPath);
            for (const f of files) {
                await git.checkout(['--theirs', f]);
                await git.add(f);
            }
            return { success: true, resolved: files };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:acceptCurrent', async (_e, { repoPath, files }) => {
        try {
            const git = simpleGit(repoPath);
            for (const f of files) {
                await git.checkout(['--ours', f]);
                await git.add(f);
            }
            return { success: true, resolved: files };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:markResolved', async (_e, { repoPath, filePath }) => {
        try {
            const git = simpleGit(repoPath);
            await git.add(filePath);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:completeMerge', async (_e, { repoPath, message }) => {
        try {
            const git = simpleGit(repoPath);
            await git.commit(message || 'Merge branch');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:branchGraph', async (_e, { repoPath, branch, page }) => {
        try {
            const git = simpleGit(repoPath);
            const p = page || 1;
            const skip = (p - 1) * 20;
            const log = await git.log([branch, '--max-count=20', `--skip=${skip}`, '--format=%H|%s|%an|%aI']);
            const total = await git.raw(['rev-list', '--count', branch]);
            const commits = log.all.map(c => ({
                hash: c.hash,
                message: c.message,
                author: c.author_name,
                date: c.date,
            }));
            const totalCount = parseInt(total.trim()) || 0;
            return { success: true, commits, total: totalCount, page: p, totalPages: Math.max(1, Math.ceil(totalCount / 20)) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}

module.exports = { register };