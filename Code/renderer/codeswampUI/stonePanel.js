import { state } from './state.js';
import { loadAll } from '../workspace/workspaceStore.js';
import { getProjectByRepoPath } from '../workspace/projectManager.js';

const STONES = [
  { key: 'stoneCodeStandards',   label: 'Code Standards',       color: '#60a5fa', icon: '📐' },
  { key: 'stoneProjectOverview', label: 'Project Overview',     color: '#f87171', icon: '📋' },
  { key: 'stoneProgressTracker', label: 'Progress Tracker',     color: '#34d399', icon: '📊' },
  { key: 'stoneUIContext',       label: 'UI Context',           color: '#fbbf24', icon: '🎨' },
  { key: 'stoneArchitecture',    label: 'Architecture Context', color: '#c0c0c0', icon: '🏗️' },
  { key: 'stoneAIWorkflow',      label: 'AI Workflow Rules',    color: '#a78bfa', icon: '🤖' },
];

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _preview(s, max = 120) {
  if (!s) return '';
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + '…';
}

export async function openStonePanel() {
  const existing = document.getElementById('ocStonePanelModal');
  if (existing) existing.remove();

  const repoPath = state.activeTab;
  if (!repoPath) return;

  await loadAll();

  const project = getProjectByRepoPath(repoPath);
  if (!project) return;

  const overlay = document.createElement('div');
  overlay.id = 'ocStonePanelModal';
  overlay.className = 'oc-sp-overlay';
  document.body.appendChild(overlay);

  const modal = document.createElement('div');
  modal.className = 'oc-sp-modal';
  overlay.appendChild(modal);

  function close() { overlay.remove(); }
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const kbHandler = (e) => {
    if (e.key === 'Escape' && document.getElementById('ocStonePanelModal')) {
      close();
      document.removeEventListener('keydown', kbHandler);
    }
  };
  document.addEventListener('keydown', kbHandler);

  function populateInput(text) {
    const input = document.getElementById('ocInput');
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
    <div class="oc-sp-header">
      <span class="oc-sp-title">Infinity Stones — ${_esc(project.title)}</span>
      <button class="oc-sp-close" id="ocSpClose">✕</button>
    </div>
    <div class="oc-sp-body" id="ocSpBody">
      <div class="oc-sp-grid"></div>
    </div>
  `;

  modal.querySelector('#ocSpClose').addEventListener('click', close);

  const grid = modal.querySelector('.oc-sp-grid');

  STONES.forEach(stone => {
    const value = project[stone.key] || '';
    const empty = !value.trim();

    const card = document.createElement('div');
    card.className = 'oc-sp-card';
    card.style.setProperty('--sp-color', stone.color);
    card.innerHTML = `
      <div class="oc-sp-card-top">
        <span class="oc-sp-card-icon">${stone.icon}</span>
        <span class="oc-sp-card-label">${stone.label}</span>
        ${empty ? '' : `<span class="oc-sp-card-badge" style="background:${stone.color}22;color:${stone.color}">${value.trim().split(/\s+/).length} words</span>`}
      </div>
      <div class="oc-sp-card-preview ${empty ? 'oc-sp-empty' : ''}">${empty ? 'No context added yet…' : _esc(_preview(value))}</div>
    `;

    card.addEventListener('click', () => {
      const body = (project[stone.key] || '').trim();
      if (!body) return;
      const text = `**${stone.label}**\n${body}`;
      populateInput(text);
    });

    grid.appendChild(card);
  });
}
