import * as state from '../state.js';
import { getContainerRow } from '../template.js';
import { loading, showToast } from '../ui.js';
import { openLogModal } from '../logs.js';

export async function render() {
  const tab = document.getElementById('dtTabContainers');
  if (!tab) return;
  loading(true);
  try {
    const list = await window.dockerAPI.listContainers();
    state.set('containers', list);
    if (!list.length) {
      tab.innerHTML = '<div class="dt-empty">No containers found</div>';
      return;
    }
    tab.innerHTML = list.map(getContainerRow).join('');
  } catch (err) {
    tab.innerHTML = '<div class="dt-empty dt-error">Failed to list containers</div>';
    showToast(err.message, 'error');
  } finally {
    loading(false);
  }
}

export function wireActions() {
  document.getElementById('dtTabContainers').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const row = btn.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const action = btn.dataset.action;
    try {
      loading(true);
      if (action === 'start') {
        const r = await window.dockerAPI.startContainer(id);
        if (!r.ok) { showToast(r.error || 'Start failed', 'error'); return; }
        showToast('Container started', 'success');
      } else if (action === 'stop') {
        const r = await window.dockerAPI.stopContainer(id);
        if (!r.ok) { showToast(r.error || 'Stop failed', 'error'); return; }
        showToast('Container stopped', 'success');
      } else if (action === 'restart') {
        const r = await window.dockerAPI.restartContainer(id);
        if (!r.ok) { showToast(r.error || 'Restart failed', 'error'); return; }
        showToast('Container restarted', 'success');
      } else if (action === 'remove') {
        const r = await window.dockerAPI.removeContainer(id);
        if (!r.ok) { showToast(r.error || 'Remove failed', 'error'); return; }
        showToast('Container removed', 'success');
      } else if (action === 'logs') {
        const raw = await window.dockerAPI.getLogs(id, 200);
        openLogModal(id, row.querySelector('.dt-container-name')?.textContent || id, raw);
        return;
      }
      await render();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading(false);
    }
  });
}
