import * as state from './state.js';
import { worldPos } from './tools.js';

let _canvas = null;
let _ctx = null;
let _rafId = null;
let _animating = false;
let _draftElement = null;
let _moveUndoPushed = false;

const viewport = { x: 0, y: 0, zoom: 1 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

let _panning = false;
let _panStart = null;
let _panViewport = null;

let _toolInstance = null;
let _spaceHeld = false;
let _actionCallback = null;

export function setActionCallback(cb) {
  _actionCallback = cb;
}

export function init(canvas) {
  _canvas = canvas;
  _ctx = canvas.getContext('2d');
  resize();
  bindEvents();
  startLoop();
}

export function destroy() {
  stopLoop();
  unbindEvents();
  _draftElement = null;
  _moveUndoPushed = false;
  _spaceHeld = false;
  _canvas = null;
  _ctx = null;
}

export function resize() {
  if (!_canvas) return;
  const parent = _canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  _canvas.width = w * dpr;
  _canvas.height = h * dpr;
  _canvas.style.width = w + 'px';
  _canvas.style.height = h + 'px';
  _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function setTool(toolInstance) {
  if (_toolInstance && _toolInstance.onPointerCancel) {
    _toolInstance.onPointerCancel();
  }
  _toolInstance = toolInstance;
  _draftElement = null;
  _moveUndoPushed = false;
  updateCursor();
}

function updateCursor() {
  if (!_canvas) return;
  if (_spaceHeld) {
    _canvas.style.cursor = 'grab';
  } else if (_toolInstance) {
    _canvas.style.cursor = 'crosshair';
  } else {
    _canvas.style.cursor = 'default';
  }
}

function startLoop() {
  if (_animating) return;
  _animating = true;
  loop();
}

function stopLoop() {
  _animating = false;
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

function loop() {
  if (!_animating) return;
  render();
  _rafId = requestAnimationFrame(loop);
}

function render() {
  if (!_ctx || !_canvas) return;
  const w = _canvas.width / (window.devicePixelRatio || 1);
  const h = _canvas.height / (window.devicePixelRatio || 1);

  _ctx.clearRect(0, 0, w, h);

  // Background grid (only when zoomed out enough)
  const gridSize = 20 * viewport.zoom;
  if (gridSize > 8) {
    _ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    _ctx.lineWidth = 1;
    const ox = viewport.x % gridSize;
    const oy = viewport.y % gridSize;
    for (let x = ox; x < w; x += gridSize) {
      _ctx.beginPath();
      _ctx.moveTo(x, 0);
      _ctx.lineTo(x, h);
      _ctx.stroke();
    }
    for (let y = oy; y < h; y += gridSize) {
      _ctx.beginPath();
      _ctx.moveTo(0, y);
      _ctx.lineTo(w, y);
      _ctx.stroke();
    }
  }

  _ctx.save();
  _ctx.translate(viewport.x, viewport.y);
  _ctx.scale(viewport.zoom, viewport.zoom);

  const st = state.getState();
  const elements = st.elements || [];

  for (const el of elements) {
    drawElement(_ctx, el);
  }

  // Draw selection outlines
  for (const el of elements) {
    if (st.selectedIds.includes(el.id)) {
      drawSelection(_ctx, el);
    }
  }

  // Draw draft element (in-progress drawing)
  if (_draftElement) {
    drawElement(_ctx, _draftElement);
  }

  _ctx.restore();
}

function drawElement(ctx, el) {
  ctx.save();
  if (el.opacity !== undefined && el.opacity < 1) {
    ctx.globalAlpha = el.opacity;
  }

  switch (el.type) {
    case 'pen':
      drawPen(ctx, el);
      break;
    case 'rect':
      drawRect(ctx, el);
      break;
    case 'ellipse':
      drawEllipse(ctx, el);
      break;
    case 'line':
      drawLine(ctx, el);
      break;
    case 'arrow':
      drawArrow(ctx, el);
      break;
    case 'text':
      drawText(ctx, el);
      break;
    case 'terminator':
      drawTerminator(ctx, el);
      break;
    case 'diamond':
      drawDiamond(ctx, el);
      break;
    case 'parallelogram':
      drawParallelogram(ctx, el);
      break;
    case 'double-rect':
      drawDoubleRect(ctx, el);
      break;
    case 'circle':
      drawEllipse(ctx, el);
      break;
  }
  ctx.restore();
}

function drawPen(ctx, el) {
  if (!el.points || el.points.length < 2) return;
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(el.points[0].x, el.points[0].y);
  for (let i = 1; i < el.points.length; i++) {
    ctx.lineTo(el.points[i].x, el.points[i].y);
  }
  ctx.stroke();
}

function drawRect(ctx, el) {
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fillRect(el.x, el.y, el.width, el.height);
  }
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.strokeRect(el.x, el.y, el.width, el.height);
}

function drawEllipse(ctx, el) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rx = el.width / 2;
  const ry = el.height / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.stroke();
}

function drawTerminator(ctx, el) {
  const r = el.height / 2;
  const x = el.x, y = el.y, w = el.width, h = el.height;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  if (el.fill && el.fill !== 'transparent') { ctx.fillStyle = el.fill; ctx.fill(); }
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.stroke();
}

function drawDiamond(ctx, el) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.beginPath();
  ctx.moveTo(cx, el.y);
  ctx.lineTo(el.x + el.width, cy);
  ctx.lineTo(cx, el.y + el.height);
  ctx.lineTo(el.x, cy);
  ctx.closePath();
  if (el.fill && el.fill !== 'transparent') { ctx.fillStyle = el.fill; ctx.fill(); }
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.stroke();
}

function drawParallelogram(ctx, el) {
  const skew = el.width * 0.2;
  ctx.beginPath();
  ctx.moveTo(el.x + skew, el.y);
  ctx.lineTo(el.x + el.width, el.y);
  ctx.lineTo(el.x + el.width - skew, el.y + el.height);
  ctx.lineTo(el.x, el.y + el.height);
  ctx.closePath();
  if (el.fill && el.fill !== 'transparent') { ctx.fillStyle = el.fill; ctx.fill(); }
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.stroke();
}

function drawDoubleRect(ctx, el) {
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fillRect(el.x, el.y, el.width, el.height);
  }
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.strokeRect(el.x, el.y, el.width, el.height);
  // Inner vertical lines
  const gap = 6;
  ctx.beginPath();
  ctx.moveTo(el.x + gap, el.y);
  ctx.lineTo(el.x + gap, el.y + el.height);
  ctx.moveTo(el.x + el.width - gap, el.y);
  ctx.lineTo(el.x + el.width - gap, el.y + el.height);
  ctx.stroke();
}

function drawLine(ctx, el) {
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(el.start.x, el.start.y);
  ctx.lineTo(el.end.x, el.end.y);
  ctx.stroke();
}

function drawArrow(ctx, el) {
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(el.start.x, el.start.y);
  ctx.lineTo(el.end.x, el.end.y);
  ctx.stroke();

  // Arrowhead
  const angle = Math.atan2(el.end.y - el.start.y, el.end.x - el.start.x);
  const headLen = 12 + (el.strokeWidth || 2) * 1.5;
  ctx.fillStyle = el.stroke || '#ffffff';
  ctx.beginPath();
  ctx.moveTo(el.end.x, el.end.y);
  ctx.lineTo(
    el.end.x - headLen * Math.cos(angle - Math.PI / 6),
    el.end.y - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    el.end.x - headLen * Math.cos(angle + Math.PI / 6),
    el.end.y - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function drawText(ctx, el) {
  const fontSize = el.fontSize || 20;
  ctx.font = `${fontSize}px 'Segoe UI', sans-serif`;
  ctx.fillStyle = el.color || '#ffffff';
  ctx.textBaseline = 'top';
  const lines = (el.text || '').split('\n');
  const lineHeight = fontSize * 1.2;
  lines.forEach((line, i) => {
    ctx.fillText(line, el.x, el.y + i * lineHeight);
  });
}

function drawSelection(ctx, el) {
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1.5 / (viewport.zoom || 1);
  ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
  if (el.type === 'text') {
    const fontSize = el.fontSize || 20;
    const w = (el.text || '').length * fontSize * 0.5;
    const h = (el.text || '').split('\n').length * fontSize * 1.2;
    ctx.strokeRect(el.x - 4, el.y - 4, w + 8, h + 8);
  } else {
    ctx.strokeRect(el.x - 4, el.y - 4, el.width + 8, el.height + 8);
  }
  ctx.setLineDash([]);
}

function bindEvents() {
  if (!_canvas) return;
  _canvas.addEventListener('pointerdown', onPointerDown);
  _canvas.addEventListener('pointermove', onPointerMove);
  _canvas.addEventListener('pointerup', onPointerUp);
  _canvas.addEventListener('pointercancel', onPointerCancel);
  _canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', resize);
  document.addEventListener('keyup', onKeyUp);
}

function unbindEvents() {
  if (!_canvas) return;
  _canvas.removeEventListener('pointerdown', onPointerDown);
  _canvas.removeEventListener('pointermove', onPointerMove);
  _canvas.removeEventListener('pointerup', onPointerUp);
  _canvas.removeEventListener('pointercancel', onPointerCancel);
  _canvas.removeEventListener('wheel', onWheel);
  window.removeEventListener('resize', resize);
  document.removeEventListener('keyup', onKeyUp);
}

function onPointerDown(e) {
  const st = state.getState();

  // Middle mouse, space+drag, or pan tool → pan
  if (e.button === 1 || _spaceHeld || e.button === 0 && st.activeTool === 'pan') {
    _panning = true;
    _panStart = { x: e.clientX, y: e.clientY };
    _panViewport = { x: viewport.x, y: viewport.y };
    _canvas.style.cursor = 'grabbing';
    return;
  }

  if (_toolInstance && _toolInstance.onPointerDown) {
    const result = _toolInstance.onPointerDown(st, viewport, _canvas, e);
    if (result) {
      if (result.action === 'commit' && result.element) {
        state.addElement(result.element);
      } else if (result.action === 'drawing' && result.element) {
        _draftElement = result.element;
      } else if (_actionCallback) {
        _actionCallback(result);
      }
    }
  }
}

function onPointerMove(e) {
  if (_panning && _panStart && _panViewport) {
    viewport.x = _panViewport.x + (e.clientX - _panStart.x);
    viewport.y = _panViewport.y + (e.clientY - _panStart.y);
    return;
  }

  if (_toolInstance && _toolInstance.onPointerMove) {
    const st = state.getState();
    const result = _toolInstance.onPointerMove(st, viewport, _canvas, e);
    if (result) {
      if (result.action === 'update' && result.element) {
        _draftElement = result.element;
      } else if (result.action === 'move') {
        if (!_moveUndoPushed) {
          state.pushUndo();
          _moveUndoPushed = true;
        }
      }
    }
  }
}

function onPointerUp(e) {
  if (_panning) {
    _panning = false;
    updateCursor();
    return;
  }

  if (_toolInstance && _toolInstance.onPointerUp) {
    const st = state.getState();
    const result = _toolInstance.onPointerUp(st, viewport, _canvas, e);
    if (result) {
      if (result.action === 'commit' && result.element) {
        state.addElement(result.element);
      } else if (result.action === 'commit-move') {
        // undo already pushed on first move
      }
    }
  }
  _draftElement = null;
  _moveUndoPushed = false;
}

function onPointerCancel() {
  _panning = false;
  _draftElement = null;
  _moveUndoPushed = false;
  if (_toolInstance && _toolInstance.onPointerCancel) {
    _toolInstance.onPointerCancel();
  }
  updateCursor();
}

export function onKeyDown(e) {
  // Space bar → enter pan mode
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    _spaceHeld = true;
    updateCursor();
    return;
  }

  // Ctrl+= or Ctrl+Shift+= → zoom in
  if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    zoomAtCenter(1.25);
    return;
  }

  // Ctrl+- → zoom out
  if ((e.ctrlKey || e.metaKey) && e.key === '-') {
    e.preventDefault();
    zoomAtCenter(1 / 1.25);
    return;
  }
}

export function onKeyUp(e) {
  if (e.code === 'Space') {
    _spaceHeld = false;
    updateCursor();
  }
}

function zoomAtCenter(factor) {
  if (!_canvas) return;
  const rect = _canvas.getBoundingClientRect();
  const mx = rect.width / 2;
  const my = rect.height / 2;
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * factor));
  const actualFactor = newZoom / viewport.zoom;
  viewport.x = mx - actualFactor * (mx - viewport.x);
  viewport.y = my - actualFactor * (my - viewport.y);
  viewport.zoom = newZoom;
}

function onWheel(e) {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    // Zoom
    const rect = _canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = -e.deltaY * 0.001;
    const factor = 1 + delta;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * factor));
    const actualFactor = newZoom / viewport.zoom;
    viewport.x = mx - actualFactor * (mx - viewport.x);
    viewport.y = my - actualFactor * (my - viewport.y);
    viewport.zoom = newZoom;
  } else {
    // Pan
    viewport.x -= e.deltaX;
    viewport.y -= e.deltaY;
  }
}

export function resetView() {
  viewport.x = 0;
  viewport.y = 0;
  viewport.zoom = 1;
}

export function getViewport() {
  return { ...viewport };
}

export function setViewport(vp) {
  if (vp) {
    viewport.x = vp.x || 0;
    viewport.y = vp.y || 0;
    viewport.zoom = vp.zoom || 1;
  }
}
