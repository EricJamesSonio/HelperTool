'use strict';

class DependencyResolver {
  constructor(graphData) {
    this.nodes = graphData.nodes || [];
    this.edges = graphData.edges || [];
    this._forwardAdj = null;
    this._reverseAdj = null;
    this._buildIndex();
  }

  _buildIndex() {
    this._forwardAdj = new Map();
    this._reverseAdj = new Map();
    for (const e of this.edges) {
      if (e.type !== 'IMPORTS') continue;
      if (!this._forwardAdj.has(e.source)) this._forwardAdj.set(e.source, []);
      this._forwardAdj.get(e.source).push({ target: e.target, type: e.type, weight: e.weight });

      if (!this._reverseAdj.has(e.target)) this._reverseAdj.set(e.target, []);
      this._reverseAdj.get(e.target).push({ source: e.source, type: e.type, weight: e.weight });
    }
  }

  _filePathToId(fp) {
    return 'file-' + fp;
  }

  _idToFilePath(id) {
    return id.startsWith('file-') ? id.slice(5) : id;
  }

  _resolveFilePaths(ids) {
    return ids.map(id => this._idToFilePath(id));
  }

  getDependencies(filePath, depth = 1) {
    const nodeId = this._filePathToId(filePath);
    const visited = new Map();
    const queue = [{ id: nodeId, depth: 0 }];
    visited.set(nodeId, 0);

    let i = 0;
    while (i < queue.length) {
      const { id, depth: d } = queue[i++];
      if (d >= depth) continue;
      const neighbors = this._forwardAdj.get(id) || [];
      for (const n of neighbors) {
        if (!visited.has(n.target)) {
          visited.set(n.target, d + 1);
          queue.push({ id: n.target, depth: d + 1 });
        }
      }
    }

    visited.delete(nodeId);
    return {
      filePath,
      depth,
      dependencies: Array.from(visited.entries()).map(([id, d]) => ({
        filePath: this._idToFilePath(id),
        depth: d,
      })),
      total: visited.size,
    };
  }

  getDependents(filePath, depth = 1) {
    const nodeId = this._filePathToId(filePath);
    const visited = new Map();
    const queue = [{ id: nodeId, depth: 0 }];
    visited.set(nodeId, 0);

    let i = 0;
    while (i < queue.length) {
      const { id, depth: d } = queue[i++];
      if (d >= depth) continue;
      const neighbors = this._reverseAdj.get(id) || [];
      for (const n of neighbors) {
        if (!visited.has(n.source)) {
          visited.set(n.source, d + 1);
          queue.push({ id: n.source, depth: d + 1 });
        }
      }
    }

    visited.delete(nodeId);
    return {
      filePath,
      depth,
      dependents: Array.from(visited.entries()).map(([id, d]) => ({
        filePath: this._idToFilePath(id),
        depth: d,
      })),
      total: visited.size,
    };
  }

  getDependencyGraph(filePaths, depth = 1) {
    const seedIds = new Set(filePaths.map(f => this._filePathToId(f)));
    const visited = new Map();
    const queue = [];
    for (const id of seedIds) {
      visited.set(id, 0);
      queue.push({ id, depth: 0 });
    }

    let i = 0;
    while (i < queue.length) {
      const { id, depth: d } = queue[i++];
      if (d >= depth) continue;
      for (const n of this._forwardAdj.get(id) || []) {
        if (!visited.has(n.target)) {
          visited.set(n.target, d + 1);
          queue.push({ id: n.target, depth: d + 1 });
        }
      }
      for (const n of this._reverseAdj.get(id) || []) {
        if (!visited.has(n.source)) {
          visited.set(n.source, d + 1);
          queue.push({ id: n.source, depth: d + 1 });
        }
      }
    }

    const filePathsSet = new Set([...visited.keys()].map(id => this._idToFilePath(id)));
    const subNodes = this.nodes.filter(n => filePathsSet.has(n.filePath));
    const subEdges = this.edges.filter(e =>
      visited.has(e.source) && visited.has(e.target) && e.type === 'IMPORTS'
    );

    return { nodes: subNodes, edges: subEdges, total: visited.size };
  }

  getCircularDependencies() {
    const adj = this._forwardAdj;
    const allNodes = new Set([...adj.keys()]);
    for (const [, targets] of adj) {
      for (const t of targets) allNodes.add(t.target);
    }

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    const parent = new Map();
    const cycles = [];
    const entryStack = [];

    for (const node of allNodes) color.set(node, WHITE);

    function dfs(u) {
      color.set(u, GRAY);
      entryStack.push(u);
      const neighbors = adj.get(u) || [];
      for (const n of neighbors) {
        const v = n.target;
        if (color.get(v) === GRAY) {
          const cycle = [];
          let x = entryStack.length - 1;
          while (entryStack[x] !== v && x >= 0) x--;
          for (let j = x; j < entryStack.length; j++) cycle.push(entryStack[j]);
          if (cycle.length >= 2) cycles.push(cycle);
        } else if (color.get(v) === WHITE) {
          parent.set(v, u);
          dfs(v);
        }
      }
      entryStack.pop();
      color.set(u, BLACK);
    }

    for (const node of allNodes) {
      if (color.get(node) === WHITE) dfs(node);
    }

    const seen = new Set();
    const unique = [];
    for (const cycle of cycles) {
      const key = [...cycle].sort().join(',');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(cycle.map(id => this._idToFilePath(id)));
      }
    }

    return unique;
  }

  getImportGraph() {
    const edges = [];
    for (const e of this.edges) {
      if (e.type === 'IMPORTS') {
        edges.push({
          source: this._idToFilePath(e.source),
          target: this._idToFilePath(e.target),
          weight: e.weight,
        });
      }
    }
    return edges;
  }
}

module.exports = { DependencyResolver };
