import { state, setState } from './state.js';
import { getMergeConfirm, getMergeSuccessText } from './template.js';
import { animateMergeDiagram, flashSuccess } from './animations.js';
import { isAnimated, branchColor } from './utils.js';
import { render } from './list.js';
import { showRight } from './index.js';

export function open(fromBranch) {
  const into = state.current;
  if (!fromBranch || !into) return;
  setState({ mergeFlow: { from: fromBranch, into, step: 'confirm' }, conflicts: [], activeConflictFile: null, selectedConflicts: [] });
  _renderInto();
}

function _renderInto() {
  const mf = state.mergeFlow;
  if (!mf) return showRight('<div class="bm-empty">Select an action to view details</div>');

  if (mf.step === 'confirm') {
    showRight(getMergeConfirm(mf.from, mf.into, branchColor(mf.from), branchColor(mf.into)));

    document.getElementById('bmMergeCancel')?.addEventListener('click', close);
    document.getElementById('bmMergeStart')?.addEventListener('click', async () => {
      if (isAnimated()) {
        const svg = document.getElementById('bmMergeDiagram');
        animateMergeDiagram(svg, async () => {
          await _executeMerge();
        });
      } else {
        await _executeMerge();
      }
    });
  }
}

async function _executeMerge() {
  const mf = state.mergeFlow;
  if (!mf) return;
  try {
    const r = await window.electronAPI.gitMergeBranch(state.repoPath, mf.from, mf.into);
    if (r.success) {
      mf.step = 'success';
      showRight(getMergeSuccessText(mf.from, mf.into));
      flashSuccess(document.getElementById('bmRightPanel'));
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
}

export function close() {
  setState({ mergeFlow: null, conflicts: [], selectedConflicts: [], activeConflictFile: null });
  showRight('<div class="bm-empty">Select an action to view details</div>');
}
