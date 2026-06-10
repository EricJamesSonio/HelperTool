import { state, setState } from './state.js';
import { getMergeStep1, getMergeSuccess, getConflictResolver } from './template.js';
import { animateMergeDiagram, flashSuccess } from './animations.js';
import { branchColor } from './utils.js';
import { render } from './list.js';

export function open(fromBranch) {
  const into = state.current;
  if (!fromBranch || !into) return;
  setState({ mergeFlow: { from: fromBranch, into, step: 'confirm' }, conflicts: [], activeConflictFile: null, selectedConflicts: [] });
  _render();
}

function _render() {
  const el = document.getElementById('bmMergeFlow');
  if (!el) return;
  el.style.display = '';
  const mf = state.mergeFlow;
  if (!mf) return;

  if (mf.step === 'confirm') {
    el.innerHTML = getMergeStep1(mf.from, mf.into, branchColor(mf.from), branchColor(mf.into));

    document.getElementById('bmMergeCancel')?.addEventListener('click', close);
    document.getElementById('bmMergeStart')?.addEventListener('click', async () => {
      const svg = document.getElementById('bmMergeDiagram');
      animateMergeDiagram(svg, async () => {
        try {
          const r = await window.electronAPI.gitMergeBranch(state.repoPath, mf.from, mf.into);
          if (r.success) {
            mf.step = 'success';
            el.innerHTML = getMergeSuccess();
            flashSuccess(el.querySelector('.bm-merge-result'));
            document.getElementById('bmMergeDone')?.addEventListener('click', () => {
              close();
              render();
            });
          } else if (r.conflict) {
            const conflicts = (r.files || []).map(f => ({ file: f, status: 'unresolved' }));
            setState({ conflicts, mergeFlow: { ...mf, step: 'conflicts' } });
            import('./conflictViewer.js').then(m => m.render());
          } else {
            setState({ error: r.error });
            close();
          }
        } catch (err) {
          setState({ error: err.message });
          close();
        }
      });
    });
  }
}

export function close() {
  setState({ mergeFlow: null, conflicts: [], selectedConflicts: [], activeConflictFile: null });
  const el = document.getElementById('bmMergeFlow');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}
