export const PROVIDERS = {
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    bin: 'opencode',
    shortLabel: 'OC',
    newChatCmd: () => 'opencode\r',
    resumeCmd: (sessionId) => `opencode -s ${sessionId}\r`,
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini CLI',
    bin: 'gemini',
    shortLabel: 'G',
    newChatCmd: () => 'gemini\r',
    resumeCmd: (sessionId) => `gemini --resume ${sessionId}\r`,
  },
};

export function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.opencode;
}

export function getProviderList() {
  return Object.values(PROVIDERS);
}
