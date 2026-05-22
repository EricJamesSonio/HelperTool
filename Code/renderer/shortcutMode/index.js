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

export function initShortcutMode() {
  const shortcutModeBtn = document.getElementById('shortcutModeBtn');
  const shortcutInputCloseBtn = document.getElementById('shortcutInputCloseBtn');
  const shortcutProcessBtn = document.getElementById('shortcutProcessBtn');
  const shortcutCancelBtn = document.getElementById('shortcutCancelBtn');
  const shortcutResultsCloseBtn = document.getElementById('shortcutResultsCloseBtn');
  const shortcutResultsCloseBtn2 = document.getElementById('shortcutResultsCloseBtn2');

  function showError(msg) {
    const el = document.getElementById('shortcutInputError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
  function hideError() {
    const el = document.getElementById('shortcutInputError');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  shortcutModeBtn.addEventListener('click', () => {
    openShortcutInputModal();
    hideError();
  });

  shortcutInputCloseBtn.addEventListener('click', () => { hideError(); closeShortcutInputModal(); });
  shortcutCancelBtn.addEventListener('click', () => { hideError(); closeShortcutInputModal(); });

  getShortcutInputTextarea().addEventListener('input', hideError);

  shortcutProcessBtn.addEventListener('click', () => {
    hideError();
    const inputText = getShortcutInputTextarea().value.trim();
    if (!inputText) {
      showError('Please paste some content first');
      return;
    }

    const result = processShortcutInput(inputText);

    if (result.success) {
      closeShortcutInputModal();
      openShortcutResultsModal(result);
    } else {
      showError(result.message);
    }
  });

  shortcutResultsCloseBtn.addEventListener('click', closeShortcutResultsModal);
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
