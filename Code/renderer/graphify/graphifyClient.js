const _base = (port) => `http://127.0.0.1:${port}`;

export async function fetchEndpoints(port = 3333) {
  try {
    const res = await fetch(`${_base(port)}/endpoints`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function queryGraphify(query, repoPath = null, port = 3333) {
  const res = await fetch(`${_base(port)}/graph/relevant-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, repoPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function checkHealth(port = 3333) {
  try {
    const res = await fetch(`${_base(port)}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchInfo(port = 3333) {
  try {
    const res = await fetch(`${_base(port)}/info`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Knowledge-graph API methods ──

export async function fetchGraphData(port = 3333) {
  try {
    const res = await fetch(`${_base(port)}/graph/data`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchGraphReport(port = 3333) {
  try {
    const res = await fetch(`${_base(port)}/graph/report`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchGraphCommunities(port = 3333) {
  try {
    const res = await fetch(`${_base(port)}/graph/communities`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchGraphStats(port = 3333) {
  try {
    const res = await fetch(`${_base(port)}/graph/stats`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function searchGraphNodes(query, port = 3333, limit = 20) {
  try {
    const res = await fetch(`${_base(port)}/graph/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

export async function getGraphNeighborhood(nodeId, port = 3333, depth = 1) {
  try {
    const res = await fetch(`${_base(port)}/graph/neighborhood`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, depth }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getGraphShortestPath(from, to, port = 3333) {
  try {
    const res = await fetch(`${_base(port)}/graph/shortest-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getGraphAffected(nodeId, port = 3333, depth = 1) {
  try {
    const res = await fetch(`${_base(port)}/graph/affected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, depth }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
