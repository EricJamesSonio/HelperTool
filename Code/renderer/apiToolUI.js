/**
 * apiToolUI.js
 * UI layer that uses apiTool.js
 */

import {
    initApiTool, getAllApis, getApi,
    createApi, updateApi, deleteApi,
    addEndpoint, updateEndpoint, deleteEndpoint,
    executeRequest,
} from './apiTool.js';

/* ── State ────────────────────────────────────────────────────── */
let _panel = null;
let _selectedApiId = null;
let _selectedEndpointId = null;
let _editingApiId = null;
let _editingEndpointId = null;
let _panelOpen = false;
let _lastResponse = null;

/* ── DOM Refs ─────────────────────────────────────────────────── */
let panel, apiList, addApiForm, testPanel;
let apiNameInput, apiUrlInput;
let methodSelect, pathInput, descInput, sendBtn;

/**
 * Init API tool panel
 */
export async function initApiToolUI() {
    await initApiTool();
    _injectPanel();
    _resolveRefs();
    _wireEvents();
}

/**
 * Open/close API tool panel
 */
export function toggleApiToolPanel() {
    if (_panelOpen) closeApiToolPanel();
    else openApiToolPanel();
}

export function openApiToolPanel() {
    if (!_panel) {
        _injectPanel();
        _resolveRefs();
        _wireEvents();
    }
    _panelOpen = true;
    panel.classList.add('at-visible');
    _renderApiList();
}

export function closeApiToolPanel() {
    _panelOpen = false;
    panel?.classList.remove('at-visible');
}

export function isApiToolPanelOpen() {
    return _panelOpen;
}

/* ── Inject HTML ──────────────────────────────────────────────── */
function _injectPanel() {
    if (document.getElementById('apiToolPanel')) return;
    const el = document.createElement('div');
    el.id = 'apiToolPanel';
    el.className = 'at-panel';
    el.innerHTML = `
<div class="at-backdrop"></div>
<div class="at-container">
  <!-- Header -->
  <div class="at-header">
    <div class="at-header-title">
      <span class="at-header-icon">🔌</span>
      API Tool
    </div>
    <button class="at-close-btn" id="atCloseBtn" title="Close">✕</button>
  </div>

  <!-- Two-column layout -->
  <div class="at-main">
    <!-- LEFT: API List -->
    <div class="at-sidebar">
      <div class="at-sidebar-header">
        <span class="at-sidebar-title">Saved APIs</span>
      </div>
      
      <!-- Add API Form -->
      <div class="at-add-form">
        <input type="text" id="atAddApiName" class="at-input at-input-sm" placeholder="API name" maxlength="40" />
        <input type="url" id="atAddApiUrl" class="at-input at-input-sm" placeholder="http://127.0.0.1:8000" />
        <button id="atAddApiBtn" class="at-btn at-btn-sm at-btn-accent">＋ Add API</button>
      </div>

      <!-- API List -->
      <div id="atApiList" class="at-list"></div>
    </div>

    <!-- RIGHT: Test Panel -->
    <div class="at-test-panel">
      <div id="atEmptyTest" class="at-empty">
        <div class="at-empty-icon">🔌</div>
        <div class="at-empty-text">Select an API to begin testing</div>
      </div>

      <!-- Test UI (hidden until API selected) -->
      <div id="atTestUI" class="at-test-ui" style="display:none">
        <!-- API Config Bar -->
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

        <!-- Endpoints List -->
        <div class="at-endpoints-section">
          <div class="at-endpoints-header">
            <span>Endpoints</span>
            <button id="atAddEndpointBtn" class="at-btn at-btn-xs at-btn-accent">＋ New</button>
          </div>
          <div id="atEndpointsList" class="at-endpoints-list"></div>
        </div>

        <!-- Request Builder -->
        <div class="at-request-section" style="display:none">
          <div class="at-request-header">Request Builder</div>
          
          <div class="at-req-row">
            <select id="atMethod" class="at-input at-input-sm" style="width:90px">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
              <option value="HEAD">HEAD</option>
            </select>
            <input type="text" id="atPath" class="at-input at-input-sm" placeholder="/api/endpoint" />
          </div>

          <div class="at-req-row">
            <input type="text" id="atDescription" class="at-input at-input-sm" placeholder="Description (optional)" />
          </div>

          <!-- Tabs: Headers / Body / Params / Response -->
          <div class="at-tabs">
            <button class="at-tab at-tab-active" data-tab="headers">Headers</button>
            <button class="at-tab" data-tab="body">Body</button>
            <button class="at-tab" data-tab="params">Params</button>
            <button class="at-tab" data-tab="response">Response</button>
          </div>

          <!-- Headers -->
          <div id="atHeadersTab" class="at-tab-content at-tab-active">
            <div id="atHeadersList" class="at-kv-list"></div>
            <button id="atAddHeaderBtn" class="at-btn at-btn-xs at-btn-ghost">+ Header</button>
          </div>

          <!-- Body -->
          <div id="atBodyTab" class="at-tab-content" style="display:none">
            <textarea id="atBodyInput" class="at-textarea" placeholder='{"key":"value"}'></textarea>
          </div>

          <!-- Params -->
          <div id="atParamsTab" class="at-tab-content" style="display:none">
            <div id="atParamsList" class="at-kv-list"></div>
            <button id="atAddParamBtn" class="at-btn at-btn-xs at-btn-ghost">+ Param</button>
          </div>

          <!-- Response -->
          <div id="atResponseTab" class="at-tab-content" style="display:none">
            <div id="atResponseDisplay" class="at-response-display"></div>
          </div>

          <div class="at-req-actions">
            <button id="atSaveEndpointBtn" class="at-btn at-btn-accent">💾 Save Endpoint</button>
            <button id="atCancelEditBtn" class="at-btn at-btn-ghost">Cancel</button>
            <button id="atSendBtn" class="at-btn at-btn-primary" style="margin-left:auto">▶ Send Request</button>
          </div>
        </div>
      </div>
    </div>
</div>`;
    document.body.appendChild(el);
}

/* ── Resolve DOM Refs ─────────────────────────────────────────── */
function _resolveRefs() {
    panel = document.getElementById('apiToolPanel');
    apiList = document.getElementById('atApiList');
    testPanel = document.getElementById('atTestUI');
    
    // Add API form
    apiNameInput = document.getElementById('atAddApiName');
    apiUrlInput = document.getElementById('atAddApiUrl');
    
    // Request builder
    methodSelect = document.getElementById('atMethod');
    pathInput = document.getElementById('atPath');
    descInput = document.getElementById('atDescription');
    sendBtn = document.getElementById('atSendBtn');
}

/* ── Wire Events ──────────────────────────────────────────────── */
function _wireEvents() {
    // Close
    document.getElementById('atCloseBtn')?.addEventListener('click', closeApiToolPanel);
    panel?.addEventListener('click', (e) => {
        if (e.target === panel) closeApiToolPanel();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _panelOpen) closeApiToolPanel();
    });

    // Add API
    document.getElementById('atAddApiBtn')?.addEventListener('click', _handleAddApi);
    document.getElementById('atAddApiName')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') _handleAddApi();
    });

    // API config save/delete
    document.getElementById('atApiSaveBtn')?.addEventListener('click', _handleSaveApiConfig);
    document.getElementById('atApiDeleteBtn')?.addEventListener('click', _handleDeleteApi);

    // Add endpoint
    document.getElementById('atAddEndpointBtn')?.addEventListener('click', _handleAddEndpoint);

    // Tab switching
    document.querySelectorAll('.at-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            _switchTab(tabName);
        });
    });

    // Send request
    document.getElementById('atSendBtn')?.addEventListener('click', _handleSendRequest);
    document.getElementById('atSaveEndpointBtn')?.addEventListener('click', _handleSaveEndpoint);
    document.getElementById('atCancelEditBtn')?.addEventListener('click', _handleCancelEdit);

    // Backdrop click
    document.querySelector('.at-backdrop')?.addEventListener('click', closeApiToolPanel);
}

/* ── Render API List ──────────────────────────────────────────── */
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

/* ── Select API ───────────────────────────────────────────────── */
function _selectApi(apiId) {
    _selectedApiId = apiId;
    _selectedEndpointId = null;
    _renderApiList();
    _showTestPanel();
    _renderApiConfig();
    _renderEndpointsList();
}

/* ── Show Test Panel ──────────────────────────────────────────── */
function _showTestPanel() {
    document.getElementById('atEmptyTest').style.display = 'none';
    testPanel.style.display = 'flex';
}

/* ── Render API Config ────────────────────────────────────────── */
function _renderApiConfig() {
    const api = getApi(_selectedApiId);
    if (!api) return;

    document.getElementById('atApiName').value = api.name;
    document.getElementById('atApiUrl').value = api.url;
}

/* ── Render Endpoints List ────────────────────────────────────── */
function _renderEndpointsList() {
    const api = getApi(_selectedApiId);
    if (!api) return;

    const list = document.getElementById('atEndpointsList');
    list.innerHTML = '';

    if (api.endpoints.length === 0) {
        list.innerHTML = '<div class="at-empty-list">No endpoints yet</div>';
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
        item.querySelector('.at-endpoint-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            _handleDeleteEndpoint(endpoint.id);
        });
        
        list.appendChild(item);
    });
}

/* ── Select Endpoint ──────────────────────────────────────────── */
function _selectEndpoint(endpointId) {
    const api = getApi(_selectedApiId);
    if (!api) return;
    
    const endpoint = api.endpoints.find(e => e.id === endpointId);
    if (!endpoint) return;

    _selectedEndpointId = endpointId;
    _editingEndpointId = endpointId;
    _renderEndpointsList();
    
    // Show request builder
    document.querySelector('.at-request-section').style.display = 'block';
    
    // Populate form
    methodSelect.value = endpoint.method;
    pathInput.value = endpoint.path;
    descInput.value = endpoint.description;
    
    _renderHeaders(endpoint.headers);
    document.getElementById('atBodyInput').value = endpoint.body;
    _renderParams(endpoint.params);
}

/* ── Handle Add API ───────────────────────────────────────────── */
async function _handleAddApi() {
    const name = apiNameInput.value.trim();
    const url = apiUrlInput.value.trim();

    if (!name || !url) {
        alert('Please enter API name and URL');
        return;
    }

    await createApi(name, url);
    apiNameInput.value = '';
    apiUrlInput.value = '';
    _renderApiList();
}

/* ── Handle Save API Config ───────────────────────────────────── */
async function _handleSaveApiConfig() {
    const name = document.getElementById('atApiName').value.trim();
    const url = document.getElementById('atApiUrl').value.trim();

    if (!name || !url) {
        alert('API name and URL are required');
        return;
    }

    await updateApi(_selectedApiId, name, url);
    _renderApiList();
    _renderApiConfig();
}

/* ── Handle Delete API ────────────────────────────────────────── */
async function _handleDeleteApi() {
    if (!confirm('Delete this API and all its endpoints?')) return;
    await deleteApi(_selectedApiId);
    _selectedApiId = null;
    _selectedEndpointId = null;
    document.getElementById('atEmptyTest').style.display = 'flex';
    testPanel.style.display = 'none';
    _renderApiList();
}

/* ── Handle Add Endpoint ──────────────────────────────────────── */
async function _handleAddEndpoint() {
    const api = getApi(_selectedApiId);
    if (!api) return;

    await addEndpoint(_selectedApiId, 'GET', '/endpoint', '');
    _renderEndpointsList();
    
    // Select the new endpoint
    if (api.endpoints.length > 0) {
        _selectEndpoint(api.endpoints[api.endpoints.length - 1].id);
    }
}

/* ── Handle Delete Endpoint ───────────────────────────────────── */
async function _handleDeleteEndpoint(endpointId) {
    if (!confirm('Delete this endpoint?')) return;
    await deleteEndpoint(_selectedApiId, endpointId);
    if (_selectedEndpointId === endpointId) {
        _selectedEndpointId = null;
        document.querySelector('.at-request-section').style.display = 'none';
    }
    _renderEndpointsList();
}

/* ── Handle Save Endpoint ─────────────────────────────────────── */
async function _handleSaveEndpoint() {
    const method = methodSelect.value;
    const path = pathInput.value.trim();
    const description = descInput.value.trim();

    if (!path) {
        alert('Path is required');
        return;
    }

    const headers = _getHeadersFromForm();
    const body = document.getElementById('atBodyInput').value;
    const params = _getParamsFromForm();

    await updateEndpoint(_selectedApiId, _selectedEndpointId, method, path, description, headers, body, params);
    alert('Endpoint saved!');
    _renderEndpointsList();
}

/* ── Handle Send Request ──────────────────────────────────────── */
async function _handleSendRequest() {
    if (!_selectedEndpointId) {
        alert('Please select or create an endpoint first');
        return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = '⏳ Sending…';

    try {
        const response = await executeRequest(_selectedApiId, _selectedEndpointId);
        console.log('[API Tool] Full response:', response);
        _displayResponse(response);
    } catch (err) {
        console.error('[API Tool] Request error:', err);
        let responseDisplay = document.getElementById('atResponseDisplay');
        if (!responseDisplay) {
            responseDisplay = document.createElement('div');
            responseDisplay.id = 'atResponseDisplay';
            document.getElementById('atResponseTab').appendChild(responseDisplay);
        }
        responseDisplay.innerHTML = `<div class="at-error">
<strong>❌ Request Failed</strong><br/>
${err.message}<br/>
<small>Check your URL and make sure the API is running</small>
</div>`;
        _switchTab('response');
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = '▶ Send Request';
    }
}

/* ── Handle Cancel Edit ───────────────────────────────────────── */
function _handleCancelEdit() {
    document.querySelector('.at-request-section').style.display = 'none';
    _selectedEndpointId = null;
    _editingEndpointId = null;
    _renderEndpointsList();
}

/* ── Display Response ─────────────────────────────────────────── */
function _displayResponse(response) {
    console.log('[API Tool] Displaying response:', response);
    
    let responseDisplay = document.getElementById('atResponseDisplay');
    if (!responseDisplay) {
        responseDisplay = document.createElement('div');
        responseDisplay.id = 'atResponseDisplay';
        const responseTab = document.getElementById('atResponseTab');
        if (responseTab) {
            responseTab.appendChild(responseDisplay);
        }
    }
    
    if (response.error) {
        responseDisplay.innerHTML = `<div class="at-error">
<strong>❌ Connection Error</strong><br/>
<code>${response.error}</code><br/>
<br/>
<small><strong>Troubleshooting:</strong><br/>
• Check the URL is correct (http://127.0.0.1:8000)<br/>
• Make sure the API server is running<br/>
• Check CORS settings if calling from browser<br/>
• Verify the endpoint path is correct</small>
</div>`;
        _switchTab('response');
        return;
    }

    const statusClass = response.status >= 200 && response.status < 300 ? 'at-status-success' :
                        response.status >= 300 && response.status < 400 ? 'at-status-redirect' :
                        response.status >= 400 && response.status < 500 ? 'at-status-error' :
                        'at-status-error';

    const statusIcon = response.status >= 200 && response.status < 300 ? '✅' : '⚠️';

    const api = getApi(_selectedApiId);
    const endpoint = api?.endpoints.find(e => e.id === _selectedEndpointId);
    const fullUrl = api ? `${api.url}${endpoint.path}` : 'unknown';

    let bodyHtml = `<div class="at-response-meta">
<div>🔗 <strong>URL:</strong> <code>${fullUrl}</code></div>
<div>📊 <strong>Status:</strong> <span class="${statusClass}">${statusIcon} ${response.status}</span></div>
<div>⏱️ <strong>Time:</strong> ${new Date(response.timing).toLocaleTimeString()}</div>
<hr style="border: none; border-top: 1px solid var(--border-subtle); margin: 12px 0;">
<div><strong>📦 Response Body:</strong></div>
</div>`;

    // Display body with better formatting
    bodyHtml += '<div class="at-response-code">';
    
    if (!response.body || response.body === '') {
        bodyHtml += '<pre style="color: var(--text-muted);">(empty response)</pre>';
    } else if (typeof response.body === 'object') {
        try {
            bodyHtml += `<pre>${JSON.stringify(response.body, null, 2)}</pre>`;
        } catch (e) {
            bodyHtml += `<pre>${String(response.body)}</pre>`;
        }
    } else if (typeof response.body === 'string') {
        // Try to parse as JSON for better display
        try {
            const parsed = JSON.parse(response.body);
            bodyHtml += `<pre>${JSON.stringify(parsed, null, 2)}</pre>`;
        } catch {
            // If not JSON, display as plain text
            bodyHtml += `<pre>${response.body}</pre>`;
        }
    } else {
        bodyHtml += `<pre>${String(response.body)}</pre>`;
    }
    
    bodyHtml += '</div>';

    responseDisplay.innerHTML = bodyHtml;
    _switchTab('response');
}

/* ── Tab Switching ────────────────────────────────────────────── */
function _switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.at-tab').forEach(btn => {
        btn.classList.toggle('at-tab-active', btn.dataset.tab === tabName);
    });

    // Update tab contents
    document.querySelectorAll('.at-tab-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`at${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`).style.display = 'block';
}

/* ── Headers Management ───────────────────────────────────────── */
function _renderHeaders(headers = {}) {
    const list = document.getElementById('atHeadersList');
    list.innerHTML = '';
    
    Object.entries(headers).forEach(([key, value]) => {
        const row = _createKVRow('header', key, value);
        list.appendChild(row);
    });
}

function _getHeadersFromForm() {
    const headers = {};
    document.querySelectorAll('#atHeadersList .at-kv-row').forEach(row => {
        const key = row.querySelector('input:nth-of-type(1)').value.trim();
        const value = row.querySelector('input:nth-of-type(2)').value.trim();
        if (key) headers[key] = value;
    });
    return headers;
}

/* ── Params Management ────────────────────────────────────────── */
function _renderParams(params = {}) {
    const list = document.getElementById('atParamsList');
    list.innerHTML = '';
    
    Object.entries(params).forEach(([key, value]) => {
        const row = _createKVRow('param', key, value);
        list.appendChild(row);
    });
}

function _getParamsFromForm() {
    const params = {};
    document.querySelectorAll('#atParamsList .at-kv-row').forEach(row => {
        const key = row.querySelector('input:nth-of-type(1)').value.trim();
        const value = row.querySelector('input:nth-of-type(2)').value.trim();
        if (key) params[key] = value;
    });
    return params;
}

/* ── Create KV Row ────────────────────────────────────────────── */
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

// Wire add header/param buttons
document.addEventListener('click', (e) => {
    if (e.target.id === 'atAddHeaderBtn') {
        document.getElementById('atHeadersList').appendChild(_createKVRow('header'));
    }
    if (e.target.id === 'atAddParamBtn') {
        document.getElementById('atParamsList').appendChild(_createKVRow('param'));
    }
});
