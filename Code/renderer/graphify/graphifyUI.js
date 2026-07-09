import { getState, setState, subscribe } from './graphifyState.js';
import { queryGraphify, checkHealth, fetchInfo, fetchEndpoints } from './graphifyClient.js';

let _root      = null;
let _unsub     = null;
let _debounce  = null;

export function mount(container) {
  _root = container;
  _root.innerHTML = _template();
  _bindEvents();
  _unsub = subscribe(_render);
  _render(getState());
}

export function unmount() {
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
}

async function _handleStart() {
  setState({ serverStatus: 'starting', error: null });
  try {
    const result = await window.electronAPI.graphifyStart(window.__activeRepoPath || null);
    if (!result.ok) throw new Error(result.error || 'Failed to start server');
    setState({ port: result.port, serverStatus: 'running' });
    const [info, epData] = await Promise.all([
      fetchInfo(result.port),
      fetchEndpoints(result.port),
    ]);
    if (epData && epData.endpoints) setState({ endpoints: epData.endpoints });
    if (info && !info.error) setState({ serverInfo: info });
  } catch (err) {
    setState({ serverStatus: 'error', error: err.message });
  }
}

async function _handleStop() {
  try {
    await window.electronAPI.graphifyStop();
  } catch {}
  setState({ serverStatus: 'stopped', serverInfo: null, endpoints: null, results: [], files: [], explanation: '', error: null });
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
    endpointsSection.style.display = show ? 'block' : 'none';
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

      <div class="gfy-endpoints-section" style="display:none">
        <div class="gfy-endpoints-label">Available Endpoints</div>
        <div class="gfy-endpoints-list" id="gfyEndpointsList"></div>
      </div>

      <div class="gfy-search-section" style="display:none">
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