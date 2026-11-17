import { confirmDialog } from '../utils/confirmDialog.js';

const STYLE_ID = 'gitDeploySheet';
const MAX_TABS = 4;
const WATCH_MS = 600;
const RESEND_MS = 4000;
const SEARCH_MS = 180;

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
  plus: SV + '<path d="M8 3v10M3 8h10"/></svg>',
  check: SV + '<path d="M3 8.5l3.2 3L13 4.5"/></svg>',
  user: SV + '<circle cx="8" cy="5.5" r="2.8"/><path d="M2.5 14c0.6-2.8 2.7-4.3 5.5-4.3s4.9 1.5 5.5 4.3"/></svg>',
};
const SVL = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';
const CAT_ICONS = {
  database: SVL + '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  frontend: SVL + '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><circle cx="6.5" cy="6.5" r="0.6"/><circle cx="9" cy="6.5" r="0.6"/><path d="M8 14l-2 2 2 2"/><path d="M16 14l2 2-2 2"/></svg>',
  backend: SVL + '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><circle cx="7" cy="6.5" r="0.7"/><circle cx="7" cy="17.5" r="0.7"/><path d="M11 6.5h6M11 17.5h6"/></svg>',
  images: SVL + '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg>',
  custom: SVL + '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
};

const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

const memory = new Map();
const ghStatus = new Map();
let gitAccts = [];
let ghTimer = 0;
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
let searchSeq = 0;

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
    others: [],
    providers: [],
    ui: { mode: 'grid', open: null },
    tabs: [],
    active: '',
    suggest: null,
    suggestLoading: false,
    form: null,
    results: null,
    ghDraft: '',
    hub: { role: 'all', query: '', addingRole: false, view: 'home' },
    customRoles: [],
  };
}

function catIcon(key) {
  return CAT_ICONS[key] || CAT_ICONS.custom;
}

function isSolo() {
  return (S.hub.view === 'home' || S.hub.view === 'github') && !S.form;
}

function syncSolo() {
  const el = root ? root.querySelector('.dp-mbody') : null;
  if (el) el.classList.toggle('dp-solo', isSolo());
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (m) => HTML_ESC[m]);
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

function rootDomain(host) {
  const parts = String(host || '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  const take = tld.length === 2 && sld.length <= 3 ? 3 : 2;
  return parts.slice(-take).join('.');
}

function faviconUrl(p) {
  if (!p || p.id === 'custom') return '';
  const domain = rootDomain(hostOf(p.url));
  if (!domain) return '';
  return 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(domain);
}

function api() {
  const a = window.deployAPI;
  if (!a) throw new Error('The Deploy bridge is not available. Restart the app once.');
  return a;
}

function ghApi() {
  return window.deployGithubAPI || null;
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

function roleName(id) {
  const r = S.roles.find((x) => x.id === id);
  return r ? r.label : id;
}

function badge(p, big) {
  const name = p ? p.name : '?';
  const icon = p ? faviconUrl(p) : '';
  return '<span class="dp-badge' + (big ? ' dp-badge-lg' : '') + '" style="--h:' + hue(p ? p.id : '') + '">' +
    esc(name.charAt(0).toUpperCase()) +
    (icon ? '<img class="dp-ico" alt="" loading="lazy" referrerpolicy="no-referrer" src="' + esc(icon) + '">' : '') +
  '</span>';
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

function roleKeyOfTarget(t) {
  return t.role === 'custom' ? 'custom:' + (t.roleLabel || 'Custom') : t.role;
}

function roleButtons() {
  const list = S.roles.map((r) => ({ key: r.id, label: r.label }));
  const seen = [];
  for (const t of S.targets) {
    if (t.role === 'custom') {
      const label = t.roleLabel || 'Custom';
      if (seen.indexOf(label) === -1) seen.push(label);
    }
  }
  for (const label of S.customRoles) {
    if (seen.indexOf(label) === -1) seen.push(label);
  }
  for (const label of seen) list.push({ key: 'custom:' + label, label });
  return list;
}

function roleParam() {
  return S.roles.some((r) => r.id === S.hub.role) ? S.hub.role : '';
}

function targetsFor(providerId) {
  const key = S.hub.role;
  return S.targets.filter((t) => t.providerId === providerId && (key === 'all' || roleKeyOfTarget(t) === key));
}

function othersForProvider(providerId) {
  const key = S.hub.role;
  return S.others.filter((t) => t.providerId === providerId && (key === 'all' || roleKeyOfTarget(t) === key));
}

function othersProviders(roleKey) {
  const out = [];
  for (const t of S.others) {
    if (roleKeyOfTarget(t) !== roleKey) continue;
    const p = providerById(t.providerId);
    if (p && !out.some((x) => x.id === p.id)) out.push(p);
  }
  return out;
}

function suggestionFor(providerId) {
  if (!S.suggest || !S.suggest.suggestions) return null;
  const key = S.hub.role;
  const list = S.suggest.suggestions.filter((s) => s.providerId === providerId && (key === 'all' || s.role === key));
  return list.length ? list[0] : null;
}

function seedRole(p) {
  const key = S.hub.role;
  if (key.indexOf('custom:') === 0) return { role: 'custom', roleLabel: key.slice(7) };
  if (key !== 'all') return { role: key, roleLabel: '' };
  const sug = S.suggest && S.suggest.suggestions ? S.suggest.suggestions.find((s) => s.providerId === p.id) : null;
  if (sug) return { role: sug.role, roleLabel: '' };
  if (p.roles.length) return { role: p.roles[0], roleLabel: '' };
  return { role: 'custom', roleLabel: 'Other' };
}

function saveMemory() {
  if (!S.key) return;
  memory.set(S.key, { tabs: S.tabs.map((t) => Object.assign({}, t)), active: S.active });
}

function restoreMemory() {
  const mem = memory.get(S.key);
  memory.delete(S.key);
  S.tabs = [];
  S.active = '';
  if (!mem) return;
  for (const t of mem.tabs) {
    api().closeTab({ tabId: t.id }).catch(() => {});
  }
}

async function reopenSaved() {
  return;
}

/* ---------- github accounts ---------- */

function ghAccountByUser(user) {
  const key = String(user || '').trim().toLowerCase();
  if (!key) return null;
  return S.accounts.find((a) => a.providerId === 'github' && String(a.githubUser || a.label).toLowerCase() === key) || null;
}

function ghSignedIn(user) {
  const a = ghAccountByUser(user);
  const st = a ? ghStatus.get(a.id) : null;
  return !!(st && st.loggedIn);
}

function ghUnknown(user) {
  const a = ghAccountByUser(user);
  return !!a && !ghStatus.has(a.id);
}

function ghAnyUnknown() {
  return S.accounts.some((a) => a.providerId === 'github' && !ghStatus.has(a.id));
}

function firstSignedInGh() {
  for (const a of S.accounts) {
    if (a.providerId !== 'github') continue;
    const st = ghStatus.get(a.id);
    if (st && st.loggedIn) return a.githubUser || a.label;
  }
  return '';
}

function defaultGh(acc, isNew) {
  if (acc && acc.githubUser) return acc.githubUser;
  return isNew ? firstSignedInGh() : '';
}

function ghPickHtml(selected) {
  const want = String(selected || '');
  const list = [];
  for (const a of S.accounts) {
    if (a.providerId !== 'github') continue;
    const user = a.githubUser || a.label;
    const on = ghSignedIn(user);
    if (on || user.toLowerCase() === want.toLowerCase()) list.push({ user, on });
  }
  if (want && !list.some((x) => x.user.toLowerCase() === want.toLowerCase())) list.push({ user: want, on: false });
  return '<option value="">No GitHub login</option>' + list.map((x) =>
    '<option value="' + esc(x.user) + '"' + (x.user.toLowerCase() === want.toLowerCase() ? ' selected' : '') + '>@' + esc(x.user) +
    (x.on ? '' : ' (not signed in)') + '</option>'
  ).join('');
}

function ghNoteHtml(gh) {
  const user = String(gh || '').trim();
  const openBtn = '<div class="dp-form-actions"><button type="button" class="dp-btn" data-act="gh-open">' + ICONS.user + ' GitHub accounts</button></div>';
  if (user) {
    if (ghSignedIn(user)) {
      return '<div class="dp-hint"><span class="dp-gh-state ok">' + ICONS.check + ' @' + esc(user) + ' is signed in.</span> After the provider opens, press Continue with GitHub.</div>';
    }
    if (ghUnknown(user)) return '<div class="dp-hint">Checking the GitHub sign in...</div>';
    return '<div class="dp-hint"><span class="dp-gh-state warn">@' + esc(user) + ' is not signed in.</span> Sign in under GitHub accounts first.</div>' + openBtn;
  }
  if (firstSignedInGh()) return '<div class="dp-hint">Pick the signed in GitHub account this provider should use for Continue with GitHub.</div>';
  if (ghAnyUnknown()) return '<div class="dp-hint">Checking GitHub sign ins...</div>';
  return '<div class="dp-hint">No GitHub account is signed in. Sign one in under GitHub accounts, then pick it here.</div>' + openBtn;
}

function ghStateHtml(a) {
  const st = ghStatus.get(a.id);
  if (!st) return '<span class="dp-gh-state">Checking...</span>';
  if (st.unavailable) return '<span class="dp-gh-state warn">Restart the app to enable GitHub login</span>';
  if (!st.loggedIn) {
    const who = a.githubUser ? '@' + a.githubUser + ' is not signed in' : 'Not signed in to GitHub';
    return '<span class="dp-gh-state warn">' + esc(who) + '</span>';
  }
  const mismatch = a.githubUser && st.user && st.user.toLowerCase() !== a.githubUser.toLowerCase();
  if (mismatch) {
    return '<span class="dp-gh-state warn">Signed in as @' + esc(st.user) + ' (expected @' + esc(a.githubUser) + ')</span>';
  }
  return '<span class="dp-gh-state ok">' + ICONS.check + ' Signed in' + (st.user ? ' as @' + esc(st.user) : '') + '</span>';
}

function ghRowHtml(a) {
  const hasLink = !!a.githubUser;
  return '<div class="dp-gh">' +
    '<select class="dp-input dp-gh-sel" data-act="gh-link" data-id="' + esc(a.id) + '" title="Which signed in GitHub account this login uses">' + ghPickHtml(a.githubUser) + '</select>' +
    (hasLink ? ghStateHtml(ghAccountByUser(a.githubUser) || a) : '') +
  '</div>';
}

async function loadGitAccts() {
  const a = window.gitAccountsAPI;
  if (!a) {
    gitAccts = [];
    return;
  }
  try {
    const res = await a.list(S.repoPath || null);
    gitAccts = res && res.success ? (res.accounts || []) : [];
  } catch (_) {
    gitAccts = [];
  }
}

async function refreshGhStatus(accountId) {
  if (!accountId) return;
  const gen = S.gen;
  const g = ghApi();
  if (!g) {
    ghStatus.set(accountId, { loggedIn: false, user: '', unavailable: true });
  } else {
    try {
      const res = await g.status(accountId);
      if (!S.open || gen !== S.gen) return;
      const ok = res && res.success !== false;
      ghStatus.set(accountId, { loggedIn: ok && !!res.loggedIn, user: ok ? (res.user || '') : '' });
    } catch (_) {
      return;
    }
  }
  if (S.page !== 'manage' || !root) return;
  const side = root.querySelector('#dpSideLists');
  const main = root.querySelector('#dpMain');
  const formEl = root.querySelector('#dpSideForm');
  const cur = document.activeElement;
  const typingIn = (el) => !!(el && cur && el.contains(cur) && (cur.tagName === 'SELECT' || cur.tagName === 'INPUT'));
  if (!typingIn(side) && !(S.hub.view === 'github' && typingIn(main))) renderGhParts();
  if (S.form && formEl && !typingIn(formEl)) {
    S.form = readForm();
    renderForm();
  }
}

function refreshAllGhStatus() {
  for (const a of S.accounts) {
    if (a.providerId === 'github') refreshGhStatus(a.id);
  }
}

function scheduleGhRefresh(accountId) {
  clearTimeout(ghTimer);
  ghTimer = setTimeout(() => refreshGhStatus(accountId), 800);
}

async function syncGithubProfiles() {
  const have = new Set(S.accounts.filter((a) => a.providerId === 'github').map((a) => String(a.githubUser || a.label).toLowerCase()));
  for (const g of gitAccts) {
    const key = String(g.username || '').toLowerCase();
    if (!key || have.has(key)) continue;
    try {
      const res = await api().saveAccount({ providerId: 'github', label: g.username, githubUser: g.username });
      if (res && res.success) {
        S.accounts = res.accounts;
        have.add(key);
      }
    } catch (_) {}
  }
}

async function addGithubAccount() {
  if (!root) return;
  const el = root.querySelector('#dpGhUser');
  const user = String(el ? el.value : '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9-]{1,39}$/.test(user)) {
    toast('Type the GitHub username (letters, numbers and dashes only)', 'error');
    return;
  }
  try {
    const res = await api().saveAccount({ providerId: 'github', label: user, githubUser: user });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not add the GitHub account');
    S.accounts = res.accounts;
    S.ghDraft = '';
    refreshGhStatus(res.account.id);
    await openGithubLogin(res.account.id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function ensureGhData() {
  const gen = S.gen;
  loadGitAccts().then(() => syncGithubProfiles()).then(() => {
    if (!S.open || gen !== S.gen) return;
    if (S.page === 'manage') {
      if (S.form) S.form = readForm();
      renderForm();
      renderGhParts();
    }
    refreshAllGhStatus();
  });
}

function hintGithub(acc) {
  const g = ghApi();
  if (!g || !acc || !acc.githubUser) return;
  const gh = ghAccountByUser(acc.githubUser);
  if (!gh) return;
  g.status(gh.id).then((res) => {
    if (!res || res.success === false) return;
    ghStatus.set(gh.id, { loggedIn: !!res.loggedIn, user: res.user || '' });
    if (!res.loggedIn) {
      toast('@' + acc.githubUser + ' is not signed in to GitHub yet. Use the GitHub accounts button, then Sign in.', 'error');
    } else if (res.user && res.user.toLowerCase() !== acc.githubUser.toLowerCase()) {
      toast('This account is signed in to GitHub as @' + res.user + ', not @' + acc.githubUser + '.', 'error');
    }
  }).catch(() => {});
}

function hintForTarget(targetId) {
  const t = targetById(targetId);
  if (!t || !t.accountId) return;
  if (S.tabs.some((x) => x.targetId === targetId)) return;
  hintGithub(accountById(t.accountId));
}

async function setAccountGithub(id, user) {
  const a = accountById(id);
  if (!a) return;
  try {
    const res = await api().saveAccount({ id: a.id, providerId: a.providerId, label: a.label, githubUser: user });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not save the GitHub link');
    S.accounts = res.accounts;
    renderGhParts();
    toast(user ? 'Linked to @' + user : 'GitHub link removed');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openGithubLogin(accountId) {
  const acc = accountById(accountId);
  if (!acc) return;
  const targetId = 'gh:' + accountId;
  const user = acc.githubUser || '';
  const url = 'https://github.com/login' + (user ? '?login=' + encodeURIComponent(user) : '');
  S.page = 'browse';
  const existing = S.tabs.find((t) => t.targetId === targetId);
  if (existing) {
    S.active = existing.id;
    existing.used = Date.now();
    nav(existing.id, 'goto', url);
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
    const res = await api().openTab({ tabId: id, url, accountId });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not open GitHub');
    S.tabs.push({
      id,
      targetId,
      accountId,
      label: 'GitHub' + (user ? ' @' + user : ''),
      url,
      pageTitle: '',
      loading: true,
      canGoBack: false,
      canGoForward: false,
      used: Date.now(),
    });
    S.active = id;
    saveMemory();
    renderAll();
  } catch (err) {
    toast(err.message, 'error');
    S.page = 'manage';
    renderAll();
  }
}

async function ghLogout(accountId) {
  const a = accountById(accountId);
  const g = ghApi();
  if (!a || !g) return;
  const ok = await confirmDialog('Sign <b>' + esc(a.label) + '</b> out of GitHub? Other accounts keep their own sign in.');
  if (!ok) return;
  try {
    await g.logout(accountId);
    ghStatus.set(accountId, { loggedIn: false, user: '' });
    renderGhParts();
    if (S.form) {
      S.form = readForm();
      renderForm();
    }
    toast('Signed out of GitHub');
  } catch (err) {
    toast(err.message, 'error');
  }
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
  S.key = 'global';

  container.innerHTML = '<div class="dp-root"></div>';
  root = container.querySelector('.dp-root');
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('keydown', onKeydown);
  root.addEventListener('load', onImgLoad, true);
  root.addEventListener('error', onImgError, true);
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
    S.others = data.others || [];
    S.roles = data.roles || [];
    S.providers = data.providers || [];
    S.ui = Object.assign({ mode: 'grid', open: null }, data.ui || {});
    restoreMemory();
    await reopenSaved(gen);
    if (!S.open || gen !== S.gen) return;
    S.page = 'manage';
    S.hub.view = 'home';
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
  clearTimeout(searchTimer);
  clearTimeout(ghTimer);
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

function onImgLoad(e) {
  const el = e.target;
  if (el && el.classList && el.classList.contains('dp-ico')) el.classList.add('ok');
}

function onImgError(e) {
  const el = e.target;
  if (el && el.classList && el.classList.contains('dp-ico')) el.remove();
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
  if (t.accountId && !t.loading && /(^|\.)github\.com$/i.test(hostOf(t.url))) scheduleGhRefresh(t.accountId);
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

/* ---------- rendering: shared ---------- */

function renderAll() {
  if (!root) return;
  if (S.loading) {
    root.innerHTML = '<div class="dp-empty"><div class="dp-empty-title">Loading...</div></div>';
  } else if (S.error) {
    root.innerHTML = '<div class="dp-empty"><div class="dp-empty-title dp-bad">' + esc(S.error) + '</div></div>';
  } else if (S.page === 'manage') {
    root.innerHTML = manageHtml();
  } else {
    ensureActive();
    root.innerHTML = browseHtml();
  }
  scheduleLayout(false);
}

function ensureActive() {
  if (!S.tabs.some((t) => t.id === S.active)) S.active = S.tabs.length ? S.tabs[S.tabs.length - 1].id : '';
}

function setHtml(selector, html) {
  const el = root ? root.querySelector(selector) : null;
  if (el) el.innerHTML = html;
}

/* ---------- rendering: browse page ---------- */

function chipHtml(t) {
  const p = providerById(t.providerId);
  const acc = accountById(t.accountId);
  const isOpenTab = S.tabs.some((x) => x.targetId === t.id);
  return '<button type="button" class="dp-chip' + (isOpenTab ? ' open' : '') + '" data-act="open-target" data-id="' + esc(t.id) + '" title="' + esc(t.url) + '">' +
    badge(p) + '<span class="dp-chip-name">' + esc(t.name) + '</span>' +
    (acc ? '<span class="dp-chip-acc">' + esc(acc.label) + '</span>' : '') +
  '</button>';
}

function targetsBarHtml() {
  if (!S.targets.length) return '<div class="dp-targets"><span class="dp-hint">No targets yet. Open Providers to add your first one.</span></div>';
  return '<div class="dp-targets">' + groupTargets().map((g) =>
    '<div class="dp-group"><span class="dp-group-label">' + esc(g.label) + '</span>' + g.items.map(chipHtml).join('') + '</div>'
  ).join('') + '</div>';
}

function tabsHtml() {
  if (!S.tabs.length) return '';
  const items = S.tabs.map((t) => {
    const tg = targetById(t.targetId);
    return '<div class="dp-tab' + (t.id === S.active ? ' active' : '') + (t.loading ? ' loading' : '') + '" data-tab="' + esc(t.id) + '" title="' + esc(t.pageTitle || t.url) + '">' +
      '<span class="dp-tab-dot"></span><span class="dp-tab-name">' + esc(tg ? tg.name : (t.label || 'Tab')) + '</span>' +
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
    '<div class="dp-top-actions">' + modeBtn + '<button type="button" class="dp-btn" data-act="manage">' + ICONS.grid + ' Providers</button></div></div>' +
    tabsHtml() + stage;
}

/* ---------- rendering: home (categories) ---------- */

function suggestedProviderFor(roleKey) {
  if (!S.suggest || !S.suggest.suggestions) return null;
  const list = S.suggest.suggestions.filter((s) => s.role === roleKey);
  if (!list.length) return null;
  return providerById(list[0].providerId);
}

function catCardHtml(key, label) {
  const items = S.targets.filter((t) => roleKeyOfTarget(t) === key);
  const provs = [];
  for (const t of items) {
    const p = providerById(t.providerId);
    if (p && !provs.some((x) => x.id === p.id)) provs.push(p);
  }
  let visual = '<span class="dp-cat-glyph">' + catIcon(key) + '</span>';
  if (provs.length) {
    visual = '<span class="dp-cat-logos">' + provs.slice(0, 4).map((p) => badge(p, true)).join('') +
      (provs.length > 4 ? '<span class="dp-cat-more">+' + (provs.length - 4) + '</span>' : '') + '</span>';
  }
  let state = '<span class="dp-pc-state">None yet</span>';
  let line = '';
  let tip = 'Pick a provider for ' + label;
  if (items.length) {
    state = '<span class="dp-pc-state ok">' + ICONS.check + ' ' + items.length + ' configured</span>';
    line = provs.slice(0, 3).map((p) => esc(p.name)).join(', ');
    tip = 'Open ' + items[0].name + ' (use Providers in the browser to switch)';
  } else {
    const reuse = othersProviders(key);
    const sug = suggestedProviderFor(key);
    if (reuse.length) line = 'Used in other repos: ' + reuse.slice(0, 2).map((p) => esc(p.name)).join(', ');
    else line = sug ? 'Suggested: ' + esc(sug.name) : 'Pick a provider to set up';
  }
  return '<button type="button" class="dp-cat' + (items.length ? ' done' : '') + '" data-act="home-cat" data-role="' + esc(key) + '" title="' + esc(tip) + '">' +
    visual +
    '<span class="dp-cat-title">' + esc(label) + '</span>' +
    state +
    '<span class="dp-cat-line">' + line + '</span>' +
  '</button>';
}

function homeHtml() {
  const cards = roleButtons().map((r) => catCardHtml(r.key, r.label)).join('') +
    '<button type="button" class="dp-cat dp-cat-add" data-act="role-add" title="Add another category">' +
      '<span class="dp-cat-plus">' + ICONS.plus + '</span>' +
      '<span class="dp-cat-title">Add</span>' +
      '<span class="dp-cat-line">Emails, auth, payments...</span>' +
    '</button>';
  const adding = S.hub.addingRole
    ? '<div class="dp-roles dp-roles-center"><input id="dpNewRole" class="dp-input dp-newrole" maxlength="24" placeholder="Category, for example Emails" autocomplete="off">' +
      '<button type="button" class="dp-btn dp-primary" data-act="role-add-save">Add</button></div>'
    : '';
  return '<div class="dp-home">' +
    '<div class="dp-home-title">What do you want to connect?</div>' +
    '<div class="dp-cats">' + cards + '</div>' + adding +
    '<div class="dp-home-foot"><button type="button" class="dp-btn" data-act="home-cat" data-role="all">Browse all providers</button></div>' +
  '</div>';
}

function githubViewHtml() {
  return '<div class="dp-home">' +
    '<div class="dp-home-title">GitHub accounts</div>' +
    '<div style="width:100%;max-width:640px;min-height:0;overflow-y:auto">' + ghProfilesHtml() + '</div>' +
    '<div class="dp-home-foot"><button type="button" class="dp-btn" data-act="home">' + ICONS.back + ' Categories</button></div>' +
  '</div>';
}

/* ---------- rendering: providers page ---------- */

function roleBtnHtml(key, label, count) {
  return '<button type="button" class="dp-role' + (S.hub.role === key ? ' on' : '') + '" data-act="role" data-role="' + esc(key) + '">' +
    esc(label) + (count ? '<span class="dp-role-n">' + count + '</span>' : '') + '</button>';
}

function roleBarHtml() {
  let html = '<button type="button" class="dp-btn" data-act="home" title="Back to the categories">' + ICONS.back + ' Categories</button>';
  html += roleBtnHtml('all', 'All', S.targets.length);
  for (const r of roleButtons()) {
    html += roleBtnHtml(r.key, r.label, S.targets.filter((t) => roleKeyOfTarget(t) === r.key).length);
  }
  html += '<button type="button" class="dp-role dp-role-add" data-act="role-add" title="Add another category">' + ICONS.plus + '</button>';
  if (S.hub.addingRole) {
    html += '<input id="dpNewRole" class="dp-input dp-newrole" maxlength="24" placeholder="Category, for example Emails" autocomplete="off">' +
      '<button type="button" class="dp-btn dp-primary" data-act="role-add-save">Add</button>';
  }
  return html;
}

function rank(p) {
  if (targetsFor(p.id).length) return 0;
  if (othersForProvider(p.id).length) return 1;
  if (suggestionFor(p.id)) return 2;
  return 3;
}

function orderedItems() {
  const base = (S.results || S.providers).slice();
  if (S.hub.query.trim()) return base;
  return base
    .map((p, i) => ({ p, i, r: rank(p) }))
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map((x) => x.p);
}

function cardHtml(p) {
  const mine = targetsFor(p.id);
  const used = othersForProvider(p.id);
  const sug = suggestionFor(p.id);
  const done = mine.length > 0;
  const roles = p.roles.length ? p.roles.slice(0, 3).map(roleName).join(' / ') : 'Other';
  let state = '<span class="dp-pc-state">Not set up</span>';
  if (done) state = '<span class="dp-pc-state ok">' + ICONS.check + ' Configured' + (mine.length > 1 ? ' (' + mine.length + ')' : '') + '</span>';
  else if (used.length) state = '<span class="dp-pc-state sug">Used elsewhere</span>';
  else if (sug) state = '<span class="dp-pc-state sug">Suggested</span>';
  let title = 'Set up ' + p.name;
  if (done) title = 'Open ' + mine[0].name;
  else if (used.length) title = 'Reuse ' + used[0].name + ' from another repo';
  else if (sug) title = sug.reason;
  return '<div class="dp-pc' + (done ? ' done' : '') + '">' +
    '<button type="button" class="dp-pc-main" data-act="pick-card" data-id="' + esc(p.id) + '" title="' + esc(title) + '">' +
      badge(p, true) +
      '<span class="dp-pc-name">' + esc(p.name) + '</span>' +
      '<span class="dp-pc-roles">' + esc(roles) + '</span>' +
      state +
    '</button>' +
    (done ? '<button type="button" class="dp-pc-add" data-act="setup-provider" data-id="' + esc(p.id) + '" title="Add another target for ' + esc(p.name) + '">' + ICONS.plus + '</button>' : '') +
  '</div>';
}

function gridHtml() {
  const items = orderedItems();
  const detected = S.suggest && S.suggest.success !== false && (S.suggest.detected || []).length
    ? '<div class="dp-hint">Detected in this repo: ' + S.suggest.detected.map(esc).join(', ') + '. Suggested providers are marked.</div>'
    : '';
  let note = '';
  if (!S.hub.query.trim() && S.hub.role !== 'all') note = '<div class="dp-hint">Every provider is listed. The ones that usually fit this category come first.</div>';
  if (!items.length) return detected + '<div class="dp-hint">No providers match "' + esc(S.hub.query) + '". Try another name, or use the Custom link card.</div>';
  return detected + note + '<div class="dp-grid">' + items.map(cardHtml).join('') + '</div>';
}

function catalogHtml() {
  return '<div id="dpRoleBar" class="dp-roles">' + roleBarHtml() + '</div>' +
    '<input id="dpSearch" class="dp-input dp-search" placeholder="Search providers (aws, vercel, render, hostinger, mongodb...)" autocomplete="off" value="' + esc(S.hub.query) + '">' +
    '<div id="dpGrid" class="dp-gridwrap">' + gridHtml() + '</div>';
}

function mainHtml() {
  if (S.hub.view === 'home') return homeHtml();
  if (S.hub.view === 'github') return githubViewHtml();
  return catalogHtml();
}

function formHtml() {
  const f = S.form;
  if (!f) return '';
  const p = providerById(f.providerId);
  const roleOpts = S.roles.concat([{ id: 'custom', label: 'Custom...' }]).map((r) =>
    '<option value="' + esc(r.id) + '"' + (r.id === f.role ? ' selected' : '') + '>' + esc(r.label) + '</option>').join('');
  const accounts = S.accounts.filter((a) => a.providerId === f.providerId);
  const accOpts = '<option value="">No account (shared session)</option>' +
    accounts.map((a) => '<option value="' + esc(a.id) + '"' + (a.id === f.accountId ? ' selected' : '') + '>' + esc(a.label) + '</option>').join('') +
    '<option value="__new"' + (f.accountId === '__new' ? ' selected' : '') + '>+ New account...</option>';
  let sub = 'Sign in once, the login is saved and reused in every repo.';
  if (f.id) sub = 'Edit this target';
  else if (f.reuse) sub = 'Reusing the setup from another repo. Press Save to add it to this repo.';
  return '<section class="dp-card dp-formcard">' +
    '<div class="dp-fhead">' + badge(p, true) +
      '<div><div class="dp-mtitle">' + esc(p ? p.name : '') + '</div><div class="dp-hint">' + esc(sub) + '</div></div></div>' +
    '<label class="dp-label">Category</label><select id="dpFRole" class="dp-input">' + roleOpts + '</select>' +
    (f.role === 'custom' ? '<input id="dpFRoleLabel" class="dp-input" placeholder="Label, for example Emails" maxlength="24" value="' + esc(f.roleLabel) + '">' : '') +
    '<label class="dp-label">Account</label><select id="dpFAccount" class="dp-input">' + accOpts + '</select>' +
    (f.accountId === '__new' ? '<input id="dpFNewAcc" class="dp-input" placeholder="Account name or email (optional)" maxlength="60" value="' + esc(f.newAccount) + '">' : '') +
    '<label class="dp-label">Continue with GitHub</label><select id="dpFGh" class="dp-input" title="The signed in GitHub account this provider will use">' + ghPickHtml(f.gh) + '</select>' +
    ghNoteHtml(f.gh) +
    '<label class="dp-label">Name</label><input id="dpFName" class="dp-input" maxlength="60" value="' + esc(f.name) + '">' +
    '<label class="dp-label">Link (deep link to the exact page)</label><input id="dpFUrl" class="dp-input" spellcheck="false" value="' + esc(f.url) + '">' +
    '<div class="dp-form-actions">' +
      '<button type="button" class="dp-btn dp-primary" data-act="save-open">Save and open</button>' +
      '<button type="button" class="dp-btn" data-act="save-only">Save</button>' +
      '<button type="button" class="dp-btn" data-act="cancel-form">Cancel</button>' +
    '</div>' +
  '</section>';
}

function targetsCardHtml() {
  let body = '<p class="dp-hint">No targets in this repo yet. Pick a provider card to set one up.</p>';
  if (S.targets.length) {
    body = groupTargets().map((g) =>
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
  return '<section class="dp-card"><h3 class="dp-h3">Targets in this repo</h3>' + body + '</section>';
}

function ghProfilesHtml() {
  const list = S.accounts.filter((a) => a.providerId === 'github');
  const rows = list.map((a) => {
    const user = a.githubUser || a.label;
    const g = gitAccts.find((x) => String(x.username).toLowerCase() === String(user).toLowerCase());
    const st = ghStatus.get(a.id);
    const signedIn = !!(st && st.loggedIn);
    let img = '';
    if (g && g.avatarUrl) {
      const sep = g.avatarUrl.indexOf('?') === -1 ? '?' : '&';
      img = '<img class="dp-ico dp-av" alt="" referrerpolicy="no-referrer" src="' + esc(g.avatarUrl + sep + 's=64') + '">';
    }
    const av = '<span class="dp-badge" style="--h:' + hue(user) + '">' + esc(String(user).charAt(0).toUpperCase()) + img + '</span>';
    return '<div class="dp-ghp">' +
      '<button type="button" class="dp-ghp-main" data-act="gh-login" data-id="' + esc(a.id) + '" title="Open GitHub login for @' + esc(user) + '">' +
        av +
        '<span class="dp-row-main"><span class="dp-row-name">@' + esc(user) + '</span>' + ghStateHtml(a) + '</span>' +
      '</button>' +
      (signedIn
        ? '<button type="button" class="dp-btn" data-act="gh-logout" data-id="' + esc(a.id) + '">Sign out</button>'
        : '<button type="button" class="dp-btn dp-primary" data-act="gh-login" data-id="' + esc(a.id) + '">Sign in</button>') +
      '<button type="button" class="dp-btn dp-danger" data-act="delete-account" data-id="' + esc(a.id) + '">Remove</button>' +
    '</div>';
  }).join('');
  return '<section class="dp-card"><h3 class="dp-h3">GitHub accounts</h3>' +
    '<p class="dp-hint">Sign in and out here. When you set up a provider, you choose which signed in account it uses for Continue with GitHub. These accounts are shared by all repos.</p>' +
    (rows || '<p class="dp-hint">No GitHub accounts yet.</p>') +
    '<div class="dp-ghadd"><input id="dpGhUser" class="dp-input" placeholder="GitHub username" maxlength="39" autocomplete="off" spellcheck="false" value="' + esc(S.ghDraft || '') + '">' +
    '<button type="button" class="dp-btn dp-primary" data-act="gh-add">Add and sign in</button></div>' +
    '<p class="dp-hint">Continue with Google may be blocked by Google in an embedded browser. If it is, use Continue with GitHub or email instead.</p>' +
  '</section>';
}

function accountsCardHtml() {
  const rows = S.accounts.filter((a) => a.providerId !== 'github').map((a) => {
    const p = providerById(a.providerId);
    const n = S.targets.filter((t) => t.accountId === a.id).length;
    return '<div class="dp-acc"><div class="dp-row">' + badge(p) +
      '<div class="dp-row-main"><div class="dp-row-name">' + esc(a.label) + '</div><div class="dp-row-sub">' + esc(p ? p.name : '') + (n ? ' - used by ' + n + ' target' + (n === 1 ? '' : 's') + ' here' : '') + '</div></div>' +
      '<button type="button" class="dp-btn dp-danger" data-act="delete-account" data-id="' + esc(a.id) + '">Remove</button></div>' +
      ghRowHtml(a) +
    '</div>';
  }).join('');
  const opts = S.providers.filter((p) => p.id !== 'github').sort((a, b) => a.name.localeCompare(b.name)).map((p) =>
    '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
  return '<section class="dp-card"><h3 class="dp-h3">Provider accounts</h3>' +
    '<p class="dp-hint">Shared by all repos, so you can reuse a login in any repo. Choose which signed in GitHub account each one uses, or leave it unlinked.</p>' +
    (rows || '<p class="dp-hint">No accounts yet.</p>') +
    '<div class="dp-addacc"><select id="dpAProvider" class="dp-input">' + opts + '</select>' +
    '<input id="dpALabel" class="dp-input" placeholder="Account name or email" maxlength="60">' +
    '<select id="dpAGh" class="dp-input" title="Which signed in GitHub account this login uses">' + ghPickHtml('') + '</select>' +
    '<button type="button" class="dp-btn dp-primary" data-act="add-account">Add account</button></div>' +
  '</section>';
}

function listsHtml() {
  return targetsCardHtml() + accountsCardHtml();
}

function manageHtml() {
  const back = S.targets.length
    ? '<button type="button" class="dp-btn" data-act="back-browse">' + ICONS.back + ' Back to browser</button>'
    : '';
  const ghBtn = '<button type="button" class="dp-btn' + (S.hub.view === 'github' ? ' dp-primary' : '') + '" data-act="gh-manage" title="Manage the GitHub accounts used for Continue with GitHub">' +
    ICONS.user + ' GitHub accounts</button>';
  let sub = S.targets.length
    ? 'Pick a category, then a provider. Targets belong to this repo, accounts are shared by all repos.'
    : 'Nothing is set up in this repo yet. Pick what you want to connect, then reuse an account or sign in.';
  if (S.hub.view === 'github') sub = 'Sign in to the GitHub accounts you use for Continue with GitHub on provider sites.';
  const solo = isSolo() ? ' dp-solo' : '';
  return '<div class="dp-manage">' +
    '<div class="dp-mhead"><div><div class="dp-mtitle">Deploy</div><div class="dp-hint">' + esc(sub) + '</div></div>' +
      '<div class="dp-top-actions">' + ghBtn + back + '</div></div>' +
    '<div class="dp-mbody' + solo + '">' +
      '<section class="dp-main" id="dpMain">' + mainHtml() + '</section>' +
      '<aside class="dp-side"><div id="dpSideForm">' + formHtml() + '</div><div id="dpSideLists">' + listsHtml() + '</div></aside>' +
    '</div></div>';
}

function renderMain() {
  setHtml('#dpMain', mainHtml());
  syncSolo();
}

function renderRoleBar() {
  setHtml('#dpRoleBar', roleBarHtml());
}

function renderGrid() {
  setHtml('#dpGrid', gridHtml());
}

function renderForm() {
  setHtml('#dpSideForm', formHtml());
  syncSolo();
}

function renderLists() {
  setHtml('#dpSideLists', listsHtml());
}

function renderGhParts() {
  if (S.hub.view === 'github') renderMain();
  renderLists();
}

function rerenderRoleArea() {
  if (S.hub.view === 'home') renderMain();
  else renderRoleBar();
}

function renderManageParts() {
  if (!root || S.page !== 'manage') return;
  renderMain();
  renderForm();
  renderLists();
}

function setHubView(view) {
  if (S.form) S.form = readForm();
  S.hub.view = view;
  S.hub.addingRole = false;
  renderAll();
}

/* ---------- data actions ---------- */

async function loadSuggestions() {
  if (S.suggestLoading) return;
  ensureGhData();
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
  if (S.page === 'manage') {
    if (S.hub.view === 'home') renderMain();
    else if (S.hub.view === 'catalog') renderGrid();
  }
}

async function refreshCatalog() {
  if (!S.open) return;
  const gen = S.gen;
  searchSeq += 1;
  const seq = searchSeq;
  try {
    const res = await api().search({ query: S.hub.query, role: roleParam() });
    if (!S.open || gen !== S.gen || seq !== searchSeq) return;
    S.results = res && res.providers ? res.providers : [];
    if (S.page === 'manage' && S.hub.view === 'catalog') renderGrid();
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
  read('dpFGh', 'gh');
  read('dpFName', 'name');
  read('dpFUrl', 'url');
  return f;
}

function startForm(seed) {
  S.page = 'manage';
  const fromSeed = !!(seed && seed.accountId);
  const f = Object.assign({
    id: '', role: 'frontend', roleLabel: '', providerId: '', accountId: '', newAccount: '', gh: '', name: '', url: '', reuse: false,
  }, seed || {});
  const p = providerById(f.providerId);
  if (p) {
    if (!f.name) f.name = p.name;
    if (!f.url) f.url = p.url;
    if (!f.id && !f.accountId) {
      const accs = S.accounts.filter((a) => a.providerId === p.id);
      f.accountId = accs.length ? accs[0].id : '__new';
    }
  }
  f.gh = defaultGh(accountById(f.accountId), !f.id && !fromSeed);
  S.form = f;
  if (root && root.querySelector('#dpSideForm')) {
    renderForm();
    const side = root.querySelector('.dp-side');
    if (side) side.scrollTop = 0;
  } else {
    renderAll();
  }
  refreshAllGhStatus();
}

function pickCard(id, forceNew) {
  const p = providerById(id);
  if (!p) return;
  const mine = targetsFor(id);
  if (mine.length && !forceNew) {
    hintForTarget(mine[0].id);
    openTarget(mine[0].id);
    return;
  }
  const other = forceNew ? null : othersForProvider(id)[0];
  if (other) {
    startForm({
      providerId: id,
      role: other.role,
      roleLabel: other.roleLabel,
      accountId: other.accountId,
      name: other.name,
      url: other.url,
      reuse: true,
    });
    return;
  }
  startForm(Object.assign({ providerId: id }, seedRole(p)));
}

function enterCatalog(roleKey) {
  S.hub.role = roleKey || 'all';
  S.hub.view = 'catalog';
  S.hub.addingRole = false;
  S.hub.query = '';
  S.results = null;
  renderAll();
  refreshCatalog();
}
function openCategory(roleKey) {
  const key = roleKey || 'all';
  if (key !== 'all') {
    const items = S.targets.filter((t) => roleKeyOfTarget(t) === key);
    if (items.length) {
      const live = items.find((t) => S.tabs.some((x) => x.targetId === t.id));
      const pick = live || items[0];
      hintForTarget(pick.id);
      openTarget(pick.id);
      return;
    }
  }
  enterCatalog(key);
}

function saveCustomRole() {
  if (!root) return;
  const input = root.querySelector('#dpNewRole');
  const label = String(input ? input.value : '').trim().slice(0, 24);
  if (!label) {
    toast('Type a name for the category', 'error');
    return;
  }
  let key = '';
  const builtin = S.roles.find((r) => r.label.toLowerCase() === label.toLowerCase());
  if (builtin) {
    key = builtin.id;
  } else {
    const known = roleButtons().find((r) => r.key.indexOf('custom:') === 0 && r.label.toLowerCase() === label.toLowerCase());
    if (known) {
      key = known.key;
    } else {
      S.customRoles.push(label);
      key = 'custom:' + label;
    }
  }
  enterCatalog(key);
}

async function saveForm(openAfter) {
  const f = readForm();
  if (!f) return;
  if (!f.providerId) {
    toast('Pick a provider first', 'error');
    return;
  }
  if (f.role === 'custom' && !String(f.roleLabel || '').trim()) {
    toast('Give the custom category a label', 'error');
    return;
  }
  try {
    let accountId = f.accountId === '__new' ? '' : f.accountId;
    const gh = String(f.gh || '').trim();
    if (accountId) {
      const acc = accountById(accountId);
      if (acc && String(acc.githubUser || '').toLowerCase() !== gh.toLowerCase()) {
        const upd = await api().saveAccount({ id: acc.id, providerId: acc.providerId, label: acc.label, githubUser: gh });
        if (!upd || !upd.success) throw new Error((upd && upd.error) || 'Could not link the GitHub account');
        S.accounts = upd.accounts;
      }
    } else if (gh || f.accountId === '__new') {
      const typed = f.accountId === '__new' ? String(f.newAccount || '').trim() : '';
      const label = typed || (gh ? '@' + gh : '');
      if (label) {
        const acc = await api().saveAccount({ providerId: f.providerId, label, githubUser: gh });
        if (!acc || !acc.success) throw new Error((acc && acc.error) || 'Could not save the account');
        S.accounts = acc.accounts;
        accountId = acc.account.id;
      }
    }
    const res = await api().saveTarget({
      repoPath: S.repoPath,
      target: { id: f.id, role: f.role, roleLabel: f.roleLabel, providerId: f.providerId, accountId, name: f.name, url: f.url },
    });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not save the target');
    S.targets = res.targets;
    S.others = res.others || [];
    S.accounts = res.accounts;
    S.form = null;
    toast('Target saved');
    if (openAfter && res.target && res.target.id) {
      hintForTarget(res.target.id);
      await openTarget(res.target.id);
    } else {
      renderManageParts();
      refreshAllGhStatus();
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteTarget(id) {
  const t = targetById(id);
  if (!t) return;
  const ok = await confirmDialog('Remove the target <b>' + esc(t.name) + '</b> from this repo? Your saved logins are kept.');
  if (!ok) return;
  try {
    const res = await api().deleteTarget({ repoPath: S.repoPath, id });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not remove the target');
    S.targets = res.targets;
    S.others = res.others || [];
    if (S.form && S.form.id === id) S.form = null;
    for (const tab of S.tabs.filter((x) => x.targetId === id)) await closeTab(tab.id, true);
    saveMemory();
    renderManageParts();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function addAccount() {
  if (!root) return;
  const providerId = (root.querySelector('#dpAProvider') || {}).value;
  const gh = String((root.querySelector('#dpAGh') || {}).value || '').trim();
  let label = ((root.querySelector('#dpALabel') || {}).value || '').trim();
  if (!label && gh) label = '@' + gh;
  if (!providerId || !label) {
    toast('Pick a provider and type a name for the account', 'error');
    return;
  }
  try {
    const res = await api().saveAccount({ providerId, label, githubUser: gh });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not save the account');
    S.accounts = res.accounts;
    if (S.form) S.form = readForm();
    renderLists();
    renderForm();
    refreshAllGhStatus();
    toast('Account added');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteAccount(id) {
  const a = accountById(id);
  if (!a) return;
  const ok = await confirmDialog('Remove the account <b>' + esc(a.label) + '</b>? Its saved login in the Deploy browser is cleared, and targets using it fall back to the shared session in every repo.');
  if (!ok) return;
  try {
    const res = await api().deleteAccount({ id, repoPath: S.repoPath });
    if (!res || !res.success) throw new Error((res && res.error) || 'Could not remove the account');
    S.accounts = res.accounts;
    S.targets = res.targets;
    S.others = res.others || [];
    S.tabs = S.tabs.filter((t) => t.accountId !== id);
    ghStatus.delete(id);
    if (S.form && S.form.accountId === id) S.form.accountId = '';
    ensureActive();
    saveMemory();
    renderManageParts();
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
    S.page = 'manage';
    renderAll();
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
    S.others = res.others || [];
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
  const tab = S.tabs.find((t) => t.id === S.active);
  const tg = tab ? targetById(tab.targetId) : null;
  S.page = 'manage';
  S.hub.addingRole = false;
  S.hub.role = tg ? roleKeyOfTarget(tg) : 'all';
  S.hub.view = 'catalog';
  S.hub.query = '';
  S.results = null;
  renderAll();
  refreshCatalog();
  if (!S.suggest && !S.suggestLoading) loadSuggestions();
  else ensureGhData();
}

/* ---------- events ---------- */

function handleAct(act, btn) {
  const id = btn.dataset.id;
  const tabId = btn.dataset.tab;
  if (act === 'open-target' || act === 'open-from-list') {
    hintForTarget(id);
    openTarget(id);
  } else if (act === 'manage') goManage();
  else if (act === 'back-browse') {
    S.page = 'browse';
    renderAll();
  } else if (act === 'mode') toggleMode();
  else if (act === 'close-tab') closeTab(tabId);
  else if (act === 'back' || act === 'forward' || act === 'reload' || act === 'stop') nav(tabId, act);
  else if (act === 'pin') pinTarget(tabId);
  else if (act === 'external') api().openExternal({ tabId }).catch(() => {});
  else if (act === 'home') setHubView('home');
  else if (act === 'gh-manage') {
    setHubView(S.hub.view === 'github' ? 'home' : 'github');
    if (S.hub.view === 'github') ensureGhData();
  } else if (act === 'gh-open') {
    setHubView('github');
    ensureGhData();
  } else if (act === 'home-cat') openCategory(btn.dataset.role || 'all');
  else if (act === 'role') {
    S.hub.role = btn.dataset.role || 'all';
    S.hub.addingRole = false;
    renderRoleBar();
    renderGrid();
    refreshCatalog();
  } else if (act === 'role-add') {
    S.hub.addingRole = !S.hub.addingRole;
    rerenderRoleArea();
    const input = root ? root.querySelector('#dpNewRole') : null;
    if (input) input.focus();
  } else if (act === 'role-add-save') saveCustomRole();
  else if (act === 'pick-card') pickCard(id, false);
  else if (act === 'setup-provider') pickCard(id, true);
  else if (act === 'edit-target') {
    const t = targetById(id);
    if (t) startForm({ id: t.id, role: t.role, roleLabel: t.roleLabel, providerId: t.providerId, accountId: t.accountId, name: t.name, url: t.url });
  } else if (act === 'delete-target') deleteTarget(id);
  else if (act === 'save-open') saveForm(true);
  else if (act === 'save-only') saveForm(false);
  else if (act === 'cancel-form') {
    S.form = null;
    renderForm();
  } else if (act === 'add-account') addAccount();
  else if (act === 'delete-account') deleteAccount(id);
  else if (act === 'gh-add') addGithubAccount();
  else if (act === 'gh-login') openGithubLogin(id);
  else if (act === 'gh-logout') ghLogout(id);
}

function onClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  const btn = t.closest('[data-act]');
  if (btn) {
    if (btn.disabled) return;
    if (btn.dataset.act === 'gh-link') return;
    handleAct(btn.dataset.act, btn);
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
  const t = e.target;
  const id = t && t.id;
  if (id === 'dpFAccount') {
    S.form = readForm();
    S.form.gh = defaultGh(accountById(S.form.accountId), !S.form.id);
    renderForm();
    return;
  }
  if (id === 'dpFRole' || id === 'dpFGh') {
    S.form = readForm();
    renderForm();
    return;
  }
  if (t && t.dataset && t.dataset.act === 'gh-link') setAccountGithub(t.dataset.id, t.value);
}

function onInput(e) {
  const id = e.target && e.target.id;
  if (id === 'dpSearch') {
    S.hub.query = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshCatalog, SEARCH_MS);
  } else if (id === 'dpGhUser') {
    S.ghDraft = e.target.value;
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
  } else if (e.key === 'Enter' && e.target.id === 'dpNewRole') {
    e.preventDefault();
    saveCustomRole();
  } else if (e.key === 'Enter' && e.target.id === 'dpGhUser') {
    e.preventDefault();
    addGithubAccount();
  }
}