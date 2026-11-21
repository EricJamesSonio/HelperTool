import { state } from '../app_manager/appState.js';

const WAIT_STEP = 120;
let repoSeen = false;
let chain = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(test, max) {
  const start = Date.now();
  while (Date.now() - start < max) {
    let ok = false;
    try {
      ok = !!test();
    } catch (_) {
      ok = false;
    }
    if (ok) return true;
    await sleep(WAIT_STEP);
  }
  return false;
}

function repoReady() {
  return repoSeen || !!state.cachedTree;
}

async function hasPendingRepo() {
  try {
    const project = await window.electronAPI.getActiveProject();
    return !!(project && project.repoPath);
  } catch (_) {
    return false;
  }
}

async function run(paths) {
  const list = Array.from(new Set((paths || []).filter((p) => typeof p === 'string' && p)));
  if (!list.length) return;
  if (!repoReady() && (await hasPendingRepo())) await waitFor(repoReady, 8000);
  if (!document.body.classList.contains('ide-mode')) {
    await waitFor(() => document.getElementById('ideModeBtn'), 10000);
    const btn = document.getElementById('ideModeBtn');
    if (btn && !document.body.classList.contains('ide-mode')) btn.click();
  }
  const ok = await waitFor(() => document.querySelector('#ideMain .ide-editor'), 15000);
  if (!ok) {
    console.warn('[IDE] open-with: the editor did not become ready');
    return;
  }
  for (const p of list) {
    document.dispatchEvent(new CustomEvent('ide:open-at', {
      detail: { path: p, line: 1, col: 0, len: 0 },
    }));
    await sleep(80);
  }
}

function queue(paths) {
  chain = chain.then(() => run(paths)).catch((err) => {
    console.error('[IDE] open-with failed:', err);
  });
  return chain;
}

export function init() {
  const api = window.openWithAPI;
  if (!api) return;
  document.addEventListener('repo:switched', () => {
    repoSeen = true;
  });
  api.onFiles((files) => {
    queue(files);
  });
  api.take()
    .then((files) => {
      if (files && files.length) queue(files);
    })
    .catch(() => {});
}