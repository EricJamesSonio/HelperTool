import { S, h, call, toast } from './state.js';

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
  preflight: null,
  preflightError: '',
  preflightLoading: false,
  envNames: [],
  envError: '',
  envName: '',
  envValue: '',
  envSaving: false,
  changes: null,
  changesError: '',
  changesLoading: false,
  changesBase: '',
};

const R = {
  running: false,
  error: '',
  planHash: '',
};

const MAX_CHANGE_ROWS = 200;

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

const CHANGE_STATUS = {
  M: { label: 'Modified', cls: 'skipped' },
  A: { label: 'Added', cls: 'done' },
  D: { label: 'Deleted', cls: 'failed' },
  R: { label: 'Renamed', cls: 'skipped' },
  C: { label: 'Copied', cls: 'skipped' },
  U: { label: 'Conflict', cls: 'failed' },
  '?': { label: 'Untracked', cls: 'done' },
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
  C.preflight = null;
  C.preflightError = '';
  C.preflightLoading = false;
  C.envNames = [];
  C.envError = '';
  C.envName = '';
  C.envValue = '';
  C.envSaving = false;
  C.changes = null;
  C.changesError = '';
  C.changesLoading = false;
  C.changesBase = '';
  R.running = false;
  R.error = '';
  R.planHash = '';
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
  C.preflight = null;
  C.preflightError = '';
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
  C.preflight = null;
  C.preflightError = '';
  C.selectedJobIds = new Set();
  R.error = '';
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
  C.preflight = null;
  C.preflightError = '';
  C.selectedJobIds = new Set();
  R.error = '';
  S.hooks.renderPage();
}

async function trustWorkflow() {
  if (!C.detail) return;
  const repoPath = S.repoPath;
  const file = C.detail.file;
  const hash = C.detail.hash;
  let trusted = false;

  try {
    await call('ciTrust', { repoPath, file, hash });
    if (repoPath !== S.repoPath || repoPath !== C.repoPath || file !== C.selected) return;
    C.detail.trusted = true;
    C.plan = null;
    C.preflight = null;
    C.preflightError = '';
    C.planError = '';
    trusted = true;
  } catch (e) {
    if (repoPath !== S.repoPath || repoPath !== C.repoPath || file !== C.selected) return;
    C.planError = e.message;
  }
  S.hooks.renderPage();
  if (trusted) await makePlan();
}

async function makePlan() {
  if (!C.detail) return;
  const repoPath = S.repoPath;
  const file = C.detail.file;
  C.planLoading = true;
  C.planError = '';
  C.preflight = null;
  C.preflightError = '';
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

async function runPreflight() {
  if (!C.detail || !C.plan) return;
  const repoPath = S.repoPath;
  const file = C.detail.file;
  C.preflightLoading = true;
  C.preflightError = '';
  S.hooks.renderPage();

  try {
    const response = await call('ciPreflight', {
      repoPath,
      file,
      mode: C.planMode,
      jobIds: [...C.selectedJobIds],
      approvedSkips: [],
      planHash: C.plan.hash,
    });
    if (repoPath !== S.repoPath || repoPath !== C.repoPath || file !== C.selected) return;
    C.preflight = response.preflight;
  } catch (e) {
    if (repoPath !== S.repoPath || repoPath !== C.repoPath || file !== C.selected) return;
    C.preflight = null;
    C.preflightError = e.message;
  } finally {
    if (repoPath === S.repoPath && repoPath === C.repoPath && file === C.selected) {
      C.preflightLoading = false;
      S.hooks.renderPage();
    }
  }
}

async function detectChanges() {
  const repoPath = S.repoPath;
  C.changesLoading = true;
  C.changesError = '';
  S.hooks.renderPage();

  try {
    const response = await call('ciChanges', { repoPath, base: C.changesBase.trim() });
    if (repoPath !== S.repoPath || repoPath !== C.repoPath) return;
    C.changes = response.changes;
  } catch (e) {
    if (repoPath !== S.repoPath || repoPath !== C.repoPath) return;
    C.changes = null;
    C.changesError = e.message;
  } finally {
    if (repoPath === S.repoPath && repoPath === C.repoPath) {
      C.changesLoading = false;
      S.hooks.renderPage();
    }
  }
}

async function runCi() {
  if (!C.detail || !C.plan || R.running) return;
  const repoPath = S.repoPath;
  const file = C.detail.file;
  const planHash = C.plan.hash;
  const commandSteps = (C.plan.jobs || []).reduce(
    (total, job) => total + (job.steps || []).filter((step) => step.kind === 'run').length,
    0
  );
  const message = 'Run ' + commandSteps + ' command step(s) from ' + file + ' on this machine? They can change files and data in this repository.';
  if (!window.confirm(message)) return;

  R.running = true;
  R.error = '';
  R.planHash = planHash;
  S.hooks.renderPage();

  try {
    await call('ciRun', {
      repoPath,
      file,
      mode: C.planMode,
      jobIds: [...C.selectedJobIds],
      approvedSkips: [],
      planHash,
      ack: true,
    });
    toast('CI run started. Follow it in the Repo Console output.');
  } catch (e) {
    R.error = e.message;
  } finally {
    R.running = false;
    S.hooks.renderPage();
  }
}

async function loadEnvNames() {
  const repoPath = S.repoPath;
  try {
    const response = await call('ciEnvGet', { repoPath });
    if (repoPath !== S.repoPath || repoPath !== C.repoPath) return;
    C.envNames = response.names || [];
    C.envError = '';
  } catch (e) {
    if (repoPath !== S.repoPath || repoPath !== C.repoPath) return;
    C.envError = e.message;
  }
  S.hooks.renderPage();
}

async function saveEnvValue(event) {
  event.preventDefault();
  const name = C.envName.trim();
  if (!name || !C.envValue) {
    C.envError = 'Enter a variable name and value.';
    S.hooks.renderPage();
    return;
  }

  C.envSaving = true;
  C.envError = '';
  const repoPath = S.repoPath;
  try {
    const response = await call('ciEnvSet', {
      repoPath,
      values: { [name]: C.envValue },
    });
    if (repoPath !== S.repoPath || repoPath !== C.repoPath) return;
    C.envNames = response.names || [];
    C.envName = '';
    C.envValue = '';
  } catch (e) {
    if (repoPath !== S.repoPath || repoPath !== C.repoPath) return;
    C.envError = e.message;
  } finally {
    if (repoPath === S.repoPath && repoPath === C.repoPath) {
      C.envSaving = false;
      S.hooks.renderPage();
    }
  }
}

async function deleteEnvValue(name) {
  const repoPath = S.repoPath;
  try {
    const response = await call('ciEnvDelete', { repoPath, name });
    if (repoPath !== S.repoPath || repoPath !== C.repoPath) return;
    C.envNames = response.names || [];
    C.envError = '';
  } catch (e) {
    if (repoPath !== S.repoPath || repoPath !== C.repoPath) return;
    C.envError = e.message;
  }
  S.hooks.renderPage();
}

function envSettings() {
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.autocomplete = 'off';
  nameInput.placeholder = 'VARIABLE_NAME';
  nameInput.value = C.envName;
  nameInput.addEventListener('input', () => {
    C.envName = nameInput.value;
  });

  const valueInput = document.createElement('input');
  valueInput.type = 'password';
  valueInput.autocomplete = 'new-password';
  valueInput.placeholder = 'Value (never displayed again)';
  valueInput.value = C.envValue;
  valueInput.addEventListener('input', () => {
    C.envValue = valueInput.value;
  });

  const form = h(
    'form',
    { class: 'ci-env-form', onsubmit: saveEnvValue },
    nameInput,
    valueInput,
    h('button', { class: 'rc-btn secondary', type: 'submit', disabled: C.envSaving, text: C.envSaving ? 'Saving...' : 'Save value' })
  );

  return h(
    'section',
    { class: 'ci-env' },
    h('div', { class: 'rc-card-head' }, h('h3', { text: 'Local environment values' })),
    h('p', { class: 'rc-where', text: 'Values are stored in the app user data folder for this repository. They are never returned by the environment-list API.' }),
    form,
    h('button', { class: 'rc-btn secondary small', text: 'Refresh names', onclick: loadEnvNames }),
    C.envError ? h('div', { class: 'rc-warn red', text: C.envError }) : null,
    C.envNames.length
      ? h(
          'ul',
          { class: 'ci-env-list' },
          C.envNames.map((name) =>
            h(
              'li',
              null,
              h('code', { text: name }),
              h('button', { class: 'rc-btn secondary small', text: 'Delete', onclick: () => deleteEnvValue(name) })
            )
          )
        )
      : h('p', { class: 'rc-where', text: 'No local values are saved for this repository.' })
  );
}

function preflightReview() {
  if (C.preflightLoading) return h('div', { class: 'rc-empty', text: 'Checking local prerequisites...' });
  if (C.preflightError) return h('div', { class: 'rc-warn red', text: C.preflightError });
  if (!C.preflight) return null;

  const result = C.preflight;
  return h(
    'section',
    { class: 'ci-preflight' },
    h('h3', { text: 'Preflight results' }),
    result.blockers.length
      ? h(
          'div',
          { class: 'rc-warn red' },
          h('b', { text: 'Blockers' }),
          h('ul', null, result.blockers.map((item) => h('li', { text: item })))
        )
      : h('p', { class: 'rc-chip done', text: 'No blockers found.' }),
    result.warnings.length ? h('div', { class: 'rc-warn' }, h('b', { text: 'Warnings' }), h('ul', null, result.warnings.map((item) => h('li', { text: item })))) : null,
    result.runtimes.length
      ? h('div', null, h('h4', { text: 'Detected tools' }), h('ul', null, result.runtimes.map((runtime) => h('li', { text: runtime.name + ': ' + (runtime.available ? runtime.version || 'available' : 'missing') }))))
      : null,
    result.services.length
      ? h('div', null, h('h4', { text: 'Service ports' }), h('ul', null, result.services.map((service) => h('li', { text: service.jobId + ' / ' + service.name + ' / localhost:' + service.port + ' / ' + (service.available ? 'reachable' : 'not reachable') }))))
      : null
  );
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
    C.preflight = null;
    C.planError = '';
    C.preflightError = '';
    S.hooks.renderPage();
  });
  label.append(input, document.createTextNode(' Include in plan'));
  return label;
}

function planReview() {
  if (!C.plan) return null;

  const plan = C.plan;
  const allReady = (plan.jobs || []).every((job) => job.state === 'ready');
  const clean = !!plan.trusted && !(plan.blockers || []).length && allReady;
  const preflightClean = !!C.preflight && !C.preflight.blockers.length;

  let runHint = null;
  if (!clean) {
    runHint = 'Running stays disabled until the workflow is trusted, the plan has no blockers, and every job is ready.';
  } else if (!preflightClean) {
    runHint = 'Run the preflight checks first. Running needs a preflight with no blockers.';
  }

  return h(
    'section',
    { class: 'ci-plan', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'CI plan review' },
    h('h3', { text: 'Plan review' }),
    h('p', { class: 'rc-where', text: 'Plan hash: ' + plan.hash }),
    plan.trusted
      ? h('p', { class: 'rc-chip done', text: 'This workflow hash is trusted.' })
      : h('div', { class: 'rc-warn red', text: 'This workflow is not trusted yet. Review it before trusting this hash.' }),
    (plan.blockers || []).map((blocker) => h('div', { class: 'rc-warn red', text: blocker })),
    (plan.jobs || []).map((job) =>
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
              ? h('p', { class: 'rc-warn', text: 'Local secrets required: ' + step.secretNames.join(', ') })
              : null,
            step.referencedEnvNames && step.referencedEnvNames.length
              ? h('p', { class: 'rc-where', text: 'Environment values referenced: ' + step.referencedEnvNames.join(', ') })
              : null
          )
        )
      )
    ),
    h('button', {
      class: 'rc-btn',
      text: C.preflightLoading ? 'Checking...' : 'Run preflight checks',
      disabled: C.preflightLoading,
      onclick: runPreflight,
    }),
    preflightReview(),
    envSettings(),
    !plan.trusted && C.detail && C.detail.hash
      ? h('button', { class: 'rc-btn danger', text: 'I reviewed this workflow; trust this hash', onclick: trustWorkflow })
      : null,
    runHint ? h('p', { class: 'rc-where', text: runHint }) : null,
    R.error && R.planHash === plan.hash ? h('div', { class: 'rc-warn red', text: R.error }) : null,
    h('button', {
      class: 'rc-btn danger',
      text: R.running ? 'Starting...' : 'Run workflow locally',
      disabled: R.running || !clean || !preflightClean,
      onclick: runCi,
    }),
    h('button', {
      class: 'rc-btn secondary',
      text: 'Close plan',
      onclick: () => {
        C.plan = null;
        C.preflight = null;
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
    h('p', { class: 'rc-lead', text: 'Workflows found in .github/workflows. Review a workflow and its plan here, and run it locally once it is trusted.' }),
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
  if (job.timeoutMinutes) meta.push('Timeout: ' + job.timeoutMinutes + ' min');
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

function changeRow(entry) {
  const info = CHANGE_STATUS[entry.status] || { label: entry.status, cls: 'skipped' };
  return h(
    'div',
    { class: 'rc-row' },
    chip(info),
    h('span', { class: 'rc-mono', text: entry.file }),
    h('span', { class: 'rc-where', text: entry.sources.join(' + ') })
  );
}

function changesResult() {
  if (C.changesLoading) return h('div', { class: 'rc-empty', text: 'Reading Git state...' });
  if (C.changesError) return h('div', { class: 'rc-warn red', text: C.changesError });
  if (!C.changes) return null;

  const changes = C.changes;
  const where = changes.branch ? 'Branch ' + changes.branch : 'Detached HEAD';
  const head = changes.head ? ' / HEAD ' + changes.head.slice(0, 7) : '';
  const compared = changes.base
    ? 'Compared with ' + changes.base.ref + ' (merge base ' + changes.base.mergeBase.slice(0, 7) + ')'
    : 'No base branch used';
  const shown = changes.files.slice(0, MAX_CHANGE_ROWS);

  return h(
    'div',
    null,
    h('p', { class: 'rc-where', text: where + head + ' / ' + compared }),
    changes.note ? h('div', { class: 'rc-warn', text: changes.note }) : null,
    h(
      'div',
      { class: 'rc-row' },
      h('span', { class: 'rc-chip done', text: plural(changes.total, 'changed file') }),
      h('span', { class: 'rc-chip skipped', text: 'Committed: ' + changes.committed }),
      h('span', { class: 'rc-chip skipped', text: 'Working tree: ' + changes.working })
    ),
    changes.truncated ? h('div', { class: 'rc-warn', text: 'Git reported more files than the list keeps. Only the first ' + changes.files.length + ' are included.' }) : null,
    shown.length ? h('div', { class: 'rc-test-list' }, shown.map(changeRow)) : h('p', { class: 'rc-where', text: 'No changed files were found.' }),
    changes.files.length > shown.length ? h('p', { class: 'rc-where', text: 'And ' + (changes.files.length - shown.length) + ' more.' }) : null
  );
}

function changesCard() {
  const baseInput = document.createElement('input');
  baseInput.type = 'text';
  baseInput.autocomplete = 'off';
  baseInput.spellcheck = false;
  baseInput.placeholder = 'Base branch (optional, for example origin/main)';
  baseInput.value = C.changesBase;
  baseInput.addEventListener('input', () => {
    C.changesBase = baseInput.value;
  });

  return h(
    'section',
    { class: 'rc-card' },
    h('div', { class: 'rc-card-head' }, h('h3', { text: 'Changed files' })),
    h('p', { class: 'rc-where', text: 'Reads fresh Git state: committed changes since the merge base plus uncommitted and untracked files. Nothing is run.' }),
    h(
      'div',
      { class: 'rc-row' },
      baseInput,
      h('button', {
        class: 'rc-btn secondary',
        text: C.changesLoading ? 'Reading...' : 'Detect changed files',
        disabled: C.changesLoading,
        onclick: detectChanges,
      })
    ),
    changesResult()
  );
}

function detailView() {
  const back = h('button', { class: 'rc-btn secondary small', text: 'Back to workflows', onclick: closeDetail });
  if (C.detailLoading) {
    return [h('div', { class: 'rc-row' }, back), h('div', { class: 'rc-empty', text: 'Reading the workflow...' })];
  }
  if (C.detailError || !C.detail) {
    return [h('div', { class: 'rc-row' }, back), h('div', { class: 'rc-warn red', text: C.detailError || 'The workflow could not be read.' })];
  }

  const workflow = C.detail;
  const category = CATEGORY[workflow.category] || CATEGORY.unknown;
  const support = SUPPORT[workflow.support] || SUPPORT.unsupported;
  const features = featureNames(workflow.features);
  const filters = filterLines(workflow);
  const head = h(
    'div',
    { class: 'rc-card' },
    h('div', { class: 'rc-card-head' }, h('h3', { text: workflow.name }), h('div', { class: 'rc-row' }, chip(support), badge(category))),
    h('div', null, h('code', { class: 'rc-cmd', text: workflow.file })),
    h('p', { text: workflow.parseError ? 'This file could not be parsed.' : triggerText(workflow) }),
    workflow.trusted ? h('p', { class: 'rc-chip done', text: 'Workflow hash trusted' }) : h('p', { class: 'rc-chip skipped', text: 'Workflow hash not trusted' }),
    filters.length ? h('ul', { class: 'ci-notes plain' }, filters.map((line) => h('li', { text: line }))) : null,
    workflow.parseError ? h('div', { class: 'rc-warn red', text: parseErrorText(workflow) }) : null,
    workflow.deployBlocked
      ? h('div', { class: 'rc-warn red', text: 'Looks like a deployment or release workflow, so local runs stay disabled. ' + workflow.deployReasons.join('; ') + '.' })
      : null,
    (workflow.problems || []).map((problem) => h('div', { class: 'rc-warn', text: problem })),
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
    C.preflight = null;
    C.planError = '';
    C.preflightError = '';
    S.hooks.renderPage();
  });

  return [
    h('div', { class: 'rc-row' }, back),
    head,
    changesCard(),
    h(
      'div',
      { class: 'rc-row' },
      h('label', null, 'Plan mode '),
      modeSelect,
      h('button', {
        class: 'rc-btn',
        text: C.planLoading ? 'Building plan...' : 'Review plan',
        disabled: C.planLoading || !!workflow.parseError,
        onclick: makePlan,
      })
    ),
    C.planMode !== 'full' && C.selectedJobIds.size === 0
      ? h('p', { class: 'rc-where', text: 'Select one or more jobs below before reviewing this plan.' })
      : null,
    C.planError ? h('div', { class: 'rc-warn red', text: C.planError }) : null,
    planReview(),
    workflow.jobs.length ? h('div', { class: 'rc-section', text: plural(workflow.jobs.length, 'job') }) : null,
    workflow.jobs.map(jobCard),
  ];
}

export function ciPage() {
  ensureStyles();
  sync();
  if (!C.loaded && !C.loading) load();
  return C.selected ? detailView() : listView();
}