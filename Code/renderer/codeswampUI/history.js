export async function discoverOpencode() {
  try {
    return await window.electronAPI.opencode.discover();
  } catch {
    return { binaryPath: 'opencode', dataRoot: null, version: 'unknown' };
  }
}

export async function listConversations(repoPath) {
  try {
    return await window.electronAPI.opencode.listConversations(repoPath);
  } catch {
    return [];
  }
}

export async function getConversation(convId) {
  try {
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
