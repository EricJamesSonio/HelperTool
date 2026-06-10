import { state, setState } from './state.js';
import { getCreateForm } from './template.js';
import { slideIn } from './animations.js';
import { render } from './list.js';

export function open() {
  setState({ createOpen: true, createPrefix: 'feature/', createName: '' });
  const el = document.getElementById('bmCreateForm');
  if (!el) return;
  el.innerHTML = getCreateForm();
  el.style.display = '';
  slideIn(el);

  const base = document.getElementById('bmCreateBase');
  if (base) {
    const current = state.current;
    const all = [current, ...state.local.map(b => b.name).filter(n => n !== current)];
    base.innerHTML = all.map(n => `<option value="${n}" ${n === current ? 'selected' : ''}>${n}</option>`).join('');
  }

  const nameInput = document.getElementById('bmCreateName');
  const preview = document.getElementById('bmCreatePreview');
  let prefix = 'feature/';

  document.getElementById('bmPrefixChips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.bm-prefix-chip');
    if (!chip) return;
    document.querySelectorAll('.bm-prefix-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    prefix = chip.dataset.prefix;
    setState({ createPrefix: prefix });
    updatePreview();
  });

  document.getElementById('bmPrefixFree')?.addEventListener('input', (e) => {
    document.querySelectorAll('.bm-prefix-chip').forEach(c => c.classList.remove('active'));
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

  document.getElementById('bmCreateSubmit')?.addEventListener('click', async () => {
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
      el.style.display = 'none';
      await render();
      const panel = document.getElementById('bmPanel');
      const toast = document.createElement('div');
      toast.className = 'bm-toast bm-toast-success';
      toast.textContent = '✓ Branch created and switched';
      panel.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('bm-toast-show'));
      setTimeout(() => toast.remove(), 2500);
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message;
    }
  });

  document.getElementById('bmCreateCancel')?.addEventListener('click', () => {
    setState({ createOpen: false, createName: '' });
    el.style.display = 'none';
    el.innerHTML = '';
  });
}
