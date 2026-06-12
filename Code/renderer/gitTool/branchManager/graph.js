import { state, setState } from './state.js';
import { getGraphView } from './template.js';
import { render } from './list.js';
import { showRight } from './index.js';

let _loadingMore = false;

export async function open(branch) {
  setState({ graphBranch: branch, graphPage: 1, graphCommits: [], graphTotalPages: 0, expandedCommit: null, commitFiles: {}, loadingFiles: false, commitDiffActive: null, commitDiffs: {}, diffLoading: false });
  await _load();
}

async function _load() {
  try {
    const r = await window.electronAPI.gitBranchGraph(state.repoPath, state.graphBranch, 1);
    if (r.success) {
      setState({ graphCommits: r.commits, graphPage: 1, graphTotalPages: r.totalPages });
    } else {
      showRight('<div class="bm-empty">Failed to load graph</div>');
      return;
    }
  } catch {
    showRight('<div class="bm-empty">Error loading graph</div>');
    return;
  }
  _render();
}

async function _loadMore() {
  if (_loadingMore) return;
  _loadingMore = true;
  const nextPage = state.graphPage + 1;
  try {
    const r = await window.electronAPI.gitBranchGraph(state.repoPath, state.graphBranch, nextPage);
    if (r.success) {
      setState({ graphCommits: [...state.graphCommits, ...r.commits], graphPage: nextPage, graphTotalPages: r.totalPages });
    }
  } catch {}
  _loadingMore = false;
  _render();
}

async function _toggleCommit(hash) {
  if (state.expandedCommit === hash) {
    setState({ expandedCommit: null, commitDiffActive: null });
    _render();
    return;
  }
  setState({ expandedCommit: hash, commitDiffActive: null });
  if (!state.commitFiles[hash]) {
    setState({ loadingFiles: true });
    _render();
    try {
      const r = await window.electronAPI.gitCommitDetail(state.repoPath, hash);
      if (r?.success) {
        setState({ commitFiles: { ...state.commitFiles, [hash]: r.files || [] }, loadingFiles: false });
      } else {
        setState({ commitFiles: { ...state.commitFiles, [hash]: [] }, loadingFiles: false });
      }
    } catch {
      setState({ commitFiles: { ...state.commitFiles, [hash]: [] }, loadingFiles: false });
    }
  }
  _render();
}

async function _toggleFileDiff(hash, filePath) {
  const key = hash + '|' + filePath;
  if (state.commitDiffActive && state.commitDiffActive.hash === hash && state.commitDiffActive.filePath === filePath) {
    setState({ commitDiffActive: null });
    _render();
    return;
  }
  setState({ commitDiffActive: { hash, filePath }, diffLoading: !state.commitDiffs[key] });
  _render();
  if (state.commitDiffs[key]) return;
  try {
    const r = await window.electronAPI.gitCommitFileDiff(state.repoPath, hash, filePath);
    if (r?.success && r.diff) {
      setState({ commitDiffs: { ...state.commitDiffs, [key]: r.diff }, diffLoading: false });
    } else {
      setState({ commitDiffs: { ...state.commitDiffs, [key]: '' }, diffLoading: false });
    }
  } catch {
    setState({ commitDiffs: { ...state.commitDiffs, [key]: '' }, diffLoading: false });
  }
  _render();
}

function _render() {
  const diffKey = state.commitDiffActive ? state.commitDiffActive.hash + '|' + state.commitDiffActive.filePath : null;
  const diffText = diffKey ? (state.commitDiffs[diffKey] || '') : '';
  showRight(getGraphView(state.graphBranch, state.graphCommits, state.graphPage, state.graphTotalPages, state.expandedCommit, state.commitFiles, state.loadingFiles, _loadingMore, state.commitDiffActive, diffText, state.diffLoading));
  _wireEvents();
}

function _wireEvents() {
  document.getElementById('bmGraphClose')?.addEventListener('click', () => {
    close();
    render();
  });

  document.getElementById('bmGraphLoadMore')?.addEventListener('click', () => {
    _loadMore();
  });

  document.querySelectorAll('.bm-graph-commit').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.bm-graph-file-row')) return;
      _toggleCommit(el.dataset.hash);
    });
  });

  document.querySelectorAll('.bm-graph-file-row').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      _toggleFileDiff(el.dataset.hash, el.dataset.file);
    });
  });
}

export function close() {
  setState({ graphBranch: null, graphCommits: [], graphTotalPages: 0, expandedCommit: null, commitFiles: {}, loadingFiles: false, commitDiffActive: null, commitDiffs: {}, diffLoading: false });
  showRight('<div class="bm-empty">Select an action to view details</div>');
}
