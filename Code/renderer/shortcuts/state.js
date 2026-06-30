const STORAGE_KEY = 'helpertool-shortcuts';

const DEFAULT_SHORTCUTS = {
  apiTool:       null,
  gitTool:       null,
  promptTool:    null,
  settings:      null,
  secretHolder:  null,
  workspaceTool: null,
  symbolIndex:   null,
  canvasTool:    null,
  exitInput:     null,
  portManagerTool: null,
  teamActivityTool: null,
  envManager: null,
  codebbaseChat: null,
  videoTool: null,
  gmailTool: null,
  automationSketch: null,
  githubExplorer: null,
  codeswampChat: null,
  codebaseMap: 'Ctrl+Shift+M',
  uiLayoutHelper: null,
};

const S = { shortcuts: {} };

function loadShortcuts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let data = raw ? JSON.parse(raw) : {};

    // Migrate old opencodeChat → codeswampChat
    if (data.opencodeChat !== undefined) {
      if (data.codeswampChat === undefined || data.codeswampChat === null) {
        data.codeswampChat = data.opencodeChat;
      }
      delete data.opencodeChat;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    S.shortcuts = { ...DEFAULT_SHORTCUTS, ...data };
  } catch {
    S.shortcuts = { ...DEFAULT_SHORTCUTS };
  }
  return S.shortcuts;
}

function saveShortcuts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(S.shortcuts));
}

export { S, loadShortcuts, saveShortcuts, DEFAULT_SHORTCUTS, STORAGE_KEY };
