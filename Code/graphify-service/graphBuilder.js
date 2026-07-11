'use strict';

const fs   = require('fs');
const path = require('path');

const COMMUNITY_COLORS = [
  '#22ff7a', '#ff6b6b', '#60a5fa', '#eab308', '#a855f7', '#f97316',
  '#06b6d4', '#ec4899', '#84cc16', '#14b8a6', '#f43f5e', '#8b5cf6',
  '#0ea5e9', '#f59e0b', '#10b981', '#d946ef', '#22d3ee', '#fb923c',
];

class KnowledgeGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
    this.adjOut = new Map();
    this.adjIn = new Map();
    this._nodeIdCounter = 0;
  }

  _nextId() {
    return 'n' + (this._nodeIdCounter++);
  }

  addNode(label, type, properties = {}) {
    const id = this._nextId();
    const node = { id, label, type, community: -1, degree: 0, ...properties };
    this.nodes.set(id, node);
    return id;
  }

  addEdge(sourceId, targetId, type, properties = {}) {
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) return null;
    const weight = properties.weight || 1;
    const edgeKey = `${sourceId}|${targetId}|${type}`;
    this.edges.push({ source: sourceId, target: targetId, type, weight: properties.weight || 1, ...properties, key: edgeKey });

    if (!this.adjOut.has(sourceId)) this.adjOut.set(sourceId, []);
    this.adjOut.get(sourceId).push({ target: targetId, type, weight });

    if (!this.adjIn.has(targetId)) this.adjIn.set(targetId, []);
    this.adjIn.get(targetId).push({ source: sourceId, type, weight });

    return edgeKey;
  }

  getNode(id) { return this.nodes.get(id) || null; }

  updateDegrees() {
    for (const [id, node] of this.nodes) {
      const outDeg = (this.adjOut.get(id) || []).length;
      const inDeg = (this.adjIn.get(id) || []).length;
      node.degree = outDeg + inDeg;
    }
  }

  buildFromDb(db, repoId, repoPath) {
    this._loadFiles(db, repoId);
    this._loadSymbols(db, repoId);
    this._loadImports(db, repoId);
    this.updateDegrees();
    if (repoPath) this._scanMarkdown(repoPath);
    this.runCommunityDetection();
    return this;
  }

  _loadFiles(db, repoId) {
    const stmt = db.prepare('SELECT id, path, language, last_modified FROM indexed_files WHERE repo_id = ?');
    stmt.bind([repoId]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      const parts = row.path.split('/');
      const name = parts.pop();
      this.addNode(name, 'file', {
        filePath: row.path,
        language: row.language || '',
        lastModified: row.last_modified || '',
        originalId: row.id,
        _type: 'file',
      });
    }
    stmt.free();
  }

  _loadSymbols(db, repoId) {
    const stmt = db.prepare(`
      SELECT s.id, s.name, s.type, s.line, s.column, s.is_exported, s.class_name, s.signature, f.path as file_path
      FROM symbols s
      JOIN indexed_files f ON f.id = s.file_id
      WHERE s.repo_id = ?
    `);
    stmt.bind([repoId]);

    const fileNodeMap = new Map();
    for (const [id, node] of this.nodes) {
      if (node._type === 'file' && node.filePath) {
        fileNodeMap.set(node.filePath, id);
      }
    }

    while (stmt.step()) {
      const row = stmt.getAsObject();
      const symbolId = this.addNode(row.name, row.type, {
        filePath: row.file_path,
        line: row.line,
        column: row.column,
        isExported: !!row.is_exported,
        className: row.class_name || null,
        signature: row.signature || '',
        originalId: row.id,
        _type: 'symbol',
      });

      const fileNodeId = fileNodeMap.get(row.file_path);
      if (fileNodeId) {
        this.addEdge(fileNodeId, symbolId, 'CONTAINS', { weight: 1 });
      }
    }
    stmt.free();
  }

  _loadImports(db, repoId) {
    const stmt = db.prepare(`
      SELECT fi.file_id, fi.import_path, fi.import_type, f.path as source_path, rf.path as target_path
      FROM file_imports fi
      JOIN indexed_files f  ON f.id  = fi.file_id
      LEFT JOIN indexed_files rf ON rf.id = fi.resolved_file_id
      WHERE fi.repo_id = ?
    `);
    stmt.bind([repoId]);

    const fileNodeByPath = new Map();
    for (const [id, node] of this.nodes) {
      if (node._type === 'file' && node.filePath) {
        fileNodeByPath.set(node.filePath, id);
      }
    }

    while (stmt.step()) {
      const row = stmt.getAsObject();
      const sourceId = fileNodeByPath.get(row.source_path);
      if (!sourceId) continue;

      if (row.target_path) {
        const targetId = fileNodeByPath.get(row.target_path);
        if (targetId) {
          this.addEdge(sourceId, targetId, 'IMPORTS', { weight: 2, importType: row.import_type });
        } else {
          this.addEdge(sourceId, null, 'IMPORTS_UNRESOLVED', { weight: 1, importPath: row.import_path });
        }
      } else {
        this.addEdge(sourceId, null, 'IMPORTS_UNRESOLVED', { weight: 1, importPath: row.import_path });
      }
    }
    stmt.free();

    this.edges = this.edges.filter(e => e.target !== null && e.source !== null);
  }

  _scanMarkdown(repoPath) {
    if (!repoPath || !fs.existsSync(repoPath)) return;

    try {
      const files = this._walkDir(repoPath, '.md');
      for (const mdFile of files) {
        try {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const relPath = path.relative(repoPath, mdFile).replace(/\\/g, '/');
          const lines = content.split('\n');

          let title = relPath;
          for (const line of lines) {
            const h1Match = line.match(/^#\s+(.+)/);
            if (h1Match) { title = h1Match[1].trim(); break; }
          }

          const docId = this.addNode(title, 'doc', {
            filePath: relPath,
            _type: 'doc',
          });

          this._extractMarkdownHeadings(lines, docId, relPath);
          this._extractMarkdownReferences(content, relPath);
        } catch (_) {}
      }
    } catch (_) {}
  }

  _walkDir(dir, ext) {
    const results = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          results.push(...this._walkDir(fullPath, ext));
        } else if (entry.name.endsWith(ext)) {
          results.push(fullPath);
        }
      }
    } catch (_) {}
    return results;
  }

  _extractMarkdownHeadings(lines, docId, relPath) {
    let headingCount = 0;
    for (const line of lines) {
      const hMatch = line.match(/^(#{2,4})\s+(.+)/);
      if (hMatch) {
        const level = hMatch[1].length;
        const headingText = hMatch[2].trim();
        if (headingText) {
          headingCount++;
          const headingId = this.addNode(headingText, 'heading', {
            filePath: relPath,
            headingLevel: level,
            _type: 'heading',
          });
          this.addEdge(docId, headingId, 'CONTAINS', { weight: 1 });
        }
      }
    }
  }

  _extractMarkdownReferences(content, relPath) {
    const codeRefRegex = /`([^`]+)`/g;
    let match;
    while ((match = codeRefRegex.exec(content)) !== null) {
      const ref = match[1].trim();
      if (!ref || ref.length < 2) continue;

      for (const [nodeId, node] of this.nodes) {
        if (node._type === 'file' && node.filePath) {
          const fileName = node.filePath.split('/').pop();
          if (fileName === ref || node.filePath === ref || fileName === ref.replace(/^\.\//, '')) {
            const docNode = this._findNodeByPath(relPath);
            if (docNode) {
              this.addEdge(docNode, nodeId, 'REFERENCES', { weight: 1 });
            }
            break;
          }
        }
      }
    }
  }

  _findNodeByPath(filePath) {
    for (const [id, node] of this.nodes) {
      if (node.filePath === filePath) return id;
    }
    return null;
  }

  runCommunityDetection(maxIterations = 10) {
    const nodeIds = Array.from(this.nodes.keys());
    if (nodeIds.length === 0) return;

    const labels = new Map();
    for (const id of nodeIds) labels.set(id, id);

    // Fisher-Yates shuffle (mutates in-place)
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
    }

    const adjOut = this.adjOut;
    const adjIn = this.adjIn;

    for (let iter = 0; iter < maxIterations; iter++) {
      let changed = false;
      shuffle(nodeIds);

      for (let ni = 0; ni < nodeIds.length; ni++) {
        const nodeId = nodeIds[ni];
        const outNbrs = adjOut.get(nodeId);
        const inNbrs = adjIn.get(nodeId);
        const outLen = outNbrs ? outNbrs.length : 0;
        const inLen = inNbrs ? inNbrs.length : 0;
        if (outLen + inLen === 0) continue;

        const freq = new Map();
        if (outNbrs) {
          for (let i = 0; i < outLen; i++) {
            const n = outNbrs[i];
            const label = labels.get(n.target);
            if (label !== undefined) {
              freq.set(label, (freq.get(label) || 0) + (n.weight || 1));
            }
          }
        }
        if (inNbrs) {
          for (let i = 0; i < inLen; i++) {
            const n = inNbrs[i];
            const label = labels.get(n.source);
            if (label !== undefined) {
              freq.set(label, (freq.get(label) || 0) + (n.weight || 1));
            }
          }
        }

        if (freq.size === 0) continue;

        const curLabel = labels.get(nodeId);
        // Single dominant label — skip (no change)
        if (freq.size === 1 && freq.has(curLabel)) continue;

        let maxFreq = 0;
        let bestLabel = curLabel;
        for (const [label, count] of freq) {
          if (count > maxFreq || (count === maxFreq && Math.random() < 0.5)) {
            maxFreq = count;
            bestLabel = label;
          }
        }

        if (bestLabel !== curLabel) {
          labels.set(nodeId, bestLabel);
          changed = true;
        }
      }

      if (!changed) break;
    }

    const uniqueLabels = [...new Set(labels.values())];
    const labelMap = new Map();
    for (let i = 0; i < uniqueLabels.length; i++) {
      labelMap.set(uniqueLabels[i], i);
    }

    for (let ni = 0; ni < nodeIds.length; ni++) {
      const nodeId = nodeIds[ni];
      const node = this.nodes.get(nodeId);
      if (node) node.community = labelMap.get(labels.get(nodeId)) || 0;
    }
  }

  searchNodes(query, limit = 20) {
    const q = query.toLowerCase();
    const results = [];
    for (const [id, node] of this.nodes) {
      const label = (node.label || '').toLowerCase();
      const filePath = (node.filePath || '').toLowerCase();
      if (label.includes(q) || filePath.includes(q)) {
        let score = 0;
        if (label === q) score = 100;
        else if (label.startsWith(q)) score = 80;
        else if (label.includes(q)) score = 50;
        if (filePath.includes(q)) score += 20;
        results.push({ id, node, score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map(r => ({ id: r.id, label: r.node.label, type: r.node.type, filePath: r.node.filePath, community: r.node.community, degree: r.node.degree }));
  }

  getNeighborhood(nodeId, depth = 1) {
    if (!this.nodes.has(nodeId)) return null;

    const visited = new Set([nodeId]);
    const queue = [{ id: nodeId, depth: 0 }];
    const resultNodes = new Map();
    const resultEdges = new Set();
    const edgeMap = new Map();
    for (const e of this.edges) {
      edgeMap.set(e.key, e);
    }

    let i = 0;
    while (i < queue.length) {
      const { id, depth: d } = queue[i++];
      resultNodes.set(id, this.nodes.get(id));

      const outNbrs = this.adjOut.get(id) || [];
      for (const n of outNbrs) {
        const eKey = `${id}|${n.target}|${n.type}`;
        if (edgeMap.has(eKey)) resultEdges.add(eKey);
        if (!visited.has(n.target) && d < depth) {
          visited.add(n.target);
          queue.push({ id: n.target, depth: d + 1 });
        }
      }

      const inNbrs = this.adjIn.get(id) || [];
      for (const n of inNbrs) {
        const eKey = `${n.source}|${id}|${n.type}`;
        if (edgeMap.has(eKey)) resultEdges.add(eKey);
        if (!visited.has(n.source) && d < depth) {
          visited.add(n.source);
          queue.push({ id: n.source, depth: d + 1 });
        }
      }
    }

    return {
      nodes: Array.from(resultNodes.values()),
      edges: Array.from(resultEdges).map(k => edgeMap.get(k)).filter(Boolean),
    };
  }

  shortestPath(fromId, toId) {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return null;

    const visited = new Set([fromId]);
    const queue = [{ id: fromId, path: [fromId] }];
    let i = 0;

    while (i < queue.length) {
      const { id, path } = queue[i++];
      if (id === toId) {
        return {
          path: path.map(nid => this.nodes.get(nid)).filter(Boolean),
          edgePath: this._getEdgesAlongPath(path),
        };
      }

      const outNbrs = this.adjOut.get(id) || [];
      for (const n of outNbrs) {
        if (!visited.has(n.target)) {
          visited.add(n.target);
          queue.push({ id: n.target, path: [...path, n.target] });
        }
      }

      const inNbrs = this.adjIn.get(id) || [];
      for (const n of inNbrs) {
        if (!visited.has(n.source)) {
          visited.add(n.source);
          queue.push({ id: n.source, path: [...path, n.source] });
        }
      }
    }

    return null;
  }

  _getEdgesAlongPath(nodePath) {
    const edges = [];
    const edgeMap = new Map();
    for (const e of this.edges) {
      edgeMap.set(e.key, e);
    }

    for (let i = 0; i < nodePath.length - 1; i++) {
      const from = nodePath[i];
      const to = nodePath[i + 1];

      let found = null;
      for (const [key, e] of edgeMap) {
        if (e.source === from && e.target === to) {
          found = e; break;
        }
        if (e.source === to && e.target === from) {
          found = e; break;
        }
      }
      if (found) edges.push(found);
    }
    return edges;
  }

  getAffected(nodeId, depth = 1) {
    if (!this.nodes.has(nodeId)) return null;

    const visited = new Set([nodeId]);
    const queue = [{ id: nodeId, depth: 0 }];
    const resultNodes = new Map();
    const resultEdges = new Set();
    const edgeMap = new Map();
    for (const e of this.edges) edgeMap.set(e.key, e);

    let i = 0;
    while (i < queue.length) {
      const { id, depth: d } = queue[i++];
      resultNodes.set(id, this.nodes.get(id));

      const inNbrs = this.adjIn.get(id) || [];
      for (const n of inNbrs) {
        const eKey = `${n.source}|${id}|${n.type}`;
        if (edgeMap.has(eKey)) resultEdges.add(eKey);

        const sourceId = n.source;
        if (!visited.has(sourceId) && d < depth) {
          visited.add(sourceId);
          queue.push({ id: sourceId, depth: d + 1 });
        }
      }

      const outNbrs = this.adjOut.get(id) || [];
      for (const n of outNbrs) {
        if (n.target === id) continue;
        const eKey = `${id}|${n.target}|${n.type}`;
        if (edgeMap.has(eKey) && visited.has(n.target)) {
          resultEdges.add(eKey);
        }
      }
    }

    return {
      nodes: Array.from(resultNodes.values()),
      edges: Array.from(resultEdges).map(k => edgeMap.get(k)).filter(Boolean),
    };
  }

  getGodNodes(limit = 10) {
    const sorted = Array.from(this.nodes.values())
      .filter(n => n._type === 'file' || n._type === 'symbol')
      .sort((a, b) => (b.degree || 0) - (a.degree || 0));
    return sorted.slice(0, limit).map(n => ({
      id: n.id, label: n.label, type: n.type, filePath: n.filePath,
      degree: n.degree, community: n.community,
    }));
  }

  getSurprisingEdges(limit = 10) {
    const edgesWithDegrees = this.edges
      .filter(e => {
        const src = this.nodes.get(e.source);
        const tgt = this.nodes.get(e.target);
        return src && tgt && src._type === 'file' && tgt._type === 'file';
      })
      .map(e => {
        const src = this.nodes.get(e.source);
        const tgt = this.nodes.get(e.target);
        const srcCommunity = src ? src.community : -1;
        const tgtCommunity = tgt ? tgt.community : -1;
        return { ...e, sourceLabel: src ? src.label : '', targetLabel: tgt ? tgt.label : '', sourceCommunity: srcCommunity, targetCommunity: tgtCommunity, isCrossCommunity: srcCommunity !== tgtCommunity };
      })
      .filter(e => e.isCrossCommunity)
      .sort((a, b) => (a.weight || 1) - (b.weight || 1));

    return edgesWithDegrees.slice(0, limit);
  }

  getCommunities() {
    const commMap = new Map();
    for (const [id, node] of this.nodes) {
      const c = node.community;
      if (!commMap.has(c)) commMap.set(c, { id: c, nodeCount: 0, members: [] });
      const entry = commMap.get(c);
      entry.nodeCount++;
      if (entry.members.length < 5) {
        entry.members.push({ id: node.id, label: node.label, type: node.type });
      }
    }
    return Array.from(commMap.values())
      .sort((a, b) => b.nodeCount - a.nodeCount)
      .map((c, i) => ({ ...c, color: COMMUNITY_COLORS[i % COMMUNITY_COLORS.length] }));
  }

  getGraphStats() {
    const files = Array.from(this.nodes.values()).filter(n => n._type === 'file');
    const symbols = Array.from(this.nodes.values()).filter(n => n._type === 'symbol');
    const docs = Array.from(this.nodes.values()).filter(n => n._type === 'doc');
    const communities = new Set();
    for (const n of this.nodes.values()) communities.add(n.community);
    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.length,
      totalFiles: files.length,
      totalSymbols: symbols.length,
      totalDocs: docs.length,
      communityCount: communities.size,
    };
  }

  toVisData() {
    const visNodes = Array.from(this.nodes.values()).map(n => ({
      id: n.id, label: n.label || '',
      type: n.type, _type: n._type,
      filePath: n.filePath || '', community: n.community,
      degree: n.degree || 0,
    }));
    const visEdges = this.edges.map(e => ({
      from: e.source, to: e.target, type: e.type,
      weight: e.weight || 0.5, importType: e.importType || '',
      crossCommunity: (() => {
        const src = this.nodes.get(e.source);
        const tgt = this.nodes.get(e.target);
        return src && tgt && src.community !== tgt.community ? 1 : 0;
      })(),
    }));
    return { nodes: visNodes, edges: visEdges };
  }

  generateHtml(title = 'Graphify - Knowledge Graph') {
    const data = this.toVisData();
    const communities = this.getCommunities();
    const stats = this.getGraphStats();
    const nodeCount = data.nodes.length;

    // Pre-compute cluster-level data (one node per community)
    const nodeCommMap = {};
    for (const n of data.nodes) nodeCommMap[n.id] = n.community;

    const clusterNodes = communities.map(c => ({
      id: `_comm_${c.id}`,
      label: `Community ${c.id + 1}`,
      community: c.id,
      _type: 'cluster',
      nodeCount: c.nodeCount,
      memberList: c.members.slice(0, 3).map(m => m.label).join(', '),
    }));

    const commEdgeAgg = {};
    for (const e of data.edges) {
      const srcComm = nodeCommMap[e.from];
      const tgtComm = nodeCommMap[e.to];
      if (srcComm !== undefined && tgtComm !== undefined && srcComm !== tgtComm) {
        const key = srcComm < tgtComm ? `${srcComm}|${tgtComm}` : `${tgtComm}|${srcComm}`;
        if (!commEdgeAgg[key]) {
          commEdgeAgg[key] = { from: `_comm_${srcComm}`, to: `_comm_${tgtComm}`, type: 'CROSS_COMMUNITY', weight: 0 };
        }
        commEdgeAgg[key].weight++;
      }
    }
    const clusterEdges = Object.values(commEdgeAgg);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b0f14; color: #e2e8f0; height: 100vh; overflow: hidden; }
#app { display: flex; height: 100vh; }

/* Canvas background pattern */
#graph-container {
  flex: 1; position: relative;
  background:
    radial-gradient(ellipse at 50% 50%, rgba(34,255,122,0.03) 0%, transparent 70%),
    linear-gradient(rgba(34,255,122,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(34,255,122,0.02) 1px, transparent 1px);
  background-size: 100% 100%, 40px 40px, 40px 40px;
  background-color: #0b0f14;
}
#graph { width: 100%; height: 100%; }

/* Sidebar – glassmorphism */
#sidebar {
  width: 280px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px;
  padding: 20px 16px; overflow-y: auto;
  background: rgba(15,20,25,0.92);
  border-right: 1px solid rgba(34,255,122,0.08);
  backdrop-filter: blur(12px);
}

/* Search */
.search-box { position: relative; }
.search-box input {
  width: 100%; padding: 10px 14px; font-size: 13px; font-family: inherit;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; color: #e2e8f0; outline: none; transition: border-color .2s;
}
.search-box input::placeholder { color: #475569; }
.search-box input:focus { border-color: rgba(34,255,122,0.4); }
.search-results {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 10;
  background: rgba(15,20,25,0.96); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 0 0 10px 10px; max-height: 220px; overflow-y: auto;
  backdrop-filter: blur(12px); display: none;
}
.search-result-item {
  padding: 8px 14px; cursor: pointer; font-size: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.04); transition: background .15s;
}
.search-result-item:hover { background: rgba(34,255,122,0.08); }
.search-result-item:last-child { border-bottom: none; }
.search-item-label { color: #e2e8f0; }
.search-item-type { color: #475569; font-size: 10px; margin-left: 6px; }

/* Sidebar sections */
.sidebar-section { margin-bottom: 2px; }
.sidebar-section h3 {
  font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
  color: #475569; margin-bottom: 8px; font-weight: 600;
}

/* Stats card */
.stats {
  display: flex; gap: 16px; flex-wrap: wrap;
  font-size: 11px; color: #94a3b8; padding: 10px 14px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
}
.stats span { display: inline-flex; align-items: center; gap: 4px; }
.stats strong { color: #22ff7a; font-weight: 600; }

/* Toggle buttons */
.sidebar-toggle-group { display: flex; flex-direction: column; gap: 6px; }
.sidebar-toggle-group button {
  width: 100%; padding: 9px 14px; font-size: 12px; font-family: inherit; cursor: pointer;
  border-radius: 10px; transition: all .2s; text-align: center;
  background: rgba(255,255,255,0.03); color: #94a3b8;
  border: 1px solid rgba(255,255,255,0.06);
}
.sidebar-toggle-group button:hover {
  background: rgba(34,255,122,0.06); border-color: rgba(34,255,122,0.2);
  color: #e2e8f0;
}

/* Community list */
.community-item {
  display: flex; align-items: center; gap: 10px; padding: 6px 6px;
  cursor: pointer; font-size: 12px; border-radius: 8px;
  transition: background .15s;
}
.community-item:hover { background: rgba(255,255,255,0.04); }
.community-color {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  box-shadow: 0 0 6px rgba(255,255,255,0.1);
}
.community-count { margin-left: auto; color: #475569; font-size: 10px; }

/* Node detail panel */
.node-detail {
  display: none; padding: 14px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px; font-size: 12px; line-height: 1.6;
}
.node-detail.show { display: block; }
.node-detail .label { color: #22ff7a; font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.node-detail .meta { color: #64748b; }
.node-detail .meta span { display: block; }

/* Title bar */
.graphify-title {
  font-size: 15px; font-weight: 700; color: #22ff7a;
  padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06);
  letter-spacing: 0.3px; display: flex; align-items: center; gap: 8px;
}
.graphify-title svg { width: 18px; height: 18px; }
</style>
</head>
<body>
<div id="app">
  <div id="sidebar">
    <div class="graphify-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><circle cx="5" cy="19" r="2"/><line x1="12" y1="9" x2="17" y2="7"/><line x1="7" y1="7" x2="10" y2="9"/><line x1="12" y1="15" x2="17" y2="17"/><line x1="7" y1="17" x2="10" y2="15"/></svg>
      Graphify
    </div>

    <div class="search-box">
      <input type="text" id="searchInput" placeholder="Search nodes\u2026" autocomplete="off" spellcheck="false">
      <div class="search-results" id="searchResults"></div>
    </div>

    <div class="sidebar-section">
      <div class="stats">
        <span><strong>${stats.totalNodes}</strong> nodes</span>
        <span><strong>${stats.totalEdges}</strong> edges</span>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="node-detail" id="nodeDetail"></div>
    </div>

    <div class="sidebar-section" style="flex:1;overflow-y:auto;">
      <h3>Communities (${communities.length})</h3>
      <div id="communityList">
        ${communities.map(c => `
          <div class="community-item" data-community="${c.id}">
            <span class="community-color" style="background:${c.color}"></span>
            <span>Community ${c.id + 1}</span>
            <span class="community-count">${c.nodeCount}</span>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <div id="graph-container">
    <div id="graph"></div>
  </div>
</div>

<script>
var clusterNodesData = ${JSON.stringify(clusterNodes)};
var clusterEdgesData = ${JSON.stringify(clusterEdges)};
var graphStats = { nodes: ${stats.totalNodes}, edges: ${stats.totalEdges} };
var COMM_COLORS = ${JSON.stringify(COMMUNITY_COLORS)};

// Canvas setup
var container=document.getElementById('graph');
var canvas=document.createElement('canvas');
canvas.style.width='100%';canvas.style.height='100%';
container.appendChild(canvas);
var ctx=canvas.getContext('2d');

var cx,cy,layoutR,circles,stars,pad=20,hoveredIdx=-1,selectedIdx=-1;

function initCanvas(){
  canvas.width=container.clientWidth||800;canvas.height=container.clientHeight||600;
  cx=canvas.width/2;cy=canvas.height/2;
  layoutR=Math.min(canvas.width,canvas.height)*0.42;
  // Stars
  stars=[];
  for(var s=0;s<250;s++){stars.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*1.5+0.3,a:Math.random()*0.4+0.05});}
  // Layout circles
  var maxCount=0;
  clusterNodesData.forEach(function(cn){if(cn.nodeCount>maxCount)maxCount=cn.nodeCount;});
  if(!maxCount)maxCount=1;
  circles=clusterNodesData.map(function(cn,i){
    var angle=(i/clusterNodesData.length||1)*2*Math.PI-Math.PI/2;
    var radius=Math.max(6,Math.sqrt(cn.nodeCount/maxCount)*28+6);
    return{
      id:cn.id,label:cn.label,community:cn.community,
      nodeCount:cn.nodeCount,memberList:cn.memberList,
      x:cx+layoutR*Math.cos(angle),y:cy+layoutR*Math.sin(angle),
      radius:radius,color:COMM_COLORS[cn.community%COMM_COLORS.length],
    };
  });
  // Collision
  for(var iter=0;iter<15;iter++){
    var moved=false;
    for(var i=0;i<circles.length;i++){for(var j=i+1;j<circles.length;j++){
      var dx=circles[j].x-circles[i].x,dy=circles[j].y-circles[i].y;
      var dist=Math.sqrt(dx*dx+dy*dy);
      var minDist=circles[i].radius+circles[j].radius+12;
      if(dist<minDist&&dist>0){
        var push=(minDist-dist)/2;var nx=dx/dist,ny=dy/dist;
        circles[i].x-=nx*push;circles[i].y-=ny*push;
        circles[j].x+=nx*push;circles[j].y+=ny*push;moved=true;
      }
    }}
    if(!moved)break;
  }
  circles.forEach(function(c){
    c.x=Math.max(pad+c.radius,Math.min(canvas.width-pad-c.radius,c.x));
    c.y=Math.max(pad+c.radius,Math.min(canvas.height-pad-c.radius,c.y));
  });
  draw();
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // Cosmic background
  ctx.fillStyle='#080c12';ctx.fillRect(0,0,canvas.width,canvas.height);
  // Stars
  stars.forEach(function(s){ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,2*Math.PI);ctx.fillStyle='rgba(255,255,255,'+s.a+')';ctx.fill();});
  // Connection lines
  clusterEdgesData.forEach(function(ce){
    var fc=parseInt(ce.from.replace('_comm_','')),tc=parseInt(ce.to.replace('_comm_',''));
    var fromC=circles.find(function(c){return c.community===fc;});
    var toC=circles.find(function(c){return c.community===tc;});
    if(fromC&&toC){
      ctx.beginPath();ctx.moveTo(fromC.x,fromC.y);
      var midx=(fromC.x+toC.x)/2,midy=(fromC.y+toC.y)/2;
      ctx.quadraticCurveTo(midx+(Math.random()-0.5)*40,midy+(Math.random()-0.5)*40,toC.x,toC.y);
      ctx.strokeStyle='rgba(255,255,255,'+Math.min(0.08,ce.weight*0.0015)+')';
      ctx.lineWidth=Math.min(1.5,ce.weight*0.02+0.1);ctx.stroke();
    }
  });
  // Circles
  circles.forEach(function(c,i){
    var isHover=i===hoveredIdx,isSel=i===selectedIdx;
    var grad=ctx.createRadialGradient(c.x,c.y,0,c.x,c.y,c.radius*3);
    grad.addColorStop(0,isHover||isSel?c.color+'66':c.color+'33');
    grad.addColorStop(1,'transparent');
    ctx.fillStyle=grad;ctx.beginPath();ctx.arc(c.x,c.y,c.radius*3,0,2*Math.PI);ctx.fill();
    ctx.beginPath();ctx.arc(c.x,c.y,c.radius,0,2*Math.PI);
    ctx.fillStyle=c.color+(isHover||isSel?'77':'55');ctx.fill();
    ctx.strokeStyle=isHover||isSel?'#22ff7a':c.color;
    ctx.lineWidth=isHover||isSel?2.5:1.5;ctx.stroke();
    ctx.fillStyle='#94a3b8';ctx.font='10px Inter,sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
    ctx.fillText(c.label,c.x,c.y+c.radius+6);
  });
  // Stats overlay
  ctx.fillStyle='rgba(148,163,184,0.35)';ctx.font='11px Inter,sans-serif';ctx.textAlign='right';ctx.textBaseline='bottom';
  ctx.fillText(graphStats.nodes+' nodes  |  '+graphStats.edges+' edges',canvas.width-14,canvas.height-14);
}
function deferredInit(){try{initCanvas();}catch(e){console.error('Graph init error:',e);}}
requestAnimationFrame(deferredInit);setTimeout(deferredInit,100);
window.addEventListener('resize',function(){requestAnimationFrame(deferredInit);});

function getCircleAt(x,y){
  for(var i=circles.length-1;i>=0;i--){var c=circles[i];var dx=x-c.x,dy=y-c.y;if(Math.sqrt(dx*dx+dy*dy)<=c.radius)return i;}
  return -1;
}

function showNodeDetail(html){var d=document.getElementById('nodeDetail');d.innerHTML=html;d.classList.add('show');}

// Click circle → fetch community detail
canvas.addEventListener('click',function(e){
  var rect=canvas.getBoundingClientRect();var x=e.clientX-rect.left,y=e.clientY-rect.top;
  var idx=getCircleAt(x,y);
  if(idx>=0){
    selectedIdx=idx;var c=circles[idx];draw();
    showNodeDetail('<div class="label">'+c.label+' ('+c.nodeCount+' nodes)</div><div class="meta">Loading...</div>');
    fetch('/api/community/'+c.community).then(function(r){return r.json();}).then(function(d){
      var list=(d.members||[]).slice(0,8).map(function(m){return '<span>'+m.label+' ('+m.type+')</span>';}).join('');
      showNodeDetail('<div class="label">'+c.label+' ('+c.nodeCount+' nodes)</div><div class="meta">'+(list||'<span>No members listed</span>')+'</div>');
    }).catch(function(){showNodeDetail('<div class="label">'+c.label+' ('+c.nodeCount+' nodes)</div><div class="meta"><span>Members: '+(c.memberList||'-')+'</span></div>');});
  } else {selectedIdx=-1;draw();document.getElementById('nodeDetail').classList.remove('show');}
});

canvas.addEventListener('mousemove',function(e){
  var rect=canvas.getBoundingClientRect();var x=e.clientX-rect.left,y=e.clientY-rect.top;
  var idx=getCircleAt(x,y);
  if(idx!==hoveredIdx){hoveredIdx=idx;canvas.style.cursor=idx>=0?'pointer':'default';draw();}
});
canvas.addEventListener('mouseleave',function(){hoveredIdx=-1;canvas.style.cursor='default';draw();});

// Search via API
var searchTimer;
document.getElementById('searchInput').addEventListener('input',function(){
  var q=this.value.trim();
  var results=document.getElementById('searchResults');
  if(!q||q.length<2){results.style.display='none';return;}
  if(searchTimer)clearTimeout(searchTimer);
  searchTimer=setTimeout(function(){
    fetch('/api/search?q='+encodeURIComponent(q)+'&limit=10').then(function(r){return r.json();}).then(function(d){
      var matches=d.results||[];
      if(!matches.length){results.style.display='none';return;}
      results.innerHTML=matches.map(function(m){return '<div class="search-result-item" data-id="'+m.id+'"><span class="search-item-label">'+m.label+'</span><span class="search-item-type">'+m.type+'</span></div>';}).join('');
      results.style.display='block';
    }).catch(function(){results.style.display='none';});
  },200);
});

document.getElementById('searchResults').addEventListener('click',function(e){
  var item=e.target.closest('.search-result-item');if(!item)return;
  var nodeId=item.dataset.id;
  fetch('/api/node/'+nodeId).then(function(r){return r.json();}).then(function(node){
    var commId=node.community;
    var ci=-1;for(var i=0;i<circles.length;i++){if(circles[i].community===commId){ci=i;break;}}
    if(ci>=0){selectedIdx=ci;draw();
      showNodeDetail('<div class="label">'+circles[ci].label+' ('+circles[ci].nodeCount+' nodes)</div><div class="meta"><span>Focus: '+node.label+'</span><span>Type: '+node.type+'</span><span>File: '+(node.filePath||'-')+'</span></div>');
    }
  }).catch(function(){});
  document.getElementById('searchResults').style.display='none';document.getElementById('searchInput').value='';
});

document.addEventListener('click',function(e){
  if(!e.target.closest('.search-box')){document.getElementById('searchResults').style.display='none';}
});

// Community list click
document.getElementById('communityList').addEventListener('click',function(e){
  var item=e.target.closest('.community-item');if(!item)return;
  var commId=parseInt(item.dataset.community);
  var ci=-1;for(var i=0;i<circles.length;i++){if(circles[i].community===commId){ci=i;break;}}
  if(ci>=0){
    selectedIdx=ci;var c=circles[ci];draw();
    showNodeDetail('<div class="label">'+c.label+' ('+c.nodeCount+' nodes)</div><div class="meta">Loading...</div>');
    fetch('/api/community/'+c.community).then(function(r){return r.json();}).then(function(d){
      var list=(d.members||[]).slice(0,8).map(function(m){return '<span>'+m.label+' ('+m.type+')</span>';}).join('');
      showNodeDetail('<div class="label">'+c.label+' ('+c.nodeCount+' nodes)</div><div class="meta">'+(list||'<span>No members listed</span>')+'</div>');
    }).catch(function(){showNodeDetail('<div class="label">'+c.label+' ('+c.nodeCount+' nodes)</div><div class="meta"><span>Members: '+(c.memberList||'-')+'</span></div>');});
  }
});
</script>
</body>
</html>`;
  }
}

module.exports = { KnowledgeGraph, COMMUNITY_COLORS };
