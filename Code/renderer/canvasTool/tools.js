let _nextElId = 1;
function nextId() { return 'el_' + (_nextElId++); }

function worldPos(canvas, viewport, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left - viewport.x) / viewport.zoom;
  const y = (clientY - rect.top - viewport.y) / viewport.zoom;
  return { x, y };
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function textWidth(el) {
  return (el.text || '').length * (el.fontSize || 20) * 0.5;
}
function textHeight(el) {
  const lines = (el.text || '').split('\n');
  return lines.length * (el.fontSize || 20) * 1.2;
}

function hitTest(worldX, worldY, element) {
  const margin = 8 / (element._viewportZoom || 1);
  switch (element.type) {
    case 'pen': {
      for (let i = 1; i < element.points.length; i++) {
        const p0 = element.points[i - 1];
        const p1 = element.points[i];
        const d = distToSegment(worldX, worldY, p0, p1);
        if (d < margin + (element.strokeWidth || 2) / 2) return true;
      }
      return false;
    }
    case 'rect':
    case 'ellipse':
      return (
        worldX >= element.x - margin &&
        worldX <= element.x + element.width + margin &&
        worldY >= element.y - margin &&
        worldY <= element.y + element.height + margin
      );
    case 'line':
    case 'arrow': {
      const d = distToSegment(worldX, worldY, element.start, element.end);
      return d < margin + (element.strokeWidth || 2) / 2;
    }
    case 'text':
      return (
        worldX >= element.x - margin &&
        worldX <= element.x + textWidth(element) + margin &&
        worldY >= element.y - margin &&
        worldY <= element.y + textHeight(element) + margin
      );
    case 'terminator':
    case 'diamond':
    case 'parallelogram':
    case 'double-rect':
    case 'circle':
      return (
        worldX >= element.x - margin &&
        worldX <= element.x + element.width + margin &&
        worldY >= element.y - margin &&
        worldY <= element.y + element.height + margin
      );
    default:
      return false;
  }
}

function distToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist({ x: px, y: py }, a);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist({ x: px, y: py }, { x: a.x + t * dx, y: a.y + t * dy });
}

export function createPenTool() {
  let currentStroke = null;
  return {
    onPointerDown(state, viewport, canvas, e) {
      const pos = worldPos(canvas, viewport, e.clientX, e.clientY);
      currentStroke = {
        id: nextId(),
        type: 'pen',
        points: [pos],
        stroke: state.color,
        strokeWidth: state.strokeWidth,
        opacity: state.opacity,
      };
      return { action: 'drawing', element: currentStroke };
    },
    onPointerMove(state, viewport, canvas, e) {
      if (!currentStroke) return null;
      const pos = worldPos(canvas, viewport, e.clientX, e.clientY);
      currentStroke.points.push(pos);
      return { action: 'update', element: currentStroke };
    },
    onPointerUp() {
      if (!currentStroke) return null;
      const el = currentStroke;
      currentStroke = null;
      return { action: 'commit', element: el };
    },
    onPointerCancel() {
      currentStroke = null;
    },
  };
}

export function createRectTool() {
  let start = null;
  let currentRect = null;
  return {
    onPointerDown(state, viewport, canvas, e) {
      start = worldPos(canvas, viewport, e.clientX, e.clientY);
      currentRect = {
        id: nextId(),
        type: 'rect',
        x: start.x, y: start.y, width: 0, height: 0,
        stroke: state.color,
        strokeWidth: state.strokeWidth,
        fill: state.fillColor,
        opacity: state.opacity,
      };
      return { action: 'drawing', element: currentRect };
    },
    onPointerMove(state, viewport, canvas, e) {
      if (!currentRect || !start) return null;
      const pos = worldPos(canvas, viewport, e.clientX, e.clientY);
      const x = Math.min(start.x, pos.x);
      const y = Math.min(start.y, pos.y);
      currentRect.x = x;
      currentRect.y = y;
      currentRect.width = Math.abs(pos.x - start.x);
      currentRect.height = Math.abs(pos.y - start.y);
      return { action: 'update', element: currentRect };
    },
    onPointerUp(state, viewport, canvas, e) {
      if (!currentRect || !start) return null;
      const pos = worldPos(canvas, viewport, e.clientX, e.clientY);
      const x = Math.min(start.x, pos.x);
      const y = Math.min(start.y, pos.y);
      currentRect.x = x;
      currentRect.y = y;
      currentRect.width = Math.abs(pos.x - start.x);
      currentRect.height = Math.abs(pos.y - start.y);
      const el = currentRect;
      start = null;
      currentRect = null;
      return { action: 'commit', element: el };
    },
    onPointerCancel() { start = null; currentRect = null; },
  };
}

export function createEllipseTool() {
  let start = null;
  let currentEl = null;
  return {
    onPointerDown(state, viewport, canvas, e) {
      start = worldPos(canvas, viewport, e.clientX, e.clientY);
      currentEl = {
        id: nextId(),
        type: 'ellipse',
        x: start.x, y: start.y, width: 0, height: 0,
        stroke: state.color,
        strokeWidth: state.strokeWidth,
        fill: state.fillColor,
        opacity: state.opacity,
      };
      return { action: 'drawing', element: currentEl };
    },
    onPointerMove(state, viewport, canvas, e) {
      if (!currentEl || !start) return null;
      const pos = worldPos(canvas, viewport, e.clientX, e.clientY);
      const x = Math.min(start.x, pos.x);
      const y = Math.min(start.y, pos.y);
      currentEl.x = x;
      currentEl.y = y;
      currentEl.width = Math.abs(pos.x - start.x);
      currentEl.height = Math.abs(pos.y - start.y);
      return { action: 'update', element: currentEl };
    },
    onPointerUp(state, viewport, canvas, e) {
      if (!currentEl || !start) return null;
      const pos = worldPos(canvas, viewport, e.clientX, e.clientY);
      const x = Math.min(start.x, pos.x);
      const y = Math.min(start.y, pos.y);
      currentEl.x = x;
      currentEl.y = y;
      currentEl.width = Math.abs(pos.x - start.x);
      currentEl.height = Math.abs(pos.y - start.y);
      const el = currentEl;
      start = null;
      currentEl = null;
      return { action: 'commit', element: el };
    },
    onPointerCancel() { start = null; currentEl = null; },
  };
}

export function createLineTool() {
  let start = null;
  let currentLine = null;
  return {
    onPointerDown(state, viewport, canvas, e) {
      start = worldPos(canvas, viewport, e.clientX, e.clientY);
      currentLine = {
        id: nextId(), type: 'line',
        start: { ...start }, end: { ...start },
        stroke: state.color, strokeWidth: state.strokeWidth,
        opacity: state.opacity,
      };
      return { action: 'drawing', element: currentLine };
    },
    onPointerMove(state, viewport, canvas, e) {
      if (!currentLine) return null;
      currentLine.end = worldPos(canvas, viewport, e.clientX, e.clientY);
      return { action: 'update', element: currentLine };
    },
    onPointerUp() {
      if (!currentLine) return null;
      const el = currentLine;
      start = null;
      currentLine = null;
      return { action: 'commit', element: el };
    },
    onPointerCancel() { start = null; currentLine = null; },
  };
}

export function createArrowTool() {
  let start = null;
  let currentArrow = null;
  return {
    onPointerDown(state, viewport, canvas, e) {
      const pos = worldPos(canvas, viewport, e.clientX, e.clientY);
      // Snap start to nearest connection port
      start = snapToPort(pos, state.elements) || pos;
      currentArrow = {
        id: nextId(), type: 'arrow',
        start: { ...start }, end: { ...start },
        stroke: state.color, strokeWidth: state.strokeWidth,
        opacity: state.opacity,
      };
      return { action: 'drawing', element: currentArrow };
    },
    onPointerMove(state, viewport, canvas, e) {
      if (!currentArrow) return null;
      const pos = worldPos(canvas, viewport, e.clientX, e.clientY);
      const snapped = snapToPort(pos, state.elements);
      currentArrow.end = snapped || pos;
      return { action: 'update', element: currentArrow };
    },
    onPointerUp(state) {
      if (!currentArrow) return null;
      const el = currentArrow;
      // Auto-bind endpoints to shapes if near boundary
      if (state && state.elements) {
        const eps = 15;
        const startNear = findBinding(state.elements, el.start, eps);
        const endNear = findBinding(state.elements, el.end, eps);
        // Don't bind start and end to the same element
        if (startNear && startNear !== endNear) {
          const bound = state.elements.find(e => e.id === startNear);
          const port = findNearestPort(el.start, bound, BIND_THRESHOLD);
          el.startBinding = port ? { elementId: startNear, side: port.id } : { elementId: startNear };
          el.start = getClosestEdgePoint(el.start, bound);
        }
        if (endNear && endNear !== startNear) {
          const bound = state.elements.find(e => e.id === endNear);
          const port = findNearestPort(el.end, bound, BIND_THRESHOLD);
          el.endBinding = port ? { elementId: endNear, side: port.id } : { elementId: endNear };
          el.end = getClosestEdgePoint(el.end, bound);
        }
        // If both bound to same element, bind only the end
        if (startNear && startNear === endNear) {
          const bound = state.elements.find(e => e.id === endNear);
          const port = findNearestPort(el.end, bound, BIND_THRESHOLD);
          el.endBinding = port ? { elementId: endNear, side: port.id } : { elementId: endNear };
          el.end = getClosestEdgePoint(el.end, bound);
        }
      }
      start = null;
      currentArrow = null;
      return { action: 'commit', element: el };
    },
    onPointerCancel() { start = null; currentArrow = null; },
  };
}

function snapToPort(point, elements) {
  const PORT_THRESHOLD = 20;
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!isBindableShape(el)) continue;
    const port = findNearestPort(point, el, PORT_THRESHOLD);
    if (port) return { x: port.x, y: port.y };
  }
  return null;
}

// ── Arrow binding helpers ──
const BIND_THRESHOLD = 15;

function findBinding(elements, point, eps) {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!isBindableShape(el)) continue;
    if (isPointNearShape(point, el, eps || BIND_THRESHOLD)) return el.id;
  }
  return null;
}

function isBindableShape(el) {
  return el.type === 'rect' || el.type === 'ellipse' || el.type === 'terminator' ||
         el.type === 'diamond' || el.type === 'parallelogram' || el.type === 'double-rect' ||
         el.type === 'circle';
}

function isPointNearShape(point, shape, threshold) {
  const bbx = shape.x || 0, bby = shape.y || 0;
  const bbw = shape.width || 0, bbh = shape.height || 0;
  // Expand bbox by threshold and see if point is inside expanded bbox
  // but NOT inside the original bbox (or within threshold of the edge)
  const expanded = point.x >= bbx - threshold && point.x <= bbx + bbw + threshold &&
                   point.y >= bby - threshold && point.y <= bby + bbh + threshold;
  if (!expanded) return false;
  // Check if point is within threshold of any edge
  const left = Math.abs(point.x - bbx);
  const right = Math.abs(point.x - (bbx + bbw));
  const top = Math.abs(point.y - bby);
  const bottom = Math.abs(point.y - (bby + bbh));
  return Math.min(left, right, top, bottom) <= threshold;
}

function getClosestEdgePoint(point, shape) {
  const bbx = shape.x || 0, bby = shape.y || 0;
  const bbw = shape.width || 0, bbh = shape.height || 0;
  // Compute closest point on the bbox edge to the given point
  const cx = Math.max(bbx, Math.min(point.x, bbx + bbw));
  const cy = Math.max(bby, Math.min(point.y, bby + bbh));
  // If the point is inside the bbox, snap it to the nearest edge
  if (cx === point.x && cy === point.y) {
    // Point is inside — push to closest edge
    const dLeft = point.x - bbx;
    const dRight = (bbx + bbw) - point.x;
    const dTop = point.y - bby;
    const dBottom = (bby + bbh) - point.y;
    const minD = Math.min(dLeft, dRight, dTop, dBottom);
    if (minD === dLeft) return { x: bbx, y: cy };
    if (minD === dRight) return { x: bbx + bbw, y: cy };
    if (minD === dTop) return { x: cx, y: bby };
    return { x: cx, y: bby + bbh };
  }
  // Point is outside — clamp to bbox edge
  return { x: cx, y: cy };
}

export function getConnectionPorts(shape) {
  const x = shape.x || 0, y = shape.y || 0;
  const w = shape.width || 0, h = shape.height || 0;
  return [
    { id: 'top',    x: x + w / 2, y: y },
    { id: 'bottom', x: x + w / 2, y: y + h },
    { id: 'left',   x: x,         y: y + h / 2 },
    { id: 'right',  x: x + w,     y: y + h / 2 },
  ];
}

export function findNearestPort(point, shape, threshold) {
  const ports = getConnectionPorts(shape);
  let best = null;
  let bestDist = threshold;
  for (const p of ports) {
    const d = Math.hypot(point.x - p.x, point.y - p.y);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

export function updateArrowBindings(state) {
  for (const el of state.elements) {
    if (el.type !== 'arrow' && el.type !== 'line') continue;
    if (el.startBinding) {
      const bound = state.elements.find(e => e.id === el.startBinding.elementId);
      if (bound) {
        const newPos = getPortOrEdgePosition(el.startBinding.side, bound, el.end);
        el.start.x = newPos.x;
        el.start.y = newPos.y;
      }
    }
    if (el.endBinding) {
      const bound = state.elements.find(e => e.id === el.endBinding.elementId);
      if (bound) {
        const newPos = getPortOrEdgePosition(el.endBinding.side, bound, el.start);
        el.end.x = newPos.x;
        el.end.y = newPos.y;
      }
    }
    computeArrowWaypoints(el, state.elements);
  }
}

function getPortOrEdgePosition(side, bound, oppositePoint) {
  if (side) {
    const port = getConnectionPorts(bound).find(p => p.id === side);
    if (port) return port;
  }
  return getClosestEdgePoint(oppositePoint, bound);
}

// ── Orthogonal arrow routing ──
function computeArrowWaypoints(el, elements) {
  const start = { x: el.start.x, y: el.start.y };
  const end = { x: el.end.x, y: el.end.y };
  const skipIds = new Set();
  if (el.startBinding) skipIds.add(el.startBinding.elementId);
  if (el.endBinding) skipIds.add(el.endBinding.elementId);
  el.waypoints = routeOrthogonal(start, end, elements, el, skipIds);
}

function routeOrthogonal(start, end, elements, skipEl, skipIds) {
  if (!lineIntersectsAnyElement(start, end, elements, skipEl, skipIds)) return null;

  const l1 = [start, { x: end.x, y: start.y }, end];
  if (!pathIntersectsAnyElement(l1, elements, skipEl, skipIds)) return l1;

  const l2 = [start, { x: start.x, y: end.y }, end];
  if (!pathIntersectsAnyElement(l2, elements, skipEl, skipIds)) return l2;

  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  const z1 = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  if (!pathIntersectsAnyElement(z1, elements, skipEl, skipIds)) return z1;

  const z2 = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
  if (!pathIntersectsAnyElement(z2, elements, skipEl, skipIds)) return z2;

  const offsets = [80, 160, -80, -160];
  for (const off of offsets) {
    const z3 = [start, { x: midX + off, y: start.y }, { x: midX + off, y: end.y }, end];
    if (!pathIntersectsAnyElement(z3, elements, skipEl, skipIds)) return z3;
    const z4 = [start, { x: start.x, y: midY + off }, { x: end.x, y: midY + off }, end];
    if (!pathIntersectsAnyElement(z4, elements, skipEl, skipIds)) return z4;
  }

  // Fallback: find the union bbox of all obstacles, route around it
  let obsMinX = Infinity, obsMinY = Infinity, obsMaxX = -Infinity, obsMaxY = -Infinity;
  for (const el of elements) {
    if (el.id === skipEl?.id) continue;
    if (skipIds && skipIds.has(el.id)) continue;
    if (el.type === 'arrow' || el.type === 'line') continue;
    if (!isObstacle(el)) continue;
    const bb = getElementBBox(el);
    obsMinX = Math.min(obsMinX, bb.x);
    obsMinY = Math.min(obsMinY, bb.y);
    obsMaxX = Math.max(obsMaxX, bb.x + bb.w);
    obsMaxY = Math.max(obsMaxY, bb.y + bb.h);
  }

  if (obsMinX !== Infinity) {
    for (const extra of [20, 60, 120, 200, 320]) {
      const above = [start, { x: start.x, y: obsMinY - extra }, { x: end.x, y: obsMinY - extra }, end];
      if (!pathIntersectsAnyElement(above, elements, skipEl, skipIds)) return above;
      const below = [start, { x: start.x, y: obsMaxY + extra }, { x: end.x, y: obsMaxY + extra }, end];
      if (!pathIntersectsAnyElement(below, elements, skipEl, skipIds)) return below;
      const left = [start, { x: obsMinX - extra, y: start.y }, { x: obsMinX - extra, y: end.y }, end];
      if (!pathIntersectsAnyElement(left, elements, skipEl, skipIds)) return left;
      const right = [start, { x: obsMaxX + extra, y: start.y }, { x: obsMaxX + extra, y: end.y }, end];
      if (!pathIntersectsAnyElement(right, elements, skipEl, skipIds)) return right;
    }
  }

  // Absolute last resort: curved bezier path approximated with line segments
  return computeCurvedPath(start, end, 80);
}

function computeCurvedPath(start, end, offset) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return [start, end];
  const nx = -dy / len * offset;
  const ny = dx / len * offset;
  const cp1 = { x: start.x + dx * 0.4 + nx, y: start.y + dy * 0.4 + ny };
  const cp2 = { x: start.x + dx * 0.6 + nx, y: start.y + dy * 0.6 + ny };
  const pts = [];
  for (let t = 0; t <= 1; t += 0.1) {
    const mt = 1 - t;
    const x = mt * mt * mt * start.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * end.x;
    const y = mt * mt * mt * start.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * end.y;
    pts.push({ x, y });
  }
  return pts;
}

function lineIntersectsRect(p1, p2, rect) {
  const rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
  // Check if either endpoint is inside the rect
  if (p1.x >= rx && p1.x <= rx + rw && p1.y >= ry && p1.y <= ry + rh) return true;
  if (p2.x >= rx && p2.x <= rx + rw && p2.y >= ry && p2.y <= ry + rh) return true;
  // Check line-rect edge intersection
  const edges = [
    [{ x: rx, y: ry }, { x: rx + rw, y: ry }], // top
    [{ x: rx, y: ry + rh }, { x: rx + rw, y: ry + rh }], // bottom
    [{ x: rx, y: ry }, { x: rx, y: ry + rh }], // left
    [{ x: rx + rw, y: ry }, { x: rx + rw, y: ry + rh }], // right
  ];
  for (const [e1, e2] of edges) {
    if (segmentsIntersect(p1, p2, e1, e2)) return true;
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const det = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(det) < 1e-10) return false; // parallel
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / det;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / det;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function isObstacle(el) {
  return el.type === 'rect' || el.type === 'ellipse' || el.type === 'terminator' ||
         el.type === 'diamond' || el.type === 'parallelogram' || el.type === 'double-rect' ||
         el.type === 'circle';
}

function lineIntersectsAnyElement(p1, p2, elements, skipEl, skipIds) {
  for (const el of elements) {
    if (el.id === skipEl?.id) continue;
    if (skipIds && skipIds.has(el.id)) continue;
    if (el.type === 'arrow' || el.type === 'line') continue;
    if (!isObstacle(el)) continue;
    const bb = getElementBBox(el);
    const margin = 10;
    const expanded = { x: bb.x - margin, y: bb.y - margin, w: bb.w + margin * 2, h: bb.h + margin * 2 };
    if (lineIntersectsRect(p1, p2, expanded)) return true;
  }
  return false;
}

function pathIntersectsAnyElement(path, elements, skipEl, skipIds) {
  for (let i = 0; i < path.length - 1; i++) {
    if (lineIntersectsAnyElement(path[i], path[i + 1], elements, skipEl, skipIds)) return true;
  }
  return false;
}

// ── Resize helpers ──
function getElementBBox(el) {
  if (el.type === 'line' || el.type === 'arrow') {
    return { x: Math.min(el.start.x, el.end.x), y: Math.min(el.start.y, el.end.y),
             w: Math.abs(el.end.x - el.start.x), h: Math.abs(el.end.y - el.start.y) };
  }
  if (el.type === 'text') {
    const fs = el.fontSize || 20;
    const w = (el.text || '').length * fs * 0.5;
    const h = (el.text || '').split('\n').length * fs * 1.2;
    return { x: el.x, y: el.y, w, h };
  }
  if (el.type === 'pen' && el.points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of el.points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: el.x || 0, y: el.y || 0, w: el.width || 0, h: el.height || 0 };
}

const HANDLE_DEFS = [
  { id: 'tl', fx: 0, fy: 0, cursor: 'nw-resize', opp: { fx: 1, fy: 1 } },
  { id: 'tc', fx: 0.5, fy: 0, cursor: 'n-resize',  opp: { fx: 0.5, fy: 1 } },
  { id: 'tr', fx: 1, fy: 0, cursor: 'ne-resize', opp: { fx: 0, fy: 1 } },
  { id: 'ml', fx: 0, fy: 0.5, cursor: 'w-resize',  opp: { fx: 1, fy: 0.5 } },
  { id: 'mr', fx: 1, fy: 0.5, cursor: 'e-resize',  opp: { fx: 0, fy: 0.5 } },
  { id: 'bl', fx: 0, fy: 1, cursor: 'sw-resize', opp: { fx: 1, fy: 0 } },
  { id: 'bc', fx: 0.5, fy: 1, cursor: 's-resize',  opp: { fx: 0.5, fy: 0 } },
  { id: 'br', fx: 1, fy: 1, cursor: 'se-resize', opp: { fx: 0, fy: 0 } },
];

export function getResizeHandles(el) {
  if (el.type === 'line' || el.type === 'arrow') {
    return [
      { id: 'start', x: el.start.x, y: el.start.y, cursor: 'move', isEndpoint: true },
      { id: 'end',   x: el.end.x,   y: el.end.y,   cursor: 'move', isEndpoint: true },
    ];
  }
  const bb = getElementBBox(el);
  return HANDLE_DEFS.map(h => ({ id: h.id, x: bb.x + bb.w * h.fx, y: bb.y + bb.h * h.fy, cursor: h.cursor }));
}

export function getResizeHandleAt(worldX, worldY, el, viewport) {
  const margin = 8 / (viewport.zoom || 1);
  const handles = getResizeHandles(el);
  for (const h of handles) {
    if (Math.abs(worldX - h.x) < margin && Math.abs(worldY - h.y) < margin) return h;
  }
  return null;
}

function doResize(el, handleId, fixedBBox, startSnap, mouseWorld) {
  const MIN_SIZE = 10;
  if (el.type === 'line' || el.type === 'arrow') {
    if (handleId === 'start') { el.start.x = mouseWorld.x; el.start.y = mouseWorld.y; }
    if (handleId === 'end')   { el.end.x = mouseWorld.x;   el.end.y = mouseWorld.y;   }
    return;
  }
  if (el.type === 'pen') {
    const def = HANDLE_DEFS.find(h => h.id === handleId);
    if (!def) return;
    const oppFx = def.opp.fx, oppFy = def.opp.fy;
    const fixedX = fixedBBox.x + fixedBBox.w * oppFx;
    const fixedY = fixedBBox.y + fixedBBox.h * oppFy;
    const scaleX = Math.max(0.1, Math.abs(mouseWorld.x - fixedX) / (fixedBBox.w || 1));
    const scaleY = Math.max(0.1, Math.abs(mouseWorld.y - fixedY) / (fixedBBox.h || 1));
    el.points = startSnap.points.map(p => ({
      x: fixedX + (p.x - fixedX) * scaleX,
      y: fixedY + (p.y - fixedY) * scaleY,
    }));
    return;
  }
  if (el.type === 'text') {
    const def = HANDLE_DEFS.find(h => h.id === handleId);
    if (!def) return;
    const oppFx = def.opp.fx, oppFy = def.opp.fy;
    const fixedX = fixedBBox.x + fixedBBox.w * oppFx;
    const fixedY = fixedBBox.y + fixedBBox.h * oppFy;
    const newW2 = Math.max(MIN_SIZE, Math.abs(mouseWorld.x - fixedX));
    const newH2 = Math.max(MIN_SIZE, Math.abs(mouseWorld.y - fixedY));
    const ratioX = newW2 / (fixedBBox.w || 1);
    const ratioY = newH2 / (fixedBBox.h || 1);
    const ratio = Math.max(0.3, Math.min(3, Math.max(ratioX, ratioY)));
    el.fontSize = Math.round((startSnap.fontSize || 20) * ratio);
    el.x = fixedX - (fixedBBox.w * ratio) * oppFx;
    el.y = fixedY - (fixedBBox.h * ratio) * oppFy;
    return;
  }
  // Shapes: rect, ellipse, terminator, diamond, parallelogram, double-rect, circle
  const def = HANDLE_DEFS.find(h => h.id === handleId);
  if (!def) return;
  const oppFx = def.opp.fx, oppFy = def.opp.fy;
  const fixedX = fixedBBox.x + fixedBBox.w * oppFx;
  const fixedY = fixedBBox.y + fixedBBox.h * oppFy;
  el.x = Math.min(fixedX, mouseWorld.x);
  el.y = Math.min(fixedY, mouseWorld.y);
  el.width  = Math.max(MIN_SIZE, Math.abs(mouseWorld.x - fixedX));
  el.height = Math.max(MIN_SIZE, Math.abs(mouseWorld.y - fixedY));
  // Preserve circle aspect ratio
  if (el.type === 'circle' || el.lockAspect) {
    const side = Math.max(el.width, el.height);
    el.width = side;
    el.height = side;
  }
}

export function createSelectTool() {
  let dragging = false;
  let dragStart = null;
  let dragOriginals = null;
  let moved = false;
  let resizing = false;
  let resizeData = null;

  return {
    onPointerDown(state, viewport, canvas, e) {
      const pos = worldPos(canvas, viewport, e.clientX, e.clientY);

      // Check resize handles on already-selected elements first
      if (state.selectedIds.length === 1) {
        const el = state.elements.find(e => e.id === state.selectedIds[0]);
        if (el) {
          const handle = getResizeHandleAt(pos.x, pos.y, el, viewport);
          if (handle) {
            resizing = true;
            resizeData = {
              handleId: handle.id,
              startMouse: { x: e.clientX, y: e.clientY },
              startSnap: JSON.parse(JSON.stringify(el)),
              bbox: getElementBBox(el),
              isEndpoint: handle.isEndpoint,
            };
            dragStart = { x: e.clientX, y: e.clientY };
            moved = false;
            return { action: 'select', element: el };
          }
        }
      }

      for (let i = state.elements.length - 1; i >= 0; i--) {
        const el = state.elements[i];
        el._viewportZoom = viewport.zoom;
        if (hitTest(pos.x, pos.y, el)) {
          if (e.shiftKey) {
            const idx = state.selectedIds.indexOf(el.id);
            if (idx === -1) state.selectedIds.push(el.id);
            else state.selectedIds.splice(idx, 1);
          } else {
            state.selectedIds = [el.id];
          }
          dragging = true;
          dragStart = { x: e.clientX, y: e.clientY };
          const idsToMove = new Set(state.selectedIds);
          for (const selId of state.selectedIds) {
            for (const child of state.elements) {
              if (child.type === 'text' && child.parentId === selId && !idsToMove.has(child.id)) {
                idsToMove.add(child.id);
              }
            }
          }
          dragOriginals = [];
          for (const id of idsToMove) {
            const src = state.elements.find(e => e.id === id);
            if (src) dragOriginals.push({ id, snapshot: JSON.parse(JSON.stringify(src)) });
          }
          moved = false;
          return { action: 'select', element: el };
        }
      }
      state.selectedIds = [];
      return { action: 'deselect' };
    },
    onPointerMove(state, viewport, canvas, e) {
      if (resizing && resizeData) {
        const dx = (e.clientX - resizeData.startMouse.x) / viewport.zoom;
        const dy = (e.clientY - resizeData.startMouse.y) / viewport.zoom;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
        if (!moved) return { action: 'none' };

        const el = state.elements.find(e => e.id === state.selectedIds[0]);
        if (el) {
          const mouseWorld = worldPos(canvas, viewport, e.clientX, e.clientY);
          doResize(el, resizeData.handleId, resizeData.bbox, resizeData.startSnap, mouseWorld);
          updateArrowBindings(state);
        }
        return { action: 'move' };
      }

      if (!dragging || state.selectedIds.length === 0) return null;
      const dx = (e.clientX - dragStart.x) / viewport.zoom;
      const dy = (e.clientY - dragStart.y) / viewport.zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;

      if (!moved) return { action: 'none' };

      for (const entry of dragOriginals) {
        const el = state.elements.find(e => e.id === entry.id);
        if (!el) continue;
        const orig = entry.snapshot;
        if (el.type === 'pen') {
          el.points = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        } else if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'text' ||
                   el.type === 'terminator' || el.type === 'diamond' || el.type === 'parallelogram' ||
                   el.type === 'double-rect' || el.type === 'circle') {
          el.x = orig.x + dx;
          el.y = orig.y + dy;
        } else if (el.type === 'line' || el.type === 'arrow') {
          el.start.x = orig.start.x + dx;
          el.start.y = orig.start.y + dy;
          el.end.x = orig.end.x + dx;
          el.end.y = orig.end.y + dy;
        }
      }
      updateArrowBindings(state);
      return { action: 'move' };
    },
    onPointerUp() {
      if (resizing && moved) {
        resizing = false;
        return { action: 'commit-move' };
      }
      resizing = false;
      if (dragging && moved) {
        dragging = false;
        return { action: 'commit-move' };
      }
      dragging = false;
      return null;
    },
    onPointerCancel() { dragging = false; moved = false; resizing = false; },
  };
}

export function createTextTool() {
  return {
    onPointerDown(state, viewport, canvas, e) {
      const pos = worldPos(canvas, viewport, e.clientX, e.clientY);
      return { action: 'place-text', x: pos.x, y: pos.y, clientX: e.clientX, clientY: e.clientY, viewport };
    },
    onPointerMove() { return null; },
    onPointerUp() { return null; },
    onPointerCancel() {},
  };
}

// ── Flowchart shapes tool ──
export const SHAPES = [
  { id: 'rect',        name: 'Rectangle (Process)',          desc: 'A step or action' },
  { id: 'terminator',  name: 'Oval (Terminator)',            desc: 'Start or End of the process' },
  { id: 'diamond',     name: 'Diamond (Decision)',           desc: 'A question or condition (Yes/No)' },
  { id: 'parallelogram', name: 'Parallelogram (Input/Output)', desc: 'Input or output of data' },
  { id: 'circle',      name: 'Circle (Connector)',           desc: 'Connects parts of the flowchart' },
  { id: 'double-rect', name: 'Double Rect (Predefined)',     desc: 'A function or subroutine' },
  { id: 'arrow',       name: 'Arrow (Flowline)',             desc: 'Shows the direction of flow' },
];

export function createShapeDrawTool(shapeType) {
  let start = null;
  let current = null;
  return {
    onPointerDown(state, viewport, canvas, e) {
      start = worldPos(canvas, viewport, e.clientX, e.clientY);
      const base = {
        id: nextId(),
        type: shapeType,
        x: start.x, y: start.y, width: 0, height: 0,
        stroke: state.color,
        strokeWidth: state.strokeWidth,
        fill: state.fillColor,
        opacity: state.opacity,
      };
      if (shapeType === 'circle') base.lockAspect = true;
      current = base;
      return { action: 'drawing', element: current };
    },
    onPointerMove(state, viewport, canvas, e) {
      if (!current || !start) return null;
      let pos = worldPos(canvas, viewport, e.clientX, e.clientY);
      if (shapeType === 'circle') {
        const dx = Math.abs(pos.x - start.x);
        const dy = Math.abs(pos.y - start.y);
        const side = Math.max(dx, dy);
        pos = { x: start.x + (pos.x >= start.x ? side : -side), y: start.y + (pos.y >= start.y ? side : -side) };
      }
      current.x = Math.min(start.x, pos.x);
      current.y = Math.min(start.y, pos.y);
      current.width = Math.abs(pos.x - start.x);
      current.height = Math.abs(pos.y - start.y);
      return { action: 'update', element: current };
    },
    onPointerUp(state, viewport, canvas, e) {
      if (!current || !start) return null;
      let pos = worldPos(canvas, viewport, e.clientX, e.clientY);
      if (shapeType === 'circle') {
        const dx = Math.abs(pos.x - start.x);
        const dy = Math.abs(pos.y - start.y);
        const side = Math.max(dx, dy);
        pos = { x: start.x + (pos.x >= start.x ? side : -side), y: start.y + (pos.y >= start.y ? side : -side) };
      }
      current.x = Math.min(start.x, pos.x);
      current.y = Math.min(start.y, pos.y);
      current.width = Math.abs(pos.x - start.x);
      current.height = Math.abs(pos.y - start.y);
      const el = current;
      start = null;
      current = null;
      return { action: 'commit', element: el };
    },
    onPointerCancel() { start = null; current = null; },
  };
}

export { hitTest, worldPos, textWidth, textHeight, getElementBBox };
