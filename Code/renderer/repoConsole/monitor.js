import { S, h, call, liveEntry, repoLabel, fmtMs, fmtDate, statusLabel, statusChip, toast, copyText } from './state.js';

const els = { pill: null, output: null, log: null };
let panelTimer = null;

export function mountPill() {
  if (els.pill) return;
  els.pill = h('div', { class: 'rc-pill', hidden: true });
  document.body.append(els.pill);
}

export function mountOutput(root) {
  if (els.output) return;
  els.output = h('div', { class: 'rc-output' });
  root.append(els.output);
  renderPlaceholder();
}

function renderPlaceholder() {
  if (!els.output) return;
  els.output.replaceChildren(
    h(
      'div',
      { class: 'rc-output-empty' },
      h('h3', { text: 'Output' }),
      h('p', { text: 'Run an action, start the tests, or open a run from History. Its output, steps and test results show here.' })
    )
  );
}

export function stopJob(repoPath) {
  call('stop', { repoPath }).catch((e) => toast(e.message, 'error'));
}

function pickPill() {
  const own = S.jobs.get(S.repoPath);
  if (own && own.job && !S.pillDismissed.has(own.job.id)) return { repoPath: S.repoPath, job: own.job };
  for (const [repoPath, entry] of S.jobs) {
    if (entry.job && entry.job.status === 'running' && !S.pillDismissed.has(entry.job.id)) return { repoPath, job: entry.job };
  }
  return null;
}

export function renderPill() {
  if (!els.pill) return;
  const pick = pickPill();
  if (!pick) {
    els.pill.hidden = true;
    return;
  }
  const { repoPath, job } = pick;
  const waiting = job.status === 'running' && job.awaiting;
  els.pill.hidden = false;
  els.pill.className = 'rc-pill ' + (job.status || 'running') + (waiting ? ' waiting' : '');

  const parts = [];
  if (job.status === 'running') parts.push(h('span', { class: 'rc-spin' }));
  else parts.push(h('span', { class: 'rc-pill-icon', text: job.status === 'done' ? '\u2713' : job.status === 'failed' ? '!' : '\u25A0' }));
  parts.push(h('span', { class: 'rc-pill-title', text: (repoPath !== S.repoPath ? repoLabel(repoPath) + ': ' : '') + job.title }));
  const meta = [];
  if (waiting) meta.push('waiting for input');
  if (job.kind === 'tests') {
    const step = job.steps.find((s) => s.status === 'running') || job.steps[0];
    if (step && step.progress) meta.push(step.progress.done + (step.progress.total ? '/' + step.progress.total : '') + ' files');
  }
  meta.push(fmtMs((job.endedAt || Date.now()) - job.startedAt));
  parts.push(h('span', { class: 'rc-pill-meta', text: meta.join(' \u00b7 ') }));
  if (waiting) parts.push(h('span', { class: 'rc-pill-action', text: 'Answer' }));
  else if (job.status !== 'running') parts.push(h('span', { class: 'rc-pill-action', text: 'View output' }));

  const main = h('button', { class: 'rc-pill-main', onclick: () => (waiting ? openLiveOutput(repoPath, 'output', true) : openLiveOutput(repoPath)) }, ...parts);
  const stop = job.status === 'running' ? h('button', { class: 'rc-pill-btn', text: 'Stop', onclick: () => stopJob(repoPath) }) : null;
  const dismiss =
    job.status !== 'running'
      ? h('button', {
          class: 'rc-pill-btn',
          title: 'Dismiss',
          text: '\u00d7',
          onclick: () => {
            S.pillDismissed.add(job.id);
            renderPill();
          },
        })
      : null;
  els.pill.replaceChildren(main, stop, dismiss);
}

/* ---------- output view ---------- */

function outputModel() {
  if (S.output.live) {
    const entry = liveEntry(S.output.repoPath);
    if (!entry || !entry.job || entry.job.id !== S.output.runId) return null;
    return { run: entry.job, steps: entry.job.steps, logs: entry.log };
  }
  const detail = S.output.detail;
  if (!detail) return null;
  return { run: detail.run, steps: detail.steps, logs: detail.logs || [] };
}

function hasTestResults(steps) {
  return (steps || []).some((s) => s.result && s.result.kind === 'tests');
}

export function openLiveOutput(repoPath, tab, focusPrompt) {
  const entry = liveEntry(repoPath);
  if (!entry || !entry.job) return;
  S.hooks.openPanel();
  S.output = {
    open: true,
    live: true,
    repoPath,
    runId: entry.job.id,
    tab: tab || 'summary',
    detail: null,
    loading: false,
    logSearch: '',
    errorsOnly: false,
    focusPrompt: !!focusPrompt,
  };
  renderOutput();
}

export async function openHistoryRun(id) {
  S.hooks.openPanel();
  S.output = {
    open: true,
    live: false,
    repoPath: S.repoPath,
    runId: id,
    tab: 'summary',
    detail: null,
    loading: true,
    logSearch: '',
    errorsOnly: false,
    focusPrompt: false,
  };
  renderOutput();
  try {
    const res = await call('historyRun', { repoPath: S.repoPath, id });
    if (S.output.runId !== id) return;
    S.output.detail = res.detail;
    S.output.loading = false;
    renderOutput();
  } catch (e) {
    if (S.output.runId !== id) return;
    S.output.loading = false;
    renderOutput();
    toast(e.message, 'error');
  }
}

export function closeOutput() {
  S.output.open = false;
  els.log = null;
  renderPlaceholder();
}

export function renderOutput() {
  if (!els.output) return;
  if (!S.output.open) {
    closeOutput();
    return;
  }
  const model = outputModel();
  els.log = null;
  const closeBtn = h('button', { class: 'rc-btn secondary small', text: 'Close', title: 'Close (Esc)', onclick: closeOutput });

  if (!model) {
    els.output.replaceChildren(
      h(
        'div',
        { class: 'rc-output-inner' },
        h('div', { class: 'rc-output-head' }, h('div', { class: 'rc-output-title' }, h('h2', { text: 'Run output' })), closeBtn),
        h('div', { class: 'rc-output-body' }, h('div', { class: 'rc-empty', text: S.output.loading ? 'Loading the run...' : 'This run is no longer available.' }))
      )
    );
    return;
  }

  const run = model.run;
  const steps = model.steps || [];
  const logs = model.logs || [];
  const isTestRun = hasTestResults(steps);
  if (S.output.tab === 'tests' && !isTestRun) S.output.tab = 'summary';
  const tabs = [['summary', 'Summary'], ['output', 'Output']];
  if (isTestRun) tabs.push(['tests', 'Tests']);

  const headMeta = [
    run.env ? (run.env === 'production' ? 'Production' : 'Local') : null,
    run.database || null,
    fmtDate(run.startedAt),
    fmtMs((run.endedAt || Date.now()) - run.startedAt),
  ]
    .filter(Boolean)
    .join(' \u00b7 ');

  const live = S.output.live && run.status === 'running';
  const head = h(
    'div',
    { class: 'rc-output-head' },
    h('div', { class: 'rc-output-title' }, h('div', { class: 'rc-row' }, h('h2', { text: run.title }), statusChip(run.status, false)), h('div', { class: 'rc-where', text: headMeta })),
    h(
      'div',
      { class: 'rc-row' },
      live ? h('button', { class: 'rc-btn danger small', text: 'Stop', onclick: () => stopJob(S.output.repoPath) }) : null,
      h('button', { class: 'rc-btn secondary small', text: 'Copy output', onclick: () => copyText(logs.map((l) => l.t).join('\n'), 'Output copied') }),
      h('button', { class: 'rc-btn secondary small', text: 'Download', onclick: () => downloadLog(model) }),
      closeBtn
    )
  );

  const tabBar = h(
    'div',
    { class: 'rc-tabs' },
    ...tabs.map(([id, label]) =>
      h('button', {
        class: S.output.tab === id ? 'on' : '',
        text: label,
        onclick: () => {
          S.output.tab = id;
          renderOutput();
        },
      })
    )
  );

  let body;
  if (S.output.tab === 'output') body = outputTab(model);
  else if (S.output.tab === 'tests') body = testsTab(model);
  else body = summaryTab(model);

  els.output.replaceChildren(h('div', { class: 'rc-output-inner' + (run.env === 'production' ? ' prod' : '') }, head, tabBar, body));
}

export function schedulePanelRefresh() {
  if (!S.output.open || S.output.tab === 'output' || panelTimer) return;
  panelTimer = setTimeout(() => {
    panelTimer = null;
    if (S.output.open && S.output.tab !== 'output') renderOutput();
  }, 300);
}

function summaryTab(model) {
  const run = model.run;
  const steps = model.steps || [];
  const highlights = buildHighlights(model.logs || []);
  const command = run.command || (steps[0] && steps[0].command) || '-';
  const exit = run.exitCode !== null && run.exitCode !== undefined ? ' (exit ' + run.exitCode + ')' : '';
  const meta = h(
    'dl',
    { class: 'rc-kv' },
    h('dt', { text: 'Action' }),
    h('dd', { text: run.actionId || run.title }),
    h('dt', { text: 'Status' }),
    h('dd', { text: statusLabel(run.status) + exit }),
    h('dt', { text: 'Environment' }),
    h('dd', { text: run.env ? (run.env === 'production' ? 'Production' : 'Local') + (run.appEnv ? ' / APP_ENV=' + run.appEnv : '') : 'Tests (no database)' }),
    h('dt', { text: 'Target' }),
    h('dd', { text: run.database ? (run.host || '') + ' / ' + run.database : '-' }),
    h('dt', { text: 'Command' }),
    h('dd', { class: 'rc-mono', text: command }),
    h('dt', { text: 'Started' }),
    h('dd', { text: fmtDate(run.startedAt) }),
    h('dt', { text: 'Duration' }),
    h('dd', { text: fmtMs(run.durationMs !== null && run.durationMs !== undefined ? run.durationMs : (run.endedAt || Date.now()) - run.startedAt) })
  );
  return h(
    'div',
    { class: 'rc-output-body' },
    meta,
    h('h4', { text: 'Steps' }),
    steps.length ? h('div', { class: 'rc-steps' }, ...steps.map(stepRow)) : h('div', { class: 'rc-empty', text: 'No steps reported.' }),
    run.error ? h('div', { class: 'rc-warn red', text: run.error }) : null,
    highlights.length ? h('h4', { text: 'Key output' }) : null,
    highlights.length ? h('div', { class: 'rc-highlights' }, ...highlights.map((line) => h('div', { class: 'rc-line ' + line.k, text: line.t }))) : null
  );
}

function stepRow(step) {
  const isTest = !!(step.result && step.result.kind === 'tests');
  const meta = [];
  if (step.startedAt && step.endedAt) meta.push(fmtMs(step.endedAt - step.startedAt));
  if (step.exitCode !== null && step.exitCode !== undefined) meta.push('exit ' + step.exitCode);
  if (isTest && step.result && step.result.totals) {
    meta.push(step.result.totals.files + ' files');
    if (step.result.totals.failed) meta.push(step.result.totals.failed + ' failed');
  }
  if (step.status === 'running' && step.progress) {
    meta.push(step.progress.done + (step.progress.total ? '/' + step.progress.total : '') + ' files');
  }
  return h(
    'div',
    { class: 'rc-step' },
    statusChip(step.status, isTest),
    h('div', { class: 'rc-step-main' }, h('div', { class: 'rc-step-title', text: step.title }), h('div', { class: 'rc-where rc-mono', text: step.command || '' })),
    h('div', { class: 'rc-where', text: meta.join(' \u00b7 ') })
  );
}

function buildHighlights(logs) {
  const seen = new Set();
  const out = [];
  for (const entry of logs) {
    const text = String(entry.t || '').trim();
    if (!text) continue;
    const isErr = entry.k === 'err' || /\b(error|failed|failure|warn|cannot|could not|fatal)\b/i.test(text);
    const isKey = /\b(created|added|inserted|updated|deleted|removed|skipped|seeded|migrated|applied|finished|done|passed)\b/i.test(text);
    if (!isErr && !isKey) continue;
    const key = text.slice(0, 140);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ k: isErr ? 'err' : entry.k === 'sys' ? 'sys' : 'out', t: text.slice(0, 500) });
    if (out.length >= 40) break;
  }
  return out;
}

function logMatches(entry) {
  const text = String(entry.t || '');
  if (S.output.errorsOnly && entry.k !== 'err' && !/\b(error|failed|failure|fatal)\b/i.test(text)) return false;
  const q = S.output.logSearch.trim().toLowerCase();
  return !q || text.toLowerCase().includes(q);
}

function buildLogLine(entry) {
  return h('div', { class: 'rc-line ' + (entry.k || 'out'), text: entry.t || '' });
}

function fillLog(box, logs) {
  box.replaceChildren(...(logs || []).filter(logMatches).map(buildLogLine));
  box.scrollTop = box.scrollHeight;
}

export function appendLiveLog(repoPath, entries) {
  if (!S.output.open || !S.output.live || S.output.repoPath !== repoPath || S.output.tab !== 'output') return;
  const box = els.log;
  if (!box) return;
  const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  for (const entry of entries) {
    if (logMatches(entry)) box.append(buildLogLine(entry));
  }
  while (box.childElementCount > 5000) box.removeChild(box.firstChild);
  if (stick) box.scrollTop = box.scrollHeight;
}

function outputTab(model) {
  const logs = model.logs || [];
  const box = h('div', { class: 'rc-log' });
  els.log = box;
  const search = h('input', {
    type: 'search',
    placeholder: 'Search output',
    value: S.output.logSearch,
    oninput: (e) => {
      S.output.logSearch = e.target.value;
      fillLog(box, logs);
    },
  });
  const errorsOnly = h(
    'label',
    { class: 'rc-check' },
    h('input', {
      type: 'checkbox',
      checked: S.output.errorsOnly,
      onchange: (e) => {
        S.output.errorsOnly = e.target.checked;
        fillLog(box, logs);
      },
    }),
    h('span', { text: 'Errors only' })
  );
  const parts = [h('div', { class: 'rc-log-tools' }, search, errorsOnly, h('span', { class: 'rc-where', text: logs.length + ' lines' }))];
  const entry = S.output.live ? liveEntry(S.output.repoPath) : null;
  const running = entry && entry.job && entry.job.status === 'running';
  if (running && entry.job.awaiting) parts.push(promptBox(entry));
  else if (running) parts.push(h('div', { class: 'rc-noinput', text: 'No input needed. The script is not waiting for an answer.' }));
  parts.push(box);
  fillLog(box, logs);
  return h('div', { class: 'rc-output-body fill' }, ...parts);
}

function promptBox(entry) {
  const last = [...entry.log].reverse().find((l) => String(l.t || '').trim());
  const input = h('input', {
    type: 'text',
    placeholder: 'Type the answer and press Enter',
    value: S.promptDraft || '',
    oninput: (e) => {
      S.promptDraft = e.target.value;
    },
    onkeydown: (e) => {
      if (e.key === 'Enter') sendPrompt(input);
    },
  });
  if (S.output.focusPrompt) {
    S.output.focusPrompt = false;
    requestAnimationFrame(() => input.focus());
  }
  return h(
    'div',
    { class: 'rc-prompt' },
    h('div', { class: 'rc-prompt-text', text: last ? last.t : 'The script is waiting for an answer.' }),
    h('div', { class: 'rc-row' }, input, h('button', { class: 'rc-btn small', text: 'Send', onclick: () => sendPrompt(input) }))
  );
}

async function sendPrompt(input) {
  const text = input.value;
  if (!text) return;
  try {
    const res = await call('input', { repoPath: S.output.repoPath, text });
    if (!res.sent) toast('Nothing is waiting for input.', 'error');
    input.value = '';
    S.promptDraft = '';
  } catch (e) {
    toast(e.message, 'error');
  }
}

function testsTab(model) {
  const steps = (model.steps || []).filter((s) => s.result && s.result.kind === 'tests');
  if (!steps.length) return h('div', { class: 'rc-output-body' }, h('div', { class: 'rc-empty', text: 'This run did not produce test results.' }));
  return h('div', { class: 'rc-output-body' }, ...steps.map((step) => h('div', null, h('h4', { text: step.title }), testResultsBlock(step))));
}

function downloadLog(model) {
  const text = (model.logs || []).map((line) => line.t).join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = h('a', { href: url, download: (model.run.id || 'run') + '.log' });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ---------- test results (shared with the Tests page) ---------- */

export function testResultsBlock(step) {
  const r = step.result;
  if (!r) return h('div', { class: 'rc-empty', text: 'No result for this step.' });
  if (r.error) return h('div', { class: 'rc-warn red', text: r.error });
  const totals = r.totals || { files: 0, tests: 0, passed: 0, failed: 0, failedFiles: 0 };
  const state = { filter: 'all', q: '' };
  const list = h('div', { class: 'rc-test-list' });
  const seg = h(
    'div',
    { class: 'rc-seg' },
    h('button', {
      class: 'on',
      text: 'All files',
      onclick: () => {
        state.filter = 'all';
        updateSeg(seg, state);
        fillTestList(list, step, state);
      },
    }),
    h('button', {
      text: 'Failed only',
      onclick: () => {
        state.filter = 'failed';
        updateSeg(seg, state);
        fillTestList(list, step, state);
      },
    })
  );
  const search = h('input', {
    type: 'search',
    placeholder: 'Filter files or failing tests',
    oninput: (e) => {
      state.q = e.target.value;
      fillTestList(list, step, state);
    },
  });
  const copyBtn = h('button', {
    class: 'rc-btn secondary small',
    text: 'Copy failures',
    disabled: !totals.failedFiles,
    onclick: () => copyText(failuresText(step), 'Failures copied'),
  });
  const tile = (value, label, cls) => h('div', { class: 'rc-tile' + (cls ? ' ' + cls : '') }, h('b', { text: String(value) }), h('span', { text: label }));
  const block = h(
    'div',
    { class: 'rc-test-results' },
    h(
      'div',
      { class: 'rc-tiles' },
      tile(totals.files, 'Files'),
      tile(totals.tests, 'Tests'),
      tile(totals.passed, 'Passed', 'good'),
      tile(totals.failed, 'Failed tests', totals.failed || totals.failedFiles ? 'bad' : ''),
      tile(totals.failedFiles, 'Failed files', totals.failedFiles ? 'bad' : ''),
      tile(fmtMs((step.endedAt || Date.now()) - step.startedAt), 'Time')
    ),
    h('div', { class: 'rc-row' }, search, seg, copyBtn),
    list
  );
  fillTestList(list, step, state);
  return block;
}

function updateSeg(seg, state) {
  seg.querySelectorAll('button').forEach((button, index) => button.classList.toggle('on', index === (state.filter === 'all' ? 0 : 1)));
}

function fillTestList(container, step, state) {
  const r = step.result;
  if (!r || !r.files) {
    container.replaceChildren(h('div', { class: 'rc-empty', text: 'No test files reported.' }));
    return;
  }
  const q = state.q.trim().toLowerCase();
  let files = r.files;
  if (state.filter === 'failed') files = files.filter((f) => f.status === 'failed');
  if (q) {
    files = files.filter((f) => {
      if (f.file.toLowerCase().includes(q)) return true;
      if (f.failures && f.failures.some((x) => ((x.name || '') + ' ' + (x.summary || '') + ' ' + (x.message || '')).toLowerCase().includes(q))) return true;
      return (f.error || '').toLowerCase().includes(q);
    });
  }
  if (!files.length) {
    container.replaceChildren(h('div', { class: 'rc-empty', text: state.filter === 'failed' ? 'No failing files match.' : 'No files match the filter.' }));
    return;
  }
  const groups = new Map();
  for (const file of files) {
    const dir = file.file.includes('/') ? file.file.split('/')[0] : '.';
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(file);
  }
  const nodes = [];
  for (const [dir, list] of groups) {
    nodes.push(h('div', { class: 'rc-group-title', text: dir === '.' ? 'root' : dir }));
    for (const file of list) nodes.push(fileRow(step, file));
  }
  container.replaceChildren(...nodes);
}

function fileRow(step, file) {
  const mark = h('span', { class: 'rc-mark ' + (file.status === 'failed' ? 'no' : 'ok'), text: file.status === 'failed' ? '\u00d7' : file.status === 'skipped' ? '-' : '\u2713' });
  const meta = h('span', {
    class: 'rc-where',
    text: file.tests + ' tests' + (file.failed ? ' / ' + file.failed + ' failed' : '') + (file.durationMs !== null && file.durationMs !== undefined ? ' / ' + fmtMs(file.durationMs) : ''),
  });
  if (file.status !== 'failed') {
    return h('div', { class: 'rc-file' }, h('div', { class: 'rc-file-row' }, mark, h('span', { class: 'rc-file-name rc-mono', text: file.file }), meta));
  }
  const summary = (file.failures && file.failures[0] && file.failures[0].summary) || file.errorSummary || 'The file failed.';
  const key = (step.idx !== undefined && step.idx !== null ? step.idx : step.id) + ':' + file.file;
  const details = h(
    'details',
    { class: 'rc-file bad' },
    h('summary', { class: 'rc-file-row' }, mark, h('span', { class: 'rc-file-name rc-mono', text: file.file }), h('span', { class: 'rc-file-reason', text: summary }), meta),
    h(
      'div',
      { class: 'rc-failure' },
      ...(file.failures || []).map((f) => h('div', null, h('h5', { text: f.name }), h('pre', { text: f.message || '(no message)' }))),
      file.error ? h('div', null, h('h5', { text: 'The file could not run' }), h('pre', { text: file.error })) : null
    )
  );
  if (S.openFiles.has(key)) details.setAttribute('open', '');
  details.addEventListener('toggle', () => {
    if (details.open) S.openFiles.add(key);
    else S.openFiles.delete(key);
  });
  return details;
}

function failuresText(step) {
  const r = step.result;
  if (!r || !r.files) return '';
  const lines = [];
  for (const file of r.files) {
    if (file.status !== 'failed') continue;
    lines.push('FILE: ' + file.file);
    if (file.error) lines.push(file.error);
    for (const f of file.failures || []) {
      lines.push('  - ' + f.name);
      if (f.message) lines.push(f.message);
    }
    lines.push('');
  }
  return lines.join('\n');
}