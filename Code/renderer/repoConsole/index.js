import { S, h, call, toast } from './state.js';
import { mountPill, mountOutput, renderPill, renderOutput, closeOutput, appendLiveLog, schedulePanelRefresh, openLiveOutput, refreshStage, openHistoryRun } from './monitor.js';
import { seedsPage, databasePage, scriptsPage, testsPage, historyPage, loadHistory, setSearch, getSearch } from './pages.js';
import { securityPage } from './securityPage.js';
import { ciPage } from './ciPage.js';
import { checksPage } from './checksPage.js';

const NAV = [
  ['seeds', 'Seeds'],
  ['database', 'Database'],
  ['scripts', 'Scripts'],
  ['tests', 'Tests'],
  ['checks', 'Checks'],
  ['security', 'Security'],
  ['ci', 'CI'],
  ['history', 'History'],
];

const SEARCH_PAGES = new Set(['seeds', 'database', 'scripts']);

const els = {};
let inited = false;
let pageTimer = null;
let searchTimer = null;

function repoName() {
  return String(S.repoPath || '').split(/[\\/]/).filter(Boolean).pop() || 'No repo selected';
}

function envSwitch() {
  return h(
    'div',
    { class: 'rc-seg' },
    h('button', {
      class: S.env === 'local' ? 'on' : '',
      text: 'Local',
      onclick: () => {
        S.env = 'local';
        renderAll();
      },
    }),
    h('button', {
      class: S.env === 'production' ? 'on prod' : '',
      text: 'Production',
      onclick: () => {
        S.env = 'production';
        renderAll();
      },
    })
  );
}

function renderNav() {
  if (!els.nav) return;
  const info = S.catalog ? S.catalog.info : null;
  const showEnv = S.page === 'seeds' || S.page === 'database' || S.page === 'scripts';
  const prod = showEnv && S.env === 'production';
  els.panel.classList.toggle('prod', prod);
  els.banner.hidden = !prod;
  els.banner.textContent = prod ? 'PRODUCTION MODE - everything you run here changes the real database.' : '';
  if (els.search) els.search.hidden = !SEARCH_PAGES.has(S.page);
  const stats = info ? (info.historyCount || 0) + ' saved runs \u00b7 ' + (S.catalog.source === 'manifest' ? 'Manifest actions' : 'Detected scripts') : '';
  const canPaste = typeof S.hooks.openImport === 'function';
  els.nav.replaceChildren(
    h('div', { class: 'rc-brand' }, h('div', { class: 'rc-brand-name', text: 'Repo Console' }), h('div', { class: 'rc-brand-sub', text: repoName() })),
    h(
      'nav',
      { class: 'rc-nav-links' },
      NAV.map(([id, label]) =>
        h('button', {
          class: 'rc-nav' + (S.page === id ? ' active' : ''),
          text: label,
          onclick: () => {
            S.page = id;
            if (id === 'history') {
              S.history.loaded = false;
              loadHistory();
            }
            renderAll();
          },
        })
      )
    ),
    h(
      'div',
      { class: 'rc-nav-right' },
      stats ? h('span', { class: 'rc-foot', text: stats }) : null,
      showEnv ? envSwitch() : null,
      showEnv && canPaste ? h('button', { class: 'rc-btn secondary small', text: 'Paste actions', onclick: () => S.hooks.openImport() }) : null,
      h('button', { class: 'rc-btn secondary small', text: 'Close', onclick: close })
    )
  );
}

function renderPage() {
  if (!els.page) return;
  if (!S.repoPath) {
    els.page.replaceChildren(h('div', { class: 'rc-empty', text: 'Select a repository first.' }));
    return;
  }
  if (!S.catalog) {
    els.page.replaceChildren(h('div', { class: 'rc-empty', text: S.error || 'Loading console...' }));
    return;
  }
  const body =
    S.page === 'seeds'
      ? seedsPage()
      : S.page === 'database'
        ? databasePage()
        : S.page === 'scripts'
          ? scriptsPage()
          : S.page === 'tests'
            ? testsPage()
            : S.page === 'checks'
              ? checksPage()
              : S.page === 'security'
                ? securityPage()
                : S.page === 'ci'
                  ? ciPage()
                  : historyPage();
  els.page.replaceChildren(...[body].flat(Infinity).filter(Boolean));
}

function renderAll() {
  if (!els.panel) return;
  renderNav();
  renderPage();
  renderPill();
  if (S.output.open) renderOutput();
}

function schedulePageRender() {
  if (pageTimer) return;
  pageTimer = setTimeout(() => {
    pageTimer = null;
    renderPage();
  }, 250);
}

function onSearchInput(e) {
  const value = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    setSearch(value);
    renderPage();
  }, 250);
}

function clearSearch() {
  clearTimeout(searchTimer);
  if (els.searchInput) els.searchInput.value = '';
  setSearch('');
  renderPage();
}

async function refreshCatalog() {
  if (!S.repoPath) return;
  const repoPath = S.repoPath;
  try {
    const res = await call('catalog', repoPath);
    if (repoPath !== S.repoPath) return;
    S.catalog = res.catalog;
    S.error = '';
  } catch (e) {
    S.catalog = null;
    S.error = e.message;
  }
  renderNav();
  renderPage();
}

async function syncJob() {
  if (!S.repoPath) return;
  try {
    const res = await call('job', { repoPath: S.repoPath, withLog: true });
    const existing = S.jobs.get(S.repoPath);
    if (res.job && (!existing || !existing.job || existing.job.id !== res.job.id)) {
      const log = (res.job.log || []).slice();
      delete res.job.log;
      S.jobs.set(S.repoPath, { job: res.job, log });
    }
  } catch (e) {
    /* the page still works without a live job */
  }
  renderPill();
}

function onEvent(msg) {
  const { repoPath, event, data } = msg || {};
  if (!repoPath) return;
  if (event === 'security-progress') {
    if (typeof S.hooks.securityEvent === 'function') S.hooks.securityEvent(repoPath, data);
    return;
  }
  if (event === 'reset') {
    if (data) {
      const log = (data.log || []).slice();
      delete data.log;
      S.jobs.set(repoPath, { job: data, log });
    } else {
      S.jobs.delete(repoPath);
    }
    S.pending.clear();
    if (S.output.open && S.output.live && S.output.repoPath === repoPath && (!data || S.output.runId !== data.id)) closeOutput();
    renderAll();
    if (data && (data.kind === 'action' || data.kind === 'checks') && repoPath === S.repoPath && isOpen()) {
      openLiveOutput(repoPath, data.kind === 'checks' ? 'summary' : 'output');
    }
    return;
  }
  let entry = S.jobs.get(repoPath);
  if (!entry) {
    entry = { job: null, log: [] };
    S.jobs.set(repoPath, entry);
  }
  if (event === 'log') {
    entry.log.push(...data);
    if (entry.log.length > 12000) entry.log.splice(0, entry.log.length - 12000);
    appendLiveLog(repoPath, data);
    return;
  }
  if (event === 'job') {
    const previous = entry.job ? entry.job.status : null;
    const previousAwaiting = entry.job ? !!entry.job.awaiting : false;
    entry.job = data;
    const changed = previous !== data.status;
    const awaitingChanged = previousAwaiting !== !!data.awaiting;
    if (data.actionId) S.pending.delete(data.actionId);
    if (changed) S.pending.clear();
    renderPill();
    if (repoPath === S.repoPath && els.panel.classList.contains('open')) {
      if (S.page === 'tests') schedulePageRender();
      else if (changed) renderPage();
    }
    if (S.output.open && S.output.live && S.output.repoPath === repoPath && S.output.runId === data.id) {
      if (changed || awaitingChanged) {
        if (awaitingChanged && data.awaiting) S.output.focusPrompt = true;
        renderOutput();
      } else {
        schedulePanelRefresh();
        refreshStage();
      }
    }
    return;
  }
  if (event === 'finished') {
    entry.job = data;
    if (repoPath === S.repoPath) {
      if (S.page === 'history') {
        S.history.loaded = false;
        loadHistory();
      }
      refreshCatalog();
    }
    renderPill();
    if (S.output.open && S.output.live && S.output.repoPath === repoPath) renderOutput();
  }
}

function openPanelRequest() {
  if (els.panel && els.panel.classList.contains('open')) return;
  document.dispatchEvent(new CustomEvent('repoConsole:need-open'));
}

function ensureInit() {
  if (inited) return;
  inited = true;

  for (const [id, href] of [
    ['repoConsoleSheet', 'styles/repo-console.css'],
    ['repoConsoleLayoutSheet', 'styles/repo-console-layout.css'],
    ['repoConsoleSecuritySheet', 'styles/repo-console-security.css'],
    ['pushChecksSheet', 'styles/push-checks.css'],
  ]) {
    if (document.getElementById(id)) continue;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }
  if (!document.getElementById('repoConsoleCritical')) {
    const critical = document.createElement('style');
    critical.id = 'repoConsoleCritical';
    critical.textContent =
      '.rc-panel{position:fixed;top:var(--rc-top,40px);left:0;right:0;bottom:0;z-index:10000;display:none;}' +
      '.rc-panel.open{display:flex;flex-direction:column;}' +
      '.rc-overlay{z-index:10100;}' +
      '.rc-pill{z-index:10200;}' +
      '.rc-toast{z-index:10300;}';
    document.head.append(critical);
  }

  els.panel = h('div', { id: 'repoConsolePanel', class: 'rc-panel' });
  els.nav = h('header', { class: 'rc-navbar' });
  els.banner = h('div', { class: 'rc-banner', hidden: true });
  els.searchInput = h('input', {
    type: 'search',
    placeholder: 'Search actions, scripts and commands',
    autocomplete: 'off',
    spellcheck: 'false',
    value: getSearch(),
    oninput: onSearchInput,
  });
  els.search = h('div', { class: 'rc-searchbar', hidden: true }, els.searchInput);
  els.page = h('section', { class: 'rc-page' });
  els.pane = h('aside', { class: 'rc-pane' });
  els.panel.append(els.nav, els.banner, els.search, h('div', { class: 'rc-body' }, els.page, els.pane));
  document.body.append(els.panel);

  mountOutput(els.pane);
  mountPill();

  S.hooks.renderAll = renderAll;
  S.hooks.renderPage = renderPage;
  S.hooks.refreshCatalog = refreshCatalog;
  S.hooks.openPanel = openPanelRequest;

  if (window.repoConsoleAPI && window.repoConsoleAPI.onEvent) window.repoConsoleAPI.onEvent(onEvent);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !els.panel.classList.contains('open') || S.modalOpen) return;
    if (els.searchInput && document.activeElement === els.searchInput && els.searchInput.value) {
      clearSearch();
      return;
    }
    if (S.output.open) closeOutput();
    else close();
  });
}

function switchRepo(repoPath) {
  S.repoPath = repoPath || '';
  S.catalog = null;
  S.error = '';
  S.history.loaded = false;
  S.history.page = 1;
  S.history.items = [];
  S.history.total = 0;
  S.security.loaded = false;
  S.security.profile = null;
  S.security.settings = null;
  S.security.report = null;
  S.security.history = [];
  S.security.runError = '';
  if (typeof S.hooks.securityReset === 'function') S.hooks.securityReset();
  if (S.output.open && S.output.repoPath !== S.repoPath) closeOutput();
}

export async function open(repoPath) {
  try {
    ensureInit();
    if (repoPath && repoPath !== S.repoPath) switchRepo(repoPath);
    els.panel.classList.add('open');
    renderAll();
    if (!S.catalog) await refreshCatalog();
    await syncJob();
  } catch (err) {
    console.error('[RepoConsole] open failed:', err);
    toast('Repo Console could not open: ' + (err && err.message ? err.message : err), 'error');
    throw err;
  }
}

export async function openRun(repoPath, runId, tab) {
  await open(repoPath);
  S.page = 'checks';
  renderAll();
  if (!runId) return;
  await openHistoryRun(runId);
  if (tab && S.output.runId === runId && S.output.detail) {
    S.output.tab = tab;
    renderOutput();
  }
}

export function close() {
  if (!els.panel) return;
  els.panel.classList.remove('open');
  closeOutput();
}

export function isOpen() {
  return !!(els.panel && els.panel.classList.contains('open'));
}

export function getPanel() {
  return els.panel || null;
}

export async function handleRepoChange(repoPath) {
  if (!inited) {
    S.repoPath = repoPath || '';
    return;
  }
  switchRepo(repoPath);
  renderAll();
  if (isOpen()) {
    await refreshCatalog();
    await syncJob();
  }
}

document.addEventListener('repo:switched', (e) => {
  const repoPath = e && e.detail ? e.detail.repoPath : '';
  handleRepoChange(repoPath);
});

document.addEventListener('repoConsole:close-request', () => {
  if (isOpen()) close();
});