/**
 * renderer/graphify/graphifyUI.js
 * Renders the Graphify panel.
 * Follows the same vanilla JS + innerHTML pattern used in your codebase
 * (e.g. codeswampUI/, symbolIndex/).
 */

import { getState, setState, subscribe } from './graphifyState.js';
import { queryGraphify, checkHealth }    from './graphifyClient.js';

let _root      = null;
let _unsub     = null;
let _debounce  = null;

// ── Mount / Unmount ───────────────────────────────────────────────────────────

export function mount(container) {
  _root = container;
  _root.innerHTML = _template();
  _bindEvents();
  _unsub = subscribe(_render);
  _startServer();
}

export function unmount() {
  if (_unsub) { _unsub(); _unsub = null; }
  if (_debounce) clearTimeout(_debounce);
  _root = null;
}

// ── Server startup ────────────────────────────────────────────────────────────

async function _startServer() {
  try {
    // Tell main process to spawn the graphify server for the active repo
    const repoPath = window.__activeRepoPath || null;
    const result   = await window.electron.ipcRenderer.invoke('graphify:start', repoPath);
    setState({ port: result.port || 3333 });

    // Poll until healthy (server needs ~200ms to init DB)
    let tries = 0;
    const poll = setInterval(async () => {
      tries++;
      const alive = await checkHealth(getState().port);
      if (alive || tries > 20) {
        clearInterval(poll);
        if (!alive) setState({ error: 'Graphify server did not start. Try reopening the panel.' });
      }
    }, 150);
  } catch (err) {
    setState({ error: `Failed to start graphify server: ${err.message}` });
  }
}

// ── Event binding ─────────────────────────────────────────────────────────────

function _bindEvents() {
  const input  = _root.querySelector('.gfy-input');
  const btn    = _root.querySelector('.gfy-search-btn');
  const clear  = _root.querySelector('.gfy-clear-btn');

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _runQuery();
  });

  input.addEventListener('input', () => {
    // Debounced auto-search after 600ms pause
    clearTimeout(_debounce);
    const val = input.value.trim();
    if (val.length < 3) return;
    _debounce = setTimeout(_runQuery, 600);
  });

  btn.addEventListener('click', _runQuery);

  clear.addEventListener('click', () => {
    input.value = '';
    setState({ query: '', files: [], results: [], explanation: '', error: null });
  });
}

async function _runQuery() {
  if (!_root) return;
  const input = _root.querySelector('.gfy-input');
  const query = input.value.trim();
  if (!query) return;

  setState({ query, loading: true, error: null, files: [], results: [], explanation: '' });

  try {
    const { port, query: stateQuery } = getState();
    // Guard: if user typed something else while we were loading, bail
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

// ── Render ────────────────────────────────────────────────────────────────────

function _render(state) {
  if (!_root) return;

  // Loading spinner
  const spinner = _root.querySelector('.gfy-spinner');
  if (spinner) spinner.style.display = state.loading ? 'flex' : 'none';

  // Error
  const errEl = _root.querySelector('.gfy-error');
  if (errEl) {
    errEl.textContent = state.error || '';
    errEl.style.display = state.error ? 'block' : 'none';
  }

  // Explanation
  const expEl = _root.querySelector('.gfy-explanation');
  if (expEl) {
    expEl.textContent = state.explanation || '';
    expEl.style.display = state.explanation ? 'block' : 'none';
  }

  // Results list
  const listEl = _root.querySelector('.gfy-results');
  if (!listEl) return;

  if (!state.loading && state.files.length === 0 && state.query) {
    listEl.innerHTML = `<div class="gfy-empty">No relevant files found.</div>`;
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
          <span class="gfy-filepath">${_esc(dir)}</span>
        </div>
        <div class="gfy-score-bar" title="Relevance: ${pct}%">
          <div class="gfy-score-fill" style="width:${pct}%"></div>
        </div>
        <span class="gfy-score-label">${pct}%</span>
      </div>
    `;
  }).join('');

  // Click to open file (if your app supports openFile)
  listEl.querySelectorAll('.gfy-result-item').forEach(el => {
    el.addEventListener('click', () => {
      const filePath = el.dataset.path;
      if (window.electron?.ipcRenderer) {
        // Adapt this to whatever IPC you use to open files in your app
        window.electron.ipcRenderer.invoke('workspace:openFile', filePath).catch(() => {});
      }
    });
  });
}

// ── Template ──────────────────────────────────────────────────────────────────

function _template() {
  return `
    <div class="gfy-panel">
      <div class="gfy-header">
        <span class="gfy-title">Graphify</span>
        <span class="gfy-subtitle">Find relevant code by question</span>
      </div>

      <div class="gfy-search-bar">
        <input
          class="gfy-input"
          type="text"
          placeholder='e.g. "how does auth work" or "where is payment validated"'
          autocomplete="off"
          spellcheck="false"
        />
        <button class="gfy-search-btn" title="Search">↵</button>
        <button class="gfy-clear-btn" title="Clear">✕</button>
      </div>

      <div class="gfy-spinner" style="display:none">
        <div class="gfy-spinner-dot"></div>
        <span>Searching graph…</span>
      </div>

      <div class="gfy-error" style="display:none"></div>
      <div class="gfy-explanation" style="display:none"></div>

      <div class="gfy-results"></div>
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