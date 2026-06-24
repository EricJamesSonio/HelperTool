import { initOpencodeUI, openOpencodeUI, closeOpencodeUI, isOpen } from './opencodeUI/index.js';

let _initialized = false;

export async function init() {
  if (_initialized) return;
  _initialized = true;
  await initOpencodeUI();
}

export function open() {
  if (!_initialized) init().then(() => openOpencodeUI());
  else openOpencodeUI();
}

export function close() {
  closeOpencodeUI();
}

export function isOpencodeOpen() {
  return isOpen();
}
