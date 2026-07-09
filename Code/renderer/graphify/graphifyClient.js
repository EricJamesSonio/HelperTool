export async function fetchEndpoints(port = 3333) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/endpoints`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function queryGraphify(query, repoPath = null, port = 3333) {
  const res = await fetch(`http://127.0.0.1:${port}/graph/relevant-code`, {
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
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchInfo(port = 3333) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/info`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
