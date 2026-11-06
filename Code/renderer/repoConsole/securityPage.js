import { S, h, call, toast } from './state.js';
import { securityRunBar, reportSection } from './securityReport.js';

export async function loadSecurity() {
  if (S.security.loading) return;
  S.security.loading = true;
  if (S.page === 'security') S.hooks.renderPage();
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

function confRow(label, value) {
  return h('div', { class: 'rc-kv-row' }, h('span', { class: 'rc-where', text: label }), h('b', { text: value || 'unknown' }));
}

function profileCard(profile) {
  if (!profile) {
    return h('div', { class: 'rc-empty', text: 'No stack profile yet. Click "Detect stack" to scan this repository.' });
  }
  const folders = profile.projectFolders && profile.projectFolders.length ? profile.projectFolders.join(', ') : '.';
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
    h(
      'div',
      { class: 'rc-row', style: 'margin-top:10px' },
      h('span', {
        class: 'rc-where',
        text:
          'Confidence: frontend ' +
          Math.round(profile.confidence.frontend * 100) +
          '%, database ' +
          Math.round(profile.confidence.database * 100) +
          '%, auth ' +
          Math.round(profile.confidence.auth * 100) +
          '%',
      })
    ),
    h('div', { class: 'rc-where', text: 'Project folders scanned: ' + folders }),
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
        S.hooks.renderPage();
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
      text: 'Detects the stack of this repository (frontend, database, auth), then runs the code and live checks that fit it. The report shows a score, what to fix first, and what was not covered.',
    }),
    securityRunBar(),
    reportSection(),
    h(
      'div',
      { class: 'rc-row' },
      h('button', {
        class: 'rc-btn secondary',
        text: S.security.detecting ? 'Detecting...' : 'Detect stack',
        disabled: !!S.security.detecting,
        onclick: detectStack,
      })
    ),
    S.security.loading && !profile ? h('div', { class: 'rc-empty', text: 'Loading...' }) : profileCard(profile),
    settingsCard(),
  ];
}