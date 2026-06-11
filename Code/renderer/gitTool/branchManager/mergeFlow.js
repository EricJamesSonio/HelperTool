import { state, setState } from './state.js';
import { getMergeConfirm, getMergeSuccessText } from './template.js';
import { animateMergeDiagram, flashSuccess } from './animations.js';
import { isAnimated, branchColor, escHtml } from './utils.js';
import { render } from './list.js';
import { showRight, showError } from './index.js';

function colorizeDiff(diff) {
  if (!diff) return '';
  return diff.split('\n').map(line => {
    const escaped = escHtml(line);
    let cls = 'diff-context';
    if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-add';
    else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-remove';
    else if (line.startsWith('@@')) cls = 'diff-hunk';
    else if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('index ')) cls = 'diff-header';
    return `<span class="diff-line ${cls}">${escaped || ' '}</span>`;
  }).join('\n');
}

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
    console.debug('[mergeFlow] merge result:', r);
    if (r.success) {
      mf.step = 'success';
      let detail;
      if (r.isUpToDate) {
        detail = `<strong>${mf.from}</strong> → <strong>${mf.into}</strong> — already up to date`;
      } else {
        detail = `<strong>${mf.from}</strong> → <strong>${mf.into}</strong> merged (merge commit created)`;
      }
      showRight(getMergeSuccessText(mf.from, mf.into, detail, r.files, r.summary, r.pushed));
      flashSuccess(document.getElementById('bmRightPanel'));

      document.querySelectorAll('.bm-merge-view-diff').forEach(btn => {
        btn.addEventListener('click', async () => {
          const file = btn.dataset.file;
          const diffView = document.getElementById('bmMergeDiffView');
          if (!diffView) return;
          diffView.style.display = 'block';
          diffView.innerHTML = '<div class="bm-conflict-diff-loading">Loading diff…</div>';
          try {
            const diffR = await window.electronAPI.gitMergeBranchDiff(state.repoPath, file);
            if (diffR.success && diffR.diff) {
              diffView.innerHTML = colorizeDiff(diffR.diff);
            } else {
              diffView.innerHTML = '<div class="bm-conflict-diff-empty">No diff available</div>';
            }
          } catch (err) {
            diffView.innerHTML = '<div class="bm-conflict-diff-empty">Error loading diff</div>';
          }
        });
      });

      document.getElementById('bmMergeDone')?.addEventListener('click', () => {
        close();
        render();
      });
    } else if (r.conflict) {
      const conflicts = (r.files || []).map(f => ({ file: f, status: 'unresolved' }));
      setState({ conflicts, mergeFlow: { ...mf, step: 'conflicts' } });
      import('./conflictViewer.js').then(m => m.render());
    } else {
      setState({ mergeFlow: null, conflicts: [], selectedConflicts: [], activeConflictFile: null });
      showError(r.error);
    }
  } catch (err) {
    setState({ mergeFlow: null, conflicts: [], selectedConflicts: [], activeConflictFile: null });
    showError(err.message);
  }
}

export function close() {
  setState({ mergeFlow: null, conflicts: [], selectedConflicts: [], activeConflictFile: null });
  showRight('<div class="bm-empty">Select an action to view details</div>');
}
