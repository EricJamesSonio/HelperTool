import { initCodeSwampUI, openCodeSwampUI, closeCodeSwampUI, isOpen, ensureFirstChat as ensureChat } from './codeswampUI/index.js';
import { addRepo } from './codeswampUI/repoTabs.js';

let _initPromise = null;

export function init() {
  if (!_initPromise) {
    _initPromise = initCodeSwampUI().catch((err) => {
      _initPromise = null;
      throw err;
    });
  }
  return _initPromise;
}

export async function open() {
  await init();
  openCodeSwampUI();
}

export function close() {
  closeCodeSwampUI();
}

export function isCodeSwampOpen() {
  return isOpen();
}

export function ensureFirstChat() {
  return ensureChat();
}

export async function handleRepoChange(repoPath) {
  if (!repoPath) return;
  if (!_initPromise) return;
  await _initPromise;
  await addRepo(repoPath);
}