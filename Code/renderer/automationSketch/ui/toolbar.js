export function renderToolbar(state) {
  return `<div class="as-toolbar">
    <button class="as-tb-btn" id="asBackBtn" title="Back to sketches">${ICONS.back}</button>
    <input class="as-tb-name" id="asSketchName" type="text" value="${escapeHtml(state.sketchName)}" />
    <div class="as-tb-spacer"></div>
    <button class="as-tb-btn" id="asUndoBtn" title="Undo (Ctrl+Z)" ${state.historyIndex < 0 ? 'disabled' : ''}>${ICONS.undo}</button>
    <button class="as-tb-btn" id="asRedoBtn" title="Redo (Ctrl+Shift+Z)" ${state.historyIndex >= state.history.length - 1 ? 'disabled' : ''}>${ICONS.redo}</button>
    <button class="as-tb-btn" id="asSaveBtn" title="Save (Ctrl+S)">${ICONS.save}</button>
    <div class="as-tb-sep"></div>
    <button class="as-tb-btn" id="asZoomOutBtn" title="Zoom out">${ICONS.zoomOut}</button>
    <span class="as-tb-zoom">${Math.round(state.viewport.scale * 100)}%</span>
    <button class="as-tb-btn" id="asZoomInBtn" title="Zoom in">${ICONS.zoomIn}</button>
    <button class="as-tb-btn" id="asZoomFitBtn" title="Fit to screen">${ICONS.zoomFit}</button>
    <div class="as-tb-sep"></div>
    <button class="as-tb-btn as-tb-btn--danger" id="asDelBtn" title="Delete sketch">${ICONS.trash}</button>
  </div>`;
}

export function bindToolbar(container, callbacks) {
  container.querySelector('#asBackBtn')?.addEventListener('click', () => callbacks.onBack?.());
  container.querySelector('#asSaveBtn')?.addEventListener('click', () => callbacks.onSave?.());
  container.querySelector('#asUndoBtn')?.addEventListener('click', () => callbacks.onUndo?.());
  container.querySelector('#asRedoBtn')?.addEventListener('click', () => callbacks.onRedo?.());
  container.querySelector('#asZoomInBtn')?.addEventListener('click', () => callbacks.onZoomIn?.());
  container.querySelector('#asZoomOutBtn')?.addEventListener('click', () => callbacks.onZoomOut?.());
  container.querySelector('#asZoomFitBtn')?.addEventListener('click', () => callbacks.onZoomFit?.());
  container.querySelector('#asDelBtn')?.addEventListener('click', () => callbacks.onDelete?.());

  const nameInput = container.querySelector('#asSketchName');
  if (nameInput) {
    nameInput.addEventListener('change', () => callbacks.onRename?.(nameInput.value));
    nameInput.addEventListener('blur', () => callbacks.onRename?.(nameInput.value));
  }
}

const ICONS = {
  back: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><polyline points="12,4 6,10 12,16"/></svg>',
  save: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M2 2h9l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M5 14V9h6v5M5 2v4h5"/></svg>',
  undo: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><polyline points="6,3 2,7 6,11"/><path d="M2 7h8a4 4 0 0 1 4 4v1"/></svg>',
  redo: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><polyline points="10,3 14,7 10,11"/><path d="M14 7H6a4 4 0 0 0-4 4v1"/></svg>',
  zoomIn: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><circle cx="7" cy="7" r="4"/><line x1="11" y1="11" x2="14" y2="14"/><line x1="7" y1="5" x2="7" y2="9"/><line x1="5" y1="7" x2="9" y2="7"/></svg>',
  zoomOut: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><circle cx="7" cy="7" r="4"/><line x1="11" y1="11" x2="14" y2="14"/><line x1="5" y1="7" x2="9" y2="7"/></svg>',
  zoomFit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg>',
  trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M2 4h12M5 4V2h6v2M3 4l1 10h8l1-10"/></svg>',
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
