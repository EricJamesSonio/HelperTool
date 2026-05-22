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
  const shortcutModeBtn        = document.getElementById('shortcutModeBtn');
  const shortcutInputCloseBtn  = document.getElementById('shortcutInputCloseBtn');
  const shortcutProcessBtn     = document.getElementById('shortcutProcessBtn');
  const shortcutCancelBtn      = document.getElementById('shortcutCancelBtn');
  const shortcutResultsCloseBtn  = document.getElementById('shortcutResultsCloseBtn');
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
  shortcutCancelBtn.addEventListener('click',     () => { hideError(); closeShortcutInputModal(); });

  getShortcutInputTextarea().addEventListener('input', hideError);

  // When a key is pressed inside the textarea, check if it's a modifier+key
  // combo (i.e. a registered shortcut, not plain typing). If so, blur the
  // textarea immediately so the shortcuts/listener.js handler can receive it
  // without being blocked by the TEXTAREA focus guard.
  getShortcutInputTextarea().addEventListener('keydown', (e) => {
    const isModified = e.ctrlKey || e.altKey || e.metaKey;
    if (isModified && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') {
      e.stopPropagation(); // don't double-fire
      getShortcutInputTextarea().blur();
      // Re-dispatch so listener.js picks it up on the document
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