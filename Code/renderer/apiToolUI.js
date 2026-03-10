/**
 * apiToolUI.js — fixed scroll + tab switching
 */

import {
    initApiTool, getAllApis, getApi,
    createApi, updateApi, deleteApi,
    addEndpoint, updateEndpoint, deleteEndpoint,
    executeRequest,
} from './apiTool.js';

let _panel = null;
let _selectedApiId = null;
let _selectedEndpointId = null;
let _editingEndpointId = null;
let _panelOpen = false;

let panel, apiList, testPanel;
let apiNameInput, apiUrlInput;
let methodSelect, pathInput, descInput, sendBtn;

export async function initApiToolUI() {
    await initApiTool();
    _injectPanel();
    _resolveRefs();
    _wireEvents();
}

export function toggleApiToolPanel() {
    if (_panelOpen) closeApiToolPanel();
    else openApiToolPanel();
}

export function openApiToolPanel() {
    if (!_panel) { _injectPanel(); _resolveRefs(); _wireEvents(); }
    _panelOpen = true;
    panel.classList.add('at-visible');
    _renderApiList();
}

export function closeApiToolPanel() {
    _panelOpen = false;
    panel?.classList.remove('at-visible');
}

export function isApiToolPanelOpen() { return _panelOpen; }

/* ── Inject HTML ──────────────────────────────────────────────── */
function _injectPanel() {
    if (document.getElementById('apiToolPanel')) return;
    const el = document.createElement('div');
    el.id = 'apiToolPanel';
    el.className = 'at-panel';
    el.innerHTML = `
<div class="at-backdrop"></div>
<div class="at-container">
  <div class="at-header">
    <div class="at-header-title">
      <span class="at-header-icon">🔌</span>
      API Tool
    </div>
    <button class="at-close-btn" id="atCloseBtn" title="Close">✕</button>
  </div>

  <div class="at-main">
    <!-- LEFT sidebar -->
    <div class="at-sidebar">
      <div class="at-sidebar-header">
        <span class="at-sidebar-title">Saved APIs</span>
      </div>
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
        <!-- FIXED: api name/url/save/delete -->
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

        <!-- SCROLLABLE: everything below the fixed bar -->
        <div class="at-right-body">

          <div class="at-endpoints-section">
            <div class="at-endpoints-header">
              <span>Endpoints</span>
              <button id="atAddEndpointBtn" class="at-btn at-btn-xs at-btn-accent">＋ New</button>
            </div>
            <div id="atEndpointsList" class="at-endpoints-list"></div>
          </div>

          <div class="at-request-section" id="atRequestSection" style="display:none">
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
}

function _resolveRefs() {
    panel = document.getElementById('apiToolPanel');
    apiList = document.getElementById('atApiList');
    testPanel = document.getElementById('atTestUI');
    apiNameInput = document.getElementById('atAddApiName');
    apiUrlInput = document.getElementById('atAddApiUrl');
    methodSelect = document.getElementById('atMethod');
    pathInput = document.getElementById('atPath');
    descInput = document.getElementById('atDescription');
    sendBtn = document.getElementById('atSendBtn');
}

function _wireEvents() {
    document.getElementById('atCloseBtn')?.addEventListener('click', closeApiToolPanel);
    panel?.addEventListener('click', (e) => { if (e.target === panel) closeApiToolPanel(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && _panelOpen) closeApiToolPanel(); });

    document.getElementById('atAddApiBtn')?.addEventListener('click', _handleAddApi);
    document.getElementById('atAddApiName')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') _handleAddApi(); });

    document.getElementById('atApiSaveBtn')?.addEventListener('click', _handleSaveApiConfig);
    document.getElementById('atApiDeleteBtn')?.addEventListener('click', _handleDeleteApi);
    document.getElementById('atAddEndpointBtn')?.addEventListener('click', _handleAddEndpoint);

    document.querySelectorAll('.at-tab').forEach(btn => {
        btn.addEventListener('click', (e) => _switchTab(e.target.dataset.tab));
    });

    document.getElementById('atSendBtn')?.addEventListener('click', _handleSendRequest);
    document.getElementById('atSaveEndpointBtn')?.addEventListener('click', _handleSaveEndpoint);
    document.getElementById('atCancelEditBtn')?.addEventListener('click', _handleCancelEdit);

    document.querySelector('.at-backdrop')?.addEventListener('click', closeApiToolPanel);
}

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
    _showTestPanel();
    _renderApiConfig();
    _renderEndpointsList();
}

function _showTestPanel() {
    document.getElementById('atEmptyTest').style.display = 'none';
    testPanel.style.display = 'flex';
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
    descInput.value = endpoint.description;
    _renderHeaders(endpoint.headers);
    document.getElementById('atBodyInput').value = endpoint.body;
    _renderParams(endpoint.params);
}

async function _handleAddApi() {
    const name = apiNameInput.value.trim();
    const url = apiUrlInput.value.trim();
    if (!name || !url) { alert('Please enter API name and URL'); return; }
    await createApi(name, url);
    apiNameInput.value = ''; apiUrlInput.value = '';
    _renderApiList();
}

async function _handleSaveApiConfig() {
    const name = document.getElementById('atApiName').value.trim();
    const url = document.getElementById('atApiUrl').value.trim();
    if (!name || !url) { alert('API name and URL are required'); return; }
    await updateApi(_selectedApiId, name, url);
    _renderApiList(); _renderApiConfig();
}

async function _handleDeleteApi() {
    if (!confirm('Delete this API and all its endpoints?')) return;
    await deleteApi(_selectedApiId);
    _selectedApiId = null; _selectedEndpointId = null;
    document.getElementById('atEmptyTest').style.display = 'flex';
    testPanel.style.display = 'none';
    _renderApiList();
}

async function _handleAddEndpoint() {
    const api = getApi(_selectedApiId);
    if (!api) return;
    await addEndpoint(_selectedApiId, 'GET', '/endpoint', '');
    _renderEndpointsList();
    const updated = getApi(_selectedApiId);
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
    const method = methodSelect.value;
    const path = pathInput.value.trim();
    const description = descInput.value.trim();
    if (!path) { alert('Path is required'); return; }
    const headers = _getHeadersFromForm();
    const body = document.getElementById('atBodyInput').value;
    const params = _getParamsFromForm();
    await updateEndpoint(_selectedApiId, _selectedEndpointId, method, path, description, headers, body, params);
    alert('Endpoint saved!');
    _renderEndpointsList();
}

async function _handleSendRequest() {
    if (!_selectedEndpointId) { alert('Please select or create an endpoint first'); return; }
    sendBtn.disabled = true; sendBtn.textContent = '⏳ Sending…';
    try {
        const response = await executeRequest(_selectedApiId, _selectedEndpointId);
        _displayResponse(response);
    } catch (err) {
        document.getElementById('atResponseDisplay').innerHTML = `<div class="at-error">
<strong>❌ Request Failed</strong><br/>${err.message}<br/>
<small>Check your URL and make sure the API is running</small></div>`;
        _switchTab('response');
    } finally {
        sendBtn.disabled = false; sendBtn.textContent = '▶ Send Request';
    }
}

function _handleCancelEdit() {
    document.getElementById('atRequestSection').style.display = 'none';
    _selectedEndpointId = null; _editingEndpointId = null;
    _renderEndpointsList();
}

function _displayResponse(response) {
    const responseDisplay = document.getElementById('atResponseDisplay');
    if (response.error) {
        responseDisplay.innerHTML = `<div class="at-error">
<strong>❌ Connection Error</strong><br/><code>${response.error}</code><br/><br/>
<small>• Check the URL is correct<br/>• Make sure the API server is running<br/>• Check CORS settings</small></div>`;
        _switchTab('response');
        return;
    }
    const statusClass = response.status >= 200 && response.status < 300 ? 'at-status-success' :
                        response.status >= 300 && response.status < 400 ? 'at-status-redirect' : 'at-status-error';
    const statusIcon = response.status >= 200 && response.status < 300 ? '✅' : '⚠️';
    const api = getApi(_selectedApiId);
    const endpoint = api?.endpoints.find(e => e.id === _selectedEndpointId);
    const fullUrl = api ? `${api.url}${endpoint.path}` : 'unknown';

    let bodyHtml = `<div class="at-response-meta">
<div>🔗 <strong>URL:</strong> <code>${fullUrl}</code></div>
<div>📊 <strong>Status:</strong> <span class="${statusClass}">${statusIcon} ${response.status}</span></div>
<div>⏱️ <strong>Time:</strong> ${new Date(response.timing).toLocaleTimeString()}</div>
<hr style="border:none;border-top:1px solid var(--border-subtle);margin:8px 0">
<div><strong>📦 Response Body:</strong></div>
</div><div class="at-response-code">`;

    if (!response.body || response.body === '') {
        bodyHtml += '<pre style="color:var(--text-muted)">(empty response)</pre>';
    } else if (typeof response.body === 'object') {
        bodyHtml += `<pre>${JSON.stringify(response.body, null, 2)}</pre>`;
    } else {
        try { bodyHtml += `<pre>${JSON.stringify(JSON.parse(response.body), null, 2)}</pre>`; }
        catch { bodyHtml += `<pre>${response.body}</pre>`; }
    }
    bodyHtml += '</div>';
    responseDisplay.innerHTML = bodyHtml;
    _switchTab('response');

    // Scroll so response is visible
    document.querySelector('.at-right-body')?.scrollTo({ top: 99999, behavior: 'smooth' });
}

/* ── Tab switching — uses CSS class, NOT inline display style ─── */
function _switchTab(tabName) {
    document.querySelectorAll('.at-tab').forEach(btn => {
        btn.classList.toggle('at-tab-active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.at-tab-content').forEach(content => {
        content.classList.remove('at-tab-content--visible');
    });
    document.getElementById(`at${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`)
        ?.classList.add('at-tab-content--visible');
}

function _renderHeaders(headers = {}) {
    const list = document.getElementById('atHeadersList');
    list.innerHTML = '';
    Object.entries(headers).forEach(([k, v]) => list.appendChild(_createKVRow('header', k, v)));
}
function _getHeadersFromForm() {
    const headers = {};
    document.querySelectorAll('#atHeadersList .at-kv-row').forEach(row => {
        const k = row.querySelector('input:nth-of-type(1)').value.trim();
        const v = row.querySelector('input:nth-of-type(2)').value.trim();
        if (k) headers[k] = v;
    });
    return headers;
}
function _renderParams(params = {}) {
    const list = document.getElementById('atParamsList');
    list.innerHTML = '';
    Object.entries(params).forEach(([k, v]) => list.appendChild(_createKVRow('param', k, v)));
}
function _getParamsFromForm() {
    const params = {};
    document.querySelectorAll('#atParamsList .at-kv-row').forEach(row => {
        const k = row.querySelector('input:nth-of-type(1)').value.trim();
        const v = row.querySelector('input:nth-of-type(2)').value.trim();
        if (k) params[k] = v;
    });
    return params;
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

document.addEventListener('click', (e) => {
    if (e.target.id === 'atAddHeaderBtn') document.getElementById('atHeadersList').appendChild(_createKVRow('header'));
    if (e.target.id === 'atAddParamBtn') document.getElementById('atParamsList').appendChild(_createKVRow('param'));
});