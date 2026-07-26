import { state } from './state.js';
import { loadAll } from '../workspace/workspaceStore.js';
import { getProjectByRepoPath } from '../workspace/projectManager.js';
import { getKitProgress, ensureDefaultKits, isItemChecked, getItemPrompt, getStageMeta } from '../workspace/buildKitManager.js';

const ICON_CHECK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4 4 8-8"/></svg>';

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
  if (item.stage) {
    const meta = getStageMeta(item.stage);
    if (meta) lines.push(`  Stage: ${meta.label.toUpperCase()} — ${meta.desc}`);
  }
  if (item.details) lines.push(`  ${item.details}`);
  lines.push('');
  lines.push(getItemPrompt(item));
  return lines.join('\n');
}

export async function openBuildKitPanel(targetTextareaId) {
  const inputId = targetTextareaId || 'ocInput';
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

  let allDone = 0; let allTotal = 0;
  for (const kit of kits) {
    const { done, total } = getKitProgress(kit);
    allDone += done; allTotal += total;
  }

  modal.innerHTML = `
    <div class="oc-bkp-header">
      <span class="oc-bkp-title">Build Kits — ${_esc(project.title)}</span>
      <span class="oc-bkp-count">${allDone}/${allTotal}</span>
      <span class="oc-bkp-pct">${allTotal > 0 ? Math.round((allDone / allTotal) * 100) : 0}%</span>
      <button class="oc-bkp-close" id="ocBkpClose">✕</button>
    </div>
    <div class="oc-bkp-body" id="ocBkpBody">
      ${kits.length === 0 ? '<div class="oc-bkp-empty">No build kits.</div>' : ''}
    </div>
  `;

  modal.querySelector('#ocBkpClose').addEventListener('click', close);

  if (!kits.length) return;

  const body = modal.querySelector('#ocBkpBody');

  for (const kit of kits) {
    const { done, total } = getKitProgress(kit);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const color = kit.color || '#10b981';

    const row = document.createElement('div');
    row.className = 'oc-bkp-flow-row';
    row.style.setProperty('--bkp-color', color);

    // ── Left: parent box ──
    const parent = document.createElement('div');
    parent.className = 'oc-bkp-flow-parent';
    parent.innerHTML = `
      <div class="oc-bkp-flow-parent-name">${_esc(kit.name)}</div>
      <div class="oc-bkp-flow-parent-desc">${_esc(kit.description || '')}</div>
      <div class="oc-bkp-flow-parent-progress">
        <div class="oc-bkp-progress-track"><div class="oc-bkp-progress-bar" style="width:${pct}%"></div></div>
        <span class="oc-bkp-progress-label">${done}/${total}</span>
      </div>
    `;
    parent.addEventListener('click', () => populateInput(_formatKitSummary(kit)));
    row.appendChild(parent);

    // ── Connector ──
    const connector = document.createElement('div');
    connector.className = 'oc-bkp-flow-connector';
    row.appendChild(connector);

    // ── Right: items grid ──
    const grid = document.createElement('div');
    grid.className = 'oc-bkp-flow-items';

    for (const item of kit.items) {
      const checked = isItemChecked(item);
      const hasKids = item.children && item.children.length > 0;
      const allChecked = hasKids && item.children.every(c => isItemChecked(c));
      const partial = hasKids && !allChecked && item.children.some(c => isItemChecked(c));

      const card = document.createElement('div');
      card.className = 'oc-bkp-flow-card' + (checked ? ' oc-bkp-flow-card--done' : '');

      // ── Top row ──
      const top = document.createElement('div');
      top.className = 'oc-bkp-flow-card-top';
      top.innerHTML = `
        <span class="oc-bkp-card-check">${checked || allChecked ? ICON_CHECK : partial ? ICON_CHECK.replace('M4 10l4 4 8-8', 'M5 10h10') : ''}</span>
        <span class="oc-bkp-card-name">${_esc(item.name)}</span>
      `;
      top.addEventListener('click', () => {
        const text = _formatItemDetail(kit, item);
        populateInput(text);
      });
      card.appendChild(top);

      // ── Description ──
      if (item.description) {
        const desc = document.createElement('div');
        desc.className = 'oc-bkp-card-desc';
        desc.textContent = item.description;
        card.appendChild(desc);
      }

      // ── Children pills ──
      if (hasKids) {
        const pills = document.createElement('div');
        pills.className = 'oc-bkp-flow-pills';
        for (const child of item.children) {
          const pill = document.createElement('span');
          pill.className = 'oc-bkp-flow-pill' + (child.checked ? ' oc-bkp-flow-pill--done' : '');
          pill.innerHTML = `${child.checked ? ICON_CHECK : ''} ${_esc(child.name)}`;
          pill.addEventListener('click', (e) => {
            e.stopPropagation();
            const text = _formatItemDetail(kit, child);
            populateInput(text);
          });
          pills.appendChild(pill);
        }
        card.appendChild(pills);
      }

      grid.appendChild(card);
    }

    row.appendChild(grid);
    body.appendChild(row);
  }
}
