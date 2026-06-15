import { NODE_TYPES } from './nodeRegistry.js';

let _counter = 0;
function genId() {
  return 'node_' + Date.now() + '_' + (++_counter);
}

export function createNode(type, x, y) {
  const def = NODE_TYPES[type];
  if (!def) return null;

  const node = {
    id: genId(),
    type,
    x,
    y,
    label: def.label,
    fields: {},
  };

  for (const f of def.fields) {
    node.fields[f] = '';
  }

  return node;
}

export function createEdge(fromNodeId, fromPort, toNodeId, toPort) {
  return {
    id: 'edge_' + Date.now() + '_' + (++_counter),
    fromNodeId,
    fromPort,
    toNodeId,
    toPort,
  };
}
