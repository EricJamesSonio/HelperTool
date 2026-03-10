/**
 * apiTool.js
 * Core API management: CRUD operations, storage, request execution
 */

let _apis = [];
let _initialized = false;

/**
 * Initialize: Load APIs from IPC storage
 */
export async function initApiTool() {
    if (_initialized) return;
    _initialized = true;
    try {
        _apis = await window.electronAPI?.apiToolGetAll?.() || [];
        console.log('[API Tool] Initialized with', _apis.length, 'APIs');
    } catch (err) {
        console.error('[API Tool] Failed to init:', err);
        _apis = [];
    }
}

/**
 * Get all saved APIs
 */
export function getAllApis() {
    return [..._apis];
}

/**
 * Get single API by ID
 */
export function getApi(id) {
    return _apis.find(api => api.id === id);
}

/**
 * Create new API config
 */
export async function createApi(name, host, port) {
    const api = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: name.trim(),
        host: host.trim(),
        port: parseInt(port) || 3000,
        baseUrl: '',
        endpoints: [],
        createdAt: new Date().toISOString(),
    };
    _apis.push(api);
    await _saveApis();
    return api;
}

/**
 * Update API config
 */
export async function updateApi(id, name, host, port, baseUrl) {
    const api = getApi(id);
    if (!api) return false;
    api.name = name.trim();
    api.host = host.trim();
    api.port = parseInt(port) || 3000;
    api.baseUrl = baseUrl.trim();
    await _saveApis();
    return true;
}

/**
 * Delete API config
 */
export async function deleteApi(id) {
    const idx = _apis.findIndex(api => api.id === id);
    if (idx === -1) return false;
    _apis.splice(idx, 1);
    await _saveApis();
    return true;
}

/**
 * Add endpoint to API
 */
export async function addEndpoint(apiId, method, path, description = '') {
    const api = getApi(apiId);
    if (!api) return null;
    const endpoint = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        method: method.toUpperCase(),
        path: path.trim(),
        description: description.trim(),
        headers: {},
        body: '',
        params: {},
        lastUsed: null,
    };
    api.endpoints.push(endpoint);
    await _saveApis();
    return endpoint;
}

/**
 * Update endpoint
 */
export async function updateEndpoint(apiId, endpointId, method, path, description, headers, body, params) {
    const api = getApi(apiId);
    if (!api) return false;
    const endpoint = api.endpoints.find(e => e.id === endpointId);
    if (!endpoint) return false;
    endpoint.method = method.toUpperCase();
    endpoint.path = path.trim();
    endpoint.description = description.trim();
    endpoint.headers = headers || {};
    endpoint.body = body || '';
    endpoint.params = params || {};
    await _saveApis();
    return true;
}

/**
 * Delete endpoint
 */
export async function deleteEndpoint(apiId, endpointId) {
    const api = getApi(apiId);
    if (!api) return false;
    const idx = api.endpoints.findIndex(e => e.id === endpointId);
    if (idx === -1) return false;
    api.endpoints.splice(idx, 1);
    await _saveApis();
    return true;
}

/**
 * Execute API request (returns response)
 */
export async function executeRequest(apiId, endpointId) {
    const api = getApi(apiId);
    if (!api) return { error: 'API not found' };
    const endpoint = api.endpoints.find(e => e.id === endpointId);
    if (!endpoint) return { error: 'Endpoint not found' };

    try {
        const url = `http://${api.host}:${api.port}${api.baseUrl}${endpoint.path}`;
        const options = {
            method: endpoint.method,
            headers: {
                'Content-Type': 'application/json',
                ...endpoint.headers,
            },
        };

        if (endpoint.body && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
            options.body = endpoint.body;
        }

        const response = await fetch(url, options);
        const data = await response.text();
        
        // Try to parse JSON, fallback to text
        let body;
        try {
            body = JSON.parse(data);
        } catch {
            body = data;
        }

        endpoint.lastUsed = new Date().toISOString();
        await _saveApis();

        return {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: body,
            timing: new Date().toISOString(),
        };
    } catch (err) {
        return {
            error: err.message,
            timing: new Date().toISOString(),
        };
    }
}

/**
 * Private: Save all APIs to storage
 */
async function _saveApis() {
    try {
        await window.electronAPI?.apiToolSaveAll?.(_apis);
    } catch (err) {
        console.error('[API Tool] Failed to save:', err);
    }
}