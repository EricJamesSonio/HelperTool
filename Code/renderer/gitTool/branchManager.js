/**
 * branchManager.js
 * Entry point — mounts the Branch Manager panel into the gitTool DOM.
 * gitToolUI calls branchManager.open(repoPath) when the Branches button is clicked.
 */
import * as branchManager from './branchManager/index.js';

export function open(repoPath) {
  branchManager.open(repoPath);
}

export function close() {
  branchManager.close();
}

export function isOpen() {
  return branchManager.isOpen();
}
