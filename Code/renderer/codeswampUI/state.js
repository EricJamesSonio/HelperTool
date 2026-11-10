import { PROVIDERS } from './providers.js';

function loadProvider() {
  try {
    const saved = localStorage.getItem('helpertool-cs-provider');
    if (saved && PROVIDERS[saved]) return saved;
  } catch (_) {}
  return 'opencode';
}

function loadModalView() {
  try {
    return localStorage.getItem('helpertool-cs-modal') === '1';
  } catch (_) {
    return false;
  }
}

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
  selectedProvider: loadProvider(),

  // Sidebar
  sidebarCollapsed: false,

  // Show Code Swamp in the modal even when parallel mode is off
  modalView: loadModalView(),

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