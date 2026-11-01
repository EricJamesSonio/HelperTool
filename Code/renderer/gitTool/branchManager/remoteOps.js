import { state, setState } from './state.js';
import { render } from './list.js';
import { showError, hideError } from './index.js';
import { runBusy } from './busy.js';

export function push(branch, btn) {
  return runBusy('Pushing ' + branch + '…', btn, async () => {
    hideError();
    setState({ loading: { ...state.loading, push: true } });
    try {
      const remote = branch.includes('/') ? branch.split('/')[0] : 'origin';
      const branchName = branch.includes('/') ? branch.split('/').slice(1).join('/') : branch;
      const r = await window.electronAPI.gitPushBranch(state.repoPath, branchName, remote);
      if (!r.success) { showError(r.error); return; }
      await render();
      _showToast('Pushed to ' + remote);
    } catch (err) {
      showError(err.message);
    } finally {
      setState({ loading: { ...state.loading, push: false } });
    }
  });
}

export function pull(branch, btn) {
  return runBusy('Pulling ' + branch + '…', btn, async () => {
    hideError();
    setState({ loading: { ...state.loading, pull: true } });
    try {
      const remote = branch.includes('/') ? branch.split('/')[0] : 'origin';
      const branchName = branch.includes('/') ? branch.split('/').slice(1).join('/') : branch;
      const r = await window.electronAPI.gitPullBranch(state.repoPath, branchName, remote);
      if (!r.success) { showError(r.error); return; }
      await render();
      _showToast('Pulled from ' + remote);
    } catch (err) {
      showError(err.message);
    } finally {
      setState({ loading: { ...state.loading, pull: false } });
    }
  });
}

export function fetch(btn) {
  return runBusy('Fetching from origin…', btn, async () => {
    hideError();
    try {
      const r = await window.electronAPI.gitFetchRemote(state.repoPath, 'origin');
      if (!r.success) { showError(r.error); return; }
      await render();
      _showToast('Fetched from origin');
    } catch (err) {
      showError(err.message);
    }
  });
}

export function deleteBranch(name, btn) {
  return runBusy('Deleting ' + name + '…', btn, async () => {
    hideError();
    try {
      const r = await window.electronAPI.gitDeleteBranch(state.repoPath, name, false);
      if (!r.success) { showError(r.error); return; }
      await render();
      _showToast('Deleted');
    } catch (err) {
      showError(err.message);
    }
  });
}

export function deleteRemote(name, btn) {
  return runBusy('Deleting remote ' + name + '…', btn, async () => {
    hideError();
    const remote = name.split('/')[0] || 'origin';
    const branchName = name.split('/').slice(1).join('/') || name;
    try {
      const r = await window.electronAPI.gitDeleteRemoteBranch(state.repoPath, remote, branchName);
      if (!r.success) { showError(r.error); return; }
      await render();
      _showToast('Remote branch deleted');
    } catch (err) {
      showError(err.message);
    }
  });
}

function _showToast(msg) {
  const panel = document.querySelector('.bm-panel-inline');
  if (!panel) return;
  const toast = document.createElement('div');
  toast.className = 'bm-toast bm-toast-success';
  toast.textContent = msg;
  panel.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('bm-toast-show'));
  setTimeout(() => toast.remove(), 2500);
}