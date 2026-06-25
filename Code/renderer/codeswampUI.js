import { initCodeSwampUI, openCodeSwampUI, closeCodeSwampUI, isOpen } from './codeswampUI/index.js';
import { addRepo } from './codeswampUI/repoTabs.js';
import { refreshSidebar } from './codeswampUI/sidebar.js';

let _initialized = false;

export async function init() {
  if (_initialized) return;
  _initialized = true;
  await initCodeSwampUI();
}

export function open() {
  console.log('[CS] open(), _initialized:', _initialized);
  if (!_initialized) {
    console.log('[CS] first open — calling init');
    init().then(() => {
      console.log('[CS] init done, now openCodeSwampUI');
      openCodeSwampUI();
    });
  } else {
    console.log('[CS] already initialized, direct open');
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
  console.log('[CS] handleRepoChange:', repoPath);
  if (!repoPath) return;
  if (!_initialized) {
    console.log('[CS] handleRepoChange: not initialized yet, initializing');
    await init();
  }
  await addRepo(repoPath);
  await refreshSidebar();
}
