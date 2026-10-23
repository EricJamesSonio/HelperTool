// ===== File: Code\renderer\selectShortcuts\index.js =====
// Named "select shortcut" presets for the main file tree.
//
// A preset is a list of folders / files. Clicking its pill adds those paths
// to the current selection:
//   Code mode      -> the files below each target folder
//   Structure mode -> the target folders themselves

import { state } from '../app_manager/appState.js';
import { onSelectionChange, updateGenerateState } from '../app_manager/generateManager.js';
import { displayTree } from '../app_manager/viewManager.js';
import { getFlatList } from '../searchManager.js';
import { resolveTargets, selectPathsForMode } from './resolve.js';
import {
  openSelectShortcutConfig,
  renderSelectShortcutChips,
  showSelectToast,
} from './ui.js';

const norm = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();

let _bar = null;

/**
 * Apply a shortcut: resolve its targets and add them to the selection.
 */
export function applySelectShortcut(sc) {
  if (!sc) return;
  const flatList = getFlatList();
  if (!flatList || !flatList.length) {
    showSelectToast('No files loaded — open a repo first.', 'error');
    return;
  }

  const mode = state.actionType === 'structure' ? 'structure' : 'code';
  const result = resolveTargets(sc.targets, flatList, mode);
  const paths = selectPathsForMode(result, mode);

  const existing = new Set(state.selectedItems.map(norm));
  let added = 0;
  for (const p of paths) {
    const key = norm(p);
    if (existing.has(key)) continue;
    existing.add(key);
    state.selectedItems.push(p);
    added++;
  }

  if (added) {
    onSelectionChange();
    updateGenerateState();
    displayTree();
  }

  const label = mode === 'structure' ? 'folder(s)' : 'file(s)';
  if (result.missing.length) {
    showSelectToast(
      `"${sc.name}": +${added} ${label} — not found: ${result.missing.join(', ')}`,
      'error',
      4200,
    );
  } else if (added) {
    showSelectToast(`"${sc.name}": +${added} ${label} selected`);
  } else {
    showSelectToast(`"${sc.name}": already selected`, 'info');
  }
}

function refresh() {
  renderSelectShortcutChips(
    _bar,
    (sc) => applySelectShortcut(sc),
    (sc) => openSelectShortcutConfig(sc.id, refresh),
  );
}

/**
 * Wire the "Add shortcut to select" button and render the chip row.
 */
export function initSelectShortcuts() {
  _bar = document.getElementById('selectShortcutBar');

  const addBtn = document.getElementById('addSelectShortcutBtn');
  addBtn?.addEventListener('click', () => {
    openSelectShortcutConfig(null, refresh);
  });

  refresh();
}
