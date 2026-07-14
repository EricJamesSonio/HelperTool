import { getState, setState, subscribe } from './graphifyState.js';
import {
  queryGraphify, checkHealth as clientCheckHealth, fetchInfo, fetchEndpoints,
  fetchGraphData, fetchGraphReport, testEndpoint,
  searchGraphNodes, getGraphNeighborhood, getGraphShortestPath, getGraphAffected,
} from './graphifyClient.js';

let _root          = null;
let _unsub         = null;
let _debounce      = null;
let _healthTimer   = null;
let _watchdogTimer = null;
let _mounted       = false;
let _initialized   = false;
let _startCancelRequested = false;
let _loadChangesStatePending = false;

// ── DOM cache (populated once in mount) ──
const _els = {};

// ── RAF-throttled render scheduler ──
let _rafPending = false;
function _scheduleRender() {
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    _render(getState());
  });
}

function _cacheEl(key, sel, ctx) {
  _els[key] = (ctx || _root).querySelector(sel);
}

function _cacheEls(key, sel, ctx) {
  const p = ctx || _root;
  _els[key] = p ? Array.from(p.querySelectorAll(sel)) : [];
}

function _populateDomCache() {
  _cacheEl('panel',            '.gfy-panel');
  _cacheEl('statusDot',        '.gfy-status-dot');
  _cacheEl('statusLabel',      '.gfy-status-label');
  _cacheEl('startBtn',         '.gfy-start-btn');
  _cacheEl('stopBtn',          '.gfy-stop-btn');
  _cacheEl('cancelBtn',        '.gfy-cancel-btn');
  _cacheEl('copyBtn',          '.gfy-copy-btn');
  _cacheEl('cheatsheetBtn',    '.gfy-cheatsheet-btn');
  _cacheEl('indexBtn',         '.gfy-index-btn');
  _cacheEl('infoLine',         '.gfy-info-line');
  _cacheEl('endpointsSection', '.gfy-endpoints-section');
  _cacheEl('endpointsList',    '#gfyEndpointsList');
  _cacheEl('tabBar',           '.gfy-tab-bar');
  _cacheEls('tabContents',     '.gfy-tab-content');
  _cacheEls('tabBtns',         '.gfy-tab');
  _cacheEl('wizard',           '.gfy-wizard');
  _cacheEl('spinner',          '.gfy-spinner');
  _cacheEl('errEl',            '.gfy-error');
  _cacheEl('expEl',            '.gfy-explanation');
  _cacheEl('listEl',           '.gfy-results');
  _cacheEl('graphSpinner',     '.gfy-graph-spinner');
  _cacheEl('graphPlaceholder', '.gfy-graph-placeholder');
  _cacheEl('graphIframeWrap',  '.gfy-graph-iframe-wrap');
  _cacheEl('graphStatsBar',    '.gfy-graph-stats-bar');
  _cacheEl('graphError',       '.gfy-graph-error');
  _cacheEl('reportContent',    '.gfy-report-content');
  _cacheEl('reportSpinner',    '.gfy-report-spinner');
  _cacheEl('reportError',      '.gfy-report-error');

  // AI tab
  _cacheEl('aiSpinner',       '.gfy-ai-spinner');
  _cacheEl('aiError',         '.gfy-ai-error');
  _cacheEl('aiExportStatus',  '.gfy-export-status');
  _cacheEl('aiStatusSymbols', '#gfyAiStatusSymbols');
  _cacheEl('aiGraphStatusIcon', '#gfyAiGraphStatusIcon');
  _cacheEl('aiStatusGraph',   '#gfyAiStatusGraph');
  _cacheEl('aiLeftPanel',     '.gfy-ai-left');
  _cacheEl('aiRightPanel',    '.gfy-ai-right');
  _cacheEl('aiSteps',         '.gfy-ai-steps');
  _cacheEl('aiTracking',      '.gfy-ai-tracking');
  _cacheEl('aiIntroText',     '#gfyAiIntroText');
  _cacheEl('aiStep1Desc',     '#gfyAiStep1Desc');
  _cacheEl('aiStep1Type',     '#gfyAiStep1Type');
  _cacheEl('aiNoChanges',     '.gfy-ai-no-changes');
  _cacheEl('aiTrackingChanges', '#gfyAiTrackingChanges');
  _cacheEl('aiTrackingGenBtn', '.gfy-tracking-gen-btn');
  _cacheEl('aiTrackingSend',  '.gfy-ai-tracking-send');
  _cacheEl('aiFeatures',      '#gfyAiFeatures');
  _cacheEl('aiConcepts',      '#gfyAiConcepts');
  _cacheEl('aiReport',        '#gfyAiReport');

  // Changes tab
  _cacheEl('changesSpinner',      '.gfy-changes-spinner');
  _cacheEl('changesError',        '.gfy-changes-error');
  _cacheEl('changesReindexBtn',   '.gfy-changes-reindex-btn');
  _cacheEl('changesReindexStatus','.gfy-changes-reindex-status');
  _cacheEl('changesDetected',     '.gfy-changes-detected');
  _cacheEl('changesDetectedInfo', '.gfy-changes-detected-info');
  _cacheEl('changesGenBtn',       '.gfy-changes-gen-btn');
  _cacheEl('changesGenStatus',    '.gfy-changes-gen-status');
  _cacheEl('changesSendAiBtn',    '.gfy-changes-send-ai-btn');
  _cacheEl('changesPromptInfo',   '.gfy-changes-prompt-info');
  _cacheEl('changesPromptPath',   '.gfy-changes-prompt-path');
  _cacheEl('changesCheckBtn',     '.gfy-changes-check-btn');
  _cacheEl('changesSyncStatus',   '.gfy-changes-sync-status');
  _cacheEl('changesSyncDetail',   '.gfy-changes-sync-detail');
  _cacheEl('changesFileList',     '.gfy-changes-file-list');

  // Query tab
  _cacheEl('queryTools',            '.gfy-query-tools');
  _cacheEl('epResult',              '#gfyEpResult');
  _cacheEl('epResultTitle',         '#gfyEpResultTitle');
  _cacheEl('epResultBody',          '#gfyEpResultBody');
  _cacheEl('queryPathResult',       '#gfyPathResult');
  _cacheEl('queryExplainResult',    '#gfyExplainResult');
  _cacheEl('queryAffectedResult',   '#gfyAffectedResult');
  _cacheEl('queryNodeSearchResults','#gfyNodeSearchResults');

  // Wizard sub-elements (queried from wizard context)
  const wiz = _els.wizard;
  if (wiz) {
    _cacheEl('wizLoading',     '.gfy-wizard-loading', wiz);
    _cacheEl('wizNeedsIndex',  '.gfy-wizard-needs-index', wiz);
    _cacheEl('wizIndexed',     '.gfy-wizard-indexed', wiz);
    _cacheEl('wizGraphReady',  '.gfy-wizard-graph-ready', wiz);
    _cacheEl('wizStatsLine',   '.gfy-wizard-stats-line', wiz);
    _cacheEl('wizStep1ExportBtn', '.gfy-wizard-step:first-child .gfy-export-btn', wiz);
    _cacheEl('wizStep1Done',   '.gfy-wizard-step:first-child .gfy-wizard-step-done', wiz);
    _cacheEl('wizStep1Type',   '.gfy-wizard-step:first-child .gfy-ai-step-type', wiz);
    _cacheEl('wizStep1NoChanges', '.gfy-wizard-step:first-child .gfy-ai-no-changes', wiz);
    _cacheEl('wizStep1Desc',   '.gfy-wizard-step:first-child .gfy-wizard-step-desc', wiz);
    _cacheEl('wizStep3',       '.gfy-wizard-step:nth-child(3)', wiz);
    _cacheEls('wizChecklistMetas', '.gfy-checklist-meta', wiz);
    _cacheEl('wizExportStatus', '.gfy-wizard-export-status', wiz);
    _cacheEl('wizError',       '.gfy-wizard-error', wiz);
  }
}

export function mount(container) {
  _root = container;
  _mounted = true;
  if (!_initialized) {
    _root.innerHTML = _template();
    _populateDomCache();
    _bindEvents();
    _initialized = true;
  }
  if (_unsub) _unsub();
  _unsub = subscribe(_render);
  _render(getState());
  _loadMountData();
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

function _startWatchdog() {
  _stopWatchdog();
  _watchdogTimer = setInterval(() => {
    if (!_mounted) { _stopWatchdog(); return; }
    _performStatusSync();
  }, 30000);
}

function _stopWatchdog() {
  if (_watchdogTimer) { clearInterval(_watchdogTimer); _watchdogTimer = null; }
}

export function unmount() {
  _mounted = false;
  _initialized = false;
  _stopHealthTimer();
  _stopWatchdog();
  if (_unsub) { _unsub(); _unsub = null; }
  if (_debounce) clearTimeout(_debounce);
  _root = null;
}

export function show() {
  if (!_root) return;
  _mounted = true;
  if (_unsub) _unsub();
  _unsub = subscribe(_render);
  _render(getState());
  _loadMountData();
}

export function hide() {
  _stopHealthTimer();
  _stopWatchdog();
}

async function _loadMountData() {
  if (!_mounted) return;
  try {
    const repoPath = window.__activeRepoPath;
    if (!repoPath) { _startWatchdog(); return; }
    const mountData = await window.electronAPI.graphifyGetMountData(repoPath);
    if (!_mounted || !mountData?.ok) { _startWatchdog(); return; }

    const patch = { statusLoading: false };
    patch.repoStatus = mountData.symbolsExists ? 'indexed' : 'needs-index';
    patch.symbolsInfo = mountData.symbolsStats;
    patch.promptExists = mountData.promptExists || mountData.promptGenerated;
    patch.graphInfo = mountData.graphExists ? { exists: true, stats: mountData.graphStats } : null;
    patch.graphHasData = mountData.graphHasData;
    patch.hashesExist = mountData.hashesExist;
    patch.indexed = mountData.symbolsExists;

    if (mountData.running) {
      patch.port = mountData.port;
      patch.serverStatus = 'running';
    }
    if (mountData.changes) {
      patch.changesDetected = mountData.changes;
      if (mountData.promptGenerated) {
        patch.incrementalPromptReady = true;
        patch.changesTabStep = 'prompt_ready';
      } else {
        patch.changesTabStep = mountData.changes.total > 0 ? 'changes_detected' : 'idle';
      }
    }
    patch.promptGenerated = mountData.promptGenerated;
    patch.incrementalPromptPath = mountData.promptPath;

    _safeSetState(patch);
    if (mountData.running) _startHealthTimer();
  } catch {
    if (_mounted) _safeSetState({ statusLoading: false });
  }
  _startWatchdog();
}

function _safeSetState(patch) {
  if (_mounted) setState(patch);
}

function _bindEvents() {
  const startBtn = _root.querySelector('.gfy-start-btn');
  const stopBtn  = _root.querySelector('.gfy-stop-btn');
  const cancelBtn = _root.querySelector('.gfy-cancel-btn');
  const copyBtn  = _root.querySelector('.gfy-copy-btn');
  const indexBtn = _root.querySelector('.gfy-index-btn');
  const input    = _root.querySelector('.gfy-input');
  const searchBtn = _root.querySelector('.gfy-search-btn');
  const clearBtn  = _root.querySelector('.gfy-clear-btn');

  startBtn.addEventListener('click', _handleStart);
  stopBtn.addEventListener('click', _handleStop);
  if (cancelBtn) cancelBtn.addEventListener('click', _handleCancel);
  copyBtn.addEventListener('click', _handleCopyUrl);
  if (indexBtn) indexBtn.addEventListener('click', _handleIndex);
  const cheatsheetBtn = _root.querySelector('.gfy-cheatsheet-btn');
  if (cheatsheetBtn) cheatsheetBtn.addEventListener('click', _handleSendCheatsheet);

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
    _safeSetState({ query: '', files: [], results: [], explanation: '', error: null });
    input.focus();
  });

  // Tab clicks — also dismiss endpoint result if showing
  _root.querySelectorAll('.gfy-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      setState({ activeTab: tab, endpointResultKey: null });
      if (tab === 'report') {
        const s = getState();
        if (s.reportError) _safeSetState({ reportError: null });
        if (!s.graphReport && !s.graphLoading) _handleRefreshReport();
      }
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


  // AI-enrichment buttons
  const exportBtn = _root.querySelector('.gfy-export-btn');
  if (exportBtn) exportBtn.addEventListener('click', _handleExport);

  const loadAiGraphBtn = _root.querySelector('.gfy-load-ai-btn');
  if (loadAiGraphBtn) loadAiGraphBtn.addEventListener('click', _handleLoadAiGraph);

  // AI tab's dedicated load button
  const aiLoadBtn = _root.querySelector('.gfy-ai-load-section .gfy-load-ai-btn');
  if (aiLoadBtn && aiLoadBtn !== loadAiGraphBtn) aiLoadBtn.addEventListener('click', _handleLoadAiGraph);

  // Wizard section buttons (idle hero) — bind all instances
  _root.querySelectorAll('.gfy-wizard .gfy-start-btn').forEach(btn => {
    btn.addEventListener('click', _handleStart);
  });
  _root.querySelectorAll('.gfy-wizard .gfy-index-btn').forEach(btn => {
    btn.addEventListener('click', _handleIndex);
  });
  _root.querySelectorAll('.gfy-wizard .gfy-export-btn').forEach(btn => {
    btn.addEventListener('click', _handleExport);
  });

  // All send-to-ai buttons (steps, tracking, wizard)
  _root.querySelectorAll('.gfy-send-ai-btn').forEach(btn => {
    btn.addEventListener('click', _handleSendToAi);
  });
  _root.querySelectorAll('.gfy-wizard .gfy-load-ai-btn').forEach(btn => {
    btn.addEventListener('click', _handleLoadAiGraph);
  });

  // Changes tab buttons
  const changesReindexBtn = _root.querySelector('.gfy-changes-reindex-btn');
  if (changesReindexBtn) changesReindexBtn.addEventListener('click', _handleChangesReindex);
  const changesGenBtn = _root.querySelector('.gfy-changes-gen-btn');
  if (changesGenBtn) changesGenBtn.addEventListener('click', _handleChangesGenPrompt);
  const changesCheckBtn = _root.querySelector('.gfy-changes-check-btn');
  if (changesCheckBtn) changesCheckBtn.addEventListener('click', _handleChangesCheckSync);

  // Tracking section buttons
  const trackingReindexBtn = _root.querySelector('.gfy-tracking-reindex-btn');
  if (trackingReindexBtn) trackingReindexBtn.addEventListener('click', _handleTrackingReindex);
  const trackingGenBtn = _root.querySelector('.gfy-tracking-gen-btn');
  if (trackingGenBtn) trackingGenBtn.addEventListener('click', _handleExport);

  // Endpoint result close button
  const epCloseBtn = _root.querySelector('.gfy-ep-result-close-btn');
  if (epCloseBtn) epCloseBtn.addEventListener('click', () => {
    setState({ expandedEndpoint: null, endpointResultKey: null });
  });

  // Endpoint test delegation
  const epList = _els.endpointsList;
  if (epList) {
    epList.addEventListener('click', (e) => {
      const target = e.target.closest('[data-ep-key]');
      if (!target) return;
      const key = target.dataset.epKey;
      if (!key) return;
      // If the click is on an execute button (POST warning), fire the test and set result
      if (e.target.closest('.gfy-ep-test-execute-btn')) {
        _handleEndpointTest(key);
        setState({ endpointResultKey: key });
        return;
      }
      // Normal click: set as active, fire test, show result in right panel
      setState({ expandedEndpoint: key, endpointResultKey: key });
      const s = getState();
      const [method] = key.split(' ');
      const test = s.endpointTests[key];
      if ((!test || (!test.loading && test.error)) && method !== 'POST') {
        _handleEndpointTest(key);
      }
    });
  }
}

async function _handleTrackingReindex() {
  if (!_mounted) return;
  _safeSetState({ exportLoading: true, exportStatus: null, pendingChanges: null });
  try {
    const repoPath = window.__activeRepoPath;
    if (!repoPath) throw new Error('No repository selected');
    await window.electronAPI.symbolIndex.startIndexing(repoPath);
    if (!_mounted) return;
    await _checkStatus();
    if (!_mounted) return;
    // Detect changes after re-index to show what changed
    try {
      const result = await window.electronAPI.graphifyDetectChanges(repoPath);
      if (_mounted && result && result.ok) {
        _safeSetState({ pendingChanges: result.changes, symbolsInfo: result.stats });
      }
    } catch {}
  } catch (err) {
    if (_mounted) _safeSetState({ exportLoading: false, error: `Re-index failed: ${err.message}` });
  } finally {
    if (_mounted) _safeSetState({ exportLoading: false });
  }
}

// ── Changes tab handlers ──

async function _handleChangesReindex() {
  if (!_mounted) return;
  _safeSetState({ changesLoading: true, changesError: null, changesDetected: null, incrementalPromptPath: null, incrementalPromptReady: false, changesTabStep: 'idle' });
  try {
    const repoPath = window.__activeRepoPath;
    if (!repoPath) throw new Error('No repository selected');
    await window.electronAPI.symbolIndex.startIndexing(repoPath);
    if (!_mounted) return;
    // Indexer already exported symbols.json, detect changes + save baseline
    const result = await window.electronAPI.graphifyDetectChanges(repoPath);
    if (_mounted && result && result.ok) {
      if (result.changes && result.changes.total > 0) {
        _safeSetState({ changesDetected: result.changes, changesTabStep: 'changes_detected' });
      } else {
        _safeSetState({ changesDetected: { total: 0, changed: 0, new: 0 }, changesTabStep: 'changes_detected' });
      }
    }
  } catch (err) {
    if (_mounted) _safeSetState({ changesError: 'Re-index failed: ' + err.message });
  } finally {
    if (_mounted) _safeSetState({ changesLoading: false });
  }
}

async function _handleChangesGenPrompt() {
  if (!_mounted) return;
  _safeSetState({ changesLoading: true, changesError: null, incrementalPromptPath: null, incrementalPromptReady: false });
  try {
    const repoPath = window.__activeRepoPath;
    if (!repoPath) throw new Error('No repository selected');
    // Pass changed files from state so prompt generation uses the same delta
    const s = getState();
    const changedFiles = s.changesDetected && s.changesDetected.total > 0
      ? [...(s.changesDetected.changedFiles || []), ...(s.changesDetected.newFiles || []), ...(s.changesDetected.deleted || [])]
      : null;
    const result = await window.electronAPI.graphifyGenerateIncrementalPrompt(repoPath, changedFiles);
    if (_mounted) {
      if (result && result.ok && result.promptPath) {
        _safeSetState({ incrementalPromptPath: result.promptPath, incrementalPromptText: result.promptText || '', incrementalPromptReady: true, changesTabStep: 'prompt_ready' });
      } else {
        _safeSetState({ changesError: result.error || 'Failed to generate incremental prompt' });
      }
    }
  } catch (err) {
    if (_mounted) _safeSetState({ changesError: 'Generate prompt failed: ' + err.message });
  } finally {
    if (_mounted) _safeSetState({ changesLoading: false });
  }
}

async function _handleChangesCheckSync() {
  if (!_mounted) return;
  _safeSetState({ graphSyncLoading: true, changesError: null });
  try {
    const repoPath = window.__activeRepoPath;
    if (!repoPath) throw new Error('No repository selected');
    const result = await window.electronAPI.graphifyCheckGraphSync(repoPath);
    if (_mounted) {
      if (result && result.ok) {
        _safeSetState({ graphSyncStatus: result, changesTabStep: result.synced ? 'synced' : 'out_of_sync' });
      } else {
        _safeSetState({ changesError: result.error || 'Failed to check sync status' });
      }
    }
  } catch (err) {
    if (_mounted) _safeSetState({ changesError: 'Check sync failed: ' + err.message });
  } finally {
    if (_mounted) _safeSetState({ graphSyncLoading: false });
  }
}

async function _handleChangesLoadState() {
  if (!_mounted || _loadChangesStatePending) return;
  _loadChangesStatePending = true;
  const repoPath = window.__activeRepoPath;
  if (!repoPath) { _loadChangesStatePending = false; return; }
  _safeSetState({ changesLoading: true, changesError: null });
  try {
    const result = await window.electronAPI.graphifyGetChangesTabState(repoPath);
    if (!_mounted || !result || !result.ok) return;
    const patch = {};
    if (!result.indexed || !result.hashesExist) {
      // Not indexed or no hash baseline yet — user hasn't re-indexed via Changes tab
      patch.changesDetected = null;
      patch.incrementalPromptReady = false;
      patch.incrementalPromptPath = null;
      patch.changesTabStep = 'idle';
    } else {
      const hasChanges = result.changes && result.changes.total > 0;
      // Set changesDetected from persisted state (disk)
      patch.changesDetected = result.changes || { total: 0, changed: 0, new: 0 };
      // If new changes exist, old prompt is stale — hide generated status
      if (hasChanges && result.promptGenerated) {
        patch.incrementalPromptReady = false;
        patch.incrementalPromptPath = null;
        patch.changesTabStep = 'changes_detected';
      } else {
        patch.incrementalPromptReady = !!result.promptGenerated;
        patch.incrementalPromptPath = result.promptGenerated ? result.promptPath : null;
        patch.changesTabStep = result.promptGenerated ? 'prompt_ready' : (hasChanges ? 'changes_detected' : 'idle');
      }
    }
    _safeSetState(patch);
    // Also run sync check if graph exists (derives graphSyncStatus from disk)
    if (result.graphExists) {
      _handleChangesCheckSync();
    }
  } catch (err) {
    if (_mounted) _safeSetState({ changesError: 'Failed to load changes state: ' + err.message });
  } finally {
    if (_mounted) _safeSetState({ changesLoading: false });
    _loadChangesStatePending = false;
  }
}

function _formatJson(obj) {
  const indent = '  ';
  function _fmt(val, depth) {
    const pad = indent.repeat(depth);
    const childPad = indent.repeat(depth + 1);
    if (val === null) return '<span class="gfy-json-null">null</span>';
    if (val === undefined) return '';
    if (typeof val === 'string') return `<span class="gfy-json-str">${_esc(JSON.stringify(val))}</span>`;
    if (typeof val === 'number') return `<span class="gfy-json-num">${val}</span>`;
    if (typeof val === 'boolean') return `<span class="gfy-json-bool">${val}</span>`;
    if (Array.isArray(val)) {
      if (val.length === 0) return '[]';
      const items = val.map(v => `${childPad}${_fmt(v, depth + 1)}`).join(',\n');
      return `[\n${items}\n${pad}]`;
    }
    if (typeof val === 'object') {
      const keys = Object.keys(val);
      if (keys.length === 0) return '{}';
      const items = keys.map(k => `${childPad}<span class="gfy-json-key">${_esc(JSON.stringify(k))}</span>: ${_fmt(val[k], depth + 1)}`).join(',\n');
      return `{\n${items}\n${pad}}`;
    }
    return _esc(String(val));
  }
  return _fmt(obj, 0);
}

function _renderEndpointTestContent(key, method, test) {
  if (!test) {
    if (method === 'POST') {
      return `<div class="gfy-ep-test-post-warning">
        <span>\u26A0\uFE0F POST request \u2014 may have side effects</span>
        <button class="gfy-ep-test-execute-btn">Execute</button>
      </div>`;
    }
    return '<div class="gfy-ep-test-spinner"><div class="gfy-ep-test-spinner-dot"></div><span>Requesting\u2026</span></div>';
  }
  if (test.loading) {
    return '<div class="gfy-ep-test-spinner"><div class="gfy-ep-test-spinner-dot"></div><span>Requesting\u2026</span></div>';
  }
  if (test.error) {
    const statusClass = 'gfy-ep-status-err';
    return `<div class="gfy-ep-test-meta">
      <span class="gfy-ep-status-badge ${statusClass}">ERR</span>
      <span class="gfy-ep-elapsed">${test.elapsed}ms</span>
    </div>
    <div class="gfy-ep-test-error">${_esc(test.error)}</div>`;
  }
  if (test.data === null || test.data === undefined || (typeof test.data === 'object' && Object.keys(test.data).length === 0 && !Array.isArray(test.data))) {
    const codeClass = test.statusCode >= 200 && test.statusCode < 300 ? 'gfy-ep-status-2xx' :
      test.statusCode >= 300 && test.statusCode < 400 ? 'gfy-ep-status-3xx' :
      test.statusCode >= 400 && test.statusCode < 500 ? 'gfy-ep-status-4xx' :
      test.statusCode >= 500 ? 'gfy-ep-status-5xx' : '';
    return `<div class="gfy-ep-test-meta">
      <span class="gfy-ep-status-badge ${codeClass}">${test.statusCode}</span>
      <span class="gfy-ep-elapsed">${test.elapsed}ms</span>
    </div>
    <div class="gfy-ep-test-empty">(empty response)</div>`;
  }
  const codeClass = test.statusCode >= 200 && test.statusCode < 300 ? 'gfy-ep-status-2xx' :
    test.statusCode >= 300 && test.statusCode < 400 ? 'gfy-ep-status-3xx' :
    test.statusCode >= 400 && test.statusCode < 500 ? 'gfy-ep-status-4xx' :
    test.statusCode >= 500 ? 'gfy-ep-status-5xx' : '';
  let formatted = typeof test.data === 'string' ? _esc(test.data) : _formatJson(test.data);
  if (formatted.length > 5000) formatted = formatted.slice(0, 5000) + '\n\n... (truncated)';
  return `<div class="gfy-ep-test-meta">
    <span class="gfy-ep-status-badge ${codeClass}">${test.statusCode}</span>
    <span class="gfy-ep-elapsed">${test.elapsed}ms</span>
  </div>
  <pre class="gfy-ep-test-json">${formatted}</pre>`;
}

function _epKey(method, path) {
  return `${method} ${path}`;
}

function _toggleEndpointTest(key) {
  const s = getState();
  if (s.expandedEndpoint === key) {
    setState({ expandedEndpoint: null });
    return;
  }
  if (s.expandedEndpoint) {
    setState({ expandedEndpoint: key, endpointTests: { ...s.endpointTests } });
  } else {
    setState({ expandedEndpoint: key });
  }
  const [method] = key.split(' ');
  const test = s.endpointTests[key];
  if ((!test || (!test.loading && test.error)) && method !== 'POST') {
    _handleEndpointTest(key);
  }
}

async function _handleEndpointTest(key) {
  if (!_mounted) return;
  const s = getState();
  const [method, ...pathParts] = key.split(' ');
  const path = pathParts.join(' ');
  const tests = { ...s.endpointTests, [key]: { loading: true, data: null, error: null, statusCode: null, elapsed: null } };
  setState({ endpointTests: tests });
  const { port } = getState();
  const result = await testEndpoint(method, path, port);
  if (!_mounted) return;
  const updated = { ...getState().endpointTests, [key]: { ...result, loading: false } };
  setState({ endpointTests: updated });
}

async function _handleStart() {
  const s = getState();
  if (!s.graphInfo?.exists) {
    _safeSetState({ error: 'Generate the knowledge graph first before starting the server.' });
    return;
  }
  _startCancelRequested = false;
  _safeSetState({ serverStatus: 'starting', error: null });
  try {
    const result = await window.electronAPI.graphifyStart(window.__activeRepoPath || null);
    if (!result.ok) throw new Error(result.error || 'Failed to start server');
    if (_startCancelRequested) {
      await window.electronAPI.graphifyStop();
      _safeSetState({ serverStatus: 'stopped', error: null });
      return;
    }
    if (!_mounted) return;
    _safeSetState({ port: result.port, serverStatus: 'running' });
    _startHealthTimer();
    const [info, epData] = await Promise.all([
      fetchInfo(result.port),
      fetchEndpoints(result.port),
    ]);
    if (!_mounted) return;
    if (epData && epData.endpoints) _safeSetState({ endpoints: epData.endpoints });
    if (info && !info.error) _safeSetState({ serverInfo: info });
    _handleRefreshGraph();
  } catch (err) {
    if (_startCancelRequested) {
      _safeSetState({ serverStatus: 'stopped', error: null });
    } else {
      _safeSetState({ serverStatus: 'error', error: err.message });
    }
  }
}

async function _handleCancel() {
  _startCancelRequested = true;
  _stopHealthTimer();
  try {
    await window.electronAPI.graphifyCancelStart();
  } catch {}
  _safeSetState({
    serverStatus: 'stopped', serverInfo: null, endpoints: null,
    error: null,
  });
  const _gf = _els?.graphIframeWrap?.querySelector('.gfy-graph-iframe');
  if (_gf) { _gf.src = ''; _gf.onload = null; _gf.onerror = null; if (_gf._ovTimer) clearTimeout(_gf._ovTimer); _gf._ovTimer = null; }
}

async function _handleStop() {
  _stopHealthTimer();
  try {
    await window.electronAPI.graphifyStop();
  } catch {}
  _safeSetState({
    serverStatus: 'stopped', serverInfo: null, endpoints: null,
    results: [], files: [], explanation: '', error: null,
    graphData: null, graphStats: null, graphReport: null, graphCommunities: null,
    graphLoading: false, graphError: null, reportError: null,
    nodeSearchResults: [], pathResult: null, explainResult: null, affectedResult: null,
    endpointTests: {}, expandedEndpoint: null,
  });

  const _gf = _els?.graphIframeWrap?.querySelector('.gfy-graph-iframe');
  if (_gf) { _gf.src = ''; _gf.onload = null; _gf.onerror = null; if (_gf._ovTimer) clearTimeout(_gf._ovTimer); _gf._ovTimer = null; }
}

async function _handleIndex() {
  if (!_mounted) return;
  const repoPath = window.__activeRepoPath;
  if (!repoPath) {
    _safeSetState({ error: 'No repository selected. Select a repo first.' });
    return;
  }
  _safeSetState({ indexLoading: true, error: 'Indexing started\u2026 Please wait for it to complete.' });
  try {
    await window.electronAPI.symbolIndex.startIndexing(repoPath);
    if (!_mounted) return;
    // If server is running, reload its data to pick up new symbols
    try {
      const runStatus = await window.electronAPI.graphifyIsRunning();
      if (runStatus.running) {
        await window.electronAPI.graphifyReload();
        if (_mounted) _safeSetState({ error: 'Indexing complete! Server reloaded with new data.' });
      } else {
        if (_mounted) _safeSetState({ error: 'Indexing complete! You can now start the server.' });
      }
    } catch {
      if (_mounted) _safeSetState({ error: 'Indexing complete! You can now start the server.' });
    }
    _checkStatus();
  } catch (err) {
    if (_mounted) _safeSetState({ error: `Indexing failed: ${err.message}` });
  } finally {
    if (_mounted) _safeSetState({ indexLoading: false });
  }
}

async function _checkServerAlive(retries = 2) {
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
    if (Object.keys(patch).length) _safeSetState(patch);
  } catch {
    if (retries > 0) {
      // Transient failure — retry after a short delay
      await new Promise(r => setTimeout(r, 1000));
      return _checkServerAlive(retries - 1);
    }
    // Health check exhausted — verify if the server process is still alive
    try {
      const procStatus = await window.electronAPI.graphifyIsRunning();
      if (procStatus.running) {
        // Process is alive but unresponsive — restart health timer, don't mark as stopped
        _safeSetState({ error: 'Server is unresponsive. Retrying...' });
        _startHealthTimer();
        return;
      }
    } catch {}
    // Process is dead — reset state so user sees the start UI
    _stopHealthTimer();
    _safeSetState({
      serverStatus: 'stopped', serverInfo: null, endpoints: null,
      results: [], files: [], explanation: '', error: 'Server was disconnected. Click Start to restart.',
      graphData: null, graphStats: null, graphReport: null, graphCommunities: null,
      graphLoading: false, graphError: null, reportError: null,
      endpointTests: {}, expandedEndpoint: null,
    });

    const _df = _els?.graphIframeWrap?.querySelector('.gfy-graph-iframe');
    if (_df) { _df.src = ''; _df.onload = null; _df.onerror = null; if (_df._ovTimer) clearTimeout(_df._ovTimer); _df._ovTimer = null; }
  }
}

async function _performStatusSync() {
  if (!_mounted) return;
  try {
    const status = await window.electronAPI.graphifyStatus();
    if (!_mounted) return;
    const s = getState();
    if (status.running) {
      if (s.serverStatus !== 'running') {
        _safeSetState({ port: status.port, serverStatus: 'running' });
        _startHealthTimer();
      }
    } else if (s.serverStatus === 'running') {
      _stopHealthTimer();
      _safeSetState({ serverStatus: 'stopped', error: 'Server was disconnected while you were away. Click Start to restart.' });
    }
  } catch {}
}

async function _checkStatus() {
  const repoPath = window.__activeRepoPath;
  if (!repoPath) {
    _safeSetState({ repoStatus: null, symbolsInfo: null, graphInfo: null, statusLoading: false });
    return;
  }
  _safeSetState({ statusLoading: true });
  try {
    const result = await window.electronAPI.graphifyCheckStatus(repoPath);
    if (!_mounted) return;
    if (result.ok) {
      _safeSetState({
        repoStatus: result.symbolsExists ? 'indexed' : 'needs-index',
        symbolsInfo: result.symbolsStats || null,
        promptExists: !!result.promptExists,
        graphInfo: { exists: result.graphExists, stats: result.graphStats || null },
        graphHasData: !!result.graphHasData,
        statusLoading: false,
      });
    } else {
      _safeSetState({ repoStatus: null, symbolsInfo: null, graphInfo: null, statusLoading: false });
    }
  } catch {
    if (_mounted) _safeSetState({ repoStatus: null, symbolsInfo: null, graphInfo: null, statusLoading: false });
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

async function _handleSendCheatsheet() {
  if (!_mounted) return;
  const repoPath = window.__activeRepoPath;
  if (!repoPath) return;
  const cheatsheetPath = (repoPath + '/graphify/prompts/graphify-cheatsheet.md').replace(/\\/g, '/');
  try {
    const result = await window.electronAPI.readFile(cheatsheetPath);
    if (_mounted && result && result.success && result.content) {
      _showSendToAiDialog(result.content);
    }
  } catch {}
}

async function _runQuery() {
  if (!_root || !_mounted) return;
  const input = _root.querySelector('.gfy-input');
  const query = input.value.trim();
  if (!query) return;

  _safeSetState({ query, loading: true, error: null, files: [], results: [], explanation: '' });

  try {
    const { port, query: stateQuery } = getState();
    if (query !== stateQuery && stateQuery !== query) return;
    if (!_mounted) return;

    const repoPath = window.__activeRepoPath || null;
    const data     = await queryGraphify(query, repoPath, port);
    if (!_mounted) return;

    _safeSetState({
      loading:     false,
      files:       data.files       || [],
      results:     data.scores      || [],
      explanation: data.explanation || '',
    });
  } catch (err) {
    if (!_mounted) return;
    _safeSetState({ loading: false, error: err.message });
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
  if (!_mounted) return;
  const { port } = getState();
  _safeSetState({ graphLoading: true, graphError: null });
  try {
    const [data, report] = await Promise.all([
      fetchGraphData(port),
      fetchGraphReport(port),
    ]);
    if (!_mounted) return;
    _safeSetState({
      graphData: data,
      graphStats: data?.stats || null,
      graphReport: report,
      graphCommunities: data?.communities || null,
      graphLoading: false,
    });
  } catch (err) {
    if (!_mounted) return;
    _safeSetState({ graphLoading: false, graphError: err.message });
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
  if (!_mounted) return;
  const input = _root.querySelector('#gfyNodeSearchInput');
  if (!input) return;
  const query = input.value.trim();
  _safeSetState({ nodeSearchQuery: query });
  if (query.length < 2) {
    _safeSetState({ nodeSearchResults: [] });
    return;
  }
  const { port } = getState();
  const results = await searchGraphNodes(query, port, 20);
  if (!_mounted) return;
  _safeSetState({ nodeSearchResults: results });
}

async function _handlePathFind() {
  if (!_mounted) return;
  const from = (_root.querySelector('#gfyPathFrom')?.value || '').trim();
  const to = (_root.querySelector('#gfyPathTo')?.value || '').trim();
  if (!from || !to) return;
  const { port } = getState();
  _safeSetState({ pathFrom: from, pathTo: to, pathResult: null });
  const result = await getGraphShortestPath(from, to, port);
  if (!_mounted) return;
  _safeSetState({ pathResult: result });
}

async function _handleExplain() {
  if (!_mounted) return;
  const nodeId = (_root.querySelector('#gfyExplainInput')?.value || '').trim();
  const depth = parseInt(_root.querySelector('#gfyExplainDepth')?.value || '1', 10);
  if (!nodeId) return;
  const { port } = getState();
  _safeSetState({ explainNodeId: nodeId, explainDepth: depth, explainResult: null });
  const result = await getGraphNeighborhood(nodeId, port, depth);
  if (!_mounted) return;
  _safeSetState({ explainResult: result });
}

async function _handleAffected() {
  if (!_mounted) return;
  const nodeId = (_root.querySelector('#gfyAffectedInput')?.value || '').trim();
  const depth = parseInt(_root.querySelector('#gfyAffectedDepth')?.value || '1', 10);
  if (!nodeId) return;
  const { port } = getState();
  _safeSetState({ affectedNodeId: nodeId, affectedDepth: depth, affectedResult: null });
  const result = await getGraphAffected(nodeId, port, depth);
  if (!_mounted) return;
  _safeSetState({ affectedResult: result });
}

async function _handleRefreshReport() {
  if (!_mounted) return;
  const { port } = getState();
  _safeSetState({ graphLoading: true, reportError: null });
  try {
    const report = await fetchGraphReport(port);
    if (!_mounted) return;
    if (report) {
      _safeSetState({ graphReport: report, graphStats: report.stats || null, graphLoading: false });
    } else {
      _safeSetState({ graphLoading: false, reportError: 'Failed to load report. The server may not have graph data yet.' });
    }
  } catch (err) {
    if (_mounted) _safeSetState({ graphLoading: false, reportError: err.message || 'Failed to load report' });
  }
}

async function _handleExport() {
  if (!_mounted) return;
  _safeSetState({ exportLoading: true, exportError: null, exportStatus: null });
  try {
    const repoPath = window.__activeRepoPath;
    if (!repoPath) throw new Error('No repository selected');
    const result = await window.electronAPI.graphifyExportPrompt(repoPath);
    if (!_mounted) return;
    if (!result || !result.ok) {
      _safeSetState({ exportLoading: false, exportError: (result && result.error) || 'Export failed' });
      return;
    }
    const patch = {
      exportLoading: false,
      exportStatus: { promptPath: result.promptPath, promptText: result.promptText || '', stats: result.stats, promptType: result.promptType },
      promptExists: result.promptType !== 'none',
      promptType: result.promptType || null,
      pendingChanges: result.changes || null,
    };
    if (result.promptType === 'none' && result.noChanges) {
      patch.exportStatus = { ...patch.exportStatus, noChanges: true };
    }
    _safeSetState(patch);
  } catch (err) {
    if (_mounted) _safeSetState({ exportLoading: false, exportError: err.message });
  }
}

async function _handleSendToAi() {
  if (!_mounted) return;
  const state_ = getState();
  let promptText = state_.exportStatus?.promptText;

  if (!promptText) {
    promptText = state_.incrementalPromptText || '';
  }

  if (!promptText) {
    try {
      const repoPath = window.__activeRepoPath;
      if (repoPath) {
        const result = await window.electronAPI.graphifyExportPrompt(repoPath);
        if (_mounted && result.ok && result.promptText) {
          promptText = result.promptText;
          _safeSetState({ exportStatus: { ...state_.exportStatus, promptText } });
        }
      }
    } catch {}
  }

  if (!promptText && state_.incrementalPromptPath) {
    try {
      const text = await window.electronAPI.readFile(state_.incrementalPromptPath);
      if (text) promptText = text;
    } catch {}
  }

  if (!promptText) {
    _safeSetState({ exportError: 'No prompt generated yet. Run export first.' });
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
  if (!_mounted) return;
  const repoPath = window.__activeRepoPath;
  if (!repoPath) {
    _safeSetState({ exportError: 'No repository selected.' });
    return;
  }

  try {
    const btn = document.querySelector('[data-tool="opencode"]');
    if (btn) btn.click();

    let input = document.getElementById('ocInput');
    let tab = document.querySelector('.oc-tab.active');
    for (let i = 0; i < 30; i++) {
      if (input && tab) break;
      await new Promise(r => setTimeout(r, 200));
      if (!_mounted) return;
      if (!input) input = document.getElementById('ocInput');
      if (!tab) tab = document.querySelector('.oc-tab.active');
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
    if (_mounted) _safeSetState({ exportError: 'Failed to open CodeSwamp: ' + err.message });
  }
}

async function _handleLoadAiGraph() {
  if (!_mounted) return;
  _safeSetState({ aiGraphLoading: true, aiGraphError: null, aiGraphData: null, aiGraphReport: '' });
  try {
    const repoPath = window.__activeRepoPath;
    if (!repoPath) throw new Error('No repository selected');
    const result = await window.electronAPI.graphifyLoadGraphFromStorage(repoPath);
    if (!_mounted) return;
    if (!result || !result.ok) {
      _safeSetState({ aiGraphLoading: false, aiGraphError: (result && result.error) || 'No AI graph found' });
      return;
    }
    _safeSetState({
      aiGraphLoading: false,
      aiGraphData: result.graph,
      aiGraphReport: result.report,
    });
    // Also update graphInfo so the wizard reflects the new state
    _safeSetState({
      graphInfo: {
        exists: true,
        stats: result.graph?.stats || null,
      },
      graphHasData: !!(result.graph?.nodes && result.graph.nodes.length > 0),
    });
  } catch (err) {
    if (_mounted) _safeSetState({ aiGraphLoading: false, aiGraphError: err.message });
  }
}

let _prevState = null;

function _render(state) {
  if (!_root) return;
  const prev = _prevState;
  _prevState = state;

  // ── Server status section ──
  const dotEl   = _els.statusDot;
  const labelEl = _els.statusLabel;
  const startBtn = _els.startBtn;
  const stopBtn  = _els.stopBtn;
  const copyBtn  = _els.copyBtn;
  const cheatsheetBtn = _els.cheatsheetBtn;
  const indexBtn = _els.indexBtn;
  const infoLine = _els.infoLine;
  const endpointsSection = _els.endpointsSection;

  // ── Idle hero toggle (Stopped / Error = centered hero, else compact top bar) ──
  const panelEl = _els.panel;
  if (panelEl) {
    panelEl.classList.toggle('gfy-idle', state.serverStatus === 'stopped' || state.serverStatus === 'error');
  }

  if (dotEl && (!prev || state.serverStatus !== prev.serverStatus)) {
    dotEl.className = 'gfy-status-dot gfy-dot-' + state.serverStatus;
  }

  if (labelEl && (!prev || state.serverStatus !== prev.serverStatus || state.port !== prev.port)) {
    const statusLabels = {
      stopped:  'Stopped',
      starting: 'Starting\u2026',
      running:  'Running on :' + state.port,
      error:    'Error',
    };
    labelEl.textContent = statusLabels[state.serverStatus] || 'Unknown';
  }

  const cancelBtn = _els.cancelBtn;
  if (startBtn && (!prev || state.serverStatus !== prev.serverStatus)) {
    const show = state.serverStatus === 'stopped' || state.serverStatus === 'error';
    startBtn.style.display = show ? 'flex' : 'none';
    if (show) {
      const label = startBtn.querySelector('span');
      if (label) label.textContent = state.serverStatus === 'error' ? 'Restart Server' : 'Start Server';
    }
  }
  if (stopBtn && (!prev || state.serverStatus !== prev.serverStatus)) {
    stopBtn.style.display = state.serverStatus === 'running' ? 'flex' : 'none';
  }
  if (cancelBtn && (!prev || state.serverStatus !== prev.serverStatus)) {
    cancelBtn.style.display = state.serverStatus === 'starting' ? 'flex' : 'none';
  }
  if (copyBtn && (!prev || state.serverStatus !== prev.serverStatus))  copyBtn.style.display   = state.serverStatus === 'running' ? 'flex' : 'none';
  if (cheatsheetBtn && (!prev || state.serverStatus !== prev.serverStatus)) cheatsheetBtn.style.display = state.serverStatus === 'running' ? 'flex' : 'none';
  if (indexBtn && (!prev || state.serverStatus !== prev.serverStatus || state.statusLoading !== prev.statusLoading || state.repoStatus !== prev.repoStatus || state.indexLoading !== prev.indexLoading)) {
    const show = (!state.statusLoading && state.repoStatus === 'needs-index') || state.indexLoading;
    indexBtn.style.display = show ? 'flex' : 'none';
    indexBtn.disabled = state.indexLoading;
    const content = indexBtn.querySelector('.gfy-index-btn-content');
    const loading = indexBtn.querySelector('.gfy-index-btn-loading');
    if (content) content.style.display = state.indexLoading ? 'none' : '';
    if (loading) loading.style.display = state.indexLoading ? 'flex' : 'none';
  }
  // Apply loading state to all index buttons (incl. wizard)
  if (state.indexLoading !== (prev && prev.indexLoading)) {
    _root.querySelectorAll('.gfy-index-btn').forEach(btn => {
      btn.disabled = state.indexLoading;
      const c = btn.querySelector('.gfy-index-btn-content');
      const l = btn.querySelector('.gfy-index-btn-loading');
      if (c) c.style.display = state.indexLoading ? 'none' : '';
      if (l) l.style.display = state.indexLoading ? 'flex' : 'none';
    });
  }

  // ── Info line (styled as a stat card, echoing the reference dashboard) ──
  if (infoLine && (!prev || state.serverStatus !== prev.serverStatus || state.serverInfo !== prev.serverInfo)) {
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

  // ── Wizard section (idle hero repo status) ──
  const wizard = _els.wizard;
  if (wizard && (!prev || state.serverStatus !== prev.serverStatus || state.statusLoading !== prev.statusLoading || state.repoStatus !== prev.repoStatus || state.symbolsInfo !== prev.symbolsInfo || state.promptExists !== prev.promptExists || state.promptType !== prev.promptType || state.graphInfo !== prev.graphInfo || state.graphHasData !== prev.graphHasData || state.exportStatus !== prev.exportStatus || state.exportError !== prev.exportError || state.pendingChanges !== prev.pendingChanges)) {
    const isIdle = state.serverStatus === 'stopped' || state.serverStatus === 'error';
    wizard.style.display = isIdle ? 'flex' : 'none';

    if (isIdle) {
      const loading = _els.wizLoading;
      if (loading) loading.style.display = state.statusLoading ? 'flex' : 'none';

      const needsIndex = _els.wizNeedsIndex;
      if (needsIndex) {
        needsIndex.style.display = (!state.statusLoading && state.repoStatus === 'needs-index') || state.indexLoading ? 'flex' : 'none';
      }

      const indexed = _els.wizIndexed;
      if (indexed) {
        indexed.style.display = (!state.statusLoading && state.repoStatus === 'indexed' && !state.graphInfo?.exists) ? 'flex' : 'none';
      }

      const graphReady = _els.wizGraphReady;
      if (graphReady) {
        graphReady.style.display = (!state.statusLoading && state.repoStatus === 'indexed' && state.graphInfo?.exists) ? 'flex' : 'none';
      }

      const statsLine = _els.wizStatsLine;
      if (statsLine && state.symbolsInfo) {
        statsLine.textContent = `${state.symbolsInfo.files} files \u00B7 ${state.symbolsInfo.symbols} symbols \u00B7 ${state.symbolsInfo.imports} imports`;
      }

      const step1ExportBtn = _els.wizStep1ExportBtn;
      const step1Done = _els.wizStep1Done;
      const step1Type = _els.wizStep1Type;
      const step1NoChanges = _els.wizStep1NoChanges;
      if (step1ExportBtn && step1Done) {
        step1ExportBtn.style.display = state.promptExists ? 'none' : 'inline-flex';
        step1Done.style.display = state.promptExists ? 'flex' : 'none';
      }
      if (step1Type) {
        if (state.promptType === 'incremental') {
          step1Type.innerHTML = '<span class="gfy-ai-type-badge gfy-ai-type-incr">Incremental</span>';
          step1Type.style.display = 'flex';
        } else if (state.promptType === 'full') {
          step1Type.innerHTML = '<span class="gfy-ai-type-badge gfy-ai-type-full">Full</span>';
          step1Type.style.display = 'flex';
        } else {
          step1Type.style.display = 'none';
        }
      }
      if (step1NoChanges) {
        step1NoChanges.style.display = state.exportStatus?.noChanges ? 'flex' : 'none';
      }

      const step1Desc = _els.wizStep1Desc;
      if (step1Desc) {
        if (state.promptType === 'incremental' && state.pendingChanges) {
          step1Desc.textContent = `Detected ${state.pendingChanges.total} changed files. Generate an incremental update prompt.`;
        } else if (state.graphHasData) {
          step1Desc.textContent = 'Regenerate a full prompt to rebuild the knowledge graph from scratch.';
        } else {
          step1Desc.textContent = 'Creates a detailed prompt for an AI to analyze your codebase and build a semantic knowledge graph.';
        }
      }

      const step3 = _els.wizStep3;
      if (step3) {
        const loadBtn = _els.wizStep3LoadBtn;
        const waiting = _els.wizStep3Waiting;
        if (loadBtn && waiting) {
          const showLoad = state.graphInfo?.exists && state.graphHasData;
          loadBtn.style.display = showLoad ? 'inline-flex' : 'none';
          waiting.style.display = showLoad ? 'none' : 'flex';
        }
      }

      const checklistMetas = _els.wizChecklistMetas;
      if (checklistMetas && checklistMetas.length >= 2) {
        if (state.symbolsInfo) {
          checklistMetas[0].textContent = `${state.symbolsInfo.files} files \u00B7 ${state.symbolsInfo.symbols} symbols`;
        }
        if (state.graphInfo?.stats) {
          const gs = state.graphInfo.stats;
          checklistMetas[1].textContent = `${gs.totalNodes || 0} nodes \u00B7 ${gs.totalEdges || 0} edges`;
        }
      }

      const exportStatusEl = _els.wizExportStatus;
      if (exportStatusEl) {
        if (state.exportStatus && !state.exportStatus.noChanges) {
          const s = state.exportStatus;
          let typeTag = '';
          if (state.promptType === 'incremental') typeTag = '<span class="gfy-ai-type-badge gfy-ai-type-incr">Incremental</span>';
          else if (state.promptType === 'full') typeTag = '<span class="gfy-ai-type-badge gfy-ai-type-full">Full</span>';
          let changesInfo = '';
          if (state.pendingChanges && state.promptType === 'incremental') {
            changesInfo = ` \u00B7 ${state.pendingChanges.total} files changed`;
          }
          exportStatusEl.innerHTML = `<span class="gfy-export-ok">\u2713 Prompt generated:</span> ${s.stats.files} files, ${s.stats.symbols} symbols${changesInfo} ${typeTag}`;
          exportStatusEl.style.display = 'block';
        } else {
          exportStatusEl.style.display = 'none';
        }
      }

      const wizardError = _els.wizError;
      if (wizardError) {
        wizardError.textContent = state.exportError || '';
        wizardError.style.display = state.exportError ? 'block' : 'none';
      }
    }
  }

  // ── Endpoints section ──
  if (endpointsSection && (!prev || state.serverStatus !== prev.serverStatus || state.endpoints !== prev.endpoints || state.expandedEndpoint !== prev.expandedEndpoint || state.endpointResultKey !== prev.endpointResultKey || state.endpointTests !== prev.endpointTests)) {
    const show = state.serverStatus === 'running' && state.endpoints && state.activeTab !== 'report';
    endpointsSection.style.display = show ? 'flex' : 'none';
    if (show) {
      const listEl = _els.endpointsList;
      if (listEl) {
        listEl.innerHTML = state.endpoints.map(ep => {
          const methodClass = 'gfy-ep-' + ep.method.toLowerCase();
          const key = _epKey(ep.method, ep.path);
          const isActive = state.expandedEndpoint === key || state.endpointResultKey === key;
          return `<div class="gfy-ep-row${isActive ? ' gfy-ep-row-expanded' : ''}" data-ep-key="${_esc(key)}">
            <span class="gfy-ep-arrow${isActive ? ' gfy-ep-arrow-open' : ''}">\u25B6</span>
            <span class="gfy-ep-method ${methodClass}">${_esc(ep.method)}</span>
            <code class="gfy-ep-path">${_esc(ep.path)}</code>
            <span class="gfy-ep-desc">${_esc(ep.description)}</span>
          </div>`;
        }).join('');
      }
    }
  }

  // ── Tab bar ──
  const tabBar = _els.tabBar;
  if (tabBar && (!prev || state.serverStatus !== prev.serverStatus)) {
    tabBar.style.display = state.serverStatus === 'running' ? 'flex' : 'none';
  }

  // ── Tab content visibility ──
  const tabContents = _els.tabContents;
  if (!prev || state.serverStatus !== prev.serverStatus || state.activeTab !== prev.activeTab) {
    for (const tc of tabContents) {
      tc.style.display = 'none';
    }
    if (state.serverStatus === 'running') {
      const activeContent = _root.querySelector(`.gfy-${state.activeTab}-section`);
      if (activeContent) activeContent.style.display = 'flex';
    }
  }

  // ── Tab active class ──
  const tabBtns = _els.tabBtns;
  if (!prev || state.activeTab !== prev.activeTab) {
    for (const tb of tabBtns) {
      tb.classList.toggle('gfy-tab-active', tb.dataset.tab === state.activeTab);
    }
  }

  // ── Tab auto-fullscreen (hide left column, keep tab bar) ──
  const bodyEl = _root?.querySelector('.gfy-body');
  if (bodyEl && (!prev || state.activeTab !== prev.activeTab)) {
    bodyEl.classList.toggle('gfy-graph-active', state.activeTab === 'graph' && state.serverStatus === 'running');
    bodyEl.classList.toggle('gfy-ai-active', state.activeTab === 'ai');
    bodyEl.classList.toggle('gfy-changes-active', state.activeTab === 'changes' && state.serverStatus === 'running');
  }

  // ── Graph tab ──
  if (state.activeTab === 'graph' && state.serverStatus === 'running' && (!prev || state.activeTab !== prev.activeTab || state.graphLoading !== prev.graphLoading || state.graphData !== prev.graphData || state.graphStats !== prev.graphStats || state.port !== prev.port)) {
    const graphSpinner = _els.graphSpinner;
    const placeholder = _els.graphPlaceholder;
    const iframeWrap = _els.graphIframeWrap;
    const statsBar = _els.graphStatsBar;

    if (graphSpinner) graphSpinner.style.display = state.graphLoading ? 'flex' : 'none';
    if (placeholder) placeholder.style.display = (!state.graphLoading && !state.graphData) ? 'flex' : 'none';

    if (iframeWrap && state.graphData && !state.graphLoading) {
      let iframe = iframeWrap.querySelector('.gfy-graph-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.className = 'gfy-graph-iframe';
        iframe.sandbox = 'allow-scripts';
        iframeWrap.innerHTML = '';
        iframeWrap.appendChild(iframe);
      }
      const currentPort = (iframe.src.match(/:(\d+)\//) || [])[1];
      if (currentPort !== String(state.port)) {
        iframe.src = `http://127.0.0.1:${state.port}/graph`;
        let overlay = iframeWrap.querySelector('.gfy-graph-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.className = 'gfy-graph-overlay';
          overlay.innerHTML = '<div class="gfy-graph-overlay-spinner"></div><div class="gfy-graph-overlay-text">Rendering graph\u2026</div>';
          iframeWrap.appendChild(overlay);
        }
        overlay.style.display = 'flex';
        if (iframe._ovTimer) clearTimeout(iframe._ovTimer);
        iframe._ovTimer = setTimeout(() => {
          if (!overlay) return;
          overlay.innerHTML = '<div class="gfy-graph-overlay-text">Graph is taking too long. <button class="gfy-graph-overlay-retry-btn">Retry</button></div>';
          overlay.querySelector('.gfy-graph-overlay-retry-btn')?.addEventListener('click', () => { iframe.src = `http://127.0.0.1:${state.port}/graph`; });
        }, 30000);
        iframe.onload = () => { if (iframe._ovTimer) clearTimeout(iframe._ovTimer); iframe._ovTimer = null; if (overlay) overlay.style.display = 'none'; };
        iframe.onerror = () => { if (iframe._ovTimer) clearTimeout(iframe._ovTimer); iframe._ovTimer = null; if (overlay) overlay.innerHTML = '<div class="gfy-graph-overlay-text">Failed to load graph.</div>'; };
      }
    }

    if (statsBar && state.graphStats) {
      const s = state.graphStats;
      statsBar.innerHTML = `<span><strong>${s.totalNodes}</strong> nodes</span><span class="gfy-dot-sep">\u00B7</span><span><strong>${s.totalEdges}</strong> edges</span><span class="gfy-dot-sep">\u00B7</span><span><strong>${s.communityCount}</strong> communities</span><span class="gfy-dot-sep">\u00B7</span><span><strong>${s.totalFiles}</strong> files</span><span class="gfy-dot-sep">\u00B7</span><span><strong>${s.totalSymbols}</strong> symbols</span>`;
      statsBar.style.display = 'flex';
    }
  }

  // ── Report tab ──
  if (state.activeTab === 'report' && state.serverStatus === 'running' && (!prev || state.activeTab !== prev.activeTab || state.graphReport !== prev.graphReport || state.graphStats !== prev.graphStats || state.graphLoading !== prev.graphLoading || state.reportError !== prev.reportError)) {
    const spinner = _els.reportSpinner;
    const error = _els.reportError;
    const reportContent = _els.reportContent;

    if (spinner) spinner.style.display = state.graphLoading ? 'flex' : 'none';
    if (error) {
      error.style.display = state.reportError ? 'block' : 'none';
      if (state.reportError) error.textContent = state.reportError;
    }

    if (reportContent) {
      if (state.graphReport) {
        reportContent.style.display = 'block';
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
      } else if (!state.graphLoading && !state.reportError) {
        reportContent.style.display = 'block';
        reportContent.innerHTML = '<div class="gfy-empty">No report data yet. Click the Report tab to load it.</div>';
      }
    }

    // Auto-load report on tab activation
    if (state.activeTab === 'report' && state.serverStatus === 'running' && !state.graphReport && !state.graphLoading && !state.reportError) {
      _handleRefreshReport();
    }
  }

  // ── AI Graph tab ──
  if (state.activeTab === 'ai' && state.serverStatus === 'running' && (!prev || state.activeTab !== prev.activeTab || state.aiGraphLoading !== prev.aiGraphLoading || state.exportLoading !== prev.exportLoading || state.aiGraphError !== prev.aiGraphError || state.exportError !== prev.exportError || state.aiGraphData !== prev.aiGraphData || state.symbolsInfo !== prev.symbolsInfo || state.graphHasData !== prev.graphHasData || state.graphInfo !== prev.graphInfo || state.promptType !== prev.promptType || state.exportStatus !== prev.exportStatus || state.promptExists !== prev.promptExists || state.pendingChanges !== prev.pendingChanges || state.aiGraphReport !== prev.aiGraphReport)) {
    const spinner = _els.aiSpinner;
    const error = _els.aiError;
    const exportStatus = _els.aiExportStatus;
    const leftPanel = _els.aiLeftPanel;
    const rightPanel = _els.aiRightPanel;

    if (spinner) spinner.style.display = state.aiGraphLoading || state.exportLoading ? 'flex' : 'none';
    if (error) {
      error.textContent = state.aiGraphError || state.exportError || '';
      error.style.display = (state.aiGraphError || state.exportError) ? 'block' : 'none';
    }

    const statusSymbols = _els.aiStatusSymbols;
    if (statusSymbols) {
      if (state.symbolsInfo) {
        statusSymbols.textContent = `${state.symbolsInfo.files} files \u00B7 ${state.symbolsInfo.symbols} symbols \u00B7 ${state.symbolsInfo.imports} imports`;
      } else {
        statusSymbols.textContent = 'Not indexed';
      }
    }
    const graphStatusIcon = _els.aiGraphStatusIcon;
    if (graphStatusIcon) {
      graphStatusIcon.textContent = state.graphHasData ? '\u2713' : '\u2022';
      graphStatusIcon.className = 'gfy-ai-status-icon' + (state.graphHasData ? ' gfy-ai-status-ok' : ' gfy-ai-status-pending');
    }
    const statusGraph = _els.aiStatusGraph;
    if (statusGraph) {
      if (state.graphHasData && state.graphInfo?.stats) {
        const gs = state.graphInfo.stats;
        statusGraph.textContent = `${gs.totalNodes || 0} nodes \u00B7 ${gs.totalEdges || 0} edges`;
      } else if (state.graphInfo?.exists) {
        statusGraph.textContent = 'Waiting for enrichment';
      } else {
        statusGraph.textContent = 'Not built yet';
      }
    }

    const stepsEl = _els.aiSteps;
    const trackingEl = _els.aiTracking;
    const introText = _els.aiIntroText;

    if (stepsEl) stepsEl.style.display = state.graphHasData ? 'none' : 'flex';
    if (trackingEl) trackingEl.style.display = state.graphHasData ? 'flex' : 'none';
    if (introText) {
      introText.textContent = state.graphHasData
        ? 'Knowledge graph is ready. Re-index to detect file changes and generate incremental updates.'
        : 'Generate a prompt and send it to your AI to build the enriched knowledge graph.';
    }

    if (!state.graphHasData) {
      const step1Desc = _els.aiStep1Desc;
      const step1Type = _els.aiStep1Type;
      const noChanges = _els.aiNoChanges;
      if (step1Desc) {
        if (state.promptType === 'incremental' && state.pendingChanges) {
          step1Desc.textContent = `Detected ${state.pendingChanges.total} changed files. Generate an incremental update prompt.`;
        } else {
          step1Desc.textContent = 'Generates a full prompt for AI to build the knowledge graph from scratch.';
        }
      }
      if (step1Type) {
        if (state.promptType === 'incremental') {
          step1Type.innerHTML = '<span class="gfy-ai-type-badge gfy-ai-type-incr">Incremental</span>';
          step1Type.style.display = 'flex';
        } else if (state.promptType === 'full') {
          step1Type.innerHTML = '<span class="gfy-ai-type-badge gfy-ai-type-full">Full</span>';
          step1Type.style.display = 'flex';
        } else {
          step1Type.style.display = 'none';
        }
      }
      if (noChanges) {
        noChanges.style.display = state.exportStatus?.noChanges ? 'flex' : 'none';
      }

      if (exportStatus) {
        if (state.exportStatus && !state.exportStatus.noChanges) {
          const s = state.exportStatus;
          exportStatus.innerHTML = `<span class="gfy-export-ok">\u2713 Prompt generated:</span> ${s.stats.files} files, ${s.stats.symbols} symbols`;
          exportStatus.style.display = 'block';
        } else {
          exportStatus.style.display = 'none';
        }
      }
    }

    if (state.graphHasData) {
      const trackingChanges = _els.aiTrackingChanges;
      const trackingGenBtn = _els.aiTrackingGenBtn;
      const trackingSend = _els.aiTrackingSend;

      if (trackingChanges) {
        if (state.exportLoading) {
          trackingChanges.textContent = 'Working\u2026';
        } else if (state.pendingChanges) {
          if (state.pendingChanges.total === 0) {
            trackingChanges.textContent = 'No changes detected';
          } else {
            trackingChanges.textContent = `${state.pendingChanges.total} files changed (${state.pendingChanges.changed} modified, ${state.pendingChanges.new} new)`;
          }
        } else {
          trackingChanges.textContent = 'Run "Re-index Symbols" to detect changes';
        }
      }

      if (trackingGenBtn) {
        if (state.pendingChanges && state.pendingChanges.tooManyChanges) {
          trackingGenBtn.style.display = 'none';
        } else {
          trackingGenBtn.style.display = (state.pendingChanges && state.pendingChanges.total > 0) ? 'inline-flex' : 'none';
        }
      }

      const trackingExportStatus = trackingEl ? trackingEl.querySelector('.gfy-export-status') : null;
      if (trackingExportStatus) {
        if (state.exportStatus && state.exportStatus.promptType === 'incremental' && !state.exportStatus.noChanges) {
          const s = state.exportStatus;
          trackingExportStatus.innerHTML = `<span class="gfy-export-ok">\u2713 Prompt generated:</span> ${s.stats.files} files, ${s.stats.symbols} symbols <span class="gfy-ai-type-badge gfy-ai-type-incr">Incremental</span>`;
          trackingExportStatus.style.display = 'block';
        } else {
          trackingExportStatus.style.display = 'none';
        }
      }

      if (trackingSend) {
        trackingSend.style.display = (state.exportStatus && state.exportStatus.promptType === 'incremental' && !state.exportStatus.noChanges) ? 'flex' : 'none';
      }
    }

    const featuresEl = _els.aiFeatures;
    const conceptsEl = _els.aiConcepts;
    const reportEl = _els.aiReport;

    if (state.aiGraphData) {
      const g = state.aiGraphData;

      if (featuresEl) {
        if (g.features) {
          const featureNames = Object.keys(g.features);
          featuresEl.style.display = 'block';
          featuresEl.innerHTML = '<div class="gfy-ai-section-title">Features (' + featureNames.length + ')</div>' +
            featureNames.map(fname => {
              const feat = g.features[fname];
              return '<div class="gfy-ai-feature-card">' +
                '<div class="gfy-ai-feature-name">' + _esc(fname) + '</div>' +
                '<div class="gfy-ai-feature-summary">' + _esc(feat.summary || '') + '</div>' +
                '<div class="gfy-ai-feature-meta">' + (feat.files ? feat.files.length + ' files' : '') + '</div>' +
                '</div>';
            }).join('');
        } else {
          featuresEl.style.display = 'none';
        }
      }

      if (conceptsEl) {
        if (g.concepts) {
          conceptsEl.style.display = 'block';
          conceptsEl.innerHTML = '<div class="gfy-ai-section-title">Key Concepts (' + Object.keys(g.concepts).length + ')</div>' +
            Object.keys(g.concepts).map(cname => {
              const c = g.concepts[cname];
              return '<div class="gfy-ai-concept-item">' +
                '<span class="gfy-ai-concept-name">' + _esc(cname) + '</span>' +
                '<span class="gfy-ai-concept-desc">' + _esc(c.summary || '') + '</span>' +
                '</div>';
            }).join('');
        } else {
          conceptsEl.style.display = 'none';
        }
      }

      if (reportEl && state.aiGraphReport) {
        reportEl.style.display = 'block';
        reportEl.innerHTML = '<div class="gfy-ai-section-title">Report</div>' +
          '<div class="gfy-ai-report-body">' + _esc(state.aiGraphReport).replace(/\n/g, '<br>') + '</div>';
      }
    } else {
      if (featuresEl) featuresEl.style.display = 'none';
      if (conceptsEl) conceptsEl.style.display = 'none';
      if (reportEl) reportEl.style.display = 'none';
    }

    // Auto-load graph data when AI tab is active and data exists
    if (state.activeTab === 'ai' && state.serverStatus === 'running' && state.graphInfo?.exists && !state.aiGraphData && !state.aiGraphLoading) {
      _handleLoadAiGraph();
    }
  }

  // ── Changes tab ──
  if (state.activeTab === 'changes' && state.serverStatus === 'running' && (!prev || state.activeTab !== prev.activeTab || state.changesLoading !== prev.changesLoading || state.changesError !== prev.changesError || state.changesDetected !== prev.changesDetected || state.incrementalPromptReady !== prev.incrementalPromptReady || state.incrementalPromptPath !== prev.incrementalPromptPath || state.graphSyncStatus !== prev.graphSyncStatus || state.graphSyncLoading !== prev.graphSyncLoading || state.changedFileList !== prev.changedFileList)) {
    var chSpinner = _els.changesSpinner;
    var chError = _els.changesError;
    var chReindexStatus = _els.changesReindexStatus;
    var chDetected = _els.changesDetected;
    var chDetectedInfo = _els.changesDetectedInfo;
    var chGenBtn = _els.changesGenBtn;
    var chGenStatus = _els.changesGenStatus;
    var chSendAiBtn = _els.changesSendAiBtn;
    var chPromptInfo = _els.changesPromptInfo;
    var chPromptPath = _els.changesPromptPath;
    var chSyncStatus = _els.changesSyncStatus;
    var chSyncDetail = _els.changesSyncDetail;
    var chFileList = _els.changesFileList;

    if (chSpinner) chSpinner.style.display = state.changesLoading || state.graphSyncLoading ? 'flex' : 'none';
    if (chError) {
      chError.textContent = state.changesError || '';
      chError.style.display = state.changesError ? 'block' : 'none';
    }

    // Step 1: Re-index status
    if (chReindexStatus) {
      if (state.changesLoading) {
        chReindexStatus.textContent = 'Re-indexing\u2026';
        chReindexStatus.style.display = 'inline';
      } else if (state.changesDetected) {
        chReindexStatus.innerHTML = '<span class="gfy-export-ok">\u2713</span> Done';
        chReindexStatus.style.display = 'inline';
      } else {
        chReindexStatus.style.display = 'none';
      }
    }

    // Step 1: Detected changes info
    if (chDetected && chDetectedInfo) {
      if (state.changesDetected) {
        var cd = state.changesDetected;
        if (cd.total > 0) {
          var parts = [];
          if (cd.changed > 0) parts.push(cd.changed + ' modified');
          if (cd.new > 0) parts.push(cd.new + ' new');
          if (cd.deleted > 0) parts.push(cd.deleted + ' deleted');
          chDetectedInfo.textContent = cd.total + ' file(s) changed (' + parts.join(', ') + ')';
        } else {
          chDetectedInfo.textContent = 'No file changes detected. The index is up to date.';
        }
        chDetected.style.display = 'flex';
      } else {
        chDetected.style.display = 'none';
      }
    }

    // Step 2: Generate button visibility
    if (chGenBtn) {
      chGenBtn.style.display = (state.changesDetected && state.changesDetected.total > 0 && !state.changesLoading) ? 'inline-flex' : 'none';
    }

    // Step 2: Generate status
    if (chGenStatus) {
      if (state.changesLoading && state.changesTabStep !== 'prompt_ready') {
        if (chGenStatus) chGenStatus.textContent = 'Generating\u2026';
        if (chGenStatus) chGenStatus.style.display = 'inline';
      } else if (state.incrementalPromptReady) {
        chGenStatus.innerHTML = '<span class="gfy-export-ok">\u2713</span> Generated';
        chGenStatus.style.display = 'inline';
      } else {
        chGenStatus.style.display = 'none';
      }
    }

    // Step 2: Send to AI button (shown when prompt is ready)
    if (chSendAiBtn) {
      chSendAiBtn.style.display = state.incrementalPromptReady ? 'inline-flex' : 'none';
    }

    // Step 2: Prompt path info
    if (chPromptInfo && chPromptPath) {
      if (state.incrementalPromptPath) {
        chPromptPath.textContent = state.incrementalPromptPath;
        chPromptInfo.style.display = 'flex';
      } else {
        chPromptInfo.style.display = 'none';
      }
    }

    // Step 3: Sync check status
    if (chSyncStatus) {
      if (state.graphSyncLoading) {
        if (chSyncStatus) chSyncStatus.textContent = 'Checking\u2026';
        if (chSyncStatus) chSyncStatus.style.display = 'inline';
      } else if (state.graphSyncStatus) {
        var gs = state.graphSyncStatus;
        if (gs.synced) {
          chSyncStatus.innerHTML = '<span class="gfy-sync-ok">\u2713</span> Graph is in sync';
        } else if (gs.pendingUpdate) {
          chSyncStatus.innerHTML = '<span class="gfy-sync-warn">!</span> Prompt was generated \u2014 send to AI to update the graph';
        } else if (gs.reason === 'no_graph') {
          chSyncStatus.innerHTML = '<span class="gfy-sync-warn">!</span> No graph.json found. Generate and load a graph first.';
        } else if (gs.totalChanged > 0) {
          chSyncStatus.innerHTML = '<span class="gfy-sync-warn">!</span> Graph is out of sync (' + gs.totalChanged + ' file(s) changed)';
        } else {
          chSyncStatus.innerHTML = '<span class="gfy-sync-warn">!</span> Unable to verify';
        }
        chSyncStatus.style.display = 'inline';
      } else {
        chSyncStatus.style.display = 'none';
      }
    }

    // Step 3: Sync detail + file list
    var hasFileList = false;
    if (chSyncDetail) {
      if (state.graphSyncStatus && !state.graphSyncLoading) {
        var gs = state.graphSyncStatus;
        var detailLines = [];
        if (gs.timestamp) detailLines.push('Graph generated: ' + gs.timestamp);
        if (gs.synced) {
          detailLines.push('All files are accounted for in the graph.');
        } else if (gs.pendingUpdate) {
          detailLines.push('Incremental prompt generated but AI has not updated the graph yet. Send the prompt to your AI and load the result.');
        } else if (gs.totalChanged > 0) {
          detailLines.push(gs.totalChanged + ' file(s) changed (' + (gs.changed || 0) + ' modified, ' + (gs.new || 0) + ' new) since the graph was built.');
          hasFileList = true;
        }
        chSyncDetail.textContent = detailLines.join(' \u00B7 ');
        chSyncDetail.style.display = 'block';
      } else {
        chSyncDetail.style.display = 'none';
      }
    }

    // File list
    if (chFileList) {
      if (hasFileList && state.graphSyncStatus) {
        var gs = state.graphSyncStatus;
        var items = [];
        (gs.changedFiles || []).forEach(function(fp) {
          items.push('<div class="gfy-changes-file-item"><span class="gfy-changes-file-badge modified">MOD</span><span class="gfy-changes-file-path">' + _esc(fp) + '</span></div>');
        });
        (gs.newFiles || []).forEach(function(fp) {
          items.push('<div class="gfy-changes-file-item"><span class="gfy-changes-file-badge added">NEW</span><span class="gfy-changes-file-path">' + _esc(fp) + '</span></div>');
        });
        chFileList.innerHTML = items.join('');
        chFileList.style.display = items.length > 0 ? 'flex' : 'none';
      } else {
        chFileList.style.display = 'none';
      }
    }

    // Auto-derive changes tab state from disk on tab activation
    if (state.activeTab === 'changes' && state.serverStatus === 'running' && (!prev || (prev && state.activeTab !== prev.activeTab)) && !state.changesLoading && !state.graphSyncLoading) {
      _handleChangesLoadState();
    }
  }

  // ── Query tab results ──
  if (state.activeTab === 'query' && (!prev || state.pathResult !== prev.pathResult || state.explainResult !== prev.explainResult || state.affectedResult !== prev.affectedResult || state.nodeSearchResults !== prev.nodeSearchResults || state.nodeSearchQuery !== prev.nodeSearchQuery)) {
    const pathResult = _els.queryPathResult;
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

    const explainResult = _els.queryExplainResult;
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

    const affectedResult = _els.queryAffectedResult;
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

    const nodeSearchResults = _els.queryNodeSearchResults;
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

  // ── Endpoint result in right column ──
  var epResult = _els.epResult || _root?.querySelector('#gfyEpResult');
  if (!_els.epResult && epResult) _els.epResult = epResult;
  var otherTabs = epResult?.parentElement?.querySelectorAll('.gfy-tab-content');
  if (epResult && (!prev || state.endpointResultKey !== prev.endpointResultKey || state.activeTab !== prev.activeTab || state.endpointTests !== prev.endpointTests)) {
    if (state.endpointResultKey) {
      var key = state.endpointResultKey;
      var test = state.endpointTests[key];
      var parts = key.split(' ');
      var method = parts[0], path = parts.slice(1).join(' ');
      // Hide tab contents so result fills the column
      if (otherTabs) otherTabs.forEach(function(tc){tc.style.display='none';});
      epResult.style.display = 'flex';
      var titleEl = _els.epResultTitle || epResult.querySelector('#gfyEpResultTitle');
      if (titleEl) titleEl.textContent = method + ' ' + path;
      var resultBody = _els.epResultBody || epResult.querySelector('#gfyEpResultBody');
      if (resultBody) {
        resultBody.innerHTML = _renderEndpointTestContent(key, method, test);
        var execBtn = resultBody.querySelector('.gfy-ep-test-execute-btn');
        if (execBtn) {
          execBtn.addEventListener('click', function(){_handleEndpointTest(key);});
        }
      }
    } else {
      epResult.style.display = 'none';
      // Restore active tab content
      if (otherTabs && state.serverStatus === 'running') {
        var activeEl = epResult.parentElement?.querySelector('.gfy-'+state.activeTab+'-section');
        if (activeEl) activeEl.style.display = 'flex';
      }
    }
  }

  // ── Graph loading/error overlay for query tab ──
  const graphError = _els.graphError;
  if (graphError && (!prev || state.graphError !== prev.graphError)) {
    graphError.textContent = state.graphError || '';
    graphError.style.display = state.graphError ? 'block' : 'none';
  }

  // ── Error ──
  const errEl = _els.errEl;
  if (errEl && (!prev || state.error !== prev.error)) {
    errEl.textContent = state.error || '';
    errEl.style.display = state.error ? 'block' : 'none';
  }

  // ── Loading spinner ──
  const spinner = _els.spinner;
  if (spinner && (!prev || state.loading !== prev.loading)) spinner.style.display = state.loading ? 'flex' : 'none';

  // ── Explanation ──
  const expEl = _els.expEl;
  if (expEl && (!prev || state.explanation !== prev.explanation)) {
    expEl.textContent = state.explanation || '';
    expEl.style.display = state.explanation ? 'block' : 'none';
  }

  // ── Results list ──
  const listEl = _els.listEl;
  if (!listEl) return;

  if (prev && state.loading === prev.loading && state.files === prev.files && state.query === prev.query && state.results === prev.results) {
    return;
  }

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
            <button class="gfy-start-btn" style="display:none">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l12 7-12 7V3z"/></svg>
              <span>Start Server</span>
            </button>
            <button class="gfy-stop-btn" style="display:none">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="5" width="10" height="10" rx="1.5"/></svg>
              Stop Server
            </button>
            <button class="gfy-cancel-btn" style="display:none">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
              <span>Cancel</span>
            </button>
            <button class="gfy-copy-btn" style="display:none" title="Copy API URL to clipboard">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="11" height="13" rx="1.5"/><path d="M8 2h7a1 1 0 0 1 1 1v11"/></svg>
              Copy URL
            </button>
            <button class="gfy-cheatsheet-btn" style="display:none" title="Send cheatsheet to CodeSwamp">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2z"/><path d="M10 8v4"/><path d="M8 10h4"/></svg>
              Cheatsheet
            </button>
            <button class="gfy-index-btn">
              <span class="gfy-index-btn-content">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2"/></svg>
                Index Codebase
              </span>
              <span class="gfy-index-btn-loading" style="display:none">
                <div class="gfy-spinner-ring" style="width:14px;height:14px;border-width:2px"></div>
                Indexing\u2026
              </span>
            </button>
          </div>

          <div class="gfy-info-line" style="display:none"></div>
        </div>

        <div class="gfy-wizard" style="display:none">
          <div class="gfy-wizard-loading">
            <div class="gfy-spinner-ring"></div>
            <span>Checking repository status\u2026</span>
          </div>

          <div class="gfy-wizard-needs-index" style="display:none">
            <div class="gfy-wizard-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
            </div>
            <div class="gfy-wizard-text">
              <strong>Codebase not indexed</strong>
              <span>Index your repository first to enable code intelligence and knowledge graph features.</span>
            </div>
            <button class="gfy-index-btn" style="display:none">
              <span class="gfy-index-btn-content">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2"/></svg>
                Index Codebase
              </span>
              <span class="gfy-index-btn-loading" style="display:none">
                <div class="gfy-spinner-ring" style="width:14px;height:14px;border-width:2px"></div>
                Indexing\u2026
              </span>
            </button>
          </div>

          <div class="gfy-wizard-indexed" style="display:none">
            <div class="gfy-wizard-indexed-header">
              <span class="gfy-wizard-check">&#10003;</span>
              <div class="gfy-wizard-indexed-text">
                <strong>Symbol Index Ready</strong>
                <span class="gfy-wizard-stats-line"></span>
              </div>
            </div>

            <div class="gfy-wizard-steps">
              <div class="gfy-wizard-step">
                <div class="gfy-wizard-step-num">1</div>
                <div class="gfy-wizard-step-body">
                  <div class="gfy-wizard-step-title">Generate AI Prompt</div>
                  <div class="gfy-wizard-step-desc">Creates a detailed prompt for an AI to analyze your codebase and build a semantic knowledge graph.</div>
                  <div class="gfy-ai-step-type" style="display:none"></div>
                  <button class="gfy-export-btn">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 3v10"/><path d="m6 9 4 4 4-4"/><path d="M3 16v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"/></svg>
                    Generate Prompt
                  </button>
                  <div class="gfy-wizard-step-done" style="display:none">
                    <span class="gfy-wizard-step-done-icon">&#10003;</span>
                    <span class="gfy-wizard-step-done-text">Prompt already generated</span>
                  </div>
                  <div class="gfy-ai-no-changes" style="display:none">
                    <span>No file changes detected since last build.</span>
                  </div>
                </div>
              </div>

              <div class="gfy-wizard-step">
                <div class="gfy-wizard-step-num">2</div>
                <div class="gfy-wizard-step-body">
                  <div class="gfy-wizard-step-title">Send to AI</div>
                  <div class="gfy-wizard-step-desc">Send the generated prompt to CodeSwamp, Claude, or ChatGPT for AI labeling.</div>
                  <button class="gfy-send-ai-btn">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2z"/><path d="M10 8v4"/><path d="M8 10h4"/></svg>
                    Send to CodeSwamp
                  </button>
                </div>
              </div>

              <div class="gfy-wizard-step">
                <div class="gfy-wizard-step-num">3</div>
                <div class="gfy-wizard-step-body">
                  <div class="gfy-wizard-step-title">Load AI Graph</div>
                  <div class="gfy-wizard-step-desc">Load the AI-generated graph.json and graph.md into the viewer.</div>
                  <button class="gfy-load-ai-btn">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 3v10"/><path d="m6 9 4 4 4-4"/><path d="M3 16v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"/></svg>
                    Load AI Graph
                  </button>
                  <div class="gfy-wizard-step-waiting" style="display:none">
                    <span class="gfy-wizard-step-waiting-dot"></span>
                    <span class="gfy-wizard-step-waiting-text">AI enrichment not detected yet. Run the prompt with your AI first.</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="gfy-wizard-start-row">
              <button class="gfy-start-btn gfy-start-btn-disabled" disabled>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 3l12 7-12 7V3z"/></svg>
                Generate Graph First
              </button>
              <span class="gfy-wizard-start-hint">The server needs a knowledge graph to run.</span>
            </div>
          </div>

          <div class="gfy-wizard-graph-ready" style="display:none">
            <div class="gfy-checklist">
              <div class="gfy-checklist-item">
                <span class="gfy-checklist-check">&#10003;</span>
                <span class="gfy-checklist-label">Codebase indexed</span>
                <span class="gfy-checklist-meta"></span>
              </div>
              <div class="gfy-checklist-item">
                <span class="gfy-checklist-check">&#10003;</span>
                <span class="gfy-checklist-label">Knowledge graph built</span>
                <span class="gfy-checklist-meta"></span>
              </div>
            </div>
          </div>

          <div class="gfy-wizard-export-status" style="display:none"></div>
          <div class="gfy-wizard-error" style="display:none"></div>
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
            <button class="gfy-tab gfy-tab-active" data-tab="query">Query</button>
            <button class="gfy-tab" data-tab="graph">Graph</button>
            <button class="gfy-tab" data-tab="report">Report</button>
            <button class="gfy-tab" data-tab="ai">AI Graph</button>
            <button class="gfy-tab" data-tab="changes">Changes</button>
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
        <div class="gfy-search-section" style="max-width: 680px; width: 100%; flex: none;">
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
        <div class="gfy-report-spinner" style="display:none">
          <div class="gfy-spinner-ring"></div>
          <span>Loading report\u2026</span>
        </div>
        <div class="gfy-report-error" style="display:none"></div>
        <div class="gfy-report-content"></div>
      </div>

      <!-- AI Graph Tab -->
      <div class="gfy-ai-section gfy-tab-content" style="display:none">
        <div class="gfy-ai-left">
          <div class="gfy-ai-intro">
            <div class="gfy-ai-intro-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M6 15h12"/><path d="M8 15v4"/><path d="M16 15v4"/><path d="M4 19h16"/></svg>
            </div>
            <div class="gfy-ai-intro-text">
              <strong>AI-Powered Semantic Graph</strong>
              <span id="gfyAiIntroText">Generate a prompt, send it to your AI to build the enriched knowledge graph.</span>
            </div>
          </div>

          <div class="gfy-ai-status-bar">
            <div class="gfy-ai-status-item">
              <span class="gfy-ai-status-icon">&#10003;</span>
              <span>Symbol Index</span>
              <span class="gfy-ai-status-meta" id="gfyAiStatusSymbols"></span>
            </div>
            <div class="gfy-ai-status-item">
              <span class="gfy-ai-status-icon" id="gfyAiGraphStatusIcon">&#10003;</span>
              <span>Knowledge Graph</span>
              <span class="gfy-ai-status-meta" id="gfyAiStatusGraph"></span>
            </div>
          </div>

          <div class="gfy-ai-steps" style="display:none">
            <div class="gfy-ai-step">
              <div class="gfy-ai-step-num">1</div>
              <div class="gfy-ai-step-body">
                <div class="gfy-ai-step-title">Generate Prompt</div>
                <div class="gfy-ai-step-desc" id="gfyAiStep1Desc">Generates a prompt for AI to build or update the knowledge graph.</div>
                <div class="gfy-ai-step-type" id="gfyAiStep1Type" style="display:none"></div>
                <button class="gfy-export-btn">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10"/><path d="m6 9 4 4 4-4"/><path d="M3 16v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"/></svg>
                  Generate Prompt
                </button>
                <div class="gfy-export-status" style="display:none"></div>
                <div class="gfy-ai-no-changes" style="display:none">
                  <span>No file changes detected since last build. Re-index first if you made changes.</span>
                </div>
              </div>
            </div>

            <div class="gfy-ai-step">
              <div class="gfy-ai-step-num">2</div>
              <div class="gfy-ai-step-body">
                <div class="gfy-ai-step-title">Send to AI</div>
                <div class="gfy-ai-step-desc">Send the generated prompt to CodeSwamp, Claude, or ChatGPT for enrichment.</div>
                <button class="gfy-send-ai-btn">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2z"/><path d="M10 8v4"/><path d="M8 10h4"/></svg>
                  Send Prompt to CodeSwamp
                </button>
              </div>
            </div>
          </div>

          <div class="gfy-ai-tracking" style="display:none">
            <div class="gfy-ai-tracking-header">
              <div class="gfy-ai-tracking-icon">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v14"/><path d="M3 10h14"/><circle cx="10" cy="10" r="7"/></svg>
              </div>
              <div class="gfy-ai-tracking-title">Incremental Updates</div>
              <div class="gfy-ai-tracking-desc">Re-index to detect file changes, then generate an incremental prompt to update only what changed.</div>
            </div>

            <div class="gfy-ai-tracking-changes">
              <span class="gfy-ai-tracking-changes-label">Changed files:</span>
              <span class="gfy-ai-tracking-changes-value" id="gfyAiTrackingChanges">Scanning\u2026</span>
            </div>

            <div class="gfy-ai-tracking-actions">
              <button class="gfy-tracking-reindex-btn">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2"/></svg>
                Re-index Symbols
              </button>
              <button class="gfy-tracking-gen-btn" style="display:none">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 3v10"/><path d="m6 9 4 4 4-4"/><path d="M3 16v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"/></svg>
                Generate Incremental Prompt
              </button>
            </div>

            <div class="gfy-export-status" style="display:none"></div>

            <div class="gfy-ai-tracking-send" style="display:none">
              <button class="gfy-send-ai-btn">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2z"/><path d="M10 8v4"/><path d="M8 10h4"/></svg>
                Send Prompt to CodeSwamp
              </button>
            </div>
          </div>

          <div class="gfy-ai-spinner" style="display:none">
            <div class="gfy-spinner-ring"></div>
            <span>Loading\u2026</span>
          </div>

          <div class="gfy-ai-error" style="display:none"></div>

          <div class="gfy-ai-features" id="gfyAiFeatures" style="display:none"></div>
          <div class="gfy-ai-concepts" id="gfyAiConcepts" style="display:none"></div>
        </div>

        <div class="gfy-ai-right">
          <div class="gfy-ai-report" id="gfyAiReport" style="display:none"></div>
        </div>
      </div>

        <!-- Changes Tab -->
        <div class="gfy-changes-section gfy-tab-content" style="display:none">
          <div class="gfy-changes-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <div class="gfy-changes-header-text">
              <strong>File Changes</strong>
              <span>Track codebase changes and sync the knowledge graph incrementally.</span>
            </div>
          </div>

          <div class="gfy-changes-spinner" style="display:none">
            <div class="gfy-spinner-ring"></div>
            <span>Working\u2026</span>
          </div>

          <div class="gfy-changes-error" style="display:none"></div>

          <div class="gfy-changes-workflow">

            <!-- Step 1: Re-index -->
            <div class="gfy-changes-step">
              <div class="gfy-changes-step-num">1</div>
              <div class="gfy-changes-step-body">
                <div class="gfy-changes-step-title">Re-index Symbols</div>
                <div class="gfy-changes-step-desc">Rescan your codebase to detect which files have been added, modified, or deleted since the last index.</div>
                <div class="gfy-changes-step-actions">
                  <button class="gfy-changes-reindex-btn">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2"/></svg>
                    Re-index
                  </button>
                  <span class="gfy-changes-reindex-status" style="display:none"></span>
                </div>
                <div class="gfy-changes-detected" style="display:none">
                  <span class="gfy-changes-detected-icon">i</span>
                  <span class="gfy-changes-detected-info"></span>
                </div>
              </div>
            </div>

            <!-- Step 2: Generate Incremental Prompt -->
            <div class="gfy-changes-step">
              <div class="gfy-changes-step-num">2</div>
              <div class="gfy-changes-step-body">
                <div class="gfy-changes-step-title">Generate Incremental Prompt</div>
                <div class="gfy-changes-step-desc">Creates a concise prompt describing only the changed files, for the AI to update the existing graph without reprocessing everything.</div>
                <div class="gfy-changes-step-actions">
                  <button class="gfy-changes-gen-btn" style="display:none">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10"/><path d="m6 9 4 4 4-4"/><path d="M3 16v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"/></svg>
                    Generate Prompt
                  </button>
                  <span class="gfy-changes-gen-status" style="display:none"></span>
                  <button class="gfy-send-ai-btn gfy-changes-send-ai-btn" style="display:none">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2z"/><path d="M10 8v4"/><path d="M8 10h4"/></svg>
                    Send to CodeSwamp
                  </button>
                </div>
                <div class="gfy-changes-prompt-info" style="display:none">
                  <span class="gfy-changes-prompt-path"></span>
                </div>
              </div>
            </div>

            <!-- Step 3: Check Graph Sync -->
            <div class="gfy-changes-step">
              <div class="gfy-changes-step-num">3</div>
              <div class="gfy-changes-step-body">
                <div class="gfy-changes-step-title">Verify Graph Sync</div>
                <div class="gfy-changes-step-desc">Check whether the knowledge graph is up to date with the current state of your codebase.</div>
                <div class="gfy-changes-step-actions">
                  <button class="gfy-changes-check-btn">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10a7 7 0 0 1-14 0"/><path d="M17 10V4"/><path d="M17 4h-6"/></svg>
                    Check Sync
                  </button>
                  <span class="gfy-changes-sync-status" style="display:none"></span>
                </div>
                <div class="gfy-changes-sync-detail" style="display:none"></div>
                <div class="gfy-changes-file-list" style="display:none"></div>
              </div>
            </div>

          </div>
        </div>

        <div class="gfy-ep-result" id="gfyEpResult" style="display:none">
          <div class="gfy-ep-result-header">
            <span class="gfy-ep-result-title" id="gfyEpResultTitle"></span>
            <button class="gfy-ep-result-close-btn">\u2716 Close</button>
          </div>
          <div class="gfy-ep-result-body" id="gfyEpResultBody"></div>
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
