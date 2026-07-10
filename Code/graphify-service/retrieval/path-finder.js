'use strict';

class PathFinder {
  constructor(graphData) {
    this.nodes = graphData.nodes || [];
    this.edges = graphData.edges || [];
    this._adj = new Map();
    this._buildIndex();
  }

  _buildIndex() {
    for (const e of this.edges) {
      if (!this._adj.has(e.source)) this._adj.set(e.source, []);
      this._adj.get(e.source).push({ target: e.target, type: e.type, weight: e.weight || 1 });
    }
  }

  _filePathToId(fp) {
    return 'file-' + fp;
  }

  _idToFilePath(id) {
    return id.startsWith('file-') ? id.slice(5) : id;
  }

  shortestPath(from, to) {
    const fromId = from.startsWith('file-') ? from : this._filePathToId(from);
    const toId = to.startsWith('file-') ? to : this._filePathToId(to);

    if (fromId === toId) return { path: [], length: 0 };

    const visited = new Set([fromId]);
    const queue = [{ id: fromId, path: [] }];
    let i = 0;

    while (i < queue.length) {
      const { id, path } = queue[i++];
      const neighbors = this._adj.get(id) || [];

      for (const n of neighbors) {
        if (n.target === toId) {
          const fullPath = [...path, { source: id, target: n.target, type: n.type }];
          return {
            path: fullPath.map(e => ({
              source: this._idToFilePath(e.source),
              target: this._idToFilePath(e.target),
              type: e.type,
            })),
            length: fullPath.length,
            nodeCount: fullPath.length + 1,
          };
        }
        if (!visited.has(n.target)) {
          visited.add(n.target);
          queue.push({ id: n.target, path: [...path, { source: id, target: n.target, type: n.type }] });
        }
      }
    }

    return null;
  }

  findConnections(filePath, maxHops = 3, edgeTypes = null) {
    const nodeId = filePath.startsWith('file-') ? filePath : this._filePathToId(filePath);
    const visited = new Map();
    const queue = [{ id: nodeId, hops: 0, edgePath: [] }];
    visited.set(nodeId, { hops: 0, edgePath: [] });

    let i = 0;
    while (i < queue.length) {
      const { id, hops, edgePath } = queue[i++];
      if (hops >= maxHops) continue;
      const neighbors = this._adj.get(id) || [];

      for (const n of neighbors) {
        if (edgeTypes && !edgeTypes.includes(n.type)) continue;
        if (!visited.has(n.target)) {
          const newPath = [...edgePath, n.type];
          visited.set(n.target, { hops: hops + 1, edgePath: newPath });
          queue.push({ id: n.target, hops: hops + 1, edgePath: newPath });
        }
      }
    }

    visited.delete(nodeId);
    return Array.from(visited.entries()).map(([id, info]) => ({
      filePath: this._idToFilePath(id),
      hops: info.hops,
      edgeTypes: info.edgePath,
    }));
  }

  isReachable(from, to) {
    const result = this.shortestPath(from, to);
    return result !== null;
  }

  bottleneckFiles() {
    const degree = new Map();
    for (const [source, targets] of this._adj) {
      degree.set(source, (degree.get(source) || 0) + targets.length);
      for (const t of targets) {
        degree.set(t.target, (degree.get(t.target) || 0) + 1);
      }
    }

    const betweenness = new Map();
    const allNodeIds = [...degree.keys()];
    for (let i = 0; i < Math.min(allNodeIds.length, 50); i++) {
      const s = allNodeIds[i];
      for (let j = i + 1; j < Math.min(allNodeIds.length, 50); j++) {
        const t = allNodeIds[j];
        if (s === t) continue;
        const path = this.shortestPath(s, t);
        if (path && path.path.length > 2) {
          for (const step of path.path) {
            const mid = this._filePathToId(step.source);
            if (mid !== s && mid !== t) {
              betweenness.set(mid, (betweenness.get(mid) || 0) + 1);
            }
          }
        }
      }
    }

    const bottleneckScore = new Map();
    for (const [id, deg] of degree) {
      const b = betweenness.get(id) || 0;
      bottleneckScore.set(id, { degree: deg, betweenness: b, combined: deg + b * 2 });
    }

    return Array.from(bottleneckScore.entries())
      .sort((a, b) => b[1].combined - a[1].combined)
      .slice(0, 20)
      .map(([id, info]) => ({
        filePath: this._idToFilePath(id),
        degree: info.degree,
        betweenness: info.betweenness,
      }));
  }
}

module.exports = { PathFinder };
