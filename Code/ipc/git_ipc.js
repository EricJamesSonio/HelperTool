const { ipcMain } = require('electron');
const GitOperations = require('../utils/gitOps');
const simpleGit = require('simple-git');
const path = require('path');
const { triggerCommitSync } = require('./profile.js');
const prefetchService = require('./prefetchService.js');

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
            const result = await gitOps.commit(message, filePaths);
            if (result.success !== false) {
                triggerCommitSync(repoPath, path.basename(repoPath), false).catch(err => {
                    console.error('[IPC] profile sync after commit:', err);
                });
                prefetchService.invalidate('profile');
                prefetchService.invalidate('teamActivity:' + repoPath);
                event.sender.send('profile:dataChanged');
            }
            return result;
        } catch (err) {
            console.error('[IPC] git:commit error:', err);
            return { error: err.message, success: false };
        }
    });

    ipcMain.handle('git:push', async (event, repoPath) => {
        try {
            const gitOps = new GitOperations(repoPath);
            const result = await gitOps.push();
            if (result.success !== false) {
                triggerCommitSync(repoPath, path.basename(repoPath), false).catch(err => {
                    console.error('[IPC] profile sync after push:', err);
                });
                prefetchService.invalidate('profile');
                prefetchService.invalidate('teamActivity:' + repoPath);
                event.sender.send('profile:dataChanged');
            }
            return result;
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

            const localNames = local.map(b => b.name);
            const defaultBranch = localNames.includes('main') ? 'main'
                : localNames.includes('master') ? 'master'
                : null;

            if (defaultBranch) {
                const vsResults = await Promise.all(local.map(async (b) => {
                    if (b.name === defaultBranch) return { name: b.name, vsDefaultAhead: 0, vsDefaultBehind: 0 };
                    const [a, be] = await Promise.all([
                        git.raw(['rev-list', '--count', `${defaultBranch}..${b.name}`]),
                        git.raw(['rev-list', '--count', `${b.name}..${defaultBranch}`])
                    ]);
                    return { name: b.name, vsDefaultAhead: parseInt(a.trim()) || 0, vsDefaultBehind: parseInt(be.trim()) || 0 };
                }));
                for (const r of vsResults) {
                    const b = local.find(l => l.name === r.name);
                    if (b) { b.vsDefaultAhead = r.vsDefaultAhead; b.vsDefaultBehind = r.vsDefaultBehind; }
                }
            }

            return { success: true, current, local, remote, defaultBranch };
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
            console.debug('[git:mergeBranch] merging', from, 'into', into, 'at', repoPath);
            const result = await git.merge([from, '--no-ff']);
            console.debug('[git:mergeBranch] result:', result);
            const noChanges = !result.merges?.length && !result.files?.length;
            const files = (result.files || []).map(f => ({
                file: f,
                insertions: (result.insertions && result.insertions[f]) || 0,
                deletions: (result.deletions && result.deletions[f]) || 0
            }));
            let pushed = false;
            let pushError = null;
            if (!noChanges) {
                try {
                    await git.push();
                    pushed = true;
                } catch (pushErr) {
                    pushError = pushErr.message;
                    console.debug('[git:mergeBranch] push failed:', pushError);
                }
            }
            return {
                success: true,
                isUpToDate: !!result?.isAlreadyUpToDate || noChanges,
                result: result?.result || 'Merge successful',
                files,
                summary: result.summary || { changes: 0, insertions: 0, deletions: 0 },
                pushed,
                pushError
            };
        } catch (err) {
            const msg = err.message || '';
            console.debug('[git:mergeBranch] error:', msg);
            if (msg.includes('CONFLICT') || msg.includes('conflict')) {
                const lines = msg.split('\n').filter(l => l.includes('CONFLICT'));
                const conflictFiles = lines.map(l => {
                    const m = l.match(/CONFLICT\s+\([^)]+\):\s+(\S+)/);
                    return m ? m[1] : '';
                }).filter(Boolean);
                return { success: false, conflict: true, files: conflictFiles.length ? conflictFiles : ['(unknown)'] };
            }
            return { success: false, error: msg };
        }
    });

    ipcMain.handle('git:mergeBranchDiff', async (_e, { repoPath, filePath }) => {
        try {
            const git = simpleGit(repoPath);
            const diff = await git.diff(['HEAD~1', '--', filePath]);
            return { success: true, diff };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:branchFileDiff', async (_e, { repoPath, source, target, filePath }) => {
        try {
            const git = simpleGit(repoPath);
            const diff = await git.diff([`${target}..${source}`, '--', filePath]);
            return { success: true, diff };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:diffBranches', async (_e, { repoPath, source, target }) => {
        try {
            const git = simpleGit(repoPath);
            const nameStatus = await git.raw(['diff', '--name-status', `${target}..${source}`]);
            const files = nameStatus.split('\n')
                .filter(l => l.trim())
                .map(l => {
                    const parts = l.split('\t');
                    return { file: parts.slice(1).join('\t'), status: parts[0]?.trim() || 'M' };
                });
            const logResult = await git.log([`${target}..${source}`]);
            const commits = logResult.all.map(c => ({ hash: c.hash, message: c.message }));
            return { success: true, files, commits };
        } catch (err) {
            return { success: false, error: err.message };
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
            const workerProxy = require('./workerProxy');
            if (workerProxy.isReady()) {
                const r = await workerProxy.send('gitGraph', { action: 'branchCommits', repoPath, branch, page, pageSize: 20 });
                return { success: true, ...r };
            }
        } catch (_) {}
        try {
            const git = simpleGit(repoPath);
            const p = page || 1;
            const skip = (p - 1) * 20;
            const raw = await git.raw(['log', '--graph', branch, '--max-count=20', `--skip=${skip}`, '--format=|||%H|%s|%an|%aI|%D']);
            const total = await git.raw(['rev-list', '--count', branch]);
            const lines = raw.split('\n');
            const commits = [];
            let currentGraph = [];
            for (const line of lines) {
                const delimIdx = line.indexOf('|||');
                if (delimIdx >= 0) {
                    const graphPrefix = line.substring(0, delimIdx);
                    const dataPart = line.substring(delimIdx + 3);
                    const idx = dataPart.indexOf('|');
                    if (idx === -1) continue;
                    const hash = dataPart.slice(0, idx);
                    const rest = dataPart.slice(idx + 1);
                    const parts = rest.split('|');
                    const graphLines = currentGraph.length ? currentGraph.join('\n') + '\n' + graphPrefix : graphPrefix;
                    commits.push({
                        hash,
                        message: parts[0] || '',
                        author: parts[1] || '',
                        date: parts[2] || '',
                        refs: parts.slice(3).join('|') || '',
                        graph: graphLines,
                    });
                    currentGraph = [];
                } else {
                    if (line.trim()) currentGraph.push(line);
                }
            }
            const totalCount = parseInt(total.trim()) || 0;
            return { success: true, commits, total: totalCount, page: p, totalPages: Math.max(1, Math.ceil(totalCount / 20)) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:commitDetail', async (_e, { repoPath, hash }) => {
        try {
            const workerProxy = require('./workerProxy');
            if (workerProxy.isReady()) {
                const r = await workerProxy.send('gitGraph', { action: 'commitDetail', repoPath, hash });
                return { success: true, ...r };
            }
        } catch (_) {}
        try {
            const git = simpleGit(repoPath);
            const numstatRaw = await git.raw(['diff-tree', '--no-commit-id', '-r', '--numstat', hash]);
            const files = numstatRaw.trim().split('\n').filter(Boolean).map(line => {
                const parts = line.split('\t');
                if (parts.length < 3) return null;
                return {
                    path: parts.slice(2).join('\t'),
                    additions: parseInt(parts[0]) || 0,
                    deletions: parseInt(parts[1]) || 0,
                };
            }).filter(Boolean);
            return { success: true, files };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('git:commitFileDiff', async (_e, { repoPath, hash, filePath }) => {
        try {
            const workerProxy = require('./workerProxy');
            if (workerProxy.isReady()) {
                const r = await workerProxy.send('gitGraph', { action: 'fileDiff', repoPath, hash, filePath });
                return { success: true, ...r };
            }
        } catch (_) {}
        try {
            const git = simpleGit(repoPath);
            const diff = await git.raw(['diff-tree', '--no-commit-id', '-p', hash, '--', filePath]);
            return { success: true, diff };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}

module.exports = { register };