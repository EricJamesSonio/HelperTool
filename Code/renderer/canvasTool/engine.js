import * as state from './state.js';
import { worldPos, getResizeHandles, getConnectionPorts, updateArrowBindings } from './tools.js';

let _canvas = null;
let _ctx = null;
let _rafId = null;
let _animating = false;
let _draftElement = null;
let _moveUndoPushed = false;

const viewport = { x: 0, y: 0, zoom: 1.2 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

let _panning = false;
let _panStart = null;
let _panViewport = null;

let _toolInstance = null;
let _activeToolName = 'select';
let _spaceHeld = false;
let _actionCallback = null;
let _marqueeRect = null;
let _zoomChangeCallback = null;

export function setActionCallback(cb) {
  _actionCallback = cb;
}

export function setZoomChangeCallback(cb) {
  _zoomChangeCallback = cb;
}

export function setMarqueeRect(rect) {
  _marqueeRect = rect;
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
    drawElement(_ctx, el, st.selectedIds.includes(el.id));
  }

  // Draw selection outlines
  for (const el of elements) {
    if (st.selectedIds.includes(el.id)) {
      drawSelection(_ctx, el);
    }
  }

  // Draw resize handles
  for (const el of elements) {
    if (st.selectedIds.includes(el.id)) {
      drawResizeHandles(_ctx, el);
    }
  }

  // Draw draft element (in-progress drawing)
  if (_draftElement) {
    drawElement(_ctx, _draftElement, false);
  }

  // Draw connection ports when arrow/line tool is active
  if (_activeToolName === 'arrow' || _activeToolName === 'line') {
    for (const el of elements) {
      if (isBindableShapeType(el.type)) {
        drawConnectionPorts(_ctx, el);
      }
    }
  }

  _ctx.restore();

  // Draw marquee selection rect
  if (_marqueeRect) {
    _ctx.save();
    _ctx.strokeStyle = '#22d3ee';
    _ctx.lineWidth = 1.5;
    _ctx.setLineDash([4, 4]);
    _ctx.fillStyle = 'rgba(34,211,238,0.08)';
    const mx = _marqueeRect.x * viewport.zoom + viewport.x;
    const my = _marqueeRect.y * viewport.zoom + viewport.y;
    const mw = _marqueeRect.w * viewport.zoom;
    const mh = _marqueeRect.h * viewport.zoom;
    _ctx.fillRect(mx, my, mw, mh);
    _ctx.strokeRect(mx, my, mw, mh);
    _ctx.restore();
  }
}

function isBindableShapeType(type) {
  return type === 'rect' || type === 'ellipse' || type === 'terminator' ||
         type === 'diamond' || type === 'parallelogram' || type === 'double-rect' ||
         type === 'circle';
}

function drawElement(ctx, el, isSelected) {
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
      drawLine(ctx, el, isSelected);
      break;
    case 'arrow':
      drawArrow(ctx, el, isSelected);
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
  const r = el.borderRadius || 0;
  if (r > 0) {
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, el.width, el.height, r);
    if (el.fill && el.fill !== 'transparent') {
      ctx.fillStyle = el.fill;
      ctx.fill();
    }
    ctx.strokeStyle = el.stroke || '#ffffff';
    ctx.lineWidth = el.strokeWidth || 2;
    ctx.stroke();
  } else {
    if (el.fill && el.fill !== 'transparent') {
      ctx.fillStyle = el.fill;
      ctx.fillRect(el.x, el.y, el.width, el.height);
    }
    ctx.strokeStyle = el.stroke || '#ffffff';
    ctx.lineWidth = el.strokeWidth || 2;
    ctx.strokeRect(el.x, el.y, el.width, el.height);
  }
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

function drawLine(ctx, el, isSelected) {
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';

  const waypoints = el.waypoints;
  if (waypoints && waypoints.length > 0) {
    ctx.beginPath();
    ctx.moveTo(waypoints[0].x, waypoints[0].y);
    for (let i = 1; i < waypoints.length; i++) {
      ctx.lineTo(waypoints[i].x, waypoints[i].y);
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(el.start.x, el.start.y);
    ctx.lineTo(el.end.x, el.end.y);
    ctx.stroke();
  }

  // Binding indicators (when selected)
  if (isSelected) {
    const r = 5 / (viewport.zoom || 1);
    ctx.fillStyle = '#22d3ee';
    if (el.startBinding) {
      ctx.beginPath();
      ctx.arc(el.start.x, el.start.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (el.endBinding) {
      ctx.beginPath();
      ctx.arc(el.end.x, el.end.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawArrow(ctx, el, isSelected) {
  ctx.strokeStyle = el.stroke || '#ffffff';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';

  // Draw through waypoints if available (routing)
  const waypoints = el.waypoints;
  if (waypoints && waypoints.length > 0) {
    ctx.beginPath();
    ctx.moveTo(waypoints[0].x, waypoints[0].y);
    for (let i = 1; i < waypoints.length; i++) {
      ctx.lineTo(waypoints[i].x, waypoints[i].y);
    }
    ctx.stroke();

    // Arrowhead at the last segment
    const last = waypoints[waypoints.length - 1];
    const prev = waypoints[waypoints.length - 2] || el.start;
    drawArrowhead(ctx, prev, last, el);
  } else {
    ctx.beginPath();
    ctx.moveTo(el.start.x, el.start.y);
    ctx.lineTo(el.end.x, el.end.y);
    ctx.stroke();

    // Arrowhead
    drawArrowhead(ctx, el.start, el.end, el);
  }

  // Binding indicators (when selected)
  if (isSelected) {
    const r = 5 / (viewport.zoom || 1);
    ctx.fillStyle = '#22d3ee';
    if (el.startBinding) {
      ctx.beginPath();
      ctx.arc(el.start.x, el.start.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (el.endBinding) {
      ctx.beginPath();
      ctx.arc(el.end.x, el.end.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawArrowhead(ctx, from, to, el) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLen = 12 + (el.strokeWidth || 2) * 1.5;
  ctx.fillStyle = el.stroke || '#ffffff';
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLen * Math.cos(angle - Math.PI / 6),
    to.y - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    to.x - headLen * Math.cos(angle + Math.PI / 6),
    to.y - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function wrapTextToWidth(ctx, text, maxWidth) {
  const paragraphs = text.split('\n');
  const result = [];
  for (const para of paragraphs) {
    if (!para) { result.push(''); continue; }
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line ? line + ' ' + word : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        result.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) result.push(line);
  }
  return result;
}

function drawText(ctx, el) {
  const fontSize = el.fontSize || 20;
  ctx.font = `${fontSize}px 'Segoe UI', sans-serif`;
  ctx.fillStyle = el.color || '#ffffff';
  ctx.textBaseline = 'top';
  const align = el.align || 'left';
  let lines, effectiveWidth;
  if (el.parentId) {
    const st = state.getState();
    const parent = st.elements.find(e => e.id === el.parentId);
    if (parent) {
      effectiveWidth = Math.max(20, parent.x + parent.width - 4 - el.x);
      lines = wrapTextToWidth(ctx, el.text || '', effectiveWidth);
    } else {
      lines = (el.text || '').split('\n');
    }
  } else {
    lines = (el.text || '').split('\n');
  }
  const lineHeight = fontSize * 1.2;
  lines.forEach((line, i) => {
    let x = el.x;
    if (effectiveWidth !== undefined && align === 'center') {
      x = el.x + (effectiveWidth - ctx.measureText(line).width) / 2;
    } else if (effectiveWidth !== undefined && align === 'right') {
      x = el.x + effectiveWidth - ctx.measureText(line).width;
    }
    ctx.fillText(line, x, el.y + i * lineHeight);
  });
}

function drawSelection(ctx, el) {
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1.5 / (viewport.zoom || 1);
  ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
  if (el.type === 'text') {
    const fontSize = el.fontSize || 20;
    let w, h;
    if (el.parentId) {
      const st = state.getState();
      const parent = st.elements.find(e => e.id === el.parentId);
      if (parent) {
        const effectiveWidth = Math.max(20, parent.x + parent.width - 4 - el.x);
        const lines = wrapTextToWidth(ctx, el.text || '', effectiveWidth);
        w = effectiveWidth;
        h = lines.length * fontSize * 1.2;
      } else {
        w = (el.text || '').length * fontSize * 0.5;
        h = (el.text || '').split('\n').length * fontSize * 1.2;
      }
    } else {
      w = (el.text || '').length * fontSize * 0.5;
      h = (el.text || '').split('\n').length * fontSize * 1.2;
    }
    ctx.strokeRect(el.x - 4, el.y - 4, w + 8, h + 8);
  } else {
    ctx.strokeRect(el.x - 4, el.y - 4, el.width + 8, el.height + 8);
  }
  ctx.setLineDash([]);
}

function drawResizeHandles(ctx, el) {
  const hs = getResizeHandles(el);
  const s = 6 / (viewport.zoom || 1);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1.5 / (viewport.zoom || 1);
  for (const h of hs) {
    ctx.fillRect(h.x - s / 2, h.y - s / 2, s, s);
    ctx.strokeRect(h.x - s / 2, h.y - s / 2, s, s);
  }
}

function drawConnectionPorts(ctx, shape) {
  const ports = getConnectionPorts(shape);
  const r = 4 / (viewport.zoom || 1);
  ctx.fillStyle = 'rgba(34,211,238,0.5)';
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1 / (viewport.zoom || 1);
  for (const p of ports) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export function setActiveToolName(name) {
  _activeToolName = name || 'select';
}

function bindEvents() {
  if (!_canvas) return;
  _canvas.addEventListener('pointerdown', onPointerDown);
  _canvas.addEventListener('pointermove', onPointerMove);
  _canvas.addEventListener('pointerup', onPointerUp);
  _canvas.addEventListener('pointercancel', onPointerCancel);
  _canvas.addEventListener('dblclick', onDblClick);
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
  _canvas.removeEventListener('dblclick', onDblClick);
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
    if (_zoomChangeCallback) _zoomChangeCallback(viewport.zoom);
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

  // Resize cursor for handle hover
  if (_canvas && !_spaceHeld && !_panning && _toolInstance === null) {
    // Only when using the default cursor (not in a tool action)
    // handled by updateCursor below
  }
  updateCursorForMove(e);
}

function updateCursorForMove(e) {
  if (!_canvas || _spaceHeld || _panning) return;
  const st = state.getState();
  if (st.selectedIds.length === 1 && !(e.buttons & 1)) {
    const el = st.elements.find(el => el.id === st.selectedIds[0]);
    if (el) {
      const pos = worldPos(_canvas, viewport, e.clientX, e.clientY);
      const handle = getResizeHandles(el).find(h =>
        Math.abs(pos.x - h.x) < 8 / (viewport.zoom || 1) &&
        Math.abs(pos.y - h.y) < 8 / (viewport.zoom || 1)
      );
      if (handle) {
        _canvas.style.cursor = handle.cursor;
        return;
      }
    }
  }
  updateCursor();
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
        updateArrowBindings(state.getState());
      } else if (result.action === 'commit-move') {
        // undo already pushed on first move
      }
    }
  }
  _draftElement = null;
  _moveUndoPushed = false;
  if (_canvas) updateCursorForMove(e);
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

function onDblClick(e) {
  if (_toolInstance && _toolInstance.onDblClick) {
    const st = state.getState();
    const pos = worldPos(_canvas, viewport, e.clientX, e.clientY);
    const result = _toolInstance.onDblClick(st, viewport, _canvas, e, pos);
    if (result && _actionCallback) {
      _actionCallback(result);
    }
  }
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
  if (_zoomChangeCallback) _zoomChangeCallback(viewport.zoom);
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
  if (_zoomChangeCallback) _zoomChangeCallback(viewport.zoom);
}

export function resetView() {
  viewport.x = 0;
  viewport.y = 0;
  viewport.zoom = 1.2;
  if (_zoomChangeCallback) _zoomChangeCallback(viewport.zoom);
}

export function fitToScreen(padding) {
  if (!_canvas) return;
  padding = padding || 60;
  const st = state.getState();
  const elements = st.elements || [];
  if (elements.length === 0) { resetView(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    if (el.type === 'arrow' || el.type === 'line') {
      minX = Math.min(minX, el.start.x, el.end.x);
      minY = Math.min(minY, el.start.y, el.end.y);
      maxX = Math.max(maxX, el.start.x, el.end.x);
      maxY = Math.max(maxY, el.start.y, el.end.y);
    } else if (el.type === 'pen' && el.points) {
      for (const p of el.points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
    } else {
      minX = Math.min(minX, el.x || 0);
      minY = Math.min(minY, el.y || 0);
      maxX = Math.max(maxX, (el.x || 0) + (el.width || 0));
      maxY = Math.max(maxY, (el.y || 0) + (el.height || 0));
    }
  }
  const bw = maxX - minX + padding * 2;
  const bh = maxY - minY + padding * 2;
  if (bw < 1 || bh < 1) { resetView(); return; }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const canvasW = _canvas.width / (window.devicePixelRatio || 1);
  const canvasH = _canvas.height / (window.devicePixelRatio || 1);
  const zoomX = canvasW / bw;
  const zoomY = canvasH / bh;
  viewport.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(zoomX, zoomY)));
  viewport.x = canvasW / 2 - centerX * viewport.zoom;
  viewport.y = canvasH / 2 - centerY * viewport.zoom;
  if (_zoomChangeCallback) _zoomChangeCallback(viewport.zoom);
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
  if (_zoomChangeCallback) _zoomChangeCallback(viewport.zoom);
}
