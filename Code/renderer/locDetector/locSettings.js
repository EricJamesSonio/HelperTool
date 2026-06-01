/**
 * locSettings.js
 * Responsible for persisting and loading LOC detector settings.
 * Single responsibility: settings state only.
 */

const STORAGE_KEY = 'loc-settings';
const DEFAULTS = { threshold: 200, mode: 'above' };

export default class LocSettings {
  constructor() {
    this.threshold = DEFAULTS.threshold;
    this.mode = DEFAULTS.mode;
  }

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.threshold = parsed.threshold ?? DEFAULTS.threshold;
        this.mode = parsed.mode ?? DEFAULTS.mode;
      }
    } catch {}
    return this;
  }

  save(threshold, mode) {
    this.threshold = threshold;
    this.mode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ threshold: this.threshold, mode: this.mode }));
    } catch {}
  }
}