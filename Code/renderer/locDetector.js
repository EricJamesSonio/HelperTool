/**
 * locDetector.js
 * Main integration module for LOC Detector.
 * Mirrors the GitTool pattern: composes sub-modules, owns lifecycle.
 */

import LocScanner      from './locDetector/locScanner.js';
import LocSettings     from './locDetector/locSettings.js';
import LocToolUI       from './locDetector/locToolUI.js';

export default class LocDetector {
  constructor() {
    this.scanner  = new LocScanner();
    this.settings = new LocSettings();
    this.ui       = null;
  }

  initialize() {
    this.settings.load();
    return { success: true };
  }

  render(container) {
    this.ui = new LocToolUI(this.scanner, this.settings);
    this.ui.render(container);
  }

  destroy() {
    this.ui = null;
  }
}

// Named export for toolsManager lazy import compatibility
export function initLocDetector(container) {
  const tool = new LocDetector();
  tool.initialize();
  tool.render(container);
}