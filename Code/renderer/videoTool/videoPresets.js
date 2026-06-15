const ICONS = {
  high: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="10,1 12.5,7 19,7.5 14,12 15.5,19 10,15.5 4.5,19 6,12 1,7.5 7.5,7"/></svg>',
  balanced: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="3" x2="10" y2="17"/><path d="M4 10h12"/><polygon points="4,10 8,6 8,14"/><polygon points="16,10 12,6 12,14"/></svg>',
  small: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h6l2 2h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 11l2 2 3-3"/></svg>',
};

export const PRESETS = {
  high: {
    id: 'high',
    label: 'High Quality',
    description: 'Best quality, moderate size reduction',
    icon: ICONS.high,
    crf: 21,
    maxHeight: 1080,
    audioBitrate: '160k',
    fps: null,
    estimatedReduction: '20-40%',
    reductionMidpoint: 0.30,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'Good quality, good size reduction',
    icon: ICONS.balanced,
    crf: 25,
    maxHeight: 1080,
    audioBitrate: '128k',
    fps: 30,
    estimatedReduction: '40-60%',
    reductionMidpoint: 0.50,
  },
  small: {
    id: 'small',
    label: 'Small Size',
    description: 'Smallest file, some quality loss',
    icon: ICONS.small,
    crf: 30,
    maxHeight: 720,
    audioBitrate: '96k',
    fps: 24,
    estimatedReduction: '60-80%',
    reductionMidpoint: 0.70,
  },
};

export const DEFAULT_PRESET = 'balanced';