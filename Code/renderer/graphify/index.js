import { mount, unmount } from './graphifyUI.js';

let _container = null;

export function init(container) {
  _container = container;
  mount(container);
}

export function destroy() {
  unmount();
  if (_container) {
    _container.innerHTML = '';
    _container = null;
  }
}
