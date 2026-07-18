import McpUI from './mcpUI.js';

let _instance = null;

export function activate(container) {
  if (_instance) return;
  _instance = new McpUI();
  _instance.init(container);
}

export function deactivate() {
  if (!_instance) return;
  _instance.destroy();
  _instance = null;
}

export function show() {
  _instance?.open();
}

export function hide() {
  _instance?.close();
}

export function isOpen() {
  return _instance?.isOpen() ?? false;
}

export function toggle() {
  if (!_instance) return;
  if (_instance.isOpen()) {
    _instance.close();
  } else {
    _instance.open();
  }
}
