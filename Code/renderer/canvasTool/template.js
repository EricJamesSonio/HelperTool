export function getPanelTemplate() {
  return `
    <div class="canvas-panel" id="canvasPanel">
      <div class="canvas-navbar">
        <span class="canvas-title">🎨 Canvas</span>
        <span class="canvas-board-name" id="canvasBoardName">No board</span>
        <div class="canvas-navbar-right">
          <button class="canvas-btn canvas-btn-icon" id="canvasSaveBtn" title="Save">💾</button>
          <button class="canvas-btn canvas-btn-icon canvas-close-btn" id="canvasCloseBtn">✕</button>
        </div>
      </div>
      <div class="canvas-layout">
        <div class="canvas-toolbar" id="canvasToolbar">
          <div class="canvas-toolbar-group">
            <button class="canvas-tool-btn active" data-tool="select" title="Select (V)">⊹</button>
            <button class="canvas-tool-btn" data-tool="pen" title="Pen (P)">✎</button>
            <button class="canvas-tool-btn" data-tool="rect" title="Rectangle (R)">▭</button>
            <button class="canvas-tool-btn" data-tool="ellipse" title="Ellipse (E)">○</button>
            <button class="canvas-tool-btn" data-tool="line" title="Line (L)">╱</button>
            <button class="canvas-tool-btn" data-tool="arrow" title="Arrow (A)">→</button>
            <button class="canvas-tool-btn" data-tool="text" title="Text (T)">T</button>
            <button class="canvas-tool-btn canvas-tool-btn-shapes" id="canvasShapesBtn" title="Flowchart Shapes">◇</button>
            <div class="canvas-shapes-palette" id="canvasShapesPalette" style="display:none"></div>
            <button class="canvas-tool-btn" data-tool="pan" title="Pan (H)">✋</button>
          </div>
          <div class="canvas-toolbar-group">
            <label class="canvas-color-label" title="Stroke color">
              <input type="color" id="canvasStrokeColor" class="canvas-color-input" value="#ffffff" />
            </label>
            <label class="canvas-color-label" title="Fill color">
              <input type="color" id="canvasFillColor" class="canvas-color-input" value="#22d3ee" />
              <span class="canvas-color-label-text">fill</span>
            </label>
          </div>
          <div class="canvas-toolbar-group">
            <label class="canvas-label" title="Stroke width">
              <span class="canvas-label-text">W:</span>
              <input type="range" id="canvasStrokeWidth" class="canvas-range" min="1" max="12" value="2" />
            </label>
          </div>
          <div class="canvas-toolbar-group">
            <button class="canvas-btn canvas-btn-icon" id="canvasUndoBtn" title="Undo (Ctrl+Z)" disabled>↩</button>
            <button class="canvas-btn canvas-btn-icon" id="canvasRedoBtn" title="Redo (Ctrl+Shift+Z)" disabled>↪</button>
          </div>
          <div class="canvas-toolbar-group">
            <button class="canvas-btn canvas-btn-icon" id="canvasSnapToggle" title="Snap to grid (off)">⊞</button>
            <label class="canvas-label" title="Border radius">
              <span class="canvas-label-text">R:</span>
              <input type="range" id="canvasBorderRadius" class="canvas-range" min="0" max="40" value="0" />
            </label>
          </div>
          <div class="canvas-toolbar-group">
            <button class="canvas-btn" id="canvasClearBtn" title="Clear all">🗑️ Clear</button>
            <button class="canvas-btn" id="canvasResetViewBtn" title="Reset view">⊞ Reset View</button>
            <button class="canvas-btn" id="canvasFitBtn" title="Fit to screen (Ctrl+Shift+F)">⊡ Fit</button>
          </div>
          <div class="canvas-toolbar-group">
            <button class="canvas-btn canvas-btn-icon" id="canvasShortcutsBtn" title="Keyboard Shortcuts">⌨️</button>
            <span class="canvas-zoom-indicator" id="canvasZoomIndicator" title="Click to reset zoom">100%</span>
          </div>
        </div>
        <div class="canvas-main">
          <div class="canvas-sidebar" id="canvasSidebar">
            <div class="canvas-sidebar-header">
              <span class="canvas-sidebar-title">Boards</span>
              <button class="canvas-btn canvas-btn-small" id="canvasNewBoardBtn">+ New</button>
            </div>
            <div class="canvas-boards-list" id="canvasBoardsList">
              <div class="canvas-empty">No boards yet</div>
            </div>
          </div>
          <div class="canvas-viewport" id="canvasViewport">
            <canvas id="canvasElement"></canvas>
          </div>
          <div class="canvas-props-panel" id="canvasPropertiesPanel" style="display:none">
            <div class="canvas-props-header">Properties</div>
            <div class="canvas-props-body">
              <div class="cp-row cp-pos-fields">
                <label class="cp-label">X <input class="cp-prop cp-x" data-field="x" type="number" step="1" /></label>
                <label class="cp-label">Y <input class="cp-prop cp-y" data-field="y" type="number" step="1" /></label>
                <label class="cp-label">W <input class="cp-prop cp-w" data-field="w" type="number" step="1" /></label>
                <label class="cp-label">H <input class="cp-prop cp-h" data-field="h" type="number" step="1" /></label>
              </div>
              <div class="cp-row cp-startend-fields" style="display:none">
                <label class="cp-label">SX <input class="cp-prop cp-start-x" data-field="startX" type="number" step="1" /></label>
                <label class="cp-label">SY <input class="cp-prop cp-start-y" data-field="startY" type="number" step="1" /></label>
                <label class="cp-label">EX <input class="cp-prop cp-end-x" data-field="endX" type="number" step="1" /></label>
                <label class="cp-label">EY <input class="cp-prop cp-end-y" data-field="endY" type="number" step="1" /></label>
              </div>
              <div class="cp-row">
                <label class="cp-label cp-color-label">Stroke <input class="cp-color cp-stroke" data-field="stroke" type="color" /></label>
                <label class="cp-label cp-color-label">Fill <input class="cp-color cp-fill" data-field="fill" type="color" /></label>
              </div>
              <div class="cp-row">
                <label class="cp-label">Width <input class="cp-prop cp-sw" data-field="strokeWidth" type="number" min="1" max="12" step="1" /></label>
                <label class="cp-label cp-br-label">Radius <input class="cp-prop cp-br" data-field="borderRadius" type="number" min="0" max="40" step="1" /></label>
              </div>
              <div class="cp-row cp-fontsize-row" style="display:none">
                <label class="cp-label">Font Size <input class="cp-prop cp-fontsize" data-field="fontSize" type="number" min="8" max="120" step="1" /></label>
              </div>
            </div>
          </div>
      </div>
    </div>

    <div class="canvas-modal-overlay" id="canvasTemplateModal" style="display:none">
      <div class="canvas-modal">
        <div class="canvas-modal-header">
          <span class="canvas-modal-title">New Board</span>
          <button class="canvas-btn canvas-btn-icon canvas-modal-close-btn" id="canvasTemplateModalClose">✕</button>
        </div>
        <div class="canvas-modal-body">
          <div class="canvas-form-row">
            <label class="canvas-form-label">Name</label>
            <input type="text" id="canvasNewBoardName" class="canvas-input" placeholder="My Diagram" value="Untitled" />
          </div>
          <div class="canvas-form-row">
            <label class="canvas-form-label">Template</label>
            <div class="canvas-templates" id="canvasTemplates"></div>
          </div>
        </div>
        <div class="canvas-modal-footer">
          <button class="canvas-btn" id="canvasCreateBoardBtn">Create Board</button>
        </div>
      </div>
    </div>
  `;
}

export function getTemplateCardHtml(templates) {
  return templates.map(t => `
    <div class="canvas-template-card" data-template="${t.id}">
      <div class="canvas-template-preview canvas-template-${t.id}">
        <div class="canvas-template-placeholder"></div>
      </div>
      <div class="canvas-template-name">${t.name}</div>
    </div>
  `).join('');
}

export function getShapesPaletteHtml(shapes) {
  return shapes.map(s => `
    <div class="canvas-shape-item" data-shape="${s.id}">
      <span class="canvas-shape-icon">${shapeIcon(s.id)}</span>
      <div class="canvas-shape-info">
        <span class="canvas-shape-name">${s.name}</span>
        <span class="canvas-shape-desc">${s.desc}</span>
      </div>
    </div>
  `).join('');
}

function shapeIcon(id) {
  const icons = {
    rect: '\u25AD', terminator: '\u2B58', diamond: '\u25C7',
    parallelogram: '\u25B1', circle: '\u25CB', 'double-rect': '\u25AD\u25AD',
    arrow: '\u2192',
  };
  return icons[id] || '\u25AD';
}

export function getBoardItemHtml(board, active) {
  return `
    <div class="canvas-board-item ${active ? 'active' : ''}" data-board-id="${board.id}">
      <span class="canvas-board-item-name">${escapeHtml(board.name)}</span>
      <span class="canvas-board-item-date">${formatDate(board.updated_at)}</span>
      <button class="canvas-board-item-del" title="Delete board">✕</button>
    </div>
  `;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
  return d.toLocaleDateString();
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}
