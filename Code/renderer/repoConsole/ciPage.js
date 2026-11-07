import { S, h, call, toast } from './state.js';
import { runsSection } from './ciRuns.js';

const C = {
  repoPath: '',
  loaded: false,
  loading: false,
  error: '',
  dirExists: true,
  workflows: [],
  selected: '',
  detail: null,
  detailLoading: false,
  detailError: '',
  selectedJobIds: new Set(),
  preflight: null,
  autoOpened: false,
  changesBase: '',
};

const R = {
  busy: '',
  error: '',
};

const SM = {
  loading: false,
  error: '',
  result: null,
};

const KINDS = [
  ['install', 'Install', /\b(?:npm|yarn|pnpm|bun)\s+(?:ci|install|i)\b|\bpip\s+install\b|\bcomposer\s+install\b/],
  ['lint', 'Lint', /\b(?:eslint|prettier|ruff|flake8|mypy|phpstan|psalm|pint|tsc)\b|\b(?:npm|yarn|pnpm)\s+(?:run\s+)?(?:lint|typecheck|format)/],
  ['test', 'Test', /\b(?:jest|vitest|pytest|phpunit|mocha|rspec)\b|\b(?:npm|yarn|pnpm)\s+(?:run\s+)?test|\b(?:go|cargo|dotnet)\s+test\b|artisan\s+test/],
  ['build', 'Build', /\b(?:npm|yarn|pnpm)\s+(?:run\s+)?build|\b(?:docker|cargo|go|dotnet)\s+build\b|\bmake\b|\bvite\s+build\b|\bnext\s+build\b/],
  ['database', 'Database', /\bprisma\b|\bmigrate\b/],
];

function ensureStyles() {
  if (document.getElementById('repoConsoleCiSheet')) return;
  const link = document.createElement('link');
  link.id = 'repoConsoleCiSheet';
  link.rel = 'stylesheet';
  link.href = 'styles/repo-console-ci.css';
  document.head.append(link);
}

function plural(count, word) {
  return count + ' ' + word + (count === 1 ? '' : 's');
}

function chip(label, cls) {
  return h('span', { class: 'rc-chip ' + cls, text: label });
}

function commandKind(run) {
  const text = String(run || '');
  for (const [key, label, re] of KINDS) {
    if (re.test(text)) return { key, label };
  }
  return { key: 'command', label: 'Command' };
}

function runsLocally(step) {
  if (step.kind !== 'run' || step.support !== 'supported') return false;
  if (!step.if) return true;
  const text = String(step.if).replace(/^\s*\$\{\{\s*|\s*\}\}\s*$/g, '').trim();
  return /^(?:success\(\)|always\(\)|true)$/.test(text);
}

function runnable(job) {
  return (job.steps || []).filter(runsLocally);
}

function checkJobs(workflow) {
  return (workflow.jobs || []).filter((job) => !job.matrix && !job.reusable && runnable(job).length > 0);
}

function sync() {
  if (C.repoPath === S.repoPath) return;
  C.repoPath = S.repoPath;
  C.loaded = false;
  C.loading = false;
  C.error = '';
  C.dirExists = true;
  C.workflows = [];
  C.selected = '';
  C.detail = null;
  C.detailLoading = false;
  C.detailError = '';
  C.selectedJobIds = new Set();
  C.preflight = null;
  C.autoOpened = false;
  C.changesBase = '';
  R.busy = '';
  R.error = '';
  SM.loading = false;
  SM.error = '';
  SM.result = null;
}

async function load() {
  const repoPath = S.repoPath;
  C.loading = true;
  try {
    const res = await call('ciDiscover', { repoPath });
    if (repoPath !== C.repoPath) return;
    C.workflows = res.workflows || [];
    C.dirExists = res.dirExists !== false;
    C.error = '';
  } catch (e) {
    if (repoPath !== C.repoPath) return;
    C.workflows = [];
    C.error = e.message;
  }
  C.loaded = true;
  C.loading = false;
  S.hooks.renderPage();
}

function refresh() {
  C.loaded = false;
  C.selected = '';
  C.detail = null;
  C.detailError = '';
  C.selectedJobIds = new Set();
  C.preflight = null;
  C.autoOpened = false;
  R.error = '';
  SM.error = '';
  SM.result = null;
  S.hooks.renderPage();
}

async function openWorkflow(file) {
  const repoPath = S.repoPath;
  C.selected = file;
  C.detail = null;
  C.detailLoading = true;
  C.detailError = '';
  C.selectedJobIds = new Set();
  C.preflight = null;
  R.error = '';
  SM.error = '';
  SM.result = null;
  S.hooks.renderPage();
  try {
    const res = await call('ciWorkflow', { repoPath, file });
    if (repoPath !== C.repoPath || C.selected !== file) return;
    C.detail = res.workflow;
    C.selectedJobIds = new Set(checkJobs(res.workflow).map((job) => job.id));
  } catch (e) {
    if (repoPath !== C.repoPath || C.selected !== file) return;
    C.detailError = e.message;
  }
  C.detailLoading = false;
  S.hooks.renderPage();
}

function closeDetail() {
  C.selected = '';
  C.detail = null;
  C.detailError = '';
  C.selectedJobIds = new Set();
  C.preflight = null;
  R.error = '';
  S.hooks.renderPage();
}

async function trustWorkflow() {
  if (!C.detail) return;
  const repoPath = S.repoPath;
  const file = C.detail.file;
  const hash = C.detail.hash;
  try {
    await call('ciTrust', { repoPath, file, hash });
    if (repoPath !== S.repoPath || repoPath !== C.repoPath || file !== C.selected) return;
    C.detail.trusted = true;
    R.error = '';
  } catch (e) {
    if (repoPath !== S.repoPath || repoPath !== C.repoPath || file !== C.selected) return;
    R.error = e.message;
  }
  S.hooks.renderPage();
}

function toggleJob(id, on) {
  if (on) C.selectedJobIds.add(id);
  else C.selectedJobIds.delete(id);
  C.preflight = null;
  R.error = '';
  S.hooks.renderPage();
}

function selectAll(on) {
  if (!C.detail) return;
  C.selectedJobIds = on ? new Set(checkJobs(C.detail).map((job) => job.id)) : new Set();
  C.preflight = null;
  R.error = '';
  S.hooks.renderPage();
}

async function runChecks() {
  if (!C.detail || R.busy) return;
  const repoPath = S.repoPath;
  const file = C.detail.file;
  const jobs = checkJobs(C.detail);
  const picked = jobs.filter((job) => C.selectedJobIds.has(job.id)).map((job) => job.id);
  const same = () => repoPath === S.repoPath && repoPath === C.repoPath && file === C.selected;

  R.error = '';
  C.preflight = null;

  if (!picked.length) {
    R.error = 'Select at least one check to run.';
    S.hooks.renderPage();
    return;
  }

  R.busy = 'Checking...';
  S.hooks.renderPage();

  try {
    const request = { repoPath, file, mode: 'selected', jobIds: picked, approvedSkips: [] };

    const planned = await call('ciPlan', request);
    if (!same()) return;
    const plan = planned.plan;
    const problems = (plan.blockers || []).slice();
    for (const job of plan.jobs || []) {
      if (job.state !== 'ready') problems.push(job.name + ': ' + (job.reasons || []).join(' '));
    }
    if (problems.length) {
      R.error = problems.join(' ');
      return;
    }

    const checked = await call('ciPreflight', Object.assign({}, request, { planHash: plan.hash }));
    if (!same()) return;
    C.preflight = checked.preflight;
    if (checked.preflight.blockers.length) return;

    R.busy = 'Starting...';
    S.hooks.renderPage();
    await call('ciRun', Object.assign({}, request, { planHash: plan.hash, ack: true }));
    toast('Checks started. Follow them in the Repo Console output.');
  } catch (e) {
    if (same()) R.error = e.message;
  } finally {
    R.busy = '';
    S.hooks.renderPage();
  }
}

async function applyRerun(res) {
  const repoPath = S.repoPath;
  const file = C.selected;
  if (res.workflowChanged) {
    const fresh = await call('ciWorkflow', { repoPath, file });
    if (repoPath !== S.repoPath || repoPath !== C.repoPath || file !== C.selected) return;
    C.detail = fresh.workflow;
  }
  if (!C.detail) return;
  const visible = checkJobs(C.detail).map((job) => job.id);
  C.selectedJobIds = res.mode === 'full' ? new Set(visible) : new Set(res.jobIds);
  C.preflight = null;
  R.error = '';
  await runChecks();
}

async function suggestJobs() {
  if (!C.detail || SM.loading) return;
  const repoPath = S.repoPath;
  const file = C.detail.file;
  const same = () => repoPath === S.repoPath && repoPath === C.repoPath && file === C.selected;

  SM.loading = true;
  SM.error = '';
  S.hooks.renderPage();

  try {
    const response = await call('ciSmart', { repoPath, file, base: C.changesBase.trim() });
    if (!same()) return;
    SM.result = response.smart;
    C.selectedJobIds = new Set(response.smart.selectedJobIds || []);
    C.preflight = null;
    R.error = '';
  } catch (e) {
    if (!same()) return;
    SM.result = null;
    SM.error = e.message;
  } finally {
    if (same()) {
      SM.loading = false;
      S.hooks.renderPage();
    }
  }
}

function commandRow(step, job) {
  const lines = String(step.run || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0] || '';
  const extra = lines.length > 1 ? '  (+' + (lines.length - 1) + ' more lines)' : '';
  const dir = step.workingDirectory || job.workingDirectory;
  const kind = commandKind(step.run);
  return h(
    'div',
    { class: 'ci-cmd' },
    h('span', { class: 'ci-tag ci-tag-' + kind.key, text: kind.label }),
    h('code', { class: 'ci-cmd-text', text: first + extra }),
    dir ? h('span', { class: 'ci-dir', text: dir }) : null
  );
}

function jobCard(job) {
  const checked = C.selectedJobIds.has(job.id);
  const steps = runnable(job);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => toggleJob(job.id, input.checked));
  return h(
    'section',
    { class: 'ci-job' + (checked ? '' : ' off') },
    h(
      'label',
      { class: 'ci-job-head' },
      input,
      h('span', { class: 'ci-job-name', text: job.name }),
      h('span', { class: 'rc-where', text: plural(steps.length, 'command') })
    ),
    h('div', { class: 'ci-cmds' }, steps.map((step) => commandRow(step, job)))
  );
}

function preflightBox() {
  const p = C.preflight;
  if (!p) return null;
  const blockers = p.blockers || [];
  const warnings = p.warnings || [];
  if (!blockers.length && !warnings.length) return null;
  return h(
    'div',
    null,
    blockers.length
      ? h(
          'div',
          { class: 'rc-warn red' },
          h('b', { text: 'Cannot run yet' }),
          h('ul', null, blockers.map((item) => h('li', { text: item })))
        )
      : null,
    warnings.length ? h('div', { class: 'rc-warn' }, h('ul', null, warnings.map((item) => h('li', { text: item })))) : null
  );
}

function smartBox() {
  const baseInput = document.createElement('input');
  baseInput.type = 'text';
  baseInput.autocomplete = 'off';
  baseInput.spellcheck = false;
  baseInput.placeholder = 'Compare with branch (optional)';
  baseInput.value = C.changesBase;
  baseInput.addEventListener('input', () => {
    C.changesBase = baseInput.value;
  });

  return h(
    'div',
    { class: 'ci-smart' },
    h(
      'div',
      { class: 'rc-row' },
      baseInput,
      h('button', {
        class: 'rc-btn secondary small',
        text: SM.loading ? 'Looking...' : 'Only what I changed',
        disabled: SM.loading || !!R.busy,
        onclick: suggestJobs,
      })
    ),
    SM.error ? h('div', { class: 'rc-warn red', text: SM.error }) : null,
    SM.result ? h('p', { class: 'rc-where', text: SM.result.summary }) : null,
    SM.result ? (SM.result.warnings || []).map((warning) => h('p', { class: 'rc-where', text: warning })) : null
  );
}

function workflowCard(w) {
  const unavailable = w.deployBlocked || !!w.parseError;
  return h(
    'div',
    { class: 'rc-card' },
    h('div', { class: 'rc-card-head' }, h('h3', { text: w.name }), w.deployBlocked ? chip('Deploy, disabled', 'failed') : null),
    w.parseError ? h('div', { class: 'rc-warn red', text: w.file + ' could not be read: ' + w.parseError.message }) : null,
    w.deployBlocked ? h('div', { class: 'rc-warn red', text: 'This looks like a deploy or release workflow, so it cannot run locally.' }) : null,
    h(
      'div',
      { class: 'rc-card-foot' },
      h('div', null, h('code', { class: 'rc-cmd', text: w.file }), h('div', { class: 'rc-where', text: plural(w.jobCount, 'job') })),
      unavailable ? null : h('button', { class: 'rc-btn', text: 'Open checks', onclick: () => openWorkflow(w.file) })
    )
  );
}

function listView() {
  const out = [
    h('p', { class: 'rc-lead', text: 'Run the tests, lints and builds from your CI workflow on this machine.' }),
    h(
      'div',
      { class: 'rc-row' },
      h('span', { class: 'rc-where', text: C.loading && !C.loaded ? 'Looking for workflows...' : plural(C.workflows.length, 'workflow') }),
      h('button', { class: 'rc-btn secondary small', text: 'Refresh', disabled: C.loading, onclick: refresh })
    ),
  ];
  if (C.loading && !C.loaded) {
    out.push(h('div', { class: 'rc-empty', text: 'Looking for workflows...' }));
    return out;
  }
  if (C.error) {
    out.push(h('div', { class: 'rc-warn red', text: C.error }));
    return out;
  }
  if (!C.workflows.length) {
    out.push(
      h('div', {
        class: 'rc-empty',
        text: C.dirExists ? 'The folder .github/workflows has no .yml or .yaml files.' : 'No .github/workflows folder was found in this repository.',
      })
    );
    return out;
  }
  out.push(h('div', { class: 'rc-grid' }, C.workflows.map(workflowCard)));
  return out;
}

function detailView() {
  const back =
    C.workflows.length > 1 ? h('button', { class: 'rc-btn secondary small', text: 'All workflows', onclick: closeDetail }) : null;

  if (C.detailLoading) {
    return [h('div', { class: 'rc-row' }, back), h('div', { class: 'rc-empty', text: 'Reading the workflow...' })];
  }
  if (C.detailError || !C.detail) {
    return [h('div', { class: 'rc-row' }, back), h('div', { class: 'rc-warn red', text: C.detailError || 'The workflow could not be read.' })];
  }

  const workflow = C.detail;
  const jobs = checkJobs(workflow);
  const picked = jobs.filter((job) => C.selectedJobIds.has(job.id));
  const unsupported = (workflow.jobs || []).filter((job) => job.matrix || job.reusable);
  let skipped = 0;
  for (const job of workflow.jobs || []) {
    for (const step of job.steps || []) {
      if (step.remoteOnly || (step.kind === 'run' && !runsLocally(step))) skipped += 1;
    }
  }

  const blocked = workflow.deployBlocked || !!workflow.parseError;
  const canRun = !R.busy && !blocked && !!workflow.trusted && picked.length > 0;
  const runText = R.busy || (picked.length === jobs.length ? 'Run all checks' : 'Run ' + plural(picked.length, 'selected check'));

  return [
    h(
      'div',
      { class: 'ci-head' },
      h('div', null, h('h3', { text: workflow.name }), h('div', { class: 'rc-where rc-mono', text: workflow.file })),
      h('div', { class: 'rc-row' }, back, h('button', { class: 'rc-btn secondary small', text: 'Refresh', onclick: refresh }))
    ),
    workflow.parseError ? h('div', { class: 'rc-warn red', text: workflow.file + ' could not be read: ' + workflow.parseError.message }) : null,
    workflow.deployBlocked ? h('div', { class: 'rc-warn red', text: 'This looks like a deploy or release workflow, so it cannot run locally.' }) : null,
    (workflow.problems || []).map((problem) => h('div', { class: 'rc-warn', text: problem })),
    !workflow.trusted && !blocked
      ? h(
          'div',
          { class: 'ci-trust' },
          h('span', { text: 'These commands run on your machine. Trust this workflow file to enable running.' }),
          h('button', { class: 'rc-btn', text: 'Trust workflow', onclick: trustWorkflow })
        )
      : null,
    jobs.length
      ? h(
          'div',
          { class: 'ci-bar' },
          h('button', {
            class: 'rc-btn danger',
            text: runText,
            disabled: !canRun,
            onclick: runChecks,
          }),
          h('button', { class: 'rc-btn secondary small', text: 'All', disabled: !!R.busy, onclick: () => selectAll(true) }),
          h('button', { class: 'rc-btn secondary small', text: 'None', disabled: !!R.busy, onclick: () => selectAll(false) }),
          h('span', { class: 'rc-where', text: picked.length + ' of ' + plural(jobs.length, 'check') + ' selected' })
        )
      : null,
    R.error ? h('div', { class: 'rc-warn red', text: R.error }) : null,
    preflightBox(),
    jobs.length ? smartBox() : null,
    jobs.length
      ? h('div', { class: 'ci-jobs' }, jobs.map(jobCard))
      : h('div', { class: 'rc-empty', text: 'This workflow has no commands that can run locally.' }),
    skipped
      ? h('p', { class: 'rc-where', text: plural(skipped, 'step') + ' that only work on GitHub are skipped (for example path filters and third-party actions).' })
      : null,
    unsupported.length
      ? h('p', { class: 'rc-where', text: plural(unsupported.length, 'job') + ' cannot run locally (matrix or reusable): ' + unsupported.map((job) => job.name).join(', ') + '.' })
      : null,
    runsSection({ file: workflow.file, locked: !!R.busy, onPlan: applyRerun }),
  ];
}

export function ciPage() {
  ensureStyles();
  sync();
  if (!C.loaded && !C.loading) load();
  if (C.selected) return detailView();
  if (C.loaded && !C.error && C.workflows.length === 1 && !C.autoOpened) {
    C.autoOpened = true;
    const file = C.workflows[0].file;
    queueMicrotask(() => openWorkflow(file));
    return [h('div', { class: 'rc-empty', text: 'Reading the workflow...' })];
  }
  return listView();
}