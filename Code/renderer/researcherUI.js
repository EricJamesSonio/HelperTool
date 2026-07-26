import { initResearcher, openResearcher, closeResearcher, isOpen } from './researcher/index.js';

let _initialized = false;

export async function init() {
  if (_initialized) return;
  _initialized = true;
  initResearcher();
}

export function open() {
  if (!_initialized) {
    init().then(() => openResearcher());
  } else {
    openResearcher();
  }
}

export function close() {
  closeResearcher();
}

export function isResearcherOpen() {
  return isOpen();
}