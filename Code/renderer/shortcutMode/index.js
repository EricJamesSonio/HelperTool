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

  shortcutModeBtn.addEventListener('click', () => {
    openShortcutInputModal();
  });

  shortcutInputCloseBtn.addEventListener('click', closeShortcutInputModal);
  shortcutCancelBtn.addEventListener('click', closeShortcutInputModal);

  shortcutProcessBtn.addEventListener('click', () => {
    const inputText = getShortcutInputTextarea().value.trim();
    if (!inputText) {
      alert('Please paste some content first');
      return;
    }

    const result = processShortcutInput(inputText);

    if (result.success) {
      closeShortcutInputModal();
      openShortcutResultsModal(result);
    } else {
      alert(result.message);
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
