import { NODE_TYPES } from '../nodes/nodeRegistry.js';

export default class CanvasEngine {
  constructor(canvasEl, state) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.state = state;
    this._dirty = true;
    this._rafId = null;
    this._resizeObserver = null;

    this._setupResize();
    this.start();
  }

  _setupResize() {
    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = this.canvas.offsetWidth;
      const h = this.canvas.offsetHeight;
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.markDirty();
    };
    updateSize();
    this._resizeObserver = new ResizeObserver(updateSize);
    this._resizeObserver.observe(this.canvas);
  }

  markDirty() { this._dirty = true; }

  start() {
    const loop = () => {
      if (this._dirty) { this._render(); this._dirty = false; }
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._resizeObserver) this._resizeObserver.disconnect();
  }

  _render() {
    const { ctx, canvas, state } = this;
    const vp = state.viewport;

    ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

    ctx.save();
    ctx.translate(vp.x, vp.y);
    ctx.scale(vp.scale, vp.scale);

    this._drawGrid();
    this._drawEdges();
    this._drawNodes();

    ctx.restore();
  }

  _drawGrid() {
    const { ctx, state } = this;
    const vp = state.viewport;
    const gridSize = 20;

    const left = -vp.x / vp.scale;
    const top = -vp.y / vp.scale;
    const right = left + this.canvas.offsetWidth / vp.scale;
    const bottom = top + this.canvas.offsetHeight / vp.scale;

    const startX = Math.floor(left / gridSize) * gridSize;
    const startY = Math.floor(top / gridSize) * gridSize;

    ctx.strokeStyle = 'rgba(128,128,128,0.15)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = startX; x <= right; x += gridSize) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = startY; y <= bottom; y += gridSize) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
  }

  _drawEdges() {
    const { ctx, state } = this;
    for (const edge of state.edges) {
      this.drawEdge(edge, false);
    }
    if (this._inProgressEdge) {
      this._drawInProgressEdge();
    }
  }

  drawEdge(edge, isSelected) {
    const { ctx, state } = this;
    const fromNode = state.nodes.find(n => n.id === edge.fromNodeId);
    const toNode = state.nodes.find(n => n.id === edge.toNodeId);
    if (!fromNode || !toNode) return;

    const fromPort = this._getOutputPort(fromNode, edge.fromPort);
    const toPort = this._getInputPort(toNode, edge.toPort);
    if (!fromPort || !toPort) return;

    this._drawBezier(ctx, fromPort.x, fromPort.y, toPort.x, toPort.y, isSelected);
  }

  _drawInProgressEdge() {
    if (!this._inProgressEdge) return;
    const { ctx, state } = this;
    const { fromNode, fromPort } = this._inProgressEdge;
    const port = this._getOutputPort(fromNode, fromPort);
    if (!port) return;

    ctx.save();
    ctx.setLineDash([6, 4]);
    this._drawBezier(ctx, port.x, port.y, this._mouseWorldX, this._mouseWorldY, false);
    ctx.restore();
  }

  _drawBezier(ctx, fromX, fromY, toX, toY, isSelected) {
    const cp1x = fromX + Math.abs(toX - fromX) * 0.5;
    const cp1y = fromY;
    const cp2x = toX  - Math.abs(toX - fromX) * 0.5;
    const cp2y = toY;

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toX, toY);
    ctx.strokeStyle = isSelected ? '#4a9eff' : 'rgba(200,200,200,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    this._drawArrow(ctx, cp2x, cp2y, fromX, fromY);
  }

  _drawArrow(ctx, cp2x, cp2y, fromX, fromY) {
    const dx = cp2x - fromX;
    const dy = cp2y - fromY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;

    const size = 8;
    const tipX = cp2x - ux * size;
    const tipY = cp2y - uy * size;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ux * size - uy * size * 0.5, tipY - uy * size + ux * size * 0.5);
    ctx.lineTo(tipX - ux * size + uy * size * 0.5, tipY - uy * size - ux * size * 0.5);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }

  _drawNodes() {
    const { ctx, state } = this;
    for (const node of state.nodes) {
      this.drawNode(node, node.id === state.selectedNodeId);
    }
  }

  drawNode(node, isSelected) {
    const { ctx } = this;
    const def = NODE_TYPES[node.type];
    if (!def) return;

    const w = NODE_WIDTH;
    const h = this._getNodeHeight(node);
    const headerH = 36;

    if (isSelected) {
      ctx.save();
      ctx.shadowColor = '#4a9eff';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(74,158,255,0.3)';
      roundRect(ctx, node.x - 2, node.y - 2, w + 4, h + 4, 8);
      ctx.fill();
      ctx.restore();
    }

    roundRect(ctx, node.x, node.y, w, h, 6);
    ctx.fillStyle = 'var(--bg-surface, #1e1e2e)';
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#4a9eff' : 'var(--border-default, #3a3a4a)';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();

    roundRect(ctx, node.x, node.y, w, headerH, [6, 6, 0, 0]);
    ctx.fillStyle = def.color;
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const iconText = def.icon || '';
    ctx.fillText(iconText + '  ' + node.label, node.x + 10, node.y + headerH / 2);

    const firstFieldKey = def.fields?.[0];
    if (firstFieldKey && node.fields[firstFieldKey]) {
      ctx.fillStyle = 'var(--text-secondary, #888)';
      ctx.font = '11px sans-serif';
      ctx.fillText(node.fields[firstFieldKey], node.x + 10, node.y + headerH + 18);
    }

    this._drawPorts(node, def);
  }

  _drawPorts(node, def) {
    const { ctx } = this;
    const h = this._getNodeHeight(node);

    const inCount = def.maxInputs || 0;
    const outCount = def.maxOutputs || 0;

    const portR = 6;
    const portSpacing = 20;

    if (inCount > 0) {
      const startY = node.y + 36 + 10;
      for (let i = 0; i < inCount; i++) {
        const py = startY + i * portSpacing;
        ctx.beginPath();
        ctx.arc(node.x, py, portR, 0, Math.PI * 2);
        ctx.fillStyle = def.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    if (outCount > 0) {
      const startY = node.y + 36 + 10;
      for (let i = 0; i < outCount; i++) {
        const py = startY + i * portSpacing;
        ctx.beginPath();
        ctx.arc(node.x + NODE_WIDTH, py, portR, 0, Math.PI * 2);
        ctx.fillStyle = def.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (outCount > 1) {
          ctx.fillStyle = '#aaa';
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(i === 0 ? 'True' : 'False', node.x + NODE_WIDTH + 12, py);
        }
      }
    }
  }

  _getNodeHeight(node) {
    const def = NODE_TYPES[node.type];
    const fieldCount = def ? def.fields.length : 1;
    return Math.max(80, 36 + fieldCount * 24 + 16);
  }

  _getOutputPort(node, portIndex) {
    const def = NODE_TYPES[node.type];
    if (!def || !def.maxOutputs) return null;
    const h = this._getNodeHeight(node);
    const startY = node.y + 36 + 10;
    return { x: node.x + NODE_WIDTH, y: startY + portIndex * 20 };
  }

  _getInputPort(node, portIndex) {
    const def = NODE_TYPES[node.type];
    if (!def || !def.maxInputs) return null;
    const h = this._getNodeHeight(node);
    const startY = node.y + 36 + 10;
    return { x: node.x, y: startY + portIndex * 20 };
  }

  getNodeAtPoint(worldX, worldY) {
    const { state } = this;
    for (let i = state.nodes.length - 1; i >= 0; i--) {
      const n = state.nodes[i];
      const h = this._getNodeHeight(n);
      if (worldX >= n.x && worldX <= n.x + NODE_WIDTH &&
          worldY >= n.y && worldY <= n.y + h) {
        return n;
      }
    }
    return null;
  }

  getPortAtPoint(worldX, worldY) {
    const { state } = this;
    const hitR = 20;
    for (const node of state.nodes) {
      const def = NODE_TYPES[node.type];
      if (!def) continue;
      const h = this._getNodeHeight(node);
      const startY = node.y + 36 + 10;

      for (let i = 0; i < (def.maxInputs || 0); i++) {
        const py = startY + i * 20;
        if (Math.hypot(worldX - node.x, worldY - py) < hitR) {
          return { node, portIndex: i, type: 'input' };
        }
      }
      for (let i = 0; i < (def.maxOutputs || 0); i++) {
        const py = startY + i * 20;
        if (Math.hypot(worldX - (node.x + NODE_WIDTH), worldY - py) < hitR) {
          return { node, portIndex: i, type: 'output' };
        }
      }
    }
    return null;
  }

  screenToWorld(sx, sy) {
    const vp = this.state.viewport;
    return {
      x: (sx - vp.x) / vp.scale,
      y: (sy - vp.y) / vp.scale,
    };
  }

  setMouseWorld(x, y) {
    this._mouseWorldX = x;
    this._mouseWorldY = y;
  }

  setInProgressEdge(fromNode, fromPort) {
    this._inProgressEdge = { fromNode, fromPort };
    this.markDirty();
  }

  clearInProgressEdge() {
    this._inProgressEdge = null;
    this.markDirty();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  if (Array.isArray(r)) {
    const [tl, tr, br, bl] = r;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
