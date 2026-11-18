import { PROVIDERS } from './providers.js';
import { DEFAULT_PREFERENCES } from '../defaultPreferences.js';

function loadProvider() {
  try {
    const saved = localStorage.getItem('helpertool-cs-provider');
    if (saved && PROVIDERS[saved]) return saved;
  } catch (_) {}
  return DEFAULT_PREFERENCES.codeSwamp.provider;
}

function loadModalView() {
  try {
    const saved = localStorage.getItem('helpertool-cs-modal');
    return saved === null ? DEFAULT_PREFERENCES.codeSwamp.modalView : saved === '1';
  } catch (_) {
    return DEFAULT_PREFERENCES.codeSwamp.modalView;
  }
}

function loadNotifyOnDone() {
  try {
    const saved = localStorage.getItem('helpertool-cs-notify');
    return saved === null ? DEFAULT_PREFERENCES.codeSwamp.notifyOnDone : saved !== '0';
  } catch (_) {
    return DEFAULT_PREFERENCES.codeSwamp.notifyOnDone;
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

  // Desktop notification when an AI provider finishes responding
  notifyOnDone: loadNotifyOnDone(),

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