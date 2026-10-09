// ===== File: Code\renderer\githubExplorer\githubShortcut.js =====
// Shortcut (paste file list -> auto-select) for GitHub Explorer.
// Find-only: reuses pure matching logic from shortcutMode/core.js
// (extractPotentialFilenames + findBestMatch, same exact > suffix > name >
// fuzzy 0.75 priority as the main helper tool) but operates on
// githubState.selectedPaths instead of appState.selectedItems.

import { extractPotentialFilenames, findBestMatch } from '../shortcutMode/core.js';
import state from './githubState.js';
import { renderTree } from './githubTreeRenderer.js';

/** Adapt githubState.tree blobs to the flatList shape core.js expects. */
export function getGithubFlatList() {
  return state.tree
    .filter(i => i.type === 'blob')
    .map(i => ({
      name: i.path.split('/').pop(),
      displayPath: i.path,
      path: i.path,
      type: 'file',
    }));
}

export function unselectGithubFile(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  for (const p of state.selectedPaths) {
    if (p.replace(/\\/g, '/') === norm) {
      state.selectedPaths.delete(p);
      break;
    }
  }
  const container = document.querySelector('#geTreeContainer');
  if (container) renderTree(container);
}

/**
 * Find-only shortcut processing against the GitHub tree.
 * Mirrors the find branch of processShortcutInput but selects into
 * githubState.selectedPaths and re-renders the GE tree.
 */
export function processGithubShortcut(inputText) {
  const flatList = getGithubFlatList();
  if (!flatList || flatList.length === 0) {
    return { success: false, message: 'No files available — load a repository first' };
  }

  const potentialFiles = extractPotentialFilenames(inputText);
  if (potentialFiles.length === 0) {
    return { success: false, message: 'No filenames found in pasted content' };
  }

  const results = [];
  const newlySelected = [];
  const bestMatchByPath = new Map();
  const initiallySelectedPaths = new Set(
    Array.from(state.selectedPaths).map(p => p.replace(/\\/g, '/'))
  );
  const exactMatchedPaths = [];

  for (const potentialFile of potentialFiles) {
    if (exactMatchedPaths.some(p => p.endsWith('/' + potentialFile))) continue;

    const match = findBestMatch(potentialFile, flatList);

    if (match) {
      const normPath = match.node.path.replace(/\\/g, '/');
      if (match.similarity === 1) exactMatchedPaths.push(normPath);

      const existing = bestMatchByPath.get(normPath);
      if (existing && match.similarity <= existing.match.similarity) continue;

      if (!existing && !initiallySelectedPaths.has(normPath)) {
        state.selectedPaths.add(match.node.path);
        newlySelected.push(match.node);
      }

      bestMatchByPath.set(normPath, {
        result: {
          original: potentialFile,
          matched: match.node.name,
          path: match.node.displayPath,
          filePath: match.node.path,
          found: true,
          matchType: match.matchType,
          similarity: match.similarity,
          alreadySelected: initiallySelectedPaths.has(normPath),
        },
        match,
      });
    } else {
      results.push({
        original: potentialFile,
        matched: null,
        path: null,
        filePath: null,
        found: false,
        matchType: null,
        similarity: 0,
        alreadySelected: false,
      });
    }
  }

  for (const { result } of bestMatchByPath.values()) results.push(result);

  const foundResults = results.filter(r => r.found);
  const foundCount = foundResults.filter(r => !r.alreadySelected).length;
  const alreadySelectedCount = foundResults.filter(r => r.alreadySelected).length;
  const notFoundCount = results.filter(r => !r.found).length;

  if (newlySelected.length > 0) {
    const container = document.querySelector('#geTreeContainer');
    if (container) renderTree(container); // renderTree() also refreshes footer/buttons
  }

  return {
    success: true,
    results,
    summary: {
      total: results.length,
      newlySelected: foundCount,
      alreadySelected: alreadySelectedCount,
      notFound: notFoundCount,
    },
  };
}

// ── Modals (ge-scoped, find-only) ────────────────────────────────────────────

let _inputOverlay = null;
let _resultsOverlay = null;

function closeInput() {
  if (_inputOverlay) {
    if (_inputOverlay._keyHandler) document.removeEventListener('keydown', _inputOverlay._keyHandler);
    _inputOverlay.remove();
    _inputOverlay = null;
  }
}

function closeResults() {
  if (_resultsOverlay) {
    if (_resultsOverlay._keyHandler) document.removeEventListener('keydown', _resultsOverlay._keyHandler);
    _resultsOverlay.remove();
    _resultsOverlay = null;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Entry point called from githubUI toolbar button. */
export function openGithubShortcutModal() {
  closeResults();
  if (_inputOverlay) return;

  const overlay = document.createElement('div');
  overlay.className = 'ge-shortcut-overlay';
  overlay.innerHTML = `
    <div class="ge-shortcut-modal">
      <div class="ge-shortcut-header">
        <div class="ge-shortcut-title">⚡ Shortcut — paste file list to auto-select</div>
        <button class="ge-shortcut-close-btn" title="Close (Esc)">✕</button>
      </div>
      <div class="ge-shortcut-body">
        <div class="ge-shortcut-hint">Paste filenames, paths, or an AI prompt mentioning files. Fuzzy matching handles typos.</div>
        <textarea class="ge-shortcut-textarea" placeholder="e.g. src/App.tsx, utils/githubFetcher.js, package.json ..." spellcheck="false"></textarea>
        <div class="ge-shortcut-error" style="display:none"></div>
      </div>
      <div class="ge-shortcut-footer">
        <button class="ge-btn ge-shortcut-cancel-btn">Cancel</button>
        <button class="ge-btn ge-btn--primary ge-shortcut-process-btn">Find &amp; Select</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _inputOverlay = overlay;

  const textarea = overlay.querySelector('.ge-shortcut-textarea');
  const errorEl = overlay.querySelector('.ge-shortcut-error');
  const showError = (msg) => { errorEl.textContent = msg; errorEl.style.display = 'block'; };
  const hideError = () => { errorEl.textContent = ''; errorEl.style.display = 'none'; };

  textarea.focus();
  textarea.addEventListener('input', hideError);
  overlay.querySelector('.ge-shortcut-close-btn').addEventListener('click', closeInput);
  overlay.querySelector('.ge-shortcut-cancel-btn').addEventListener('click', closeInput);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeInput(); });

  const keyHandler = (e) => { if (e.key === 'Escape') closeInput(); };
  overlay._keyHandler = keyHandler;
  document.addEventListener('keydown', keyHandler);

  overlay.querySelector('.ge-shortcut-process-btn').addEventListener('click', () => {
    hideError();
    const text = textarea.value.trim();
    if (!text) { showError('Please paste some content first'); return; }
    const result = processGithubShortcut(text);
    if (result.success) {
      closeInput();
      openGithubShortcutResults(result);
    } else {
      showError(result.message);
    }
  });
}

function openGithubShortcutResults(result) {
  closeResults();
  const { total, newlySelected, alreadySelected, notFound } = result.summary;

  const overlay = document.createElement('div');
  overlay.className = 'ge-shortcut-overlay';
  overlay.innerHTML = `
    <div class="ge-shortcut-modal ge-shortcut-modal--results">
      <div class="ge-shortcut-header">
        <div class="ge-shortcut-title">⚡ Shortcut results</div>
        <button class="ge-shortcut-close-btn" title="Close (Esc)">✕</button>
      </div>
      <div class="ge-shortcut-body">
        <div class="ge-shortcut-summary">
          <strong>${total}</strong> filenames extracted from input<br>
          <span class="ge-shortcut-ok">✓ ${newlySelected} newly selected</span>
          ${alreadySelected > 0 ? `<span class="ge-shortcut-muted">• ${alreadySelected} already selected</span>` : ''}
          ${notFound > 0 ? `<span class="ge-shortcut-bad">• ${notFound} not found</span>` : ''}
        </div>
        <div class="ge-shortcut-hint">Selected files are checked in the tree — preview with Copy Folder Structure or generate with Copy File Contents.</div>
        <div class="ge-shortcut-list"></div>
      </div>
      <div class="ge-shortcut-footer">
        <button class="ge-btn ge-btn--primary ge-shortcut-done-btn">Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _resultsOverlay = overlay;

  const list = overlay.querySelector('.ge-shortcut-list');
  for (const r of result.results) {
    const item = document.createElement('div');
    item.className = `ge-shortcut-item ${r.found ? 'found' : 'not-found'}`;
    const icon = r.found ? '📄' : '❌';
    const status = r.found
      ? (r.alreadySelected ? 'Already selected' : `${r.matchType} (${Math.round(r.similarity * 100)}%)`)
      : 'Not found';
    const displayName = r.found ? (r.path || r.original) : r.original;

    if (r.found) {
      item.innerHTML = `
        <span class="ge-shortcut-item-icon">${icon}</span>
        <span class="ge-shortcut-item-name">${escapeHtml(displayName)}</span>
        <span class="ge-shortcut-item-status">${escapeHtml(status)}</span>
      `;
      item.title = `Searched: ${r.original}`;
      const unselectBtn = document.createElement('button');
      unselectBtn.className = 'ge-shortcut-unselect-btn';
      unselectBtn.textContent = '✖';
      unselectBtn.title = 'Remove from selection';
      unselectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        unselectGithubFile(r.filePath);
        item.classList.add('unselected');
        unselectBtn.disabled = true;
        item.querySelector('.ge-shortcut-item-status').textContent = 'Unselected';
      });
      item.appendChild(unselectBtn);
    } else {
      item.innerHTML = `
        <span class="ge-shortcut-item-icon">${icon}</span>
        <span class="ge-shortcut-item-name">${escapeHtml(displayName)}</span>
        <span class="ge-shortcut-item-status">Not found</span>
      `;
    }
    list.appendChild(item);
  }

  overlay.querySelector('.ge-shortcut-close-btn').addEventListener('click', closeResults);
  overlay.querySelector('.ge-shortcut-done-btn').addEventListener('click', closeResults);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeResults(); });

  const keyHandler = (e) => { if (e.key === 'Escape') closeResults(); };
  overlay._keyHandler = keyHandler;
  document.addEventListener('keydown', keyHandler);
}
