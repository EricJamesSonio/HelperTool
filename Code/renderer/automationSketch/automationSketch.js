import SketchState from './state/sketchState.js';
import CanvasEngine from './canvas/canvasEngine.js';
import { renderSketchList, bindSketchList } from './ui/sketchList.js';
import { renderToolbar, bindToolbar } from './ui/toolbar.js';
import { renderSidebar, bindSidebar } from './ui/sidebar.js';
import { renderInspector, bindInspector } from './ui/inspector.js';

export default class AutomationSketch {
  constructor() {
    this.state = new SketchState();
    this.canvasEngine = null;
    this._container = null;
    this._canvasEl = null;
    this._sidebarEl = null;
    this._inspectorEl = null;
    this._draggingNode = null;
    this._dragOffset = { x: 0, y: 0 };
    this._isPanning = false;
    this._panStart = { x: 0, y: 0 };
    this._connectingPort = null;
    this._keydownHandler = null;
  }

  async init() {
    await this._loadSketches();
  }

  async _loadSketches() {
    try {
      const res = await window.electronAPI.automation.list();
      if (res.success) {
        this.state.sketches = res.sketches;
      }
    } catch (err) {
      console.error('[AutomationSketch] Failed to load sketches:', err);
    }
  }

  render(container) {
    this._container = container;
    this._renderList();
  }

  _renderList() {
    if (!this._container) return;
    this.state.view = 'list';
    this._container.innerHTML = renderSketchList(this.state.sketches, {});
    bindSketchList(this._container, {
      onNew: () => this._createNew(),
      onOpen: (id) => this._openSketch(id),
      onDelete: (id) => this._deleteSketch(id),
    });
  }

  _renderEditor() {
    if (!this._container) return;
    this.state.view = 'editor';

    this._container.innerHTML = `
      <div class="as-editor-layout">
        <div class="as-editor-toolbar" id="asToolbar"></div>
        <div class="as-editor-body">
          <div class="as-editor-sidebar" id="asSidebar"></div>
          <div class="as-editor-canvas-wrap">
            <canvas class="as-canvas" id="asCanvas"></canvas>
            <div class="as-drop-indicator" id="asDropIndicator">Drop node here</div>
          </div>
          <div class="as-editor-inspector" id="asInspector"></div>
        </div>
      </div>`;

    this._canvasEl = this._container.querySelector('#asCanvas');
    this._sidebarEl = this._container.querySelector('#asSidebar');
    this._inspectorEl = this._container.querySelector('#asInspector');

    this._renderToolbar();
    this._renderSidebar();
    this._renderInspector();
    this._initCanvas();
    this._bindCanvasEvents();
    this._bindKeyboard();
  }

  _renderToolbar() {
    const tb = this._container.querySelector('#asToolbar');
    if (!tb) return;
    tb.innerHTML = renderToolbar(this.state);
    bindToolbar(tb, {
      onBack: () => this._goBack(),
      onSave: () => this._save(),
      onUndo: () => { this.state.undo(); this._onStateChange(); },
      onRedo: () => { this.state.redo(); this._onStateChange(); },
      onZoomIn: () => { this.state.viewport.scale = Math.min(2, this.state.viewport.scale + 0.1); this.canvasEngine?.markDirty(); this._renderToolbar(); },
      onZoomOut: () => { this.state.viewport.scale = Math.max(0.25, this.state.viewport.scale - 0.1); this.canvasEngine?.markDirty(); this._renderToolbar(); },
      onZoomFit: () => this._zoomFit(),
      onDelete: () => this._deleteCurrentSketch(),
      onRename: (name) => { this.state.renameSketch(name); },
    });
  }

  _renderSidebar() {
    const sb = this._container.querySelector('#asSidebar');
    if (!sb) return;
    sb.innerHTML = renderSidebar();
    bindSidebar(sb, {});
  }

  _renderInspector() {
    const ip = this._container.querySelector('#asInspector');
    if (!ip) return;
    ip.innerHTML = renderInspector(this.state);
    bindInspector(ip, this.state, {
      onChange: () => { this.canvasEngine?.markDirty(); this._onStateChange(); },
    });
  }

  _initCanvas() {
    if (!this._canvasEl) return;
    this.canvasEngine = new CanvasEngine(this._canvasEl, this.state);
  }

  _bindCanvasEvents() {
    const canvas = this._canvasEl;
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => this._onCanvasMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this._onCanvasMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this._onCanvasMouseUp(e));
    canvas.addEventListener('wheel', (e) => this._onCanvasWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      this._container.querySelector('#asDropIndicator')?.classList.add('as-drop-active');
    });
    canvas.addEventListener('dragleave', () => {
      this._container.querySelector('#asDropIndicator')?.classList.remove('as-drop-active');
    });
    canvas.addEventListener('drop', (e) => this._onCanvasDrop(e));
  }

  _onCanvasMouseDown(e) {
    const rect = this._canvasEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.canvasEngine.screenToWorld(sx, sy);

    const portHit = this.canvasEngine.getPortAtPoint(world.x, world.y);

    if (portHit && portHit.type === 'output') {
      this.state.pushHistory();
      this._connectingPort = portHit;
      this.canvasEngine.setInProgressEdge(portHit.node, portHit.portIndex);
      return;
    }

    if (e.button === 1 || e.altKey) {
      this._isPanning = true;
      this._panStart = { x: e.clientX - this.state.viewport.x, y: e.clientY - this.state.viewport.y };
      this._canvasEl.style.cursor = 'grabbing';
      return;
    }

    const node = this.canvasEngine.getNodeAtPoint(world.x, world.y);
    if (node) {
      this.state.selectedNodeId = node.id;
      this.state.selectedEdgeId = null;
      this.state.pushHistory();
      this._draggingNode = node;
      this._dragOffset = { x: world.x - node.x, y: world.y - node.y };
      this._canvasEl.style.cursor = 'grabbing';
      this._renderInspector();
      this.canvasEngine.markDirty();
    } else {
      const edge = this._getEdgeAtPoint(world.x, world.y);
      if (edge) {
        this.state.selectedEdgeId = edge.id;
        this.state.selectedNodeId = null;
        this.canvasEngine.markDirty();
      } else {
        this.state.selectedNodeId = null;
        this.state.selectedEdgeId = null;
        this._renderInspector();
        this.canvasEngine.markDirty();
      }
    }
  }

  _onCanvasMouseMove(e) {
    const rect = this._canvasEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.canvasEngine.screenToWorld(sx, sy);
    this.canvasEngine.setMouseWorld(world.x, world.y);

    if (this._isPanning) {
      this.state.viewport.x = e.clientX - this._panStart.x;
      this.state.viewport.y = e.clientY - this._panStart.y;
      this.canvasEngine.markDirty();
      return;
    }

    if (this._draggingNode) {
      this.state.moveNode(this._draggingNode.id, world.x - this._dragOffset.x, world.y - this._dragOffset.y);
      this.canvasEngine.markDirty();
      return;
    }

    if (this._connectingPort) {
      this.canvasEngine.markDirty();
    }
  }

  _onCanvasMouseUp(e) {
    if (this._connectingPort) {
      const rect = this._canvasEl.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.canvasEngine.screenToWorld(sx, sy);
      const portHit = this.canvasEngine.getPortAtPoint(world.x, world.y);

      if (portHit && portHit.type === 'input' && portHit.node.id !== this._connectingPort.node.id) {
        this.state.addEdge(
          this._connectingPort.node.id,
          this._connectingPort.portIndex,
          portHit.node.id,
          portHit.portIndex
        );
        this._onStateChange();
      }

      this._connectingPort = null;
      this.canvasEngine.clearInProgressEdge();
    }

    if (this._draggingNode) {
      this._draggingNode = null;
      this._onStateChange();
    }

    if (this._isPanning) {
      this._isPanning = false;
      this._canvasEl.style.cursor = '';
    }
  }

  _onCanvasWheel(e) {
    e.preventDefault();
    const rect = this._canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const vp = this.state.viewport;
    const oldScale = vp.scale;
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.25, Math.min(2, oldScale + delta));

    const worldX = (mx - vp.x) / oldScale;
    const worldY = (my - vp.y) / oldScale;

    vp.scale = newScale;
    vp.x = mx - worldX * newScale;
    vp.y = my - worldY * newScale;

    this._renderToolbar();
    this.canvasEngine.markDirty();
  }

  _onCanvasDrop(e) {
    e.preventDefault();
    this._container.querySelector('#asDropIndicator')?.classList.remove('as-drop-active');

    const type = e.dataTransfer.getData('text/plain');
    if (!type) return;

    const rect = this._canvasEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.canvasEngine.screenToWorld(sx, sy);

    this.state.pushHistory();
    this.state.addNode(type, world.x - 100, world.y - 40);
    this._onStateChange();
  }

  _getEdgeAtPoint(worldX, worldY) {
    const threshold = 8;
    for (const edge of this.state.edges) {
      const fromNode = this.state.nodes.find(n => n.id === edge.fromNodeId);
      const toNode = this.state.nodes.find(n => n.id === edge.toNodeId);
      if (!fromNode || !toNode) continue;

      const fromPort = this.canvasEngine._getOutputPort(fromNode, edge.fromPort);
      const toPort = this.canvasEngine._getInputPort(toNode, edge.toPort);
      if (!fromPort || !toPort) continue;

      const cp1x = fromPort.x + Math.abs(toPort.x - fromPort.x) * 0.5;
      const cp2x = toPort.x - Math.abs(toPort.x - fromPort.x) * 0.5;

      for (let t = 0; t <= 1; t += 0.02) {
        const bx = Math.pow(1 - t, 3) * fromPort.x + 3 * Math.pow(1 - t, 2) * t * cp1x + 3 * (1 - t) * Math.pow(t, 2) * cp2x + Math.pow(t, 3) * toPort.x;
        const by = Math.pow(1 - t, 3) * fromPort.y + 3 * Math.pow(1 - t, 2) * t * fromPort.y + 3 * (1 - t) * Math.pow(t, 2) * toPort.y + Math.pow(t, 3) * toPort.y;
        if (Math.hypot(worldX - bx, worldY - by) < threshold) return edge;
      }
    }
    return null;
  }

  _bindKeyboard() {
    this._keydownHandler = (e) => {
      if (this.state.view !== 'editor') return;

      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.state.undo();
        this._onStateChange();
      } else if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.state.redo();
        this._onStateChange();
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this._save();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.state.selectedNodeId) {
          this.state.pushHistory();
          this.state.removeNode(this.state.selectedNodeId);
          this._onStateChange();
        } else if (this.state.selectedEdgeId) {
          this.state.pushHistory();
          this.state.removeEdge(this.state.selectedEdgeId);
          this._onStateChange();
        }
      } else if (e.key === 'Escape') {
        this.state.selectedNodeId = null;
        this.state.selectedEdgeId = null;
        this._renderInspector();
        this.canvasEngine?.markDirty();
      }
    };
    document.addEventListener('keydown', this._keydownHandler);
  }

  _onStateChange() {
    this._renderToolbar();
    this._renderInspector();
    this.canvasEngine?.markDirty();
  }

  _zoomFit() {
    if (this.state.nodes.length === 0) return;
    const canvasW = this._canvasEl?.offsetWidth || 800;
    const canvasH = this._canvasEl?.offsetHeight || 600;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.state.nodes) {
      const h = this.state.getNodeHeight(n);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + 200);
      maxY = Math.max(maxY, n.y + h);
    }

    const padding = 40;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const scale = Math.min(canvasW / contentW, canvasH / contentH, 1.5);

    this.state.viewport.scale = scale;
    this.state.viewport.x = (canvasW - (minX + maxX) * scale) / 2;
    this.state.viewport.y = (canvasH - (minY + maxY) * scale) / 2;

    this._renderToolbar();
    this.canvasEngine?.markDirty();
  }

  async _save() {
    const data = this.state.getSerializable();
    if (!data.id) {
      data.id = 'sketch_' + Date.now();
      this.state.activeSketchId = data.id;
    }
    if (!data.name) data.name = 'Untitled';
    data.createdAt = this.state.activeSketchId ? undefined : Date.now();

    try {
      const res = await window.electronAPI.automation.save({ sketch: data });
      if (res.success) {
        this.state.activeSketchId = res.sketch.id;
        this.state.isDirty = false;
        await this._loadSketches();
      }
    } catch (err) {
      console.error('[AutomationSketch] Save failed:', err);
    }
  }

  async _loadSketches() {
    try {
      const res = await window.electronAPI.automation.list();
      if (res.success) this.state.sketches = res.sketches;
    } catch (err) {
      console.error('[AutomationSketch] Load failed:', err);
    }
  }

  async _openSketch(id) {
    try {
      const res = await window.electronAPI.automation.load({ id });
      if (res.success) {
        this.state.loadFromSerializable(res.sketch);
        this._renderEditor();
        if (this.canvasEngine) {
          setTimeout(() => this._zoomFit(), 50);
        }
      }
    } catch (err) {
      console.error('[AutomationSketch] Open failed:', err);
    }
  }

  async _deleteSketch(id) {
    try {
      await window.electronAPI.automation.delete({ id });
      await this._loadSketches();
      this._renderList();
    } catch (err) {
      console.error('[AutomationSketch] Delete failed:', err);
    }
  }

  async _deleteCurrentSketch() {
    if (!this.state.activeSketchId) return;
    await this._deleteSketch(this.state.activeSketchId);
  }

  async _createNew() {
    this.state.reset();
    this.state.activeSketchId = null;
    this.state.sketchName = 'Untitled';
    this._renderEditor();
    if (this.canvasEngine) {
      setTimeout(() => this.canvasEngine.markDirty(), 50);
    }
  }

  async _goBack() {
    await this._loadSketches();
    this._destroyEditor();
    this._renderList();
  }

  _destroyEditor() {
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this.canvasEngine) {
      this.canvasEngine.stop();
      this.canvasEngine = null;
    }
    this._canvasEl = null;
    this._sidebarEl = null;
    this._inspectorEl = null;
    this._draggingNode = null;
    this._connectingPort = null;
    this._isPanning = false;
  }

  destroy() {
    this._destroyEditor();
    this.state.reset();
    this._container = null;
  }
}
