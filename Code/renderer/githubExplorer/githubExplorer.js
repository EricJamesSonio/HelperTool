import state from './githubState.js';
import { initUI, switchToTreeView } from './githubUI.js';
import { renderTree } from './githubTreeRenderer.js';

class GithubExplorer {
  constructor() {
    this.container = null;
    this._initialized = false;
  }

  init(container) {
    this.container = container;
    state.view = 'input';
    state.tree = [];
    state.builtTree = null;
    state.selectedPaths = new Set();
    state.expandedPaths = new Set();
    state.searchQuery = '';
    initUI(container);
    this._initialized = true;
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
    this._initialized = false;
  }

  refresh() {
    if (this._initialized && this.container) {
      if (state.view === 'input') {
        initUI(this.container);
      } else {
        switchToTreeView(this.container);
      }
    }
  }
}

export default GithubExplorer;
