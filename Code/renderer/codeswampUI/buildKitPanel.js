import { state } from './state.js';
import { loadAll } from '../workspace/workspaceStore.js';
import { getProjectByRepoPath } from '../workspace/projectManager.js';
import { getKitProgress, ensureDefaultKits } from '../workspace/buildKitManager.js';

const ICON_CHECKED = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4 4 8-8"/></svg>';
const ICON_EMPTY = '';

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _formatKitSummary(kit) {
  const { done, total } = getKitProgress(kit);
  const lines = [`**${kit.name}** (${done}/${total})`];
  function walk(items, indent) {
    for (const item of items) {
      const mark = item.checked ? '[✅]' : '[ ]';
      if (!item.children || item.children.length === 0) {
        lines.push(`${indent}- ${mark} ${item.name}`);
      } else {
        lines.push(`${indent}- ${mark} ${item.name}`);
        walk(item.children, indent + '  ');
      }
    }
  }
  walk(kit.items, '');
  return lines.join('\n');
}

function _formatItemDetail(kit, item) {
  const mark = item.checked ? '[✅]' : '[ ]';
  const lines = [`**${kit.name}** > ${item.name}`, `${mark} ${item.name}`];
  if (item.description) lines.push(`  ${item.description}`);
  if (item.details) lines.push(`  ${item.details}`);
  return lines.join('\n');
}

export async function openBuildKitPanel() {
  const existing = document.getElementById('ocBuildKitPanelModal');
  if (existing) existing.remove();

  const repoPath = state.activeTab;
  if (!repoPath) return;

  await loadAll();

  const project = getProjectByRepoPath(repoPath);
  if (!project) return;

  ensureDefaultKits(project);
  const kits = Array.isArray(project.buildKits) ? project.buildKits : [];

  const overlay = document.createElement('div');
  overlay.id = 'ocBuildKitPanelModal';
  overlay.className = 'oc-bkp-overlay';
  document.body.appendChild(overlay);

  const modal = document.createElement('div');
  modal.className = 'oc-bkp-modal';
  overlay.appendChild(modal);

  function close() { overlay.remove(); }
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const kbHandler = (e) => {
    if (e.key === 'Escape' && document.getElementById('ocBuildKitPanelModal')) {
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
    <div class="oc-bkp-header">
      <span class="oc-bkp-title">Build Kits — ${_esc(project.title)}</span>
      <span class="oc-bkp-count">${kits.length} kit${kits.length !== 1 ? 's' : ''}</span>
      <button class="oc-bkp-close" id="ocBkpClose">✕</button>
    </div>
    <div class="oc-bkp-body" id="ocBkpBody">
      ${kits.length === 0 ? '<div class="oc-bkp-empty">No build kits.</div>' : ''}
    </div>
  `;

  modal.querySelector('#ocBkpClose').addEventListener('click', close);

  if (!kits.length) return;

  const body = modal.querySelector('#ocBkpBody');

  kits.forEach(kit => {
    const { done, total } = getKitProgress(kit);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const color = kit.color || '#10b981';

    const kitCard = document.createElement('div');
    kitCard.className = 'oc-bkp-kit';
    kitCard.style.setProperty('--bkp-color', color);

    const header = document.createElement('div');
    header.className = 'oc-bkp-kit-header';
    header.innerHTML = `
      <div class="oc-bkp-kit-name">${_esc(kit.name)}</div>
      <div class="oc-bkp-kit-progress">
        <div class="oc-bkp-kit-track"><div class="oc-bkp-kit-bar" style="width:${pct}%"></div></div>
        <span class="oc-bkp-kit-frac">${done}/${total}</span>
        <span class="oc-bkp-kit-pct">${pct}%</span>
      </div>
    `;

    header.addEventListener('click', () => {
      const text = _formatKitSummary(kit);
      populateInput(text);
    });

    kitCard.appendChild(header);

    function renderItems(items) {
      for (const item of items) {
        const hasKids = item.children && item.children.length > 0;
        const itemRow = document.createElement('div');
        itemRow.className = 'oc-bkp-item' + (item.checked ? ' oc-bkp-item--done' : '');

        const check = document.createElement('span');
        check.className = 'oc-bkp-check';
        check.innerHTML = item.checked ? ICON_CHECKED : ICON_EMPTY;
        itemRow.appendChild(check);

        const label = document.createElement('span');
        label.className = 'oc-bkp-item-label';
        label.textContent = item.name;
        itemRow.appendChild(label);

        itemRow.addEventListener('click', () => {
          const text = _formatItemDetail(kit, item);
          populateInput(text);
        });

        kitCard.appendChild(itemRow);

        if (hasKids) {
          const childWrap = document.createElement('div');
          childWrap.className = 'oc-bkp-children';
          for (const child of item.children) {
            const childRow = document.createElement('div');
            childRow.className = 'oc-bkp-child' + (child.checked ? ' oc-bkp-child--done' : '');

            const ck = document.createElement('span');
            ck.className = 'oc-bkp-check oc-bkp-check--sm';
            ck.innerHTML = child.checked ? ICON_CHECKED : ICON_EMPTY;
            childRow.appendChild(ck);

            const cl = document.createElement('span');
            cl.textContent = child.name;
            childRow.appendChild(cl);

            childRow.addEventListener('click', (e) => {
              e.stopPropagation();
              const text = _formatItemDetail(kit, child);
              populateInput(text);
            });

            childWrap.appendChild(childRow);
          }
          kitCard.appendChild(childWrap);
        }
      }
    }

    renderItems(kit.items);
    body.appendChild(kitCard);
  });
}
