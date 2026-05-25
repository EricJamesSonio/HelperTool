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
            <button class="canvas-btn" id="canvasClearBtn" title="Clear all">🗑️ Clear</button>
            <button class="canvas-btn" id="canvasResetViewBtn" title="Reset view">⊞ Reset View</button>
          </div>
          <div class="canvas-toolbar-group">
            <button class="canvas-btn canvas-btn-icon" id="canvasShortcutsBtn" title="Keyboard Shortcuts">⌨️</button>
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
