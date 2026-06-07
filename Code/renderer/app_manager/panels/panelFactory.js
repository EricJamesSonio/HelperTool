/**
 * panelFactory.js
 * Single responsibility: creates slide-over panel DOM elements.
 * Each createXxxPanel() returns the panel element and appends it to body.
 */

export function createPanel({ id, className, title, containerId, closeBtnId }) {
  const panel = document.createElement('div');
  panel.id = id;
  panel.className = className;
  panel.innerHTML =
    `<div class="${className}-content">` +
      `<div class="${className}-navbar">` +
        `<h1 class="${className}-title">${title}</h1>` +
        `<div class="${className}-navbar-right">` +
          `<button class="${className}-close-btn" id="${closeBtnId}">✕</button>` +
        `</div>` +
      `</div>` +
      `<div class="${className}-body" id="${containerId}"></div>` +
    `</div>`;

  document.body.appendChild(panel);

  panel.querySelector('#' + closeBtnId).addEventListener('click', () => {
    panel.classList.remove('open');
  });

  panel.addEventListener('click', (e) => {
    if (e.target === panel) panel.classList.remove('open');
  });

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) panel.classList.remove('open');
  });

  return {
    panel,
    container: panel.querySelector('#' + containerId)
  };
}

export function createGitPanel() {
  return createPanel({
    id:          'gitToolPanel',
    className:   'git-tool-panel',
    title:       '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;vertical-align:middle;margin-right:6px"><circle cx="5" cy="4" r="2"/><circle cx="15" cy="16" r="2"/><path d="M5 6v8a4 4 0 0 0 4 4h6"/></svg> Git Tool',
    containerId: 'gitToolContainer',
    closeBtnId:  'closeGitToolBtn'
  });
}

export function createSymbolIndexPanel() {
  return createPanel({
    id:          'symbolIndexPanel',
    className:   'symbol-index-panel',
    title:       '\uD83D\uDD0D Symbol Index',
    containerId: 'symbolIndexContainer',
    closeBtnId:  'closeSymbolIndexBtn'
  });
}

export function createDepsPanel() {
  return createPanel({
    id:          'depsPanel',
    className:   'deps-panel',
    title:       '🔗 Dependencies',
    containerId: 'depsContainer',
    closeBtnId:  'closeDepsBtn'
  });
}

export function createLocPanel() {
  return createPanel({
    id:          'locDetectorPanel',
    className:   'loc-detector-panel',
    title:       '📏 LOC Detector',
    containerId: 'locDetectorContainer',
    closeBtnId:  'closeLocDetectorBtn'
  });
}