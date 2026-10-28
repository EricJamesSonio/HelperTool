export const AUTO_KEY = 'ft_auto';
export const POLL_MS = 700;

export const state = {
  busy: false,
  runId: 0,
  auto: true,
  lastSeen: '',
  review: null,
  selected: -1,
  view: 'diff',
  timer: null,
  wired: false,
};

export function loadAuto() {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0';
  } catch (_) {
    return true;
  }
}

export function saveAuto(on) {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0');
  } catch (_) { /* storage unavailable */ }
}