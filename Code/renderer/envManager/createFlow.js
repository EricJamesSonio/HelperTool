import { state, setState } from './state.js';
import { escHtml } from './utils.js';
import { loadFile } from './index.js';
import { renderFileList } from './fileList.js';

const PRESET_NAMES = ['.env', '.env.local', '.env.development', '.env.production', '.env.test', '.env.staging', '.env.sample', '.env.example'];

export function openCreateForm() {
  setState({ creating: true, error: null });
  const el = document.getElementById('envLeft');
  if (!el) return;

  let existing = el.querySelector('.env-create-form');
  if (existing) existing.remove();

  const form = document.createElement('div');
  form.className = 'env-create-form';
  form.innerHTML = `
    <div class="env-create-title">Create New Env File</div>
    <div class="env-create-presets" id="envCreatePresets">
      ${PRESET_NAMES.map(n => `<button class="env-btn env-btn-sm env-preset-btn" data-name="${escHtml(n)}">${escHtml(n)}</button>`).join('')}
      <button class="env-btn env-btn-sm env-preset-btn" data-name="custom">custom\u2026</button>
    </div>
    <div class="env-create-custom" id="envCreateCustom" style="display:none">
      <input class="env-create-input" id="envCreateInput" placeholder=".env.myfile" spellcheck="false">
    </div>
    ${state.error ? `<div class="env-editor-error">${escHtml(state.error)}</div>` : ''}
    <div class="env-create-actions">
      <button class="env-btn env-btn-primary env-btn-sm" id="envCreateSubmit">Create Blank</button>
      <button class="env-btn env-btn-sm" id="envCreateCancel">Cancel</button>
    </div>
  `;
  el.appendChild(form);

  document.getElementById('envCreateCancel')?.addEventListener('click', closeCreateForm);

  document.getElementById('envCreateSubmit')?.addEventListener('click', doCreate);

  document.querySelectorAll('.env-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.env-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const name = btn.dataset.name;
      if (name === 'custom') {
        document.getElementById('envCreateCustom').style.display = '';
        document.getElementById('envCreateInput')?.focus();
      } else {
        document.getElementById('envCreateCustom').style.display = 'none';
      }
    });
  });
}

export function closeCreateForm() {
  setState({ creating: false, error: null });
  const form = document.querySelector('.env-create-form');
  if (form) form.remove();
}

async function doCreate() {
  const activePreset = document.querySelector('.env-preset-btn.active');
  let fileName = activePreset?.dataset.name;
  if (fileName === 'custom' || !fileName) {
    const input = document.getElementById('envCreateInput');
    fileName = input?.value?.trim();
    if (!fileName.startsWith('.')) fileName = '.env.' + fileName;
  }
  if (!fileName || fileName === 'custom') {
    setState({ error: 'Please select or enter a file name' });
    openCreateForm();
    return;
  }

  try {
    const r = await window.envAPI.createFile(state.repoPath, fileName);
    if (r.success) {
      setState({ creating: false, error: null });
      const updated = [...state.files, fileName].sort((a, b) => {
        if (a.toLowerCase() === '.env') return -1; if (b.toLowerCase() === '.env') return 1;
        return a.localeCompare(b);
      });
      setState({ files: updated });
      renderFileList();
      loadFile(fileName);
    } else {
      setState({ error: r.error });
      openCreateForm();
    }
  } catch (err) {
    setState({ error: err.message });
    openCreateForm();
  }
}
