import { S, h, call, liveEntry, isRunning, fmtMs, fmtDate, relativeTime, statusLabel, statusChip, toast } from './state.js';
import { openHistoryRun, stopJob, testResultsBlock, suiteSeg, getSuiteFilter } from './monitor.js';

const RISK = {
  readonly: { label: 'Read-only', cls: 'risk-readonly' },
  adds: { label: 'Adds data', cls: 'risk-adds' },
  changes: { label: 'Changes data', cls: 'risk-changes' },
  destructive: { label: 'Deletes data', cls: 'risk-destructive' },
};

let historyTimer = null;

function badge(risk) {
  const r = RISK[risk] || RISK.changes;
  return h('span', { class: 'rc-badge ' + r.cls, text: r.label });
}

function runningChip() {
  return h('span', { class: 'rc-chip running' }, h('span', { class: 'rc-spin' }), 'Running');
}

function targetText(plan) {
  const t = plan.target;
  if (!t || !t.configured) return 'no database setting found';
  return t.host + (t.port ? ':' + t.port : '') + ' / ' + t.database;
}

function listBlock(title, items) {
  if (!items || !items.length) return null;
  return h('div', null, h('h4', { text: title }), h('ul', null, items.map((i) => h('li', { text: i }))));
}

/* ---------- trust ---------- */

function trustBox() {
  const c = S.catalog;
  const nodes = [];
  if (c.notice) nodes.push(h('div', { class: 'rc-warn', text: c.notice }));
  if (c.source === 'manifest' && !c.trusted) {
    nodes.push(
      h(
        'div',
        { class: 'rc-warn red' },
        h('div', { text: 'This repository ships its own console manifest (.helper/console.json). It can run commands on your computer, so nothing runs until you trust it. Open the file, read it, then trust it here.' }),
        h('div', { class: 'rc-row', style: 'margin-top:8px' }, h('button', { class: 'rc-btn small', text: 'I reviewed it, trust this manifest', onclick: trustManifest }))
      )
    );
  }
  return nodes;
}

async function trustManifest() {
  try {
    await call('trust', { repoPath: S.repoPath, hash: S.catalog.hash });
    toast('Manifest trusted');
    S.hooks.refreshCatalog();
  } catch (e) {
    toast(e.message, 'error');
  }
}

/* ---------- action cards ---------- */

function itemCard(item) {
  const plan = item.targets[S.env];
  if (!plan) {
    return h(
      'div',
      { class: 'rc-card' },
      h('div', { class: 'rc-card-head' }, h('h3', { text: item.title }), badge(item.risk)),
      h('p', { text: item.summary }),
      h('div', { class: 'rc-where', text: 'Not available for ' + S.env + '.' })
    );
  }
  const needsDb = item.needsDb !== false;
  const pending = S.pending.has(item.id);
  const noDb = needsDb && !(plan.target && plan.target.configured);
  const blocked = pending || isRunning() || plan.missing || plan.blocked || noDb;
  const reason = pending
    ? 'Starting...'
    : plan.blocked
      ? 'Manifest not trusted'
      : plan.missing
        ? 'Script not found'
        : noDb
          ? 'No database configured'
          : isRunning()
            ? 'Another job is running'
            : '';
  const prodWarn = (S.env === 'production' || plan.strong) && item.warnProd;

  const more = h(
    'details',
    { class: 'rc-more' },
    h('summary', { text: 'What it does and what it changes' }),
    h(
      'div',
      { class: 'rc-more-body' },
      listBlock('What it does', item.does),
      listBlock('What it changes', item.changes),
      item.keeps ? h('div', null, h('h4', { text: 'What it leaves alone' }), h('p', { text: item.keeps })) : null,
      item.twice ? h('div', null, h('h4', { text: 'Safe to run twice?' }), h('p', { text: item.twice })) : null,
      item.order ? h('div', null, h('h4', { text: 'When to run it' }), h('p', { text: item.order })) : null
    )
  );
  if (S.openCards.has(item.id)) more.setAttribute('open', '');
  more.addEventListener('toggle', () => {
    if (more.open) S.openCards.add(item.id);
    else S.openCards.delete(item.id);
  });

  const last = item.lastRuns ? item.lastRuns[S.env] : null;
  const lastLine = last
    ? h(
        'button',
        { class: 'rc-link', onclick: () => openHistoryRun(last.id) },
        'Last run ' + relativeTime(last.startedAt) + ' \u00b7 ' + statusLabel(last.status) + (last.durationMs !== null && last.durationMs !== undefined ? ' \u00b7 ' + fmtMs(last.durationMs) : '')
      )
    : h('span', { class: 'rc-where', text: 'Not run in this environment yet.' });

  const liveJob = liveEntry(S.repoPath);
  const isThisRunning = !!(liveJob && liveJob.job && liveJob.job.actionId === item.id && liveJob.job.status === 'running');
  const statusBadge = isThisRunning ? runningChip() : last ? statusChip(last.status) : null;

  return h(
    'div',
    { class: 'rc-card' + (isThisRunning ? ' running' : '') },
    h(
      'div',
      { class: 'rc-card-head' },
      h('h3', { text: item.title }),
      h('div', { class: 'rc-row' }, statusBadge, plan.remote && S.env === 'local' ? h('span', { class: 'rc-badge remote', text: 'Remote database' }) : null, badge(item.risk))
    ),
    h('p', { text: item.summary }),
    item.warn ? h('div', { class: 'rc-warn', text: item.warn }) : null,
    prodWarn ? h('div', { class: 'rc-warn red', text: item.warnProd }) : null,
    more,
    h(
      'div',
      { class: 'rc-card-foot' },
      h('div', null, h('code', { class: 'rc-cmd', text: plan.display }), needsDb ? h('div', { class: 'rc-where', text: 'Targets ' + targetText(plan) }) : null, lastLine),
      h(
        'div',
        { class: 'rc-row' },
        reason ? h('span', { class: 'rc-where', text: reason }) : null,
        h('button', {
          class: 'rc-btn' + (plan.strong && needsDb ? ' danger' : ''),
          text: pending ? 'Starting...' : item.risk === 'readonly' ? 'Run' : 'Run...',
          disabled: blocked,
          onclick: () => openConfirm(item),
        })
      )
    )
  );
}

function emptyActions() {
  const canPaste = typeof S.hooks.openImport === 'function';
  return h(
    'div',
    { class: 'rc-empty rc-empty-actions' },
    h('h3', { text: 'Nothing was found for this page' }),
    h('p', {
      text: canPaste
        ? 'Paste a list of actions and the console will check it against this repository.'
        : 'Add scripts to package.json, composer.json or a Makefile, or add actions in .helper/console.json.',
    }),
    canPaste ? h('button', { class: 'rc-btn', text: 'Paste actions', onclick: () => S.hooks.openImport() }) : null
  );
}

function actionPage(pageId, lead) {
  const items = S.catalog.items.filter((i) => i.page === pageId);
  const sections = [];
  for (const item of items) if (!sections.includes(item.section)) sections.push(item.section);
  const out = [trustBox(), h('p', { class: 'rc-lead', text: lead })];
  if (!items.length) {
    out.push(emptyActions());
    return out;
  }
  for (const section of sections) {
    out.push(h('div', { class: 'rc-section', text: section }), h('div', { class: 'rc-grid' }, items.filter((i) => i.section === section).map(itemCard)));
  }
  return out;
}

export function seedsPage() {
  return actionPage('seeds', 'Seed scripts found in this repository. Open "What it does" on a card before you run it.');
}

export function databasePage() {
  return actionPage('database', 'Migrations, maintenance and reset scripts. Reset scripts delete data, so they ask for strict confirmation.');
}

export function scriptsPage() {
  return actionPage('scripts', 'Scripts and commands found in this repository (npm, Composer, Laravel artisan, Python, .NET, Go, Rust, Make, CMake), plus any actions from its console manifest.');
}

/* ---------- confirmation modal ---------- */

function openConfirm(item) {
  if (S.modalOpen) return;
  S.modalOpen = true;
  const plan = item.targets[S.env];
  const needsDb = item.needsDb !== false;
  const strong = plan.strong && item.risk !== 'readonly' && needsDb;
  const wipe = S.catalog.wipePhrase;
  const state = { ack: false, phrase: '', phrase2: '', submitting: false };
  const runBtn = h('button', { class: 'rc-btn' + (plan.strong && needsDb ? ' danger' : ''), text: 'Run now', onclick: submit });

  function ready() {
    if (item.risk === 'readonly') return true;
    if (!strong) return state.ack;
    if (state.phrase !== plan.target.database) return false;
    if (item.risk === 'destructive' && state.phrase2 !== wipe) return false;
    return true;
  }
  function refresh() {
    runBtn.disabled = state.submitting || !ready();
  }

  const area = h('div', { class: 'rc-field' });
  if (item.risk === 'readonly') {
    area.append(h('div', { class: 'rc-where', text: 'This only reads. Nothing will be changed.' }));
  } else if (!strong) {
    area.append(
      h(
        'label',
        { class: 'rc-check' },
        h('input', {
          type: 'checkbox',
          onchange: (e) => {
            state.ack = e.target.checked;
            refresh();
          },
        }),
        h('span', { text: 'I have read this and I want to run it.' })
      )
    );
  } else {
    area.append(
      h('label', { text: 'Type the database name "' + plan.target.database + '" to confirm:' }),
      h('input', {
        type: 'text',
        autocomplete: 'off',
        spellcheck: 'false',
        oninput: (e) => {
          state.phrase = e.target.value;
          refresh();
        },
      })
    );
    if (item.risk === 'destructive') {
      area.append(
        h('label', { text: 'This deletes data. Type ' + wipe + ' to confirm:' }),
        h('input', {
          type: 'text',
          autocomplete: 'off',
          spellcheck: 'false',
          oninput: (e) => {
            state.phrase2 = e.target.value;
            refresh();
          },
        })
      );
    }
  }

  const overlay = h(
    'div',
    {
      class: 'rc-overlay',
      onmousedown: (e) => {
        if (e.target === overlay) close();
      },
    },
    h(
      'div',
      { class: 'rc-modal' + (plan.strong && needsDb ? ' prod' : '') },
      h('h2', { text: (plan.appEnv === 'production' ? 'PRODUCTION: ' : '') + item.title }),
      h('div', null, badge(item.risk)),
      h(
        'dl',
        { class: 'rc-kv' },
        h('dt', { text: 'Command' }),
        h('dd', { text: plan.display }),
        h('dt', { text: 'Environment' }),
        h('dd', { text: needsDb ? 'APP_ENV=' + plan.appEnv : 'not used' }),
        h('dt', { text: 'Database' }),
        h('dd', { text: needsDb ? targetText(plan) : 'not used' }),
        h('dt', { text: 'Config read from' }),
        h('dd', { text: (plan.target && plan.target.source) || '-' })
      ),
      plan.remote && S.env === 'local' ? h('div', { class: 'rc-warn red', text: 'This "local" run points at a remote database (' + plan.target.host + ').' }) : null,
      item.warn ? h('div', { class: 'rc-warn', text: item.warn }) : null,
      plan.strong && needsDb && item.warnProd ? h('div', { class: 'rc-warn red', text: item.warnProd }) : null,
      listBlock('What will happen', item.does),
      listBlock('What it changes', item.changes),
      area,
      h('div', { class: 'rc-modal-actions' }, h('button', { class: 'rc-btn secondary', text: 'Cancel', onclick: close }), runBtn)
    )
  );

  function close() {
    S.modalOpen = false;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }
  async function submit() {
    if (!ready() || state.submitting) return;
    state.submitting = true;
    runBtn.disabled = true;
    try {
      await call('run', { repoPath: S.repoPath, id: item.id, envKey: S.env, ack: state.ack, phrase: state.phrase, phrase2: state.phrase2 });
      S.pending.add(item.id);
      close();
      S.hooks.renderPage();
    } catch (e) {
      state.submitting = false;
      refresh();
      toast(e.message, 'error');
    }
  }

  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  refresh();
  const first = overlay.querySelector('input[type="text"]');
  if (first) first.focus();
}

/* ---------- tests page ---------- */

export function testsPage() {
  const suites = S.catalog.suites || [];
  const running = isRunning();
  const entry = liveEntry(S.repoPath);
  const out = [trustBox(), h('p', { class: 'rc-lead', text: 'Runs the same tests as the terminal (npm test) and lists every file with its result. Failed files come first, with the error text.' })];
  if (!suites.length) {
    out.push(h('div', { class: 'rc-empty', text: 'No jest or vitest test script was found in this repository.' }));
    return out;
  }
  const buttons = suites.map((s) => testButton(s.id, 'Run ' + s.title + ' (' + s.files + ' files)', running, false));
  if (suites.length > 1) buttons.push(testButton('all', 'Run all', running, true));
  if (running && entry.job.kind === 'tests') buttons.push(h('button', { class: 'rc-btn danger', text: 'Stop', onclick: () => stopJob(S.repoPath) }));
  out.push(h('div', { class: 'rc-row' }, buttons));
  if (entry && entry.job && entry.job.kind === 'tests') {
    const steps = entry.job.steps;
    const filter = steps.some((s) => s.id === getSuiteFilter()) ? getSuiteFilter() : 'all';
    const shown = filter === 'all' ? steps : steps.filter((s) => s.id === filter);
    out.push(
      h(
        'div',
        { class: 'rc-row' },
        h('span', { class: 'rc-where', text: entry.job.title + (entry.job.endedAt ? ' / finished in ' + fmtMs(entry.job.endedAt - entry.job.startedAt) : '') }),
        steps.length > 1 ? suiteSeg(steps, () => S.hooks.renderPage()) : null
      ),
      shown.map((s) => stepCard(s, entry))
    );
  } else {
    out.push(h('div', { class: 'rc-empty', text: 'No test run yet in this session. Past test runs are kept on the History page.' }));
  }
  return out;
}

function testButton(which, label, running, secondary) {
  const pending = S.pending.has('tests:' + which);
  return h('button', {
    class: 'rc-btn' + (secondary ? ' secondary' : ''),
    text: pending ? 'Starting...' : label,
    disabled: running || pending,
    onclick: () => startTests(which),
  });
}

async function startTests(which) {
  const key = 'tests:' + which;
  if (S.pending.has(key) || isRunning()) return;
  S.pending.add(key);
  S.hooks.renderPage();
  try {
    await call('tests', { repoPath: S.repoPath, which });
  } catch (e) {
    S.pending.delete(key);
    toast(e.message, 'error');
    S.hooks.renderPage();
  }
}

function stepCard(step, entry) {
  const isTest = !!(step.result && step.result.kind === 'tests');
  const kids = [
    h(
      'div',
      { class: 'rc-card-head' },
      h('h3', { text: step.title }),
      h('div', { class: 'rc-row' }, statusChip(step.status, isTest), step.exitCode !== null && step.exitCode !== undefined ? h('span', { class: 'rc-where', text: 'exit ' + step.exitCode }) : null)
    ),
  ];
  if (step.status === 'running' && step.progress) {
    const p = step.progress;
    const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
    kids.push(
      h('div', { class: 'rc-bar' + (p.total ? '' : ' indeterminate') }, h('div', { style: 'width:' + pct + '%' })),
      h('div', { class: 'rc-where', text: p.done + (p.total ? ' of ' + p.total : '') + ' files finished / ' + p.passed + ' passed / ' + p.failed + ' failed' })
    );
    const seen = (p.files || []).slice(-20);
    if (seen.length) {
      kids.push(h('div', { class: 'rc-live-files' }, ...seen.map((f) => h('div', { class: 'rc-line ' + (f.ok ? 'ok' : 'err'), text: (f.ok ? '\u2713 ' : '\u00d7 ') + f.file }))));
    }
  }
  if (step.result) {
    kids.push(testResultsBlock(step));
  } else if (step.status === 'failed' || step.status === 'stopped' || step.status === 'interrupted') {
    const tail = entry.log.filter((l) => l.s === step.idx).slice(-30);
    kids.push(
      h('div', { class: 'rc-where', text: 'No report was written. The output below is the end of this step.' }),
      tail.length ? h('pre', { class: 'rc-tail', text: tail.map((l) => l.t).join('\n') }) : null
    );
  }
  return h('div', { class: 'rc-card' }, ...kids);
}

/* ---------- security page ---------- */

export async function loadSecurity() {
  if (S.security.loading) return;
  S.security.loading = true;
  if (S.page === 'security') S.hooks.renderPage();
  try {
    const res = await call('securityGetSettings', { repoPath: S.repoPath });
    S.security.settings = res.settings;
    S.security.profile = res.profile;
  } catch (e) {
    toast(e.message, 'error');
  }
  S.security.loaded = true;
  S.security.loading = false;
  if (S.page === 'security') S.hooks.renderPage();
}

async function detectStack() {
  if (S.security.detecting) return;
  S.security.detecting = true;
  S.hooks.renderPage();
  try {
    const res = await call('securityDetect', { repoPath: S.repoPath });
    S.security.profile = res.profile;
  } catch (e) {
    toast(e.message, 'error');
  }
  S.security.detecting = false;
  S.hooks.renderPage();
}

function confRow(label, value) {
  return h('div', { class: 'rc-kv-row' }, h('span', { class: 'rc-where', text: label }), h('b', { text: value || 'unknown' }));
}

function profileCard(profile) {
  if (!profile) {
    return h('div', { class: 'rc-empty', text: 'No stack profile yet. Click "Detect stack" to scan this repository.' });
  }
  return h(
    'div',
    { class: 'rc-card rc-sec-profile' },
    h('h3', { text: 'Detected stack' }),
    h(
      'div',
      { class: 'rc-sec-grid' },
      h(
        'div',
        null,
        h('h4', { text: 'Frontend' }),
        confRow('Framework', profile.frontend.framework),
        confRow('Language', profile.frontend.language),
        confRow('Rendering', profile.frontend.rendering),
        confRow('Bundler', profile.frontend.bundler)
      ),
      h('div', null, h('h4', { text: 'Backend' }), confRow('Framework', profile.backend.framework)),
      h('div', null, h('h4', { text: 'Database' }), confRow('Dialect', profile.database.dialect), confRow('Access layer', profile.database.layer)),
      h('div', null, h('h4', { text: 'Auth' }), confRow('Mechanism', profile.auth.mechanism), confRow('Library', profile.auth.library), confRow('Password hashing', profile.auth.hashing))
    ),
    h('div', { class: 'rc-row', style: 'margin-top:10px' }, h('span', {
      class: 'rc-where',
      text:
        'Confidence: frontend ' +
        Math.round(profile.confidence.frontend * 100) +
        '%, database ' +
        Math.round(profile.confidence.database * 100) +
        '%, auth ' +
        Math.round(profile.confidence.auth * 100) +
        '%',
    })),
    profile.surface && profile.surface.endpoints.length
      ? h('div', { class: 'rc-where', text: profile.surface.endpoints.length + ' API route file(s) found' })
      : h('div', { class: 'rc-where', text: 'No API route files were found automatically.' })
  );
}

function settingsCard() {
  const settings = S.security.settings || { targetUrl: '', safeMode: true, confirmedHosts: [] };
  const state = { targetUrl: settings.targetUrl, safeMode: settings.safeMode, saving: false };
  const warnBox = h('div', { hidden: true });
  const saveBtn = h('button', { class: 'rc-btn small', text: 'Save target', onclick: () => save(false) });

  async function save(confirmHost) {
    state.saving = true;
    saveBtn.disabled = true;
    try {
      const res = await call('securitySetSettings', {
        repoPath: S.repoPath,
        targetUrl: state.targetUrl,
        safeMode: state.safeMode,
        confirmHost: !!confirmHost,
      });
      if (res.needsConfirm) {
        warnBox.hidden = false;
        warnBox.replaceChildren(
          h('div', { class: 'rc-warn red', text: res.reason || 'This is not a local address.' }),
          h(
            'div',
            { class: 'rc-row', style: 'margin-top:6px' },
            h('button', { class: 'rc-btn danger small', text: 'I own this target, proceed', onclick: () => save(true) })
          )
        );
      } else {
        warnBox.hidden = true;
        warnBox.replaceChildren();
        S.security.settings = res.settings;
        toast('Target saved');
      }
    } catch (e) {
      toast(e.message, 'error');
    }
    state.saving = false;
    saveBtn.disabled = false;
  }

  const urlInput = h('input', {
    type: 'text',
    placeholder: 'http://localhost:3000',
    value: state.targetUrl,
    oninput: (e) => {
      state.targetUrl = e.target.value;
    },
  });
  const safeCheck = h(
    'label',
    { class: 'rc-check' },
    h('input', {
      type: 'checkbox',
      checked: state.safeMode,
      onchange: (e) => {
        state.safeMode = e.target.checked;
      },
    }),
    h('span', { text: 'Safe mode (only allow write and race tests on a dev/test target)' })
  );

  return h(
    'div',
    { class: 'rc-card' },
    h('h3', { text: 'Target' }),
    h('p', { text: 'Non-local targets need explicit confirmation before any test can run against them.' }),
    h('div', { class: 'rc-field' }, h('label', { text: 'Target URL' }), urlInput),
    safeCheck,
    h('div', { class: 'rc-row', style: 'margin-top:10px' }, saveBtn),
    warnBox
  );
}

export function securityPage() {
  if (!S.security.loaded && !S.security.loading) loadSecurity();
  const profile = S.security.profile;
  return [
    h('p', {
      class: 'rc-lead',
      text:
        'Detects this repository\'s stack (frontend, database, auth) so only the relevant security checks run later. Phase 1 is detection and target setup only; attack packs come in a later phase.',
    }),
    h(
      'div',
      { class: 'rc-row' },
      h('button', {
        class: 'rc-btn',
        text: S.security.detecting ? 'Detecting...' : 'Detect stack',
        disabled: !!S.security.detecting,
        onclick: detectStack,
      })
    ),
    S.security.loading && !profile ? h('div', { class: 'rc-empty', text: 'Loading...' }) : profileCard(profile),
    settingsCard(),
  ];
}

/* ---------- history page ---------- */

export async function loadHistory() {
  if (S.history.loading) return;
  S.history.loading = true;
  if (S.page === 'history') S.hooks.renderPage();
  const f = S.history.filters;
  try {
    const data = await call('history', {
      repoPath: S.repoPath,
      page: S.history.page,
      limit: S.history.limit,
      action: f.action,
      status: f.status,
      env: f.env,
      q: f.q,
    });
    S.history.items = data.items || [];
    S.history.total = data.total || 0;
  } catch (e) {
    toast(e.message, 'error');
    S.history.items = [];
    S.history.total = 0;
  }
  S.history.loaded = true;
  S.history.loading = false;
  if (S.page === 'history') S.hooks.renderPage();
}

function reloadHistory() {
  S.history.page = 1;
  S.history.loaded = false;
  loadHistory();
}

export function historyPage() {
  if (!S.history.loaded && !S.history.loading) loadHistory();
  const f = S.history.filters;
  const actionOptions = [['', 'All actions']];
  for (const item of S.catalog.items) actionOptions.push([item.id, item.title]);
  for (const s of S.catalog.suites || []) actionOptions.push(['tests:' + s.id, 'Tests: ' + s.id]);
  actionOptions.push(['tests:all', 'Tests: all']);
  const pageCount = Math.max(1, Math.ceil(S.history.total / S.history.limit));

  const select = (key, options) =>
    h(
      'select',
      {
        onchange: (e) => {
          f[key] = e.target.value;
          reloadHistory();
        },
      },
      ...options.map(([value, label]) => h('option', { value, selected: f[key] === value, text: label }))
    );

  const toolbar = h(
    'div',
    { class: 'rc-toolbar' },
    select('action', actionOptions),
    select('status', [['', 'All results'], ...['running', 'done', 'failed', 'stopped', 'interrupted'].map((v) => [v, statusLabel(v)])]),
    select('env', [['', 'All environments'], ['local', 'Local'], ['production', 'Production']]),
    h('input', {
      type: 'search',
      placeholder: 'Search history',
      value: f.q,
      oninput: (e) => {
        f.q = e.target.value;
        clearTimeout(historyTimer);
        historyTimer = setTimeout(reloadHistory, 300);
      },
    }),
    h('button', {
      class: 'rc-btn secondary small',
      text: 'Clear history',
      disabled: !S.history.total || isRunning(),
      onclick: openClearHistory,
    })
  );

  const rows = S.history.items.map((run) =>
    h(
      'button',
      { class: 'rc-hrow', onclick: () => openHistoryRun(run.id) },
      h('span', { class: 'rc-hcell' }, h('b', { text: relativeTime(run.startedAt) }), h('span', { class: 'rc-where', text: fmtDate(run.startedAt) })),
      h('span', { class: 'rc-hcell' }, h('b', { text: run.title }), h('span', { class: 'rc-where rc-mono', text: run.actionId || run.command || '' })),
      h('span', { class: 'rc-hcell' }, statusChip(run.status, run.kind === 'tests')),
      h('span', { class: 'rc-hcell' }, h('span', { text: run.database || (run.kind === 'tests' ? 'tests' : '-') }), h('span', { class: 'rc-where', text: run.host || run.env || '' })),
      h('span', { class: 'rc-where', text: run.durationMs !== null && run.durationMs !== undefined ? fmtMs(run.durationMs) : '-' }),
      h('span', { class: 'rc-link', text: 'Open' })
    )
  );

  return [
    h('p', { class: 'rc-lead', text: 'Every action and test run for this repository is saved here with its full output and test report. Click a row to read it again.' }),
    S.catalog.info && S.catalog.info.historyAvailable === false ? h('div', { class: 'rc-warn red', text: 'History storage is not available in this app build, so runs are not being saved.' }) : null,
    toolbar,
    S.history.loading
      ? h('div', { class: 'rc-empty', text: 'Loading history...' })
      : rows.length
        ? h('div', { class: 'rc-hlist' }, rows)
        : h('div', { class: 'rc-empty', text: 'No saved runs match these filters yet.' }),
    h(
      'div',
      { class: 'rc-row' },
      h('span', { class: 'rc-where', text: S.history.total + ' saved run' + (S.history.total === 1 ? '' : 's') + ' / page ' + S.history.page + ' of ' + pageCount }),
      h('button', {
        class: 'rc-btn secondary small',
        text: 'Previous',
        disabled: S.history.page <= 1 || S.history.loading,
        onclick: () => {
          S.history.page -= 1;
          S.history.loaded = false;
          loadHistory();
        },
      }),
      h('button', {
        class: 'rc-btn secondary small',
        text: 'Next',
        disabled: S.history.page >= pageCount || S.history.loading,
        onclick: () => {
          S.history.page += 1;
          S.history.loaded = false;
          loadHistory();
        },
      })
    ),
  ];
}

function openClearHistory() {
  if (S.modalOpen) return;
  S.modalOpen = true;
  const state = { ack: false };
  const runBtn = h('button', { class: 'rc-btn danger', text: 'Clear history', disabled: true, onclick: submit });
  const overlay = h(
    'div',
    {
      class: 'rc-overlay',
      onmousedown: (e) => {
        if (e.target === overlay) close();
      },
    },
    h(
      'div',
      { class: 'rc-modal' },
      h('h2', { text: 'Clear saved history' }),
      h('p', { text: 'This deletes every saved run and its output for this repository. It does not touch any project database.' }),
      h(
        'label',
        { class: 'rc-check' },
        h('input', {
          type: 'checkbox',
          onchange: (e) => {
            state.ack = e.target.checked;
            runBtn.disabled = !state.ack;
          },
        }),
        h('span', { text: 'I understand and want to clear the history.' })
      ),
      h('div', { class: 'rc-modal-actions' }, h('button', { class: 'rc-btn secondary', text: 'Cancel', onclick: close }), runBtn)
    )
  );
  function close() {
    S.modalOpen = false;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }
  async function submit() {
    if (!state.ack) return;
    runBtn.disabled = true;
    try {
      await call('historyClear', { repoPath: S.repoPath, ack: true });
      S.history.items = [];
      S.history.total = 0;
      S.history.page = 1;
      S.history.loaded = true;
      close();
      toast('History cleared');
      S.hooks.refreshCatalog();
    } catch (e) {
      runBtn.disabled = false;
      toast(e.message, 'error');
    }
  }
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
}