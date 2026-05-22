import { S } from './state.js';
import { eventToString } from './parser.js';

let _initialized = false;

const _actions = {};

function registerAction(featureId, actionFn) {
  _actions[featureId] = actionFn;
}

function handleKeyDown(e) {
  if (document.querySelector('.shortcuts-modal-overlay.open')) return;
  const tag = document.activeElement ? document.activeElement.tagName : '';
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  if (document.activeElement && document.activeElement.getAttribute('contenteditable') === 'true') return;

  const combo = eventToString(e);
  if (!combo) return;

  for (const [featureId, shortcut] of Object.entries(S.shortcuts)) {
    if (!shortcut) continue;
    if (combo === shortcut && _actions[featureId]) {
      e.preventDefault();
      e.stopPropagation();
      _actions[featureId]();
      return;
    }
  }
}

function initListener() {
  if (_initialized) return;
  document.addEventListener('keydown', handleKeyDown);
  _initialized = true;
}

function destroyListener() {
  document.removeEventListener('keydown', handleKeyDown);
  _initialized = false;
}

export { initListener, destroyListener, registerAction };
