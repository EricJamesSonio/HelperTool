import { state } from './state.js';
import { renderFileListHTML } from './fileList.js';
import { renderEditorHTML } from './editor.js';
import { escHtml } from './utils.js';

const MAX_SECTIONS = 5;

export function renderAllPanels() {
  const container = document.getElementById('envPanels');
  if (!container) return;
  container.innerHTML = '';
  state.sections.forEach((sec, i) => container.appendChild(createPanel(i, sec)));
}

export function renderPanel(sectionIdx) {
  const sec = state.sections[sectionIdx];
  if (!sec) return;
  const old = document.querySelector(`.env-panel[data-section="${sectionIdx}"]`);
  if (!old) { renderAllPanels(); return; }
  const fresh = createPanel(sectionIdx, sec);
  old.replaceWith(fresh);
}

export function loadFileForSection(sectionIdx, fileName) {
  const sec = state.sections[sectionIdx];
  if (!sec || !fileName) return;
  sec.activeFile = fileName;
  sec.loading = true;
  sec.error = null;

  window.envAPI.readFile(state.repoPath, fileName).then(r => {
    if (r.success) {
      sec.entries = r.entries.map(e => ({ ...e, revealed: true }));
      sec.dirty = false;
    } else {
      sec.entries = [];
      sec.dirty = false;
      sec.error = r.error;
    }
    sec.loading = false;
    renderPanel(sectionIdx);
  }).catch(err => {
    sec.entries = [];
    sec.loading = false;
    sec.error = err.message;
    renderPanel(sectionIdx);
  });
}

export async function loadSectionFiles(idx) {
  const sec = state.sections[idx];
  if (!sec) return;
  try {
    if (sec.type === 'env') {
      const r = await window.envAPI.listFiles(state.repoPath);
      if (r.success) sec.files = r.files;
    } else {
      const r = await window.envAPI.listFilesByPattern(state.repoPath, sec.pattern);
      if (r.success) sec.files = r.files;
    }
  } catch {}
}

function createPanel(sectionIdx, sec) {
  const panel = document.createElement('div');
  panel.className = 'env-panel';
  panel.dataset.section = sectionIdx;
  panel.style.setProperty('--pt-color', sec.color);

  panel.innerHTML = `
    <div class="env-panel-header">
      <div class="env-panel-header-left">
        <span class="env-panel-label">${escHtml(sec.label)}</span>
        <span class="env-panel-pattern">${escHtml(sec.pattern)}</span>
      </div>
      <div class="env-panel-header-actions">
        <button class="env-btn env-btn-sm env-panel-new-btn" title="New file">+</button>
        ${state.sections.length > 1 ? '<button class="env-panel-del-btn" title="Delete section">&times;</button>' : ''}
      </div>
    </div>
    <div class="env-panel-body">
      <div class="env-panel-files">
        ${renderFileListHTML(sectionIdx, sec)}
      </div>
      <div class="env-panel-editor">
        ${renderEditorHTML(sectionIdx, sec)}
      </div>
    </div>
  `;
  return panel;
}
