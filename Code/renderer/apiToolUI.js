/**
 * apiToolUI.js — with Swagger/OpenAPI import
 */

import {
    initApiTool, getAllApis, getApi,
    createApi, updateApi, deleteApi,
    addEndpoint, updateEndpoint, deleteEndpoint,
    executeRequest,
} from './apiTool.js';

import { fetchSpec, parseSpec } from './swaggerImport.js';

/* ── State ────────────────────────────────────────────────────── */
let _selectedApiId = null;
let _selectedEndpointId = null;
let _editingEndpointId = null;
let _panelOpen = false;
let _eventsWired = false;

/* ── DOM Refs ─────────────────────────────────────────────────── */
let panel, apiList, testPanel;
let apiNameInput, apiUrlInput;
let methodSelect, pathInput, descInput;

/* ── Swagger import state ─────────────────────────────────────── */
let _swOverlay = null;
let _swParsedEndpoints = [];
let _swChecked = new Set();

/* ═══════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════ */
export async function initApiToolUI() {
    await initApiTool();
    _injectPanel();
    _resolveRefs();
    if (!_eventsWired) {
        _wireEvents();
        _eventsWired = true;
    }
}

export function toggleApiToolPanel() {
    if (_panelOpen) closeApiToolPanel(); else openApiToolPanel();
}

export function openApiToolPanel() {
    if (!panel) {
        _injectPanel();
        _resolveRefs();
    }
    if (!_eventsWired) {
        _wireEvents();
        _eventsWired = true;
    }
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
        <input type="url" id="atAddApiUrl" class="at-input at-input-sm" placeholder="http://127.0.0.1:8000" />
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
        <!-- FIXED top bar -->
        <div class="at-api-config">
          <div class="at-config-row">
            <input type="text" id="atApiName" class="at-input at-input-sm" placeholder="API name" />
            <input type="url" id="atApiUrl" class="at-input at-input-sm" placeholder="http://127.0.0.1:8000" />
          </div>
          <div class="at-config-row">
            <button id="atApiSaveBtn" class="at-btn at-btn-xs at-btn-primary">✓ Save</button>
            <button id="atApiDeleteBtn" class="at-btn at-btn-xs at-btn-danger">🗑 Delete</button>
          </div>
        </div>

        <!-- SCROLLABLE body -->
        <div class="at-right-body">

          <div class="at-endpoints-section">
            <div class="at-endpoints-header">
              <span>Endpoints</span>
              <div style="display:flex;gap:6px">
                <button id="atImportSwaggerBtn" class="at-btn at-btn-xs at-btn-ghost" title="Import from Swagger/OpenAPI spec">⚡ Import Swagger</button>
                <button id="atAddEndpointBtn" class="at-btn at-btn-xs at-btn-accent">＋ New</button>
              </div>
            </div>
            <div id="atEndpointsList" class="at-endpoints-list"></div>
          </div>

          <div class="at-request-section" id="atRequestSection" style="display:none">
            <div class="at-request-header">Request Builder</div>
            <div class="at-req-row">
              <select id="atMethod" class="at-input at-input-sm" style="width:90px">
                <option>GET</option><option>POST</option><option>PUT</option>
                <option>PATCH</option><option>DELETE</option><option>HEAD</option>
              </select>
              <input type="text" id="atPath" class="at-input at-input-sm" placeholder="/api/endpoint" />
            </div>
            <div class="at-req-row">
              <input type="text" id="atDescription" class="at-input at-input-sm" placeholder="Description (optional)" />
            </div>
            <div class="at-tabs">
              <button class="at-tab at-tab-active" data-tab="headers">Headers</button>
              <button class="at-tab" data-tab="body">Body</button>
              <button class="at-tab" data-tab="params">Params</button>
              <button class="at-tab" data-tab="response">Response</button>
            </div>
            <div id="atHeadersTab" class="at-tab-content at-tab-content--visible">
              <div id="atHeadersList" class="at-kv-list"></div>
              <button id="atAddHeaderBtn" class="at-btn at-btn-xs at-btn-ghost">+ Header</button>
            </div>
            <div id="atBodyTab" class="at-tab-content">
              <textarea id="atBodyInput" class="at-textarea" placeholder='{"key":"value"}'></textarea>
            </div>
            <div id="atParamsTab" class="at-tab-content">
              <div id="atParamsList" class="at-kv-list"></div>
              <button id="atAddParamBtn" class="at-btn at-btn-xs at-btn-ghost">+ Param</button>
            </div>
            <div id="atResponseTab" class="at-tab-content">
              <div id="atResponseDisplay" class="at-response-display"></div>
            </div>
            <div class="at-req-actions">
              <button id="atSaveEndpointBtn" class="at-btn at-btn-accent">💾 Save Endpoint</button>
              <button id="atCancelEditBtn" class="at-btn at-btn-ghost">Cancel</button>
              <button id="atSendBtn" class="at-btn at-btn-primary" style="margin-left:auto">▶ Send Request</button>
            </div>
          </div>

        </div><!-- end .at-right-body -->
      </div>
    </div>
  </div>
</div>`;
    document.body.appendChild(el);
    _injectSwaggerModal();
}

/* ═══════════════════════════════════════════════════════════════
   SWAGGER IMPORT MODAL HTML
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
        <input type="url" id="swUrlInput" class="sw-url-input"
               placeholder="http://127.0.0.1:8000/openapi.json" />
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
        <button id="swSelectAllBtn" class="at-btn at-btn-xs at-btn-ghost">Select All</button>
        <button id="swSelectNoneBtn" class="at-btn at-btn-xs at-btn-ghost">None</button>
      </div>
      <div id="swEndpointList" class="sw-endpoint-list"></div>
    </div>
  </div>

  <div class="sw-footer">
    <span class="sw-mode-label">Import mode:</span>
    <button id="swModeMerge" class="sw-mode-btn sw-mode-btn--active" data-mode="merge">Merge</button>
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

/* ── Wire swagger modal events ────────────────────────────────── */
function _wireSwaggerEvents() {
    document.getElementById('swCloseBtn').addEventListener('click', _closeSwagger);
    document.getElementById('swCancelBtn').addEventListener('click', _closeSwagger);
    // Only close swagger when clicking the overlay backdrop itself, not the modal
    _swOverlay.addEventListener('click', e => { if (e.target === _swOverlay) _closeSwagger(); });

    document.getElementById('swFetchBtn').addEventListener('click', _handleSwaggerFetch);
    document.getElementById('swUrlInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') _handleSwaggerFetch();
    });

    document.getElementById('swSelectAllBtn').addEventListener('click', () => {
        _swChecked = new Set(_swParsedEndpoints.map((_, i) => i));
        _renderSwaggerPreview();
    });
    document.getElementById('swSelectNoneBtn').addEventListener('click', () => {
        _swChecked.clear();
        _renderSwaggerPreview();
    });

    document.querySelectorAll('.sw-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sw-mode-btn').forEach(b => b.classList.remove('sw-mode-btn--active'));
            btn.classList.add('sw-mode-btn--active');
        });
    });

    document.getElementById('swImportBtn').addEventListener('click', _handleSwaggerImport);
}

/* ── Open swagger modal ───────────────────────────────────────── */
function _openSwagger() {
    const api = getApi(_selectedApiId);
    if (api?.url) {
        const base = api.url.replace(/\/$/, '');
        document.getElementById('swUrlInput').value = base + '/openapi.json';
    }
    _swParsedEndpoints = [];
    _swChecked = new Set();
    document.getElementById('swStatus').className = 'sw-status';
    document.getElementById('swStatus').textContent = '';
    document.getElementById('swDivider').style.display = 'none';
    document.getElementById('swPreview').classList.remove('sw-preview--visible');
    document.getElementById('swImportBtn').disabled = true;
    _swOverlay.classList.add('sw-visible');
}

function _closeSwagger() {
    _swOverlay.classList.remove('sw-visible');
}

/* ── Fetch & parse spec ───────────────────────────────────────── */
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
            statusEl.textContent = '⚠️ Spec parsed but no endpoints found. Check the spec has a "paths" section.';
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
    } finally {
        fetchBtn.disabled = false;
    }
}

/* ── Render preview list ──────────────────────────────────────── */
function _renderSwaggerPreview() {
    const list = document.getElementById('swEndpointList');
    const METHOD_COLORS = {
        GET: 'at-method-get', POST: 'at-method-post', PUT: 'at-method-put',
        PATCH: 'at-method-patch', DELETE: 'at-method-delete', HEAD: 'at-method-head',
    };

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

/* ── Do the import ────────────────────────────────────────────── */
async function _handleSwaggerImport() {
    const mode = document.querySelector('.sw-mode-btn--active')?.dataset.mode || 'merge';
    const toImport = _swParsedEndpoints.filter((_, i) => _swChecked.has(i));
    if (toImport.length === 0) return;

    if (mode === 'replace') {
        const api = getApi(_selectedApiId);
        if (api) {
            for (const ep of [...api.endpoints]) {
                await deleteEndpoint(_selectedApiId, ep.id);
            }
        }
    }

    for (const ep of toImport) {
        await addEndpoint(_selectedApiId, ep.method, ep.path, ep.description);
        const api = getApi(_selectedApiId);
        const newEp = api.endpoints[api.endpoints.length - 1];
        if (newEp) {
            await updateEndpoint(
                _selectedApiId, newEp.id,
                ep.method, ep.path, ep.description,
                ep.headers, ep.body, ep.params
            );
        }
    }

    _closeSwagger();
    _renderEndpointsList();

    const header = document.querySelector('.at-endpoints-header span');
    const orig = header.textContent;
    header.textContent = `✅ Imported ${toImport.length} endpoints`;
    setTimeout(() => { header.textContent = orig; }, 2500);
}

/* ═══════════════════════════════════════════════════════════════
   RESOLVE REFS + WIRE MAIN EVENTS
   ═══════════════════════════════════════════════════════════════ */
function _resolveRefs() {
    panel        = document.getElementById('apiToolPanel');
    apiList      = document.getElementById('atApiList');
    testPanel    = document.getElementById('atTestUI');
    apiNameInput = document.getElementById('atAddApiName');
    apiUrlInput  = document.getElementById('atAddApiUrl');
    methodSelect = document.getElementById('atMethod');
    pathInput    = document.getElementById('atPath');
    descInput    = document.getElementById('atDescription');
}

function _wireEvents() {
    // Close button and backdrop only — removed panel-root click to prevent accidental closes
    document.getElementById('atCloseBtn')?.addEventListener('click', closeApiToolPanel);
    document.querySelector('.at-backdrop')?.addEventListener('click', closeApiToolPanel);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && _panelOpen) closeApiToolPanel(); });

    // Stop clicks inside the container from bubbling to backdrop
    document.querySelector('.at-container')?.addEventListener('click', e => e.stopPropagation());

    // Sidebar
    document.getElementById('atAddApiBtn')?.addEventListener('click', _handleAddApi);
    document.getElementById('atAddApiName')?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleAddApi(); });
    document.getElementById('atAddApiUrl')?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleAddApi(); });

    // API config
    document.getElementById('atApiSaveBtn')?.addEventListener('click', _handleSaveApiConfig);
    document.getElementById('atApiDeleteBtn')?.addEventListener('click', _handleDeleteApi);

    // Endpoints
    document.getElementById('atAddEndpointBtn')?.addEventListener('click', _handleAddEndpoint);
    document.getElementById('atImportSwaggerBtn')?.addEventListener('click', _openSwagger);

    // Tabs
    document.querySelectorAll('.at-tab').forEach(btn => {
        btn.addEventListener('click', e => _switchTab(e.target.closest('.at-tab').dataset.tab));
    });

    // Request builder actions
    document.getElementById('atSendBtn')?.addEventListener('click', _handleSendRequest);
    document.getElementById('atSaveEndpointBtn')?.addEventListener('click', _handleSaveEndpoint);
    document.getElementById('atCancelEditBtn')?.addEventListener('click', _handleCancelEdit);

    // KV row add buttons — delegated but scoped to the panel
    panel?.addEventListener('click', e => {
        if (e.target.id === 'atAddHeaderBtn') {
            document.getElementById('atHeadersList').appendChild(_createKVRow('header'));
        }
        if (e.target.id === 'atAddParamBtn') {
            document.getElementById('atParamsList').appendChild(_createKVRow('param'));
        }
    });
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
    _selectedEndpointId = null;
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
    document.getElementById('atApiUrl').value = api.url;
}

function _renderEndpointsList() {
    const api = getApi(_selectedApiId);
    if (!api) return;
    const list = document.getElementById('atEndpointsList');
    list.innerHTML = '';
    if (api.endpoints.length === 0) {
        list.innerHTML = '<div class="at-empty-list">No endpoints yet — add manually or import from Swagger</div>';
        return;
    }
    api.endpoints.forEach(endpoint => {
        const item = document.createElement('div');
        item.className = 'at-endpoint-item' + (_selectedEndpointId === endpoint.id ? ' active' : '');
        item.innerHTML = `
<div class="at-endpoint-method at-method-${endpoint.method.toLowerCase()}">${endpoint.method}</div>
<div class="at-endpoint-info">
  <div class="at-endpoint-path">${endpoint.path}</div>
  <div class="at-endpoint-desc">${endpoint.description || '(no description)'}</div>
</div>
<button class="at-endpoint-delete" title="Delete">✕</button>`;
        item.querySelector('.at-endpoint-info').addEventListener('click', () => _selectEndpoint(endpoint.id));
        item.querySelector('.at-endpoint-delete').addEventListener('click', e => {
            e.stopPropagation();
            _handleDeleteEndpoint(endpoint.id);
        });
        list.appendChild(item);
    });
}

function _selectEndpoint(endpointId) {
    const api = getApi(_selectedApiId);
    if (!api) return;
    const endpoint = api.endpoints.find(e => e.id === endpointId);
    if (!endpoint) return;

    _selectedEndpointId = endpointId;
    _editingEndpointId = endpointId;
    _renderEndpointsList();
    document.getElementById('atRequestSection').style.display = 'flex';

    methodSelect.value = endpoint.method;
    pathInput.value = endpoint.path;
    descInput.value = endpoint.description || '';

    const headers = endpoint.headers || {};
    _renderHeaders(headers);

    const bodyInput = document.getElementById('atBodyInput');
    const body = endpoint.body || '';
    bodyInput.value = body;
    bodyInput.placeholder = (!body && ['POST', 'PUT', 'PATCH'].includes(endpoint.method))
        ? '// No schema in spec — enter JSON body manually'
        : '{"key": "value"}';

    const params = endpoint.params || {};
    _renderParams(params);

    _updateTabBadges({ headers, body, params });

    const hasBody   = body.trim().length > 0;
    const hasParams = Object.keys(params).length > 0;
    if (hasBody)        _switchTab('body');
    else if (hasParams) _switchTab('params');
    else                _switchTab('headers');

    document.getElementById('atRequestSection')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _updateTabBadges({ headers, body, params }) {
    document.querySelectorAll('.at-tab').forEach(tab => {
        tab.querySelector('.at-tab-badge')?.remove();
        const name = tab.dataset.tab;
        let count = 0;
        if (name === 'headers') count = Object.keys(headers || {}).length;
        if (name === 'body')    count = (body || '').trim().length > 0 ? 1 : 0;
        if (name === 'params')  count = Object.keys(params || {}).length;
        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'at-tab-badge';
            badge.textContent = name === 'body' ? '●' : count;
            tab.appendChild(badge);
        }
    });
}

/* ═══════════════════════════════════════════════════════════════
   ACTION HANDLERS
   ═══════════════════════════════════════════════════════════════ */
async function _handleAddApi() {
    const name = apiNameInput.value.trim();
    const url  = apiUrlInput.value.trim();
    if (!name || !url) { alert('Please enter API name and URL'); return; }
    await createApi(name, url);
    apiNameInput.value = '';
    apiUrlInput.value  = '';
    _renderApiList();
}

async function _handleSaveApiConfig() {
    const name = document.getElementById('atApiName').value.trim();
    const url  = document.getElementById('atApiUrl').value.trim();
    if (!name || !url) { alert('API name and URL are required'); return; }
    await updateApi(_selectedApiId, name, url);
    _renderApiList();
    _renderApiConfig();
}

async function _handleDeleteApi() {
    if (!confirm('Delete this API and all its endpoints?')) return;
    await deleteApi(_selectedApiId);
    _selectedApiId     = null;
    _selectedEndpointId = null;
    document.getElementById('atEmptyTest').style.display = 'flex';
    testPanel.style.display = 'none';
    _renderApiList();
}

async function _handleAddEndpoint() {
    const api = getApi(_selectedApiId);
    if (!api) return;
    await addEndpoint(_selectedApiId, 'GET', '/endpoint', '');
    const updated = getApi(_selectedApiId);
    _renderEndpointsList();
    if (updated.endpoints.length > 0)
        _selectEndpoint(updated.endpoints[updated.endpoints.length - 1].id);
}

async function _handleDeleteEndpoint(endpointId) {
    if (!confirm('Delete this endpoint?')) return;
    await deleteEndpoint(_selectedApiId, endpointId);
    if (_selectedEndpointId === endpointId) {
        _selectedEndpointId = null;
        document.getElementById('atRequestSection').style.display = 'none';
    }
    _renderEndpointsList();
}

async function _handleSaveEndpoint() {
    const method      = methodSelect.value;
    const path        = pathInput.value.trim();
    const description = descInput.value.trim();
    if (!path) { alert('Path is required'); return; }
    await updateEndpoint(
        _selectedApiId, _selectedEndpointId,
        method, path, description,
        _getHeadersFromForm(),
        document.getElementById('atBodyInput').value,
        _getParamsFromForm()
    );
    alert('Endpoint saved!');
    _renderEndpointsList();
}

async function _handleSendRequest() {
    if (!_selectedEndpointId) { alert('Please select or create an endpoint first'); return; }
    const btn = document.getElementById('atSendBtn');
    if (!btn) return;
    btn.disabled    = true;
    btn.textContent = '⏳ Sending…';
    try {
        const response = await executeRequest(_selectedApiId, _selectedEndpointId);
        _displayResponse(response);
    } catch (err) {
        document.getElementById('atResponseDisplay').innerHTML = `<div class="at-error">
<strong>❌ Request Failed</strong><br/>${err.message}<br/>
<small>Check your URL and make sure the API is running</small></div>`;
        _switchTab('response');
    } finally {
        const btnFresh = document.getElementById('atSendBtn');
        if (btnFresh) {
            btnFresh.disabled    = false;
            btnFresh.textContent = '▶ Send Request';
        }
    }
}

function _handleCancelEdit() {
    document.getElementById('atRequestSection').style.display = 'none';
    _selectedEndpointId = null;
    _editingEndpointId  = null;
    _renderEndpointsList();
}

/* ═══════════════════════════════════════════════════════════════
   RESPONSE DISPLAY
   ═══════════════════════════════════════════════════════════════ */
function _displayResponse(response) {
    const rd = document.getElementById('atResponseDisplay');
    if (response.error) {
        rd.innerHTML = `<div class="at-error"><strong>❌ Connection Error</strong><br/><code>${response.error}</code><br/><br/>
<small>• Check the URL is correct<br/>• Make sure the API server is running<br/>• Check CORS settings</small></div>`;
        _switchTab('response');
        return;
    }
    const sc = response.status >= 200 && response.status < 300 ? 'at-status-success' :
               response.status >= 300 && response.status < 400 ? 'at-status-redirect' : 'at-status-error';
    const si = response.status >= 200 && response.status < 300 ? '✅' : '⚠️';
    const api = getApi(_selectedApiId);
    const ep  = api?.endpoints.find(e => e.id === _selectedEndpointId);
    const fullUrl = api ? `${api.url}${ep.path}` : 'unknown';

    let html = `<div class="at-response-meta">
<div>🔗 <strong>URL:</strong> <code>${fullUrl}</code></div>
<div>📊 <strong>Status:</strong> <span class="${sc}">${si} ${response.status}</span></div>
<div>⏱️ <strong>Time:</strong> ${new Date(response.timing).toLocaleTimeString()}</div>
<hr style="border:none;border-top:1px solid var(--border-subtle);margin:8px 0">
<div><strong>📦 Response Body:</strong></div>
</div><div class="at-response-code">`;

    if (!response.body || response.body === '') {
        html += '<pre style="color:var(--text-muted)">(empty response)</pre>';
    } else if (typeof response.body === 'object') {
        html += `<pre>${JSON.stringify(response.body, null, 2)}</pre>`;
    } else {
        try { html += `<pre>${JSON.stringify(JSON.parse(response.body), null, 2)}</pre>`; }
        catch { html += `<pre>${response.body}</pre>`; }
    }
    html += '</div>';
    rd.innerHTML = html;
    _switchTab('response');
    document.querySelector('.at-right-body')?.scrollTo({ top: 99999, behavior: 'smooth' });
}

/* ── Tab switching ────────────────────────────────────────────── */
function _switchTab(tabName) {
    document.querySelectorAll('.at-tab').forEach(b => {
        b.classList.toggle('at-tab-active', b.dataset.tab === tabName);
    });
    document.querySelectorAll('.at-tab-content').forEach(c => {
        c.classList.remove('at-tab-content--visible');
    });
    document.getElementById(`at${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`)
        ?.classList.add('at-tab-content--visible');
}

/* ── KV helpers ───────────────────────────────────────────────── */
function _renderHeaders(headers = {}) {
    const list = document.getElementById('atHeadersList');
    list.innerHTML = '';
    Object.entries(headers).forEach(([k, v]) => list.appendChild(_createKVRow('header', k, v)));
}

function _getHeadersFromForm() {
    const h = {};
    document.querySelectorAll('#atHeadersList .at-kv-row').forEach(row => {
        const k = row.querySelector('input:nth-of-type(1)').value.trim();
        const v = row.querySelector('input:nth-of-type(2)').value.trim();
        if (k) h[k] = v;
    });
    return h;
}

function _renderParams(params = {}) {
    const list = document.getElementById('atParamsList');
    list.innerHTML = '';
    Object.entries(params).forEach(([k, v]) => list.appendChild(_createKVRow('param', k, v)));
}

function _getParamsFromForm() {
    const p = {};
    document.querySelectorAll('#atParamsList .at-kv-row').forEach(row => {
        const k = row.querySelector('input:nth-of-type(1)').value.trim();
        const v = row.querySelector('input:nth-of-type(2)').value.trim();
        if (k) p[k] = v;
    });
    return p;
}

function _createKVRow(type, key = '', value = '') {
    const row = document.createElement('div');
    row.className = 'at-kv-row';
    row.innerHTML = `
<input type="text" class="at-input at-input-xs" placeholder="Key" value="${key}" />
<input type="text" class="at-input at-input-xs" placeholder="Value" value="${value}" />
<button class="at-btn at-btn-xs at-btn-danger" title="Remove">✕</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    return row;
}