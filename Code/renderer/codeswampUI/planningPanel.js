import { state } from './state.js';
import { loadAll } from '../workspace/workspaceStore.js';
import { getProjectByRepoPath } from '../workspace/projectManager.js';

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _preview(s, max = 180) {
  if (!s) return '';
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + '…';
}

export async function openPlanningPanel(targetTextareaId) {
  const inputId = targetTextareaId || 'ocInput';
  const existing = document.getElementById('ocPlanningPanelModal');
  if (existing) existing.remove();

  const repoPath = state.activeTab;
  if (!repoPath) return;

  await loadAll();

  const project = getProjectByRepoPath(repoPath);
  if (!project) return;

  const notes = Array.isArray(project.planningNotes) ? project.planningNotes : [];

  const overlay = document.createElement('div');
  overlay.id = 'ocPlanningPanelModal';
  overlay.className = 'oc-ppn-overlay';
  document.body.appendChild(overlay);

  const modal = document.createElement('div');
  modal.className = 'oc-ppn-modal';
  overlay.appendChild(modal);

  function close() { overlay.remove(); }
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const kbHandler = (e) => {
    if (e.key === 'Escape' && document.getElementById('ocPlanningPanelModal')) {
      close();
      document.removeEventListener('keydown', kbHandler);
    }
  };
  document.addEventListener('keydown', kbHandler);

  function populateInput(text) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const existing = input.value.trim();
    input.value = existing ? existing + '\n' + text : text;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    input.selectionStart = input.selectionEnd = input.value.length;
    input.focus();
    close();
  }

  modal.innerHTML = `
    <div class="oc-ppn-header">
      <span class="oc-ppn-title">Plans — ${_esc(project.title)}</span>
      <span class="oc-ppn-count">${notes.length} note${notes.length !== 1 ? 's' : ''}</span>
      <button class="oc-ppn-close" id="ocPpnClose">✕</button>
    </div>
    <div class="oc-ppn-body" id="ocPpnBody">
      ${notes.length === 0 ? '<div class="oc-ppn-empty">No plans yet.</div>' : ''}
    </div>
  `;

  modal.querySelector('#ocPpnClose').addEventListener('click', close);

  if (!notes.length) return;

  const body = modal.querySelector('#ocPpnBody');

  notes.forEach(note => {
    const displayTitle = note.title || note.content?.split('\n')[0]?.trim() || 'Untitled';
    const contentPreview = note.content ? _preview(note.content) : '';

    const card = document.createElement('div');
    card.className = 'oc-ppn-card';
    card.innerHTML = `
      <div class="oc-ppn-card-title">${_esc(displayTitle)}</div>
      ${contentPreview ? `<div class="oc-ppn-card-preview">${_esc(contentPreview)}</div>` : ''}
    `;

    card.addEventListener('click', () => {
      const title = displayTitle;
      const bodyText = (note.content || '').trim();
      const text = bodyText ? `**${title}**\n${bodyText}` : `**${title}**`;
      populateInput(text);
    });

    body.appendChild(card);
  });
}
