import { S, h, call, liveEntry, isRunning, statusChip, relativeTime, fmtMs } from './state.js';
import { openHistoryRun } from './monitor.js';

const LIMIT = 5;
const RERUNNABLE = new Set(['failed', 'stopped', 'interrupted']);

const RUNS = {
  repoPath: '',
  file: '',
  items: [],
  total: 0,
  loaded: false,
  loading: false,
  error: '',
  busy: '',
  liveKey: '',
};

function sync(file) {
  if (RUNS.repoPath === S.repoPath && RUNS.file === file) return;
  RUNS.repoPath = S.repoPath;
  RUNS.file = file;
  RUNS.items = [];
  RUNS.total = 0;
  RUNS.loaded = false;
  RUNS.loading = false;
  RUNS.error = '';
  RUNS.busy = '';
  RUNS.liveKey = '';
}

function isCurrent(repoPath, file) {
  return repoPath === S.repoPath && RUNS.repoPath === repoPath && RUNS.file === file;
}

async function load(file) {
  const repoPath = S.repoPath;
  RUNS.loading = true;
  try {
    const res = await call('history', { repoPath, page: 1, limit: LIMIT, action: 'ci:' + file });
    if (!isCurrent(repoPath, file)) return;
    RUNS.items = res.items || [];
    RUNS.total = res.total || 0;
    RUNS.error = '';
  } catch (e) {
    if (!isCurrent(repoPath, file)) return;
    RUNS.items = [];
    RUNS.total = 0;
    RUNS.error = e.message;
  }
  RUNS.loaded = true;
  RUNS.loading = false;
  S.hooks.renderPage();
}

function watchLiveJob(file) {
  const live = liveEntry(S.repoPath);
  const key = live && live.job ? live.job.id + ':' + live.job.status : '';
  if (RUNS.liveKey === key) return;
  RUNS.liveKey = key;
  RUNS.loaded = false;
  if (live && live.job && live.job.status !== 'running') {
    const repoPath = S.repoPath;
    setTimeout(() => {
      if (!isCurrent(repoPath, file)) return;
      RUNS.loaded = false;
      S.hooks.renderPage();
    }, 800);
  }
}

async function prepare(run, which, file, onPlan) {
  const repoPath = S.repoPath;
  RUNS.busy = run.id + ':' + which;
  RUNS.error = '';
  S.hooks.renderPage();
  try {
    const res = await call('ciRerunPlan', { repoPath, id: run.id, which });
    if (!isCurrent(repoPath, file)) return;
    await onPlan(res);
  } catch (e) {
    if (isCurrent(repoPath, file)) RUNS.error = e.message;
  } finally {
    if (isCurrent(repoPath, file)) {
      RUNS.busy = '';
      S.hooks.renderPage();
    }
  }
}

function runRow(run, file, locked, onPlan) {
  const blocked = locked || !!RUNS.busy || isRunning();
  const duration = run.durationMs !== null && run.durationMs !== undefined ? ' / ' + fmtMs(run.durationMs) : '';
  return h(
    'div',
    { class: 'rc-row' },
    statusChip(run.status),
    h('span', { class: 'rc-where', text: relativeTime(run.startedAt) + duration }),
    h('span', { class: 'rc-where rc-mono', text: run.command || run.title }),
    h('button', { class: 'rc-btn secondary small', text: 'Open', onclick: () => openHistoryRun(run.id) }),
    h('button', {
      class: 'rc-btn secondary small',
      text: RUNS.busy === run.id + ':failed' ? 'Starting...' : 'Rerun failed',
      disabled: blocked || !RERUNNABLE.has(run.status),
      onclick: () => prepare(run, 'failed', file, onPlan),
    }),
    h('button', {
      class: 'rc-btn secondary small',
      text: RUNS.busy === run.id + ':same' ? 'Starting...' : 'Rerun all',
      disabled: blocked || run.status === 'running',
      onclick: () => prepare(run, 'same', file, onPlan),
    })
  );
}

export function runsSection(options) {
  const o = options || {};
  const file = o.file;
  sync(file);
  watchLiveJob(file);
  if (!RUNS.loaded && !RUNS.loading) load(file);

  const rows = RUNS.items.map((run) => runRow(run, file, !!o.locked, o.onPlan));

  return h(
    'section',
    { class: 'rc-card' },
    h(
      'div',
      { class: 'rc-card-head' },
      h('h3', { text: 'Recent runs' }),
      h('button', {
        class: 'rc-btn secondary small',
        text: 'Refresh',
        disabled: RUNS.loading,
        onclick: () => {
          RUNS.loaded = false;
          S.hooks.renderPage();
        },
      })
    ),
    isRunning() ? h('div', { class: 'rc-warn', text: 'Another job is running in this repository, so reruns are unavailable until it finishes.' }) : null,
    RUNS.error ? h('div', { class: 'rc-warn red', text: RUNS.error }) : null,
    RUNS.loading && !RUNS.loaded
      ? h('div', { class: 'rc-empty', text: 'Loading runs...' })
      : rows.length
        ? h('div', { class: 'rc-test-list' }, rows)
        : h('p', { class: 'rc-where', text: 'No runs yet.' }),
    RUNS.total > rows.length ? h('p', { class: 'rc-where', text: 'Showing the latest ' + rows.length + ' of ' + RUNS.total + '. The rest are on the History page.' }) : null
  );
}