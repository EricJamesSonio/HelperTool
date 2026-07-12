/**
 * renderer/graphify.js
 * Top-level panel loader. Register this with your panelRegistry like the others.
 *
 * Example in panelRegistry.js:
 *   import * as graphify from '../graphify.js';
 *   registry.register('graphify', graphify);
 */

let _container   = null;
let _panel       = null;
let _initialized = false;

export async function activate(container) {
  _container = container;
  if (!_initialized) {
    const mod = await import('./graphify/index.js');
    _panel   = mod;
    _panel.init(container);
    _initialized = true;
  } else if (_panel) {
    _panel.showPanel();
  }
}

export function deactivate() {
  if (_panel) { _panel.destroy(); _panel = null; }
  _initialized = false;
  _container   = null;
}

export function show() {
  if (_panel) _panel.showPanel();
}

export function hide() {
  if (_panel) _panel.hidePanel();
}