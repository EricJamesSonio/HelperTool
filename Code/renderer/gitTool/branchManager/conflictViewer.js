import { state, setState } from './state.js';
import { getConflictResolver } from './template.js';
import { flashSuccess } from './animations.js';
import { render } from './list.js';
import { close } from './mergeFlow.js';

export function render() {
  const el = document.getElementById('bmMergeFlow');
  if (!el) return;
  el.style.display = '';
  const mf = state.mergeFlow;
  if (!mf) return;

  el.innerHTML = getConflictResolver(state.conflicts, mf.from, mf.into);
  _wireEvents(el);
}

function _wireEvents(el) {
  document.getElementById('bmConflictSelectAll')?.addEventListener('click', () => {
    const cbs = el.querySelectorAll('.bm-conflict-cb');
    const allChecked = Array.from(cbs).every(cb => cb.checked);
    cbs.forEach(cb => cb.checked = !allChecked);
  });

  document.getElementById('bmConflictAcceptIncoming')?.addEventListener('click', async () => {
    const selected = _getSelectedUnresolved();
    if (!selected.length) return;
    const r = await window.electronAPI.gitAcceptIncoming(state.repoPath, selected);
    if (r.success) {
      _markResolved(selected);
    } else {
      setState({ error: r.error });
    }
  });

  document.getElementById('bmConflictAcceptOurs')?.addEventListener('click', async () => {
    const selected = _getSelectedUnresolved();
    if (!selected.length) return;
    const r = await window.electronAPI.gitAcceptCurrent(state.repoPath, selected);
    if (r.success) {
      _markResolved(selected);
    } else {
      setState({ error: r.error });
    }
  });

  el.querySelector('#bmConflictFileList')?.addEventListener('click', async (e) => {
    const row = e.target.closest('.bm-conflict-file');
    if (!row) return;
    const file = row.dataset.file;
    setState({ activeConflictFile: file });
    const diffEl = document.getElementById('bmConflictDiff');
    if (diffEl) diffEl.innerHTML = '<div class="bm-conflict-diff-loading">Loading diff…</div>';
    try {
      const r = await window.electronAPI.gitGetConflictDiff(state.repoPath, file);
      if (diffEl) {
        if (r.success && r.diff) {
          diffEl.innerHTML = `<pre class="bm-diff-content">${r.diff}</pre>`;
        } else {
          diffEl.innerHTML = '<div class="bm-conflict-diff-empty">No diff available</div>';
        }
      }
    } catch (err) {
      const diffEl = document.getElementById('bmConflictDiff');
      if (diffEl) diffEl.innerHTML = '<div class="bm-conflict-diff-empty">Error loading diff</div>';
    }
  });

  document.getElementById('bmConflictCompleteMerge')?.addEventListener('click', async () => {
    try {
      const r = await window.electronAPI.gitCompleteMerge(state.repoPath, `Merge branch ${mf.from} into ${mf.into}`);
      if (r.success) {
        flashSuccess(el);
        close();
        render();
      } else {
        setState({ error: r.error });
      }
    } catch (err) {
      setState({ error: err.message });
    }
  });
}

function _getSelectedUnresolved() {
  const rows = document.querySelectorAll('.bm-conflict-file');
  const selected = [];
  rows.forEach(row => {
    const cb = row.querySelector('.bm-conflict-cb');
    if (cb && cb.checked) {
      const s = state.conflicts.find(c => c.file === row.dataset.file);
      if (s && s.status === 'unresolved') selected.push(row.dataset.file);
    }
  });
  return selected;
}

function _markResolved(files) {
  const updated = state.conflicts.map(c => {
    if (files.includes(c.file)) return { ...c, status: 'accepted' };
    return c;
  });
  setState({ conflicts: updated });
  const mf = state.mergeFlow;
  const conflictEl = document.getElementById('bmMergeFlow');
  if (mf && conflictEl) conflictEl.innerHTML = getConflictResolver(updated, mf.from, mf.into);
  _wireEvents(document.getElementById('bmMergeFlow'));
}
