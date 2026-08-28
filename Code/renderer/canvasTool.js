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
let _clipboard = null;

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
  // apply theme to panel
  const stTheme = state.getState().theme || 'light';
  _panel.dataset.theme = stTheme;
  const cp = _panel.querySelector('#canvasPanel');
  if (cp) cp.dataset.theme = stTheme;

  if (!_listenersAttached) {
    attachListeners();
    _listenersAttached = true;
  }

  const canvas = _panel.querySelector('#canvasElement');
  engine.init(canvas);

  engine.setZoomChangeCallback((zoom) => {
    updateZoomIndicator(zoom);
  });

  engine.setActionCallback((result) => {
    if (result.action === 'place-text') {
      if (_textOverlay) {
        _textCommitting = true;
        commitTextOverlay().finally(() => { _textCommitting = false; });
        return;
      }
      if (_textCommitting) return;
      createTextOverlay(result.x, result.y, result.clientX, result.clientY);
    } else if (result.action === 'edit-text') {
      if (_textOverlay) {
        _textCommitting = true;
        commitTextOverlay().finally(() => { _textCommitting = false; });
        return;
      }
      const el = result.element;
      const vp = _panel.querySelector('#canvasViewport');
      const vpRect = vp.getBoundingClientRect();
      const rawClientX = el.x * result.viewport.zoom + result.viewport.x + vpRect.left;
      const rawClientY = el.y * result.viewport.zoom + result.viewport.y + vpRect.top;
      createTextOverlay(el.x, el.y, rawClientX, rawClientY, el.text, el.fontSize || 20);
    } else if (result.action === 'marquee') {
      engine.setMarqueeRect(result.rect);
    } else if (result.action === 'marquee-end') {
      engine.setMarqueeRect(null);
      updateUI();
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

  // Fit to screen button
  const fitBtn = _panel.querySelector('#canvasFitBtn');
  if (fitBtn) {
    fitBtn.addEventListener('click', () => {
      engine.fitToScreen();
    });
  }

  // Zoom indicator reset on click (reset zoom)
  const zoomInd = _panel.querySelector('#canvasZoomIndicator');
  if (zoomInd) {
    zoomInd.addEventListener('click', () => {
      engine.resetView();
    });
  }

  // Snap-to-grid toggle
  const snapBtn = _panel.querySelector('#canvasSnapToggle');
  if (snapBtn) {
    snapBtn.addEventListener('click', () => {
      const st = state.getState();
      state.setState({ snapToGrid: !st.snapToGrid });
      updateUI();
    });
  }

  // Border radius slider
  const brRange = _panel.querySelector('#canvasBorderRadius');
  if (brRange) {
    brRange.addEventListener('input', () => {
      state.setState({ borderRadius: parseInt(brRange.value, 10) });
    });
  }

  // Theme toggle (light/dark — excalidraw is light by default)
  const themeBtn = _panel.querySelector('#canvasThemeToggle');
  if (themeBtn) {
    const applyTheme = () => {
      const st = state.getState();
      const isLight = st.theme === 'light';
      themeBtn.textContent = isLight ? '🌙' : '☀️';
      themeBtn.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
      document.getElementById('canvasPanel').dataset.theme = st.theme;
      _panel.dataset.theme = st.theme;
    };
    applyTheme();
    themeBtn.addEventListener('click', () => {
      const st = state.getState();
      const next = st.theme === 'light' ? 'dark' : 'light';
      state.setState({ theme: next });
      if (next === 'light') state.setState({ color: '#1e1e1e', fillColor: 'transparent' });
      else state.setState({ color: '#ffffff', fillColor: 'transparent' });
      applyTheme();
    });
  }

  // Rough toggle (hand-drawn)
  const roughBtn = _panel.querySelector('#canvasRoughToggle');
  if (roughBtn) {
    const syncRough = () => {
      const r = state.getState().roughness;
      roughBtn.classList.toggle('active', r !== 0);
      roughBtn.title = r !== 0 ? 'Hand-drawn on' : 'Hand-drawn off';
    };
    syncRough();
    roughBtn.addEventListener('click', () => {
      const cur = state.getState().roughness;
      state.setState({ roughness: cur === 0 ? 1 : 0 });
      syncRough();
    });
  }

  // Properties panel event delegation
  const propsPanel = _panel.querySelector('#canvasPropertiesPanel');
  if (propsPanel) {
    let _propUndoPushed = false;
    propsPanel.addEventListener('change', (e) => {
      const target = e.target;
      if (target.classList.contains('cp-prop') || target.classList.contains('cp-color')) {
        if (!_propUndoPushed) { state.pushUndo(); _propUndoPushed = true; }
        handlePropertyChange(target.dataset.field, target.value);
      }
    });
    propsPanel.addEventListener('focusout', () => { _propUndoPushed = false; });
  }

  // Also handle fitToScreen shortcut in key guard: Ctrl+Shift+F
  // (handled in addKeyGuard)
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

    // Fit to screen Ctrl+Shift+F
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault(); e.stopPropagation();
      engine.fitToScreen();
      return;
    }

    // Copy / Paste
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault(); e.stopPropagation();
      _copySelected();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault(); e.stopPropagation();
      _pasteClipboard();
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

function showCanvasToast(msg, type = 'warn') {
  let el = document.getElementById('canvasToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'canvasToast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100000;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.3);transition:opacity 0.2s;pointer-events:none;max-width:90vw;text-align:center;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = type === 'error' ? 'rgba(248,81,73,0.95)' : type === 'warn' ? 'rgba(251,146,60,0.95)' : 'rgba(34,211,238,0.95)';
  el.style.color = '#fff';
  el.style.border = '1px solid rgba(255,255,255,0.15)';
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2600);
}

async function commitTextOverlay() {
  if (!_textOverlay) return;
  const textarea = _textOverlay.querySelector('textarea');
  const text = textarea?.value || '';
  // Use exact stored world position — do not recompute from DOM, keeps 1:1
  let worldX = parseFloat(_textOverlay.dataset.worldX);
  let worldY = parseFloat(_textOverlay.dataset.worldY);
  const color = _textOverlay.dataset.color || (state.getState().theme === 'light' ? '#1e1e1e' : '#ffffff');
  const fontSize = parseInt(_textOverlay.dataset.fontSize, 10) || 20;
  const parentIdRaw = _textOverlay.dataset.parentId || null;
  removeTextOverlay();
  if (!text.trim()) return;

  // Determine parent shape (use stored or recompute)
  const st = state.getState();
  let parentId = parentIdRaw;
  let parentEl = parentId ? st.elements.find(e => e.id === parentId) : null;
  if (!parentEl) {
    for (let i = st.elements.length - 1; i >= 0; i--) {
      const el = st.elements[i];
      if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'terminator' ||
          el.type === 'diamond' || el.type === 'parallelogram' || el.type === 'double-rect' || el.type === 'circle') {
        if (worldX >= el.x && worldX <= el.x + el.width && worldY >= el.y && worldY <= el.y + el.height) {
          parentId = el.id;
          parentEl = el;
          break;
        }
      }
    }
  }

  // If inside shape, check overflow — prevent text going out
  if (parentEl) {
    const pad = 8;
    const availW = Math.max(20, parentEl.x + parentEl.width - pad - worldX);
    const availH = Math.max(20, parentEl.y + parentEl.height - pad - worldY);
    // measure required height using same logic as engine wrap
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${fontSize}px 'Segoe UI', sans-serif`;
    // replicate wrapTextToWidth
    const maxWidth = availW;
    const paragraphs = text.split('\n');
    let lineCount = 0;
    for (const para of paragraphs) {
      if (!para) { lineCount++; continue; }
      const words = para.split(' ');
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) { lineCount++; line = word; } else line = test;
      }
      if (line) lineCount++;
    }
    const neededH = lineCount * fontSize * 1.2;
    if (neededH > availH + 1) {
      showCanvasToast('No more room inside shape — expand the shape or shorten text', 'warn');
      // still create but clamp? we allow but warn; user can expand
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
    align: 'left',
    opacity: state.getState().opacity,
    parentId,
  });
  boards.markDirty();
}

function createTextOverlay(worldX, worldY, clientX, clientY, existingText, existingFontSize) {
  removeTextOverlay();

  const overlay = document.createElement('div');
  overlay.className = 'canvas-text-overlay';
  overlay.dataset.worldX = worldX;
  overlay.dataset.worldY = worldY;
  const stCol = state.getState();
  overlay.dataset.color = stCol.color || (stCol.theme === 'light' ? '#1e1e1e' : '#ffffff');
  overlay.dataset.fontSize = String(existingFontSize || stCol.fontSize || 20);

  const vp = _panel.querySelector('#canvasViewport');
  const vpRect = vp.getBoundingClientRect();
  const v0 = engine.getViewport();
  const zoom = v0.zoom || 1;
  // Exact screen position for 1:1 with canvas
  overlay.style.left = (clientX - vpRect.left) + 'px';
  overlay.style.top = (clientY - vpRect.top) + 'px';

  // Detect parent shape and constrain width/height, store parentId
  const st2 = state.getState();
  let parentId = null;
  for (let i = st2.elements.length - 1; i >= 0; i--) {
    const el = st2.elements[i];
    if ((el.type === 'rect' || el.type === 'ellipse' || el.type === 'terminator' ||
         el.type === 'diamond' || el.type === 'parallelogram' || el.type === 'double-rect' || el.type === 'circle') &&
        worldX >= el.x && worldX <= el.x + el.width && worldY >= el.y && worldY <= el.y + el.height) {
      const pad = 12;
      const v = engine.getViewport();
      const z = v.zoom || 1;
      // Full inner width like Excalidraw — text is centered/padded inside shape, not just from click to edge
      // Keep click x/y for anchor, but allow wrapping within shape's inner width
      const innerW = Math.max(60, (el.width - pad * 2) * z);
      // If click is more than pad from left, keep overlay at click but expand to fill shape if needed
      const clickOffsetPx = (worldX - (el.x + pad)) * z;
      // Use the larger of remaining-to-right and inner width so initial typing isn't tiny
      const remainingPx = (el.x + el.width - pad - worldX) * z;
      overlay.style.width = Math.max(120, Math.min(innerW, Math.max(remainingPx, innerW * 0.6))) + 'px';
      // Don't clip horizontally — only limit height, let textarea wrap
      overlay.style.maxHeight = ((el.y + el.height - pad - worldY) * z) + 'px';
      overlay.style.overflow = 'visible';
      parentId = el.id;
      break;
    }
  }
  if (parentId) overlay.dataset.parentId = parentId;

  const isLight = st2.theme === 'light';
  const displayFontPx = Math.round((parseInt(overlay.dataset.fontSize, 10) || 20) * zoom);
  // textarea fills overlay width exactly — prevents "ing the followi" clipping
  overlay.innerHTML = `<textarea class="canvas-text-input" rows="1" placeholder="Type..." spellcheck="false" style="color:${overlay.dataset.color};font-size:${displayFontPx}px;line-height:1.2;width:100%;box-sizing:border-box;overflow-wrap:anywhere;word-break:break-word"></textarea>`;
  // pass theme to overlay for CSS
  overlay.dataset.theme = isLight ? 'light' : 'dark';
  _panel.querySelector('#canvasViewport').appendChild(overlay);
  _textOverlay = overlay;

  if (existingText) {
    const textarea = overlay.querySelector('textarea');
    textarea.value = existingText;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  setTimeout(() => { overlay.dataset.ready = '1'; }, 0);

  const textarea = overlay.querySelector('textarea');
  textarea.focus();
  if (existingText) {
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  // Only Escape cancels — Enter inserts newline naturally; live overflow check
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      removeTextOverlay();
    }
  });

  // Auto-resize with overflow guard
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    if (parentId) {
      const parentEl = state.getState().elements.find(e => e.id === parentId);
      if (parentEl) {
        const v = engine.getViewport();
        const maxHpx = (parentEl.y + parentEl.height - 8 - worldY) * v.zoom;
        if (textarea.scrollHeight > maxHpx + 2) {
          showCanvasToast('No more room — expand the shape', 'warn');
          // cap height and allow scroll
          textarea.style.overflowY = 'auto';
        } else {
          textarea.style.overflowY = 'hidden';
        }
      }
    }
  });
}

// ── Copy / Paste ───────────────────────────────────────────────────────────────

function _copySelected() {
  const st = state.getState();
  if (st.selectedIds.length === 0) return;
  const selected = st.elements.filter(e => st.selectedIds.includes(e.id));
  // Include child text elements of selected shapes
  const childTexts = st.elements.filter(e =>
    e.type === 'text' && e.parentId &&
    st.selectedIds.includes(e.parentId) && !st.selectedIds.includes(e.id)
  );
  const all = [...selected, ...childTexts];
  // Deduplicate by id (in case a text element was already selected)
  const seen = new Set();
  _clipboard = [];
  for (const el of all) {
    if (!seen.has(el.id)) { seen.add(el.id); _clipboard.push(JSON.parse(JSON.stringify(el))); }
  }
}

function _pasteClipboard() {
  if (!_clipboard || _clipboard.length === 0) return;

  const idMap = {};
  const now = Date.now();
  const newElements = _clipboard.map(el => {
    const newId = 'el_' + now + '_' + Math.random().toString(36).slice(2, 8);
    idMap[el.id] = newId;
    const copy = JSON.parse(JSON.stringify(el));
    copy.id = newId;
    return copy;
  });

  const OFFSET = 30;
  newElements.forEach(el => {
    if (el.x !== undefined) el.x += OFFSET;
    if (el.y !== undefined) el.y += OFFSET;
    if (el.parentId && idMap[el.parentId]) {
      el.parentId = idMap[el.parentId];
    }
  });

  state.pushAndApply(() => {
    const st = state.getState();
    newElements.forEach(el => st.elements.push(el));
    st.selectedIds = newElements.map(e => e.id);
  });
  boards.markDirty();
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
    const { getPrefetchCache } = await import('./app_manager/prefetchManager.js');
    let boardList = getPrefetchCache().get('canvasBoards');
    if (!boardList) {
      boardList = await boards.listBoards(_currentRepoPath);
    }
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
        await boards.deleteBoard(boardId);
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

function updateZoomIndicator(zoom) {
  const el = _panel && _panel.querySelector('#canvasZoomIndicator');
  if (el) el.textContent = Math.round(zoom * 100) + '%';
}

function updatePropertiesPanel() {
  if (!_panel) return;
  const st = state.getState();
  const panel = _panel.querySelector('#canvasPropertiesPanel');
  if (!panel) return;
  if (st.selectedIds.length === 1) {
    const el = st.elements.find(e => e.id === st.selectedIds[0]);
    if (!el) { panel.style.display = 'none'; return; }
    panel.style.display = 'flex';
    const xInput = panel.querySelector('.cp-x');
    const yInput = panel.querySelector('.cp-y');
    const wInput = panel.querySelector('.cp-w');
    const hInput = panel.querySelector('.cp-h');
    const strokeInput = panel.querySelector('.cp-stroke');
    const fillInput = panel.querySelector('.cp-fill');
    const swInput = panel.querySelector('.cp-sw');
    const brInput = panel.querySelector('.cp-br');
    const fontSizeRow = panel.querySelector('.cp-fontsize-row');
    const fontSizeInput = panel.querySelector('.cp-fontsize');

    if (xInput) xInput.value = Math.round((el.x || 0) * 100) / 100;
    if (yInput) yInput.value = Math.round((el.y || 0) * 100) / 100;
    if (wInput) wInput.value = Math.round((el.width || 0) * 100) / 100;
    if (hInput) hInput.value = Math.round((el.height || 0) * 100) / 100;
    if (strokeInput) strokeInput.value = el.stroke || '#ffffff';
    if (fillInput) fillInput.value = el.fill || '#000000';
    if (swInput) swInput.value = el.strokeWidth || 2;
    if (brInput) {
      brInput.value = el.borderRadius !== undefined ? el.borderRadius : 0;
      const brLabel = brInput.closest('.cp-br-label');
      if (brLabel) brLabel.style.display = el.type === 'rect' ? 'flex' : 'none';
    }
    if (fontSizeRow) fontSizeRow.style.display = el.type === 'text' ? 'flex' : 'none';
    if (fontSizeInput) fontSizeInput.value = el.fontSize || 20;

    // Position fields for lines/arrows
    const startXInput = panel.querySelector('.cp-start-x');
    const startYInput = panel.querySelector('.cp-start-y');
    const endXInput = panel.querySelector('.cp-end-x');
    const endYInput = panel.querySelector('.cp-end-y');
    const posFields = panel.querySelector('.cp-pos-fields');
    const startEndFields = panel.querySelector('.cp-startend-fields');
    if (el.type === 'line' || el.type === 'arrow') {
      if (posFields) posFields.style.display = 'none';
      if (startEndFields) startEndFields.style.display = 'block';
      if (startXInput) startXInput.value = Math.round((el.start?.x || 0) * 100) / 100;
      if (startYInput) startYInput.value = Math.round((el.start?.y || 0) * 100) / 100;
      if (endXInput) endXInput.value = Math.round((el.end?.x || 0) * 100) / 100;
      if (endYInput) endYInput.value = Math.round((el.end?.y || 0) * 100) / 100;
    } else {
      if (posFields) posFields.style.display = 'block';
      if (startEndFields) startEndFields.style.display = 'none';
    }
  } else {
    panel.style.display = 'none';
  }
}

function handlePropertyChange(field, value) {
  const st = state.getState();
  if (st.selectedIds.length !== 1) return;
  const el = st.elements.find(e => e.id === st.selectedIds[0]);
  if (!el) return;
  const num = parseFloat(value);
  switch (field) {
    case 'x': if (!isNaN(num)) el.x = num; break;
    case 'y': if (!isNaN(num)) el.y = num; break;
    case 'w': if (!isNaN(num)) el.width = num; break;
    case 'h': if (!isNaN(num)) el.height = num; break;
    case 'stroke': el.stroke = value; break;
    case 'fill': el.fill = value; break;
    case 'strokeWidth': if (!isNaN(num)) el.strokeWidth = num; break;
    case 'borderRadius': if (!isNaN(num)) el.borderRadius = num; break;
    case 'fontSize': if (!isNaN(num)) el.fontSize = num; break;
    case 'startX': if (el.start && !isNaN(num)) el.start.x = num; break;
    case 'startY': if (el.start && !isNaN(num)) el.start.y = num; break;
    case 'endX': if (el.end && !isNaN(num)) el.end.x = num; break;
    case 'endY': if (el.end && !isNaN(num)) el.end.y = num; break;
  }
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

  const snapBtn = _panel && _panel.querySelector('#canvasSnapToggle');
  if (snapBtn) {
    snapBtn.classList.toggle('active', st.snapToGrid);
    snapBtn.title = st.snapToGrid ? 'Snap to grid (on)' : 'Snap to grid (off)';
  }

  const brRange = _panel && _panel.querySelector('#canvasBorderRadius');
  if (brRange) brRange.value = st.borderRadius || 0;

  updateToolbarUI();
  updatePropertiesPanel();
}
