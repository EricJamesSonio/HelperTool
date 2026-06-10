import { state, setState } from './state.js';
import { getPanelTemplate } from './template.js';
import { render as renderList } from './list.js';
import { open as openCreate } from './createFlow.js';
import { push, pull, fetch, deleteBranch, deleteRemote } from './remoteOps.js';
import { open as openMerge } from './mergeFlow.js';
import { open as openGraph } from './graph.js';
import { slideIn } from './animations.js';

let _panel = null;
let _repoPath = null;

export function open(repoPath) {
  console.log('[BranchManager] open called with repoPath:', repoPath);
  _repoPath = repoPath;
  setState({ repoPath, open: true, error: null, confirm: null });
  if (!_panel) {
    console.log('[BranchManager] building panel...');
    _buildPanel();
    console.log('[BranchManager] panel built, _panel:', _panel);
  }
  _panel.classList.add('open');
  console.log('[BranchManager] panel classList after open:', _panel.className);
  slideIn(_panel);
  _load();
}

export function close() {
  setState({ open: false, mergeFlow: null, conflicts: [], graphBranch: null, createOpen: false });
  if (_panel) _panel.classList.remove('open');
}

export function isOpen() {
  return state.open;
}

function _buildPanel() {
  const div = document.createElement('div');
  div.innerHTML = getPanelTemplate();
  _panel = div.firstElementChild;
  document.body.appendChild(_panel);

  _panel.querySelector('#bmCloseBtn').addEventListener('click', close);

  _panel.querySelector('#bmNewBranchBtn').addEventListener('click', () => openCreate());

  _panel.querySelector('#bmFetchBtn').addEventListener('click', async () => {
    await fetch();
    await renderList();
  });

  document.getElementById('bmSearch')?.addEventListener('input', () => {
    renderList();
  });

  _panel.querySelectorAll('.bm-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      localStorage.setItem('helpertool-branch-mode', mode);
      _panel.querySelectorAll('.bm-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      setState({ mode });
    });
  });

  _wireBranchListEvents();
  _wireDropdowns();
  _wireConfirm();
}

function _wireBranchListEvents() {
  document.getElementById('bmBranchList')?.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const row = actionBtn.closest('[data-name]');
    const name = row?.dataset.name || '';
    const action = actionBtn.dataset.action;

    if (action === 'switch') {
      const r = await window.electronAPI.gitSwitchBranch(_repoPath, name);
      if (r.success) { await renderList(); _showToast('Switched to ' + name); }
      else { setState({ error: r.error }); }
    } else if (action === 'merge') {
      openMerge(name);
    } else if (action === 'push') {
      await push(name);
    } else if (action === 'pull') {
      await pull(name);
    } else if (action === 'graph') {
      await openGraph(name);
    } else if (action === 'delete') {
      _confirm({
        title: 'Delete branch?',
        message: `Delete "${name}"?`,
        danger: true,
        confirmLabel: 'Delete',
        onConfirm: async () => { await deleteBranch(name); setState({ confirm: null }); },
        onCancel: () => setState({ confirm: null }),
      });
    } else if (action === 'delete-remote') {
      _confirm({
        title: 'Delete remote branch?',
        message: `Delete remote "${name}"?`,
        danger: true,
        confirmLabel: 'Delete',
        onConfirm: async () => { await deleteRemote(name); setState({ confirm: null }); },
        onCancel: () => setState({ confirm: null }),
      });
    }
  });
}

function _wireDropdowns() {
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.bm-dropdown-toggle');
    document.querySelectorAll('.bm-dropdown-menu').forEach(m => {
      if (toggle && m.closest('.bm-dropdown') === toggle.closest('.bm-dropdown')) return;
      m.classList.remove('open');
    });
    if (!toggle) return;
    e.stopPropagation();
    const menu = toggle.closest('.bm-dropdown')?.querySelector('.bm-dropdown-menu');
    if (menu) menu.classList.toggle('open');
  });
}

function _wireConfirm() {
  document.getElementById('bmConfirmOverlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) setState({ confirm: null });
  });
}

export function _confirm(opts) {
  setState({ confirm: opts });
  const el = document.getElementById('bmConfirmOverlay');
  if (!el) return;
  el.innerHTML = opts ? `
    <div class="bm-confirm-card ${opts.danger ? 'bm-confirm-danger' : ''}">
      <div class="bm-confirm-title">${opts.title}</div>
      <div class="bm-confirm-msg">${opts.message}</div>
      <div class="bm-confirm-actions">
        <button class="bm-btn" id="bmConfirmCancel">Cancel</button>
        <button class="bm-btn bm-btn-primary" id="bmConfirmOk">${opts.confirmLabel || 'OK'}</button>
      </div>
    </div>
  ` : '';
  el.style.display = opts ? '' : 'none';

  if (opts) {
    document.getElementById('bmConfirmCancel')?.addEventListener('click', () => opts.onCancel?.());
    document.getElementById('bmConfirmOk')?.addEventListener('click', () => opts.onConfirm?.());
  }
}

function _showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'bm-toast bm-toast-success';
  toast.textContent = msg;
  _panel.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('bm-toast-show'));
  setTimeout(() => toast.remove(), 2500);
}

async function _load() {
  await renderList();
}
