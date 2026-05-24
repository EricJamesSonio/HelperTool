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
      start = worldPos(canvas, viewport, e.clientX, e.clientY);
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
      currentArrow.end = worldPos(canvas, viewport, e.clientX, e.clientY);
      return { action: 'update', element: currentArrow };
    },
    onPointerUp() {
      if (!currentArrow) return null;
      const el = currentArrow;
      start = null;
      currentArrow = null;
      return { action: 'commit', element: el };
    },
    onPointerCancel() { start = null; currentArrow = null; },
  };
}

export function createSelectTool() {
  let dragging = false;
  let dragStart = null;
  let dragOffsets = null;
  let moved = false;
  let undoPushed = false;

  return {
    onPointerDown(state, viewport, canvas, e) {
      const pos = worldPos(canvas, viewport, e.clientX, e.clientY);

      // hit test in reverse (top-most first)
      for (let i = state.elements.length - 1; i >= 0; i--) {
        const el = state.elements[i];
        el._viewportZoom = viewport.zoom;
        if (hitTest(pos.x, pos.y, el)) {
          // Push undo before any move starts
          if (!undoPushed) {
            // undo is pushed by engine on commit-move
          }
          if (e.shiftKey) {
            const idx = state.selectedIds.indexOf(el.id);
            if (idx === -1) state.selectedIds.push(el.id);
            else state.selectedIds.splice(idx, 1);
          } else {
            state.selectedIds = [el.id];
          }
          dragging = true;
          dragStart = { x: e.clientX, y: e.clientY };
          dragOffsets = state.selectedIds.map(id => {
            const e2 = state.elements.find(el => el.id === id);
            return { id, startX: e2.clientX || e2.x || 0, startY: e2.clientY || e2.y || 0 };
          });
          moved = false;
          return { action: 'select', element: el };
        }
      }
      state.selectedIds = [];
      return { action: 'deselect' };
    },
    onPointerMove(state, viewport, canvas, e) {
      if (!dragging || state.selectedIds.length === 0) return null;
      const dx = (e.clientX - dragStart.x) / viewport.zoom;
      const dy = (e.clientY - dragStart.y) / viewport.zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;

      if (!moved) return { action: 'none' };

      for (const selId of state.selectedIds) {
        const el = state.elements.find(e => e.id === selId);
        if (!el) continue;
        if (el.type === 'pen') {
          el.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        } else if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'text' ||
                   el.type === 'terminator' || el.type === 'diamond' || el.type === 'parallelogram' ||
                   el.type === 'double-rect' || el.type === 'circle') {
          el.x += dx;
          el.y += dy;
        } else if (el.type === 'line' || el.type === 'arrow') {
          el.start.x += dx;
          el.start.y += dy;
          el.end.x += dx;
          el.end.y += dy;
        }
      }
      return { action: 'move' };
    },
    onPointerUp() {
      if (dragging && moved) {
        dragging = false;
        return { action: 'commit-move' };
      }
      dragging = false;
      return null;
    },
    onPointerCancel() { dragging = false; moved = false; },
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

export { hitTest, worldPos, textWidth, textHeight };
