import { state } from '../app_manager/appState.js';
import { selectSearchItem } from '../searchManager.js';

const CLOSE_SELECTOR = '.git-tool-panel-close-btn';
const CLOSE_WAIT_MS = 80;
const PULSE_LEN = 200;

function isIdeMode() {
  return document.body.classList.contains('ide-mode');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildAbsolutePath(repoPath, file) {
  const root = String(repoPath || '').replace(/[\\/]+$/, '');
  const sep = root.indexOf('\\') !== -1 ? '\\' : '/';
  const rel = String(file || '')
    .replace(/^[\\/]+/, '')
    .replace(/[\\/]+$/, '')
    .replace(/[\\/]/g, sep);
  return root + sep + rel;
}

function closeGitPanel() {
  const btn = document.querySelector(CLOSE_SELECTOR);
  if (!btn) return false;
  btn.click();
  return true;
}

async function isFolder(absPath) {
  const api = window.ideAPI;
  if (!api || typeof api.readDir !== 'function') return false;
  try {
    const res = await api.readDir(absPath);
    return !!(res && res.success);
  } catch (_) {
    return false;
  }
}

async function firstChangedLine(root, absPath) {
  const api = window.ideLineAPI;
  if (!api || typeof api.diff !== 'function') return 1;
  try {
    const res = await api.diff(root, absPath);
    if (!res || !res.success) return 1;
    if (res.kind === 'new') return 1;
    const hunks = res.hunks || [];
    if (!hunks.length) return 1;
    const first = hunks[0];
    return Math.max(1, first.nc > 0 ? first.ns : first.ns + 1);
  } catch (_) {
    return 1;
  }
}

export async function openChangedFile(opts) {
  const repoPath = opts && opts.repoPath;
  const file = opts && opts.file;
  const status = opts && opts.status;
  if (!repoPath || !file) return { success: false, error: 'No file to open' };
  if (status === 'D') return { success: false, error: 'This file was deleted, so there is nothing to open' };

  const abs = buildAbsolutePath(repoPath, file);
  const ide = isIdeMode();
  let folder = false;
  let line = 1;

  if (ide) {
    folder = await isFolder(abs);
    if (!folder) line = await firstChangedLine(state.selectedRepoPath || repoPath, abs);
  }

  if (closeGitPanel()) await wait(CLOSE_WAIT_MS);

  if (!ide) {
    selectSearchItem(abs);
    return { success: true };
  }

  if (folder) {
    document.dispatchEvent(new CustomEvent('ide:reveal-folder', { detail: { path: abs } }));
    return { success: true };
  }

  document.dispatchEvent(new CustomEvent('ide:open-at', {
    detail: { path: abs, line, col: 0, len: PULSE_LEN },
  }));
  return { success: true };
}