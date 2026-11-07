import { escHtml, timeAgo, parseDiff } from './branchManager/utils.js';
import { createCodeViewer } from '../shared/codeViewer.js';

let viewer = null;

const PAGE_SIZE = 40;
const MAX_CODE_LINES = 3000;
const MAX_LINE_CHARS = 4000;
const MAX_DIFF_ROWS = 4000;
const MAX_CACHE = 24;
const STYLE_ID = 'gitInspectSheet';

const ICON_REFRESH = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 10a6 6 0 1 1-1.76-4.24"/><path d="M16 3.5V6h-2.5"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M4 13V4a1 1 0 0 1 1-1h8"/></svg>';

const STATUS = {
  A: ['a', 'Added'],
  M: ['m', 'Modified'],
  D: ['d', 'Deleted'],
  T: ['t', 'Type changed'],
  U: ['u', 'Unmerged'],
};

function freshState() {
  return {
    open: false,
    gen: 0,
    repoPath: '',
    branches: null,
    branch: '',
    loadingBranches: false,
    commits: [],
    page: 0,
    total: 0,
    totalPages: 0,
    loadingCommits: false,
    loadingMore: false,
    commitsError: '',
    filter: '',
    selectedHash: '',
    filesLoading: '',
    filesError: '',
    selectedFile: '',
    mode: 'version',
    previewLoading: false,
    files: new Map(),
    contents: new Map(),
    diffs: new Map(),
  };
}

let S = freshState();
let root = null;

export function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = 'styles/git-inspect.css';
  document.head.append(link);
}

export function isOpen() {
  return S.open;
}

export function open(container, repoPath) {
  ensureStyles();
  const gen = S.gen + 1;
  S = freshState();
  S.gen = gen;
  S.open = true;
  S.repoPath = repoPath || '';
  S.loadingBranches = true;

  container.innerHTML = template();
  root = container.querySelector('.ins-panel');
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('keydown', onKeydown);

  renderAll();
  loadBranches(false);
}

export function close() {
  S.open = false;
  S.gen += 1;
  root = null;
}

function template() {
  return `
    <div class="ins-panel">
      <div class="ins-toolbar">
        <div class="ins-field">
          <label class="ins-label" for="insBranchSelect">Branch</label>
          <select class="ins-select" id="insBranchSelect" disabled>
            <option>Loading branches...</option>
          </select>
        </div>
        <div class="ins-field ins-field-grow">
          <label class="ins-label" for="insFilter">Filter</label>
          <input class="ins-filter" id="insFilter" type="search" autocomplete="off" spellcheck="false" placeholder="Message, author or commit id (loaded commits)">
        </div>
        <button class="btn btn-small ins-refresh" id="insRefresh" type="button" title="Reload branches and commits">
          <span class="btn-icon">${ICON_REFRESH}</span> Refresh
        </button>
      </div>
      <div class="ins-body">
        <section class="ins-col ins-col-commits" aria-label="Commits">
          <header class="ins-col-head">
            <span class="ins-col-title">Commits</span>
            <span class="ins-col-count" id="insCommitCount"></span>
          </header>
          <div class="ins-col-body" id="insCommitList" role="listbox" aria-label="Commit history"></div>
        </section>
        <section class="ins-col ins-col-files" aria-label="Files changed">
          <header class="ins-col-head">
            <span class="ins-col-title">Files changed</span>
            <span class="ins-col-count" id="insFileCount"></span>
          </header>
          <div class="ins-col-body" id="insFileList"></div>
        </section>
        <section class="ins-col ins-col-preview" aria-label="Preview">
          <div class="ins-preview-head" id="insPreviewHead"></div>
          <div class="ins-note" id="insPreviewNote" hidden></div>
          <div class="ins-col-body" id="insPreviewBody" style="display:flex;flex-direction:column;overflow:hidden"></div>
        </section>
      </div>
    </div>
  `;
}

function $(selector) {
  return root ? root.querySelector(selector) : null;
}

function api(name) {
  const fn = typeof window !== 'undefined' && window.electronAPI ? window.electronAPI[name] : null;
  if (typeof fn !== 'function') {
    throw new Error('The Inspect bridge is not available. Restart the app.');
  }
  return fn;
}

function remember(map, key, value) {
  map.set(key, value);
  if (map.size > MAX_CACHE) {
    map.delete(map.keys().next().value);
  }
}

function empty(text) {
  return '<div class="ins-empty">' + escHtml(text) + '</div>';
}

function baseName(path) {
  return String(path).split('/').pop() || String(path);
}

function fullDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function currentFiles() {
  return S.files.get(S.selectedHash) || null;
}

function findFile(path) {
  const r = currentFiles();
  if (!r || !path) return null;
  return r.files.find((f) => f.file === path) || null;
}

function versionRev(file) {
  const r = currentFiles();
  if (file.status === 'D' && r && r.parent) return r.parent;
  return S.selectedHash;
}

function previewToken() {
  return S.mode + '|' + S.selectedHash + '|' + S.selectedFile;
}

function visibleCommits() {
  const q = S.filter.trim().toLowerCase();
  if (!q) return S.commits;
  return S.commits.filter(
    (c) =>
      c.message.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q) ||
      c.hash.startsWith(q) ||
      c.shortHash.startsWith(q)
  );
}

function pickBranch(b) {
  if (b.detached) return 'HEAD';
  if (b.current) return b.current;
  return b.local[0] || b.remote[0] || '';
}

/* ---------- rendering ---------- */

function renderAll() {
  renderBranchSelect();
  renderCommits();
  renderFiles();
  renderPreview();
}

function option(value, label) {
  return '<option value="' + escHtml(value) + '">' + escHtml(label) + '</option>';
}

function renderBranchSelect() {
  const select = $('#insBranchSelect');
  if (!select) return;
  const b = S.branches;
  if (!b) {
    select.disabled = true;
    return;
  }

  const parts = [];
  if (b.detached) parts.push(option('HEAD', 'HEAD (detached)'));
  if (b.local.length) {
    const rows = b.local.map((name) => option(name, !b.detached && name === b.current ? name + ' (current)' : name));
    parts.push('<optgroup label="Local">' + rows.join('') + '</optgroup>');
  }
  if (b.remote.length) {
    parts.push('<optgroup label="Remote">' + b.remote.map((name) => option(name, name)).join('') + '</optgroup>');
  }
  if (!parts.length) parts.push(option('', 'No branches'));

  select.innerHTML = parts.join('');
  select.value = S.branch;
  select.disabled = S.loadingBranches || !S.branch;
}

function refChips(refs) {
  const out = [];
  for (const raw of refs || []) {
    const ref = String(raw).trim();
    if (ref.startsWith('HEAD')) {
      out.push('<span class="ins-chip ins-chip-head">HEAD</span>');
    } else if (ref.startsWith('tag:')) {
      out.push('<span class="ins-chip ins-chip-tag">' + escHtml(ref.slice(4).trim()) + '</span>');
    }
    if (out.length >= 3) break;
  }
  return out.join('');
}

function commitRow(c) {
  const active = c.hash === S.selectedHash;
  const merge = c.isMerge ? '<span class="ins-chip ins-chip-merge">merge</span>' : '';
  return (
    '<button type="button" class="ins-commit' + (active ? ' active' : '') + (c.isMerge ? ' merge' : '') + '" data-hash="' + escHtml(c.hash) + '" role="option" aria-selected="' + (active ? 'true' : 'false') + '">' +
    '<span class="ins-commit-rail"><span class="ins-commit-dot"></span></span>' +
    '<span class="ins-commit-text">' +
    '<span class="ins-commit-msg">' + (escHtml(c.message) || '(no message)') + '</span>' +
    '<span class="ins-commit-meta">' +
    '<code class="ins-hash">' + escHtml(c.shortHash) + '</code>' +
    '<span>' + escHtml(c.author) + '</span>' +
    '<span title="' + escHtml(fullDate(c.date)) + '">' + escHtml(timeAgo(c.date)) + '</span>' +
    merge +
    refChips(c.refs) +
    '</span>' +
    '</span>' +
    '</button>'
  );
}

function renderCommits() {
  const list = $('#insCommitList');
  const count = $('#insCommitCount');
  if (!list || !count) return;
  const scroll = list.scrollTop;

  if (S.loadingBranches && !S.commits.length) {
    list.innerHTML = empty('Loading branches...');
    count.textContent = '';
    return;
  }
  if (S.loadingCommits) {
    list.innerHTML = empty('Loading commits...');
    count.textContent = '';
    return;
  }
  if (S.commitsError) {
    list.innerHTML =
      '<div class="ins-empty ins-error">' + escHtml(S.commitsError) + '<br><button class="btn btn-small" type="button" id="insRetry">Try again</button></div>';
    count.textContent = '';
    return;
  }
  if (!S.branch) {
    list.innerHTML = empty('No branches were found in this repository.');
    count.textContent = '';
    return;
  }
  if (!S.commits.length) {
    list.innerHTML = empty('This branch has no commits yet.');
    count.textContent = '';
    return;
  }

  const shown = visibleCommits();
  count.textContent = S.total ? S.commits.length + ' of ' + S.total : '';

  const hasMore = S.page < S.totalPages;
  let html = shown.map(commitRow).join('');
  if (!shown.length) {
    html = empty('No loaded commits match this filter.' + (hasMore ? ' Load more commits to search further.' : ''));
  }
  if (hasMore) {
    html +=
      '<button class="btn btn-small ins-load-more" id="insLoadMore" type="button"' + (S.loadingMore ? ' disabled' : '') + '>' +
      (S.loadingMore ? 'Loading...' : 'Load more commits') +
      '</button>';
  }

  list.innerHTML = html;
  list.scrollTop = scroll;
}

function updateCommitActive() {
  if (!root) return;
  root.querySelectorAll('.ins-commit').forEach((el) => {
    const on = el.dataset.hash === S.selectedHash;
    el.classList.toggle('active', on);
    el.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function updateFileActive() {
  if (!root) return;
  root.querySelectorAll('.ins-file').forEach((el) => {
    el.classList.toggle('active', el.dataset.file === S.selectedFile);
  });
}

function statText(f) {
  if (f.binary) return '<span class="ins-stat-bin">bin</span>';
  const parts = [];
  if (f.additions) parts.push('<span class="ins-add">+' + f.additions + '</span>');
  if (f.deletions) parts.push('<span class="ins-del">-' + f.deletions + '</span>');
  return parts.join('');
}

function fileRow(f) {
  const info = STATUS[f.status] || ['m', f.status || 'Changed'];
  const name = baseName(f.file);
  const dir = f.file.length > name.length ? f.file.slice(0, f.file.length - name.length - 1) : '';
  const copyTitle = f.status === 'D' ? 'Copy the last version before it was deleted' : 'Copy this file as it was at this commit';
  return (
    '<div class="ins-file' + (f.file === S.selectedFile ? ' active' : '') + '" data-file="' + escHtml(f.file) + '" role="option">' +
    '<span class="ins-badge ins-badge-' + info[0] + '" title="' + escHtml(info[1]) + '">' + escHtml(f.status || '?') + '</span>' +
    '<span class="ins-file-text">' +
    '<span class="ins-file-name" title="' + escHtml(f.file) + '">' + escHtml(name) + '</span>' +
    (dir ? '<span class="ins-file-dir">' + escHtml(dir) + '</span>' : '') +
    '</span>' +
    '<span class="ins-file-stats">' + statText(f) + '</span>' +
    '<button class="ins-icon-btn" type="button" data-copy="' + escHtml(f.file) + '" title="' + escHtml(copyTitle) + '">' + ICON_COPY + '</button>' +
    '</div>'
  );
}

function commitInfo(c) {
  if (!c) return '';
  const merge = c.isMerge ? '<span class="ins-chip ins-chip-merge">merge</span>' : '';
  return (
    '<div class="ins-info">' +
    '<div class="ins-info-title">' + (escHtml(c.message) || '(no message)') + '</div>' +
    '<div class="ins-info-meta">' +
    '<code class="ins-hash" title="' + escHtml(c.hash) + '">' + escHtml(c.shortHash) + '</code>' +
    '<button class="ins-icon-btn" type="button" id="insCopyHash" title="Copy the full commit id">' + ICON_COPY + '</button>' +
    '<span>' + escHtml(c.author) + '</span>' +
    '<span>' + escHtml(fullDate(c.date)) + '</span>' +
    merge +
    '</div>' +
    (c.isMerge ? '<div class="ins-note-inline">Merge commit: files are compared with its first parent.</div>' : '') +
    '</div>'
  );
}

function renderFiles() {
  const list = $('#insFileList');
  const count = $('#insFileCount');
  if (!list || !count) return;

  if (!S.selectedHash) {
    list.innerHTML = empty('Select a commit to see the files it changed.');
    count.textContent = '';
    return;
  }

  const commit = S.commits.find((c) => c.hash === S.selectedHash);
  const info = commitInfo(commit);

  if (S.filesLoading === S.selectedHash) {
    list.innerHTML = info + empty('Loading files...');
    count.textContent = '';
    return;
  }
  if (S.filesError) {
    list.innerHTML = info + '<div class="ins-empty ins-error">' + escHtml(S.filesError) + '<br><button class="btn btn-small" type="button" id="insRetryFiles">Try again</button></div>';
    count.textContent = '';
    return;
  }

  const r = currentFiles();
  if (!r) {
    list.innerHTML = info;
    count.textContent = '';
    return;
  }

  const totalAdd = r.files.reduce((sum, f) => sum + (f.additions || 0), 0);
  const totalDel = r.files.reduce((sum, f) => sum + (f.deletions || 0), 0);
  count.textContent = r.total + ' file' + (r.total === 1 ? '' : 's') + ' +' + totalAdd + ' -' + totalDel;

  const rows = r.files.length ? r.files.map(fileRow).join('') : empty('This commit has no file changes.');
  const more = r.truncated ? '<div class="ins-note">Only the first ' + r.files.length + ' of ' + r.total + ' files are listed.</div>' : '';
  list.innerHTML = info + '<div role="listbox" aria-label="Files changed">' + rows + '</div>' + more;
}

function renderPreview() {
  renderPreviewHead();
  renderPreviewBody();
}

function renderPreviewHead() {
  const head = $('#insPreviewHead');
  if (!head) return;
  const file = findFile(S.selectedFile);
  if (!file) {
    head.innerHTML = '<div class="ins-preview-top"><span class="ins-col-title">Preview</span></div>';
    return;
  }
  const deleted = file.status === 'D';
  const copyLabel = S.mode === 'changes' ? 'Copy changes' : deleted ? 'Copy last version' : 'Copy version';
  head.innerHTML =
    '<div class="ins-preview-top">' +
    '<span class="ins-preview-path" title="' + escHtml(file.file) + '">' + escHtml(file.file) + '</span>' +
    '<code class="ins-hash">' + escHtml(S.selectedHash.slice(0, 7)) + '</code>' +
    '</div>' +
    '<div class="ins-preview-actions">' +
    '<div class="ins-seg" role="tablist" aria-label="Preview mode">' +
    '<button class="ins-seg-btn' + (S.mode === 'version' ? ' active' : '') + '" type="button" role="tab" aria-selected="' + (S.mode === 'version') + '" data-mode="version">Version</button>' +
    '<button class="ins-seg-btn' + (S.mode === 'changes' ? ' active' : '') + '" type="button" role="tab" aria-selected="' + (S.mode === 'changes') + '" data-mode="changes">Changes</button>' +
    '</div>' +
    '<button class="btn btn-small btn-primary" type="button" id="insCopyMain"><span class="btn-icon">' + ICON_COPY + '</span> ' + copyLabel + '</button>' +
    '<button class="btn btn-small" type="button" id="insCopyPath">Copy path</button>' +
    '</div>';
}

function ensureViewer(body) {
  if (viewer && body.contains(viewer.el)) return viewer;
  if (viewer) viewer.destroy();
  body.innerHTML = '';
  const host = document.createElement('div');
  body.appendChild(host);
  viewer = createCodeViewer(host);
  return viewer;
}

function showDiffText(text, file) {
  const rows = [];
  const at = text.startsWith('@@') ? 0 : text.indexOf('\n@@');
  if (at >= 0) {
    const parsed = parseDiff(at === 0 ? text : text.slice(at + 1));
    while (parsed.length && parsed[parsed.length - 1].type === 'context' && parsed[parsed.length - 1].content === '') parsed.pop();
    for (const row of parsed) {
      const a = row.oldLine === null || row.oldLine === undefined ? undefined : row.oldLine;
      const b = row.newLine === null || row.newLine === undefined ? undefined : row.newLine;
      if (row.type === 'add') rows.push({ t: '+', text: row.content, b });
      else if (row.type === 'del') rows.push({ t: '-', text: row.content, a });
      else if (row.type === 'context') rows.push({ t: ' ', text: row.content.replace(/^ /, ''), a, b });
      else if (row.type === 'header') rows.push({ t: '@', text: row.content });
    }
  }
  viewer.showDiff(rows, {
    name: file.file,
    empty: 'No text changes to show. The file may be binary, or only its mode changed.',
  });
}

function setPreviewNote(text) {
  const el = $('#insPreviewNote');
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
}

function renderPreviewBody() {
  const body = $('#insPreviewBody');
  if (!body) return;
  const v = ensureViewer(body);
  setPreviewNote('');

  if (!S.selectedHash) {
    v.showMessage('Pick a commit, then a file, to see it as it was at that commit.', 'muted');
    return;
  }
  const file = findFile(S.selectedFile);
  if (!file) {
    v.showMessage('Select a file to preview it.', 'muted');
    return;
  }
  if (S.previewLoading) {
    v.showMessage('Loading...', 'muted');
    return;
  }

  if (S.mode === 'changes') {
    const d = S.diffs.get(S.selectedHash + '|' + file.file);
    if (!d) {
      v.showMessage('', 'muted');
      return;
    }
    if (!d.success) {
      v.showMessage(d.error || 'Something went wrong.', 'error');
      return;
    }
    showDiffText(d.diff || '', file);
    return;
  }

  const r = S.contents.get(versionRev(file) + '|' + file.file);
  if (!r) {
    v.showMessage('', 'muted');
    return;
  }
  if (!r.success) {
    v.showMessage(r.error || 'Something went wrong.', 'error');
    return;
  }
  if (file.status === 'D') {
    setPreviewNote('This file was deleted in this commit. Showing its last version, from the parent commit.');
  }
  if (r.binary) {
    v.showMessage('This is a binary file (' + r.size + ' bytes). It cannot be shown or copied as text.', 'muted');
    return;
  }
  if (r.tooLarge) {
    v.showMessage('This file is larger than 2 MB, so it is not loaded here.', 'muted');
    return;
  }
  v.showCode(r.content || '', { name: file.file, empty: 'This file is empty at this commit.' });
}

function resetPreviewScroll() {
  if (viewer) viewer.resetScroll();
}

/* ---------- loading ---------- */

async function loadBranches(keep) {
  const gen = S.gen;
  S.loadingBranches = true;
  S.commitsError = '';
  renderBranchSelect();
  renderCommits();

  let failure = '';
  try {
    const r = await api('gitInspectBranches')(S.repoPath);
    if (!S.open || gen !== S.gen) return;
    if (r && r.success) {
      S.branches = r;
      const names = new Set([].concat(r.local, r.remote, r.detached ? ['HEAD'] : []));
      S.branch = keep && S.branch && names.has(S.branch) ? S.branch : pickBranch(r);
    } else {
      failure = (r && r.error) || 'Could not read the branches of this repository.';
    }
  } catch (e) {
    if (!S.open || gen !== S.gen) return;
    failure = e.message;
  }

  S.loadingBranches = false;
  renderBranchSelect();
  if (failure) {
    S.commitsError = failure;
    renderCommits();
    return;
  }
  await loadCommits(true);
}

async function loadCommits(first) {
  const gen = S.gen;
  const branch = S.branch;
  if (!branch) {
    renderCommits();
    return;
  }

  const page = first ? 1 : S.page + 1;
  if (first) S.loadingCommits = true;
  else S.loadingMore = true;
  S.commitsError = '';
  renderCommits();

  let pick = '';
  try {
    const r = await api('gitInspectCommits')(S.repoPath, branch, page, PAGE_SIZE);
    if (!S.open || gen !== S.gen || branch !== S.branch) return;
    if (r && r.success) {
      const seen = new Set(first ? [] : S.commits.map((c) => c.hash));
      const fresh = (r.commits || []).filter((c) => !seen.has(c.hash));
      S.commits = first ? fresh : S.commits.concat(fresh);
      S.page = r.page;
      S.totalPages = r.totalPages;
      S.total = r.total;
      if (first) {
        const keep = S.selectedHash && S.commits.some((c) => c.hash === S.selectedHash);
        if (keep) {
          pick = S.selectedHash;
        } else if (S.commits.length) {
          pick = S.commits[0].hash;
        } else {
          S.selectedHash = '';
          S.selectedFile = '';
        }
      }
    } else {
      S.commitsError = (r && r.error) || 'Could not read the commits of this branch.';
    }
  } catch (e) {
    if (!S.open || gen !== S.gen || branch !== S.branch) return;
    S.commitsError = e.message;
  }

  S.loadingCommits = false;
  S.loadingMore = false;
  renderCommits();
  if (!pick) {
    renderFiles();
    renderPreview();
    return;
  }
  selectCommit(pick, true);
}

async function loadFiles(hash) {
  if (S.files.has(hash)) {
    afterFiles();
    return;
  }
  S.filesLoading = hash;
  renderFiles();
  renderPreview();

  let r;
  try {
    r = await api('gitInspectFiles')(S.repoPath, hash);
  } catch (e) {
    r = { success: false, error: e.message };
  }
  if (!S.open) return;

  if (S.filesLoading === hash) S.filesLoading = '';
  if (r && r.success) {
    remember(S.files, hash, r);
  } else if (S.selectedHash === hash) {
    S.filesError = (r && r.error) || 'Could not read the files of this commit.';
  }
  if (S.selectedHash === hash) afterFiles();
}

function afterFiles() {
  const r = currentFiles();
  if (!r || !findFile(S.selectedFile)) S.selectedFile = '';
  renderFiles();
  renderPreview();
  if (S.selectedFile) loadPreview();
}

async function ensureVersion(rev, path) {
  const key = rev + '|' + path;
  if (S.contents.has(key)) return S.contents.get(key);
  let r;
  try {
    r = await api('gitInspectFile')(S.repoPath, rev, path);
  } catch (e) {
    r = { success: false, error: e.message };
  }
  r = r || { success: false, error: 'No answer from Git.' };
  remember(S.contents, key, r);
  return r;
}

async function loadPreview() {
  S.previewLoading = false;
  const file = findFile(S.selectedFile);
  if (!file) {
    renderPreview();
    return;
  }
  const token = previewToken();

  if (S.mode === 'changes') {
    const key = S.selectedHash + '|' + file.file;
    if (!S.diffs.has(key)) {
      S.previewLoading = true;
      renderPreview();
      let r;
      try {
        r = await api('gitInspectDiff')(S.repoPath, S.selectedHash, file.file);
      } catch (e) {
        r = { success: false, error: e.message };
      }
      if (!S.open || previewToken() !== token) return;
      remember(S.diffs, key, r || { success: false, error: 'No answer from Git.' });
      S.previewLoading = false;
    }
  } else if (!S.contents.has(versionRev(file) + '|' + file.file)) {
    S.previewLoading = true;
    renderPreview();
    await ensureVersion(versionRev(file), file.file);
    if (!S.open || previewToken() !== token) return;
    S.previewLoading = false;
  }
  renderPreview();
}

/* ---------- actions ---------- */

function selectCommit(hash, force) {
  if (!hash || (!force && hash === S.selectedHash)) return Promise.resolve();
  S.selectedHash = hash;
  S.filesError = '';
  S.previewLoading = false;
  updateCommitActive();
  const fileList = $('#insFileList');
  if (fileList) fileList.scrollTop = 0;
  return loadFiles(hash);
}

function selectFile(path) {
  if (!path || path === S.selectedFile) return;
  S.selectedFile = path;
  updateFileActive();
  resetPreviewScroll();
  loadPreview();
}

function setMode(mode) {
  if ((mode !== 'version' && mode !== 'changes') || mode === S.mode) return;
  S.mode = mode;
  resetPreviewScroll();
  loadPreview();
}

function changeBranch(name) {
  if (!name || name === S.branch) return;
  S.branch = name;
  S.commits = [];
  S.page = 0;
  S.total = 0;
  S.totalPages = 0;
  S.commitsError = '';
  S.loadingMore = false;
  S.selectedHash = '';
  S.selectedFile = '';
  S.filesLoading = '';
  S.filesError = '';
  S.previewLoading = false;
  renderFiles();
  renderPreview();
  loadCommits(true);
}

function refresh() {
  S.files.clear();
  S.contents.clear();
  S.diffs.clear();
  loadBranches(true);
}

function toast(message, kind) {
  const el = document.createElement('div');
  el.className = 'git-toast ' + (kind === 'error' ? 'git-toast-error' : 'git-toast-success');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 4000 : 2500);
}

async function copyText(text, okMessage) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (e) {
    copied = false;
  }
  if (!copied) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      copied = document.execCommand('copy');
      area.remove();
    } catch (e) {
      copied = false;
    }
  }
  if (copied) toast(okMessage);
  else toast('Could not copy to the clipboard.', 'error');
}

async function copyVersion(path) {
  const file = findFile(path);
  if (!file) return;
  const hash = S.selectedHash;
  const r = await ensureVersion(versionRev(file), path);
  if (!S.open) return;
  if (!r.success) {
    toast(r.error || 'Could not read that file.', 'error');
    return;
  }
  if (r.binary) {
    toast('Binary files cannot be copied as text.', 'error');
    return;
  }
  if (r.tooLarge) {
    toast('That file is larger than 2 MB, so it cannot be copied here.', 'error');
    return;
  }
  const message =
    file.status === 'D'
      ? 'Copied the last version of ' + baseName(path)
      : 'Copied ' + baseName(path) + ' as of ' + hash.slice(0, 7);
  await copyText(r.content, message);
}

async function copyCurrent() {
  const file = findFile(S.selectedFile);
  if (!file) return;
  if (S.mode === 'changes') {
    const r = S.diffs.get(S.selectedHash + '|' + file.file);
    if (!r || !r.success) {
      toast('The changes are not loaded yet.', 'error');
      return;
    }
    await copyText(r.diff || '', 'Copied the changes of ' + baseName(file.file));
    return;
  }
  await copyVersion(file.file);
}

/* ---------- events ---------- */

function onClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;

  const copyBtn = t.closest('[data-copy]');
  if (copyBtn) {
    e.stopPropagation();
    copyVersion(copyBtn.dataset.copy);
    return;
  }
  const commit = t.closest('.ins-commit');
  if (commit) {
    selectCommit(commit.dataset.hash);
    return;
  }
  const file = t.closest('.ins-file');
  if (file) {
    selectFile(file.dataset.file);
    return;
  }
  const modeBtn = t.closest('[data-mode]');
  if (modeBtn) {
    setMode(modeBtn.dataset.mode);
    return;
  }
  if (t.closest('#insRefresh') || t.closest('#insRetry')) {
    refresh();
    return;
  }
  if (t.closest('#insRetryFiles')) {
    S.filesError = '';
    loadFiles(S.selectedHash);
    return;
  }
  if (t.closest('#insLoadMore')) {
    if (!S.loadingMore) loadCommits(false);
    return;
  }
  if (t.closest('#insCopyMain')) {
    copyCurrent();
    return;
  }
  if (t.closest('#insCopyPath')) {
    if (S.selectedFile) copyText(S.selectedFile, 'Copied the file path');
    return;
  }
  if (t.closest('#insCopyHash')) {
    if (S.selectedHash) copyText(S.selectedHash, 'Copied the commit id');
  }
}

function onChange(e) {
  if (e.target && e.target.id === 'insBranchSelect') changeBranch(e.target.value);
}

function onInput(e) {
  if (e.target && e.target.id === 'insFilter') {
    S.filter = e.target.value;
    renderCommits();
  }
}

function onKeydown(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const row = e.target && e.target.closest ? e.target.closest('.ins-commit') : null;
  if (!row) return;
  e.preventDefault();
  const rows = Array.from(root.querySelectorAll('.ins-commit'));
  const next = rows[rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  next.focus();
  next.scrollIntoView({ block: 'nearest' });
  selectCommit(next.dataset.hash);
}