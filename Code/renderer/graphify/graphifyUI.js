import { getState, setState, subscribe } from './graphifyState.js';
import {
  queryGraphify, checkHealth as clientCheckHealth, fetchInfo, fetchEndpoints,
  fetchGraphData, fetchGraphReport, fetchGraphStats, fetchGraphCommunities,
  searchGraphNodes, getGraphNeighborhood, getGraphShortestPath, getGraphAffected,
  exportSymbolIndex, generateAIPrompt, loadGraphFromStorage,
} from './graphifyClient.js';

let _root      = null;
let _unsub     = null;
let _debounce  = null;
let _healthTimer = null;

export function mount(container) {
  _root = container;
  _root.innerHTML = _template();
  _bindEvents();
  _unsub = subscribe(_render);
  _render(getState());
  // Verify server is still alive if state claims it's running
  _checkServerAlive();
}

function _startHealthTimer() {
  _stopHealthTimer();
  _healthTimer = setInterval(() => {
    const s = getState();
    if (s.serverStatus !== 'running') { _stopHealthTimer(); return; }
    _checkServerAlive();
  }, 15000);
}

function _stopHealthTimer() {
  if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }
}

export function unmount() {
  _stopHealthTimer();
  if (_unsub) { _unsub(); _unsub = null; }
  if (_debounce) clearTimeout(_debounce);
  _root = null;
}

function _bindEvents() {
  const startBtn = _root.querySelector('.gfy-start-btn');
  const stopBtn  = _root.querySelector('.gfy-stop-btn');
  const copyBtn  = _root.querySelector('.gfy-copy-btn');
  const indexBtn = _root.querySelector('.gfy-index-btn');
  const input    = _root.querySelector('.gfy-input');
  const searchBtn = _root.querySelector('.gfy-search-btn');
  const clearBtn  = _root.querySelector('.gfy-clear-btn');

  startBtn.addEventListener('click', _handleStart);
  stopBtn.addEventListener('click', _handleStop);
  copyBtn.addEventListener('click', _handleCopyUrl);
  if (indexBtn) indexBtn.addEventListener('click', _handleIndex);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _runQuery();
  });

  input.addEventListener('input', () => {
    clearTimeout(_debounce);
    const val = input.value.trim();
    if (val.length < 3) return;
    _debounce = setTimeout(_runQuery, 600);
  });

  searchBtn.addEventListener('click', _runQuery);

  clearBtn.addEventListener('click', () => {
    input.value = '';
    setState({ query: '', files: [], results: [], explanation: '', error: null });
    input.focus();
  });

  // Tab clicks
  _root.querySelectorAll('.gfy-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setState({ activeTab: btn.dataset.tab });
    });
  });

  // Graph tab buttons
  const graphOpenBtn = _root.querySelector('.gfy-graph-open-btn');
  if (graphOpenBtn) graphOpenBtn.addEventListener('click', _handleOpenGraph);

  const graphRefreshBtn = _root.querySelector('.gfy-graph-refresh-btn');
  if (graphRefreshBtn) graphRefreshBtn.addEventListener('click', _handleRefreshGraph);

  // Query tab - node search
  const nodeSearchInput = _root.querySelector('#gfyNodeSearchInput');
  if (nodeSearchInput) {
    nodeSearchInput.addEventListener('input', _debounceQuery(_handleNodeSearch, 300));
  }

  // Query tab - shortest path
  const pathBtn = _root.querySelector('#gfyPathBtn');
  if (pathBtn) pathBtn.addEventListener('click', _handlePathFind);

  // Query tab - explain
  const explainBtn = _root.querySelector('#gfyExplainBtn');
  if (explainBtn) explainBtn.addEventListener('click', _handleExplain);

  // Query tab - affected
  const affectedBtn = _root.querySelector('#gfyAffectedBtn');
  if (affectedBtn) affectedBtn.addEventListener('click', _handleAffected);

  // Report tab - refresh
  const reportRefreshBtn = _root.querySelector('.gfy-report-refresh-btn');
  if (reportRefreshBtn) reportRefreshBtn.addEventListener('click', _handleRefreshReport);

  // AI-enrichment buttons
  const exportBtn = _root.querySelector('.gfy-export-btn');
  if (exportBtn) exportBtn.addEventListener('click', _handleExport);

  const sendAiBtn = _root.querySelector('.gfy-send-ai-btn');
  if (sendAiBtn) sendAiBtn.addEventListener('click', _handleSendToAi);

  const loadAiGraphBtn = _root.querySelector('.gfy-load-ai-btn');
  if (loadAiGraphBtn) loadAiGraphBtn.addEventListener('click', _handleLoadAiGraph);
}

async function _handleStart() {
  setState({ serverStatus: 'starting', error: null });
  try {
    const result = await window.electronAPI.graphifyStart(window.__activeRepoPath || null);
    if (!result.ok) throw new Error(result.error || 'Failed to start server');
    setState({ port: result.port, serverStatus: 'running' });
    _startHealthTimer();
    const [info, epData] = await Promise.all([
      fetchInfo(result.port),
      fetchEndpoints(result.port),
    ]);
    if (epData && epData.endpoints) setState({ endpoints: epData.endpoints });
    if (info && !info.error) setState({ serverInfo: info });
    _handleRefreshGraph();
  } catch (err) {
    setState({ serverStatus: 'error', error: err.message });
  }
}

async function _handleStop() {
  _stopHealthTimer();
  try {
    await window.electronAPI.graphifyStop();
  } catch {}
  setState({
    serverStatus: 'stopped', serverInfo: null, endpoints: null,
    results: [], files: [], explanation: '', error: null,
    graphData: null, graphStats: null, graphReport: null, graphCommunities: null,
    graphLoading: false, graphError: null,
    nodeSearchResults: [], pathResult: null, explainResult: null, affectedResult: null,
  });
}

async function _handleIndex() {
  const repoPath = window.__activeRepoPath;
  if (!repoPath) {
    setState({ error: 'No repository selected. Select a repo first.' });
    return;
  }
  setState({ error: 'Indexing started\u2026 Please wait for it to complete.' });
  try {
    await window.electronAPI.symbolIndex.startIndexing(repoPath);
    setState({ error: 'Indexing complete! You can now start the server.' });
  } catch (err) {
    setState({ error: `Indexing failed: ${err.message}` });
  }
}

async function _checkServerAlive() {
  const s = getState();
  if (s.serverStatus !== 'running') { _stopHealthTimer(); return; }
  try {
    const ok = await clientCheckHealth(s.port);
    if (!ok) throw new Error('Health check failed');
    _startHealthTimer();
    // Refresh server info and endpoints in case they changed
    const [info, epData] = await Promise.all([
      fetchInfo(s.port).catch(() => null),
      fetchEndpoints(s.port).catch(() => null),
    ]);
    const patch = {};
    if (epData && epData.endpoints) patch.endpoints = epData.endpoints;
    if (info && !info.error) patch.serverInfo = info;
    if (Object.keys(patch).length) setState(patch);
  } catch {
    // Server is gone — reset state so user sees the start UI
    _stopHealthTimer();
    setState({
      serverStatus: 'stopped', serverInfo: null, endpoints: null,
      results: [], files: [], explanation: '', error: 'Server was disconnected. Click Start to restart.',
      graphData: null, graphStats: null, graphReport: null, graphCommunities: null,
      graphLoading: false, graphError: null,
    });
  }
}

async function _handleCopyUrl() {
  const { port } = getState();
  const url = `http://127.0.0.1:${port}/graph/relevant-code`;
  try {
    await navigator.clipboard.writeText(url);
    const btn = _root.querySelector('.gfy-copy-btn');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10 4 4 8-8"/></svg> Copied!';
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    }
  } catch {}
}

async function _runQuery() {
  if (!_root) return;
  const input = _root.querySelector('.gfy-input');
  const query = input.value.trim();
  if (!query) return;

  setState({ query, loading: true, error: null, files: [], results: [], explanation: '' });

  try {
    const { port, query: stateQuery } = getState();
    if (query !== stateQuery && stateQuery !== query) return;

    const repoPath = window.__activeRepoPath || null;
    const data     = await queryGraphify(query, repoPath, port);

    setState({
      loading:     false,
      files:       data.files       || [],
      results:     data.scores      || [],
      explanation: data.explanation || '',
    });
  } catch (err) {
    setState({ loading: false, error: err.message });
    _checkServerAlive();
  }
}

function _debounceQuery(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function _handleRefreshGraph() {
  const { port } = getState();
  setState({ graphLoading: true, graphError: null });
  try {
    const [data, stats, report, communities] = await Promise.all([
      fetchGraphData(port),
      fetchGraphStats(port),
      fetchGraphReport(port),
      fetchGraphCommunities(port),
    ]);
    setState({ graphData: data, graphStats: stats, graphReport: report, graphCommunities: communities, graphLoading: false });
  } catch (err) {
    setState({ graphLoading: false, graphError: err.message });
    _checkServerAlive();
  }
}

async function _handleOpenGraph() {
  const { port } = getState();
  const url = `http://127.0.0.1:${port}/graph`;
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url).catch(() => window.open(url, '_blank'));
  } else {
    window.open(url, '_blank');
  }
}

async function _handleNodeSearch() {
  const input = _root.querySelector('#gfyNodeSearchInput');
  if (!input) return;
  const query = input.value.trim();
  setState({ nodeSearchQuery: query });
  if (query.length < 2) {
    setState({ nodeSearchResults: [] });
    return;
  }
  const { port } = getState();
  const results = await searchGraphNodes(query, port, 20);
  setState({ nodeSearchResults: results });
}

async function _handlePathFind() {
  const from = (_root.querySelector('#gfyPathFrom')?.value || '').trim();
  const to = (_root.querySelector('#gfyPathTo')?.value || '').trim();
  if (!from || !to) return;
  const { port } = getState();
  setState({ pathFrom: from, pathTo: to, pathResult: null });
  const result = await getGraphShortestPath(from, to, port);
  setState({ pathResult: result });
}

async function _handleExplain() {
  const nodeId = (_root.querySelector('#gfyExplainInput')?.value || '').trim();
  const depth = parseInt(_root.querySelector('#gfyExplainDepth')?.value || '1', 10);
  if (!nodeId) return;
  const { port } = getState();
  setState({ explainNodeId: nodeId, explainDepth: depth, explainResult: null });
  const result = await getGraphNeighborhood(nodeId, port, depth);
  setState({ explainResult: result });
}

async function _handleAffected() {
  const nodeId = (_root.querySelector('#gfyAffectedInput')?.value || '').trim();
  const depth = parseInt(_root.querySelector('#gfyAffectedDepth')?.value || '1', 10);
  if (!nodeId) return;
  const { port } = getState();
  setState({ affectedNodeId: nodeId, affectedDepth: depth, affectedResult: null });
  const result = await getGraphAffected(nodeId, port, depth);
  setState({ affectedResult: result });
}

async function _handleRefreshReport() {
  const { port } = getState();
  setState({ graphLoading: true });
  try {
    const report = await fetchGraphReport(port);
    const stats = await fetchGraphStats(port);
    setState({ graphReport: report, graphStats: stats, graphLoading: false });
  } catch {
    setState({ graphLoading: false });
  }
}

async function _handleExport() {
  setState({ exportLoading: true, exportError: null, exportStatus: null });
  try {
    const { port } = getState();
    const result = await exportSymbolIndex(port);
    if (!result || !result.ok) {
      setState({ exportLoading: false, exportError: (result && result.error) || 'Export failed' });
      return;
    }
    setState({
      exportLoading: false,
      exportStatus: { symbolsPath: result.symbolsPath, promptPath: result.promptPath, promptText: result.promptText || '', stats: result.stats },
    });
  } catch (err) {
    setState({ exportLoading: false, exportError: err.message });
  }
}

async function _handleSendToAi() {
  const state_ = getState();
  let promptText = state_.exportStatus?.promptText;

  if (!promptText) {
    try {
      const { port } = state_;
      const res = await fetch(`http://127.0.0.1:${port}/export/prompt`, { method: 'POST' });
      const data = await res.json();
      if (data.ok && data.promptText) {
        promptText = data.promptText;
        setState({ exportStatus: { ...state_.exportStatus, promptText } });
      }
    } catch {}
  }

  if (!promptText) {
    setState({ exportError: 'No prompt generated yet. Run export first.' });
    return;
  }

  _showSendToAiDialog(promptText);
}

function _showSendToAiDialog(promptText) {
  const existing = document.querySelector('.gfy-sa-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'gfy-sa-overlay';
  overlay.innerHTML = `
    <div class="gfy-sa-dialog">
      <div class="gfy-sa-header">
        <span class="gfy-sa-title">Send Prompt to AI</span>
        <button class="gfy-sa-close" id="gfySaClose">&times;</button>
      </div>
      <div class="gfy-sa-body">
        <div class="gfy-sa-card" id="gfySaOpenFile">
          <div class="gfy-sa-card-icon">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h7l3 3v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M11 4v3h3"/></svg>
          </div>
          <div class="gfy-sa-card-text">
            <span class="gfy-sa-card-label">Open File</span>
            <span class="gfy-sa-card-desc">View the generated prompt in a modal and copy it manually.</span>
          </div>
        </div>
        <div class="gfy-sa-card" id="gfySaOpenCodeSwamp">
          <div class="gfy-sa-card-icon">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2z"/><path d="M10 8v4"/><path d="M8 10h4"/></svg>
          </div>
          <div class="gfy-sa-card-text">
            <span class="gfy-sa-card-label">Open CodeSwamp</span>
            <span class="gfy-sa-card-desc">Send the prompt directly to CodeSwamp with a single click.</span>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector('#gfySaClose').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('keydown', function saEscape(e) {
    if (e.key === 'Escape' && document.querySelector('.gfy-sa-overlay')) {
      overlay.remove();
      document.removeEventListener('keydown', saEscape);
    }
  });

  overlay.querySelector('#gfySaOpenFile').addEventListener('click', () => {
    overlay.remove();
    _showPromptViewer(promptText);
  });

  overlay.querySelector('#gfySaOpenCodeSwamp').addEventListener('click', () => {
    overlay.remove();
    _openCodeSwampWithPrompt(promptText);
  });
}

function _showPromptViewer(promptText) {
  const existing = document.querySelector('.gfy-prompt-viewer');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'gfy-prompt-viewer';
  overlay.innerHTML = `
    <div class="gfy-pv-header">
      <span class="gfy-pv-title">generate-graph.md</span>
      <div class="gfy-pv-actions">
        <button class="gfy-pv-copy-btn" id="gfyPvCopy">Copy</button>
        <button class="gfy-pv-close" id="gfyPvClose">&times;</button>
      </div>
    </div>
    <pre class="gfy-pv-content" id="gfyPvContent">${_esc(promptText)}</pre>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#gfyPvClose').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.addEventListener('keydown', function pvEscape(e) {
    if (e.key === 'Escape' && document.querySelector('.gfy-prompt-viewer')) {
      overlay.remove();
      document.removeEventListener('keydown', pvEscape);
    }
  });

  overlay.querySelector('#gfyPvCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      const btn = overlay.querySelector('#gfyPvCopy');
      btn.textContent = 'Copied';
      btn.classList.add('gfy-pv-copied');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('gfy-pv-copied');
      }, 2000);
    } catch {}
  });
}

async function _openCodeSwampWithPrompt(promptText) {
  const repoPath = window.__activeRepoPath;
  if (!repoPath) {
    setState({ exportError: 'No repository selected.' });
    return;
  }

  try {
    const btn = document.querySelector('[data-tool="opencode"]');
    if (btn) btn.click();

    let input = document.getElementById('ocInput');
    if (!input) {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        input = document.getElementById('ocInput');
        if (input) break;
      }
    }

    if (input) {
      input.value = promptText;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
      input.focus();
      input.selectionStart = input.selectionEnd = input.value.length;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch (err) {
    setState({ exportError: 'Failed to open CodeSwamp: ' + err.message });
  }
}

async function _handleLoadAiGraph() {
  setState({ aiGraphLoading: true, aiGraphError: null, aiGraphData: null, aiGraphReport: '' });
  try {
    const { port } = getState();
    const result = await loadGraphFromStorage(port);
    if (!result || !result.ok) {
      setState({ aiGraphLoading: false, aiGraphError: (result && result.error) || 'No AI graph found' });
      return;
    }
    setState({
      aiGraphLoading: false,
      aiGraphData: result.graph,
      aiGraphReport: result.report,
    });
  } catch (err) {
    setState({ aiGraphLoading: false, aiGraphError: err.message });
  }
}

function _render(state) {
  if (!_root) return;

  // ── Server status section ──
  const dotEl   = _root.querySelector('.gfy-status-dot');
  const labelEl = _root.querySelector('.gfy-status-label');
  const startBtn = _root.querySelector('.gfy-start-btn');
  const stopBtn  = _root.querySelector('.gfy-stop-btn');
  const copyBtn  = _root.querySelector('.gfy-copy-btn');
  const indexBtn = _root.querySelector('.gfy-index-btn');
  const infoLine = _root.querySelector('.gfy-info-line');
  const searchSection = _root.querySelector('.gfy-search-section');
  const endpointsSection = _root.querySelector('.gfy-endpoints-section');

  // ── Idle hero toggle (Stopped / Error = centered hero, else compact top bar) ──
  const panelEl = _root.querySelector('.gfy-panel');
  if (panelEl) {
    panelEl.classList.toggle('gfy-idle', state.serverStatus === 'stopped' || state.serverStatus === 'error');
  }

  if (dotEl) {
    dotEl.className = 'gfy-status-dot gfy-dot-' + state.serverStatus;
  }

  const statusLabels = {
    stopped:  'Stopped',
    starting: 'Starting\u2026',
    running:  'Running on :' + state.port,
    error:    'Error',
  };
  if (labelEl) labelEl.textContent = statusLabels[state.serverStatus] || 'Unknown';

  if (startBtn) startBtn.style.display  = state.serverStatus === 'stopped' || state.serverStatus === 'error' ? 'flex' : 'none';
  if (stopBtn)  stopBtn.style.display   = state.serverStatus === 'running' ? 'flex' : 'none';
  if (copyBtn)  copyBtn.style.display   = state.serverStatus === 'running' ? 'flex' : 'none';
  if (indexBtn) indexBtn.style.display = state.serverStatus === 'stopped' || state.serverStatus === 'error' ? 'flex' : 'none';

  // ── Info line (styled as a stat card, echoing the reference dashboard) ──
  if (infoLine) {
    if (state.serverStatus === 'running' && state.serverInfo) {
      const si = state.serverInfo;
      infoLine.innerHTML =
        `<span>Files indexed</span><span class="gfy-info-value">${si.totalFiles || 0}</span>` +
        `<span style="opacity:.4">\u00B7</span>` +
        `<span>Symbols</span><span class="gfy-info-value">${si.totalSymbols || 0}</span>`;
      infoLine.style.display = 'flex';
    } else if (state.serverStatus === 'running') {
      infoLine.textContent = 'Fetching stats\u2026';
      infoLine.style.display = 'flex';
    } else {
      infoLine.style.display = 'none';
    }
  }

  // ── Search section ──
  if (searchSection) {
    searchSection.style.display = state.serverStatus === 'running' ? 'flex' : 'none';
  }

  // ── Endpoints section ──
  if (endpointsSection) {
    const show = state.serverStatus === 'running' && state.endpoints;
    endpointsSection.style.display = show ? 'flex' : 'none';
    if (show) {
      const listEl = _root.querySelector('#gfyEndpointsList');
      if (listEl) {
        listEl.innerHTML = state.endpoints.map(ep => {
          const methodClass = 'gfy-ep-' + ep.method.toLowerCase();
          return `<div class="gfy-ep-row">
            <span class="gfy-ep-method ${methodClass}">${_esc(ep.method)}</span>
            <code class="gfy-ep-path">${_esc(ep.path)}</code>
            <span class="gfy-ep-desc">${_esc(ep.description)}</span>
          </div>`;
        }).join('');
      }
    }
  }

  // ── Tab bar ──
  const tabBar = _root.querySelector('.gfy-tab-bar');
  if (tabBar) {
    tabBar.style.display = state.serverStatus === 'running' ? 'flex' : 'none';
  }

  // ── Tab content visibility ──
  const tabContents = _root.querySelectorAll('.gfy-tab-content');
  for (const tc of tabContents) {
    tc.style.display = state.serverStatus === 'running' ? 'none' : 'none';
  }
  if (state.serverStatus === 'running') {
    const activeContent = _root.querySelector(`.gfy-${state.activeTab}-section`);
    if (activeContent) activeContent.style.display = 'flex';
  }

  // ── Tab active class ──
  const tabBtns = _root.querySelectorAll('.gfy-tab');
  for (const tb of tabBtns) {
    tb.classList.toggle('gfy-tab-active', tb.dataset.tab === state.activeTab);
  }

  // ── Graph tab ──
  if (state.activeTab === 'graph' && state.serverStatus === 'running') {
    const graphSpinner = _root.querySelector('.gfy-graph-spinner');
    const placeholder = _root.querySelector('.gfy-graph-placeholder');
    const iframeWrap = _root.querySelector('.gfy-graph-iframe-wrap');
    const statsBar = _root.querySelector('.gfy-graph-stats-bar');

    if (graphSpinner) graphSpinner.style.display = state.graphLoading ? 'flex' : 'none';
    if (placeholder) placeholder.style.display = (!state.graphLoading && !state.graphData) ? 'flex' : 'none';

    if (iframeWrap && state.graphData && !state.graphLoading) {
      let iframe = iframeWrap.querySelector('.gfy-graph-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.className = 'gfy-graph-iframe';
        iframe.sandbox = 'allow-scripts allow-same-origin';
        iframeWrap.innerHTML = '';
        iframeWrap.appendChild(iframe);
      }
      const currentPort = (iframe.src.match(/:(\d+)\//) || [])[1];
      if (currentPort !== String(state.port)) {
        iframe.src = `http://127.0.0.1:${state.port}/graph`;
      }
    }

    if (statsBar && state.graphStats) {
      const s = state.graphStats;
      statsBar.innerHTML = `<span><strong>${s.totalNodes}</strong> nodes</span><span class="gfy-dot-sep">\u00B7</span><span><strong>${s.totalEdges}</strong> edges</span><span class="gfy-dot-sep">\u00B7</span><span><strong>${s.communityCount}</strong> communities</span><span class="gfy-dot-sep">\u00B7</span><span><strong>${s.totalFiles}</strong> files</span><span class="gfy-dot-sep">\u00B7</span><span><strong>${s.totalSymbols}</strong> symbols</span>`;
      statsBar.style.display = 'flex';
    }
  }

  // ── Report tab ──
  if (state.activeTab === 'report' && state.graphReport) {
    const reportContent = _root.querySelector('.gfy-report-content');
    if (reportContent) {
      const r = state.graphReport;
      let html = '';

      if (r.stats) {
        html += `<div class="gfy-report-card"><div class="gfy-report-card-title">Graph Overview</div><div class="gfy-report-card-body">`;
        html += `<div class="gfy-report-stat"><span>Total Nodes</span><strong>${r.stats.totalNodes}</strong></div>`;
        html += `<div class="gfy-report-stat"><span>Total Edges</span><strong>${r.stats.totalEdges}</strong></div>`;
        html += `<div class="gfy-report-stat"><span>Files</span><strong>${r.stats.totalFiles}</strong></div>`;
        html += `<div class="gfy-report-stat"><span>Symbols</span><strong>${r.stats.totalSymbols}</strong></div>`;
        html += `<div class="gfy-report-stat"><span>Docs</span><strong>${r.stats.totalDocs || 0}</strong></div>`;
        html += `<div class="gfy-report-stat"><span>Communities</span><strong>${r.stats.communityCount}</strong></div>`;
        html += `</div></div>`;
      }

      if (r.godNodes && r.godNodes.length > 0) {
        html += `<div class="gfy-report-card"><div class="gfy-report-card-title">\uD83D\uDC51 God Nodes (highest degree)</div><div class="gfy-report-card-body">`;
        for (const gn of r.godNodes) {
          html += `<div class="gfy-report-item"><span class="gfy-report-item-label">${_esc(gn.label)}</span><span class="gfy-report-item-type">${_esc(gn.type)}</span><span class="gfy-report-item-meta">deg: ${gn.degree} \u00B7 ${_esc(gn.filePath || '')}</span></div>`;
        }
        html += `</div></div>`;
      }

      if (r.surprisingEdges && r.surprisingEdges.length > 0) {
        html += `<div class="gfy-report-card"><div class="gfy-report-card-title">\uD83D\uDCA5 Surprising Edges (cross-community)</div><div class="gfy-report-card-body">`;
        for (const se of r.surprisingEdges) {
          html += `<div class="gfy-report-item"><span class="gfy-report-item-label">${_esc(se.sourceLabel)}</span><span class="gfy-report-item-arrow">\u2192</span><span class="gfy-report-item-label">${_esc(se.targetLabel)}</span><span class="gfy-report-item-meta">${_esc(se.type)}</span></div>`;
        }
        html += `</div></div>`;
      }

      if (r.communities && r.communities.length > 0) {
        html += `<div class="gfy-report-card"><div class="gfy-report-card-title">\uD83C\uDFED Communities</div><div class="gfy-report-card-body">`;
        for (const c of r.communities) {
          html += `<div class="gfy-community-row"><span class="gfy-community-color" style="background:${c.color}"></span><span>Community ${c.id + 1}</span><span class="gfy-report-item-meta">${c.nodeCount} nodes</span></div>`;
        }
        html += `</div></div>`;
      }

      reportContent.innerHTML = html || '<div class="gfy-empty">No report data available.</div>';
    }
  }

  // ── AI Graph tab ──
  if (state.activeTab === 'ai' && state.serverStatus === 'running') {
    const spinner = _root.querySelector('.gfy-ai-spinner');
    const error = _root.querySelector('.gfy-ai-error');
    const results = _root.querySelector('.gfy-ai-results');
    const exportStatus = _root.querySelector('.gfy-export-status');

    if (spinner) spinner.style.display = state.aiGraphLoading || state.exportLoading ? 'flex' : 'none';
    if (error) {
      error.textContent = state.aiGraphError || state.exportError || '';
      error.style.display = (state.aiGraphError || state.exportError) ? 'block' : 'none';
    }
    if (results) results.style.display = state.aiGraphData ? 'block' : 'none';

    if (exportStatus) {
      if (state.exportStatus) {
        const s = state.exportStatus;
        exportStatus.innerHTML = `<span class="gfy-export-ok">\u2713 Exported:</span> ${s.stats.files} files, ${s.stats.symbols} symbols, ${s.stats.imports} imports`;
        exportStatus.style.display = 'block';
      } else {
        exportStatus.style.display = 'none';
      }
    }

    if (state.aiGraphData) {
      const g = state.aiGraphData;

      // Features
      const featuresEl = _root.querySelector('#gfyAiFeatures');
      if (featuresEl && g.features) {
        const featureNames = Object.keys(g.features);
        featuresEl.innerHTML = '<div class="gfy-ai-section-title">Features (' + featureNames.length + ')</div>' +
          featureNames.map(fname => {
            const feat = g.features[fname];
            return '<div class="gfy-ai-feature-card">' +
              '<div class="gfy-ai-feature-name">' + _esc(fname) + '</div>' +
              '<div class="gfy-ai-feature-summary">' + _esc(feat.summary || '') + '</div>' +
              '<div class="gfy-ai-feature-meta">' + (feat.files ? feat.files.length + ' files' : '') + '</div>' +
              '</div>';
          }).join('');
      }

      // Concepts
      const conceptsEl = _root.querySelector('#gfyAiConcepts');
      if (conceptsEl && g.concepts) {
        const conceptNames = Object.keys(g.concepts);
        conceptsEl.innerHTML = '<div class="gfy-ai-section-title">Key Concepts (' + conceptNames.length + ')</div>' +
          conceptNames.map(cname => {
            const c = g.concepts[cname];
            return '<div class="gfy-ai-concept-item">' +
              '<span class="gfy-ai-concept-name">' + _esc(cname) + '</span>' +
              '<span class="gfy-ai-concept-desc">' + _esc(c.summary || '') + '</span>' +
              '</div>';
          }).join('');
      }

      // Report markdown
      const reportEl = _root.querySelector('#gfyAiReport');
      if (reportEl && state.aiGraphReport) {
        reportEl.innerHTML = '<div class="gfy-ai-section-title">Report</div>' +
          '<div class="gfy-ai-report-body">' + _esc(state.aiGraphReport).replace(/\n/g, '<br>') + '</div>';
      }
    }
  }

  // ── Query tab results ──
  if (state.activeTab === 'query') {
    const pathResult = _root.querySelector('#gfyPathResult');
    if (pathResult && state.pathResult) {
      if (state.pathResult.path) {
        pathResult.innerHTML = '<div class="gfy-query-result-label">Path found:</div>' +
          state.pathResult.path.map((n, i) =>
            `<div class="gfy-query-path-node">${i + 1}. <strong>${_esc(n.label)}</strong> <span class="gfy-query-node-type">${_esc(n.type)}</span></div>`
          ).join('');
      } else {
        pathResult.innerHTML = '<div class="gfy-query-result-label">No path found.</div>';
      }
    }

    const explainResult = _root.querySelector('#gfyExplainResult');
    if (explainResult && state.explainResult) {
      if (state.explainResult.nodes) {
        explainResult.innerHTML = `<div class="gfy-query-result-label">Neighborhood (${state.explainResult.nodes.length} nodes, ${state.explainResult.edges.length} edges):</div>` +
          state.explainResult.nodes.map(n =>
            `<div class="gfy-query-path-node"><strong>${_esc(n.label)}</strong> <span class="gfy-query-node-type">${_esc(n.type)}</span>${n.filePath ? ' <span class="gfy-query-node-file">' + _esc(n.filePath) + '</span>' : ''}</div>`
          ).join('');
      } else {
        explainResult.innerHTML = '<div class="gfy-query-result-label">Node not found.</div>';
      }
    }

    const affectedResult = _root.querySelector('#gfyAffectedResult');
    if (affectedResult && state.affectedResult) {
      if (state.affectedResult.nodes) {
        affectedResult.innerHTML = `<div class="gfy-query-result-label">Affected nodes (${state.affectedResult.nodes.length} nodes, ${state.affectedResult.edges.length} edges):</div>` +
          state.affectedResult.nodes.map(n =>
            `<div class="gfy-query-path-node"><strong>${_esc(n.label)}</strong> <span class="gfy-query-node-type">${_esc(n.type)}</span>${n.filePath ? ' <span class="gfy-query-node-file">' + _esc(n.filePath) + '</span>' : ''}</div>`
          ).join('');
      } else {
        affectedResult.innerHTML = '<div class="gfy-query-result-label">Node not found.</div>';
      }
    }

    const nodeSearchResults = _root.querySelector('#gfyNodeSearchResults');
    if (nodeSearchResults && state.nodeSearchResults) {
      if (state.nodeSearchResults.length > 0) {
        nodeSearchResults.innerHTML = state.nodeSearchResults.map(n =>
          `<div class="gfy-query-path-node gfy-query-search-hit" data-node-id="${_esc(n.id)}"><strong>${_esc(n.label)}</strong> <span class="gfy-query-node-type">${_esc(n.type)}</span><span class="gfy-query-node-file">${_esc(n.filePath || '')}</span></div>`
        ).join('');
      } else if (state.nodeSearchQuery && state.nodeSearchQuery.length >= 2) {
        nodeSearchResults.innerHTML = '<div class="gfy-query-result-label" style="padding:8px">No matching nodes found.</div>';
      }
    }
  }

  // ── Graph loading/error overlay for query tab ──
  const graphError = _root.querySelector('.gfy-graph-error');
  if (graphError) {
    graphError.textContent = state.graphError || '';
    graphError.style.display = state.graphError ? 'block' : 'none';
  }

  // ── Error ──
  const errEl = _root.querySelector('.gfy-error');
  if (errEl) {
    errEl.textContent = state.error || '';
    errEl.style.display = state.error ? 'block' : 'none';
  }

  // ── Loading spinner ──
  const spinner = _root.querySelector('.gfy-spinner');
  if (spinner) spinner.style.display = state.loading ? 'flex' : 'none';

  // ── Explanation ──
  const expEl = _root.querySelector('.gfy-explanation');
  if (expEl) {
    expEl.textContent = state.explanation || '';
    expEl.style.display = state.explanation ? 'block' : 'none';
  }

  // ── Results list ──
  const listEl = _root.querySelector('.gfy-results');
  if (!listEl) return;

  if (!state.loading && state.files.length === 0 && state.query) {
    listEl.innerHTML = `<div class="gfy-empty"><span class="gfy-empty-icon">\uD83D\uDD0D</span> No relevant files found.</div>`;
    return;
  }

  if (state.results.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  const maxScore = state.results[0]?.score || 1;

  listEl.innerHTML = state.results.map(({ file, score }, idx) => {
    const parts    = file.split('/');
    const basename = parts.pop();
    const dir      = parts.join('/');
    const pct      = Math.round((score / maxScore) * 100);
    const rank     = idx + 1;

    return `
      <div class="gfy-result-item" data-path="${_esc(file)}" title="${_esc(file)}">
        <span class="gfy-rank">${rank}</span>
        <div class="gfy-file-info">
          <span class="gfy-filename">${_esc(basename)}</span>
          <span class="gfy-filepath">${_esc(dir || '(root)')}</span>
        </div>
        <div class="gfy-score-wrap">
          <div class="gfy-score-bar" title="Relevance: ${pct}%">
            <div class="gfy-score-fill" style="width:${pct}%"></div>
          </div>
          <span class="gfy-score-label">${pct}%</span>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.gfy-result-item').forEach(el => {
    el.addEventListener('click', () => {
      const filePath = el.dataset.path;
      if (window.electronAPI?.openFile) {
        window.electronAPI.openFile(filePath).catch(() => {});
      }
    });
  });
}

function _template() {
  return `
    <div class="gfy-panel">
      <div class="gfy-bg-glow"></div>

      <div class="gfy-header">
        <div class="gfy-header-left">
          <span class="gfy-title">Graphify</span>
          <span class="gfy-subtitle">Code Intelligence</span>
        </div>
        <div class="gfy-header-badge">AI</div>
      </div>

      <div class="gfy-hero-wrap">
        <div class="gfy-idle-wordmark" aria-hidden="true">
          <div class="gfy-idle-logo">Graphify</div>
          <div class="gfy-idle-tagline">AI-powered code intelligence for your repository</div>
        </div>

        <div class="gfy-server-section">
          <div class="gfy-status-row">
            <span class="gfy-status-dot gfy-dot-stopped"></span>
            <span class="gfy-status-label">Stopped</span>
          </div>

          <div class="gfy-actions-row">
            <button class="gfy-start-btn">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l12 7-12 7V3z"/></svg>
              Start Server
            </button>
            <button class="gfy-stop-btn" style="display:none">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="5" width="10" height="10" rx="1.5"/></svg>
              Stop Server
            </button>
            <button class="gfy-copy-btn" style="display:none" title="Copy API URL to clipboard">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="11" height="13" rx="1.5"/><path d="M8 2h7a1 1 0 0 1 1 1v11"/></svg>
              Copy URL
            </button>
            <button class="gfy-index-btn">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2"/></svg>
              Index Codebase
            </button>
          </div>

          <div class="gfy-info-line" style="display:none"></div>
        </div>
      </div>

      <div class="gfy-body">
        <div class="gfy-left-column">
          <div class="gfy-endpoints-section" style="display:none">
            <div class="gfy-endpoints-label">Available Endpoints</div>
            <div class="gfy-endpoints-list" id="gfyEndpointsList"></div>
          </div>
        </div>

        <div class="gfy-right-column gfy-tab-column">
          <!-- Tab Bar -->
          <div class="gfy-tab-bar" style="display:none">
            <button class="gfy-tab gfy-tab-active" data-tab="search">Search</button>
            <button class="gfy-tab" data-tab="graph">Graph</button>
            <button class="gfy-tab" data-tab="query">Query</button>
            <button class="gfy-tab" data-tab="report">Report</button>
            <button class="gfy-tab" data-tab="ai">AI Graph</button>
          </div>

          <!-- Search Tab -->
          <div class="gfy-search-section gfy-tab-content" style="display:none">
        <div class="gfy-search-bar">
          <svg class="gfy-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            class="gfy-input"
            type="text"
            placeholder='e.g. "how does auth work" or "where is payment validated"'
            autocomplete="off"
            spellcheck="false"
          />
          <button class="gfy-search-btn" title="Search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
          <button class="gfy-clear-btn" title="Clear">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>
          </button>
        </div>

        <div class="gfy-spinner" style="display:none">
          <div class="gfy-spinner-ring"></div>
          <span>Analyzing code graph\u2026</span>
        </div>

        <div class="gfy-error" style="display:none"></div>
        <div class="gfy-explanation" style="display:none"></div>

        <div class="gfy-results"></div>

        <div class="gfy-footer">
          <span class="gfy-footer-hint">Ask a question \u2014 get the relevant files</span>
        </div>
      </div>

      <!-- Graph Tab -->
      <div class="gfy-graph-section gfy-tab-content" style="display:none">
        <div class="gfy-graph-toolbar">
          <button class="gfy-graph-open-btn" title="Open in browser">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/><path d="M15 3v3"/><path d="M15 3h-3"/><path d="m15 3-3 3"/><circle cx="16" cy="16" r="3"/></svg>
            Open in Browser
          </button>
          <button class="gfy-graph-refresh-btn" title="Refresh graph data">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10a7 7 0 0 1-14 0"/><path d="M17 10V4"/><path d="M17 4h-6"/></svg>
            Refresh
          </button>
        </div>
        <div class="gfy-graph-stats-bar"></div>
        <div class="gfy-graph-iframe-wrap">
          <div class="gfy-graph-placeholder">
            <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="20" cy="20" r="16"/><circle cx="20" cy="8" r="3"/><circle cx="32" cy="20" r="3"/><circle cx="20" cy="32" r="3"/><circle cx="8" cy="20" r="3"/><line x1="20" y1="11" x2="29" y2="17"/><line x1="29" y1="20" x2="23" y2="29"/><line x1="17" y1="29" x2="11" y2="23"/><line x1="11" y1="17" x2="17" y2="11"/></svg>
            <span>Load the graph visualization to explore your codebase</span>
          </div>
        </div>
        <div class="gfy-graph-spinner" style="display:none">
          <div class="gfy-spinner-ring"></div>
          <span>Building knowledge graph\u2026</span>
        </div>
        <div class="gfy-graph-error" style="display:none"></div>
      </div>

      <!-- Query Tab -->
      <div class="gfy-query-section gfy-tab-content" style="display:none">
        <div class="gfy-query-tools">
          <!-- Node Search -->
          <div class="gfy-query-tool">
            <div class="gfy-query-tool-header">Search Nodes</div>
            <div class="gfy-query-tool-body">
              <input class="gfy-query-input" id="gfyNodeSearchInput" type="text" placeholder="Search by name or path..." autocomplete="off" spellcheck="false" />
              <div class="gfy-query-node-results" id="gfyNodeSearchResults"></div>
            </div>
          </div>

          <!-- Shortest Path -->
          <div class="gfy-query-tool">
            <div class="gfy-query-tool-header">Shortest Path</div>
            <div class="gfy-query-tool-body gfy-query-path-body">
              <input class="gfy-query-input" id="gfyPathFrom" type="text" placeholder="From node ID..." autocomplete="off" spellcheck="false" />
              <input class="gfy-query-input" id="gfyPathTo" type="text" placeholder="To node ID..." autocomplete="off" spellcheck="false" />
              <button class="gfy-query-btn" id="gfyPathBtn">Find Path</button>
              <div class="gfy-query-result" id="gfyPathResult"></div>
            </div>
          </div>

          <!-- Explain / Neighborhood -->
          <div class="gfy-query-tool">
            <div class="gfy-query-tool-header">Explain Node</div>
            <div class="gfy-query-tool-body gfy-query-explain-body">
              <input class="gfy-query-input" id="gfyExplainInput" type="text" placeholder="Node ID..." autocomplete="off" spellcheck="false" />
              <div class="gfy-query-depth-row">
                <label>Depth:</label>
                <select class="gfy-query-select" id="gfyExplainDepth">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
              <button class="gfy-query-btn" id="gfyExplainBtn">Explain</button>
              <div class="gfy-query-result" id="gfyExplainResult"></div>
            </div>
          </div>

          <!-- Affected -->
          <div class="gfy-query-tool">
            <div class="gfy-query-tool-header">Affected By</div>
            <div class="gfy-query-tool-body gfy-query-affected-body">
              <input class="gfy-query-input" id="gfyAffectedInput" type="text" placeholder="Node ID..." autocomplete="off" spellcheck="false" />
              <div class="gfy-query-depth-row">
                <label>Depth:</label>
                <select class="gfy-query-select" id="gfyAffectedDepth">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
              <button class="gfy-query-btn" id="gfyAffectedBtn">Find Affected</button>
              <div class="gfy-query-result" id="gfyAffectedResult"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Report Tab -->
      <div class="gfy-report-section gfy-tab-content" style="display:none">
        <div class="gfy-report-toolbar">
          <button class="gfy-report-refresh-btn">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10a7 7 0 0 1-14 0"/><path d="M17 10V4"/><path d="M17 4h-6"/></svg>
            Refresh Report
          </button>
        </div>
        <div class="gfy-report-content"></div>
      </div>

      <!-- AI Graph Tab -->
      <div class="gfy-ai-section gfy-tab-content" style="display:none">
        <div class="gfy-ai-intro">
          <div class="gfy-ai-intro-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M6 15h12"/><path d="M8 15v4"/><path d="M16 15v4"/><path d="M4 19h16"/></svg>
          </div>
          <div class="gfy-ai-intro-text">
            <strong>AI-Powered Semantic Graph</strong>
            <span>Export your symbol index, send the prompt to your AI, then load the enriched graph.</span>
          </div>
        </div>

        <div class="gfy-ai-steps">
          <div class="gfy-ai-step">
            <div class="gfy-ai-step-num">1</div>
            <div class="gfy-ai-step-body">
              <div class="gfy-ai-step-title">Export Symbol Index</div>
              <div class="gfy-ai-step-desc">Dumps all indexed files, symbols, and imports into a JSON file.</div>
              <button class="gfy-export-btn">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10"/><path d="m6 9 4 4 4-4"/><path d="M3 16v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"/></svg>
                Export Symbols &amp; Generate Prompt
              </button>
              <div class="gfy-export-status" style="display:none"></div>
            </div>
          </div>

          <div class="gfy-ai-step">
            <div class="gfy-ai-step-num">2</div>
            <div class="gfy-ai-step-body">
              <div class="gfy-ai-step-title">Send to AI</div>
              <div class="gfy-ai-step-desc">Send the generated prompt to CodeSwamp for AI labeling.</div>
              <button class="gfy-send-ai-btn">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2z"/><path d="M10 8v4"/><path d="M8 10h4"/></svg>
                Send Prompt to CodeSwamp
              </button>
            </div>
          </div>

          <div class="gfy-ai-step">
            <div class="gfy-ai-step-num">3</div>
            <div class="gfy-ai-step-body">
              <div class="gfy-ai-step-title">Load AI-Generated Graph</div>
              <div class="gfy-ai-step-desc">Load the AI-generated <code>graphify/graphify-storage/graph.json</code> and <code>graph.md</code> into the viewer.</div>
              <button class="gfy-load-ai-btn">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10"/><path d="m6 9 4 4 4-4"/><path d="M3 16v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"/></svg>
                Load AI Graph
              </button>
            </div>
          </div>
        </div>

        <div class="gfy-ai-spinner" style="display:none">
          <div class="gfy-spinner-ring"></div>
          <span>Loading\u2026</span>
        </div>

        <div class="gfy-ai-error" style="display:none"></div>

        <div class="gfy-ai-results" style="display:none">
          <div class="gfy-ai-results-header">AI-Generated Knowledge Graph</div>
          <div class="gfy-ai-features" id="gfyAiFeatures"></div>
          <div class="gfy-ai-concepts" id="gfyAiConcepts"></div>
          <div class="gfy-ai-report" id="gfyAiReport"></div>
        </div>
        </div>
        </div>
      </div>
    </div>
  `;
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}