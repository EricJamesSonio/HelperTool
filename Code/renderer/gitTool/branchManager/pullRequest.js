import { state, setState } from './state.js';
import { getPRList, getPRCreateForm, getPRDetail } from './template.js';
import { flashSuccess } from './animations.js';
import { escHtml } from './utils.js';
import { render } from './list.js';
import { showRight, showError } from './index.js';

export async function openCreate(source, target) {
  setState({ activePRTab: 'create', activePRId: null, prCreateData: null });
  showRight('<div class="bm-conflict-diff-loading">Loading branch diff…</div>');
  try {
    const r = await window.electronAPI.gitDiffBranches(state.repoPath, source, target);
    if (!r.success) { showError(r.error); return; }
    setState({ prCreateData: { source, target, files: r.files || [], commits: r.commits || [] } });
    renderCreateForm();
  } catch (err) {
    showError(err.message);
  }
}

function renderCreateForm() {
  const d = state.prCreateData;
  if (!d) return;
  showRight(getPRCreateForm(d.source, d.target, d.files, d.commits));

  document.getElementById('bmPRCreateCancel')?.addEventListener('click', () => {
    setState({ activePRTab: 'list', prCreateData: null });
    renderList();
  });

  document.getElementById('bmPRCreateSubmit')?.addEventListener('click', async () => {
    const title = document.getElementById('bmPRCreateTitle')?.value?.trim();
    if (!title) { showError('Please enter a title'); return; }
    const desc = document.getElementById('bmPRCreateDesc')?.value?.trim() || '';
    await createPR(d.source, d.target, title, desc, d.files, d.commits);
  });
}

async function createPR(source, target, title, description, files, commits) {
  const pr = {
    id: 'pr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    sourceBranch: source,
    targetBranch: target,
    title,
    description,
    status: 'open',
    files: files || [],
    commits: commits || [],
    createdAt: Date.now(),
    mergedAt: null,
  };
  const updated = [...(state.pullRequests || []), pr];
  setState({ pullRequests: updated, activePRTab: 'list', activePRId: pr.id, prCreateData: null });
  flashSuccess(document.getElementById('bmRightPanel'));
  renderDetail(pr.id);
}

export function renderList() {
  setState({ activePRTab: 'list', activePRId: null, prCreateData: null });
  showRight(getPRList(state.pullRequests || [], state.current));

  document.querySelectorAll('.bm-pr-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.prId;
      if (id) renderDetail(id);
    });
  });
}

export function renderDetail(prId) {
  if (!prId) { renderList(); return; }
  const pr = (state.pullRequests || []).find(p => p.id === prId);
  if (!pr) { renderList(); return; }
  setState({ activePRTab: 'detail', activePRId: prId });
  showRight(getPRDetail(pr));

  document.getElementById('bmPRBack')?.addEventListener('click', renderList);

  document.getElementById('bmPRAccept')?.addEventListener('click', () => acceptPR(prId));
  document.getElementById('bmPRDecline')?.addEventListener('click', () => declinePR(prId));

  document.querySelectorAll('.bm-pr-view-diff').forEach(btn => {
    btn.addEventListener('click', async () => {
      const file = btn.dataset.file;
      const diffView = document.getElementById('bmPRDiffView');
      if (!diffView) return;
      diffView.style.display = 'block';
      diffView.innerHTML = '<div class="bm-conflict-diff-loading">Loading diff…</div>';
      try {
        const diffR = await window.electronAPI.gitBranchFileDiff(state.repoPath, pr.sourceBranch, pr.targetBranch, file);
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
}

async function acceptPR(prId) {
  const pr = (state.pullRequests || []).find(p => p.id === prId);
  if (!pr || pr.status !== 'open') return;

  const btn = document.getElementById('bmPRAccept');
  if (btn) { btn.disabled = true; btn.textContent = 'Merging…'; }

  try {
    const r = await window.electronAPI.gitMergeBranch(state.repoPath, pr.sourceBranch, pr.targetBranch);
    if (r.success) {
      if (r.isUpToDate) {
        showError('Already up to date — nothing to merge');
        if (btn) { btn.disabled = false; btn.textContent = 'Accept & Merge'; }
        return;
      }
      const updated = (state.pullRequests || []).map(p =>
        p.id === prId ? { ...p, status: 'merged', mergedAt: Date.now() } : p
      );
      setState({ pullRequests: updated });
      flashSuccess(document.getElementById('bmRightPanel'));
      renderDetail(prId);
      render();
    } else if (r.conflict) {
      showError('Merge conflicts detected. Open the merge flow to resolve them.');
      if (btn) { btn.disabled = false; btn.textContent = 'Accept & Merge'; }
    } else {
      showError(r.error || 'Merge failed');
      if (btn) { btn.disabled = false; btn.textContent = 'Accept & Merge'; }
    }
  } catch (err) {
    showError(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Accept & Merge'; }
  }
}

async function declinePR(prId) {
  const updated = (state.pullRequests || []).map(p =>
    p.id === prId ? { ...p, status: 'declined' } : p
  );
  setState({ pullRequests: updated });
  renderDetail(prId);
}

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

export function close() {
  setState({ activePRTab: 'list', activePRId: null, prCreateData: null });
}
