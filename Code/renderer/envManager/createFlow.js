import { state } from './state.js';
import { escHtml } from './utils.js';
import { renderPanel, loadFileForSection } from './renderPanel.js';

const PRESET_NAMES = ['.env', '.env.local', '.env.development', '.env.production', '.env.test', '.env.staging', '.env.sample', '.env.example'];

export function openCreateForm(sectionIdx) {
  const panelEl = document.querySelector(`.env-panel[data-section="${sectionIdx}"]`);
  if (!panelEl) return;

  const existing = panelEl.querySelector('.env-create-form');
  if (existing) { existing.remove(); return; }

  const sec = state.sections[sectionIdx];
  const presets = (sec && sec.type === 'env') ? PRESET_NAMES : (sec ? [sec.pattern] : PRESET_NAMES);
  const isSingleFile = presets.length === 1;

  sec.creating = true;

  const form = document.createElement('div');
  form.className = 'env-create-form';
  form.innerHTML = `
    <div class="env-create-title">Create New File</div>
    <div class="env-create-presets">
      ${presets.map(n => `<button class="env-btn env-btn-sm env-preset-btn" data-name="${escHtml(n)}">${escHtml(n)}</button>`).join('')}
      ${isSingleFile ? '' : '<button class="env-btn env-btn-sm env-preset-btn" data-name="custom">custom...</button>'}
    </div>
    <div class="env-create-custom" style="display:none">
      <input class="env-create-input" placeholder="filename" spellcheck="false">
    </div>
    <div class="env-create-actions">
      <button class="env-btn env-btn-primary env-btn-sm env-create-submit" data-section="${sectionIdx}">Create</button>
      <button class="env-btn env-btn-sm env-create-cancel" data-section="${sectionIdx}">Cancel</button>
    </div>
  `;

  const bodyEl = panelEl.querySelector('.env-panel-body') || panelEl;
  bodyEl.prepend(form);

  form.querySelectorAll('.env-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.env-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const custom = form.querySelector('.env-create-custom');
      if (btn.dataset.name === 'custom') {
        custom.style.display = '';
        form.querySelector('.env-create-input')?.focus();
      } else {
        custom.style.display = 'none';
      }
    });
  });

  form.querySelector('.env-create-submit')?.addEventListener('click', () => doCreate(sectionIdx, form));
  form.querySelector('.env-create-cancel')?.addEventListener('click', () => { form.remove(); sec.creating = false; });
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter') doCreate(sectionIdx, form);
    if (e.key === 'Escape') { e.stopPropagation(); form.remove(); sec.creating = false; }
  });
}

async function doCreate(sectionIdx, form) {
  const sec = state.sections[sectionIdx];
  if (!sec) return;

  const activePreset = form.querySelector('.env-preset-btn.active');
  let fileName = activePreset?.dataset.name;
  if (fileName === 'custom' || !fileName) {
    const input = form.querySelector('.env-create-input');
    fileName = input?.value?.trim();
    if (!fileName) return;
  }

  try {
    const r = await window.envAPI.createFile(state.repoPath, fileName);
    if (r.success) {
      form.remove();
      sec.creating = false;
      sec.files = [...sec.files, fileName].sort((a, b) => {
        if (a.toLowerCase() === '.env') return -1; if (b.toLowerCase() === '.env') return 1;
        return a.localeCompare(b);
      });
      renderPanel(sectionIdx);
      loadFileForSection(sectionIdx, fileName);
    }
  } catch {}
}
