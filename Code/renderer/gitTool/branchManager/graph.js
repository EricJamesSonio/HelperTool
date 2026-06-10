import { state, setState } from './state.js';
import { getGraphView } from './template.js';
import { render } from './list.js';

export async function open(branch) {
  setState({ graphBranch: branch, graphPage: 1, graphCommits: [] });
  await _load();
}

async function _load() {
  const el = document.getElementById('bmGraphView');
  if (!el) return;
  el.style.display = '';
  try {
    const r = await window.electronAPI.gitBranchGraph(state.repoPath, state.graphBranch, state.graphPage);
    if (r.success) {
      setState({ graphCommits: r.commits });
      el.innerHTML = getGraphView(state.graphBranch, r.commits, r.page, r.totalPages);
      _wireEvents(el);
    } else {
      el.innerHTML = '<div class="bm-empty">Failed to load graph</div>';
    }
  } catch {
    el.innerHTML = '<div class="bm-empty">Error loading graph</div>';
  }
}

function _wireEvents(el) {
  document.getElementById('bmGraphClose')?.addEventListener('click', () => {
    setState({ graphBranch: null, graphCommits: [] });
    el.style.display = 'none';
    el.innerHTML = '';
    render();
  });

  el.querySelectorAll('.bm-page-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      setState({ graphPage: parseInt(btn.dataset.graphPage) });
      await _load();
    });
  });
}

export function close() {
  setState({ graphBranch: null, graphCommits: [] });
  const el = document.getElementById('bmGraphView');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}
