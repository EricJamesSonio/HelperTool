/**
 * apiToolUI.js — Swagger-style inline accordion endpoint panels
 * Each endpoint expands inline when clicked — no bottom-scroll required.
 */

import {
    initApiTool, getAllApis, getApi,
    createApi, updateApi, deleteApi,
    addEndpoint, updateEndpoint, deleteEndpoint,
    executeRequest,
} from './apiTool.js';

import { fetchSpec, parseSpec } from './swaggerImport.js';

/* ── State ────────────────────────────────────────────────────── */
let _selectedApiId     = null;
let _expandedEndpoints = new Set(); // IDs of currently expanded endpoint panels
let _panelOpen         = false;

/* ── DOM Refs ─────────────────────────────────────────────────── */
let panel, apiList, testPanel;
let apiNameInput, apiUrlInput;

/* ── Swagger import state ─────────────────────────────────────── */
let _swOverlay         = null;
let _swParsedEndpoints = [];
let _swChecked         = new Set();

/* ═══════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════ */
export async function initApiToolUI() {
    await initApiTool();
    _injectPanel();
    _resolveRefs();
    _wireEvents();
}
export function toggleApiToolPanel() {
    if (_panelOpen) closeApiToolPanel(); else openApiToolPanel();
}
export function openApiToolPanel() {
    if (!panel) { _injectPanel(); _resolveRefs(); _wireEvents(); }
    _panelOpen = true;
    panel.classList.add('at-visible');
    _renderApiList();
}
export function closeApiToolPanel() {
    _panelOpen = false;
    panel?.classList.remove('at-visible');
}
export function isApiToolPanelOpen() { return _panelOpen; }

/* ═══════════════════════════════════════════════════════════════
   INJECT HTML
   ═══════════════════════════════════════════════════════════════ */
function _injectPanel() {
    if (document.getElementById('apiToolPanel')) return;
    const el = document.createElement('div');
    el.id = 'apiToolPanel';
    el.className = 'at-panel';
    el.innerHTML = `
<div class="at-backdrop"></div>
<div class="at-container">
  <div class="at-header">
    <div class="at-header-title"><span class="at-header-icon">🔌</span>API Tool</div>
    <button class="at-close-btn" id="atCloseBtn" title="Close">✕</button>
  </div>

  <div class="at-main">
    <!-- LEFT sidebar -->
    <div class="at-sidebar">
      <div class="at-sidebar-header"><span class="at-sidebar-title">Saved APIs</span></div>
      <div class="at-add-form">
        <input type="text" id="atAddApiName" class="at-input at-input-sm" placeholder="API name" maxlength="40" />
        <input type="url" id="atAddApiUrl"  class="at-input at-input-sm" placeholder="http://127.0.0.1:8000" />
        <button id="atAddApiBtn" class="at-btn at-btn-sm at-btn-accent">＋ Add API</button>
      </div>
      <div id="atApiList" class="at-list"></div>
    </div>

    <!-- RIGHT panel -->
    <div class="at-test-panel">
      <div id="atEmptyTest" class="at-empty">
        <div class="at-empty-icon">🔌</div>
        <div class="at-empty-text">Select an API to begin testing</div>
      </div>

      <div id="atTestUI" class="at-test-ui" style="display:none">
        <!-- API config bar -->
        <div class="at-api-config">
          <div class="at-config-row">
            <input type="text" id="atApiName" class="at-input at-input-sm" placeholder="API name" />
            <input type="url"  id="atApiUrl"  class="at-input at-input-sm" placeholder="http://127.0.0.1:8000" />
          </div>
          <div class="at-config-row">
            <button id="atApiSaveBtn"   class="at-btn at-btn-xs at-btn-primary">✓ Save</button>
            <button id="atApiDeleteBtn" class="at-btn at-btn-xs at-btn-danger">🗑 Delete</button>
          </div>
        </div>

        <!-- Endpoints header -->
        <div class="at-endpoints-header">
          <div class="at-endpoints-header-left">
            <span class="at-endpoints-title">Endpoints</span>
            <span id="atEndpointCountBadge" class="at-count-badge">0</span>
          </div>
          <div style="display:flex;gap:6px">
            <button id="atImportSwaggerBtn" class="at-btn at-btn-xs at-btn-ghost" title="Import from Swagger/OpenAPI">⚡ Import Swagger</button>
            <button id="atAddEndpointBtn"   class="at-btn at-btn-xs at-btn-accent">＋ New Endpoint</button>
          </div>
        </div>

        <!-- Scrollable endpoint accordion list -->
        <div id="atEndpointsList" class="at-endpoints-accordion"></div>
      </div>
    </div>
  </div>
</div>`;
    document.body.appendChild(el);
    _injectSwaggerModal();
    _injectAccordionStyles();
}

/* ═══════════════════════════════════════════════════════════════
   INJECT ACCORDION STYLES (inline — no extra CSS file needed)
   ═══════════════════════════════════════════════════════════════ */
function _injectAccordionStyles() {
    if (document.getElementById('at-accordion-styles')) return;
    const style = document.createElement('style');
    style.id = 'at-accordion-styles';
    style.textContent = `
/* ── Accordion container ── */
.at-endpoints-accordion {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 12px 24px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.at-endpoints-accordion::-webkit-scrollbar { width: 5px; }
.at-endpoints-accordion::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 99px; }

/* ── Endpoints header ── */
.at-endpoints-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
}
.at-endpoints-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
}
.at-endpoints-title {
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-secondary);
}
.at-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 18px;
    padding: 0 6px;
    background: var(--accent-dim);
    border: 1px solid var(--accent-border);
    border-radius: 99px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    color: var(--accent);
}

/* ── Test UI layout ── */
.at-test-ui {
    display: flex !important;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

/* ── Accordion item ── */
.at-accordion-item {
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    overflow: hidden;
    background: var(--bg-surface);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.at-accordion-item:hover {
    border-color: var(--border-default);
}
.at-accordion-item.is-expanded {
    border-color: var(--border-strong);
    box-shadow: 0 2px 12px rgba(0,0,0,0.25);
}

/* ── Accordion summary row (clickable header) ── */
.at-accordion-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    cursor: pointer;
    user-select: none;
    background: var(--bg-surface);
    transition: background 0.12s ease;
    position: relative;
}
.at-accordion-item.is-expanded .at-accordion-summary {
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-subtle);
}
.at-accordion-summary:hover { background: var(--bg-hover); }
.at-accordion-item.is-expanded .at-accordion-summary:hover { background: var(--bg-elevated); }

/* Method pill */
.at-acc-method {
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 4px;
    flex-shrink: 0;
    min-width: 52px;
    text-align: center;
    letter-spacing: 0.04em;
}
.at-acc-method-get    { background: rgba(96,165,250,0.15);  color: #60a5fa; border: 1px solid rgba(96,165,250,0.35); }
.at-acc-method-post   { background: rgba(52,211,153,0.15);  color: #34d399; border: 1px solid rgba(52,211,153,0.35); }
.at-acc-method-put    { background: rgba(167,139,250,0.15); color: #a78bfa; border: 1px solid rgba(167,139,250,0.35); }
.at-acc-method-patch  { background: rgba(251,191,36,0.15);  color: #fbbf24; border: 1px solid rgba(251,191,36,0.35); }
.at-acc-method-delete { background: rgba(248,113,113,0.15); color: #f87171; border: 1px solid rgba(248,113,113,0.35); }
.at-acc-method-head   { background: rgba(240,180,41,0.15);  color: #f0b429; border: 1px solid rgba(240,180,41,0.35); }

/* Path + description */
.at-acc-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.at-acc-path {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.at-acc-desc {
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Last used badge */
.at-acc-last-used {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-faint);
    flex-shrink: 0;
    white-space: nowrap;
}

/* Expand chevron */
.at-acc-chevron {
    font-size: 10px;
    color: var(--text-muted);
    transition: transform 0.2s ease;
    flex-shrink: 0;
    margin-left: 4px;
}
.at-accordion-item.is-expanded .at-acc-chevron { transform: rotate(90deg); color: var(--accent); }

/* Delete button inside summary */
.at-acc-delete {
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: 1px solid transparent;
    border-radius: 4px; color: var(--text-faint); font-size: 13px;
    cursor: pointer; flex-shrink: 0; transition: all 0.12s ease;
    opacity: 0;
}
.at-accordion-summary:hover .at-acc-delete { opacity: 1; }
.at-acc-delete:hover { background: var(--red-dim); border-color: var(--red); color: var(--red); }

/* ── Accordion body (the request builder) ── */
.at-accordion-body {
    display: none;
    flex-direction: column;
    background: var(--bg-base);
}
.at-accordion-item.is-expanded .at-accordion-body {
    display: flex;
}

/* Inline form sections */
.at-inline-form {
    display: flex;
    flex-direction: column;
    gap: 0;
}

/* Request URL bar */
.at-req-url-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-subtle);
}
.at-req-url-preview {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-base);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-sm);
    padding: 6px 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.at-req-url-preview span { color: var(--accent); }

/* Edit form */
.at-edit-form {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-surface);
}
.at-edit-row {
    display: flex;
    gap: 8px;
    align-items: center;
}
.at-edit-row label {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-muted);
    flex-shrink: 0;
    width: 72px;
}

/* Tabs inside accordion */
.at-inline-tabs {
    display: flex;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-subtle);
}
.at-inline-tab {
    padding: 8px 14px;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
    white-space: nowrap;
    position: relative;
}
.at-inline-tab:hover { color: var(--text-primary); }
.at-inline-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.at-inline-tab .at-tab-dot {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--accent);
    margin-left: 5px;
    vertical-align: middle;
}

/* Tab content panels */
.at-inline-tab-content { display: none; padding: 12px 14px; }
.at-inline-tab-content.active { display: block; }

/* KV rows */
.at-kv-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.at-kv-row { display: flex; gap: 6px; align-items: center; }
.at-kv-row input { flex: 1; height: 30px; }

/* Textarea inside accordion */
.at-inline-textarea {
    width: 100%;
    min-height: 100px;
    padding: 8px 10px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border-default);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.6;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.12s ease;
}
.at-inline-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.at-inline-textarea::placeholder { color: var(--text-faint); }

/* Action bar */
.at-inline-actions {
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    background: var(--bg-elevated);
    border-top: 1px solid var(--border-subtle);
    align-items: center;
}
.at-send-btn-inline {
    margin-left: auto;
}

/* ── Response panel inside accordion ── */
.at-inline-response {
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-base);
}
.at-response-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-subtle);
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
}
.at-response-status-pill {
    padding: 2px 10px;
    border-radius: 99px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
}
.at-status-ok   { background: rgba(52,211,153,0.18); color: var(--green); border: 1px solid rgba(52,211,153,0.35); }
.at-status-err  { background: rgba(248,113,113,0.18); color: var(--red);   border: 1px solid rgba(248,113,113,0.35); }
.at-status-info { background: rgba(96,165,250,0.18);  color: var(--blue);  border: 1px solid rgba(96,165,250,0.35); }
.at-response-body-wrap {
    max-height: 280px;
    overflow-y: auto;
    padding: 12px 14px;
}
.at-response-body-wrap::-webkit-scrollbar { width: 4px; }
.at-response-body-wrap::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 99px; }
.at-response-body-wrap pre {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-primary);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
}
.at-response-error-box {
    padding: 12px 14px;
    background: rgba(248,113,113,0.08);
    border-top: 1px solid rgba(248,113,113,0.25);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--red);
    line-height: 1.6;
}

/* Empty state */
.at-endpoints-empty {
    padding: 40px 20px;
    text-align: center;
    font-family: var(--font-ui);
    font-size: 13px;
    color: var(--text-muted);
    font-style: italic;
}
`;
    document.head.appendChild(style);
}

/* ═══════════════════════════════════════════════════════════════
   SWAGGER IMPORT MODAL (unchanged from original)
   ═══════════════════════════════════════════════════════════════ */
function _injectSwaggerModal() {
    const el = document.createElement('div');
    el.id = 'swOverlay';
    el.className = 'sw-overlay';
    el.innerHTML = `
<div class="sw-modal">
  <div class="sw-header">
    <div class="sw-title"><span class="sw-title-icon">⚡</span>Import from Swagger / OpenAPI</div>
    <button class="sw-close" id="swCloseBtn">✕</button>
  </div>
  <div class="sw-body">
    <div>
      <div class="sw-step-label">Spec URL</div>
      <div class="sw-url-row">
        <input type="url" id="swUrlInput" class="sw-url-input" placeholder="http://127.0.0.1:8000/openapi.json" />
        <button id="swFetchBtn" class="at-btn at-btn-accent">Fetch</button>
      </div>
      <div class="sw-hint">
        Common paths: <code>/openapi.json</code> (FastAPI) · <code>/api-docs</code> (Swagger UI) ·
        <code>/swagger.json</code> · <code>/v2/api-docs</code> (Spring)
      </div>
    </div>
    <div id="swStatus" class="sw-status"></div>
    <hr class="sw-divider" id="swDivider" style="display:none">
    <div id="swPreview" class="sw-preview">
      <div class="sw-preview-toolbar">
        <div class="sw-preview-count">Found <span id="swFoundCount">0</span> endpoints —
          <span id="swSelectedCount">0</span> selected</div>
        <button id="swSelectAllBtn"  class="at-btn at-btn-xs at-btn-ghost">Select All</button>
        <button id="swSelectNoneBtn" class="at-btn at-btn-xs at-btn-ghost">None</button>
      </div>
      <div id="swEndpointList" class="sw-endpoint-list"></div>
    </div>
  </div>
  <div class="sw-footer">
    <span class="sw-mode-label">Import mode:</span>
    <button id="swModeMerge"   class="sw-mode-btn sw-mode-btn--active" data-mode="merge">Merge</button>
    <button id="swModeReplace" class="sw-mode-btn" data-mode="replace">Replace</button>
    <div style="flex:1"></div>
    <button id="swCancelBtn" class="at-btn at-btn-ghost">Cancel</button>
    <button id="swImportBtn" class="at-btn at-btn-primary" disabled>⚡ Import Selected</button>
  </div>
</div>`;
    document.body.appendChild(el);
    _swOverlay = el;
    _wireSwaggerEvents();
}

function _wireSwaggerEvents() {
    document.getElementById('swCloseBtn').addEventListener('click', _closeSwagger);
    document.getElementById('swCancelBtn').addEventListener('click', _closeSwagger);
    _swOverlay.addEventListener('click', e => { if (e.target === _swOverlay) _closeSwagger(); });
    document.getElementById('swFetchBtn').addEventListener('click', _handleSwaggerFetch);
    document.getElementById('swUrlInput').addEventListener('keydown', e => { if (e.key === 'Enter') _handleSwaggerFetch(); });
    document.getElementById('swSelectAllBtn').addEventListener('click', () => {
        _swChecked = new Set(_swParsedEndpoints.map((_, i) => i));
        _renderSwaggerPreview();
    });
    document.getElementById('swSelectNoneBtn').addEventListener('click', () => {
        _swChecked.clear(); _renderSwaggerPreview();
    });
    document.querySelectorAll('.sw-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sw-mode-btn').forEach(b => b.classList.remove('sw-mode-btn--active'));
            btn.classList.add('sw-mode-btn--active');
        });
    });
    document.getElementById('swImportBtn').addEventListener('click', _handleSwaggerImport);
}

function _openSwagger() {
    const api = getApi(_selectedApiId);
    if (api?.url) {
        document.getElementById('swUrlInput').value = api.url.replace(/\/$/, '') + '/openapi.json';
    }
    _swParsedEndpoints = []; _swChecked = new Set();
    document.getElementById('swStatus').className = 'sw-status';
    document.getElementById('swStatus').textContent = '';
    document.getElementById('swDivider').style.display = 'none';
    document.getElementById('swPreview').classList.remove('sw-preview--visible');
    document.getElementById('swImportBtn').disabled = true;
    _swOverlay.classList.add('sw-visible');
}

function _closeSwagger() { _swOverlay.classList.remove('sw-visible'); }

async function _handleSwaggerFetch() {
    const url = document.getElementById('swUrlInput').value.trim();
    if (!url) return;
    const statusEl = document.getElementById('swStatus');
    const fetchBtn = document.getElementById('swFetchBtn');
    statusEl.className = 'sw-status sw-status--loading';
    statusEl.innerHTML = '<div class="sw-spinner"></div> Fetching spec…';
    fetchBtn.disabled = true;
    document.getElementById('swDivider').style.display = 'none';
    document.getElementById('swPreview').classList.remove('sw-preview--visible');
    document.getElementById('swImportBtn').disabled = true;
    try {
        const spec = await fetchSpec(url);
        _swParsedEndpoints = parseSpec(spec);
        if (_swParsedEndpoints.length === 0) {
            statusEl.className = 'sw-status sw-status--error';
            statusEl.textContent = '⚠️ Spec parsed but no endpoints found.';
            return;
        }
        _swChecked = new Set(_swParsedEndpoints.map((_, i) => i));
        statusEl.className = 'sw-status sw-status--success';
        statusEl.innerHTML = `✅ Loaded spec — found <strong>${_swParsedEndpoints.length}</strong> endpoints`;
        document.getElementById('swDivider').style.display = 'block';
        document.getElementById('swPreview').classList.add('sw-preview--visible');
        document.getElementById('swImportBtn').disabled = false;
        _renderSwaggerPreview();
    } catch (err) {
        statusEl.className = 'sw-status sw-status--error';
        statusEl.textContent = `❌ ${err.message}`;
    } finally { fetchBtn.disabled = false; }
}

function _renderSwaggerPreview() {
    const list = document.getElementById('swEndpointList');
    const METHOD_COLORS = { GET:'at-method-get', POST:'at-method-post', PUT:'at-method-put', PATCH:'at-method-patch', DELETE:'at-method-delete', HEAD:'at-method-head' };
    list.innerHTML = '';
    _swParsedEndpoints.forEach((ep, i) => {
        const checked = _swChecked.has(i);
        const row = document.createElement('div');
        row.className = 'sw-ep-row' + (checked ? ' sw-ep-row--checked' : '');
        row.innerHTML = `
<div class="sw-ep-check">${checked ? '✓' : ''}</div>
<div class="sw-ep-method at-endpoint-method ${METHOD_COLORS[ep.method] || ''}">${ep.method}</div>
<div class="sw-ep-path">${ep.path}</div>
<div class="sw-ep-desc">${ep.description || ''}</div>`;
        row.addEventListener('click', () => {
            if (_swChecked.has(i)) _swChecked.delete(i); else _swChecked.add(i);
            _renderSwaggerPreview();
        });
        list.appendChild(row);
    });
    document.getElementById('swFoundCount').textContent = _swParsedEndpoints.length;
    document.getElementById('swSelectedCount').textContent = _swChecked.size;
    document.getElementById('swImportBtn').disabled = _swChecked.size === 0;
}

async function _handleSwaggerImport() {
    const mode = document.querySelector('.sw-mode-btn--active')?.dataset.mode || 'merge';
    const toImport = _swParsedEndpoints.filter((_, i) => _swChecked.has(i));
    if (toImport.length === 0) return;
    if (mode === 'replace') {
        const api = getApi(_selectedApiId);
        if (api) for (const ep of [...api.endpoints]) await deleteEndpoint(_selectedApiId, ep.id);
    }
    for (const ep of toImport) {
        await addEndpoint(_selectedApiId, ep.method, ep.path, ep.description);
        const api = getApi(_selectedApiId);
        const newEp = api.endpoints[api.endpoints.length - 1];
        if (newEp) await updateEndpoint(_selectedApiId, newEp.id, ep.method, ep.path, ep.description, ep.headers, ep.body, ep.params);
    }
    _closeSwagger();
    _renderEndpointsList();
}

/* ═══════════════════════════════════════════════════════════════
   RESOLVE REFS + WIRE MAIN EVENTS
   ═══════════════════════════════════════════════════════════════ */
function _resolveRefs() {
    panel       = document.getElementById('apiToolPanel');
    apiList     = document.getElementById('atApiList');
    testPanel   = document.getElementById('atTestUI');
    apiNameInput = document.getElementById('atAddApiName');
    apiUrlInput  = document.getElementById('atAddApiUrl');
}

function _wireEvents() {
    document.getElementById('atCloseBtn')?.addEventListener('click', closeApiToolPanel);
    panel?.addEventListener('click', e => { if (e.target === panel) closeApiToolPanel(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && _panelOpen) closeApiToolPanel(); });

    document.getElementById('atAddApiBtn')?.addEventListener('click', _handleAddApi);
    document.getElementById('atAddApiName')?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleAddApi(); });
    document.getElementById('atApiSaveBtn')?.addEventListener('click', _handleSaveApiConfig);
    document.getElementById('atApiDeleteBtn')?.addEventListener('click', _handleDeleteApi);
    document.getElementById('atAddEndpointBtn')?.addEventListener('click', _handleAddEndpoint);
    document.getElementById('atImportSwaggerBtn')?.addEventListener('click', _openSwagger);
    document.querySelector('.at-backdrop')?.addEventListener('click', closeApiToolPanel);
}

/* ═══════════════════════════════════════════════════════════════
   RENDER HELPERS
   ═══════════════════════════════════════════════════════════════ */
function _renderApiList() {
    const apis = getAllApis();
    apiList.innerHTML = '';
    if (apis.length === 0) {
        apiList.innerHTML = '<div class="at-empty-list">No APIs saved yet</div>';
        return;
    }
    apis.forEach(api => {
        const item = document.createElement('div');
        item.className = 'at-api-item' + (_selectedApiId === api.id ? ' active' : '');
        item.innerHTML = `
<div class="at-api-item-info">
  <div class="at-api-item-name">${api.name}</div>
  <div class="at-api-item-meta">${api.url}</div>
</div>
<div class="at-api-item-count">${api.endpoints.length}</div>`;
        item.addEventListener('click', () => _selectApi(api.id));
        apiList.appendChild(item);
    });
}

function _selectApi(apiId) {
    _selectedApiId = apiId;
    _expandedEndpoints.clear();
    _renderApiList();
    document.getElementById('atEmptyTest').style.display = 'none';
    testPanel.style.display = 'flex';
    _renderApiConfig();
    _renderEndpointsList();
}

function _renderApiConfig() {
    const api = getApi(_selectedApiId);
    if (!api) return;
    document.getElementById('atApiName').value = api.name;
    document.getElementById('atApiUrl').value  = api.url;
}

/* ═══════════════════════════════════════════════════════════════
   ACCORDION ENDPOINT LIST
   ═══════════════════════════════════════════════════════════════ */
function _renderEndpointsList() {
    const api = getApi(_selectedApiId);
    if (!api) return;

    const list = document.getElementById('atEndpointsList');
    list.innerHTML = '';

    // Update count badge
    const badge = document.getElementById('atEndpointCountBadge');
    if (badge) badge.textContent = api.endpoints.length;

    if (api.endpoints.length === 0) {
        list.innerHTML = '<div class="at-endpoints-empty">No endpoints yet — add manually or import from Swagger</div>';
        return;
    }

    api.endpoints.forEach(endpoint => {
        const item = _buildAccordionItem(api, endpoint);
        list.appendChild(item);
    });
}

function _buildAccordionItem(api, endpoint) {
    const isExpanded = _expandedEndpoints.has(endpoint.id);
    const method = endpoint.method.toLowerCase();

    const item = document.createElement('div');
    item.className = 'at-accordion-item' + (isExpanded ? ' is-expanded' : '');
    item.dataset.endpointId = endpoint.id;

    // ── Summary row ──
    const summary = document.createElement('div');
    summary.className = 'at-accordion-summary';
    summary.innerHTML = `
<span class="at-acc-method at-acc-method-${method}">${endpoint.method}</span>
<div class="at-acc-info">
  <div class="at-acc-path">${endpoint.path}</div>
  ${endpoint.description ? `<div class="at-acc-desc">${endpoint.description}</div>` : ''}
</div>
${endpoint.lastUsed ? `<span class="at-acc-last-used">${_relativeTime(endpoint.lastUsed)}</span>` : ''}
<span class="at-acc-chevron">▶</span>
<button class="at-acc-delete" title="Delete endpoint">✕</button>`;

    summary.querySelector('.at-acc-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this endpoint?')) return;
        await deleteEndpoint(_selectedApiId, endpoint.id);
        _expandedEndpoints.delete(endpoint.id);
        _renderEndpointsList();
        _renderApiList();
    });

    summary.addEventListener('click', (e) => {
        if (e.target.classList.contains('at-acc-delete')) return;
        _toggleAccordion(item, endpoint.id);
    });

    item.appendChild(summary);

    // ── Body (request builder) ──
    if (isExpanded) {
        const body = _buildAccordionBody(api, endpoint);
        item.appendChild(body);
    }

    return item;
}

function _toggleAccordion(item, endpointId) {
    if (_expandedEndpoints.has(endpointId)) {
        _expandedEndpoints.delete(endpointId);
        item.classList.remove('is-expanded');
        item.querySelector('.at-accordion-body')?.remove();
    } else {
        _expandedEndpoints.add(endpointId);
        item.classList.add('is-expanded');
        const api      = getApi(_selectedApiId);
        const endpoint = api?.endpoints.find(e => e.id === endpointId);
        if (endpoint) {
            const body = _buildAccordionBody(api, endpoint);
            item.appendChild(body);
            // Smooth scroll so the expanded panel is visible
            setTimeout(() => {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 60);
        }
    }
}

function _buildAccordionBody(api, endpoint) {
    const body = document.createElement('div');
    body.className = 'at-accordion-body at-inline-form';

    const fullUrl = `${api.url.replace(/\/$/, '')}${endpoint.path.startsWith('/') ? '' : '/'}${endpoint.path}`;

    body.innerHTML = `
<!-- URL preview bar -->
<div class="at-req-url-bar">
  <div class="at-req-url-preview"><span>${endpoint.method}</span> ${fullUrl}</div>
  <button class="at-btn at-btn-primary at-btn-sm at-send-now-btn">▶ Send</button>
</div>

<!-- Edit fields -->
<div class="at-edit-form">
  <div class="at-edit-row">
    <label>Method</label>
    <select class="at-input at-input-sm at-method-select" style="width:90px">
      <option${endpoint.method==='GET'?' selected':''}>GET</option>
      <option${endpoint.method==='POST'?' selected':''}>POST</option>
      <option${endpoint.method==='PUT'?' selected':''}>PUT</option>
      <option${endpoint.method==='PATCH'?' selected':''}>PATCH</option>
      <option${endpoint.method==='DELETE'?' selected':''}>DELETE</option>
      <option${endpoint.method==='HEAD'?' selected':''}>HEAD</option>
    </select>
  </div>
  <div class="at-edit-row">
    <label>Path</label>
    <input type="text" class="at-input at-input-sm at-path-input" style="flex:1" value="${endpoint.path}" placeholder="/api/endpoint" />
  </div>
  <div class="at-edit-row">
    <label>Desc</label>
    <input type="text" class="at-input at-input-sm at-desc-input" style="flex:1" value="${endpoint.description || ''}" placeholder="Description (optional)" />
  </div>
</div>

<!-- Tabs -->
<div class="at-inline-tabs">
  <button class="at-inline-tab active" data-tab="headers">
    Headers${Object.keys(endpoint.headers||{}).length > 0 ? '<span class="at-tab-dot"></span>' : ''}
  </button>
  <button class="at-inline-tab" data-tab="body">
    Body${(endpoint.body||'').trim().length > 0 ? '<span class="at-tab-dot"></span>' : ''}
  </button>
  <button class="at-inline-tab" data-tab="params">
    Params${Object.keys(endpoint.params||{}).length > 0 ? '<span class="at-tab-dot"></span>' : ''}
  </button>
</div>

<!-- Headers tab -->
<div class="at-inline-tab-content active" data-tab-content="headers">
  <div class="at-kv-list at-headers-list">${_buildKVRows(endpoint.headers || {})}</div>
  <button class="at-btn at-btn-xs at-btn-ghost at-add-header-btn">+ Header</button>
</div>

<!-- Body tab -->
<div class="at-inline-tab-content" data-tab-content="body">
  <textarea class="at-inline-textarea at-body-input" placeholder='{"key": "value"}'>${endpoint.body || ''}</textarea>
</div>

<!-- Params tab -->
<div class="at-inline-tab-content" data-tab-content="params">
  <div class="at-kv-list at-params-list">${_buildKVRows(endpoint.params || {})}</div>
  <button class="at-btn at-btn-xs at-btn-ghost at-add-param-btn">+ Param</button>
</div>

<!-- Action bar -->
<div class="at-inline-actions">
  <button class="at-btn at-btn-accent at-btn-sm at-save-ep-btn">💾 Save</button>
  <button class="at-btn at-btn-ghost at-btn-sm at-discard-btn">Discard</button>
  <button class="at-btn at-btn-primary at-btn-sm at-send-now-btn at-send-btn-inline">▶ Send Request</button>
</div>

<!-- Response area (hidden until response received) -->
<div class="at-inline-response" style="display:none"></div>
`;

    // Wire tab switching
    body.querySelectorAll('.at-inline-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            body.querySelectorAll('.at-inline-tab').forEach(t => t.classList.remove('active'));
            body.querySelectorAll('.at-inline-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            body.querySelector(`[data-tab-content="${tab.dataset.tab}"]`).classList.add('active');
        });
    });

    // Wire add header/param
    body.querySelector('.at-add-header-btn').addEventListener('click', () => {
        body.querySelector('.at-headers-list').insertAdjacentHTML('beforeend', _kvRowHTML());
    });
    body.querySelector('.at-add-param-btn').addEventListener('click', () => {
        body.querySelector('.at-params-list').insertAdjacentHTML('beforeend', _kvRowHTML());
    });

    // Remove kv row via delegation
    body.addEventListener('click', e => {
        if (e.target.classList.contains('at-kv-remove')) {
            e.target.closest('.at-kv-row').remove();
        }
    });

    // Wire method select — update URL preview & summary badge live
    const methodSelect = body.querySelector('.at-method-select');
    const pathInput    = body.querySelector('.at-path-input');
    const urlPreview   = body.querySelector('.at-req-url-preview');

    const refreshPreview = () => {
        const m    = methodSelect.value;
        const p    = pathInput.value;
        const base = api.url.replace(/\/$/, '');
        const path = p.startsWith('/') ? p : '/' + p;
        urlPreview.innerHTML = `<span>${m}</span> ${base}${path}`;
    };
    methodSelect.addEventListener('change', refreshPreview);
    pathInput.addEventListener('input', refreshPreview);

    // Wire save
    body.querySelector('.at-save-ep-btn').addEventListener('click', async () => {
        const method      = methodSelect.value;
        const path        = pathInput.value.trim();
        const description = body.querySelector('.at-desc-input').value.trim();
        if (!path) { pathInput.focus(); return; }
        await updateEndpoint(
            _selectedApiId, endpoint.id,
            method, path, description,
            _getKVFromList(body.querySelector('.at-headers-list')),
            body.querySelector('.at-body-input').value,
            _getKVFromList(body.querySelector('.at-params-list'))
        );
        _renderEndpointsList();
        _renderApiList();
        // Re-expand this endpoint
        _expandedEndpoints.add(endpoint.id);
        setTimeout(() => {
            const newItem = document.querySelector(`[data-endpoint-id="${endpoint.id}"]`);
            if (newItem) {
                newItem.classList.add('is-expanded');
                const newApi = getApi(_selectedApiId);
                const newEp  = newApi?.endpoints.find(e => e.id === endpoint.id);
                if (newEp) newItem.appendChild(_buildAccordionBody(newApi, newEp));
            }
        }, 50);
    });

    // Wire discard
    body.querySelector('.at-discard-btn').addEventListener('click', () => {
        _expandedEndpoints.delete(endpoint.id);
        _renderEndpointsList();
    });

    // Wire send (both buttons)
    body.querySelectorAll('.at-send-now-btn').forEach(btn => {
        btn.addEventListener('click', () => _handleSendInline(api, endpoint, body));
    });

    return body;
}

/* ── KV helpers ── */
function _buildKVRows(obj) {
    return Object.entries(obj).map(([k, v]) => _kvRowHTML(k, v)).join('');
}
function _kvRowHTML(key = '', value = '') {
    return `<div class="at-kv-row">
  <input type="text" class="at-input at-input-xs" placeholder="Key"   value="${_esc(key)}" />
  <input type="text" class="at-input at-input-xs" placeholder="Value" value="${_esc(value)}" />
  <button class="at-btn at-btn-xs at-btn-danger at-kv-remove" title="Remove">✕</button>
</div>`;
}
function _getKVFromList(listEl) {
    const result = {};
    listEl?.querySelectorAll('.at-kv-row').forEach(row => {
        const inputs = row.querySelectorAll('input');
        const k = inputs[0]?.value.trim();
        const v = inputs[1]?.value.trim();
        if (k) result[k] = v || '';
    });
    return result;
}
function _esc(str) { return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

/* ── Inline send ── */
async function _handleSendInline(api, endpoint, bodyEl) {
    const sendBtns = bodyEl.querySelectorAll('.at-send-now-btn');
    sendBtns.forEach(b => { b.disabled = true; b.textContent = '⏳ Sending…'; });

    const responseArea = bodyEl.querySelector('.at-inline-response');
    responseArea.style.display = 'none';

    try {
        const response = await executeRequest(_selectedApiId, endpoint.id);
        _displayInlineResponse(response, responseArea, api, endpoint);
    } catch (err) {
        responseArea.style.display = 'block';
        responseArea.innerHTML = `<div class="at-response-error-box">❌ ${err.message}</div>`;
    } finally {
        sendBtns.forEach(b => { b.disabled = false; b.textContent = '▶ Send'; });
        sendBtns[sendBtns.length - 1].textContent = '▶ Send Request';
    }

    // Also re-render summary to update last-used time
    const item = bodyEl.closest('.at-accordion-item');
    if (item) {
        const updatedApi = getApi(_selectedApiId);
        const updatedEp  = updatedApi?.endpoints.find(e => e.id === endpoint.id);
        if (updatedEp) {
            const summaryTime = item.querySelector('.at-acc-last-used');
            if (summaryTime) summaryTime.textContent = _relativeTime(updatedEp.lastUsed);
            else {
                const chevron = item.querySelector('.at-acc-chevron');
                const badge   = document.createElement('span');
                badge.className  = 'at-acc-last-used';
                badge.textContent = _relativeTime(updatedEp.lastUsed);
                chevron.insertAdjacentElement('beforebegin', badge);
            }
        }
    }
}

function _displayInlineResponse(response, container, api, endpoint) {
    container.style.display = 'block';

    if (response.error) {
        container.innerHTML = `
<div class="at-response-bar">
  <span style="color:var(--text-secondary)">Response</span>
  <span class="at-response-status-pill at-status-err">Error</span>
</div>
<div class="at-response-error-box">
❌ <strong>Connection Error</strong><br/>
<code>${response.error}</code><br/><br/>
<small>• Check the URL is correct<br/>• Make sure the API server is running<br/>• Check CORS settings</small>
</div>`;
        return;
    }

    const isOk     = response.status >= 200 && response.status < 300;
    const isRedir  = response.status >= 300 && response.status < 400;
    const pillCls  = isOk ? 'at-status-ok' : (isRedir ? 'at-status-info' : 'at-status-err');
    const icon     = isOk ? '✅' : '⚠️';
    const fullUrl  = `${api.url.replace(/\/$/, '')}${endpoint.path}`;

    let bodyHtml = '';
    if (!response.body || response.body === '') {
        bodyHtml = '<pre style="color:var(--text-muted)">(empty response)</pre>';
    } else if (typeof response.body === 'object') {
        bodyHtml = `<pre>${JSON.stringify(response.body, null, 2)}</pre>`;
    } else {
        try { bodyHtml = `<pre>${JSON.stringify(JSON.parse(response.body), null, 2)}</pre>`; }
        catch { bodyHtml = `<pre>${response.body}</pre>`; }
    }

    container.innerHTML = `
<div class="at-response-bar">
  <span style="color:var(--text-secondary);font-family:var(--font-ui);font-size:12px;font-weight:600">Response</span>
  <span class="at-response-status-pill ${pillCls}">${icon} ${response.status} ${response.statusText||''}</span>
  <span style="color:var(--text-faint);font-family:var(--font-mono);font-size:11px">${new Date(response.timing).toLocaleTimeString()}</span>
  <span style="color:var(--text-faint);font-family:var(--font-mono);font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${fullUrl}</span>
</div>
<div class="at-response-body-wrap">${bodyHtml}</div>`;

    // Scroll response into view
    setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
}

/* ── Relative time ── */
function _relativeTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000)  return 'just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return `${Math.floor(diff/86400000)}d ago`;
}

/* ═══════════════════════════════════════════════════════════════
   ACTION HANDLERS
   ═══════════════════════════════════════════════════════════════ */
async function _handleAddApi() {
    const name = apiNameInput.value.trim();
    const url  = apiUrlInput.value.trim();
    if (!name || !url) { alert('Please enter API name and URL'); return; }
    await createApi(name, url);
    apiNameInput.value = ''; apiUrlInput.value = '';
    _renderApiList();
}
async function _handleSaveApiConfig() {
    const name = document.getElementById('atApiName').value.trim();
    const url  = document.getElementById('atApiUrl').value.trim();
    if (!name || !url) { alert('API name and URL are required'); return; }
    await updateApi(_selectedApiId, name, url);
    _renderApiList(); _renderApiConfig();
}
async function _handleDeleteApi() {
    if (!confirm('Delete this API and all its endpoints?')) return;
    await deleteApi(_selectedApiId);
    _selectedApiId = null;
    _expandedEndpoints.clear();
    document.getElementById('atEmptyTest').style.display = 'flex';
    testPanel.style.display = 'none';
    _renderApiList();
}
async function _handleAddEndpoint() {
    await addEndpoint(_selectedApiId, 'GET', '/new-endpoint', '');
    const api = getApi(_selectedApiId);
    if (api?.endpoints.length) {
        const newEp = api.endpoints[api.endpoints.length - 1];
        _expandedEndpoints.add(newEp.id);
    }
    _renderEndpointsList();
    _renderApiList();
}