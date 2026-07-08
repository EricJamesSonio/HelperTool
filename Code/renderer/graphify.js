/**
 * renderer/graphify.js
 * Top-level panel loader. Register this with your panelRegistry like the others.
 *
 * Example in panelRegistry.js:
 *   import * as graphify from '../graphify.js';
 *   registry.register('graphify', graphify);
 */

let _container = null;
let _panel     = null;

export async function activate(container) {
  _container = container;
  const mod  = await import('./graphify/index.js');
  _panel     = mod;
  _panel.init(container);
}

export function deactivate() {
  if (_panel) _panel.destroy();
  _panel     = null;
  _container = null;
}