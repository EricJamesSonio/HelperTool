function q(p) {
  return /[\s]/.test(p || '') ? `"${p}"` : (p || '');
}

export const PROVIDERS = {
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    bin: 'opencode',
    shortLabel: 'OC',
    newChatCmd: (binaryPath) => `${q(binaryPath) || 'opencode'}\r`,
    resumeCmd: (sessionId, binaryPath) => `${q(binaryPath) || 'opencode'} -s ${sessionId}\r`,
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini CLI',
    bin: 'gemini',
    shortLabel: 'G',
    newChatCmd: (binaryPath) => `${q(binaryPath) || 'gemini'}\r`,
    resumeCmd: (sessionId, binaryPath) => `${q(binaryPath) || 'gemini'} --resume ${sessionId}\r`,
  },
};

export function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.opencode;
}

export function getProviderList() {
  return Object.values(PROVIDERS);
}
