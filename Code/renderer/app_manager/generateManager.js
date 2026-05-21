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
const structureBtn       = document.getElementById('structureBtn');
const codeBtn            = document.getElementById('codeBtn');

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
        progressBar.value        = percent;
        progressText.textContent = `${percent}%`;
    });
}

// ── Action type buttons ───────────────────────────────────────────────────────

export function initActionButtons() {
    structureBtn.addEventListener('click', () => {
        state.actionType = 'structure';
        generateModeToggle.style.display = 'none';
        resetSelection();
        displayTree();
    });

    codeBtn.addEventListener('click', () => {
        state.actionType = 'code';
        generateModeToggle.style.display = '';
        resetSelection();
        displayTree();
    });
}

// ── Split mode (Normal / Minified) ────────────────────────────────────────────

export function initSplitModeButton() {
    generateModeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        generateSplitGroup.classList.toggle('menu-open');
    });

    document.addEventListener('click', (e) => {
        if (!generateSplitGroup.contains(e.target))
            generateSplitGroup.classList.remove('menu-open');
    });

    document.querySelectorAll('.generate-mode-item').forEach(item => {
        item.addEventListener('click', () => {
            const mode = item.dataset.mode;
            state.generateMinified = (mode === 'minified');
            generateModeLabel.textContent = state.generateMinified ? 'Minified' : 'Normal';
            document.querySelectorAll('.generate-mode-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            generateSplitGroup.dataset.mode = mode;
            generateSplitGroup.classList.remove('menu-open');
        });
    });
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

            const success = await window.electronAPI.generate(
                state.actionType,
                state.selectedRepoPath,
                state.selectedItems,
                filePath,
                state.actionType === 'code' ? state.generateMinified : false
            );

            if (!success) alert('Generation failed.');
            resetSelection();
            displayTree();
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
        updateGenerateState();
        displayTree();
    });
}