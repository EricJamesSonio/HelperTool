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
  if (_enabledFeats.flowTool !== false) registerAction('flowTool', toggleFlowTool);
  initListener();
}

function toggleFlowTool() {
  const panel = document.getElementById('ftPanel');
  const active = document.activeElement;
  const typing = panel && panel.classList.contains('open') && active && active !== document.body && panel.contains(active);
  if (typing) return;
  const item = document.querySelector('.tools-sidebar-item[data-tool="flow"]');
  if (item) item.click();
}

let _enabledFeats = {};

function openConfigWithFeats() {
  openConfig(_enabledFeats);
}

export { initShortcutManager, openConfigWithFeats as openConfig, closeConfig, isConfigOpen };