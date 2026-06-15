import { state, setState } from './state.js';
import { getBranchRow, getRemoteRow } from './template.js';
import { branchColor, escHtml } from './utils.js';

export async function render() {
  const el = document.getElementById('bmBranchList');
  if (!el) return;
  setState({ loading: { ...state.loading, branches: true } });
  try {
    const cacheKey = 'branches:' + state.repoPath;
    const { getPrefetchCache } = await import('../../app_manager/prefetchManager.js');
    getPrefetchCache().invalidate(cacheKey);
    const r = await window.electronAPI.gitBranches(state.repoPath);

    if (!r.success) { el.innerHTML = '<div class="bm-empty">Failed to load branches</div>'; return; }
    setState({ current: r.current, local: r.local, remote: r.remote });

    const filter = (document.getElementById('bmSearch')?.value || '').toLowerCase();

    const localHtml = r.local
      .filter(b => !filter || b.name.toLowerCase().includes(filter))
      .map(b => getBranchRow(b, b.name === r.current, branchColor(b.name), r.defaultBranch))
      .join('');

    const remoteHtml = r.remote
      .filter(b => !filter || b.name.toLowerCase().includes(filter))
      .map(getRemoteRow)
      .join('');

    el.innerHTML = `
      <div class="bm-section">
        <div class="bm-section-title">LOCAL BRANCHES</div>
        ${localHtml || '<div class="bm-empty">No local branches</div>'}
      </div>
      <div class="bm-section">
        <div class="bm-section-title">REMOTE BRANCHES</div>
        ${remoteHtml || '<div class="bm-empty">No remote branches</div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = '<div class="bm-empty">Error loading branches</div>';
  } finally {
    setState({ loading: { ...state.loading, branches: false } });
  }
}
