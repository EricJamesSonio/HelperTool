/**
 * renderer/graphify/graphifyClient.js
 * Thin fetch wrapper that calls the graphify-service HTTP server.
 */

/**
 * @param {string} query  - Natural language query
 * @param {string|null} repoPath - Optional, passed to server for repo scoping
 * @param {number} port
 * @returns {Promise<{ files: string[], scores: {file:string, score:number}[], explanation: string, ms: number }>}
 */
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