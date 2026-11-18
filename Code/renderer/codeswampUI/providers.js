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
    completion: {
      idleMs: 3200,
      minOutputChars: 40,
      minElapsedMs: 1500,
    },
  },
  cline: {
    id: 'cline',
    label: 'Cline',
    bin: 'cline',
    shortLabel: 'CL',
    newChatCmd: () => 'cline\r',
    resumeCmd: () => 'cline\r',
    completion: {
      idleMs: 2600,
      minOutputChars: 30,
      minElapsedMs: 1200,
    },
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini CLI',
    bin: 'gemini',
    shortLabel: 'G',
    newChatCmd: (binaryPath) => `${q(binaryPath) || 'gemini'}\r`,
    resumeCmd: (sessionId, binaryPath) => `${q(binaryPath) || 'gemini'} --resume ${sessionId}\r`,
    completion: {
      idleMs: 3000,
      minOutputChars: 40,
      minElapsedMs: 1500,
    },
  },
  copilot: {
    id: 'copilot',
    label: 'GitHub Copilot',
    bin: 'copilot',
    shortLabel: 'CP',
    newChatCmd: (binaryPath) => `${q(binaryPath) || 'copilot'}\r`,
    resumeCmd: (sessionId, binaryPath) => `${q(binaryPath) || 'copilot'} --resume=${sessionId}\r`,
    completion: {
      idleMs: 3000,
      minOutputChars: 40,
      minElapsedMs: 1500,
    },
  },
};

export function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.opencode;
}

export function getProviderList() {
  return Object.values(PROVIDERS);
}
