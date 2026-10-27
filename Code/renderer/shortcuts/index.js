import { loadShortcuts } from './state.js';
import { initListener, registerAction } from './listener.js';
import { openConfig, closeConfig, isConfigOpen } from './ui.js';

function initShortcutManager(actions, enabledFeats) {
  loadShortcuts();
  _enabledFeats = enabledFeats || {};
  for (const [id, fn] of Object.entries(actions)) {
    if (_enabledFeats[id] === false) continue;
    registerAction(id, fn);
  }
  initListener();
}

let _enabledFeats = {};

function openConfigWithFeats() {
  openConfig(_enabledFeats);
}

export { initShortcutManager, openConfigWithFeats as openConfig, closeConfig, isConfigOpen };