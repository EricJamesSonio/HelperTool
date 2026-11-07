import { state } from '../app_manager/appState.js';
import { esc } from './highlight.js';

const SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
const I_DIFF = SVG + '<rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M8 2.5v11"/><path d="M4.5 6h1.5M10 9h1.5M10.75 8.25v1.5"/></svg>';
const I_RELOAD = SVG + '<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2.5v3h-3"/></svg>';
const I_EYE = SVG + '<path d="M1.5 8s2.3-4.5 6.5-4.5S14.5 8 14.5 8s-2.3 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>';

const TEMPLATE =
  '<div class="ide-section ide-diff collapsed">' +
    '<div class="ide-section-head">' +
      '<span class="ide-sec-chev"></span><span class="ide-sec-name">Diff Viewer</span>' +
      '<span class="ide-sec-actions">' +
        '<button type="button" class="ide-sec-btn" data-act="open-diff" title="Open the latest change of this file">' + I_DIFF + '</button>' +
        '<button type="button" class="ide-sec-btn" data-act="diff-reload" title="Reload history">' + I_RELOAD + '</button>' +
      '</span>' +
    '</div>' +
    '<div class="ide-sec-body ide-diff-body"><div class="ide-empty">Open a file to see its commits.</div></div>' +
  '</div>' +
  '<div class="ide-section ide-deps collapsed">' +
    '<div class="ide-section-head">' +
      '<span class="ide-sec-chev"></span><span class="ide-sec-name">Dependencies</span>' +
      '<span class="ide-sec-actions">' +
        '<button type="button" class="ide-sec-btn" data-act="deps-reload" title="Reload dependencies">' + I_RELOAD + '</button>' +
      '</span>' +
    '</div>' +
    '<div class="ide-sec-body ide-deps-body"><div class="ide-empty">Open a file to see its dependencies.</div></div>' +
  '</div>';

const CACHE_MAX = 30;

let diffEl = null;
let depsEl = null;
let diffBody = null;
let depsBody = null;
let handlers = {};
let activePath = null;
let loadedDiffFor = null;
let diffToken = 0;
let commitCache = new Map();
let currentCommits = [];
let depsUI = null;
let depsRepo = null;
let depsFor = null;
let depsToken = 0;

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function metaOf(c) {
  const author = c.author_name || c.author || c.authorName || '';
  const raw = c.date || c.authorDate || c.author_date || '';
  let ds = '';
  if (raw) {
    const t = new Date(raw);
    ds = isNaN(t.getTime()) ? String(raw).slice(0, 10) : t.toLocaleDateString();
  }
  return [author, ds].filter(Boolean).join(' - ');
}

function labelOf(c) {
  return String(c.hash).slice(0, 7) + '  ' + (c.message || '');
}

function cacheSet(key, val) {
  if (commitCache.has(key)) commitCache.delete(key);
  commitCache.set(key, val);
  if (commitCache.size > CACHE_MAX) commitCache.delete(commitCache.keys().next().value);
}

async function fetchCommits(repo, p) {
  let commits = commitCache.get(p);
  if (!commits) {
    try {
      const res = await window.electronAPI.git.fileLog(repo, p, 100);
      commits = res && res.success && Array.isArray(res.commits) ? res.commits : [];
    } catch (_) {
      commits = [];
    }
    cacheSet(p, commits);
  }
  return commits;
}

function renderCommits(commits) {
  if (!commits.length) {
    diffBody.innerHTML = '<div class="ide-empty">No commit history for this file.</div>';
    return;
  }
  diffBody.innerHTML = commits.map((c) => {
    const meta = metaOf(c);
    return '<div class="ide-cm" data-hash="' + attr(c.hash) + '" title="' + attr(c.message || '') + '">' +
      '<div class="ide-cm-main">' +
        '<span class="ide-cm-hash">' + esc(String(c.hash).slice(0, 7)) + '</span>' +
        '<span class="ide-cm-msg">' + esc(c.message || '') + '</span>' +
        '<button type="button" class="ide-cm-view" data-hash="' + attr(c.hash) + '" title="View file at this commit">' + I_EYE + '</button>' +
      '</div>' +
      (meta ? '<div class="ide-cm-meta">' + esc(meta) + '</div>' : '') +
    '</div>';
  }).join('');
}

async function loadDiff() {
  if (diffEl.classList.contains('collapsed')) return;
  if (!activePath) {
    diffBody.innerHTML = '<div class="ide-empty">Open a file to see its commits.</div>';
    loadedDiffFor = null;
    currentCommits = [];
    return;
  }
  const repo = state.selectedRepoPath;
  const myPath = activePath;
  const marker = repo + '|' + myPath;
  if (loadedDiffFor === marker) return;
  const token = ++diffToken;
  if (!commitCache.get(myPath)) diffBody.innerHTML = '<div class="ide-empty">Loading history...</div>';
  const commits = await fetchCommits(repo, myPath);
  if (token !== diffToken) return;
  loadedDiffFor = marker;
  currentCommits = commits;
  renderCommits(commits);
}

async function loadDeps() {
  if (depsEl.classList.contains('collapsed')) return;
  if (!activePath) {
    depsBody.innerHTML = '<div class="ide-empty">Open a file to see its dependencies.</div>';
    depsUI = null;
    depsFor = null;
    return;
  }
  const repo = state.selectedRepoPath;
  if (!repo) return;
  const token = ++depsToken;
  if (!depsUI || depsRepo !== repo) {
    const mod = await import('../dependencies/dependenciesUI.js');
    if (token !== depsToken) return;
    const ui = new mod.default();
    ui.selectFileInTree = (p) => { if (handlers.onOpenRelative) handlers.onOpenRelative(p); };
    depsUI = ui;
    depsRepo = repo;
    depsFor = null;
    await ui.render(depsBody, repo);
    if (token !== depsToken) return;
  }
  if (depsFor === activePath) return;
  depsFor = activePath;
  await depsUI.showForFile(activePath);
}

function syncAll() {
  loadDiff();
  loadDeps();
}

export function setActiveFile(path) {
  const next = path || null;
  if (next === activePath) return;
  activePath = next;
  syncAll();
}

function specFor(commit, view) {
  const list = currentCommits;
  const idx = list.findIndex((c) => c.hash === commit.hash);
  const older = !view && idx >= 0 ? list[idx + 1] : null;
  return {
    filePath: activePath,
    repo: state.selectedRepoPath,
    leftHash: older ? older.hash : null,
    rightHash: commit.hash,
    leftLabel: older ? labelOf(older) : 'File did not exist',
    rightLabel: labelOf(commit),
  };
}

async function openLatestDiff() {
  const repo = state.selectedRepoPath;
  if (!activePath || !repo) return;
  const myPath = activePath;
  const commits = await fetchCommits(repo, myPath);
  if (myPath !== activePath || !commits.length) return;
  currentCommits = commits;
  if (handlers.onOpenDiff) handlers.onOpenDiff(specFor(commits[0], false));
}

function runAction(act) {
  if (act === 'open-diff') {
    openLatestDiff();
    return;
  }
  if (act === 'diff-reload') {
    if (activePath) commitCache.delete(activePath);
    loadedDiffFor = null;
    loadDiff();
    return;
  }
  if (act === 'deps-reload') {
    depsFor = null;
    loadDeps();
  }
}

function onSectionClick(e) {
  const section = e.currentTarget;
  const btn = e.target.closest('.ide-sec-btn');
  if (btn) {
    e.stopPropagation();
    runAction(btn.dataset.act);
    return;
  }
  const head = e.target.closest('.ide-section-head');
  if (head) {
    e.stopPropagation();
    section.classList.toggle('collapsed');
    if (!section.classList.contains('collapsed')) syncAll();
  }
}

function onDiffClick(e) {
  const repo = state.selectedRepoPath;
  if (!activePath || !repo) return;
  const view = e.target.closest('.ide-cm-view');
  const item = view ? null : e.target.closest('.ide-cm');
  const hash = view ? view.dataset.hash : item ? item.dataset.hash : null;
  if (!hash) return;
  if (view) e.stopPropagation();
  const commit = currentCommits.find((c) => c.hash === hash);
  if (!commit) return;
  if (view) {
    if (handlers.onViewVersion) handlers.onViewVersion(specFor(commit, true));
  } else if (handlers.onOpenDiff) {
    handlers.onOpenDiff(specFor(commit, false));
  }
}

function onRepoSwitched() {
  commitCache = new Map();
  currentCommits = [];
  loadedDiffFor = null;
  depsUI = null;
  depsFor = null;
  depsRepo = null;
  syncAll();
}

export function mount(sidebarEl, h) {
  handlers = h || {};
  sidebarEl.insertAdjacentHTML('beforeend', TEMPLATE);
  diffEl = sidebarEl.querySelector('.ide-diff');
  depsEl = sidebarEl.querySelector('.ide-deps');
  diffBody = diffEl.querySelector('.ide-diff-body');
  depsBody = depsEl.querySelector('.ide-deps-body');
  diffEl.addEventListener('click', onSectionClick);
  depsEl.addEventListener('click', onSectionClick);
  diffBody.addEventListener('click', onDiffClick);
  document.addEventListener('repo:switched', onRepoSwitched);
}