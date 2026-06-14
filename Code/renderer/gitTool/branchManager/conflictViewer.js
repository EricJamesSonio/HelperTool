import { state, setState } from './state.js';
import { getConflictResolver } from './template.js';
import { flashSuccess } from './animations.js';
import { render as renderList } from './list.js';
import { showRight, close as closeMerge } from './index.js';

export function render() {
  const mf = state.mergeFlow;
  if (!mf) return showRight('<div class="bm-empty">Select an action to view details</div>');

  showRight(getConflictResolver(state.conflicts, mf.from, mf.into));
  _wireEvents();
}

function _wireEvents() {
  const rightEl = document.getElementById('bmRightPanel');
  if (!rightEl) return;

  document.getElementById('bmConflictSelectAll')?.addEventListener('click', () => {
    const cbs = rightEl.querySelectorAll('.bm-conflict-cb');
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

  const loadConflictDiff = (file) => {
    setState({ activeConflictFile: file });
    const diffEl = document.getElementById('bmConflictDiff');
    if (!diffEl) return;
    let contentEl = diffEl.querySelector('.bm-conflict-diff-content');
    if (!contentEl) {
      contentEl = document.createElement('div');
      contentEl.className = 'bm-conflict-diff-content';
      diffEl.appendChild(contentEl);
    }
    contentEl.innerHTML = '<div class="bm-conflict-diff-loading">Loading diff…</div>';
    window.electronAPI.gitGetConflictDiff(state.repoPath, file).then(r => {
      if (r.success && r.diff) {
        contentEl.innerHTML = `<pre class="bm-diff-content">${r.diff}</pre>`;
      } else {
        contentEl.innerHTML = '<div class="bm-conflict-diff-empty">No diff available</div>';
      }
    }).catch(() => {
      contentEl.innerHTML = '<div class="bm-conflict-diff-empty">Error loading diff</div>';
    });
  };

  rightEl.querySelector('#bmConflictFileList')?.addEventListener('click', async (e) => {
    const viewBtn = e.target.closest('.bm-conflict-view-btn');
    if (viewBtn) {
      const file = viewBtn.dataset.file;
      const mf = state.mergeFlow;
      loadConflictDiff(file);
      const diffEl = document.getElementById('bmConflictDiff');
      if (diffEl && mf) {
        const alreadyResolved = state.conflicts.find(c => c.file === file)?.status !== 'unresolved';
        const actionBar = alreadyResolved ? '' : `
          <div class="bm-conflict-file-actions" id="bmFileActionBar" data-file="${file}">
            <span class="bm-file-action-label">Resolve <strong>${file}</strong>:</span>
            <button class="bm-btn bm-btn-sm" id="bmFileAcceptIncoming">Accept Incoming (${mf.from})</button>
            <button class="bm-btn bm-btn-sm" id="bmFileAcceptOurs">Accept Ours (${mf.into})</button>
          </div>
        `;
        const existingBar = diffEl.querySelector('#bmFileActionBar');
        if (!existingBar && actionBar) diffEl.insertAdjacentHTML('afterbegin', actionBar);
        document.getElementById('bmFileAcceptIncoming')?.addEventListener('click', async () => {
          const r = await window.electronAPI.gitAcceptIncoming(state.repoPath, [file]);
          if (r.success) _markResolved([file]);
        });
        document.getElementById('bmFileAcceptOurs')?.addEventListener('click', async () => {
          const r = await window.electronAPI.gitAcceptCurrent(state.repoPath, [file]);
          if (r.success) _markResolved([file]);
        });
      }
      return;
    }
    const row = e.target.closest('.bm-conflict-file');
    if (!row) return;
    loadConflictDiff(row.dataset.file);
  });

  document.getElementById('bmConflictCompleteMerge')?.addEventListener('click', async () => {
    const mf = state.mergeFlow;
    if (!mf) return;
    try {
      const r = await window.electronAPI.gitCompleteMerge(state.repoPath, `Merge branch ${mf.from} into ${mf.into}`);
      if (r.success) {
        flashSuccess(rightEl);
        closeMerge();
        renderList();
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
  const rightEl = document.getElementById('bmRightPanel');
  if (mf && rightEl) rightEl.innerHTML = getConflictResolver(updated, mf.from, mf.into);
  _wireEvents();
}
