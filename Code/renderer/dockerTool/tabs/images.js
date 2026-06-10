import * as state from '../state.js';
import { getImageRow } from '../template.js';
import { loading, showToast } from '../ui.js';

export async function render() {
  const tab = document.getElementById('dtTabImages');
  if (!tab) return;
  loading(true);
  try {
    const list = await window.dockerAPI.listImages();
    state.set('images', list);
    if (!list.length) {
      tab.innerHTML = '<div class="dt-empty">No images found</div>';
      return;
    }
    tab.innerHTML = list.map(getImageRow).join('');
  } catch (err) {
    tab.innerHTML = '<div class="dt-empty dt-error">Failed to list images</div>';
    showToast(err.message, 'error');
  } finally {
    loading(false);
  }
}

export function wireActions() {
  document.getElementById('dtTabImages').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const row = btn.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    if (btn.dataset.action === 'remove-image') {
      try {
        loading(true);
        const r = await window.dockerAPI.removeImage(id);
        if (!r.ok) { showToast(r.error || 'Remove failed', 'error'); return; }
        showToast('Image removed', 'success');
        await render();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        loading(false);
      }
    }
  });
}
