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

function getTheme() {
  try { return state.getState().theme || 'dark'; } catch { return 'dark'; }
}
function themeStroke(raw) {
  const t = getTheme();
  if (!raw) return t === 'light' ? '#1e1e1e' : '#ffffff';
  // Auto-fix low-contrast strokes when theme mismatched (e.g. dark stroke on dark bg)
  const isDarkStroke = /^#0{2,}|^#1e1e1e|^#11|^#22|^#000/i.test(raw) || raw.toLowerCase() === 'black';
  const isLightStroke = raw.toLowerCase() === '#ffffff' || raw.toLowerCase() === 'white' || /^#f{6}/i.test(raw);
  if (t === 'dark' && isDarkStroke) return '#ffffff';
  if (t === 'light' && isLightStroke) return '#1e1e1e';
  return raw;
}
function themeTextColor(raw) {
  const t = getTheme();
  if (!raw) return t === 'light' ? '#1e1e1e' : '#ffffff';
  const isDark = /^#0|^#1e/i.test(raw);
  const isLight = /^#f{6}|^#fff|^white/i.test(raw);
  if (t === 'dark' && isDark && raw.toLowerCase() !== 'transparent') return '#e8eaf0';
  if (t === 'light' && isLight) return '#1e1e1e';
  return raw;
}

function render() {
  if (!_ctx || !_canvas) return;
  const w = _canvas.width / (window.devicePixelRatio || 1);
  const h = _canvas.height / (window.devicePixelRatio || 1);
  const theme = getTheme();
  const isLight = theme === 'light';

  // Canvas background
  _ctx.fillStyle = isLight ? '#ffffff' : '#010409';
  _ctx.fillRect(0, 0, w, h);

  // Background grid (only when zoomed out enough)
  const gridSize = 20 * viewport.zoom;
  if (gridSize > 8) {
    _ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
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
  ctx.strokeStyle = themeStroke(el.stroke);
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

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seededRand(seed, idx) {
  const x = Math.sin(seed * 0.0001 + idx * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
function drawRoughRect(ctx, x, y, w, h, r, seed) {
  const s = hashSeed(seed || '0');
  const j = (i, amt = 0.9) => (seededRand(s, i) - 0.5) * amt;
  const rEff = Math.min(r != null ? r : 12, Math.min(w, h) * 0.18);
  const bow = 0.8;
  // Clean closed path — each edge is a subtle bow, corners are true arcs via bezier
  ctx.beginPath();
  ctx.moveTo(x + rEff + j(0, 0.6), y + j(1, 0.6));
  // top edge
  ctx.bezierCurveTo(x + w * 0.35 + j(2), y - bow + j(3), x + w * 0.65 + j(4), y + bow + j(5), x + w - rEff + j(6, 0.6), y + j(7, 0.6));
  // top-right corner
  ctx.bezierCurveTo(x + w + j(8, 0.5), y + j(9, 0.5), x + w + j(10, 0.5), y + j(11, 0.5), x + w + j(12, 0.6), y + rEff + j(13, 0.6));
  // right edge
  ctx.bezierCurveTo(x + w + bow + j(14), y + h * 0.35 + j(15), x + w - bow + j(16), y + h * 0.65 + j(17), x + w + j(18, 0.6), y + h - rEff + j(19, 0.6));
  // bottom-right corner
  ctx.bezierCurveTo(x + w + j(20, 0.5), y + h + j(21, 0.5), x + w + j(22, 0.5), y + h + j(23, 0.5), x + w - rEff + j(24, 0.6), y + h + j(25, 0.6));
  // bottom edge
  ctx.bezierCurveTo(x + w * 0.65 + j(26), y + h + bow + j(27), x + w * 0.35 + j(28), y + h - bow + j(29), x + rEff + j(30, 0.6), y + h + j(31, 0.6));
  // bottom-left corner
  ctx.bezierCurveTo(x + j(32, 0.5), y + h + j(33, 0.5), x + j(34, 0.5), y + h + j(35, 0.5), x + j(36, 0.6), y + h - rEff + j(37, 0.6));
  // left edge
  ctx.bezierCurveTo(x - bow + j(38), y + h * 0.65 + j(39), x + bow + j(40), y + h * 0.35 + j(41), x + j(42, 0.6), y + rEff + j(43, 0.6));
  // top-left corner back to start
  ctx.bezierCurveTo(x + j(44, 0.5), y + j(45, 0.5), x + j(46, 0.5), y + j(47, 0.5), x + rEff + j(48, 0.6), y + j(49, 0.6));
  ctx.closePath();
}
function drawRect(ctx, el) {
  const stroke = themeStroke(el.stroke);
  const r = el.borderRadius != null ? el.borderRadius : (el.roughness === 0 ? 0 : 10);
  const useRough = el.roughness !== 0;
  if (useRough) {
    drawRoughRect(ctx, el.x, el.y, el.width, el.height, r, el.id);
    if (el.fill && el.fill !== 'transparent') {
      ctx.fillStyle = el.fill;
      ctx.fill();
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = el.strokeWidth || 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    // Second faint stroke for sketch double-line effect
    ctx.globalAlpha = 0.22;
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (r > 0) {
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, el.width, el.height, r);
    if (el.fill && el.fill !== 'transparent') {
      ctx.fillStyle = el.fill;
      ctx.fill();
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = el.strokeWidth || 2;
    ctx.stroke();
  } else {
    if (el.fill && el.fill !== 'transparent') {
      ctx.fillStyle = el.fill;
      ctx.fillRect(el.x, el.y, el.width, el.height);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = el.strokeWidth || 2;
    ctx.strokeRect(el.x, el.y, el.width, el.height);
  }
}

function drawEllipse(ctx, el) {
  const stroke = themeStroke(el.stroke);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rx = el.width / 2;
  const ry = el.height / 2;
  // Slight hand-drawn ellipse wobble
  if (el.roughness !== 0) {
    const s = hashSeed(el.id || 'e');
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.12) {
      const rWob = 1 + (seededRand(s, Math.floor(a*10)) - 0.5) * 0.015;
      const x = cx + Math.cos(a) * rx * rWob;
      const y = cy + Math.sin(a) * ry * rWob;
      if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';
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
  ctx.strokeStyle = themeStroke(el.stroke);
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
  ctx.strokeStyle = themeStroke(el.stroke);
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
  ctx.strokeStyle = themeStroke(el.stroke);
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.stroke();
}

function drawDoubleRect(ctx, el) {
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fillRect(el.x, el.y, el.width, el.height);
  }
  ctx.strokeStyle = themeStroke(el.stroke);
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
  ctx.strokeStyle = themeStroke(el.stroke);
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
  ctx.strokeStyle = themeStroke(el.stroke);
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
  ctx.fillStyle = themeStroke(el.stroke);
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
  ctx.fillStyle = themeTextColor(el.color);
  ctx.textBaseline = 'top';
  const align = el.align || 'left';
  let lines, effectiveWidth;
  if (el.frozen) {
    // Frozen WYSIWYG — text already hard-wrapped to match typing, do not re-wrap
    effectiveWidth = el.wrapWidth;
    lines = (el.text || '').split('\n');
  } else if (el.parentId) {
    const st = state.getState();
    const parent = st.elements.find(e => e.id === el.parentId);
    if (parent) {
      if (el.wrapWidth != null) effectiveWidth = el.wrapWidth;
      else effectiveWidth = Math.max(20, parent.x + parent.width - 4 - el.x);
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
    if (el.frozen) {
      const effectiveWidth = el.wrapWidth || 0;
      const lines = (el.text || '').split('\n');
      w = effectiveWidth || (el.text || '').length * fontSize * 0.5;
      h = lines.length * fontSize * 1.2;
    } else if (el.parentId) {
      const st = state.getState();
      const parent = st.elements.find(e => e.id === el.parentId);
      if (parent) {
        const effectiveWidth = el.wrapWidth != null ? el.wrapWidth : Math.max(20, parent.x + parent.width - 4 - el.x);
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
        // Notify UI to auto-reset to select (single-use tool)
        if (_actionCallback) _actionCallback({ action: 'tool-commit', tool: _activeToolName });
      } else if (result.action === 'commit-move') {
        // undo already pushed on first move
      } else if (_actionCallback) {
        _actionCallback(result);
        return;
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

export function exportAsPng() {
  const st = state.getState();
  const elements = st.elements || [];
  if (elements.length === 0) return null;
  // Compute bbox of all content
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    if (el.type === 'arrow' || el.type === 'line') {
      const pts = el.waypoints && el.waypoints.length ? el.waypoints : [el.start, el.end];
      for (const p of pts) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
    } else if (el.type === 'pen' && el.points) {
      for (const p of el.points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    } else if (el.type === 'text') {
      const w = textWidth ? textWidth(el) : (el.text || '').length * (el.fontSize || 20) * 0.5;
      const h = textHeight ? textHeight(el) : (el.text || '').split('\n').length * (el.fontSize || 20) * 1.2;
      minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + w); maxY = Math.max(maxY, el.y + h);
    } else {
      minX = Math.min(minX, el.x || 0); minY = Math.min(minY, el.y || 0);
      maxX = Math.max(maxX, (el.x || 0) + (el.width || 0)); maxY = Math.max(maxY, (el.y || 0) + (el.height || 0));
    }
  }
  const pad = 24;
  const bw = maxX - minX + pad * 2;
  const bh = maxY - minY + pad * 2;
  if (bw < 1 || bh < 1) return null;
  const scale = 2; // export @2x for crispness
  const dpr = scale;
  const out = document.createElement('canvas');
  out.width = Math.ceil(bw * dpr);
  out.height = Math.ceil(bh * dpr);
  const octx = out.getContext('2d');
  octx.scale(dpr, dpr);
  const isLight = getTheme() === 'light';
  octx.fillStyle = isLight ? '#ffffff' : '#010409';
  octx.fillRect(0, 0, bw, bh);
  octx.save();
  octx.translate(-minX + pad, -minY + pad);
  // Reuse drawElement logic inline — draw each element at 1x
  for (const el of elements) {
    octx.save();
    if (el.opacity != null && el.opacity < 1) octx.globalAlpha = el.opacity;
    // copy of drawElement but using octx
    switch (el.type) {
      case 'pen': {
        if (!el.points || el.points.length < 2) break;
        octx.strokeStyle = themeStroke(el.stroke); octx.lineWidth = el.strokeWidth || 2; octx.lineCap='round'; octx.lineJoin='round';
        octx.beginPath(); octx.moveTo(el.points[0].x, el.points[0].y);
        for (let i=1;i<el.points.length;i++) octx.lineTo(el.points[i].x, el.points[i].y);
        octx.stroke(); break;
      }
      case 'rect': {
        const stroke = themeStroke(el.stroke); const r = el.borderRadius != null ? el.borderRadius : (el.roughness===0?0:10);
        if (el.roughness!==0) { drawRoughRect(octx, el.x, el.y, el.width, el.height, r, el.id); if (el.fill && el.fill!=='transparent'){ octx.fillStyle=el.fill; octx.fill(); } octx.strokeStyle=stroke; octx.lineWidth=el.strokeWidth||2; octx.lineJoin='round'; octx.lineCap='round'; octx.stroke(); } else if (r>0){ octx.beginPath(); octx.roundRect(el.x, el.y, el.width, el.height, r); if (el.fill && el.fill!=='transparent'){ octx.fillStyle=el.fill; octx.fill(); } octx.strokeStyle=stroke; octx.lineWidth=el.strokeWidth||2; octx.stroke(); } else { if (el.fill && el.fill!=='transparent'){ octx.fillStyle=el.fill; octx.fillRect(el.x, el.y, el.width, el.height); } octx.strokeStyle=stroke; octx.lineWidth=el.strokeWidth||2; octx.strokeRect(el.x, el.y, el.width, el.height); } break;
      }
      case 'ellipse':
      case 'circle': {
        const stroke = themeStroke(el.stroke); const cx=el.x+el.width/2, cy=el.y+el.height/2, rx=el.width/2, ry=el.height/2;
        octx.beginPath(); octx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
        if (el.fill && el.fill!=='transparent'){ octx.fillStyle=el.fill; octx.fill(); }
        octx.strokeStyle=stroke; octx.lineWidth=el.strokeWidth||2; octx.stroke(); break;
      }
      case 'terminator': case 'diamond': case 'parallelogram': case 'double-rect': {
        // fallback to element's own path via draw helpers — simplified as rect for export
        const stroke = themeStroke(el.stroke);
        octx.strokeStyle=stroke; octx.lineWidth=el.strokeWidth||2;
        if (el.fill && el.fill!=='transparent'){ octx.fillStyle=el.fill; }
        if (el.type==='diamond'){ const cx=el.x+el.width/2, cy=el.y+el.height/2; octx.beginPath(); octx.moveTo(cx,el.y); octx.lineTo(el.x+el.width,cy); octx.lineTo(cx,el.y+el.height); octx.lineTo(el.x,cy); octx.closePath(); if(el.fill&&el.fill!=='transparent') octx.fill(); octx.stroke(); }
        else if (el.type==='parallelogram'){ const skew=el.width*0.2; octx.beginPath(); octx.moveTo(el.x+skew,el.y); octx.lineTo(el.x+el.width,el.y); octx.lineTo(el.x+el.width-skew,el.y+el.height); octx.lineTo(el.x,el.y+el.height); octx.closePath(); if(el.fill&&el.fill!=='transparent') octx.fill(); octx.stroke(); }
        else if (el.type==='terminator'){ const r=el.height/2,x=el.x,y=el.y,w=el.width,h=el.height; octx.beginPath(); octx.moveTo(x+r,y); octx.lineTo(x+w-r,y); octx.arcTo(x+w,y,x+w,y+r,r); octx.lineTo(x+w,y+h-r); octx.arcTo(x+w,y+h,x+w-r,y+h,r); octx.lineTo(x+r,y+h); octx.arcTo(x,y+h,x,y+h-r,r); octx.lineTo(x,y+r); octx.arcTo(x,y,x+r,y,r); octx.closePath(); if(el.fill&&el.fill!=='transparent') octx.fill(); octx.stroke(); }
        else { octx.strokeRect(el.x, el.y, el.width, el.height); if (el.fill&&el.fill!=='transparent'){ octx.fillRect(el.x, el.y, el.width, el.height); octx.strokeRect(el.x, el.y, el.width, el.height); } }
        break;
      }
      case 'line':
      case 'arrow': {
        octx.strokeStyle=themeStroke(el.stroke); octx.lineWidth=el.strokeWidth||2; octx.lineCap='round';
        const pts = el.waypoints && el.waypoints.length ? el.waypoints : [el.start, el.end];
        octx.beginPath(); octx.moveTo(pts[0].x, pts[0].y); for(let i=1;i<pts.length;i++) octx.lineTo(pts[i].x, pts[i].y); octx.stroke();
        if (el.type==='arrow' && pts.length>=2){ const from=pts[pts.length-2], to=pts[pts.length-1]; const ang=Math.atan2(to.y-from.y,to.x-from.x); const hl=12+(el.strokeWidth||2)*1.5; octx.fillStyle=themeStroke(el.stroke); octx.beginPath(); octx.moveTo(to.x,to.y); octx.lineTo(to.x-hl*Math.cos(ang-Math.PI/6), to.y-hl*Math.sin(ang-Math.PI/6)); octx.lineTo(to.x-hl*Math.cos(ang+Math.PI/6), to.y-hl*Math.sin(ang+Math.PI/6)); octx.closePath(); octx.fill(); }
        break;
      }
      case 'text': {
        const fs=el.fontSize||20;
        octx.font=`${fs}px 'Segoe UI', sans-serif`; octx.fillStyle=themeTextColor(el.color); octx.textBaseline='top';
        // use same wrap as drawText
        let lines; let effW;
        if (el.parentId){ const parent=elements.find(e=>e.id===el.parentId); if(parent){ effW=Math.max(20, parent.x+parent.width-4 - el.x); const fakeCtx=octx; const paras=textWrapLines(el.text||'', effW, fs, fakeCtx); lines=paras; } else lines=(el.text||'').split('\n'); } else lines=(el.text||'').split('\n');
        // helper to wrap
        function textWrapLines(t, maxW, f, c){ const ps=t.split('\n'); const out=[]; for(const pa of ps){ if(!pa){ out.push(''); continue; } const ws=pa.split(' '); let l=''; for(const w of ws){ const test=l?l+' '+w:w; if(c.measureText(test).width>maxW && l){ out.push(l); l=w; } else l=test; } if(l) out.push(l); } return out; }
        // need actual lines for drawing
        if (lines && lines.length && typeof lines[0]==='string' && !effW){ /* already split */ } else if (effW){ /* computed above */ } else { lines=(el.text||'').split('\n'); }
        // draw
        const lh=fs*1.2;
        // recompute correctly for parent case
        if (el.parentId){
          const parent=elements.find(e=>e.id===el.parentId);
          if(parent){
            const maxW2=Math.max(20, parent.x+parent.width-4 - el.x);
            const wrapped=textWrapLines(el.text||'', maxW2, fs, octx);
            wrapped.forEach((ln,i)=>{ let x=el.x; const align=el.align||'left'; if(align==='center') x=el.x+(maxW2-octx.measureText(ln).width)/2; else if(align==='right') x=el.x+maxW2-octx.measureText(ln).width; octx.fillText(ln, x, el.y+i*lh); });
          } else {
            lines.forEach((ln,i)=> octx.fillText(ln, el.x, el.y+i*lh));
          }
        } else {
          lines.forEach((ln,i)=> octx.fillText(ln, el.x, el.y+i*lh));
        }
        break;
      }
    }
    octx.restore();
  }
  octx.restore();
  return out.toDataURL('image/png');
}
function textWrapLines(t, maxW, f, c){ const ps=t.split('\n'); const out=[]; for(const pa of ps){ if(!pa){ out.push(''); continue; } const ws=pa.split(' '); let l=''; for(const w of ws){ const test=l?l+' '+w:w; if(c.measureText(test).width>maxW && l){ out.push(l); l=w; } else l=test; } if(l) out.push(l); } return out; }

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
