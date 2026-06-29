import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, MarkerType,
  useNodesState, useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

const CAT_PALETTE = [
  '#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa',
  '#f472b6', '#fb923c', '#2dd4bf', '#e879f9', '#38bdf8',
];

let _setNodes = null;
let _setEdges = null;
let _selectModuleCallback = null;
let _reactFlowInstance = null;

function ModuleGraph({ modules, onSelectModule }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const nodesRef = useRef(nodes);

  nodesRef.current = nodes;

  _setNodes = setNodes;
  _setEdges = setEdges;
  _selectModuleCallback = onSelectModule;

  const onInit = useCallback((instance) => {
    _reactFlowInstance = instance;

    window.__cmSelectModule = (moduleName) => {
      setNodes(nds => nds.map(n => {
        if (n.id === moduleName) {
          return { ...n, style: { ...n.style, border: `3px solid #fff` } };
        }
        return { ...n, style: { ...n.style, border: `2px solid ${n.data.color}` } };
      }));
    };

    window.__cmCenterModule = (moduleName) => {
      const currentNodes = nodesRef.current;
      const match = currentNodes.find(n => n.id === moduleName);
      if (match) {
        instance.setCenter(match.position.x, match.position.y, { zoom: 1.5, duration: 600 });
        window.__cmSelectModule?.(moduleName);
      }
    };
  }, []);

  useEffect(() => {
    if (!modules || modules.length === 0) return;
    const graphData = buildGraphData(modules);
    const autoLayout = computeAutoLayout(graphData.nodes, graphData.edges);
    setNodes(autoLayout.nodes.map((n, i) => {
      const color = n.data.color;
      return {
        id: n.id,
        type: 'default',
        position: n.position,
        data: {
          label: n.data.label,
          fileCount: n.data.fileCount,
          symbolCount: n.data.symbolCount,
          color,
        },
        style: {
          background: color + '1A',
          color: '#f0f6fc',
          border: `2px solid ${color}44`,
          borderRadius: '10px',
          padding: '10px 16px',
          fontSize: '13px',
          fontFamily: 'ui-monospace, monospace',
          fontWeight: 600,
        },
      };
    }));
    setEdges(graphData.edges.map((e, i) => ({
      id: `e_${i}`,
      source: e.source,
      target: e.target,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#60a5fa' },
      style: { stroke: e.isCircular ? '#f87171' : '#556080', strokeWidth: e.isCircular ? 2 : 1.5, strokeDasharray: e.isCircular ? '5 3' : 'none' },
      labelStyle: { fill: '#94a3c4', fontSize: 9 },
    })));
  }, [modules]);

  const onNodeClick = useCallback((event, node) => {
    if (_selectModuleCallback) {
      _selectModuleCallback(node.id);
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
          nodeColor={(n) => n.data?.color || '#1a2540'}
          maskColor="rgba(7,13,26,0.7)"
        />
      </ReactFlow>
    </div>
  );
}

function buildGraphData(modules) {
  const modIndex = {};
  modules.forEach((m, i) => { modIndex[m.name] = i; });

  const nodes = modules.map((m, i) => {
    const color = CAT_PALETTE[i % CAT_PALETTE.length];
    const subs = [];
    if (m.fileCount) subs.push(`${m.fileCount} files`);
    if (m.symbolCount) subs.push(`${m.symbolCount} symbols`);
    return {
      id: m.name,
      data: {
        label: m.name + (subs.length ? `\n${subs.join(', ')}` : ''),
        fileCount: m.fileCount,
        symbolCount: m.symbolCount,
        color,
      },
    };
  });

  const edges = [];
  const moduleNames = new Set(modules.map(m => m.name));
  for (const m of modules) {
    for (const dep of m.importsFrom) {
      if (moduleNames.has(dep)) {
        edges.push({ source: m.name, target: dep });
      }
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const e of edges) {
    const key = `${e.source}->${e.target}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(e);
    }
  }

  return { nodes, edges: deduped };
}

function computeAutoLayout(nodes, edges) {
  if (!nodes || nodes.length === 0) return { nodes: [], edges: [] };

  const dag = buildDag(nodes, edges);
  const levels = topologicalLayout(dag, edges);

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

function topologicalLayout(dag, edges) {
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

  const unvisited = nodeIds.filter(id => !visited.has(id));
  if (unvisited.length > 0) levels.unshift(unvisited);

  return levels;
}

let _container = null;
let _root = null;

export function initGraph(container, modules) {
  _container = container;

  const { createRoot } = require('react-dom/client');
  _root = createRoot(container);

  const selectModule = (moduleName) => {
    if (window.__cmSelectModule) window.__cmSelectModule(moduleName);
  };

  _root.render(React.createElement(ModuleGraph, { modules, onSelectModule: selectModule }));

  return _root;
}

export function updateGraph(root, modules) {
  if (root) {
    root.render(React.createElement(ModuleGraph, {
      modules,
      onSelectModule: (name) => { if (window.__cmSelectModule) window.__cmSelectModule(name); },
    }));
  }
}

window.__cmSelectModule = null;
window.__cmCenterModule = null;
