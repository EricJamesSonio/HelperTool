import { NODE_TYPES } from '../nodes/nodeRegistry.js';

const NODE_WIDTH = 200;
const MIN_NODE_HEIGHT = 80;

export default class SketchState {
  constructor() {
    this.reset();
  }

  reset() {
    this.view = 'list';
    this.sketches = [];
    this.activeSketchId = null;
    this.sketchName = 'Untitled';
    this.nodes = [];
    this.edges = [];
    this.viewport = { x: 0, y: 0, scale: 1 };
    this.selectedNodeId = null;
    this.selectedEdgeId = null;
    this.isDirty = false;
    this.history = [];
    this.historyIndex = -1;
  }

  get selectedNode() {
    return this.nodes.find(n => n.id === this.selectedNodeId) || null;
  }

  get selectedEdge() {
    return this.edges.find(e => e.id === this.selectedEdgeId) || null;
  }

  getNodeHeight(node) {
    const typeDef = NODE_TYPES[node.type];
    const fieldCount = typeDef ? typeDef.fields.length : 1;
    return Math.max(MIN_NODE_HEIGHT, 36 + fieldCount * 24 + 16);
  }

  snapshot() {
    return {
      nodes: structuredClone(this.nodes),
      edges: structuredClone(this.edges),
    };
  }

  pushHistory() {
    const snap = this.snapshot();
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snap);
    if (this.history.length > 50) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.historyIndex < 0) return false;
    const snap = this.history[this.historyIndex];
    this.nodes = structuredClone(snap.nodes);
    this.edges = structuredClone(snap.edges);
    this.historyIndex--;
    return true;
  }

  redo() {
    if (this.historyIndex + 1 >= this.history.length - 1) return false;
    this.historyIndex++;
    const snap = this.history[this.historyIndex];
    this.nodes = structuredClone(snap.nodes);
    this.edges = structuredClone(snap.edges);
    return true;
  }

  addNode(type, x, y) {
    const typeDef = NODE_TYPES[type];
    if (!typeDef) return null;
    const node = {
      id: 'node_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type,
      x,
      y,
      label: typeDef.label,
      fields: {},
    };
    for (const f of typeDef.fields) {
      node.fields[f] = '';
    }
    this.nodes.push(node);
    this.isDirty = true;
    return node;
  }

  removeNode(nodeId) {
    this.nodes = this.nodes.filter(n => n.id !== nodeId);
    this.edges = this.edges.filter(e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId);
    if (this.selectedNodeId === nodeId) this.selectedNodeId = null;
    this.isDirty = true;
  }

  addEdge(fromNodeId, fromPort, toNodeId, toPort) {
    const edge = {
      id: 'edge_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      fromNodeId,
      fromPort,
      toNodeId,
      toPort,
    };
    this.edges.push(edge);
    this.isDirty = true;
    return edge;
  }

  removeEdge(edgeId) {
    this.edges = this.edges.filter(e => e.id !== edgeId);
    if (this.selectedEdgeId === edgeId) this.selectedEdgeId = null;
    this.isDirty = true;
  }

  moveNode(nodeId, x, y) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) { node.x = x; node.y = y; this.isDirty = true; }
  }

  updateNodeField(nodeId, fieldName, value) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) { node.fields[fieldName] = value; this.isDirty = true; }
  }

  renameSketch(name) {
    this.sketchName = name;
    this.isDirty = true;
  }

  getSerializable() {
    return {
      id: this.activeSketchId,
      name: this.sketchName,
      nodes: this.nodes.map(n => ({
        id: n.id, type: n.type, x: n.x, y: n.y,
        label: n.label, fields: { ...n.fields },
      })),
      edges: this.edges.map(e => ({
        id: e.id, fromNodeId: e.fromNodeId, fromPort: e.fromPort,
        toNodeId: e.toNodeId, toPort: e.toPort,
      })),
    };
  }

  loadFromSerializable(data) {
    this.activeSketchId = data.id || null;
    this.sketchName = data.name || 'Untitled';
    this.nodes = data.nodes || [];
    this.edges = data.edges || [];
    this.selectedNodeId = null;
    this.selectedEdgeId = null;
    this.isDirty = false;
    this.history = [];
    this.historyIndex = -1;
    this.pushHistory();
  }
}
