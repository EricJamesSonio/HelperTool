import { confirmDialog } from '../utils/confirmDialog.js';

const STYLE_ID = 'gitDeploySheet';
const MAX_TABS = 4;
const WATCH_MS = 600;
const RESEND_MS = 4000;
const SEARCH_MS = 120;

const SV = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
const ICONS = {
  back: SV + '<path d="M10 3L5 8l5 5"/></svg>',
  forward: SV + '<path d="M6 3l5 5-5 5"/></svg>',
  reload: SV + '<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2.5v3h-3"/></svg>',
  stop: SV + '<path d="M4 4l8 8M12 4l-8 8"/></svg>',
  pin: SV + '<path d="M8 1.8l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 10.4l-3.4 1.9.7-3.8L2.5 5.8l3.8-.5z"/></svg>',
  external: SV + '<path d="M9 2.5h4.5V7"/><path d="M13.5 2.5L7.5 8.5"/><path d="M11 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1H6.5"/></svg>',
  grid: SV + '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>',
  one: SV + '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/></svg>',
  gear: SV + '<circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/></svg>',
  plus: SV + '<path d="M8 3v10M3 8h10"/></svg>',
};

const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

const memory = new Map();
let cleaned = false;
let S = freshState();
let root = null;
let watchTimer = 0;
let resizeObs = null;
let layoutRaf = 0;
let forceNext = false;
let hiddenSent = false;
let lastSig = '';
let lastSentAt = 0;
let searchTimer = 0;

function freshState() {
  return {
    open: false,
    gen: 0,
    repoPath: '',
    key: '',
    loading: true,
    error: '',
    page: 'browse',
    roles: [],
    accounts: [],
    targets: [],
    providers: [],
    ui: { mode: 'grid' },
    tabs: [],
    active: '',
    suggest: null,
    suggestLoading: false,
    form: null,
    results: [],
  };
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (m) => HTML_ESC[m]);
}

function keyOf(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function hue(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch (_) {
    return String(url || '');
  }
}

function api() {
  const a = window.deployAPI;
  if (!a) throw new Error('The Deploy bridge is not available. Restart the app once.');
  return a;
}

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = 'styles/deploy-tool.css';
  document.head.append(link);
}

function toast(message, kind) {
  const el = document.createElement('div');
  el.className = 'git-toast ' + (kind === 'error' ? 'git-toast-error' : 'git-toast-success');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 4000 : 2500);
}

function providerById(id) {
  return S.providers.find((p) => p.id === id) || null;
}

function accountById(id) {
  return S.accounts.find((a) => a.id === id) || null;
}

function targetById(id) {
  return S.targets.find((t) => t.id === id) || null;
}

function roleLabel(t) {
  if (t.role === 'custom') return t.roleLabel || 'Custom';
  const r = S.roles.find((x) => x.id === t.role);
  return r ? r.label : t.role;
}

function badge(p) {
  const name = p ? p.name : '?';
  return '<span class="dp-badge" style="--h:' + hue(p ? p.id : '') + '">' + esc(name.charAt(0).toUpperCase()) + '</span>';
}

function groupTargets() {
  const groups = [];
  for (const r of S.roles) {
    const items = S.targets.filter((t) => t.role === r.id);
    if (items.length) groups.push({ label: r.label, items });
  }
  const custom = new Map();
  for (const t of S.targets.filter((x) => x.role === 'custom')) {
    const k = t.roleLabel || 'Custom';
    if (!custom.has(k)) custom.set(k, []);
    custom.get(k).push(t);
  }
  for (const [label, items] of custom) groups.push({ label, items });
  return groups;
}

function saveMemory() {
  if (!S.key) return;
  memory.set(S.key, { tabs: S.tabs.map((t) => Object.assign({}, t)), active: S.active });
}

function restoreMemory() {
  const mem = memory.get(S.key);
  if (!mem) return;
  const kept = [];
  for (const t of mem.tabs) {
    if (S.targets.some((x) => x.id === t.targetId)) kept.push(Object.assign({}, t));
    else api().closeTab({ tabId: t.id }).catch(() => {});
  }
  S.tabs = kept;
  S.active = kept.some((t) => t.id === mem.active) ? mem.active : (kept.length ? kept[0].id : '');
}

/* ---------- lifecycle ---------- */

export function isOpen() {
  return S.open;
}

export async function open(container, repoPath) {
  ensureStyles();
  const gen = S.gen + 1;
  S = freshState();
  S.gen = gen;
  S.open = true;
  S.repoPath = repoPath || '';
  S.key = keyOf(repoPath);

  container.innerHTML = '<div class="dp-root"></div>';
  root = container.querySelector('.dp-root');
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('keydown', onKeydown);
  startWatch();
  document.addEventListener('app:wake', onWake);
  renderAll();

  try {
    if (!S.repoPath) throw new Error('Open a repository first.');
    const a = api();
    if (!cleaned) {
      cleaned = true;
      await a.closeAll();
    }
    a.onViewState(onViewState);
    const data = await a.load({ repoPath: S.repoPath });
    if (!S.open || gen !== S.gen) return;
    if (!data || data.success === false) throw new Error((data && data.error) || 'Could not load the Deploy tool.');
    S.accounts = data.accounts || [];
    S.targets = data.targets || [];
    S.roles = data.roles || [];
    S.providers = data.providers || [];
    S.ui = data.ui || S.ui;
    restoreMemory();
    if (!S.targets.length) S.page = 'manage';
  } catch (err) {
    if (!S.open || gen !== S.gen) return;
    S.error = err.message;
  }
  S.loading = false;
  renderAll();
  if (S.page === 'manage' && !S.error) loadSuggestions();
}

export function close() {
  if (!S.open) return;
  saveMemory();
  stopWatch();
  document.removeEventListener('app:wake', onWake);
  S.open = false;
  S.gen += 1;
  try {
    if (window.deployAPI) window.deployAPI.hide().catch(() => {});
  } catch (_) {}
  root = null;
}

function startWatch() {
  stopWatch();
  watchTimer = setInterval(() => {
    if (!root) return;
    if (!root.isConnected) {
      close();
      return;
    }
    scheduleLayout(false);
  }, WATCH_MS);
  if (typeof ResizeObserver === 'function') {
    resizeObs = new ResizeObserver(() => scheduleLayout(false));
    resizeObs.observe(root);
  }
  window.addEventListener('resize', onWindowResize);
}

function stopWatch() {
  clearInterval(watchTimer);
  watchTimer = 0;
  if (resizeObs) {
    resizeObs.disconnect();
    resizeObs = null;
  }
  window.removeEventListener('resize', onWindowResize);
  cancelAnimationFrame(layoutRaf);
  layoutRaf = 0;
  hiddenSent = false;
  lastSig = '';
}

function onWindowResize() {
  scheduleLayout(false);
}

function onWake() {
  lastSig = '';
  scheduleLayout(true);
}

/* ---------- layout sync with the main process ---------- */

function scheduleLayout(force) {
  if (force) forceNext = true;
  if (layoutRaf) return;
  layoutRaf = requestAnimationFrame(pushLayout);
}

function pushLayout() {
  layoutRaf = 0;
  const force = forceNext;
  forceNext = false;
  if (!S.open || !root || !window.deployAPI) return;
  const a = window.deployAPI;
  const visible = S.page === 'browse' && !S.loading && !S.error && root.isConnected && root.getClientRects().length > 0;
  if (!visible) {
    if (!hiddenSent) {
      hiddenSent = true;
      lastSig = '';
      a.hide().catch(() => {});
    }
    return;
  }
  const rects = {};
  root.querySelectorAll('.dp-view').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 10 && r.height > 10) rects[el.dataset.view] = { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const sig = JSON.stringify(rects) + '|' + window.innerWidth;
  const now = Date.now();
  if (!force && !hiddenSent && sig === lastSig && now - lastSentAt < RESEND_MS) return;
  hiddenSent = false;
  lastSig = sig;
  lastSentAt = now;
  a.layout({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, rects }).catch(() => {});
}

function onViewState(d) {
  if (!S.open || !d) return;
  const t = S.tabs.find((x) => x.id === d.tabId);
  if (!t) return;
  t.url = d.url || t.url;
  t.pageTitle = d.title || '';
  t.loading = !!d.loading;
  t.canGoBack = !!d.canGoBack;
  t.canGoForward = !!d.canGoForward;
  patchTab(t);
}

function patchTab(t) {
  if (!root) return;
  const pane = root.querySelector('.dp-pane[data-tab="' + t.id + '"]');
  if (pane) {
    pane.classList.toggle('loading', t.loading);
    const addr = pane.querySelector('.dp-addr');
    if (addr && document.activeElement !== addr) addr.value = t.url;
    const back = pane.querySelector('[data-act="back"]');
    if (back) back.disabled = !t.canGoBack;
    const fwd = pane.querySelector('[data-act="forward"]');
    if (fwd) fwd.disabled = !t.canGoForward;
    const r = pane.querySelector('[data-act="reload"], [data-act="stop"]');
    if (r) {
      r.dataset.act = t.loading ? 'stop' : 'reload';
      r.title = t.loading ? 'Stop loading' : 'Reload';
      r.innerHTML = t.loading ? ICONS.stop : ICONS.reload;
    }
  }
  const tabEl = root.querySelector('.dp-tab[data-tab="' + t.id + '"]');
  if (tabEl) {
    tabEl.classList.toggle('loading', t.loading);
    if (t.pageTitle) tabEl.title = t.pageTitle;
  }
}

/* ---------- rendering ---------- */

function renderAll() {
  if (!root) return;
  if (S.loading) {
    root.innerHTML = '<div class="dp-empty"><div class="dp-empty-title">Loading...</div></div>';
  } else if (S.error) {
    root.innerHTML = '<div class="dp-empty"><div class="dp-empty-title dp-bad">' + esc(S.error) + '</div></div>';
  } else if (S.page === 'manage') {
    root.innerHTML = manageHtml();
    renderProviderList();
  } else {
    ensureActive();
    root.innerHTML = browseHtml();
  }
  scheduleLayout(false);
}

function ensureActive() {
  if (!S.tabs.some((t) => t.id === S.active)) S.active = S.tabs.length ? S.tabs[S.tabs.length - 1].id : '';
}

function chipHtml(t) {
  const p = providerById(t.providerId);
  const acc = accountById(t.accountId);
  const open = S.tabs.some((x) => x.targetId === t.id);
  return '<button type="button" class="dp-chip' + (open ? ' open' : '') + '" data-act="open-target" data-id="' + esc(t.id) + '" title="' + esc(t.url) + '">' +
    badge(p) + '<span class="dp-chip-name">' + esc(t.name) + '</span>' +
    (acc ? '<span class="dp-chip-acc">' + esc(acc.label) + '</span>' : '') +
  '</button>';
}

function targetsBarHtml() {
  if (!S.targets.length) return '<div class="dp-targets"><span class="dp-hint">No targets yet. Open Manage to add your first one.</span></div>';
  return '<div class="dp-targets">' + groupTargets().map((g) =>
    '<div class="dp-group"><span class="dp-group-label">' + esc(g.label) + '</span>' + g.items.map(chipHtml).join('') + '</div>'
  ).join('') + '</div>';
}

function tabsHtml() {
  if (!S.tabs.length) return '';
  const items = S.tabs.map((t) => {
    const tg = targetById(t.targetId);
    return '<div class="dp-tab' + (t.id === S.active ? ' active' : '') + (t.loading ? ' loading' : '') + '" data-tab="' + esc(t.id) + '" title="' + esc(t.pageTitle || t.url) + '">' +
      '<span class="dp-tab-dot"></span><span class="dp-tab-name">' + esc(tg ? tg.name : 'Tab') + '</span>' +
      '<button type="button" class="dp-x" data-act="close-tab" data-tab="' + esc(t.id) + '" title="Close tab">' + ICONS.stop + '</button>' +
    '</div>';
  }).join('');
  return '<div class="dp-tabs">' + items + '<span class="dp-count">' + S.tabs.length + ' of ' + MAX_TABS + '</span></div>';
}

function ibtn(act, tabId, icon, title, disabled) {
  return '<button type="button" class="dp-ibtn" data-act="' + act + '" data-tab="' + esc(tabId) + '" title="' + esc(title) + '"' + (disabled ? ' disabled' : '') + '>' + icon + '</button>';
}

function paneHtml(t) {
  return '<div class="dp-pane' + (t.id === S.active ? ' active' : '') + (t.loading ? ' loading' : '') + '" data-tab="' + esc(t.id) + '">' +
    '<div class="dp-bar">' +
      ibtn('back', t.id, ICONS.back, 'Back', !t.canGoBack) +
      ibtn('forward', t.id, ICONS.forward, 'Forward', !t.canGoForward) +
      (t.loading ? ibtn('stop', t.id, ICONS.stop, 'Stop loading', false) : ibtn('reload', t.id, ICONS.reload, 'Reload', false)) +
      '<input class="dp-addr" type="text" spellcheck="false" value="' + esc(t.url) + '" data-tab="' + esc(t.id) + '">' +
      ibtn('pin', t.id, ICONS.pin, 'Save this page as the link of this target', false) +
      ibtn('external', t.id, ICONS.external, 'Open in your browser', false) +
      ibtn('close-tab', t.id, ICONS.stop, 'Close', false) +
    '</div>' +
    '<div class="dp-view" data-view="' + esc(t.id) + '"></div>' +
  '</div>';
}

function browseHtml() {
  const mode = S.ui.mode === 'focus' ? 'focus' : 'grid';
  const modeBtn = S.tabs.length > 1
    ? '<button type="button" class="dp-btn" data-act="mode" title="Show all open tabs together or one at a time">' + (mode === 'grid' ? ICONS.grid + ' All' : ICONS.one + ' One') + '</button>'
    : '';
  const stage = S.tabs.length
    ? '<div class="dp-stage" data-count="' + S.tabs.length + '" data-mode="' + mode + '">' + S.tabs.map(paneHtml).join('') + '</div>'
    : '<div class="dp-empty"><div class="dp-empty-title">Pick a target above to open it here</div><div class="dp-empty-sub">Up to ' + MAX_TABS + ' dashboards can be open at once. Logins are saved per account.</div></div>';
  return '<div class="dp-top">' + targetsBarHtml() +
    '<div class="dp-top-actions">' + modeBtn + '<button type="button" class="dp-btn" data-act="manage">' + ICONS.gear + ' Manage</button></div></div>' +
    tabsHtml() + stage;
}

function suggestInner() {
  if (S.suggestLoading) return '<p class="dp-hint">Looking at your stack...</p>';
  if (!S.suggest) return '<p class="dp-hint">No suggestions yet.</p>';
  if (S.suggest.success === false) return '<p class="dp-hint dp-bad">' + esc(S.suggest.error || 'Could not read the stack.') + '</p>';
  const detected = (S.suggest.detected || []).length
    ? '<p class="dp-hint">Detected: ' + (S.suggest.detected).map(esc).join(', ') + '</p>'
    : '<p class="dp-hint">Nothing specific detected, showing common choices.</p>';
  const rows = (S.suggest.suggestions || []).map((s) => {
    const p = providerById(s.providerId);
    const role = S.roles.find((r) => r.id === s.role);
    const added = S.targets.some((t) => t.role === s.role && t.providerId === s.providerId);
    return '<div class="dp-row"><span class="dp-tag">' + esc(role ? role.label : s.role) + '</span>' + badge(p) +
      '<div class="dp-row-main"><div class="dp-row-name">' + esc(p ? p.name : s.providerId) + '</div><div class="dp-row-sub">' + esc(s.reason) + '</div></div>' +
      (added ? '<span class="dp-hint">Added</span>' : '<button type="button" class="dp-btn" data-act="use-suggestion" data-role="' + esc(s.role) + '" data-provider="' + esc(s.providerId) + '">Add</button>') +
    '</div>';
  }).join('');
  return detected + rows;
}

function targetsListHtml() {
  if (!S.targets.length) return '<p class="dp-hint">No targets for this repo yet.</p>';
  return groupTargets().map((g) =>
    '<div class="dp-list-group">' + esc(g.label) + '</div>' + g.items.map((t) => {
      const p = providerById(t.providerId);
      const acc = accountById(t.accountId);
      return '<div class="dp-row">' + badge(p) +
        '<div class="dp-row-main"><div class="dp-row-name">' + esc(t.name) + '</div>' +
        '<div class="dp-row-sub">' + esc(p ? p.name : '') + (acc ? ' - ' + esc(acc.label) : '') + ' - ' + esc(hostOf(t.url)) + '</div></div>' +
        '<button type="button" class="dp-btn" data-act="open-from-list" data-id="' + esc(t.id) + '">Open</button>' +
        '<button type="button" class="dp-btn" data-act="edit-target" data-id="' + esc(t.id) + '">Edit</button>' +
        '<button type="button" class="dp-btn dp-danger" data-act="delete-target" data-id="' + esc(t.id) + '">Delete</button>' +
      '</div>';
    }).join('')
  ).join('');
}

function formHtml() {
  const f = S.form;
  if (!f) {
    return '<h3 class="dp-h3">Add a target</h3><p class="dp-hint">A target is one page you open often, for example the Render dashboard of your backend.</p>' +
      '<button type="button" class="dp-btn dp-primary" data-act="new-target">' + ICONS.plus + ' New target</button>';
  }
  const roleOpts = S.roles.concat([{ id: 'custom', label: 'Custom...' }]).map((r) =>
    '<option value="' + esc(r.id) + '"' + (r.id === f.role ? ' selected' : '') + '>' + esc(r.label) + '</option>').join('');
  const accounts = S.accounts.filter((a) => a.providerId === f.providerId);
  const accOpts = '<option value="">No account (shared session)</option>' +
    accounts.map((a) => '<option value="' + esc(a.id) + '"' + (a.id === f.accountId ? ' selected' : '') + '>' + esc(a.label) + '</option>').join('') +
    '<option value="__new"' + (f.accountId === '__new' ? ' selected' : '') + '>+ New account...</option>';
  const p = providerById(f.providerId);
  return '<h3 class="dp-h3">' + (f.id ? 'Edit target' : 'New target') + '</h3>' +
    '<label class="dp-label">Role</label><select id="dpFRole" class="dp-input">' + roleOpts + '</select>' +
    (f.role === 'custom' ? '<input id="dpFRoleLabel" class="dp-input" placeholder="Label, for example Emails" maxlength="24" value="' + esc(f.roleLabel) + '">' : '') +
    '<label class="dp-label">Provider</label>' +
    '<div class="dp-selected">' + (p ? badge(p) + '<span>' + esc(p.name) + '</span>' : '<span class="dp-hint">None selected</span>') + '</div>' +
    '<input id="dpFQuery" class="dp-input" placeholder="Search providers (render, vercel, cloudinary...)" autocomplete="off" value="' + esc(f.query) + '">' +
    '<div id="dpProviderList" class="dp-plist"></div>' +
    '<label class="dp-label">Account</label><select id="dpFAccount" class="dp-input">' + accOpts + '</select>' +
    (f.accountId === '__new' ? '<input id="dpFNewAcc" class="dp-input" placeholder="Account name, for example the email you sign in with" value="' + esc(f.newAccount) + '">' : '') +
    '<label class="dp-label">Name</label><input id="dpFName" class="dp-input" maxlength="60" value="' + esc(f.name) + '">' +
    '<label class="dp-label">Link (deep link to the exact page)</label><input id="dpFUrl" class="dp-input" spellcheck="false" value="' + esc(f.url) + '">' +
    '<div class="dp-form-actions"><button type="button" class="dp-btn dp-primary" data-act="save-target">Save target</button>' +
    '<button type="button" class="dp-btn" data-act="cancel-form">Cancel</button></div>';
}

function accountsHtml() {
  const rows = S.accounts.map((a) => {
    const p = providerById(a.providerId);
    const n = S.targets.filter((t) => t.accountId === a.id).length;
    return '<div class="dp-row">' + badge(p) +
      '<div class="dp-row-main"><div class="dp-row-name">' + esc(a.label) + '</div><div class="dp-row-sub">' + esc(p ? p.name : '') + (n ? ' - used by ' + n + ' target' + (n === 1 ? '' : 's') + ' here' : '') + '</div></div>' +
      '<button type="button" class="dp-btn dp-danger" data-act="delete-account" data-id="' + esc(a.id) + '">Remove</button></div>';
  }).join('');
  const opts = S.providers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) =>
    '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
  return '<h3 class="dp-h3">Accounts</h3>' +
    '<p class="dp-hint">Shared by every repo. Each account keeps its own saved login in the Deploy browser, so you sign in once.</p>' +
    (rows || '<p class="dp-hint">No accounts yet.</p>') +
    '<div class="dp-addacc"><select id="dpAProvider" class="dp-input">' + opts + '</select>' +
    '<input id="dpALabel" class="dp-input" placeholder="Account name or email" maxlength="60">' +
    '<button type="button" class="dp-btn dp-primary" data-act="add-account">Add account</button></div>';
}

function manageHtml() {
  return '<div class="dp-manage">' +
    '<div class="dp-mhead"><div><div class="dp-mtitle">Deploy targets</div><div class="dp-hint">Targets are saved for this repo. Accounts are shared by all repos.</div></div>' +
    '<button type="button" class="dp-btn" data-act="back-browse">' + ICONS.back + ' Back to browser</button></div>' +
    '<div class="dp-mgrid">' +
      '<section class="dp-card"><h3 class="dp-h3">Suggested for this repo</h3><div id="dpSuggest">' + suggestInner() + '</div>' +
      '<h3 class="dp-h3 dp-mt">Targets</h3>' + targetsListHtml() + '</section>' +
      '<section class="dp-card" id="dpFormCard">' + formHtml() + '</section>' +
      '<section class="dp-card" id="dpAccountsCard">' + accountsHtml() + '</section>' +
    '</div></div>';
}

function renderFormCard() {
  if (!root) return;
  const el = root.querySelector('#dpFormCard');
  if (el) el.innerHTML = formHtml();
  renderProviderList();
}

function renderProviderList() {
  if (!root || !S.form) return;
  const el = root.querySelector('#dpProviderList');
  if (!el) return;
  el.innerHTML = S.results.length
    ? S.results.map((p) =>
      '<button type="button" class="dp-pitem' + (p.id === S.form.providerId ? ' sel' : '') + '" data-act="pick-provider" data-id="' + esc(p.id) + '">' +
        badge(p) + '<span class="dp-pname">' + esc(p.name) + '</span><span class="dp-proles">' + esc(p.roles.join(' / ')) + '</span></button>').join('')
    : '<div class="dp-hint">No providers match. Choose any provider and paste your own link below.</div>';
}

/* ---------- data actions ---------- */

async function loadSuggestions() {
  if (S.suggestLoading) return;
  const gen = S.gen;
  S.suggestLoading = true;
  S.suggest = null;
  try {
    const res = await api().suggest({ repoPath: S.repoPath });
    if (!S.open || gen !== S.gen) return;
    S.suggest = res;
  } catch (err) {
    if (!S.open || gen !== S.gen) return;
    S.suggest = { success: false, error: err.message };
  }
  S.suggestLoading = false;
  const el = root && root.querySelector('#dpSuggest');
  if (el) el.innerHTML = suggestInner();
}

async function refreshProviders() {
  if (!S.form || !S.open) return;
  const gen = S.gen;
  try {
    const res = await api().search({ query: S.form.query, role: S.form.role });
    if (!S.open || gen !== S.gen || !S.form) return;
    S.results = res && res.providers ? res.providers : [];
    renderProviderList();
  } catch (_) {}
}

function readForm() {
  if (!S.form || !root) return S.form;
  const f = Object.assign({}, S.form);
  const read = (id, key) => {
    const el = root.querySelector('#' + id);
    if (el) f[key] = el.value;
  };
  read('dpFRole', 'role');
  read('dpFRoleLabel', 'roleLabel');
  read('dpFAccount', 'accountId');
  read('dpFNewAcc', 'newAccount');
  read('dpFName', 'name');
  read('dpFUrl', 'url');
  read('dpFQuery', 'query');
  return f;
}

function startForm(seed) {
  S.page = 'manage';
  S.form = Object.assign({
    id: '', role: 'frontend', roleLabel: '', providerId: '', accountId: '', newAccount: '', name: '', url: '', query: '', nameTouched: false, urlTouched: false,
  }, seed || {});
  const p = providerById(S.form.providerId);
  if (p) {
    if (!S.form.name) S.form.name = p.name;
    if (!S.form.url) S.form.url = p.url;
    const accs = S.accounts.filter((a) => a.providerId === p.id);
    if (!S.form.accountId && accs.length && !S.form.id) S.form.accountId = accs[0].id;
  }
  S.results = [];
  if (root && root.querySelector('#dpFormCard')) renderFormCard();
  else renderAll();
  refreshProviders();
}

function pickProvider(id) {
  const p = providerById(id);
  if (!p || !S.form) return;
  const f = readForm();
  const prev = providerById(f.providerId);
  f.providerId = id;
  if (!f.urlTouched || !f.url || (prev && f.url === prev.url)) {
    f.url = p.url;
    f.urlTouched = false;
  }
  if (!f.nameTouched || !f.name || (prev && f.name === prev.name)) {
    f.name = p.name;
    f.nameTouched = false;
  }
  const accs = S.accounts.filter((a) => a.providerId === id);
  f.accountId = accs.length ? accs[0].id : '';
  S.form = f;
  renderFormCard();
  refreshProviders();
}

async function saveForm() {
  const f = readForm();
  if (!f) return;
  if (!f.providerId) {
    toast('Pick a provider first', 'error');
    return;
  }
  if (f.role === 'custom' && !String(f.roleLabel || '').trim()) {
    toast('Give the custom role a label', 'error');
    return;
  }
  try {
    let accountId = f.accountId === '__new' ? '' : f.accountId;
    if (f.accountId === '__new') {
      const label = String(f.newAccount || '').trim();
      if (!label) {
        toast('Type a name for the new account', 'error');
        return;
      }
      const acc = await api().saveAccount({ providerId: f.providerId, label });
      if (!acc || !acc.success) throw new Error((acc && acc.error) || 'Could not save the account');
      S.accounts = acc.accounts;
      accountId = acc.account.id;
    }
    const res = await api().saveTarget({
      repoPath: S.repoPath,
      target: { id: f.id, role: f.role, roleLabel: f.roleLabel, providerId: f.providerId, accountId, name: f.name, url: f.url },
    });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not save the target');
    S.targets = res.targets;
    S.accounts = res.accounts;
    S.form = null;
    renderAll();
    toast('Target saved');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function afterManageChange() {
  if (S.form) S.form = readForm();
  renderAll();
  if (S.form) refreshProviders();
}

async function deleteTarget(id) {
  const t = targetById(id);
  if (!t) return;
  const ok = await confirmDialog('Remove the target <b>' + esc(t.name) + '</b>? Your saved logins are kept.');
  if (!ok) return;
  try {
    const res = await api().deleteTarget({ repoPath: S.repoPath, id });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not remove the target');
    S.targets = res.targets;
    for (const tab of S.tabs.filter((x) => x.targetId === id)) await closeTab(tab.id, true);
    saveMemory();
    afterManageChange();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function addAccount() {
  if (!root) return;
  const providerId = (root.querySelector('#dpAProvider') || {}).value;
  const label = ((root.querySelector('#dpALabel') || {}).value || '').trim();
  if (!providerId || !label) {
    toast('Pick a provider and type a name for the account', 'error');
    return;
  }
  try {
    const res = await api().saveAccount({ providerId, label });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not save the account');
    S.accounts = res.accounts;
    afterManageChange();
    toast('Account added');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteAccount(id) {
  const a = accountById(id);
  if (!a) return;
  const ok = await confirmDialog('Remove the account <b>' + esc(a.label) + '</b>? Its saved login in the Deploy browser is cleared, and targets using it fall back to the shared session.');
  if (!ok) return;
  try {
    const res = await api().deleteAccount({ id, repoPath: S.repoPath });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not remove the account');
    S.accounts = res.accounts;
    S.targets = res.targets;
    S.tabs = S.tabs.filter((t) => t.accountId !== id);
    ensureActive();
    saveMemory();
    afterManageChange();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------- tabs ---------- */

function activate(id) {
  const t = S.tabs.find((x) => x.id === id);
  if (!t) return;
  S.active = id;
  t.used = Date.now();
  saveMemory();
  if (S.ui.mode === 'focus') {
    renderAll();
    return;
  }
  setActiveClasses();
}

function setActiveClasses() {
  if (!root) return;
  root.querySelectorAll('.dp-tab').forEach((el) => el.classList.toggle('active', el.dataset.tab === S.active));
  root.querySelectorAll('.dp-pane').forEach((el) => el.classList.toggle('active', el.dataset.tab === S.active));
}

async function openTarget(targetId) {
  const target = targetById(targetId);
  if (!target) return;
  S.page = 'browse';
  const existing = S.tabs.find((t) => t.targetId === targetId);
  if (existing) {
    S.active = existing.id;
    existing.used = Date.now();
    saveMemory();
    renderAll();
    return;
  }
  try {
    if (S.tabs.length >= MAX_TABS) {
      const victim = S.tabs.slice().sort((a, b) => (a.used || 0) - (b.used || 0))[0];
      const vt = targetById(victim.targetId);
      await closeTab(victim.id, true);
      toast('Closed ' + (vt ? vt.name : 'the oldest tab') + ' to make room (at most ' + MAX_TABS + ' tabs)');
    }
    const id = 'dt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const res = await api().openTab({ tabId: id, url: target.url, accountId: target.accountId });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not open that target');
    S.tabs.push({ id, targetId, accountId: target.accountId, url: target.url, pageTitle: '', loading: true, canGoBack: false, canGoForward: false, used: Date.now() });
    S.active = id;
    saveMemory();
    renderAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function closeTab(id, quiet) {
  try {
    await api().closeTab({ tabId: id });
  } catch (_) {}
  S.tabs = S.tabs.filter((t) => t.id !== id);
  ensureActive();
  saveMemory();
  if (!quiet) renderAll();
}

function nav(tabId, action, url) {
  try {
    api().nav({ tabId, action, url }).catch(() => {});
  } catch (_) {}
}

async function pinTarget(tabId) {
  const tab = S.tabs.find((t) => t.id === tabId);
  const target = tab ? targetById(tab.targetId) : null;
  if (!tab || !target) return;
  if (!tab.url || tab.url === target.url) {
    toast('This page is already the saved link');
    return;
  }
  try {
    const res = await api().saveTarget({ repoPath: S.repoPath, target: Object.assign({}, target, { url: tab.url }) });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not save the link');
    S.targets = res.targets;
    toast('Saved this page as the link of ' + target.name);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function toggleMode() {
  S.ui.mode = S.ui.mode === 'focus' ? 'grid' : 'focus';
  try {
    api().setUi({ mode: S.ui.mode }).catch(() => {});
  } catch (_) {}
  renderAll();
}

function goManage() {
  S.page = 'manage';
  renderAll();
  if (!S.suggest && !S.suggestLoading) loadSuggestions();
}

/* ---------- events ---------- */

function handleAct(act, btn) {
  const id = btn.dataset.id;
  const tabId = btn.dataset.tab;
  if (act === 'open-target' || act === 'open-from-list') openTarget(id);
  else if (act === 'manage') goManage();
  else if (act === 'back-browse') {
    S.page = 'browse';
    renderAll();
  } else if (act === 'mode') toggleMode();
  else if (act === 'close-tab') closeTab(tabId);
  else if (act === 'back' || act === 'forward' || act === 'reload' || act === 'stop') nav(tabId, act);
  else if (act === 'pin') pinTarget(tabId);
  else if (act === 'external') api().openExternal({ tabId }).catch(() => {});
  else if (act === 'new-target') startForm({});
  else if (act === 'edit-target') {
    const t = targetById(id);
    if (t) startForm({ id: t.id, role: t.role, roleLabel: t.roleLabel, providerId: t.providerId, accountId: t.accountId, name: t.name, url: t.url, nameTouched: true, urlTouched: true });
  } else if (act === 'delete-target') deleteTarget(id);
  else if (act === 'use-suggestion') startForm({ role: btn.dataset.role, providerId: btn.dataset.provider });
  else if (act === 'pick-provider') pickProvider(id);
  else if (act === 'save-target') saveForm();
  else if (act === 'cancel-form') {
    S.form = null;
    renderFormCard();
  } else if (act === 'add-account') addAccount();
  else if (act === 'delete-account') deleteAccount(id);
}

function onClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  const btn = t.closest('[data-act]');
  if (btn) {
    if (!btn.disabled) handleAct(btn.dataset.act, btn);
    return;
  }
  const tabEl = t.closest('.dp-tab');
  if (tabEl) {
    activate(tabEl.dataset.tab);
    return;
  }
  const pane = t.closest('.dp-pane');
  if (pane && pane.dataset.tab !== S.active) activate(pane.dataset.tab);
}

function onChange(e) {
  const id = e.target && e.target.id;
  if (id === 'dpFRole' || id === 'dpFAccount') {
    S.form = readForm();
    renderFormCard();
    if (id === 'dpFRole') refreshProviders();
  }
}

function onInput(e) {
  const id = e.target && e.target.id;
  if (!S.form) return;
  if (id === 'dpFQuery') {
    S.form.query = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshProviders, SEARCH_MS);
  } else if (id === 'dpFName') {
    S.form.nameTouched = true;
  } else if (id === 'dpFUrl') {
    S.form.urlTouched = true;
  }
}

function onKeydown(e) {
  if (!e.target || !e.target.classList) return;
  const isField = e.target.tagName === 'INPUT';
  if (isField) e.stopPropagation();
  if (e.key === 'Enter' && e.target.classList.contains('dp-addr')) {
    e.preventDefault();
    nav(e.target.dataset.tab, 'goto', e.target.value);
    e.target.blur();
  }
}