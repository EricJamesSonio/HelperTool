import { S, h, call } from './state.js';

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
  plan: null,
  planError: '',
  planLoading: false,
  planMode: 'full',
  selectedJobIds: new Set(),
};

const CATEGORY = {
  ci: { label: 'CI', cls: 'risk-readonly' },
  test: { label: 'Tests', cls: 'risk-readonly' },
  build: { label: 'Build', cls: 'risk-readonly' },
  deploy: { label: 'Deploy', cls: 'risk-destructive' },
  release: { label: 'Release', cls: 'risk-destructive' },
  maintenance: { label: 'Maintenance', cls: 'risk-adds' },
  unknown: { label: 'Unknown', cls: 'risk-changes' },
};

const SUPPORT = {
  full: { label: 'Supported', cls: 'done' },
  partial: { label: 'Partly supported', cls: 'skipped' },
  unsupported: { label: 'Not supported', cls: 'failed' },
};

const STEP_SUPPORT = {
  supported: { label: 'Runs locally', cls: 'done' },
  satisfied: { label: 'Already satisfied', cls: 'done' },
  validate: { label: 'Runtime check', cls: 'done' },
  skipped: { label: 'Skipped locally', cls: 'skipped' },
  partial: { label: 'Partly supported', cls: 'skipped' },
  unsupported: { label: 'Not supported', cls: 'failed' },
};

const REVIEW_CHIP = { label: 'Needs review', cls: 'skipped' };

const FEATURE_LABEL = {
  matrix: 'matrix builds',
  services: 'service containers',
  container: 'job containers',
  'reusable-workflow': 'reusable workflows',
  'third-party-action': 'third-party actions',
  expressions: 'expressions',
  conditions: 'conditions',
};

function ensureStyles() {
  if (document.getElementById('repoConsoleCiSheet')) return;
  const link = document.createElement('link');
  link.id = 'repoConsoleCiSheet';
  link.rel = 'stylesheet';
  link.href = 'styles/repo-console-ci.css';
  document.head.append(link);
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
  C.plan = null;
  C.planError = '';
  C.planLoading = false;
  C.planMode = 'full';
  C.selectedJobIds = new Set();
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
  C.plan = null;
  C.planError = '';
  C.selectedJobIds = new Set();
  S.hooks.renderPage();
}

async function openWorkflow(file) {
  const repoPath = S.repoPath;
  C.selected = file;
  C.detail = null;
  C.detailLoading = true;
  C.detailError = '';
  C.plan = null;
  C.planError = '';
  C.selectedJobIds = new Set();
  S.hooks.renderPage();
  try {
    const res = await call('ciWorkflow', { repoPath, file });
    if (repoPath !== C.repoPath || C.selected !== file) return;
    C.detail = res.workflow;
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
  C.plan = null;
  C.planError = '';
  C.selectedJobIds = new Set();
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
    C.planError = '';
  } catch (e) {
    if (repoPath !== S.repoPath || repoPath !== C.repoPath || file !== C.selected) return;
    C.planError = e.message;
  }
  S.hooks.renderPage();
}

async function makePlan() {
  if (!C.detail) return;
  const repoPath = S.repoPath;
  const file = C.detail.file;
  C.planLoading = true;
  C.planError = '';
  S.hooks.renderPage();

  try {
    const response = await call('ciPlan', {
      repoPath,
      file,
      mode: C.planMode,
      jobIds: [...C.selectedJobIds],
      approvedSkips: [],
    });
    if (repoPath !== S.repoPath || repoPath !== C.repoPath || file !== C.selected) return;
    C.plan = response.plan;
  } catch (e) {
    if (repoPath !== S.repoPath || repoPath !== C.repoPath || file !== C.selected) return;
    C.plan = null;
    C.planError = e.message;
  } finally {
    if (repoPath === S.repoPath && repoPath === C.repoPath && file === C.selected) {
      C.planLoading = false;
      S.hooks.renderPage();
    }
  }
}

function jobSelector(job) {
  if (C.planMode === 'full') return null;

  const label = h('label', { class: 'ci-job-select' });
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = C.selectedJobIds.has(job.id);
  input.addEventListener('change', () => {
    if (C.planMode === 'single' && input.checked) {
      C.selectedJobIds = new Set([job.id]);
    } else if (input.checked) {
      C.selectedJobIds.add(job.id);
    } else {
      C.selectedJobIds.delete(job.id);
    }
    C.plan = null;
    C.planError = '';
    S.hooks.renderPage();
  });
  label.append(input, document.createTextNode(' Include in plan'));
  return label;
}

function planReview() {
  if (!C.plan) return null;

  return h(
    'section',
    { class: 'ci-plan', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'CI plan review' },
    h('h3', { text: 'Plan review - commands will not run' }),
    h('p', { class: 'rc-where', text: 'Plan hash: ' + C.plan.hash }),
    C.plan.trusted
      ? h('p', { class: 'rc-chip done', text: 'This workflow hash is trusted.' })
      : h('div', { class: 'rc-warn red', text: 'This workflow is not trusted yet. Review it before trusting this hash.' }),
    (C.plan.blockers || []).map((blocker) => h('div', { class: 'rc-warn red', text: blocker })),
    (C.plan.jobs || []).map((job) =>
      h(
        'article',
        { class: 'rc-card' },
        h('h4', { text: job.name + ' (' + job.state + ')' }),
        job.needs && job.needs.length ? h('p', { class: 'rc-where', text: 'Needs: ' + job.needs.join(', ') }) : null,
        (job.reasons || []).map((reason) => h('p', { class: 'rc-warn', text: reason })),
        (job.steps || []).map((step) =>
          h(
            'div',
            { class: 'ci-plan-step' },
            h('b', { text: step.index + 1 + '. ' + step.name + ' - ' + step.kind }),
            step.command ? h('pre', { class: 'ci-run', text: step.command }) : null,
            step.uses ? h('code', { class: 'rc-cmd', text: step.uses }) : null,
            h('div', { class: 'ci-meta' }, h('span', { text: 'Directory: ' + step.cwd })),
            step.shell ? h('div', { class: 'ci-meta' }, h('span', { text: 'Shell: ' + step.shell })) : null,
            step.reason ? h('p', { class: 'rc-where', text: step.reason }) : null,
            step.secretNames && step.secretNames.length
              ? h('p', { class: 'rc-warn', text: 'Local secrets required later: ' + step.secretNames.join(', ') })
              : null,
            step.referencedEnvNames && step.referencedEnvNames.length
              ? h('p', { class: 'rc-where', text: 'Environment values referenced: ' + step.referencedEnvNames.join(', ') })
              : null
          )
        )
      )
    ),
    !C.plan.trusted && C.detail && C.detail.hash
      ? h('button', { class: 'rc-btn danger', text: 'I reviewed this workflow; trust this hash', onclick: trustWorkflow })
      : null,
    h('button', {
      class: 'rc-btn secondary',
      text: 'Close plan',
      onclick: () => {
        C.plan = null;
        S.hooks.renderPage();
      },
    })
  );
}

function chip(info) {
  return h('span', { class: 'rc-chip ' + info.cls, text: info.label });
}

function badge(info) {
  return h('span', { class: 'rc-badge ' + info.cls, text: info.label });
}

function plural(count, word) {
  return count + ' ' + word + (count === 1 ? '' : 's');
}

function triggerText(w) {
  return w.triggers && w.triggers.length ? 'Runs on: ' + w.triggers.join(', ') : 'No triggers defined.';
}

function parseErrorText(w) {
  const e = w.parseError;
  const where = e.line ? ':' + e.line + (e.col ? ':' + e.col : '') : '';
  return w.file + where + ' ' + e.message;
}

function summaryText() {
  if (C.loading && !C.loaded) return 'Looking for workflows...';
  const blocked = C.workflows.filter((w) => w.deployBlocked).length;
  return plural(C.workflows.length, 'workflow') + ' / ' + blocked + ' disabled for local runs';
}

function featureNames(list) {
  return (list || []).map((feature) => FEATURE_LABEL[feature] || feature);
}

function workflowCard(w) {
  const cat = CATEGORY[w.category] || CATEGORY.unknown;
  const sup = SUPPORT[w.support] || SUPPORT.unsupported;
  const features = featureNames(w.features);
  return h(
    'div',
    { class: 'rc-card' },
    h('div', { class: 'rc-card-head' }, h('h3', { text: w.name }), h('div', { class: 'rc-row' }, chip(sup), badge(cat))),
    h('p', { text: w.parseError ? 'This file could not be parsed.' : triggerText(w) }),
    w.parseError ? h('div', { class: 'rc-warn red', text: parseErrorText(w) }) : null,
    w.deployBlocked
      ? h('div', { class: 'rc-warn red', text: 'Looks like a deployment or release workflow, so local runs stay disabled. ' + w.deployReasons.join('; ') + '.' })
      : null,
    (w.problems || []).map((problem) => h('div', { class: 'rc-warn', text: problem })),
    features.length ? h('div', { class: 'rc-where', text: 'Uses ' + features.join(', ') }) : null,
    h(
      'div',
      { class: 'rc-card-foot' },
      h('div', null, h('code', { class: 'rc-cmd', text: w.file }), h('div', { class: 'rc-where', text: plural(w.jobCount, 'job') })),
      h('div', { class: 'rc-row' }, h('button', { class: 'rc-btn', text: 'View details', onclick: () => openWorkflow(w.file) }))
    )
  );
}

function listView() {
  const out = [
    h('p', { class: 'rc-lead', text: 'Workflows found in .github/workflows. This page only reads and explains them. Nothing is run from here yet.' }),
    h(
      'div',
      { class: 'rc-row' },
      h('span', { class: 'rc-where', text: summaryText() }),
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
  out.push(h('div', { class: 'rc-section', text: 'Workflows' }), h('div', { class: 'rc-grid' }, C.workflows.map(workflowCard)));
  return out;
}

function stepTitle(step) {
  if (step.name) return step.name;
  if (step.run) return step.run.split(/\r?\n/)[0].slice(0, 80);
  if (step.uses) return step.uses;
  return 'Unnamed step';
}

function stepMeta(step) {
  const parts = [];
  if (step.workingDirectory) parts.push('Directory: ' + step.workingDirectory);
  if (step.shell) parts.push('Shell: ' + step.shell);
  if (step.if) parts.push('Condition: ' + step.if);
  if (step.env && step.env.length) parts.push('Env: ' + step.env.join(', '));
  if (step.with && step.with.length) parts.push('Inputs: ' + step.with.join(', '));
  return parts;
}

function stepRow(step) {
  const meta = stepMeta(step);
  const kindLabel = step.kind === 'run' ? 'Command' : step.kind === 'uses' ? 'Action' : 'Unknown';
  return h(
    'div',
    { class: 'ci-step' },
    h(
      'div',
      { class: 'ci-step-head' },
      h('span', { class: 'ci-step-no', text: String(step.index + 1) }),
      h('span', { class: 'rc-chip', text: kindLabel }),
      h('b', { class: 'ci-step-name', text: stepTitle(step) }),
      chip(STEP_SUPPORT[step.support] || STEP_SUPPORT.unsupported),
      step.review ? chip(REVIEW_CHIP) : null,
      step.line ? h('span', { class: 'rc-where', text: 'line ' + step.line }) : null
    ),
    step.run ? h('pre', { class: 'ci-run', text: step.run }) : null,
    step.uses ? h('code', { class: 'rc-cmd', text: step.uses }) : null,
    meta.length ? h('div', { class: 'ci-meta' }, meta.map((item) => h('span', { text: item }))) : null,
    step.notes && step.notes.length ? h('ul', { class: 'ci-notes' }, step.notes.map((note) => h('li', { text: note }))) : null
  );
}

function jobCard(job) {
  const sup = SUPPORT[job.support] || SUPPORT.unsupported;
  const meta = [];
  if (job.runsOn) meta.push('Runs on: ' + job.runsOn);
  if (job.needs.length) meta.push('Needs: ' + job.needs.join(', '));
  if (job.workingDirectory) meta.push('Directory: ' + job.workingDirectory);
  if (job.environment) meta.push('Environment: ' + job.environment);
  if (job.if) meta.push('Condition: ' + job.if);
  if (job.services.length) meta.push('Services: ' + job.services.join(', '));
  if (job.timeoutMinutes) meta.push('Timeout: ' + job.timeoutMinutes + ' min);
  return h(
    'div',
    { class: 'rc-card' },
    h(
      'div',
      { class: 'rc-card-head' },
      h('div', null, h('h3', { text: job.name }), job.name !== job.id ? h('div', { class: 'rc-where rc-mono', text: job.id }) : null),
      h('div', { class: 'rc-row' }, chip(sup), h('span', { class: 'rc-where', text: plural(job.steps.length, 'step') }))
    ),
    jobSelector(job),
    meta.length ? h('div', { class: 'ci-meta' }, meta.map((item) => h('span', { text: item }))) : null,
    job.notes.length ? h('ul', { class: 'ci-notes' }, job.notes.map((note) => h('li', { text: note }))) : null,
    job.steps.length ? h('div', { class: 'ci-steps' }, job.steps.map(stepRow)) : null
  );
}

function filterLines(w) {
  const lines = [];
  const filters = w.triggerFilters || {};
  for (const event of Object.keys(filters)) {
    const filter = filters[event];
    const parts = [];
    if (filter.branches.length) parts.push('branches ' + filter.branches.join(', '));
    if (filter.tags.length) parts.push('tags ' + filter.tags.join(', '));
    if (filter.paths.length) parts.push('paths ' + filter.paths.join(', '));
    if (filter.pathsIgnore.length) parts.push('ignores ' + filter.pathsIgnore.join(', '));
    lines.push(event + ': ' + parts.join(' / '));
  }
  return lines;
}

function detailView() {
  const back = h('button', { class: 'rc-btn secondary small', text: 'Back to workflows', onclick: closeDetail });
  if (C.detailLoading) {
    return [h('div', { class: 'rc-row' }, back), h('div', { class: 'rc-empty', text: 'Reading the workflow...' })];
  }
  if (C.detailError || !C.detail) {
    return [h('div', { class: 'rc-row' }, back), h('div', { class: 'rc-warn red', text: C.detailError || 'The workflow could not be read.' })];
  }

  const w = C.detail;
  const cat = CATEGORY[w.category] || CATEGORY.unknown;
  const sup = SUPPORT[w.support] || SUPPORT.unsupported;
  const features = featureNames(w.features);
  const filters = filterLines(w);
  const head = h(
    'div',
    { class: 'rc-card' },
    h('div', { class: 'rc-card-head' }, h('h3', { text: w.name }), h('div', { class: 'rc-row' }, chip(sup), badge(cat))),
    h('div', null, h('code', { class: 'rc-cmd', text: w.file })),
    h('p', { text: w.parseError ? 'This file could not be parsed.' : triggerText(w) }),
    w.trusted ? h('p', { class: 'rc-chip done', text: 'Workflow hash trusted' }) : h('p', { class: 'rc-chip skipped', text: 'Workflow hash not trusted' }),
    filters.length ? h('ul', { class: 'ci-notes plain' }, filters.map((line) => h('li', { text: line }))) : null,
    w.parseError ? h('div', { class: 'rc-warn red', text: parseErrorText(w) }) : null,
    w.deployBlocked
      ? h('div', { class: 'rc-warn red', text: 'Looks like a deployment or release workflow, so local runs stay disabled. ' + w.deployReasons.join('; ') + '.' })
      : null,
    (w.problems || []).map((problem) => h('div', { class: 'rc-warn', text: problem })),
    features.length ? h('div', { class: 'rc-where', text: 'Uses ' + features.join(', ') }) : null
  );

  const modeSelect = document.createElement('select');
  for (const [value, label] of [
    ['full', 'Full workflow'],
    ['selected', 'Selected jobs + dependencies'],
    ['single', 'One job + dependencies'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = C.planMode === value;
    modeSelect.append(option);
  }
  modeSelect.addEventListener('change', () => {
    C.planMode = modeSelect.value;
    if (C.planMode === 'single' && C.selectedJobIds.size > 1) C.selectedJobIds = new Set();
    C.plan = null;
    C.planError = '';
    S.hooks.renderPage();
  });

  return [
    h('div', { class: 'rc-row' }, back),
    head,
    h(
      'div',
      { class: 'rc-row' },
      h('label', null, 'Plan mode '),
      modeSelect,
      h('button', {
        class: 'rc-btn',
        text: C.planLoading ? 'Building plan...' : 'Review plan',
        disabled: C.planLoading || !!w.parseError,
        onclick: makePlan,
      })
    ),
    C.planMode !== 'full' && C.selectedJobIds.size === 0
      ? h('p', { class: 'rc-where', text: 'Select one or more jobs below before reviewing this plan.' })
      : null,
    C.planError ? h('div', { class: 'rc-warn red', text: C.planError }) : null,
    planReview(),
    w.jobs.length ? h('div', { class: 'rc-section', text: plural(w.jobs.length, 'job') }) : null,
    w.jobs.map(jobCard),
  ];
}

export function ciPage() {
  ensureStyles();
  sync();
  if (!C.loaded && !C.loading) load();
  return C.selected ? detailView() : listView();
}