import { S, h, call, toast } from './state.js';
import { runSecurity, runningView, reportView, lastRunCard } from './securityReport.js';

/* ---------- loading ---------- */

export async function loadSecurity() {
  if (S.security.loading) return;
  S.security.loading = true;
  const repoPath = S.repoPath;
  try {
    const res = await call('securityGetSettings', { repoPath });
    if (repoPath === S.repoPath) {
      S.security.settings = res.settings;
      S.security.profile = res.profile;
      if (!S.security.running) {
        S.security.report = res.lastReport || null;
        S.security.history = res.history || [];
      }
    }
  } catch (e) {
    toast(e.message, 'error');
  }
  S.security.loaded = repoPath === S.repoPath;
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

async function detectTarget(fromRender) {
  const info = S.security.target;
  if (info.loading) return;
  info.loading = true;
  info.error = '';
  const repoPath = S.repoPath;
  if (!fromRender) S.hooks.renderPage();
  try {
    const res = await call('securityDetectTarget', { repoPath });
    if (repoPath === S.repoPath) info.data = res.target;
  } catch (e) {
    if (repoPath === S.repoPath) info.error = e.message;
  }
  if (repoPath === S.repoPath) {
    info.loaded = true;
    info.loading = false;
    if (S.page === 'security') S.hooks.renderPage();
  }
}

/* ---------- target helpers ---------- */

function sameUrl(a, b) {
  const clean = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\/+$/, '')
      .replace('127.0.0.1', 'localhost');
  return clean(a) === clean(b);
}

function effectiveTarget() {
  const sec = S.security;
  const saved = sec.settings && sec.settings.targetUrl ? sec.settings.targetUrl : '';
  if (saved) return { url: saved, auto: false };
  const best = sec.target.data && sec.target.data.best;
  return best ? { url: best.url, auto: true } : null;
}

async function saveTarget(url, confirmHost) {
  const sec = S.security;
  const safe = sec.draft.safe !== null ? sec.draft.safe : !(sec.settings && sec.settings.safeMode === false);
  sec.saving = true;
  S.hooks.renderPage();
  try {
    const res = await call('securitySetSettings', {
      repoPath: S.repoPath,
      targetUrl: url,
      safeMode: safe,
      confirmHost: !!confirmHost,
    });
    if (res.needsConfirm) {
      sec.confirm = { url, reason: res.reason || 'This is not a local address.' };
    } else {
      sec.confirm = null;
      sec.settings = res.settings;
      sec.draft = { url: null, safe: null };
      toast(url ? 'Target saved' : 'Auto-detect is on');
    }
  } catch (e) {
    toast(e.message, 'error');
  }
  sec.saving = false;
  S.hooks.renderPage();
}

/* ---------- setup screen ---------- */

function chip(label, value) {
  return h('span', { class: 'rc-sec-chip' }, h('i', { text: label }), h('b', { text: value || 'unknown' }));
}

function stackGroup(title, rows) {
  return h('div', { class: 'rc-sec-group' }, h('h4', { text: title }), h('div', { class: 'rc-sec-chips' }, rows.map(([label, value]) => chip(label, value))));
}

function stackCard() {
  const sec = S.security;
  const profile = sec.profile;
  const detecting = !!sec.detecting;
  const head = h(
    'div',
    { class: 'rc-card-head' },
    h('h3', { text: 'Detected stack' }),
    h('button', {
      class: 'rc-btn secondary small',
      text: detecting ? 'Detecting...' : profile ? 'Detect again' : 'Detect stack',
      disabled: detecting,
      onclick: detectStack,
    })
  );
  if (!profile) {
    return h(
      'div',
      { class: 'rc-card rc-sec-profile' },
      head,
      h('div', { class: 'rc-empty', text: sec.loading ? 'Loading...' : 'No stack profile yet. Click "Detect stack" to scan this repository.' })
    );
  }
  const folders = profile.projectFolders && profile.projectFolders.length ? profile.projectFolders.join(', ') : '.';
  const pct = (value) => Math.round(value * 100) + '%';
  return h(
    'div',
    { class: 'rc-card rc-sec-profile' },
    head,
    h(
      'div',
      { class: 'rc-sec-grid' },
      stackGroup('Frontend', [
        ['Framework', profile.frontend.framework],
        ['Language', profile.frontend.language],
        ['Rendering', profile.frontend.rendering],
        ['Bundler', profile.frontend.bundler],
      ]),
      stackGroup('Backend', [['Framework', profile.backend.framework]]),
      stackGroup('Database', [
        ['Dialect', profile.database.dialect],
        ['Access layer', profile.database.layer],
      ]),
      stackGroup('Auth', [
        ['Mechanism', profile.auth.mechanism],
        ['Library', profile.auth.library],
        ['Hashing', profile.auth.hashing],
      ])
    ),
    h('div', { class: 'rc-where', text: 'Confidence: frontend ' + pct(profile.confidence.frontend) + ', database ' + pct(profile.confidence.database) + ', auth ' + pct(profile.confidence.auth) }),
    h('div', { class: 'rc-where', text: 'Project folders scanned: ' + folders }),
    profile.surface && profile.surface.endpoints.length
      ? h('div', { class: 'rc-where', text: profile.surface.endpoints.length + ' API route file(s) found' })
      : h('div', { class: 'rc-where', text: 'No API route files were found automatically.' })
  );
}

function targetStatus(shown, candidates) {
  if (!shown) return null;
  const match = candidates.find((c) => sameUrl(c.url, shown));
  if (!match) return h('span', { class: 'rc-sec-dot unknown', text: 'Not checked yet. Start your app before running.' });
  if (!match.local) return h('span', { class: 'rc-sec-dot unknown', text: 'Not a local address, so it was not probed.' });
  if (match.reachable) return h('span', { class: 'rc-sec-dot up', text: 'Answering now' });
  return h('span', { class: 'rc-sec-dot down', text: 'Not answering. Start your app before running.' });
}

function suggestionChip(candidate) {
  const sec = S.security;
  const dotClass = !candidate.local ? 'unknown' : candidate.reachable ? 'up' : 'down';
  return h(
    'button',
    {
      class: 'rc-sec-suggest',
      title: candidate.sources.join('\n'),
      onclick: () => {
        sec.draft.url = candidate.url;
        sec.confirm = null;
        S.hooks.renderPage();
      },
    },
    h('span', { class: 'rc-sec-dot-only ' + dotClass }),
    h('b', { text: candidate.url }),
    h('span', { class: 'rc-where', text: candidate.kind + (candidate.local ? '' : ' / not local') + ' / ' + (candidate.sources[0] || '') })
  );
}

function targetCard() {
  const sec = S.security;
  const settings = sec.settings || { targetUrl: '', safeMode: true, confirmedHosts: [] };
  const info = sec.target;
  const data = info.data;
  const candidates = data ? data.candidates : [];
  const auto = data && data.best ? data.best : null;
  const saved = settings.targetUrl || '';
  const shown = sec.draft.url !== null ? sec.draft.url : saved || (auto ? auto.url : '');
  const safe = sec.draft.safe !== null ? sec.draft.safe : settings.safeMode !== false;

  let badge;
  if (saved) badge = h('span', { class: 'rc-sec-pill saved', text: 'Saved by you' });
  else if (info.loading) badge = h('span', { class: 'rc-sec-pill', text: 'Detecting...' });
  else if (auto) badge = h('span', { class: 'rc-sec-pill auto', text: 'Auto-detected' });
  else badge = h('span', { class: 'rc-sec-pill', text: 'Not found' });

  let sourceLine = null;
  if (!saved && auto && sec.draft.url === null) {
    sourceLine = h('div', { class: 'rc-where', text: 'Found in ' + auto.sources.slice(0, 2).join(' and ') });
  } else if (!saved && !info.loading && !auto && sec.draft.url === null) {
    sourceLine = h('div', { class: 'rc-where', text: 'No app URL was found in env files, package scripts or config. Type it below, for example http://localhost:3000.' });
  }

  const urlInput = h('input', {
    type: 'text',
    placeholder: 'http://localhost:3000',
    value: shown,
    oninput: (e) => {
      sec.draft.url = e.target.value;
    },
  });

  const others = candidates.filter((c) => !sameUrl(c.url, shown)).slice(0, 5);
  const unsure = !saved && data && !data.confident && candidates.length > 1;

  const safeCheck = h(
    'label',
    { class: 'rc-check' },
    h('input', {
      type: 'checkbox',
      checked: safe,
      onchange: (e) => {
        sec.draft.safe = e.target.checked;
      },
    }),
    h('span', { text: 'Safe mode (only allow write and race tests on a dev/test target)' })
  );

  const confirmBox = sec.confirm
    ? h(
        'div',
        null,
        h('div', { class: 'rc-warn red', text: sec.confirm.reason }),
        h(
          'div',
          { class: 'rc-row', style: 'margin-top:6px' },
          h('button', { class: 'rc-btn danger small', text: 'I own this target, proceed', onclick: () => saveTarget(sec.confirm.url, true) })
        )
      )
    : null;

  return h(
    'div',
    { class: 'rc-card rc-sec-target' },
    h('div', { class: 'rc-card-head' }, h('h3', { text: 'Target URL' }), badge),
    h('p', { class: 'rc-where', text: 'Live checks only send read-only GET requests. Non-local targets need your confirmation first.' }),
    h('div', { class: 'rc-field' }, urlInput),
    sourceLine,
    targetStatus(shown, candidates),
    unsure ? h('div', { class: 'rc-warn', text: 'More than one URL could be your app. Pick the one it runs on, then press Save target.' }) : null,
    others.length ? h('div', { class: 'rc-sec-suggests' }, h('h4', { text: 'Other URLs found' }), others.map(suggestionChip)) : null,
    info.error ? h('div', { class: 'rc-warn red', text: 'URL detection failed: ' + info.error }) : null,
    safeCheck,
    h(
      'div',
      { class: 'rc-row', style: 'margin-top:10px' },
      h('button', {
        class: 'rc-btn small',
        text: sec.saving ? 'Saving...' : 'Save target',
        disabled: !!sec.saving,
        onclick: () => saveTarget(String(sec.draft.url !== null ? sec.draft.url : shown).trim(), false),
      }),
      saved
        ? h('button', {
            class: 'rc-btn secondary small',
            text: 'Use auto-detect',
            disabled: !!sec.saving,
            onclick: () => saveTarget('', false),
          })
        : null,
      h('button', {
        class: 'rc-btn secondary small',
        text: info.loading ? 'Detecting...' : 'Detect again',
        disabled: !!info.loading,
        onclick: () => detectTarget(false),
      })
    ),
    confirmBox
  );
}

function runCard() {
  const sec = S.security;
  const target = effectiveTarget();
  let hint;
  if (target) {
    hint = 'Runs code checks plus live read-only checks against ' + target.url + (target.auto ? ' (auto-detected)' : '') + '. Start your app first.';
  } else {
    hint = 'Runs code checks only. Add a target URL below to include the live checks.';
  }
  return h(
    'div',
    { class: 'rc-card rc-sec-hero' },
    h(
      'div',
      { class: 'rc-sec-hero-text' },
      h('h3', { text: 'Security test' }),
      h('div', { class: 'rc-where', text: hint }),
      h('div', { class: 'rc-where', text: 'The result is saved to .security/resultN.md in this repository.' })
    ),
    h('button', { class: 'rc-btn', text: sec.report ? 'Run again' : 'Run security test', onclick: runSecurity }),
    sec.runError ? h('div', { class: 'rc-warn red', text: sec.runError }) : null
  );
}

function setupView() {
  const sec = S.security;
  return [
    h('p', {
      class: 'rc-lead',
      text: 'Detects the stack of this repository (frontend, database, auth), then runs the code and live checks that fit it. The report shows a score, what to fix first, and what was not covered.',
    }),
    runCard(),
    sec.report ? lastRunCard() : null,
    h('div', { class: 'rc-sec-setup' }, stackCard(), targetCard()),
  ];
}

/* ---------- router ---------- */

export function securityPage() {
  const sec = S.security;
  if (!sec.loaded && !sec.loading) loadSecurity();
  if (!sec.target.loaded && !sec.target.loading) detectTarget(true);
  if (sec.running) return runningView();
  if (sec.screen === 'report' && sec.report) return reportView();
  return setupView();
}