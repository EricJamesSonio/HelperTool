import { state, setState } from './state.js';
import { getBranchRow, getRemoteRow } from './template.js';
import { branchColor } from './utils.js';
import { getEntry, setCached, invalidate } from '../viewCache.js';

const KIND = 'branches';

function paint(r) {
  const el = document.getElementById('bmBranchList');
  if (!el) return;
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
}

async function fetchBranches(repoPath) {
  try {
    const { getPrefetchCache } = await import('../../app_manager/prefetchManager.js');
    getPrefetchCache().invalidate('branches:' + repoPath);
  } catch (_) {}
  return window.electronAPI.gitBranches(repoPath);
}

function showMessage(text) {
  const el = document.getElementById('bmBranchList');
  if (el) el.innerHTML = '<div class="bm-empty">' + text + '</div>';
}

async function load(invalidateInspect) {
  const repo = state.repoPath;
  if (!document.getElementById('bmBranchList')) return;
  setState({ loading: { ...state.loading, branches: true } });
  try {
    const r = await fetchBranches(repo);
    if (repo !== state.repoPath) return;
    if (!r || !r.success) {
      showMessage('Failed to load branches');
      return;
    }
    setCached(repo, KIND, r);
    if (invalidateInspect) invalidate(repo, 'inspect:');
    paint(r);
  } catch (err) {
    showMessage('Error loading branches');
  } finally {
    setState({ loading: { ...state.loading, branches: false } });
  }
}

export async function render() {
  await load(true);
}

export async function show() {
  const entry = getEntry(state.repoPath, KIND);
  if (entry) {
    paint(entry.data);
    // Revalidate in the background so the user doesn't see stale branches
    load(false).catch(() => {});
    return;
  }
  await load(false);
}

export function repaint() {
  const entry = getEntry(state.repoPath, KIND);
  if (entry) paint(entry.data);
}