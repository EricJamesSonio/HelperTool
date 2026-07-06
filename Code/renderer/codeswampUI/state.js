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

  // AI provider
  selectedProvider: 'opencode',

  // Sidebar
  sidebarCollapsed: false,

  // Last sent message text (used by session detection for title)
  lastSentMessage: null,

  // CLI mode
  cliMode: 'plan',

  // Parallel mode
  parallelMode: false,
  parallelSlots: 2,
  activeSlotIndex: 0,
  slotData: {},
};


