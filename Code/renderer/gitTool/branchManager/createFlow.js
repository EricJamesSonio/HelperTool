import { state, setState } from './state.js';
import { getCreateForm } from './template.js';
import { slideIn } from './animations.js';
import { render } from './list.js';
import { showRight } from './index.js';

export function open() {
  setState({ createOpen: true, createPrefix: 'feature/', createName: '' });
  showRight(getCreateForm());

  const container = document.getElementById('bmRightPanel');
  if (!container) return;

  const base = document.getElementById('bmCreateBase');
  if (base) {
    const current = state.current;
    const all = [current, ...state.local.map(b => b.name).filter(n => n !== current)];
    base.innerHTML = all.map(n => `<option value="${n}" ${n === current ? 'selected' : ''}>${n}</option>`).join('');
  }

  const nameInput = document.getElementById('bmCreateName');
  const preview = document.getElementById('bmCreatePreview');
  let prefix = 'feature/';

  container.querySelector('#bmPrefixChips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.bm-prefix-chip');
    if (!chip) return;
    container.querySelectorAll('.bm-prefix-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    prefix = chip.dataset.prefix;
    setState({ createPrefix: prefix });
    updatePreview();
  });

  container.querySelector('#bmPrefixFree')?.addEventListener('input', (e) => {
    container.querySelectorAll('.bm-prefix-chip').forEach(c => c.classList.remove('active'));
    prefix = e.target.value;
    setState({ createPrefix: prefix });
    updatePreview();
  });

  nameInput?.addEventListener('input', () => {
    setState({ createName: nameInput.value });
    updatePreview();
  });

  function updatePreview() {
    const full = prefix + (nameInput?.value || '');
    if (preview) preview.textContent = full || 'feature/my-branch-name';
  }

  container.querySelector('#bmCreateSubmit')?.addEventListener('click', async () => {
    const name = (nameInput?.value || '').trim();
    const errorEl = document.getElementById('bmCreateError');
    if (!name) { if (errorEl) errorEl.textContent = 'Branch name is required'; return; }
    if (/[^a-zA-Z0-9_\/-]/.test(name)) { if (errorEl) errorEl.textContent = 'Only letters, numbers, hyphens, underscores and slashes allowed'; return; }
    const fullName = prefix + name;
    const baseBranch = base?.value || state.current;
    try {
      const r = await window.electronAPI.gitCreateBranch(state.repoPath, fullName, baseBranch);
      if (!r.success) { if (errorEl) errorEl.textContent = r.error; return; }
      setState({ createOpen: false, createName: '' });
      showRight('<div class="bm-empty">Select an action to view details</div>');
      await render();
      const toast = document.createElement('div');
      toast.className = 'bm-toast bm-toast-success';
      toast.textContent = '✓ Branch created and switched';
      (container.closest('.bm-panel-inline') || document.body).appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('bm-toast-show'));
      setTimeout(() => toast.remove(), 2500);
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message;
    }
  });

  container.querySelector('#bmCreateCancel')?.addEventListener('click', () => {
    setState({ createOpen: false, createName: '' });
    showRight('<div class="bm-empty">Select an action to view details</div>');
  });
}
