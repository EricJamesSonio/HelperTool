import { state, setState } from './state.js';
import { render } from './list.js';

export async function push(branch) {
  setState({ loading: { ...state.loading, push: true } });
  try {
    const r = await window.electronAPI.gitPushBranch(state.repoPath, branch, 'origin');
    if (!r.success) { setState({ error: r.error }); return; }
    await render();
    _showToast('Pushed to origin');
  } catch (err) {
    setState({ error: err.message });
  } finally {
    setState({ loading: { ...state.loading, push: false } });
  }
}

export async function pull(branch) {
  setState({ loading: { ...state.loading, pull: true } });
  try {
    const r = await window.electronAPI.gitPullBranch(state.repoPath, branch, 'origin');
    if (!r.success) { setState({ error: r.error }); return; }
    await render();
    _showToast('Pulled from origin');
  } catch (err) {
    setState({ error: err.message });
  } finally {
    setState({ loading: { ...state.loading, pull: false } });
  }
}

export async function fetch() {
  try {
    const r = await window.electronAPI.gitFetchRemote(state.repoPath, 'origin');
    if (!r.success) { setState({ error: r.error }); return; }
    await render();
    _showToast('Fetched from origin');
  } catch (err) {
    setState({ error: err.message });
  }
}

export async function deleteBranch(name) {
  try {
    const r = await window.electronAPI.gitDeleteBranch(state.repoPath, name, false);
    if (!r.success) { setState({ error: r.error }); return; }
    await render();
    _showToast('Deleted');
  } catch (err) {
    setState({ error: err.message });
  }
}

export async function deleteRemote(name) {
  const remote = name.split('/')[0] || 'origin';
  const branchName = name.split('/').slice(1).join('/') || name;
  try {
    const r = await window.electronAPI.gitDeleteRemoteBranch(state.repoPath, remote, branchName);
    if (!r.success) { setState({ error: r.error }); return; }
    await render();
    _showToast('Remote branch deleted');
  } catch (err) {
    setState({ error: err.message });
  }
}

function _showToast(msg) {
  const panel = document.getElementById('bmPanel');
  if (!panel) return;
  const toast = document.createElement('div');
  toast.className = 'bm-toast bm-toast-success';
  toast.textContent = msg;
  panel.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('bm-toast-show'));
  setTimeout(() => toast.remove(), 2500);
}
