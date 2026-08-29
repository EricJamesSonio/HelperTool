import { processShortcutInput } from './core.js';
import {
  openShortcutInputModal,
  closeShortcutInputModal,
  openShortcutResultsModal,
  closeShortcutResultsModal,
  getShortcutInputTextarea,
  shortcutInputModal,
  shortcutResultsModal,
} from './modal.js';

let _currentMode = 'find';

export function initShortcutMode() {
  const shortcutModeBtn        = document.getElementById('shortcutModeBtn');
  const shortcutInputCloseBtn  = document.getElementById('shortcutInputCloseBtn');
  const shortcutProcessBtn     = document.getElementById('shortcutProcessBtn');
  const shortcutCancelBtn      = document.getElementById('shortcutCancelBtn');
  const shortcutResultsCloseBtn  = document.getElementById('shortcutResultsCloseBtn');
  const shortcutResultsCloseBtn2 = document.getElementById('shortcutResultsCloseBtn2');
  const shortcutModeToggle     = document.getElementById('shortcutModeToggle');

  function showError(msg) {
    const el = document.getElementById('shortcutInputError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
  function hideError() {
    const el = document.getElementById('shortcutInputError');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  if (shortcutModeToggle) {
    shortcutModeToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.shortcut-mode-btn');
      if (!btn) return;
      shortcutModeToggle.querySelectorAll('.shortcut-mode-btn').forEach(b => b.classList.remove('shortcut-mode-btn--active'));
      btn.classList.add('shortcut-mode-btn--active');
      _currentMode = btn.dataset.mode;
      const processBtn = document.getElementById('shortcutProcessBtn');
      if (processBtn) {
        processBtn.textContent = _currentMode === 'remove' ? 'Find & Remove' : 'Process';
        processBtn.className = _currentMode === 'remove'
          ? 'modal-btn modal-btn-danger'
          : 'modal-btn modal-btn-primary';
      }
    });
  }

  shortcutModeBtn.addEventListener('click', () => {
    openShortcutInputModal();
    hideError();
  });

  shortcutInputCloseBtn.addEventListener('click', () => { hideError(); closeShortcutInputModal(); });
  shortcutCancelBtn.addEventListener('click',     () => { hideError(); closeShortcutInputModal(); });

  getShortcutInputTextarea().addEventListener('input', hideError);

  const EDIT_KEYS = new Set(['v', 'c', 'x', 'z', 'y', 'a']);
  getShortcutInputTextarea().addEventListener('keydown', (e) => {
    const isModified = e.ctrlKey || e.altKey || e.metaKey;
    if (isModified && e.key && EDIT_KEYS.has(e.key.toLowerCase())) return;
    if (isModified && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') {
      e.stopPropagation();
      getShortcutInputTextarea().blur();
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        bubbles: true,
        cancelable: true,
      }));
    }
  });

  shortcutProcessBtn.addEventListener('click', async () => {
    hideError();
    const inputText = getShortcutInputTextarea().value.trim();
    if (!inputText) {
      showError('Please paste some content first');
      return;
    }
    const result = await processShortcutInput(inputText, _currentMode);
    if (result.success) {
      closeShortcutInputModal();
      openShortcutResultsModal(result, _currentMode);
    } else {
      showError(result.message);
    }
  });

  shortcutResultsCloseBtn.addEventListener('click',  closeShortcutResultsModal);
  shortcutResultsCloseBtn2.addEventListener('click', closeShortcutResultsModal);

  shortcutInputModal.addEventListener('click', (e) => {
    if (e.target === shortcutInputModal) closeShortcutInputModal();
  });
  shortcutResultsModal.addEventListener('click', (e) => {
    if (e.target === shortcutResultsModal) closeShortcutResultsModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeShortcutInputModal();
      closeShortcutResultsModal();
    }
  });
}

export { processShortcutInput } from './core.js';
export {
  openShortcutInputModal,
  closeShortcutInputModal,
  openShortcutResultsModal,
  closeShortcutResultsModal,
} from './modal.js';