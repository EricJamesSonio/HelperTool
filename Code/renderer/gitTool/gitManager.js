/**
 * gitManager.js
 * Manages Git state and provides core Git functionality
 * Handles: working tree, staged files, commit history
 */

import { loadCommits, saveCommits } from './gitPersistence.js';

class GitManager {
  constructor() {
    this.workingTreeFiles = [];
    this.stagedFiles = [];
    this.commitHistory = [];
    this.currentRepo = null;
    this.isWatching = false;
    this.lastStatusRefresh = 0;
    this.statusRefreshInterval = 500; // ms
    this.groupThresholdMs = 300000; // default 5 min gap
    this._connectivityEdges = null; // cached import/dir relationships for smart splitting
  }

  /**
   * Initialize the Git manager with a repository path
   */
  setRepository(repoPath) {
    this.currentRepo = repoPath;
    this.workingTreeFiles = [];
    this.stagedFiles = [];
    this._connectivityEdges = null;
    const saved = loadCommits(repoPath);
    this.commitHistory = Array.isArray(saved) ? saved : [];
    return { success: true, repo: repoPath };
  }

  /**
   * Update working tree with git status output
   * @param {Array} files - Array of {file: string, status: string}
   */
updateWorkingTree(files, timestamps = null) {
  const existingMap = new Map(
    this.workingTreeFiles.map(f => [f.file, f])
  );

  this.workingTreeFiles = (files || []).map(incoming => {
    if (!incoming.file) return incoming;
    const existing = existingMap.get(incoming.file);
    const isNew = !existing;
    const statusChanged = existing && existing.status !== incoming.status;

    let modifiedAt;
    if (isNew || statusChanged) {
      modifiedAt = (timestamps && timestamps[incoming.file]) || Date.now();
    } else {
      modifiedAt = existing.modifiedAt;
    }

    return { ...incoming, modifiedAt };
  }).filter(Boolean);

  return this.workingTreeFiles;
}

  /**
   * Update staged files from git status output
   * @param {Array} files - Array of {file: string, status: string}
   */
  updateStagedFiles(files) {
    const seen = new Set();
    this.stagedFiles = (files || []).map(f => ({
      file: f.file,
      status: f.status
    })).filter(f => f.file && !seen.has(f.file) && seen.add(f.file));
    return this.stagedFiles;
  }

getWorkingTreeGroupedByTime() {
  const sorted = [...this.workingTreeFiles].sort(
    (a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0)
  );

  const groups = [];
  const seen = new Map();

  for (const file of sorted) {
    const label = this.getTimeGroupLabel(file.modifiedAt);
    if (!seen.has(label)) {
      seen.set(label, groups.length);
      groups.push({ label, files: [] });
    }
    groups[seen.get(label)].files.push(file);
  }

  return groups;
}

getTimeGroupLabel(ts) {
  if (!ts) return 'Unknown time';
  const age = Date.now() - ts;
  const min = 60_000;
  const hr = 3_600_000;
  if (age < 2 * min)  return 'Just now';
  if (age < 10 * min) return 'Last few minutes';
  if (age < 30 * min) return 'Last 30 minutes';
  if (age < hr)       return 'Last hour';
  if (age < 3 * hr)   return 'Last few hours';
  if (age < 24 * hr)  return 'Earlier today';
  return 'Older changes';
}

  /**
   * Set the time gap threshold for smart grouping (ms)
   */
  setGroupThreshold(ms) {
    this.groupThresholdMs = ms;
  }

  /**
   * Cache connectivity edges from symbols.json for smart splitting.
   * @param {Array<{from:string, to:string, type:string}>} edges
   */
  setConnectivityEdges(edges) {
    this._connectivityEdges = Array.isArray(edges) ? edges : null;
  }

  clearConnectivity() {
    this._connectivityEdges = null;
  }

  /**
   * Smart group files by time proximity + connectivity.
   * Stage 1: Time-based clustering (gap > threshold = new group)
   * Stage 2: If edges provided, split each time cluster by import/directory connectivity
   *
   * @param {number} [thresholdMs] — optional override, defaults to this.groupThresholdMs
   * @param {Array<{from:string, to:string, type:string}>} [edges] — optional connectivity edges
   * @returns {Array<{label:string, files:Array, timeRange:{start:number,end:number}}>}
   */
  getSmartGroups(thresholdMs, edges) {
    const effectiveThreshold = thresholdMs || this.groupThresholdMs || 300000;
    let connectivityEdges = edges || this._connectivityEdges;

    const sorted = [...this.workingTreeFiles].sort(
      (a, b) => (a.modifiedAt || 0) - (b.modifiedAt || 0)
    );

    if (sorted.length === 0) return [];

    // Stage 1: Session-based time clustering
    const timeGroups = [];
    let current = { files: [], label: '', timeRange: { start: null, end: null } };

    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i];

      if (current.files.length === 0) {
        current.files.push(file);
        current.timeRange.start = file.modifiedAt;
        current.timeRange.end = file.modifiedAt;
        continue;
      }

      const prev = sorted[i - 1];
      const gap = (file.modifiedAt || 0) - (prev.modifiedAt || 0);

      if (gap >= effectiveThreshold || gap < 0) {
        current.label = this._formatTimeRange(current.timeRange);
        timeGroups.push(current);
        current = { files: [], label: '', timeRange: { start: null, end: null } };
      }

      current.files.push(file);
      if (file.modifiedAt) {
        if (!current.timeRange.start || file.modifiedAt < current.timeRange.start) current.timeRange.start = file.modifiedAt;
        if (!current.timeRange.end || file.modifiedAt > current.timeRange.end) current.timeRange.end = file.modifiedAt;
      }
    }

    if (current.files.length > 0) {
      current.label = this._formatTimeRange(current.timeRange);
      timeGroups.push(current);
    }

    const result = timeGroups.reverse();

    // Stage 2: Build connectivity edges if none provided (directory proximity fallback)
    if (!connectivityEdges || connectivityEdges.length === 0) {
      connectivityEdges = this._buildDirectoryEdges(sorted);
    }

    // Stage 3: Split each time session by connectivity
    if (connectivityEdges.length > 0) {
      return result.flatMap(group => {
        if (group.files.length <= 1) return [group];
        const subGroups = this._splitByConnectivity(group.files, connectivityEdges);
        return subGroups.map(files => ({
          label: group.label,
          files,
          timeRange: this._subGroupTimeRange(files),
        }));
      });
    }

    return result;
  }

  /**
   * Build directory-proximity edges as fallback when no symbols.json connectivity exists.
   * Files sharing the same parent directory or top-level module directory are connected.
   */
  _buildDirectoryEdges(files) {
    const edges = [];
    const seen = new Set();

    const addEdge = (a, b, type) => {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from: a, to: b, type });
      }
    };

    // Layer 1: Exact parent directory
    const parentDirGroups = new Map();
    for (const f of files) {
      const idx = f.file.lastIndexOf('/');
      const dir = idx >= 0 ? f.file.substring(0, idx) : '';
      if (!parentDirGroups.has(dir)) parentDirGroups.set(dir, []);
      parentDirGroups.get(dir).push(f.file);
    }
    for (const [, group] of parentDirGroups) {
      if (group.length >= 2) {
        for (let i = 1; i < group.length; i++) {
          addEdge(group[0], group[i], 'same-dir');
        }
      }
    }

    // Layer 2: Top-level module directory (first path segment)
    const topDirGroups = new Map();
    for (const f of files) {
      const parts = f.file.split('/');
      const topDir = parts.length > 1 ? parts[0] : '';
      if (!topDirGroups.has(topDir)) topDirGroups.set(topDir, []);
      topDirGroups.get(topDir).push(f.file);
    }
    for (const [, group] of topDirGroups) {
      if (group.length >= 2) {
        for (let i = 1; i < group.length; i++) {
          addEdge(group[0], group[i], 'dir-proximity');
        }
      }
    }

    return edges;
  }

  /**
   * Split a list of files into connected components using union-find.
   * Two files are connected if an edge exists between them (import or same-dir).
   */
  _splitByConnectivity(files, edges) {
    const parent = new Map();

    const find = (x) => {
      if (!parent.has(x)) parent.set(x, x);
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
      return parent.get(x);
    };
    const union = (a, b) => {
      parent.set(find(a), find(b));
    };

    for (const f of files) {
      parent.set(f.file, f.file);
    }

    for (const edge of edges) {
      if (parent.has(edge.from) && parent.has(edge.to)) {
        union(edge.from, edge.to);
      }
    }

    const compMap = new Map();
    for (const f of files) {
      const root = find(f.file);
      if (!compMap.has(root)) compMap.set(root, []);
      compMap.get(root).push(f);
    }

    return Array.from(compMap.values());
  }

  /**
   * Compute a time range label for a sub-group of files.
   */
  _subGroupTimeRange(files) {
    let start = null;
    let end = null;
    for (const f of files) {
      if (!f.modifiedAt) continue;
      if (start === null || f.modifiedAt < start) start = f.modifiedAt;
      if (end === null || f.modifiedAt > end) end = f.modifiedAt;
    }
    return { start, end };
  }

  /**
   * Format a time range for display in the group header.
   */
  _formatTimeRange(range) {
    const fmt = (ts) => {
      if (!ts) return 'Unknown';
      const d = new Date(ts);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };
    if (!range.start && !range.end) return 'Unknown time';
    if (!range.start || !range.end || range.start === range.end) return fmt(range.start || range.end);
    return `${fmt(range.start)} – ${fmt(range.end)}`;
  }

  /**
   * Stage a file (move from working tree to staged)
   */
  stageFile(filePath) {
    const fileIndex = this.workingTreeFiles.findIndex(f => f.file === filePath);
    if (fileIndex === -1) return { error: 'File not found in working tree' };

    const file = this.workingTreeFiles[fileIndex];
    
    // Check if already staged
    if (this.stagedFiles.some(f => f.file === filePath)) {
      return { error: 'File already staged' };
    }

    const stagedStatus = file.status === '?' ? 'A' : file.status;
    this.stagedFiles.push({ ...file, status: stagedStatus, originalIndex: fileIndex });
    this.workingTreeFiles.splice(fileIndex, 1);

    return { success: true, staged: this.stagedFiles };
  }

  /**
   * Stage multiple files at once
   */
  stageFiles(filePaths) {
    const results = filePaths.map(path => this.stageFile(path));
    return { success: true, staged: this.stagedFiles, results };
  }

  /**
   * Unstage a file (move back to working tree)
   */
unstageFile(filePath) {
  const fileIndex = this.stagedFiles.findIndex(f => f.file === filePath);
  if (fileIndex === -1) return { error: 'File not found in staged area' };

  const file = this.stagedFiles[fileIndex];

  // Only add to working tree if not already present (avoid duplicates)
  if (!this.workingTreeFiles.some(f => f.file === filePath)) {
    this.workingTreeFiles.push({ file: file.file, status: file.status, modifiedAt: file.modifiedAt });
  }

  this.stagedFiles.splice(fileIndex, 1);

  return { success: true, working: this.workingTreeFiles };
}

  /**
   * Unstage multiple files at once
   */
  unstageFiles(filePaths) {
    const results = filePaths.map(path => this.unstageFile(path));
    return { success: true, working: this.workingTreeFiles, results };
  }

  /**
   * Create a commit from staged files
   */
  createCommit(message, options = {}) {
    if (this.stagedFiles.length === 0) {
      return { error: 'No files staged for commit' };
    }

    if (!message || message.trim().length === 0) {
      return { error: 'Commit message cannot be empty' };
    }

    const commit = {
      id: this.generateCommitId(),
      message: message.trim(),
      files: this.stagedFiles.map(f => ({ file: f.file, status: f.status })),
      timestamp: new Date().toISOString(),
      committed: true,
      pushed: false,
      pushRequested: options.pushAfter || false
    };

    this.commitHistory.unshift(commit);
    this.stagedFiles = [];

    saveCommits(this.currentRepo, this.commitHistory);

    return {
      success: true,
      commit,
      history: this.commitHistory
    };
  }

  /**
   * Mark a commit as pushed
   */
  markCommitPushed(commitId) {
    const commit = this.commitHistory.find(c => c.id === commitId);
    if (!commit) return { error: 'Commit not found' };

    commit.pushed = true;
    saveCommits(this.currentRepo, this.commitHistory);
    return { success: true, commit };
  }

  markAllPushed() {
    const unpushed = this.commitHistory.filter(c => !c.pushed);
    if (unpushed.length === 0) return { error: 'No unpushed commits' };
    unpushed.forEach(c => c.pushed = true);
    saveCommits(this.currentRepo, this.commitHistory);
    return { success: true, count: unpushed.length };
  }

  /**
   * Get current state as object (for UI rendering)
   */
  getState() {
    return {
      currentRepo: this.currentRepo,
      workingTree: this.workingTreeFiles,
      staged: this.stagedFiles,
      history: this.commitHistory,
      stats: {
        working: this.workingTreeFiles.length,
        staged: this.stagedFiles.length,
        commits: this.commitHistory.length,
        unpushed: this.commitHistory.filter(c => !c.pushed).length
      }
    };
  }

  /**
   * Clear all data (when switching repos or resetting)
   */
  reset() {
    this.workingTreeFiles = [];
    this.stagedFiles = [];
    this.commitHistory = [];
    return { success: true };
  }

  /**
   * Generate a unique commit ID (simplified - use git hash in production)
   */
  generateCommitId() {
    return `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get stats for UI badges and counters
   */
  getStats() {
    return {
      working: this.workingTreeFiles.length,
      staged: this.stagedFiles.length,
      commits: this.commitHistory.length,
      unpushed: this.commitHistory.filter(c => !c.pushed).length
    };
  }
}

export default GitManager;