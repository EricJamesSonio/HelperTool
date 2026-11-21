import { state } from '../app_manager/appState.js';
import { renderDetails, renderLoading, renderMessage, ICON } from './view.js';
import { esc, ago } from './format.js';

let btn = null;
let overlay = null;
let bodyEl = null;
let chipEl = null;
let updatedEl = null;
let refreshBtn = null;
let seq = 0;
let copyTimer = 0;

function injectCss() {
  if (document.getElementById('repoDetailsCss')) return;
  const link = document.createElement('link');
  link.id = 'repoDetailsCss';
  link.rel = 'stylesheet';
  link.href = './styles/repo-details.css';
  document.head.appendChild(link);
}

function repoName(p) {
  const parts = String(p || '').split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

export function isOpen() {
  return !!overlay && overlay.classList.contains('rd-open');
}

function openUrl(url) {
  if (url && window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(url);
}

function flashCopied(el) {
  const label = el.querySelector('span');
  if (!label) return;
  const old = label.textContent;
  label.textContent = 'Copied';
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    label.textContent = old;
  }, 1500);
}

function copy(el) {
  const text = el.dataset.copy;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => flashCopied(el)).catch(() => {});
}

function onClick(e) {
  const act = e.target.closest('[data-rd]');
  if (act) {
    if (act.dataset.rd === 'close') close();
    else if (act.dataset.rd === 'refresh') load(true);
    return;
  }
  const cp = e.target.closest('[data-copy]');
  if (cp) {
    copy(cp);
    return;
  }
  const link = e.target.closest('[data-url]');
  if (link) openUrl(link.dataset.url);
}

function onKey(e) {
  if (e.key !== 'Escape' || !isOpen()) return;
  e.preventDefault();
  e.stopPropagation();
  close();
}

function build() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'rd-overlay';
  overlay.innerHTML =
    '<div class="rd-container">' +
      '<div class="rd-header">' +
        '<h2>' + ICON.repo + '<span>Repository details</span></h2>' +
        '<span class="rd-chip" id="rdChip"></span>' +
        '<div class="rd-header-right">' +
          '<span class="rd-updated" id="rdUpdated"></span>' +
          '<button type="button" class="rd-btn" data-rd="refresh" id="rdRefresh" title="Reload from GitHub">Refresh</button>' +
          '<button type="button" class="rd-btn rd-close" data-rd="close" title="Close (Esc)">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="rd-body" id="rdBody"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  bodyEl = overlay.querySelector('#rdBody');
  chipEl = overlay.querySelector('#rdChip');
  updatedEl = overlay.querySelector('#rdUpdated');
  refreshBtn = overlay.querySelector('#rdRefresh');
  overlay.addEventListener('click', onClick);
  overlay.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG') t.remove();
  }, true);
  document.addEventListener('keydown', onKey, true);
}

async function load(force) {
  if (!isOpen()) return;
  const my = ++seq;
  const repo = state.selectedRepoPath || '';
  const name = repoName(repo);
  chipEl.textContent = name;
  chipEl.style.display = name ? '' : 'none';
  updatedEl.textContent = '';
  if (!repo) {
    bodyEl.innerHTML = renderMessage('No repo selected', 'Open a repository first.');
    return;
  }
  const api = window.repoDetailsAPI;
  if (!api) {
    bodyEl.innerHTML = renderMessage('Restart required', 'Fully restart the app to enable repository details.');
    return;
  }
  bodyEl.innerHTML = renderLoading();
  refreshBtn.disabled = true;
  let res = null;
  try {
    res = await api.get({ repoPath: repo, force: !!force });
  } catch (err) {
    res = { success: false, error: err && err.message ? err.message : 'Request failed' };
  }
  if (my !== seq) return;
  refreshBtn.disabled = false;
  if (!res || !res.success) {
    bodyEl.innerHTML = renderMessage('Could not load repository details', (res && res.error) || 'Unknown error');
    return;
  }
  bodyEl.innerHTML = renderDetails(res.data);
  bodyEl.scrollTop = 0;
  updatedEl.textContent = res.data && res.data.fetchedAt ? 'Updated ' + ago(new Date(res.data.fetchedAt).toISOString()) : '';
}

export async function open() {
  if (isOpen()) return;
  try {
    const tools = await import('../app_manager/toolsManager.js');
    tools.closeAllPanels();
  } catch (_) {
    // the page still opens without closing other panels
  }
  build();
  overlay.classList.add('rd-open');
  if (btn) btn.classList.add('active');
  load(false);
}

export function close() {
  if (!overlay || !isOpen()) return;
  overlay.classList.remove('rd-open');
  if (btn) btn.classList.remove('active');
  seq++;
}

function createButton() {
  if (document.getElementById('repoDetailsBtn')) return;
  const anchor = document.getElementById('notesBtn');
  if (!anchor || !anchor.parentElement) return;
  btn = document.createElement('button');
  btn.id = 'repoDetailsBtn';
  btn.type = 'button';
  btn.className = 'tool-btn';
  btn.title = 'Repository details (GitHub page, owner, contributors)';
  btn.setAttribute('aria-label', 'Repository details');
  btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5"/><circle cx="10" cy="6.3" r="0.6" fill="currentColor"/></svg>';
  btn.addEventListener('click', () => {
    if (isOpen()) close();
    else open();
  });
  anchor.insertAdjacentElement('afterend', btn);
}

function init() {
  injectCss();
  createButton();
  document.addEventListener('repo:switched', () => {
    if (isOpen()) load(false);
  });
  document.addEventListener('ide:close-search', () => close());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}