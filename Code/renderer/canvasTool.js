import * as engine from './canvasTool/engine.js';
import * as state from './canvasTool/state.js';
import * as boards from './canvasTool/boards.js';
import { getPanelTemplate, getTemplateCardHtml, getBoardItemHtml, getShapesPaletteHtml } from './canvasTool/template.js';
import {
  createPenTool, createRectTool, createEllipseTool,
  createLineTool, createArrowTool, createSelectTool,
  createTextTool, textWidth, textHeight,
  SHAPES, createShapeDrawTool, updateArrowBindings,
} from './canvasTool/tools.js';
import { S } from './shortcuts/state.js';
import { eventToString } from './shortcuts/parser.js';
import { confirmDialog, alertDialog } from './utils/confirmDialog.js';
import { loadCanvasShortcuts, getCanvasShortcut, getCanvasShortcuts, openCanvasShortcutConfig } from './canvasTool/shortcutConfig.js';

let _panel = null;
let _panelOpen = false;
let _currentRepoPath = null;
let _toolInstances = {};
let _listenersAttached = false;
let _captureKeyHandler = null;
let _textOverlay = null;
let _textCommitting = false;

export function initCanvasTool() {
  state.onChange(handleStateChange);
}

export function isCanvasPanelOpen() {
  return _panelOpen;
}

export function openCanvasPanel(repoPath) {
  if (_panelOpen) return;
  _currentRepoPath = repoPath;

  if (!_panel) {
    _panel = document.createElement('div');
    _panel.id = 'canvasPanelWrapper';
    _panel.innerHTML = getPanelTemplate();
    document.body.appendChild(_panel);
  }

  _panel.style.display = 'flex';
  _panelOpen = true;

  if (!_listenersAttached) {
    attachListeners();
    _listenersAttached = true;
  }

  const canvas = _panel.querySelector('#canvasElement');
  engine.init(canvas);

  engine.setActionCallback((result) => {
    if (result.action === 'place-text') {
      if (_textOverlay) {
        _textCommitting = true;
        commitTextOverlay().finally(() => { _textCommitting = false; });
        return;
      }
      if (_textCommitting) return;
      createTextOverlay(result.x, result.y, result.clientX, result.clientY);
    }
  });

  _toolInstances = {
    select: createSelectTool(),
    pen: createPenTool(),
    rect: createRectTool(),
    ellipse: createEllipseTool(),
    line: createLineTool(),
    arrow: createArrowTool(),
    text: createTextTool(),
  };
  loadCanvasShortcuts();
  activateTool('select');

  addKeyGuard();
  refreshBoardList();
  updateUI();
}

export async function closeCanvasPanel() {
  if (!_panelOpen) return;
  try {
    await boards.saveBoard();
  } catch (err) {
    console.error('[Canvas] Save on close failed:', err);
  }
  removeKeyGuard();
  removeTextOverlay();
  engine.destroy();
  _panel.style.display = 'none';
  _panelOpen = false;
}

function attachListeners() {
  _panel.querySelector('#canvasCloseBtn').addEventListener('click', closeCanvasPanel);

  _panel.querySelectorAll('.canvas-tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool === 'pan') {
        engine.setTool(null);
        engine.setActiveToolName('pan');
        _panel.querySelector('#canvasToolbar').dataset.activeTool = 'pan';
      } else {
        activateTool(tool);
      }
      updateToolbarUI();
    });
  });

  const strokeInput = _panel.querySelector('#canvasStrokeColor');
  strokeInput.addEventListener('input', () => {
    state.setState({ color: strokeInput.value });
  });

  const fillInput = _panel.querySelector('#canvasFillColor');
  fillInput.addEventListener('input', () => {
    state.setState({ fillColor: fillInput.value });
  });

  const widthInput = _panel.querySelector('#canvasStrokeWidth');
  widthInput.addEventListener('input', () => {
    state.setState({ strokeWidth: parseInt(widthInput.value, 10) });
  });

  _panel.querySelector('#canvasUndoBtn').addEventListener('click', () => {
    state.undo();
    boards.markDirty();
    updateUI();
  });
  _panel.querySelector('#canvasRedoBtn').addEventListener('click', () => {
    state.redo();
    boards.markDirty();
    updateUI();
  });

  _panel.querySelector('#canvasClearBtn').addEventListener('click', async () => {
    if (await confirmDialog('Clear all elements?')) {
      state.clear();
      boards.markDirty();
    }
  });

  _panel.querySelector('#canvasResetViewBtn').addEventListener('click', () => {
    engine.resetView();
  });

  _panel.querySelector('#canvasShortcutsBtn').addEventListener('click', () => {
    openCanvasShortcutConfig();
  });

  _panel.querySelector('#canvasSaveBtn').addEventListener('click', async () => {
    try {
      const result = await boards.saveBoard();
      if (result && !result.success) {
        console.error('[Canvas] Save failed:', result.error);
      }
    } catch (err) {
      console.error('[Canvas] Save error:', err);
    }
    updateUI();
  });

  _panel.querySelector('#canvasNewBoardBtn').addEventListener('click', showTemplateModal);
  _panel.querySelector('#canvasTemplateModalClose').addEventListener('click', hideTemplateModal);
  _panel.querySelector('#canvasTemplateModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideTemplateModal();
  });
  _panel.querySelector('#canvasCreateBoardBtn').addEventListener('click', handleCreateBoard);

  _panel.querySelector('#canvasBoardsList').addEventListener('click', handleBoardListClick);

  // Shapes palette toggle
  const shapesBtn = _panel.querySelector('#canvasShapesBtn');
  const palette = _panel.querySelector('#canvasShapesPalette');
  palette.innerHTML = getShapesPaletteHtml(SHAPES);
  shapesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    palette.style.display = palette.style.display === 'none' ? 'flex' : 'none';
  });
  // Shape item click → activate the tool
  palette.addEventListener('click', (e) => {
    const item = e.target.closest('.canvas-shape-item');
    if (!item) return;
    const shapeId = item.dataset.shape;
    palette.style.display = 'none';
    if (shapeId === 'arrow') {
      activateTool('arrow');
    } else if (shapeId === 'rect') {
      activateTool('rect');
    } else if (shapeId === 'ellipse') {
      activateTool('ellipse');
    } else {
      // Create or reuse shape tool instance
      if (!_toolInstances[shapeId]) {
        _toolInstances[shapeId] = createShapeDrawTool(shapeId);
      }
      activateTool(shapeId);
    }
    updateToolbarUI();
  });
  // Close palette on click outside
  document.addEventListener('pointerdown', (e) => {
    if (!_panelOpen) return;
    if (!palette.contains(e.target) && e.target !== shapesBtn) {
      palette.style.display = 'none';
    }
  }, { capture: true });

  // Click on overlay area commits text (only after overlay is ready)
  _panel.addEventListener('pointerdown', (e) => {
    if (_textOverlay && _textOverlay.dataset.ready && !_textOverlay.contains(e.target)) {
      commitTextOverlay();
    }
  });
}

// ── Shortcut combo → canvas tool name ──
function _shortcutToTool(combo) {
  if (!combo) return null;
  const sc = getCanvasShortcuts();
  const entries = [
    ['selectTool', 'select'],
    ['penTool', 'pen'],
    ['rectTool', 'rect'],
    ['ellipseTool', 'ellipse'],
    ['lineTool', 'line'],
    ['arrowTool', 'arrow'],
    ['textTool', 'text'],
    ['panTool', 'pan'],
    ['shapeTerminator', 'terminator'],
    ['shapeDiamond', 'diamond'],
    ['shapeParallelogram', 'parallelogram'],
    ['shapeDoubleRect', 'double-rect'],
    ['shapeCircle', 'circle'],
  ];
  for (const [featId, toolName] of entries) {
    if (sc[featId] === combo) return toolName;
  }
  return null;
}

// ── Capture-phase key guard: handles canvas keys, blocks other shortcuts ──
function addKeyGuard() {
  if (_captureKeyHandler) return;
  _captureKeyHandler = (e) => {
    if (!_panelOpen) return;
    // Allow typing in any input/textarea/contenteditable
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    // Allow key events when canvas shortcut config modal is open
    if (document.querySelector('.canvas-sc-overlay')) return;

    // Space + zoom keys
    if (e.code === 'Space' || ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-'))) {
      engine.onKeyDown(e);
      if (e.defaultPrevented) { e.stopPropagation(); return; }
    }

    // Tool shortcuts (from configurable shortcuts)
    const combo = eventToString(e);
    const toolName = _shortcutToTool(combo);
    if (toolName && toolName !== 'none') {
      e.preventDefault(); e.stopPropagation();
      if (toolName === 'pan') {
        engine.setTool(null);
        _panel.querySelector('#canvasToolbar').dataset.activeTool = 'pan';
      } else {
        activateTool(toolName);
      }
      updateToolbarUI();
      return;
    }

    // Hardcoded secondaries: Ctrl+T → activate text tool
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
      e.preventDefault(); e.stopPropagation();
      activateTool('text');
      updateToolbarUI();
      return;
    }

    // Undo/Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey) { state.redo(); } else { state.undo(); }
      boards.markDirty();
      updateUI();
      return;
    }

    // Delete / Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const st = state.getState();
      if (st.selectedIds.length > 0) {
        e.preventDefault(); e.stopPropagation();
        state.removeSelected();
        boards.markDirty();
      }
      return;
    }

    // Escape → close canvas
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeCanvasPanel();
      return;
    }

    // Check if key matches the canvas tool toggle shortcut → close canvas
    if (combo && S.shortcuts.canvasTool === combo) {
      e.preventDefault(); e.stopPropagation();
      closeCanvasPanel();
      return;
    }

    // Block all other keys from reaching other shortcut handlers
    e.stopPropagation();
  };
  document.addEventListener('keydown', _captureKeyHandler, true);
}

function removeKeyGuard() {
  if (_captureKeyHandler) {
    document.removeEventListener('keydown', _captureKeyHandler, true);
    _captureKeyHandler = null;
  }
}

// ── Text overlay for inline text input ──
function removeTextOverlay() {
  if (_textOverlay) {
    _textOverlay.remove();
    _textOverlay = null;
  }
}

async function commitTextOverlay() {
  if (!_textOverlay) return;
  const text = _textOverlay.querySelector('textarea')?.value || '';
  const worldX = parseFloat(_textOverlay.dataset.worldX);
  const worldY = parseFloat(_textOverlay.dataset.worldY);
  const color = _textOverlay.dataset.color || '#ffffff';
  const fontSize = parseInt(_textOverlay.dataset.fontSize, 10) || 20;
  removeTextOverlay();
  if (!text.trim()) return;

  // Check if text position is inside a shape
  const st = state.getState();
  let parentId = null;
  for (let i = st.elements.length - 1; i >= 0; i--) {
    const el = st.elements[i];
    if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'terminator' ||
        el.type === 'diamond' || el.type === 'parallelogram' || el.type === 'double-rect' || el.type === 'circle') {
      if (worldX >= el.x && worldX <= el.x + el.width && worldY >= el.y && worldY <= el.y + el.height) {
        // Ask user if they want the text to stick to this shape
        parentId = await confirmDialog(
          `Stick this text to "${el.type}" shape so it moves with it?`
        ) ? el.id : null;
        break;
      }
    }
  }

  state.addElement({
    id: 'el_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    type: 'text',
    x: worldX,
    y: worldY,
    text,
    fontSize,
    color,
    opacity: state.getState().opacity,
    parentId,
  });
  boards.markDirty();
}

function createTextOverlay(worldX, worldY, clientX, clientY) {
  removeTextOverlay();
  const vp = _panel.querySelector('#canvasViewport');
  const vpRect = vp.getBoundingClientRect();
  const relX = clientX - vpRect.left;
  const relY = clientY - vpRect.top;

  const overlay = document.createElement('div');
  overlay.className = 'canvas-text-overlay';
  overlay.dataset.worldX = worldX;
  overlay.dataset.worldY = worldY;
  overlay.dataset.color = state.getState().color;
  overlay.dataset.fontSize = '20';
  overlay.style.left = relX + 'px';
  overlay.style.top = relY + 'px';

  overlay.innerHTML = '<textarea class="canvas-text-input" rows="1" placeholder="Type..." spellcheck="false"></textarea>';
  _panel.querySelector('#canvasViewport').appendChild(overlay);
  _textOverlay = overlay;

  setTimeout(() => { overlay.dataset.ready = '1'; }, 0);

  const textarea = overlay.querySelector('textarea');
  textarea.focus();

  // Only Escape cancels — Enter inserts newline naturally
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      removeTextOverlay();
    }
  });

  // Auto-resize textarea
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
}

function activateTool(toolName) {
  const tool = _toolInstances[toolName];
  if (tool) {
    engine.setTool(tool);
    engine.setActiveToolName(toolName);
    _panel.querySelector('#canvasToolbar').dataset.activeTool = toolName;
  }
}

const PALETTE_SHAPES = new Set(['terminator', 'diamond', 'parallelogram', 'double-rect', 'circle']);

function updateToolbarUI() {
  const activeTool = _panel.querySelector('#canvasToolbar').dataset.activeTool || 'select';
  const shapesBtn = _panel.querySelector('#canvasShapesBtn');
  _panel.querySelectorAll('.canvas-tool-btn').forEach(btn => {
    const isPaletteShape = PALETTE_SHAPES.has(btn.dataset.tool);
    if (isPaletteShape) {
      // These shapes appear in the palette not as individual buttons
      btn.classList.remove('active');
    } else {
      btn.classList.toggle('active', btn.dataset.tool === activeTool);
    }
  });
  // Highlight shapes button when a palette shape is active
  if (shapesBtn) {
    const isPaletteActive = PALETTE_SHAPES.has(activeTool);
    shapesBtn.classList.toggle('active', isPaletteActive);
  }
}

function showTemplateModal() {
  const modal = _panel.querySelector('#canvasTemplateModal');
  const container = _panel.querySelector('#canvasTemplates');
  container.innerHTML = getTemplateCardHtml([
    { id: 'blank', name: 'Blank Canvas' },
    { id: 'flowchart', name: 'Flowchart' },
    { id: 'mindmap', name: 'Mind Map' },
    { id: 'arch', name: 'Architecture Diagram' },
  ]);
  container.querySelectorAll('.canvas-template-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.canvas-template-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
  // Select first by default
  const first = container.querySelector('.canvas-template-card');
  if (first) first.classList.add('selected');
  modal.style.display = 'flex';
}

function hideTemplateModal() {
  _panel.querySelector('#canvasTemplateModal').style.display = 'none';
}

async function handleCreateBoard() {
  const nameInput = _panel.querySelector('#canvasNewBoardName');
  const name = nameInput.value.trim() || 'Untitled';
  const selected = _panel.querySelector('.canvas-template-card.selected');
  const templateId = selected ? selected.dataset.template : 'blank';

  try {
    await boards.createBoard(_currentRepoPath, name, templateId);
    hideTemplateModal();
    updateUI();
    await refreshBoardList();
  } catch (err) {
    alertDialog('Failed to create board: ' + err.message);
  }
}

async function refreshBoardList() {
  if (!_currentRepoPath) return;
  try {
    const boardList = await boards.listBoards(_currentRepoPath);
    const container = _panel.querySelector('#canvasBoardsList');
    const currentId = boards.getCurrentBoardId();
    if (boardList.length === 0) {
      container.innerHTML = '<div class="canvas-empty">No boards yet</div>';
    } else {
      container.innerHTML = boardList.map(b => getBoardItemHtml(b, b.id === currentId)).join('');
    }
  } catch (err) {
    console.error('[Canvas] Failed to list boards:', err);
  }
}

async function handleBoardListClick(e) {
  const item = e.target.closest('.canvas-board-item');
  const delBtn = e.target.closest('.canvas-board-item-del');

  if (delBtn && item) {
    e.stopPropagation();
    const boardId = item.dataset.boardId;
    const name = item.querySelector('.canvas-board-item-name')?.textContent || '';
      if (await confirmDialog(`Delete board "${name}"?`)) {
        boards.deleteBoard(boardId);
        await refreshBoardList();
      }
    return;
  }

  if (item) {
    const boardId = item.dataset.boardId;
    loadBoardById(boardId);
  }
}

async function loadBoardById(boardId) {
  try {
    await boards.loadBoard(boardId);
    const st = state.getState();
    updateArrowBindings(st);
    updateUI();
    await refreshBoardList();
  } catch (err) {
    alertDialog('Failed to load board: ' + err.message);
  }
}

function handleStateChange() {
  updateUI();
  boards.markDirty();
}

function updateUI() {
  if (!_panel) return;
  const st = state.getState();
  const nameEl = _panel.querySelector('#canvasBoardName');
  if (nameEl) {
    nameEl.textContent = boards.getCurrentBoardId()
      ? (st.currentBoard?.name || 'Board loaded')
      : 'No board';
  }

  const undoBtn = _panel.querySelector('#canvasUndoBtn');
  const redoBtn = _panel.querySelector('#canvasRedoBtn');
  if (undoBtn) undoBtn.disabled = !state.canUndo();
  if (redoBtn) redoBtn.disabled = !state.canRedo();

  updateToolbarUI();
}
