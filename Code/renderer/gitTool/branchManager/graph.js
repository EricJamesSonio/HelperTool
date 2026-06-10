import { state, setState } from './state.js';
import { getGraphView } from './template.js';
import { render } from './list.js';
import { showRight } from './index.js';

export async function open(branch) {
  setState({ graphBranch: branch, graphPage: 1, graphCommits: [] });
  await _load();
}

async function _load() {
  const el = document.getElementById('bmRightPanel');
  if (!el) return;
  try {
    const r = await window.electronAPI.gitBranchGraph(state.repoPath, state.graphBranch, state.graphPage);
    if (r.success) {
      setState({ graphCommits: r.commits });
      showRight(getGraphView(state.graphBranch, r.commits, r.page, r.totalPages));
      _wireEvents();
    } else {
      showRight('<div class="bm-empty">Failed to load graph</div>');
    }
  } catch {
    showRight('<div class="bm-empty">Error loading graph</div>');
  }
}

function _wireEvents() {
  document.getElementById('bmGraphClose')?.addEventListener('click', () => {
    setState({ graphBranch: null, graphCommits: [] });
    showRight('<div class="bm-empty">Select an action to view details</div>');
    render();
  });

  document.querySelectorAll('.bm-page-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      setState({ graphPage: parseInt(btn.dataset.graphPage) });
      await _load();
    });
  });
}

export function close() {
  setState({ graphBranch: null, graphCommits: [] });
  showRight('<div class="bm-empty">Select an action to view details</div>');
}
