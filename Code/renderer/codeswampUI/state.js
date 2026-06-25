export const state = {
  open: false,

  tabs: [],
  activeTab: null,

  activeSessionId: null,
  activeSessions: {},
  currentRepoPath: null,

  conversations: {},
  activeConvId: {},

  messages: {},
  messageCache: {},

  streaming: false,
  streamBuffer: '',
  activeConvIdForStream: null,
  activeTabForStream: null,

  pendingFiles: [],

  opencodePath: null,
  dataRoot: null,

  // Terminal settings
  terminalShells: [],
  selectedShell: null,
};

export function setActiveSession(id) {
  state.activeSessionId = id;
}

export function setCurrentRepoPath(path) {
  state.currentRepoPath = path;
}
