import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, MarkerType,
  useNodesState, useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { getTableColor } from './colors.js';

let _setNodes = null;
let _setEdges = null;
let _selectNodeCallback = null;
let _reactFlowInstance = null;

function FlowGraph({ graphData, onSelectNode }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const nodesRef = useRef(nodes);

  nodesRef.current = nodes;

  _setNodes = setNodes;
  _setEdges = setEdges;
  _selectNodeCallback = onSelectNode;

  const onInit = useCallback((instance) => {
    _reactFlowInstance = instance;

    window.__dbiSelectNode = (tableName) => {
      setNodes(nds => nds.map(n => {
        const label = n.data.label.split(' (')[0];
        const bg = n.style?.background || '#22d3ee';
        if (label === tableName) {
          return { ...n, style: { ...n.style, border: `3px solid #fff` } };
        }
        return { ...n, style: { ...n.style, border: `2px solid ${bg}` } };
      }));
    };

    window.__dbiCenterNode = (tableName) => {
      const currentNodes = nodesRef.current;
      const match = currentNodes.find(n => n.data.label.startsWith(tableName));
      if (match) {
        instance.setCenter(match.position.x, match.position.y, { zoom: 1.5, duration: 600 });
        window.__dbiSelectNode?.(tableName);
      }
    };
  }, []);

  useEffect(() => {
    if (!graphData) return;
    const autoLayout = computeAutoLayout(graphData.nodes, graphData.edges);
    setNodes(autoLayout.nodes.map((n, i) => {
      const color = getTableColor(n.data.colorIndex || 0);
      return {
        id: n.id,
        type: 'default',
        position: n.position,
        data: {
          label: n.data.label + (n.data.rowCount ? ` (${n.data.rowCount.toLocaleString()})` : ''),
        },
        style: {
          background: color.bg,
          color: color.text,
          border: `2px solid ${color.bg}`,
          borderRadius: '8px',
          padding: '8px 14px',
          fontSize: '13px',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
        },
      };
    }));
    setEdges(graphData.edges.map((e, i) => ({
      id: e.id || 'e_' + i,
      source: e.source,
      target: e.target,
      label: e.label || '',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#60a5fa' },
      style: { stroke: '#556080', strokeWidth: 1.5 },
      labelStyle: { fill: '#94a3c4', fontSize: 10 },
    })));
  }, [graphData]);

  const onNodeClick = useCallback((event, node) => {
    const label = node.data.label.split(' (')[0];
    if (window.__dbiSelectTable) window.__dbiSelectTable(label);
    if (_selectNodeCallback) {
      _selectNodeCallback(label);
    }
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        onNodeClick={onNodeClick}
        fitView
        attributionPosition="bottom-left"
      >
        <Background color="#1a2540" gap={20} />
        <Controls style={{ background: '#0c1427', color: '#94a3c4', border: '1px solid rgba(255,255,255,0.10)' }} />
        <MiniMap
          style={{ background: '#0c1427', border: '1px solid rgba(255,255,255,0.10)' }}
          nodeColor="#1a2540"
          maskColor="rgba(7,13,26,0.7)"
        />
      </ReactFlow>
    </div>
  );
}

function computeAutoLayout(nodes, edges) {
  if (!nodes || nodes.length === 0) return { nodes: [], edges: [] };

  const dag = buildDag(nodes, edges);
  const levels = topologicalLayout(dag);

  const spaced = [];
  const xGap = 220, yGap = 80;
  const startX = 50, startY = 50;

  for (const [level, nodeIds] of levels.entries()) {
    const count = nodeIds.length;
    const totalWidth = (count - 1) * xGap;
    for (let i = 0; i < count; i++) {
      const node = nodes.find(n => n.id === nodeIds[i]);
      if (node) {
        spaced.push({
          ...node,
          position: { x: startX - totalWidth / 2 + i * xGap, y: startY + level * yGap * 2 },
        });
      }
    }
  }

  // Add any nodes not in DAG (no relationships)
  for (const node of nodes) {
    if (!spaced.find(n => n.id === node.id)) {
      spaced.push({ ...node, position: { x: startX + Math.random() * 200, y: startY + Math.random() * 200 } });
    }
  }

  return { nodes: spaced, edges };
}

function buildDag(nodes, edges) {
  const nodeIds = new Set(nodes.map(n => n.id));
  const adj = {};
  const inDegree = {};
  for (const id of nodeIds) { adj[id] = []; inDegree[id] = 0; }
  for (const e of edges) {
    if (adj[e.source]) adj[e.source].push(e.target);
    if (inDegree[e.target] !== undefined) inDegree[e.target]++;
  }
  return { adj, inDegree, nodeIds: Array.from(nodeIds) };
}

function topologicalLayout(dag) {
  const { adj, inDegree, nodeIds } = dag;
  const queue = nodeIds.filter(id => inDegree[id] === 0);
  const levels = [];
  const visited = new Set();

  while (queue.length > 0) {
    const currentLevel = [...queue];
    levels.push(currentLevel);
    const nextQueue = [];
    for (const id of currentLevel) {
      visited.add(id);
      for (const neighbor of adj[id] || []) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0 && !visited.has(neighbor)) {
          nextQueue.push(neighbor);
        }
      }
    }
    queue.length = 0;
    queue.push(...nextQueue);
  }

  // Add unvisited (isolated) nodes at level 0
  const unvisited = nodeIds.filter(id => !visited.has(id));
  if (unvisited.length > 0) levels.unshift(unvisited);

  return levels;
}

let _container = null;
let _root = null;

export function initGraph(container, graphData) {
  _container = container;

  const { createRoot } = require('react-dom/client');
  _root = createRoot(container);

  const selectNode = (tableName) => {
    if (window.__dbiSelectNode) window.__dbiSelectNode(tableName);
  };

  _root.render(React.createElement(FlowGraph, { graphData, onSelectNode: selectNode }));

  return _root;
}

export function updateGraph(root, graphData) {
  if (root) {
    root.render(React.createElement(FlowGraph, {
      graphData,
      onSelectNode: (name) => { if (window.__dbiSelectNode) window.__dbiSelectNode(name); },
    }));
  }
}

// Global select-node bridge
window.__dbiSelectNode = null;
