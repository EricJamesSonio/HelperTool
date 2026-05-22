const STORAGE_KEY = 'helpertool-shortcuts';

const DEFAULT_SHORTCUTS = {
  apiTool:       null,
  gitTool:       null,
  promptTool:    null,
  settings:      null,
  secretHolder:  null,
  workspaceTool: null,
};

const S = { shortcuts: {} };

function loadShortcuts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    S.shortcuts = raw ? { ...DEFAULT_SHORTCUTS, ...JSON.parse(raw) } : { ...DEFAULT_SHORTCUTS };
  } catch {
    S.shortcuts = { ...DEFAULT_SHORTCUTS };
  }
  return S.shortcuts;
}

function saveShortcuts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(S.shortcuts));
}

export { S, loadShortcuts, saveShortcuts, DEFAULT_SHORTCUTS, STORAGE_KEY };
