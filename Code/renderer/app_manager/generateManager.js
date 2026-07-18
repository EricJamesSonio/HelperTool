/**
 * generateManager.js
 * Owns: generate button, split-mode button, selection counter, clear selection.
 */

import { state }       from './appState.js';
import { displayTree } from './viewManager.js';


const generateBtn        = document.getElementById('generateBtn');
const generateSplitGroup = document.getElementById('generateSplitGroup');
const generateModeToggle = document.getElementById('generateModeToggle');
const generateModeLabel  = document.getElementById('generateModeLabel');
const selectionCount     = document.getElementById('selectionCount');
const clearSelectionBtn  = document.getElementById('clearSelectionBtn');
const progressBar        = document.getElementById('progressBar');
const progressText       = document.getElementById('progressText');
const generatorModeToggleBtn = document.getElementById('generatorModeToggleBtn');
const generatorModeLabel   = document.getElementById('generatorModeLabel');

generateBtn.disabled = true;

// ── Debounced last-selected persistence ───────────────────────────────────────

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const debouncedSetLastSelected = debounce(
    (items) => window.electronAPI.setLastSelected(items),
    500
);

// ── Selection state ───────────────────────────────────────────────────────────

export function updateSelectionCounter() {
    const count = state.selectedItems.length;
    selectionCount.textContent = count;
    selectionCount.parentElement.classList.toggle('has-selections', count > 0);
}

export function updateGenerateState() {
    generateBtn.disabled = state.selectedItems.length === 0;
    updateSelectionCounter();
}

export function resetSelection() {
    state.selectedItems.length = 0;
    window.electronAPI.setLastSelected([]);
    updateGenerateState();
}

// Called by viewManager's onTreeSelectionChange
export function onSelectionChange() {
    updateGenerateState();
    debouncedSetLastSelected(state.selectedItems);
}

// ── Progress ──────────────────────────────────────────────────────────────────

export function initProgress() {
    window.electronAPI.onProgressUpdate(percent => {
        const p = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
        progressBar.value        = p;
        progressText.textContent = `${p}%`;
    });
}

// ── Action type buttons ───────────────────────────────────────────────────────

function updateModeForActionType() {
    const isCode = state.actionType === 'code';
    generateModeToggle.style.display = '';
    const minifiedItem = document.querySelector('.generate-mode-item[data-mode="minified"]');
    if (minifiedItem) {
        minifiedItem.style.display = isCode ? '' : 'none';
    }
    if (!isCode && state.generateOutputType === 'minified') {
        const normalItem = document.querySelector('.generate-mode-item[data-mode="normal"]');
        if (normalItem) normalItem.click();
    }
}

function updateGeneratorModeButton() {
    generatorModeLabel.textContent = state.actionType === 'code' ? 'Code' : 'Structure';
}

export function initActionButtons() {
    // Set initial mode to 'code' if not already set
    if (!state.actionType || state.actionType === 'structure') {
        state.actionType = 'code';
    }
    updateGeneratorModeButton(); // Update button label on initialization

    generatorModeToggleBtn.addEventListener('click', () => {
        state.actionType = (state.actionType === 'code') ? 'structure' : 'code';
        updateModeForActionType(); // Handles minified output visibility based on new actionType
        updateGeneratorModeButton(); // Update the button text
        resetSelection();
        displayTree(true); // Explicitly reset scroll on toggle
    });
}


// ── Split mode (Normal / Minified) ────────────────────────────────────────────

let _splitModeClickHandler = null;

export function initSplitModeButton() {
    generateModeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        generateSplitGroup.classList.toggle('menu-open');
    });

    if (_splitModeClickHandler) destroySplitModeButton();
    _splitModeClickHandler = (e) => {
        if (generateSplitGroup && !generateSplitGroup.contains(e.target))
            generateSplitGroup.classList.remove('menu-open');
    };
    document.addEventListener('click', _splitModeClickHandler);
}

export function destroySplitModeButton() {
    if (_splitModeClickHandler) {
        document.removeEventListener('click', _splitModeClickHandler);
        _splitModeClickHandler = null;
    }
}

export function initModeItems() {
    document.querySelectorAll('.generate-mode-item').forEach(item => {
        item.addEventListener('click', async () => {
            const mode = item.dataset.mode;
            state.generateOutputType = mode;
            state.generateMinified = (mode === 'minified');

            generateModeLabel.textContent = mode === 'prompt' ? 'Prompt' : state.generateMinified ? 'Minified' : 'Normal';

            document.querySelectorAll('.generate-mode-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            generateSplitGroup.dataset.mode = mode;
            generateSplitGroup.classList.remove('menu-open');

            if (mode === 'prompt') {
                try {
                    const m = await import('../promptTool.js');
                    if (m.openPromptSelectionModal) await m.openPromptSelectionModal();
                } catch (err) {
                    console.error('[Prompt] failed to open prompt selection:', err);
                    alert('Failed to open prompt picker. Check console for details.');
                }
            }
        });
    });
}

// ── Generated content viewer ──────────────────────────────────────────────────

let _viewerOverlay = null;

export function showGeneratedViewer(content, filePath) {
  closeGeneratedViewer();

  const overlay = document.createElement('div');
  overlay.className = 'gen-viewer-overlay';
  overlay.innerHTML = `
    <div class="gen-viewer">
      <div class="gen-viewer-header">
        <span class="gen-viewer-title">${escapeHtml(filePath || 'Generated Output')}</span>
        <div class="gen-viewer-actions">
          <button class="gen-viewer-btn gen-viewer-copy-btn" title="Copy all content">Copy</button>
          <button class="gen-viewer-btn gen-viewer-close-btn" title="Close (Esc)">✕</button>
        </div>
      </div>
      <div class="gen-viewer-body">
        <textarea class="gen-viewer-content" readonly spellcheck="false" wrap="off"></textarea>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  _viewerOverlay = overlay;

  const textarea = overlay.querySelector('.gen-viewer-content');
  textarea.value = content;

  requestAnimationFrame(() => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });

  // Copy button
  overlay.querySelector('.gen-viewer-copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(content);
      const btn = overlay.querySelector('.gen-viewer-copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    } catch {
      textarea.select();
      document.execCommand('copy');
    }
  });

  // Close button
  overlay.querySelector('.gen-viewer-close-btn').addEventListener('click', closeGeneratedViewer);

  // Escape key
  const keyHandler = (e) => {
    if (e.key === 'Escape') { closeGeneratedViewer(); }
  };
  overlay._keyHandler = keyHandler;
  document.addEventListener('keydown', keyHandler);

  // Click backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeGeneratedViewer();
  });
}

export function closeGeneratedViewer() {
  if (_viewerOverlay) {
    if (_viewerOverlay._keyHandler) {
      document.removeEventListener('keydown', _viewerOverlay._keyHandler);
    }
    _viewerOverlay.remove();
    _viewerOverlay = null;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Generate button ───────────────────────────────────────────────────────────

export function initGenerateButton() {


    generateBtn.addEventListener('click', async () => {


        try {
            if (!state.selectedRepoPath || !state.selectedItems.length)
                return alert('Select repo and items first!');

            const { filePath } = await window.electronAPI.saveFileDialog(state.actionType);
            if (!filePath) return;

            progressBar.value        = 0;
            progressText.textContent = '0%';

            const result = await window.electronAPI.generate(
                state.actionType,
                state.selectedRepoPath,
                state.selectedItems,
                filePath,
                state.actionType === 'code' ? state.generateMinified : false,
                state.selectedPromptText || ''
            );

            if (result && result.success && result.content) {
                showGeneratedViewer(result.content, result.filePath);
            } else if (!result || !result.success) {
                alert('Generation failed.');
            }
            resetSelection();
            displayTree(false);
        } catch (err) {
            console.error('[Generate] Failed:', err);
            alert('Generation failed.');
        }
    });
}

// ── Clear selection button ────────────────────────────────────────────────────

export function initClearSelectionButton() {
    clearSelectionBtn.addEventListener('click', () => {
        state.selectedItems.length = 0;
        window.electronAPI.setLastSelected([]);

        state.selectedPromptText = '';
        state.selectedPromptId   = null;
        state.selectedPromptIds  = [];
        updateGenerateState();
        displayTree(false);
    });
}