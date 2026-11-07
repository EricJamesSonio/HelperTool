import { S } from '../shortcuts/state.js';
import { eventToString } from '../shortcuts/parser.js';

const ICON_MAP = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="10" r="2"/><circle cx="16" cy="4" r="2"/><circle cx="16" cy="16" r="2"/><path d="M6 10h4l4-5"/><path d="M10 10l4 5"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="12" height="14" rx="1.5"/><path d="M3 15V3a1 1 0 0 1 1-1h10"/></svg>';

let _overlay = null;
let _graphHandle = null;
let _fullData = null;
let _repoPath = null;
let _sidebarPrevZ = null;

export async function openCodebaseMap() {
  closeCodebaseMap();
  _overlay = document.createElement('div');
  _overlay.className = 'cmap-overlay';
  _overlay.innerHTML = `
    <div class="cmap-shell">
      <div class="cmap-header">
        <div class="cmap-title">${ICON_MAP}<span>Codebase Map</span></div>
        <div class="cmap-summary" id="cmapSummary"></div>
        <div class="cmap-actions">
          <button class="cmap-btn" id="cmapCopyMap">${ICON_COPY} Copy Map</button>
          <button class="cmap-btn" id="cmapCopyStructure">${ICON_COPY} Copy Structure</button>
          <button class="cmap-close" id="cmapClose" title="Close (Esc)">&#10005;</button>
        </div>
      </div>
      <div class="cmap-stage">
        <div class="cmap-graph" id="cmapGraph">
          <div class="cmap-loading">Building connection graph...</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(_overlay);

  _overlay.querySelector('#cmapClose').addEventListener('click', closeCodebaseMap);
  _overlay.querySelector('#cmapCopyMap').addEventListener('click', copyMap);
  _overlay.querySelector('#cmapCopyStructure').addEventListener('click', copyStructure);
  document.addEventListener('keydown', _escHandler);
  document.addEventListener('keydown', _toggleKeyHandler, true);

  await loadGraph();
}

function _escHandler(e) {
  if (e.key === 'Escape') closeCodebaseMap();
}

function _toggleKeyHandler(e) {
  if (e.repeat || !isOpen()) return;
  const bound = S.shortcuts && S.shortcuts.codebaseMap;
  if (!bound) return;
  const combo = eventToString(e);
  if (!combo || combo !== bound) return;
  const t = e.target;
  const tag = t && t.tagName ? t.tagName : '';
  const textTypes = ['text', 'search', 'email', 'url', 'password', 'number'];
  const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && textTypes.includes(t.type || 'text'));
  if (typing && combo.indexOf('+') === -1) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  closeCodebaseMap();
}

export function closeCodebaseMap() {
  if (_graphHandle && typeof _graphHandle.destroy === 'function') {
    try {
      _graphHandle.destroy();
    } catch (err) {
      console.warn('[CodebaseMap] destroy failed:', err);
    }
  }
  _graphHandle = null;
  _fullData = null;
  _repoPath = null;
  if (_overlay) {
    _overlay.remove();
    _overlay = null;
  }
  document.removeEventListener('keydown', _escHandler);
  document.removeEventListener('keydown', _toggleKeyHandler, true);
}

export function isOpen() {
  return !!_overlay && document.body.contains(_overlay);
}

async function getActiveRepoPath() {
  try {
    const result = await window.electronAPI.getActiveProject?.();
    return result?.repoPath || result || null;
  } catch (err) {
    return null;
  }
}

async function loadGraph() {
  const host = document.getElementById('cmapGraph');
  if (!host) return;

  try {
    _repoPath = await getActiveRepoPath();
    if (!_repoPath) {
      host.innerHTML = '<div class="cmap-error">No repository selected. Open a project first.</div>';
      return;
    }

    const graph = await window.electronAPI.codebaseMap.generate({ repoPath: _repoPath, graph: true });
    if (!graph || graph.error) {
      host.innerHTML = `<div class="cmap-error">${_esc(graph?.error || 'Failed to build graph')}</div>`;
      return;
    }
    if (!Array.isArray(graph.files)) {
      host.innerHTML = '<div class="cmap-error">Graph data missing. Fully restart the app so the updated main process loads.</div>';
      return;
    }
    if (!isOpen()) return;

    const summary = document.getElementById('cmapSummary');
    if (summary) {
      summary.textContent = graph.files.length + ' files \u00B7 ' + graph.edges.length + ' connections';
    }

    const { mountFlowGraph } = await import('./flowGraph.js');
    if (!isOpen()) return;
    host.innerHTML = '';
    _graphHandle = mountFlowGraph(host, graph);
  } catch (err) {
    host.innerHTML = `<div class="cmap-error">Failed to load graph: ${_esc(err.message)}</div>`;
  }
}

async function loadFullData() {
  if (_fullData) return _fullData;
  const repoPath = _repoPath || await getActiveRepoPath();
  if (!repoPath) return null;
  const data = await window.electronAPI.codebaseMap.generate({ repoPath: repoPath });
  if (!data || data.error) return null;
  _fullData = data;
  return data;
}

async function _copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (err) {
    console.warn('[CodebaseMap] clipboard API failed, using fallback');
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

async function copyMap() {
  showToast('Preparing map...');
  const data = await loadFullData();
  if (!data || !data.textMap) {
    showToast('Could not generate the map');
    return;
  }
  await _copyText(data.textMap);
  showToast('Map copied to clipboard!');
}

async function copyStructure() {
  showToast('Preparing structure...');
  const data = await loadFullData();
  if (!data || !data.modules) {
    showToast('Could not generate the structure');
    return;
  }

  const lines = [];
  for (const mod of data.modules) {
    lines.push(`${mod.name}/`);
    const childLines = _renderStructureLines(mod.tree || [], '');
    for (const cl of childLines) lines.push(cl);
    lines.push('');
  }

  await _copyText(lines.join('\n'));
  showToast('Structure copied to clipboard!');
}

function _renderStructureLines(nodes, prefix) {
  const lines = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
    const linePrefix = prefix + connector;
    const childPrefix = prefix + (isLast ? '    ' : '\u2502   ');

    if (node.type === 'directory') {
      lines.push(linePrefix + node.name + '/');
      const childLines = _renderStructureLines(node.children || [], childPrefix);
      for (const cl of childLines) lines.push(cl);
    } else {
      lines.push(linePrefix + node.name);
    }
  }
  return lines;
}

function showToast(msg) {
  const shell = _overlay?.querySelector('.cmap-shell');
  if (!shell) return;
  shell.querySelectorAll('.cmap-toast').forEach((t) => t.remove());
  const toast = document.createElement('div');
  toast.className = 'cmap-toast';
  toast.textContent = msg || 'Done';
  shell.appendChild(toast);
  setTimeout(() => toast.remove(), 1800);
}

function _esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}