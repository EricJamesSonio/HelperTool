export const state = {
  open: false,

  tabs: [],
  activeTab: null,

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
