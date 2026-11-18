import { initCodeSwampUI, openCodeSwampUI, closeCodeSwampUI, isOpen } from './codeswampUI/index.js';
import { addRepo } from './codeswampUI/repoTabs.js';

let _initialized = false;

export async function init() {
  if (_initialized) return;
  _initialized = true;
  await initCodeSwampUI();
}

export function open() {
  if (!_initialized) {
    init().then(() => {
      openCodeSwampUI();
    });
  } else {
    openCodeSwampUI();
  }
}

export function close() {
  closeCodeSwampUI();
}

export function isCodeSwampOpen() {
  return isOpen();
}

export async function handleRepoChange(repoPath) {
  if (!repoPath) return;
  if (!_initialized) {
    await init();
  }
  await addRepo(repoPath);
}