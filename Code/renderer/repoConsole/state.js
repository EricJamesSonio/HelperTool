export const S = {
  repoPath: '',
  page: 'seeds',
  env: 'local',
  catalog: null,
  error: '',
  jobs: new Map(),
  openCards: new Set(),
  openFiles: new Set(),
  pending: new Set(),
  pillDismissed: new Set(),
  modalOpen: false,
  promptDraft: '',
  output: {
    open: false,
    live: true,
    repoPath: '',
    runId: null,
    tab: 'summary',
    detail: null,
    loading: false,
    logSearch: '',
    errorsOnly: false,
    focusPrompt: false,
  },
  history: {
    items: [],
    total: 0,
    page: 1,
    limit: 25,
    filters: { action: '', status: '', env: '', q: '' },
    loaded: false,
    loading: false,
  },
  hooks: {
    renderAll() {},
    renderPage() {},
    refreshCatalog() {},
    openPanel() {},
  },
};

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export async function call(name, payload) {
  const fn = window.repoConsoleAPI && window.repoConsoleAPI[name];
  if (!fn) throw new Error('The console bridge is not available. Restart the app.');
  const res = await fn(payload);
  if (!res || res.ok === false) throw new Error((res && res.error) || 'Request failed');
  return res;
}

export function liveEntry(repoPath) {
  return S.jobs.get(repoPath) || null;
}

export function isRunning(repoPath) {
  const entry = S.jobs.get(repoPath || S.repoPath);
  return !!(entry && entry.job && entry.job.status === 'running');
}

export function repoLabel(repoPath) {
  return String(repoPath || '').split(/[\\/]/).filter(Boolean).pop() || 'repo';
}

export function fmtMs(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms < 1000) return Math.round(ms) + ' ms';
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + ' s';
  return Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's';
}

export function fmtDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    return new Date(ts).toLocaleString();
  }
}

export function relativeTime(ts) {
  if (!ts) return '';
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60000) return Math.max(1, Math.round(diff / 1000)) + 's ago';
  if (diff < 3600000) return Math.round(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.round(diff / 3600000) + 'h ago';
  return Math.round(diff / 86400000) + 'd ago';
}

export function statusLabel(status, isTest) {
  const labels = {
    running: 'Running',
    done: isTest ? 'Passed' : 'Done',
    failed: 'Failed',
    stopped: 'Stopped',
    interrupted: 'Interrupted',
    pending: 'Waiting',
    skipped: 'Skipped',
  };
  return labels[status] || status || 'Unknown';
}

export function statusChip(status, isTest) {
  return h('span', { class: 'rc-chip ' + (status || ''), text: statusLabel(status, isTest) });
}

export function toast(message, kind) {
  const el = h('div', { class: 'rc-toast' + (kind === 'error' ? ' error' : ''), text: message });
  document.body.append(el);
  setTimeout(() => el.remove(), 5000);
}

export function copyText(text, okMessage) {
  navigator.clipboard.writeText(text).then(
    () => toast(okMessage || 'Copied'),
    () => toast('Could not copy', 'error')
  );
}