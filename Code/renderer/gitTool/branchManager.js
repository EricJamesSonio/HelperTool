import * as bm from './branchManager/index.js';

export function open(container, repoPath, onClose) {
  bm.open(container, repoPath, onClose);
}

export function close() {
  bm.close();
}

export function isOpen() {
  return bm.isOpen();
}
