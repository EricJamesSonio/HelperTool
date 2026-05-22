import { loadShortcuts } from './state.js';
import { initListener, registerAction } from './listener.js';
import { openConfig } from './ui.js';

function initShortcutManager(actions, enabledFeats) {
  loadShortcuts();
  for (const [id, fn] of Object.entries(actions)) {
    registerAction(id, fn);
  }
  initListener();
  _enabledFeats = enabledFeats || {};
}

let _enabledFeats = {};

function openConfigWithFeats() {
  openConfig(_enabledFeats);
}

export { initShortcutManager, openConfigWithFeats as openConfig };
