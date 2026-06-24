import { initOpencodeUI, openOpencodeUI, closeOpencodeUI, isOpen } from './opencodeUI/index.js';
import { addRepo } from './opencodeUI/repoTabs.js';
import { refreshSidebar } from './opencodeUI/sidebar.js';

let _initialized = false;

export async function init() {
  if (_initialized) return;
  _initialized = true;
  await initOpencodeUI();
}

export function open() {
  console.log('[CS] open(), _initialized:', _initialized);
  if (!_initialized) {
    console.log('[CS] first open — calling init');
    init().then(() => {
      console.log('[CS] init done, now openOpencodeUI');
      openOpencodeUI();
    });
  } else {
    console.log('[CS] already initialized, direct open');
    openOpencodeUI();
  }
}

export function close() {
  closeOpencodeUI();
}

export function isOpencodeOpen() {
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
