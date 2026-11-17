import * as deployPanel from './deployPanel.js';
import * as branchManager from './branchManager.js';
import * as inspectPanel from './inspectPanel.js';

const ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15a4 4 0 0 1-.6-7.9A5 5 0 0 1 15 8.5a3.3 3.3 0 0 1-.5 6.5H6z"/><path d="M10 13V9"/><path d="m8 11 2-2 2 2"/></svg>';

function mountTab(ui) {
  const nav = ui.container ? ui.container.querySelector('#gitNav') : null;
  if (!nav || nav.querySelector('[data-view="deploy"]')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'git-nav-tab';
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-selected', 'false');
  btn.tabIndex = -1;
  btn.dataset.view = 'deploy';
  btn.title = 'Open your hosting dashboards: frontend, backend, database and images';
  btn.innerHTML = '<span class="git-nav-icon">' + ICON + '</span><span class="git-nav-label">Deploy</span>';
  nav.appendChild(btn);
}

function enterDeploy(ui) {
  const body = ui.container ? ui.container.querySelector('.git-content') : null;
  if (!body || ui._view === 'deploy') return;
  const previous = ui._view;
  if (previous === 'branches') {
    if (branchManager.isOpen()) {
      ui._suppressClose = true;
      try {
        branchManager.close();
      } finally {
        ui._suppressClose = false;
      }
    }
  } else if (previous === 'inspect') {
    inspectPanel.close();
  } else if (previous === 'git') {
    ui._savedForm = ui._captureFormState();
    ui._savedContent = body.innerHTML;
  }
  ui._view = 'deploy';
  deployPanel.open(body, ui.gitHandler.repoPath);
  ui._syncNav();
}

export function installDeployTab(GitToolUI) {
  const proto = GitToolUI.prototype;
  if (proto.__deployTab) return;
  proto.__deployTab = true;

  const baseRender = proto.render;
  proto.render = async function render(containerElement) {
    await baseRender.call(this, containerElement);
    mountTab(this);
    this._syncNav();
  };

  const baseSetView = proto.setView;
  proto.setView = function setView(view) {
    if (!this.container) return undefined;
    if (view === 'deploy') {
      enterDeploy(this);
      return undefined;
    }
    if (this._view === 'deploy') deployPanel.close();
    return baseSetView.call(this, view);
  };

  const baseReset = proto._resetViews;
  proto._resetViews = function resetViews() {
    if (deployPanel.isOpen()) deployPanel.close();
    return baseReset.call(this);
  };
}