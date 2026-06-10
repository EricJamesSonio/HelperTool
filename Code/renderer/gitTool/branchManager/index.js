import { state, setState } from './state.js';
import { getPanelContent } from './template.js';
import { render as renderList } from './list.js';
import { open as openCreate } from './createFlow.js';
import { push, pull, fetch, deleteBranch, deleteRemote } from './remoteOps.js';
import { open as openMerge } from './mergeFlow.js';
import { open as openGraph } from './graph.js';

let _container = null;
let _repoPath = null;
let _onClose = null;
let _dropdownWired = false;

export function open(container, repoPath, onClose) {
  _container = container;
  _repoPath = repoPath;
  _onClose = onClose || null;
  _dropdownWired = false;
  setState({ repoPath, open: true, error: null, confirm: null, mergeFlow: null, conflicts: [], graphBranch: null, createOpen: false });
  _render();
  _wireEvents();
  _load();
}

export function close() {
  setState({ open: false, mergeFlow: null, conflicts: [], graphBranch: null, createOpen: false });
  _onClose?.();
  _container = null;
  _onClose = null;
  _dropdownWired = false;
}

export function isOpen() {
  return state.open;
}

export function showRight(html) {
  const el = _container?.querySelector('#bmRightPanel');
  if (el) el.innerHTML = html;
}

function _render() {
  if (!_container) return;
  const mode = localStorage.getItem('helpertool-branch-mode') !== 'pro' ? 'beginner' : 'pro';
  _container.innerHTML = getPanelContent(mode);
}

function _wireEvents() {
  if (!_container) return;

  _container.querySelector('#bmCloseBtn')?.addEventListener('click', close);

  _container.querySelector('#bmNewBranchBtn')?.addEventListener('click', () => openCreate());

  _container.querySelector('#bmFetchBtn')?.addEventListener('click', async () => {
    await fetch();
    await renderList();
  });

  _container.querySelector('#bmSearch')?.addEventListener('input', () => {
    renderList();
  });

  _container.querySelectorAll('.bm-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      localStorage.setItem('helpertool-branch-mode', mode);
      _container.querySelectorAll('.bm-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      setState({ mode });
    });
  });

  _wireBranchListEvents();
  _wireDropdowns();
}

function _wireBranchListEvents() {
  _container?.querySelector('#bmBranchList')?.addEventListener('click', async (e) => {
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
  if (_dropdownWired) return;
  _dropdownWired = true;
  _container?.addEventListener('click', (e) => {
    const toggle = e.target.closest('.bm-dropdown-toggle');
    _container?.querySelectorAll('.bm-dropdown-menu').forEach(m => {
      if (toggle && m.closest('.bm-dropdown') === toggle.closest('.bm-dropdown')) return;
      m.classList.remove('open');
    });
    if (!toggle) return;
    e.stopPropagation();
    const menu = toggle.closest('.bm-dropdown')?.querySelector('.bm-dropdown-menu');
    if (menu) menu.classList.toggle('open');
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
    el.querySelector('#bmConfirmCancel')?.addEventListener('click', () => opts.onCancel?.());
    el.querySelector('#bmConfirmOk')?.addEventListener('click', () => opts.onConfirm?.());
  }
}

function _showToast(msg) {
  if (!_container) return;
  const toast = document.createElement('div');
  toast.className = 'bm-toast bm-toast-success';
  toast.textContent = msg;
  _container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('bm-toast-show'));
  setTimeout(() => toast.remove(), 2500);
}

async function _load() {
  await renderList();
}
