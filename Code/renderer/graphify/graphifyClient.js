const _base = (port) => `http://127.0.0.1:${port}`;

function _fetchWithTimeout(url, options, timeoutMs) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    fetch(url, { ...options, signal: controller.signal })
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

export async function fetchEndpoints(port = 3333) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/endpoints`, {}, 10000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function queryGraphify(query, repoPath = null, port = 3333) {
  const res = await _fetchWithTimeout(`${_base(port)}/graph/relevant-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, repoPath }),
  }, 30000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function checkHealth(port = 3333) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/health`, {}, 5000);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchInfo(port = 3333) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/info`, {}, 10000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Knowledge-graph API methods ──

export async function fetchGraphData(port = 3333) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/graph/data`, {}, 30000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchGraphReport(port = 3333) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/graph/report`, {}, 30000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchGraphCommunities(port = 3333) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/graph/communities`, {}, 30000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchGraphStats(port = 3333) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/graph/stats`, {}, 30000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function searchGraphNodes(query, port = 3333, limit = 20) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/graph/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    }, 15000);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

export async function getGraphNeighborhood(nodeId, port = 3333, depth = 1) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/graph/neighborhood`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, depth }),
    }, 15000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getGraphShortestPath(from, to, port = 3333) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/graph/shortest-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    }, 15000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getGraphAffected(nodeId, port = 3333, depth = 1) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/graph/affected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, depth }),
    }, 15000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── AI-enrichment export APIs ──

export async function exportSymbolIndex(port = 3333) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/export/all`, { method: 'POST' }, 30000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateAIPrompt(port = 3333) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/export/prompt`, { method: 'POST' }, 30000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function testEndpoint(method, path, port = 3333) {
  const url = `${_base(port)}${path}`;
  const startTime = Date.now();
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (method === 'POST') options.body = '{}';
  let res;
  try {
    res = await _fetchWithTimeout(url, options, 15000);
  } catch (err) {
    return { data: null, statusCode: 0, elapsed: Date.now() - startTime, error: err.message };
  }
  const elapsed = Date.now() - startTime;
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch { data = null; }
  } else {
    try { data = await res.text(); } catch { data = null; }
  }
  return { data, statusCode: res.status, elapsed, error: null };
}

export async function loadGraphFromStorage(port = 3333) {
  try {
    const res = await _fetchWithTimeout(`${_base(port)}/graph/from-storage`, {}, 15000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
