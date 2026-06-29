export async function discoverOpencode() {
  try {
    return await window.electronAPI.opencode.discover();
  } catch {
    return { binaryPath: 'opencode', dataRoot: null, version: 'unknown' };
  }
}

export async function listConversations(repoPath, provider = 'opencode') {
  try {
    let convs;
    if (provider === 'gemini') {
      convs = await window.electronAPI.gemini.listConversations(repoPath);
    } else {
      convs = await window.electronAPI.opencode.listConversations(repoPath);
    }
    return { conversations: (convs || []).map(c => ({ ...c, provider })), error: null };
  } catch (err) {
    return { conversations: [], error: err.message || 'Failed to fetch' };
  }
}

export async function getConversation(convId, provider = 'opencode') {
  try {
    if (provider === 'gemini') return null; // Gemini doesn't support message export
    return await window.electronAPI.opencode.getConversation(convId);
  } catch {
    return null;
  }
}

export async function listRepos() {
  try {
    return await window.electronAPI.opencode.listRepos();
  } catch {
    return [];
  }
}
