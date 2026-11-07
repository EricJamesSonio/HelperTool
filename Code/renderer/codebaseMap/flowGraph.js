const SVG_NS = 'http://www.w3.org/2000/svg';
const STYLE_ID = 'cmf-styles';
const AUTO_EXPAND_LIMIT = 40;
const MAX_PER_ROW = 4;
const COL_GAP = 60;
const ROW_GAP = 96;
const FRAME_PAD = 28;
const FRAME_HEAD = 38;
const FIT_TOP = 78;
const FIT_SIDE = 40;
const FIT_BOTTOM = 30;
const MIN_FIT_K = 0.8;

const MEMBER_MAX = 8;
const MEMBER_STEP = 17;
const CARD_HEAD = 52;

const CSS = `
.cmf-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: none;
  border-radius: 0;
  background-color: var(--bg-base);
  background-image: radial-gradient(var(--border-subtle) 1px, transparent 1px);
  background-size: 22px 22px;
  font-family: var(--font-ui);
}
.cmf-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
  touch-action: none;
}
.cmf-svg.panning { cursor: grabbing; }
.cmf-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--r-md, 9px);
  box-shadow: var(--shadow-md);
}
.cmf-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 10px;
}
.cmf-btn {
  height: 30px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--accent-dim);
  border: 1px solid var(--accent-border);
  border-radius: var(--r-sm, 6px);
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.cmf-btn:hover { background: var(--accent-glow); }
.cmf-btn.plain {
  background: var(--bg-raised);
  border-color: var(--border-default);
  color: var(--text-secondary);
}
.cmf-btn.plain:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.cmf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.cmf-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 99px;
  background: var(--bg-raised);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11.5px;
}
.cmf-chip button {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0;
}
.cmf-chip button:hover { color: var(--red); }
.cmf-opt {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
.cmf-stats {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 11.5px;
  font-family: var(--font-mono);
}
.cmf-scope-panel {
  position: absolute;
  top: 64px;
  left: 12px;
  z-index: 7;
  width: 360px;
  max-height: calc(100% - 100px);
  display: none;
  flex-direction: column;
  overflow: hidden;
}
.cmf-scope-panel.open { display: flex; }
.cmf-search {
  margin: 10px;
  height: 32px;
  padding: 0 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-mid);
  border-radius: var(--r-sm, 6px);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
}
.cmf-search:focus { border-color: var(--accent); }
.cmf-scope-list {
  overflow-y: auto;
  padding: 0 6px 10px;
}
.cmf-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: var(--r-xs, 4px);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
}
.cmf-row:hover { background: var(--bg-hover); color: var(--text-primary); }
.cmf-row.on { color: var(--text-primary); }
.cmf-row .caret {
  width: 14px;
  text-align: center;
  color: var(--text-muted);
  flex-shrink: 0;
}
.cmf-row .name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmf-row .count {
  color: var(--text-faint);
  font-size: 11px;
}
.cmf-row input { pointer-events: none; }
.cmf-details {
  position: absolute;
  top: 64px;
  right: 12px;
  z-index: 6;
  width: 330px;
  max-height: calc(100% - 140px);
  display: none;
  flex-direction: column;
  overflow: hidden;
}
.cmf-details-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.cmf-details-title {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmf-details-body {
  overflow-y: auto;
  padding: 10px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cmf-path {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
}
.cmf-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cmf-tag {
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
}
.cmf-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.cmf-sec-title {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.cmf-link {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 5px 8px;
  background: var(--bg-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-xs, 4px);
  margin-bottom: 4px;
  cursor: pointer;
  text-align: left;
}
.cmf-link:hover { background: var(--bg-hover); border-color: var(--border-default); }
.cmf-link .l {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-primary);
  word-break: break-all;
}
.cmf-link .s {
  font-size: 10.5px;
  color: var(--text-muted);
}
.cmf-empty-note {
  font-size: 11.5px;
  color: var(--text-faint);
  font-style: italic;
}
.cmf-controls {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 6;
  display: flex;
  gap: 6px;
  padding: 6px;
}
.cmf-hint {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 6;
  padding: 6px 10px;
  color: var(--text-muted);
  font-size: 11px;
}
.cmf-frame-rect {
  fill: color-mix(in srgb, var(--c) 6%, transparent);
  stroke: var(--c);
  stroke-width: 2;
}
.cmf-frame.ext .cmf-frame-rect {
  stroke-dasharray: 7 5;
  opacity: 0.75;
}
.cmf-frame-title {
  fill: var(--c);
  font-family: var(--font-ui);
  font-size: 13px;
  font-style: italic;
  font-weight: 700;
  pointer-events: none;
}
.cmf-frame-hit { fill: transparent; }
.cmf-frame-head { cursor: grab; }
.cmf-node { cursor: grab; }
.cmf-node-back {
  fill: color-mix(in srgb, var(--c) 10%, var(--bg-elevated));
  stroke: var(--c);
  stroke-width: 1.2;
  opacity: 0.6;
}
.cmf-node-rect {
  fill: color-mix(in srgb, var(--c) 8%, var(--bg-elevated));
  stroke: var(--c);
  stroke-width: 1.6;
}
.cmf-node.folder .cmf-node-rect {
  fill: color-mix(in srgb, var(--c) 14%, var(--bg-elevated));
}
.cmf-node.ext .cmf-node-rect { stroke-dasharray: 5 4; }
.cmf-node.ext { opacity: 0.85; }
.cmf-node:hover .cmf-node-rect { fill: color-mix(in srgb, var(--c) 20%, var(--bg-elevated)); }
.cmf-node.sel .cmf-node-rect {
  stroke-width: 3;
  filter: drop-shadow(0 0 8px var(--c));
}
.cmf-node.dim { opacity: 0.25; }
.cmf-node-name {
  fill: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  text-anchor: middle;
  pointer-events: none;
}
.cmf-node-sub {
  fill: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 10.5px;
  font-weight: 500;
  text-anchor: middle;
  pointer-events: none;
}
.cmf-node-divider {
  stroke: var(--c);
  stroke-opacity: 0.55;
  stroke-width: 1;
  pointer-events: none;
}
.cmf-member {
  fill: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11.5px;
  text-anchor: middle;
  pointer-events: none;
}
.cmf-member.more {
  fill: var(--text-faint);
  font-style: italic;
}
.cmf-edge {
  fill: none;
  stroke: var(--text-muted);
  stroke-width: 1.3;
  stroke-linecap: round;
  opacity: 0.65;
}
.cmf-edge-g.out .cmf-edge {
  stroke: var(--accent);
  opacity: 1;
}
.cmf-edge-g.in .cmf-edge {
  stroke: var(--green);
  opacity: 1;
}
.cmf-edge-g.dim { opacity: 0.07; }
.cmf-root.arrows-collapsed .cmf-edge-g { display: none; }
.cmf-root.arrows-collapsed .cmf-edge-g.out,
.cmf-root.arrows-collapsed .cmf-edge-g.in { display: inline; }
.cmf-port {
  fill: var(--bg-surface);
  stroke: var(--text-muted);
  stroke-width: 1.5;
}
.cmf-pill-rect {
  fill: var(--bg-raised);
  stroke: var(--border-default);
  stroke-width: 1;
}
.cmf-pill-text {
  fill: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 700;
  text-anchor: middle;
}
.cmf-arrow { fill: var(--text-muted); }
.cmf-arrow-out { fill: var(--accent); }
.cmf-arrow-in { fill: var(--green); }
.cmf-empty-text {
  fill: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 14px;
}
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  const map = attrs || {};
  for (const key of Object.keys(map)) {
    el.setAttribute(key, String(map[key]));
  }
  if (parent) parent.appendChild(el);
  return el;
}

function htmlEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

function baseName(p) {
  return p.slice(p.lastIndexOf('/') + 1);
}

function dirName(p) {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function clip(s, max) {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

function buildFolderTree(files) {
  const root = { path: '', name: 'root', fileCount: 0, children: new Map(), fileNames: [] };
  const meta = new Map();
  meta.set('', root);
  for (const f of files) {
    const segs = f.path.split('/');
    let cur = root;
    cur.fileCount += 1;
    let acc = '';
    for (let i = 0; i < segs.length - 1; i++) {
      acc = acc ? acc + '/' + segs[i] : segs[i];
      let next = cur.children.get(segs[i]);
      if (!next) {
        next = { path: acc, name: segs[i], fileCount: 0, children: new Map(), fileNames: [] };
        cur.children.set(segs[i], next);
        meta.set(acc, next);
      }
      next.fileCount += 1;
      cur = next;
    }
    cur.fileNames.push(segs[segs.length - 1]);
  }
  return { root: root, meta: meta };
}

export function mountFlowGraph(container, graph) {
  injectStyles();
  container.innerHTML = '';
  container.classList.add('cmf-root');

  const files = graph.files || [];
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const outAdj = new Map();
  const inAdj = new Map();
  for (const e of graph.edges || []) {
    if (!outAdj.has(e.from)) outAdj.set(e.from, new Map());
    outAdj.get(e.from).set(e.to, e);
    if (!inAdj.has(e.to)) inAdj.set(e.to, new Map());
    inAdj.get(e.to).set(e.from, e);
  }

  const tree = buildFolderTree(files);
  const folderMeta = tree.meta;
  const topSegs = Array.from(new Set(files.filter((f) => f.path.includes('/')).map((f) => f.path.split('/')[0]))).sort();
  const colorIdx = new Map(topSegs.map((s, i) => [s, i % 10]));

  function topColor(top) {
    if (top && colorIdx.has(top)) return 'var(--dl' + colorIdx.get(top) + '-color)';
    return 'var(--text-muted)';
  }

  const state = {
    scope: [''],
    expanded: new Set(),
    showExternal: true,
    onlyConnected: false,
    collapseArrows: false,
    selected: null,
  };
  const view = { x: 0, y: 0, k: 1 };
  const openFolders = new Set();
  let model = null;
  let edgeRecords = [];
  let nodeEls = new Map();
  let frameEls = new Map();
  let panning = null;
  let drag = null;
  let suppressClick = false;

  const svg = svgEl('svg', { class: 'cmf-svg' });
  container.appendChild(svg);
  const defs = svgEl('defs', {}, svg);
  addMarker('cmf-arrow', 'cmf-arrow');
  addMarker('cmf-arrow-out', 'cmf-arrow-out');
  addMarker('cmf-arrow-in', 'cmf-arrow-in');
  const viewport = svgEl('g', {}, svg);
  const gFrames = svgEl('g', {}, viewport);
  const gEdges = svgEl('g', {}, viewport);
  const gNodes = svgEl('g', {}, viewport);

  const toolbar = htmlEl('div', 'cmf-toolbar cmf-panel');
  const scopeBtn = htmlEl('button', 'cmf-btn', 'Scope \u25BE');
  const chips = htmlEl('div', 'cmf-chips');
  const stats = htmlEl('span', 'cmf-stats');
  toolbar.appendChild(scopeBtn);
  toolbar.appendChild(chips);
  toolbar.appendChild(makeOption('External links', 'showExternal'));
  toolbar.appendChild(makeOption('Only connected', 'onlyConnected'));
  toolbar.appendChild(makeOption('Collapse arrows', 'collapseArrows', () => {
    container.classList.toggle('arrows-collapsed', state.collapseArrows);
  }));
  toolbar.appendChild(stats);
  container.appendChild(toolbar);

  const scopePanel = htmlEl('div', 'cmf-scope-panel cmf-panel');
  const searchInput = htmlEl('input', 'cmf-search');
  searchInput.placeholder = 'Filter folders...';
  const scopeList = htmlEl('div', 'cmf-scope-list');
  scopePanel.appendChild(searchInput);
  scopePanel.appendChild(scopeList);
  container.appendChild(scopePanel);

  const details = htmlEl('div', 'cmf-details cmf-panel');
  container.appendChild(details);

  const controls = htmlEl('div', 'cmf-controls cmf-panel');
  container.appendChild(controls);
  addControl('+', 'Zoom in', () => zoomBy(1.25));
  addControl('\u2212', 'Zoom out', () => zoomBy(0.8));
  addControl('Fit', 'Fit to screen', () => fitView());
  addControl('Re-layout', 'Reset dragged positions', () => rebuild({ fit: true }));
  addControl('Expand all', 'Expand every folder', () => {
    state.expanded = new Set(Array.from(folderMeta.keys()).filter((p) => p !== ''));
    rebuild({ fit: true });
  });
  addControl('Collapse all', 'Collapse folders', () => {
    state.expanded = new Set();
    rebuild({ fit: true });
  });

  const hint = htmlEl('div', 'cmf-hint cmf-panel', 'Scroll to pan \u00B7 Shift+scroll sideways \u00B7 Ctrl+scroll to zoom \u00B7 drag cards or folders to move \u00B7 double-click a folder to open it \u00B7 click a card to trace links');
  container.appendChild(hint);

  function addMarker(id, cls) {
    const m = svgEl('marker', {
      id: id,
      viewBox: '0 0 10 10',
      refX: '10',
      refY: '5',
      markerWidth: '10',
      markerHeight: '10',
      markerUnits: 'userSpaceOnUse',
      orient: 'auto-start-reverse',
    }, defs);
    svgEl('path', { d: 'M0 0L10 5L0 10z', class: cls }, m);
  }

  function addControl(label, title, fn) {
    const b = htmlEl('button', 'cmf-btn plain', label);
    b.title = title;
    b.addEventListener('click', fn);
    controls.appendChild(b);
  }

  function makeOption(label, key, onChange) {
    const l = htmlEl('label', 'cmf-opt');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state[key];
    input.addEventListener('change', () => {
      state[key] = input.checked;
      if (onChange) onChange();
      else rebuild({ fit: true });
    });
    l.appendChild(input);
    l.appendChild(document.createTextNode(' ' + label));
    return l;
  }

  function isInScope(p) {
    return state.scope.some((r) => r === '' || p === r || p.startsWith(r + '/'));
  }

  function forcedExpanded() {
    const s = new Set();
    for (const r of state.scope) {
      if (!r) continue;
      let acc = '';
      for (const seg of r.split('/')) {
        acc = acc ? acc + '/' + seg : seg;
        s.add(acc);
      }
    }
    return s;
  }

  function applyScopeChange() {
    const inScopeFiles = files.filter((f) => isInScope(f.path));
    if (inScopeFiles.length <= AUTO_EXPAND_LIMIT) {
      const all = new Set();
      for (const f of inScopeFiles) {
        let acc = '';
        const segs = f.path.split('/');
        for (let i = 0; i < segs.length - 1; i++) {
          acc = acc ? acc + '/' + segs[i] : segs[i];
          all.add(acc);
        }
      }
      state.expanded = all;
    } else {
      state.expanded = new Set();
    }
    state.selected = null;
    renderChips();
    renderScopeList();
    rebuild({ fit: true });
  }

  function setScope(paths) {
    const clean = paths.filter((p) => p !== '');
    state.scope = clean.length ? clean : [''];
    applyScopeChange();
  }

  function toggleScope(path) {
    const set = new Set(state.scope.filter((s) => s !== ''));
    if (set.has(path)) set.delete(path);
    else set.add(path);
    setScope(Array.from(set));
  }

  function renderChips() {
    chips.innerHTML = '';
    for (const s of state.scope) {
      const chip = htmlEl('span', 'cmf-chip');
      chip.appendChild(document.createTextNode(s === '' ? (graph.rootName || 'root') + ' (root)' : s));
      if (s !== '') {
        const x = htmlEl('button', '', '\u00D7');
        x.title = 'Remove from scope';
        x.addEventListener('click', () => toggleScope(s));
        chip.appendChild(x);
      }
      chips.appendChild(chip);
    }
  }

  function renderScopeList() {
    scopeList.innerHTML = '';
    const q = searchInput.value.trim().toLowerCase();
    const selected = new Set(state.scope);

    const addRow = (m, depth, hasKids, isRoot) => {
      const row = htmlEl('div', 'cmf-row' + (selected.has(m.path) ? ' on' : ''));
      row.style.paddingLeft = (6 + depth * 16) + 'px';
      const caret = htmlEl('span', 'caret', hasKids ? (openFolders.has(m.path) ? '\u25BE' : '\u25B8') : '');
      if (hasKids) {
        caret.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (openFolders.has(m.path)) openFolders.delete(m.path);
          else openFolders.add(m.path);
          renderScopeList();
        });
      }
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.has(m.path);
      row.appendChild(caret);
      row.appendChild(cb);
      row.appendChild(htmlEl('span', 'name', isRoot ? 'root (all files)' : (q ? m.path : m.name)));
      row.appendChild(htmlEl('span', 'count', String(m.fileCount)));
      row.addEventListener('click', () => {
        if (isRoot) setScope([]);
        else toggleScope(m.path);
      });
      scopeList.appendChild(row);
    };

    const walk = (node, depth) => {
      const kids = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));
      for (const child of kids) {
        const hasKids = child.children.size > 0;
        addRow(child, depth, hasKids, false);
        if (hasKids && openFolders.has(child.path)) walk(child, depth + 1);
      }
    };

    addRow(tree.root, 0, false, true);
    if (q) {
      const matches = Array.from(folderMeta.values()).filter((m) => m.path && m.path.toLowerCase().includes(q));
      matches.sort((a, b) => a.path.localeCompare(b.path));
      for (const m of matches) addRow(m, 0, false, false);
    } else {
      walk(tree.root, 0);
    }
  }

  scopeBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    scopePanel.classList.toggle('open');
    if (scopePanel.classList.contains('open')) renderScopeList();
  });
  scopePanel.addEventListener('click', (ev) => ev.stopPropagation());
  searchInput.addEventListener('input', renderScopeList);
  const onDocClick = () => scopePanel.classList.remove('open');
  document.addEventListener('click', onDocClick);

  function computeModel() {
    const forced = forcedExpanded();
    const isExp = (folder) => forced.has(folder) || state.expanded.has(folder);
    const nodes = new Map();

    const rep = (p) => {
      const segs = p.split('/');
      let acc = '';
      for (let i = 0; i < segs.length - 1; i++) {
        acc = acc ? acc + '/' + segs[i] : segs[i];
        if (!isExp(acc)) return { kind: 'folder', path: acc };
      }
      return { kind: 'file', path: p };
    };

    const makeNode = (kind, path) => {
      const id = (kind === 'folder' ? 'd:' : 'f:') + path;
      let n = nodes.get(id);
      if (n) return n;
      const label = baseName(path);
      const shown = clip(label, 30);
      const top = path.includes('/') || kind === 'folder' ? path.split('/')[0] : null;
      n = {
        kind: kind,
        id: id,
        path: path,
        label: label,
        shown: shown,
        inScope: false,
        out: 0,
        inn: 0,
        parentFrame: null,
        color: topColor(top),
        symbols: 0,
        language: '',
        files: 0,
        members: [],
        more: 0,
      };
      let names = [];
      let total = 0;
      if (kind === 'file') {
        const f = fileMap.get(path);
        n.symbols = f ? f.symbols : 0;
        n.language = f ? f.language : '';
        names = f && Array.isArray(f.symbolNames) ? f.symbolNames : [];
        total = Math.max(n.symbols, names.length);
      } else {
        const m = folderMeta.get(path);
        n.files = m ? m.fileCount : 0;
        if (m) {
          const kids = Array.from(m.children.values()).sort((a, b) => a.name.localeCompare(b.name));
          for (const c of kids) names.push(c.name + '/');
          for (const fn of m.fileNames.slice().sort()) names.push(fn);
        }
        total = names.length;
      }
      n.members = names.slice(0, MEMBER_MAX).map((s) => clip(s, 34));
      n.more = Math.max(0, total - n.members.length);

      let longest = 0;
      for (const s of n.members) longest = Math.max(longest, s.length);
      const nameLen = shown.length + (kind === 'folder' ? 1 : 0);
      n.w = clamp(Math.round(Math.max(nameLen * 8.4, longest * 7, 30 * 5.9)) + 44, 190, 320);
      const rows = n.members.length + (n.more ? 1 : 0);
      n.h = CARD_HEAD + (rows ? rows * MEMBER_STEP + 14 : 8);
      nodes.set(id, n);
      return n;
    };

    const usedEdges = [];
    const include = new Set();
    for (const e of graph.edges || []) {
      const inS = isInScope(e.from);
      const inT = isInScope(e.to);
      if (!inS && !inT) continue;
      if (!state.showExternal && !(inS && inT)) continue;
      usedEdges.push(e);
      include.add(e.from);
      include.add(e.to);
    }
    if (!state.onlyConnected) {
      for (const f of files) {
        if (isInScope(f.path)) include.add(f.path);
      }
    }
    for (const p of include) {
      const r = rep(p);
      const n = makeNode(r.kind, r.path);
      if (isInScope(p)) n.inScope = true;
    }

    const aggMap = new Map();
    for (const e of usedEdges) {
      const ra = rep(e.from);
      const rb = rep(e.to);
      const a = nodes.get((ra.kind === 'folder' ? 'd:' : 'f:') + ra.path);
      const b = nodes.get((rb.kind === 'folder' ? 'd:' : 'f:') + rb.path);
      if (!a || !b || a === b) continue;
      const key = a.id + '>' + b.id;
      let agg = aggMap.get(key);
      if (!agg) {
        agg = { a: a, b: b, count: 0, pairs: 0, names: new Set() };
        aggMap.set(key, agg);
        a.out += 1;
        b.inn += 1;
      }
      agg.count += e.count || 1;
      agg.pairs += 1;
      for (const nm of e.names || []) agg.names.add(nm);
    }
    const aggList = Array.from(aggMap.values());

    const frames = new Map();
    const getFrame = (path) => {
      let f = frames.get(path);
      if (!f) {
        f = { kind: 'frame', path: path, children: [], parent: null, hasScope: false };
        frames.set(path, f);
        if (path !== '') {
          const p = getFrame(dirName(path));
          f.parent = p;
          p.children.push(f);
        }
      }
      return f;
    };
    getFrame('');
    for (const n of nodes.values()) {
      const fr = getFrame(dirName(n.path));
      fr.children.push(n);
      n.parentFrame = fr;
      if (n.inScope) {
        let cur = fr;
        while (cur) {
          cur.hasScope = true;
          cur = cur.parent;
        }
      }
    }

    const chainOf = (n) => {
      const arr = [];
      let f = n.parentFrame;
      while (f) {
        arr.push(f);
        f = f.parent;
      }
      return arr.reverse();
    };

    const localEdges = new Map();
    for (const agg of aggList) {
      const ca = chainOf(agg.a);
      const cb = chainOf(agg.b);
      let i = 0;
      while (i < ca.length && i < cb.length && ca[i] === cb[i]) i++;
      const owner = ca[i - 1];
      const ia = i < ca.length ? ca[i] : agg.a;
      const ib = i < cb.length ? cb[i] : agg.b;
      if (!owner || ia === ib) continue;
      if (!localEdges.has(owner)) localEdges.set(owner, []);
      localEdges.get(owner).push({ from: ia, to: ib });
    }

    const root = frames.get('');
    layoutFrame(root, localEdges);
    placeFrame(root, 0, 0);
    routeEdges(aggList);

    const frameOrder = Array.from(frames.values()).sort((p, q) => frameDepth(q) - frameDepth(p));

    return { nodes: nodes, aggList: aggList, frames: frames, frameOrder: frameOrder, root: root, forced: forced };
  }

  function frameDepth(f) {
    return f.path === '' ? 0 : f.path.split('/').length;
  }

  function itemKey(it) {
    return it.path;
  }

  function layoutFrame(fr, localEdges) {
    for (const c of fr.children) {
      if (c.kind === 'frame') layoutFrame(c, localEdges);
    }
    const isRoot = fr.path === '';
    const pad = isRoot ? 0 : FRAME_PAD;
    const head = isRoot ? 0 : FRAME_HEAD;
    const items = fr.children.slice().sort((a, b) => itemKey(a).localeCompare(itemKey(b)));

    const succ = new Map();
    const pred = new Map();
    for (const it of items) {
      succ.set(it, new Set());
      pred.set(it, new Set());
    }
    for (const e of localEdges.get(fr) || []) {
      if (!succ.has(e.from) || !succ.has(e.to)) continue;
      succ.get(e.from).add(e.to);
      pred.get(e.to).add(e.from);
    }

    const mark = new Map();
    const dagSucc = new Map();
    for (const it of items) dagSucc.set(it, []);
    const visit = (u) => {
      mark.set(u, 1);
      for (const v of succ.get(u)) {
        const s = mark.get(v) || 0;
        if (s === 1) continue;
        dagSucc.get(u).push(v);
        if (s === 0) visit(v);
      }
      mark.set(u, 2);
    };
    for (const it of items) {
      if (!mark.get(it)) visit(it);
    }

    const indeg = new Map();
    for (const it of items) indeg.set(it, 0);
    for (const it of items) {
      for (const v of dagSucc.get(it)) indeg.set(v, indeg.get(v) + 1);
    }
    const layer = new Map();
    const queue = items.filter((it) => indeg.get(it) === 0);
    for (const it of queue) layer.set(it, 0);
    while (queue.length) {
      const u = queue.shift();
      for (const v of dagSucc.get(u)) {
        layer.set(v, Math.max(layer.get(v) || 0, layer.get(u) + 1));
        indeg.set(v, indeg.get(v) - 1);
        if (indeg.get(v) === 0) queue.push(v);
      }
    }

    const connected = items.filter((it) => succ.get(it).size > 0 || pred.get(it).size > 0);
    const isolated = items.filter((it) => succ.get(it).size === 0 && pred.get(it).size === 0);

    const layersArr = [];
    for (const it of connected) {
      const li = layer.get(it) || 0;
      if (!layersArr[li]) layersArr[li] = [];
      layersArr[li].push(it);
    }
    const ord = new Map();
    const bary = (it) => {
      const ps = Array.from(pred.get(it)).filter((p) => ord.has(p));
      if (!ps.length) return 0;
      let sum = 0;
      for (const p of ps) sum += ord.get(p);
      return sum / ps.length;
    };
    const rows = [];
    for (let li = 0; li < layersArr.length; li++) {
      const arr = layersArr[li];
      if (!arr) continue;
      if (li > 0) arr.sort((a, b) => bary(a) - bary(b));
      arr.forEach((it, idx) => ord.set(it, idx));
      for (let i = 0; i < arr.length; i += MAX_PER_ROW) {
        rows.push(arr.slice(i, i + MAX_PER_ROW));
      }
    }
    for (let i = 0; i < isolated.length; i += MAX_PER_ROW) {
      rows.push(isolated.slice(i, i + MAX_PER_ROW));
    }

    let cursorY = 0;
    let maxW = 0;
    const rowInfo = [];
    for (const row of rows) {
      let w = 0;
      let h = 0;
      for (const it of row) {
        w += it.w;
        h = Math.max(h, it.h);
      }
      w += COL_GAP * Math.max(0, row.length - 1);
      rowInfo.push({ row: row, w: w, h: h, y: cursorY });
      cursorY += h + ROW_GAP;
      maxW = Math.max(maxW, w);
    }
    const contentH = rows.length ? cursorY - ROW_GAP : 0;

    for (const info of rowInfo) {
      let x = (maxW - info.w) / 2;
      for (const it of info.row) {
        it.rx = x + pad;
        it.ry = info.y + head;
        x += it.w + COL_GAP;
      }
    }

    fr.minHeader = isRoot ? 0 : baseName(fr.path).length * 8.5 + 110;
    fr.w = Math.max(maxW + pad * 2, fr.minHeader);
    fr.h = contentH + head + pad;
    if (isRoot && !items.length) {
      fr.w = 0;
      fr.h = 0;
    }
  }

  function placeFrame(fr, ox, oy) {
    fr.x = ox;
    fr.y = oy;
    for (const c of fr.children) {
      if (c.kind === 'frame') {
        placeFrame(c, ox + c.rx, oy + c.ry);
      } else {
        c.x = ox + c.rx;
        c.y = oy + c.ry;
      }
    }
  }

  function routeEdges(aggList) {
    const slots = new Map();
    const addSlot = (node, side, agg, end) => {
      const key = node.id + '|' + side;
      if (!slots.has(key)) slots.set(key, []);
      slots.get(key).push({ agg: agg, end: end, node: node, side: side });
    };
    for (const agg of aggList) {
      const a = agg.a;
      const b = agg.b;
      let sides;
      if (b.y >= a.y + a.h + 12) sides = ['b', 't'];
      else if (b.y + b.h <= a.y - 12) sides = ['t', 'b'];
      else if (b.x >= a.x) sides = ['r', 'l'];
      else sides = ['l', 'r'];
      agg.sa = sides[0];
      agg.sb = sides[1];
      agg.offa = 0;
      agg.offb = 0;
      addSlot(a, sides[0], agg, 'a');
      addSlot(b, sides[1], agg, 'b');
    }
    for (const list of slots.values()) {
      const n = list.length;
      const first = list[0];
      const horizontal = first.side === 'l' || first.side === 'r';
      const len = horizontal ? first.node.h : first.node.w;
      list.sort((p, q) => {
        const po = p.end === 'a' ? p.agg.b : p.agg.a;
        const qo = q.end === 'a' ? q.agg.b : q.agg.a;
        return horizontal ? (po.y + po.h / 2) - (qo.y + qo.h / 2) : (po.x + po.w / 2) - (qo.x + qo.w / 2);
      });
      const step = n > 1 ? Math.min(12, (len - 24) / (n - 1)) : 0;
      list.forEach((s, i) => {
        const off = (i - (n - 1) / 2) * step;
        if (s.end === 'a') s.agg.offa = off;
        else s.agg.offb = off;
      });
    }
    for (const agg of aggList) {
      agg.p = anchor(agg.a, agg.sa, agg.offa);
      agg.q = anchor(agg.b, agg.sb, agg.offb);
      const dist = clamp(Math.hypot(agg.q.x - agg.p.x, agg.q.y - agg.p.y) * 0.4, 40, 160);
      const dirs = { r: [1, 0], l: [-1, 0], b: [0, 1], t: [0, -1] };
      const dp = dirs[agg.sa];
      const dq = dirs[agg.sb];
      const c1 = { x: agg.p.x + dp[0] * dist, y: agg.p.y + dp[1] * dist };
      const c2 = { x: agg.q.x + dq[0] * dist, y: agg.q.y + dq[1] * dist };
      agg.d = 'M' + agg.p.x + ' ' + agg.p.y + ' C' + c1.x + ' ' + c1.y + ' ' + c2.x + ' ' + c2.y + ' ' + agg.q.x + ' ' + agg.q.y;
      agg.mid = {
        x: (agg.p.x + 3 * c1.x + 3 * c2.x + agg.q.x) / 8,
        y: (agg.p.y + 3 * c1.y + 3 * c2.y + agg.q.y) / 8,
      };
    }
  }

  function anchor(n, side, off) {
    if (side === 'r') return { x: n.x + n.w, y: n.y + n.h / 2 + off };
    if (side === 'l') return { x: n.x, y: n.y + n.h / 2 + off };
    if (side === 'b') return { x: n.x + n.w / 2 + off, y: n.y + n.h };
    return { x: n.x + n.w / 2 + off, y: n.y };
  }

  function isHiddenFrame(path) {
    if (!model.forced.has(path)) return false;
    return !(state.scope.length > 1 && state.scope.includes(path));
  }

  function draw() {
    gFrames.innerHTML = '';
    gEdges.innerHTML = '';
    gNodes.innerHTML = '';
    nodeEls = new Map();
    frameEls = new Map();
    edgeRecords = [];

    if (!model.nodes.size) {
      const t = svgEl('text', { class: 'cmf-empty-text', x: 40, y: 60 }, gNodes);
      t.textContent = 'No files or connections in this scope.';
      return;
    }

    const frameList = Array.from(model.frames.values()).filter((f) => f.path !== '' && f.children.length && !isHiddenFrame(f.path));
    frameList.sort((a, b) => frameDepth(a) - frameDepth(b));
    for (const f of frameList) drawFrame(f);
    for (const agg of model.aggList) drawEdge(agg);
    for (const n of model.nodes.values()) drawNode(n);
  }

  function drawFrame(f) {
    const color = topColor(f.path.split('/')[0]);
    const toggleable = !model.forced.has(f.path);
    const g = svgEl('g', { class: 'cmf-frame' + (f.hasScope ? '' : ' ext'), style: '--c:' + color }, gFrames);
    const rect = svgEl('rect', { class: 'cmf-frame-rect', x: f.x, y: f.y, width: f.w, height: f.h, rx: 16 }, g);
    const head = svgEl('g', { class: 'cmf-frame-head' }, g);
    const hit = svgEl('rect', { class: 'cmf-frame-hit', x: f.x, y: f.y, width: f.w, height: FRAME_HEAD }, head);
    const title = svgEl('text', { class: 'cmf-frame-title', x: f.x + FRAME_PAD, y: f.y + 24 }, head);
    title.textContent = (toggleable ? '\u25BE ' : '') + baseName(f.path) + '/';
    svgEl('title', {}, head).textContent = f.path + '/' + (toggleable ? ' (double-click to collapse)' : '');
    frameEls.set(f.path, { rect: rect, hit: hit, title: title });

    head.addEventListener('pointerdown', (ev) => startDrag(ev, 'frame', f));
    if (toggleable) {
      head.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        collapseFolder(f.path);
      });
    }
  }

  function drawEdge(agg) {
    const g = svgEl('g', { class: 'cmf-edge-g' }, gEdges);
    const w = 1.2 + Math.min(3, Math.log2(agg.count + 1) * 0.6);
    const path = svgEl('path', { class: 'cmf-edge', d: agg.d, 'marker-end': 'url(#cmf-arrow)', style: 'stroke-width:' + w }, g);
    const names = Array.from(agg.names).slice(0, 8).join(', ');
    const tip = agg.a.path + ' \u2192 ' + agg.b.path + ' (' + agg.count + ' import' + (agg.count === 1 ? '' : 's') + ')' + (names ? ': ' + names : '');
    svgEl('title', {}, path).textContent = tip;
    const port = svgEl('circle', { class: 'cmf-port', cx: agg.p.x, cy: agg.p.y, r: 3.5 }, g);
    const rec = { g: g, path: path, port: port, agg: agg, pillRect: null, pillText: null, pw: 0 };
    if (agg.count > 1 && (agg.a.kind === 'folder' || agg.b.kind === 'folder')) {
      const label = String(agg.count);
      rec.pw = label.length * 7 + 14;
      rec.pillRect = svgEl('rect', { class: 'cmf-pill-rect', x: agg.mid.x - rec.pw / 2, y: agg.mid.y - 9, width: rec.pw, height: 18, rx: 9 }, g);
      rec.pillText = svgEl('text', { class: 'cmf-pill-text', x: agg.mid.x, y: agg.mid.y + 3.5 }, g);
      rec.pillText.textContent = label;
    }
    edgeRecords.push(rec);
  }

  function drawNode(n) {
    const g = svgEl('g', {
      class: 'cmf-node ' + n.kind + (n.inScope ? '' : ' ext'),
      transform: 'translate(' + n.x + ' ' + n.y + ')',
      style: '--c:' + n.color,
    }, gNodes);
    if (n.kind === 'folder') {
      svgEl('rect', { class: 'cmf-node-back', x: 6, y: -6, width: n.w, height: n.h, rx: 10 }, g);
    }
    svgEl('rect', { class: 'cmf-node-rect', x: 0, y: 0, width: n.w, height: n.h, rx: 10 }, g);
    svgEl('text', { class: 'cmf-node-name', x: n.w / 2, y: 22 }, g).textContent = n.shown + (n.kind === 'folder' ? '/' : '');

    let sub;
    if (n.kind === 'folder') {
      sub = n.files + ' files \u00B7 ' + n.out + ' out \u00B7 ' + n.inn + ' in';
    } else {
      const o = outAdj.get(n.path) ? outAdj.get(n.path).size : 0;
      const i = inAdj.get(n.path) ? inAdj.get(n.path).size : 0;
      sub = n.symbols + ' syms \u00B7 ' + o + ' out \u00B7 ' + i + ' in';
    }
    svgEl('text', { class: 'cmf-node-sub', x: n.w / 2, y: 38 }, g).textContent = sub;

    if (n.members.length || n.more) {
      svgEl('line', { class: 'cmf-node-divider', x1: 14, y1: CARD_HEAD - 4, x2: n.w - 14, y2: CARD_HEAD - 4 }, g);
    }
    n.members.forEach((m, idx) => {
      svgEl('text', { class: 'cmf-member', x: n.w / 2, y: CARD_HEAD + 14 + idx * MEMBER_STEP }, g).textContent = m;
    });
    if (n.more) {
      svgEl('text', { class: 'cmf-member more', x: n.w / 2, y: CARD_HEAD + 14 + n.members.length * MEMBER_STEP }, g).textContent = '+ ' + n.more + ' more';
    }
    svgEl('title', {}, g).textContent = n.path + (n.kind === 'folder' ? '/' : '');

    g.addEventListener('pointerdown', (ev) => startDrag(ev, 'node', n));
    g.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (suppressClick) return;
      selectNode(n.id);
    });
    if (n.kind === 'folder') {
      g.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        expandFolder(n.path);
      });
    }
    nodeEls.set(n.id, g);
  }

  function startDrag(ev, kind, target) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    suppressClick = false;
    drag = {
      kind: kind,
      target: target,
      sx: ev.clientX,
      sy: ev.clientY,
      lx: ev.clientX,
      ly: ev.clientY,
      moved: false,
    };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  }

  function onDragMove(ev) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) < 4) return;
      drag.moved = true;
      suppressClick = true;
    }
    const dx = (ev.clientX - drag.lx) / view.k;
    const dy = (ev.clientY - drag.ly) / view.k;
    drag.lx = ev.clientX;
    drag.ly = ev.clientY;

    if (drag.kind === 'node') {
      drag.target.x += dx;
      drag.target.y += dy;
      updateNodeDom(drag.target);
    } else {
      moveFrame(drag.target, dx, dy);
      for (const n of collectNodes(drag.target)) updateNodeDom(n);
    }
    refitFrames();
    updateEdgesDom();
  }

  function onDragEnd() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    drag = null;
  }

  function moveFrame(fr, dx, dy) {
    fr.x += dx;
    fr.y += dy;
    for (const c of fr.children) {
      if (c.kind === 'frame') {
        moveFrame(c, dx, dy);
      } else {
        c.x += dx;
        c.y += dy;
      }
    }
  }

  function collectNodes(fr) {
    const out = [];
    const walk = (f) => {
      for (const c of f.children) {
        if (c.kind === 'frame') walk(c);
        else out.push(c);
      }
    };
    walk(fr);
    return out;
  }

  function updateNodeDom(n) {
    const el = nodeEls.get(n.id);
    if (el) el.setAttribute('transform', 'translate(' + n.x + ' ' + n.y + ')');
  }

  function refitFrames() {
    for (const f of model.frameOrder) {
      if (!f.children.length) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const c of f.children) {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.w);
        maxY = Math.max(maxY, c.y + c.h);
      }
      const isRoot = f.path === '';
      const pad = isRoot ? 0 : FRAME_PAD;
      const head = isRoot ? 0 : FRAME_HEAD;
      f.x = minX - pad;
      f.y = minY - head;
      f.w = Math.max(maxX - minX + pad * 2, f.minHeader || 0);
      f.h = maxY - minY + head + pad;
      const el = frameEls.get(f.path);
      if (el) {
        el.rect.setAttribute('x', f.x);
        el.rect.setAttribute('y', f.y);
        el.rect.setAttribute('width', f.w);
        el.rect.setAttribute('height', f.h);
        el.hit.setAttribute('x', f.x);
        el.hit.setAttribute('y', f.y);
        el.hit.setAttribute('width', f.w);
        el.title.setAttribute('x', f.x + FRAME_PAD);
        el.title.setAttribute('y', f.y + 24);
      }
    }
  }

  function updateEdgesDom() {
    routeEdges(model.aggList);
    for (const rec of edgeRecords) {
      const agg = rec.agg;
      rec.path.setAttribute('d', agg.d);
      rec.port.setAttribute('cx', agg.p.x);
      rec.port.setAttribute('cy', agg.p.y);
      if (rec.pillRect) {
        rec.pillRect.setAttribute('x', agg.mid.x - rec.pw / 2);
        rec.pillRect.setAttribute('y', agg.mid.y - 9);
        rec.pillText.setAttribute('x', agg.mid.x);
        rec.pillText.setAttribute('y', agg.mid.y + 3.5);
      }
    }
  }

  function selectNode(id) {
    state.selected = id;
    applyHighlight();
    renderDetails();
  }

  function applyHighlight() {
    const sel = state.selected && model.nodes.has(state.selected) ? model.nodes.get(state.selected) : null;
    const neighbors = new Set();
    if (sel) {
      for (const agg of model.aggList) {
        if (agg.a === sel) neighbors.add(agg.b.id);
        if (agg.b === sel) neighbors.add(agg.a.id);
      }
    }
    nodeEls.forEach((el, id) => {
      el.classList.toggle('sel', !!sel && id === sel.id);
      el.classList.toggle('dim', !!sel && id !== sel.id && !neighbors.has(id));
    });
    for (const rec of edgeRecords) {
      const isOut = !!sel && rec.agg.a === sel;
      const isIn = !!sel && rec.agg.b === sel;
      rec.g.classList.toggle('out', isOut);
      rec.g.classList.toggle('in', isIn);
      rec.g.classList.toggle('dim', !!sel && !isOut && !isIn);
      let marker = 'url(#cmf-arrow)';
      if (isOut) marker = 'url(#cmf-arrow-out)';
      if (isIn) marker = 'url(#cmf-arrow-in)';
      rec.path.setAttribute('marker-end', marker);
    }
  }

  function renderDetails() {
    details.innerHTML = '';
    const n = state.selected ? model.nodes.get(state.selected) : null;
    if (!n) {
      details.style.display = 'none';
      return;
    }
    details.style.display = 'flex';

    const head = htmlEl('div', 'cmf-details-head');
    head.appendChild(htmlEl('div', 'cmf-details-title', n.label + (n.kind === 'folder' ? '/' : '')));
    const close = htmlEl('button', 'cmf-btn plain', '\u00D7');
    close.addEventListener('click', () => selectNode(null));
    head.appendChild(close);
    details.appendChild(head);

    const body = htmlEl('div', 'cmf-details-body');
    body.appendChild(htmlEl('div', 'cmf-path', n.path + (n.kind === 'folder' ? '/' : '')));

    const meta = htmlEl('div', 'cmf-meta');
    if (n.kind === 'file') {
      meta.appendChild(htmlEl('span', 'cmf-tag', n.symbols + ' symbols'));
      if (n.language) meta.appendChild(htmlEl('span', 'cmf-tag', n.language));
    } else {
      meta.appendChild(htmlEl('span', 'cmf-tag', n.files + ' files'));
    }
    if (!n.inScope) meta.appendChild(htmlEl('span', 'cmf-tag', 'outside scope'));
    body.appendChild(meta);

    const actions = htmlEl('div', 'cmf-actions');
    if (n.kind === 'folder') {
      const ex = htmlEl('button', 'cmf-btn', 'Expand');
      ex.addEventListener('click', () => expandFolder(n.path));
      actions.appendChild(ex);
      const sc = htmlEl('button', 'cmf-btn plain', 'Set as scope');
      sc.addEventListener('click', () => setScope([n.path]));
      actions.appendChild(sc);
    } else {
      const folder = dirName(n.path);
      if (folder) {
        const sc = htmlEl('button', 'cmf-btn plain', 'Scope: ' + baseName(folder) + '/');
        sc.addEventListener('click', () => setScope([folder]));
        actions.appendChild(sc);
      }
    }
    body.appendChild(actions);

    let outItems = [];
    let inItems = [];
    if (n.kind === 'file') {
      const o = outAdj.get(n.path);
      if (o) {
        outItems = Array.from(o.values()).map((e) => ({
          label: e.to,
          sub: e.names.length ? e.names.join(', ') : e.count + ' import' + (e.count === 1 ? '' : 's'),
          action: () => focusFile(e.to),
        }));
      }
      const i = inAdj.get(n.path);
      if (i) {
        inItems = Array.from(i.values()).map((e) => ({
          label: e.from,
          sub: e.names.length ? e.names.join(', ') : e.count + ' import' + (e.count === 1 ? '' : 's'),
          action: () => focusFile(e.from),
        }));
      }
    } else {
      outItems = model.aggList.filter((a) => a.a === n).map((a) => ({
        label: a.b.path + (a.b.kind === 'folder' ? '/' : ''),
        sub: a.count + ' import' + (a.count === 1 ? '' : 's'),
        action: () => {
          selectNode(a.b.id);
          centerOn(a.b);
        },
      }));
      inItems = model.aggList.filter((a) => a.b === n).map((a) => ({
        label: a.a.path + (a.a.kind === 'folder' ? '/' : ''),
        sub: a.count + ' import' + (a.count === 1 ? '' : 's'),
        action: () => {
          selectNode(a.a.id);
          centerOn(a.a);
        },
      }));
    }
    body.appendChild(buildSection('Imports \u2192', outItems));
    body.appendChild(buildSection('Used by \u2190', inItems));
    details.appendChild(body);
  }

  function buildSection(title, items) {
    const wrap = htmlEl('div', 'cmf-sec');
    wrap.appendChild(htmlEl('div', 'cmf-sec-title', title + ' (' + items.length + ')'));
    if (!items.length) {
      wrap.appendChild(htmlEl('div', 'cmf-empty-note', 'none'));
      return wrap;
    }
    for (const it of items.slice(0, 80)) {
      const row = htmlEl('button', 'cmf-link');
      row.appendChild(htmlEl('span', 'l', it.label));
      row.appendChild(htmlEl('span', 's', it.sub));
      row.addEventListener('click', it.action);
      wrap.appendChild(row);
    }
    if (items.length > 80) {
      wrap.appendChild(htmlEl('div', 'cmf-empty-note', '+ ' + (items.length - 80) + ' more'));
    }
    return wrap;
  }

  function focusFile(path) {
    let acc = '';
    const segs = path.split('/');
    for (let i = 0; i < segs.length - 1; i++) {
      acc = acc ? acc + '/' + segs[i] : segs[i];
      state.expanded.add(acc);
    }
    rebuild({ fit: false });
    const n = model.nodes.get('f:' + path);
    if (n) {
      selectNode(n.id);
      centerOn(n);
    }
  }

  function expandFolder(path) {
    state.expanded.add(path);
    state.selected = null;
    rebuild({ fit: false });
    const fr = model.frames.get(path);
    if (fr) focusBox(fr);
  }

  function collapseFolder(path) {
    state.expanded.delete(path);
    state.selected = null;
    rebuild({ fit: false });
    const n = model.nodes.get('d:' + path);
    if (n) centerOn(n);
  }

  function applyView() {
    viewport.setAttribute('transform', 'translate(' + view.x + ' ' + view.y + ') scale(' + view.k + ')');
  }

  function modelBounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of model.nodes.values()) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w + 6);
      maxY = Math.max(maxY, n.y + n.h);
    }
    for (const path of frameEls.keys()) {
      const f = model.frames.get(path);
      if (!f) continue;
      minX = Math.min(minX, f.x);
      minY = Math.min(minY, f.y);
      maxX = Math.max(maxX, f.x + f.w);
      maxY = Math.max(maxY, f.y + f.h);
    }
    if (minX === Infinity) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function focusBox(box) {
    const r = svg.getBoundingClientRect();
    const availW = r.width - FIT_SIDE * 2;
    const availH = r.height - FIT_TOP - FIT_BOTTOM;
    const w = Math.max(1, box.w);
    const h = Math.max(1, box.h);
    const k = clamp(Math.min(availW / w, availH / h), MIN_FIT_K, 1.4);
    view.k = k;
    view.x = FIT_SIDE + (availW - w * k) / 2 - box.x * k;
    view.y = k * h <= availH
      ? FIT_TOP + (availH - h * k) / 2 - box.y * k
      : FIT_TOP - box.y * k;
    applyView();
  }

  function fitView() {
    if (!model) return;
    const b = modelBounds();
    if (!b) {
      applyView();
      return;
    }
    const r = svg.getBoundingClientRect();
    const availW = r.width - FIT_SIDE * 2;
    const k = clamp(availW / Math.max(1, b.w), MIN_FIT_K, 1);
    view.k = k;
    view.x = FIT_SIDE + (availW - b.w * k) / 2 - b.x * k;
    view.y = FIT_TOP - b.y * k;
    applyView();
  }

  function centerOn(n) {
    const r = svg.getBoundingClientRect();
    view.x = r.width / 2 - (n.x + n.w / 2) * view.k;
    view.y = r.height / 2 - (n.y + n.h / 2) * view.k;
    applyView();
  }

  function zoomBy(factor) {
    const r = svg.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, factor);
  }

  function zoomAt(mx, my, factor) {
    const nk = clamp(view.k * factor, 0.03, 3);
    view.x = mx - (mx - view.x) * (nk / view.k);
    view.y = my - (my - view.y) * (nk / view.k);
    view.k = nk;
    applyView();
  }

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const r = svg.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
      return;
    }
    if (e.shiftKey) {
      view.x -= e.deltaY || e.deltaX;
    } else {
      view.x -= e.deltaX;
      view.y -= e.deltaY;
    }
    applyView();
  }, { passive: false });

  svg.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.cmf-node') || e.target.closest('.cmf-frame-head')) return;
    panning = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('panning');
  });

  svg.addEventListener('pointermove', (e) => {
    if (!panning) return;
    const dx = e.clientX - panning.x;
    const dy = e.clientY - panning.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) panning.moved = true;
    view.x = panning.vx + dx;
    view.y = panning.vy + dy;
    applyView();
  });

  svg.addEventListener('pointerup', () => {
    if (panning && !panning.moved && state.selected) selectNode(null);
    panning = null;
    svg.classList.remove('panning');
  });

  function rebuild(opts) {
    model = computeModel();
    if (state.selected && !model.nodes.has(state.selected)) state.selected = null;
    draw();
    applyHighlight();
    renderDetails();
    stats.textContent = model.nodes.size + ' nodes \u00B7 ' + model.aggList.length + ' links';
    if (opts && opts.fit) fitView();
    else applyView();
  }

  renderChips();
  applyScopeChange();

  return {
    destroy() {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragEnd);
      container.innerHTML = '';
    },
  };
}