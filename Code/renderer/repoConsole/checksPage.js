import { S, h, call, toast } from './state.js';

const K = { repoPath: '', loaded: false, loading: false, error: '', plan: null, busy: '' };
const KINDS = [
  ['lint', 'Lint'],
  ['typecheck', 'Type check'],
  ['test', 'Tests'],
  ['build', 'Build'],
];

function kindLabel(kind) {
  const hit = KINDS.find((k) => k[0] === kind);
  return hit ? hit[1] : kind;
}

function sync() {
  if (K.repoPath === S.repoPath) return;
  K.repoPath = S.repoPath;
  K.loaded = false;
  K.loading = false;
  K.error = '';
  K.plan = null;
  K.busy = '';
}

async function load() {
  const repoPath = S.repoPath;
  K.loading = true;
  try {
    const res = await call('checksPlan', { repoPath });
    if (repoPath !== K.repoPath) return;
    K.plan = res.plan;
    K.error = '';
  } catch (e) {
    if (repoPath !== K.repoPath) return;
    K.plan = null;
    K.error = e.message;
  }
  K.loaded = true;
  K.loading = false;
  S.hooks.renderPage();
}

async function saveSettings(patch) {
  try {
    const res = await call('checksSettings', { patch });
    if (K.plan) K.plan.settings = res.settings;
    K.loaded = false;
  } catch (e) {
    toast(e.message, 'error');
  }
  S.hooks.renderPage();
}

async function runNow(scope) {
  if (K.busy) return;
  K.busy = scope;
  S.hooks.renderPage();
  try {
    const res = await call('checksRun', { repoPath: S.repoPath, scope });
    const r = res.result || {};
    if (r.started) toast('Checks started for ' + r.projects.join(', '));
    else if (r.queued) toast('Another job is running. Checks start when it finishes.');
    else if (r.skipped === 'nothing') toast(r.reasons && r.reasons.length ? 'Nothing to run: ' + r.reasons[0] : 'No checks apply.');
    else toast('Nothing was started.');
  } catch (e) {
    toast(e.message, 'error');
  }
  K.busy = '';
  S.hooks.renderPage();
}

function toggle(label, checked, onchange) {
  return h('label', { class: 'rc-check' }, h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) }), h('span', { text: label }));
}

function settingsCard(settings) {
  return h(
    'div',
    { class: 'rc-card' },
    h('h3', { text: 'Run after push' }),
    h('p', { text: 'After a push from Git Tool, only the projects that contain pushed files are checked, in the background. Lint, type check and tests run when found. A project with no tests gets its build run instead, so errors still show up.' }),
    h(
      'div',
      { class: 'pc-toggles' },
      toggle('Run checks automatically after every push', settings.enabled, (v) => saveSettings({ enabled: v })),
      KINDS.map(([id, label]) => toggle(label, settings.kinds[id] !== false, (v) => saveSettings({ kinds: { [id]: v } }))),
      toggle('Always run the build, even when the project has tests', settings.buildMode === 'always', (v) => saveSettings({ buildMode: v ? 'always' : 'fallback' })),
      toggle('Include heavy builds (Next.js / Nuxt) that can clash with a running dev server', settings.heavyBuilds, (v) => saveSettings({ heavyBuilds: v }))
    ),
    h(
      'div',
      { class: 'rc-row', style: 'margin-top:12px' },
      h('button', {
        class: 'rc-btn',
        text: K.busy === 'all' ? 'Starting...' : 'Run all checks',
        disabled: !!K.busy,
        onclick: () => runNow('all'),
      }),
      h('button', {
        class: 'rc-btn secondary',
        text: K.busy === 'unpushed' ? 'Starting...' : 'Run for unpushed commits',
        disabled: !!K.busy,
        onclick: () => runNow('unpushed'),
      })
    )
  );
}

function projectCard(project) {
  return h(
    'div',
    { class: 'rc-card' },
    h(
      'div',
      { class: 'rc-card-head' },
      h('h3', { text: project.label }),
      h('div', { class: 'rc-row' }, project.stacks.map((s) => h('span', { class: 'rc-badge risk-adds', text: s })))
    ),
    h(
      'div',
      { class: 'pc-checks' },
      project.checks.map((c) =>
        h(
          'div',
          { class: 'pc-check' + (c.skip ? ' off' : '') },
          h('span', { class: 'pc-kind pc-kind-' + c.kind, text: kindLabel(c.kind) }),
          h('code', { class: 'rc-cmd', text: c.command }),
          c.skip ? h('span', { class: 'rc-where', text: c.skip }) : null
        )
      )
    )
  );
}

export function checksPage() {
  sync();
  if (!K.loaded && !K.loading) load();
  const out = [
    h('p', {
      class: 'rc-lead',
      text: 'The lint, type check, test and build commands found for each project in this repository. These are the checks that run after a push, the same kind a deploy such as Render or Vercel runs.',
    }),
  ];
  if (K.error) {
    out.push(h('div', { class: 'rc-warn red', text: K.error }));
    return out;
  }
  if (!K.plan) {
    out.push(h('div', { class: 'rc-empty', text: 'Looking for projects...' }));
    return out;
  }
  out.push(settingsCard(K.plan.settings));
  if (!K.plan.projects.length) {
    out.push(h('div', { class: 'rc-empty', text: 'No lint, type check, test or build command was found in this repository.' }));
    return out;
  }
  out.push(h('div', { class: 'rc-section', text: 'Detected projects' }), h('div', { class: 'rc-grid' }, K.plan.projects.map(projectCard)));
  return out;
}