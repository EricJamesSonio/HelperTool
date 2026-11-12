/**
 * pushChecks.js
 * Runs the Repo Console checks after a successful push and shows the result modal.
 * It wraps the push calls of a GitCommandHandler, so no other git code changes.
 */

import { openModal } from '../utils/uiModal.js';

let listening = false;
let activeModal = null;

function bridge() {
  return window.repoConsoleAPI || null;
}

function esc(text) {
  return String(text === null || text === undefined ? '' : text).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[m]));
}

function fmtMs(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms < 1000) return Math.round(ms) + ' ms';
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + ' s';
  return Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's';
}

function repoNameOf(repoPath) {
  return String(repoPath || '').split(/[\\/]/).filter(Boolean).pop() || 'repository';
}

function ensureStyles() {
  if (document.getElementById('pushChecksSheet')) return;
  const link = document.createElement('link');
  link.id = 'pushChecksSheet';
  link.rel = 'stylesheet';
  link.href = 'styles/push-checks.css';
  document.head.append(link);
}

function toast(message, kind) {
  const el = document.createElement('div');
  el.className = 'git-toast ' + (kind === 'error' ? 'git-toast-error' : 'git-toast-success');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function stepRow(step) {
  const ok = step.status === 'done';
  const bad = step.status === 'failed' || step.status === 'blocked';
  const cls = ok ? 'done' : bad ? 'failed' : 'other';
  let html =
    '<div class="pc-row">' +
    '<span class="pc-dot pc-dot-' + cls + '"></span>' +
    '<span class="pc-name">' + esc(step.title) + '</span>' +
    '<span class="pc-time">' + esc(fmtMs(step.durationMs)) + '</span>' +
    '</div>';
  if (step.tests) {
    const t = step.tests;
    html += '<div class="pc-sub">' + t.files + ' files, ' + t.tests + ' tests, ' + t.passed + ' passed, ' + t.failed + ' failed</div>';
  }
  if (bad) {
    if (step.failedFiles && step.failedFiles.length) {
      html += '<div class="pc-sub pc-sub-bad">Failed files: ' + step.failedFiles.map(esc).join(', ') + '</div>';
    }
    if (step.excerpt) {
      html += '<details class="pc-fail"><summary>Error output</summary><pre>' + esc(step.excerpt) + '</pre></details>';
    }
  }
  return html;
}

function resultHtml(s) {
  const failed = s.counts.failed;
  const banner = failed
    ? '<div class="pc-banner pc-bad">' + failed + ' of ' + s.counts.total + ' checks failed</div>'
    : s.counts.other
      ? '<div class="pc-banner pc-warn">' + s.counts.passed + ' passed, ' + s.counts.other + ' did not finish</div>'
      : '<div class="pc-banner pc-ok">All ' + s.counts.total + ' checks passed</div>';
  const meta = esc(repoNameOf(s.repoPath)) + (s.durationMs !== null && s.durationMs !== undefined ? ' - ' + esc(fmtMs(s.durationMs)) : '');
  let html = banner + '<div class="pc-meta">' + meta + '</div>';
  html += '<div class="pc-list">' + s.steps.map(stepRow).join('') + '</div>';
  if (s.skipped && s.skipped.length) {
    html +=
      '<div class="pc-skipped"><b>Skipped</b>' +
      s.skipped.map((x) => '<div>' + esc(x.project + ' / ' + x.title + ': ' + x.reason) + '</div>').join('') +
      '</div>';
  }
  return html;
}

function showResult(summary) {
  if (!summary || !Array.isArray(summary.steps)) return;
  ensureStyles();
  if (activeModal) {
    try {
      activeModal.close();
    } catch (_) {
      /* already closed */
    }
    activeModal = null;
  }

  const failedStep = summary.steps.some((x) => x.status === 'failed' && x.tests);
  const tab = failedStep ? 'tests' : summary.counts.failed ? 'errors' : 'summary';
  const title = 'Push checks - ' + esc(repoNameOf(summary.repoPath));

  activeModal = openModal({
    title,
    bodyHtml: resultHtml(summary),
    submitText: 'View in Repo Console',
    cancelText: 'Dismiss',
    onSubmit: () => {
      document.dispatchEvent(
        new CustomEvent('repoConsole:open-run', { detail: { repoPath: summary.repoPath, runId: summary.runId, tab } })
      );
      return true;
    },
    onClose: () => {
      activeModal = null;
    },
  });
  if (activeModal && activeModal.el) activeModal.el.style.zIndex = '10400';

  if (document.hidden && typeof Notification !== 'undefined') {
    try {
      const body = summary.counts.failed ? summary.counts.failed + ' of ' + summary.counts.total + ' checks failed' : 'All checks passed';
      new Notification('Push checks - ' + repoNameOf(summary.repoPath), { body });
    } catch (_) {
      /* notifications are optional */
    }
  }
}

function initListeners() {
  if (listening) return;
  const api = bridge();
  if (!api || typeof api.onPushChecks !== 'function') return;
  listening = true;
  api.onPushChecks((msg) => {
    if (!msg) return;
    if (msg.type === 'finished') showResult(msg.summary);
  });
}
export async function mountPushChecksToggle(container) {
  const host = container ? container.querySelector('.git-topbar-right') : null;
  const api = bridge();
  if (!host || !api || typeof api.checksSettings !== 'function') return;
  if (host.querySelector('#pushChecksToggleWrap')) return;
  ensureStyles();
  const wrap = document.createElement('label');
  wrap.id = 'pushChecksToggleWrap';
  wrap.className = 'pc-toggle';
  wrap.title = 'Run lint, type check, tests or build in the background after a successful push';
  wrap.innerHTML = '<input type="checkbox" id="pushChecksToggle" checked /><span>Checks on push</span>';
  host.prepend(wrap);
  const box = wrap.querySelector('input');
  try {
    const res = await api.checksSettings({});
    if (res && res.settings) box.checked = res.settings.enabled !== false;
  } catch (_) {
    box.checked = true;
  }
  box.addEventListener('change', async () => {
    const want = box.checked;
    try {
      const res = await api.checksSettings({ patch: { enabled: want } });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'Request failed');
      toast(want ? 'Checks after push: on' : 'Checks after push: off');
    } catch (err) {
      box.checked = !want;
      toast('Could not save: ' + (err && err.message ? err.message : err), 'error');
    }
  });
}

async function trigger(repoPath, files) {
  const api = bridge();
  if (!api || typeof api.pushChecks !== 'function') return;
  try {
    const res = await api.pushChecks({ repoPath, files });
    const r = res && res.result;
    if (!r) return;
    if (r.started) {
      toast('Running checks for ' + r.projects.join(', ') + ' in the background');
    } else if (r.queued) {
      toast('Another console job is running. Checks start when it finishes.');
    } else if (r.skipped === 'nothing') {
      toast(r.reasons && r.reasons.length ? 'Checks skipped: ' + r.reasons[0] : 'No code checks apply to the pushed files.');
    }
  } catch (err) {
    toast('Could not start checks: ' + (err && err.message ? err.message : err), 'error');
  }
}

async function guardedPush(fn, repoPath) {
  let files = null;
  const api = bridge();
  if (api && typeof api.pushPreview === 'function') {
    try {
      const pre = await api.pushPreview({ repoPath });
      if (pre && pre.ok !== false && Array.isArray(pre.files)) files = pre.files;
    } catch (_) {
      files = null;
    }
  }
  const res = await fn(repoPath);
  const ok = !!res && res.success !== false && !res.error;
  if (ok && files && files.length) trigger(repoPath, files);
  return res;
}

export function installPushChecks(handler) {
  initListeners();
  const base = handler && handler.ipc;
  if (!base || base.__pushChecks) return;
  const wrapped = Object.assign({}, base);
  if (typeof base.push === 'function') wrapped.push = (repoPath) => guardedPush(base.push, repoPath);
  if (typeof base.pushSetUpstream === 'function') wrapped.pushSetUpstream = (repoPath) => guardedPush(base.pushSetUpstream, repoPath);
  Object.defineProperty(wrapped, '__pushChecks', { value: true });
  handler.ipc = wrapped;
}