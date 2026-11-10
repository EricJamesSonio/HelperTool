import { state } from '../app_manager/appState.js';
import { confirmDialog } from '../utils/confirmDialog.js';
import { openCloneModal, openCreateModal } from './repoTools.js';

const I_CLONE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M10 3v10M6 9l4 4 4-4"/><path d="M4 16h12"/></svg>';


const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,read:user&description=Helper%20Tool';
const DEV_URL = 'https://github.com/settings/developers';

const SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ';
const I_USER = SVG + 'width="18" height="18"><circle cx="10" cy="7" r="3.2"/><path d="M3.5 17c.6-3.3 3.2-5 6.5-5s5.9 1.7 6.5 5"/></svg>';
const I_TRASH = SVG + 'width="15" height="15"><path d="M4 6h12"/><path d="M8 6V4h4v2"/><path d="M5.5 6l.7 10h7.6l.7-10"/></svg>';
const I_CHECK = SVG + 'width="14" height="14"><path d="M4 10.5l4 4 8-9"/></svg>';
const I_PLUS = SVG + 'width="14" height="14"><path d="M10 4v12M4 10h12"/></svg>';
const I_SYS = SVG + 'width="16" height="16"><rect x="2.5" y="4" width="15" height="10" rx="1.5"/><path d="M7 17h6M10 14v3"/></svg>';
const I_GH = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
const I_EXT = SVG + 'width="14" height="14"><path d="M8 4H5.5A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16h9a1.5 1.5 0 001.5-1.5V12"/><path d="M11 4h5v5M16 4l-6 6"/></svg>';


let btn = null;
let panel = null;
let accounts = [];
let activeId = null;
let secure = true;
let loading = false;
let busy = null;
let formOpen = false;
let setupOpen = false;
let login = null;
let focusSel = '';
let msg = null;
let msgTimer = 0;
let seq = 0;
const formVals = { token: '', label: '', clientId: '' };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function api() {
  return window.gitAccountsAPI || null;
}

function authApi() {
  return window.gitAuthAPI || null;
}

function openUrl(url) {
  if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(url);
}

function injectCss() {
  const sheets = [
    ['gitAccountsCss', './styles/git-accounts.css'],
    ['gitRepoToolsCss', './styles/git-repo-tools.css'],
  ];
  for (const sheet of sheets) {
    if (document.getElementById(sheet[0])) continue;
    const link = document.createElement('link');
    link.id = sheet[0];
    link.rel = 'stylesheet';
    link.href = sheet[1];
    document.head.appendChild(link);
  }
}

function activeAccount() {
  return accounts.find((a) => a.id === activeId) || null;
}

function avatarHtml(acc, cls) {
  const letter = (acc.username || acc.name || '?').charAt(0);
  let img = '';
  if (acc.avatarUrl) {
    const sep = acc.avatarUrl.indexOf('?') === -1 ? '?' : '&';
    img = '<img src="' + esc(acc.avatarUrl + sep + 's=64') + '" alt="" referrerpolicy="no-referrer">';
  }
  return '<span class="ga-av ' + (cls || '') + '"><span class="ga-av-l">' + esc(letter) + '</span>' + img + '</span>';
}

function setMsg(text, warn) {
  clearTimeout(msgTimer);
  msg = text ? { text, warn: !!warn } : null;
  if (text) {
    msgTimer = setTimeout(() => {
      msg = null;
      render();
    }, 9000);
  }
}

function updateButton() {
  if (!btn) return;
  const acc = activeAccount();
  btn.classList.toggle('has-account', !!acc);
  if (acc) {
    btn.innerHTML = '<span class="ga-btn-av">' + avatarHtml(acc, 'sm') + '</span>';
    btn.title = 'GitHub: @' + acc.username + ' is used in this repo';
  } else {
    btn.innerHTML = I_USER;
    btn.title = 'GitHub accounts';
  }
}

function skeletonHtml() {
  let out = '<div class="ga-loading"><span class="ga-spin"></span><span>Loading accounts...</span></div>';
  for (let i = 0; i < 2; i++) out += '<div class="ga-skel"></div>';
  return out;
}

function defaultRowHtml() {
  const on = !activeId;
  const isBusy = busy && busy.kind === 'switch' && busy.id === '';
  return '<div class="ga-row' + (on ? ' active' : '') + (isBusy ? ' busy' : '') + '" data-id="">' +
    '<span class="ga-av ga-av-sys">' + I_SYS + '</span>' +
    '<div class="ga-info"><div class="ga-name">System default</div><div class="ga-sub">Uses the git login already on this PC</div></div>' +
    '<span class="ga-state">' + (isBusy ? '<span class="ga-spin"></span>' : (on ? I_CHECK + '<span>In use</span>' : '')) + '</span>' +
  '</div>';
}

function rowHtml(acc) {
  const on = acc.id === activeId;
  const sw = busy && busy.kind === 'switch' && busy.id === acc.id;
  const del = busy && busy.kind === 'del' && busy.id === acc.id;
  let stateHtml = '';
  if (sw) stateHtml = '<span class="ga-spin"></span><span>Switching...</span>';
  else if (del) stateHtml = '<span class="ga-spin"></span><span>Removing...</span>';
  else if (on) stateHtml = I_CHECK + '<span>In use</span>';
  const title = acc.label || acc.name || acc.username;
  return '<div class="ga-row' + (on ? ' active' : '') + (sw || del ? ' busy' : '') + '" data-id="' + esc(acc.id) + '">' +
    avatarHtml(acc, '') +
    '<div class="ga-info">' +
      '<div class="ga-name">' + esc(title) + '</div>' +
      '<div class="ga-sub">@' + esc(acc.username) + (acc.email ? ' - ' + esc(acc.email) : '') + '</div>' +
    '</div>' +
    '<span class="ga-state">' + stateHtml + '</span>' +
    '<button type="button" class="ga-open" data-act="open-gh" data-user="' + esc(acc.username) + '" title="Open @' + esc(acc.username) + ' on GitHub">' + I_EXT + '</button>' +
    '<button type="button" class="ga-del" data-act="del" data-id="' + esc(acc.id) + '" title="Remove account">' + I_TRASH + '</button>' +
  '</div>';
}

function addHtml() {
  const off = busy ? ' disabled' : '';
  return '<div class="ga-tools">' +
      '<button type="button" class="ga-tool" data-act="clone-repo"' + off + '>' + I_CLONE + '<span>Clone</span></button>' +
      '<button type="button" class="ga-tool" data-act="create-repo"' + off + '>' + I_PLUS + '<span>Create</span></button>' +
    '</div>' +
    '<button type="button" class="ga-signin" data-act="signin"' + off + '>' + I_GH + '<span>Sign in with GitHub</span></button>' +
    '<div class="ga-alt"><a class="ga-link" data-act="open-form">Use a token instead</a></div>';
}

function loginHtml() {
  let body = '';
  if (login.phase === 'starting') {
    body = '<div class="ga-wait"><span class="ga-spin"></span><span>Contacting GitHub...</span></div>';
  } else {
    body = '<div class="ga-lbl">Enter this code on GitHub</div>' +
      '<div class="ga-code"><span class="ga-code-val">' + esc(login.userCode) + '</span>' +
      '<button type="button" class="ga-btn" data-act="copy-code">Copy</button></div>' +
      '<div class="ga-hint">Your browser opened GitHub and the code is already copied. Log in, paste it and approve. This finishes by itself.</div>' +
      '<div class="ga-wait"><span class="ga-spin"></span><span>Waiting for approval...</span></div>';
  }
  const again = login.phase === 'waiting' ? '<button type="button" class="ga-btn" data-act="open-verify">Open GitHub again</button>' : '';
  return '<div class="ga-login">' + body +
    '<div class="ga-form-actions">' + again + '<button type="button" class="ga-btn" data-act="cancel-login">Cancel</button></div>' +
  '</div>';
}

function setupHtml() {
  return '<div class="ga-form">' +
    '<div class="ga-lbl">One-time setup</div>' +
    '<div class="ga-hint">Create an OAuth App on GitHub (<a class="ga-link" data-act="dev-page">open developer settings</a>), tick Enable Device Flow, then paste its Client ID here.</div>' +
    '<label class="ga-lbl" for="gaClient">Client ID</label>' +
    '<input id="gaClient" class="ga-in" type="text" autocomplete="off" spellcheck="false" placeholder="Ov23li..." value="' + esc(formVals.clientId) + '">' +
    '<div class="ga-form-actions">' +
      '<button type="button" class="ga-btn" data-act="cancel-setup">Cancel</button>' +
      '<button type="button" class="ga-btn primary" data-act="save-client">Save and sign in</button>' +
    '</div>' +
  '</div>';
}

function formHtml() {
  const adding = busy && busy.kind === 'add';
  return '<div class="ga-form">' +
    '<label class="ga-lbl" for="gaToken">Personal access token</label>' +
    '<input id="gaToken" class="ga-in" type="password" autocomplete="off" spellcheck="false" placeholder="ghp_... or github_pat_..." value="' + esc(formVals.token) + '"' + (adding ? ' disabled' : '') + '>' +
    '<label class="ga-lbl" for="gaLabel">Label (optional)</label>' +
    '<input id="gaLabel" class="ga-in" type="text" autocomplete="off" spellcheck="false" placeholder="Work, Personal..." value="' + esc(formVals.label) + '"' + (adding ? ' disabled' : '') + '>' +
    '<div class="ga-hint"><a class="ga-link" data-act="token-page">Create a token on GitHub</a> with the repo scope. It is checked with GitHub and saved' + (secure ? ' encrypted' : '') + ' on this PC.</div>' +
    '<div class="ga-form-actions">' +
      '<button type="button" class="ga-btn" data-act="cancel-form"' + (adding ? ' disabled' : '') + '>Cancel</button>' +
      '<button type="button" class="ga-btn primary" data-act="submit-form"' + (adding ? ' disabled' : '') + '>' + (adding ? '<span class="ga-spin"></span>Verifying...' : 'Add account') + '</button>' +
    '</div>' +
  '</div>';
}

function panelHtml() {
  const repo = state.selectedRepoPath;
  const repoName = repo ? repo.split(/[\\/]/).filter(Boolean).pop() : '';
  let h = '<div class="ga-head"><span class="ga-title">GitHub accounts</span>' +
    (repoName ? '<span class="ga-repo" title="' + esc(repo) + '">' + esc(repoName) + '</span>' : '') +
  '</div>';
  h += '<div class="ga-intro">The selected account is used for commits and pushes in all repos.</div>';
  h += '<div class="ga-list">';
  if (loading) {
    h += skeletonHtml();
  } else {
    h += defaultRowHtml();
    for (const a of accounts) h += rowHtml(a);
    if (!accounts.length) h += '<div class="ga-empty">No saved accounts yet. Add one to get started.</div>';
  }
  h += '</div>';
  if (login) h += loginHtml();
  else if (setupOpen) h += setupHtml();
  else if (formOpen) h += formHtml();
  else h += addHtml();
  if (msg) h += '<div class="ga-msg' + (msg.warn ? ' warn' : '') + '">' + esc(msg.text) + '</div>';
  if (!secure && !loading) h += '<div class="ga-note">Secure storage is unavailable here, so tokens are saved without encryption. They are encrypted automatically once it becomes available.</div>';
  return h;
}

function position() {
  if (!panel || !btn) return;
  const r = btn.getBoundingClientRect();
  panel.style.top = Math.round(r.bottom + 6) + 'px';
  panel.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
  panel.style.maxHeight = Math.max(240, window.innerHeight - r.bottom - 18) + 'px';
}

function render() {
  if (!panel || panel.hidden) return;
  panel.innerHTML = panelHtml();
  panel.classList.toggle('ga-busy', !!busy);
  position();
  if (focusSel) {
    const sel = focusSel;
    focusSel = '';
    const el = panel.querySelector(sel);
    if (el) el.focus();
  }
}

async function refresh() {
  const my = ++seq;
  const repo = state.selectedRepoPath || null;
  const a = api();
  if (!a) {
    loading = false;
    setMsg('Fully restart the app to enable account switching.', true);
    render();
    return;
  }
  loading = true;
  render();
  try {
    const res = await a.list(repo);
    if (my !== seq) return;
    if (res && res.success) {
      accounts = res.accounts || [];
      activeId = res.activeId || null;
      secure = res.secure !== false;
    } else {
      setMsg((res && res.error) || 'Could not load accounts.', true);
    }
  } catch (err) {
    if (my !== seq) return;
    setMsg(err && err.message ? err.message : 'Could not load accounts.', true);
  }
  loading = false;
  updateButton();
  render();
}

async function switchTo(id) {
  const a = api();
  const repo = state.selectedRepoPath || null;
  if (!a || busy) return;
  const target = id || null;
  if (target === (activeId || null)) return;
  busy = { kind: 'switch', id: id || '' };
  setMsg(null);
  render();
  try {
    const res = await a.switch(repo, target);
    if (res && res.success) {
      activeId = res.activeId || null;
      const acc = activeAccount();
      const base = acc ? 'Now using @' + acc.username + ' in all repos.' : 'All repos now use the system default login.';
      setMsg(res.warning ? base + ' ' + res.warning : base, !!res.warning);
    } else {
      setMsg((res && res.error) || 'Could not switch account.', true);
    }
  } catch (err) {
    setMsg(err && err.message ? err.message : 'Could not switch account.', true);
  }
  busy = null;
  updateButton();
  render();
}

async function startLogin() {
  const auth = authApi();
  if (!auth) {
    setMsg('Fully restart the app to enable browser sign in.', true);
    render();
    return;
  }
  if (busy || login) return;
  setMsg(null);
  formOpen = false;
  setupOpen = false;
  login = { phase: 'starting', userCode: '', uri: '' };
  render();
  try {
    const res = await auth.loginStart();
    if (res && res.success) {
      login = { phase: 'waiting', userCode: res.userCode, uri: res.verificationUri };
    } else if (res && res.needsSetup) {
      login = null;
      setupOpen = true;
      focusSel = '#gaClient';
      if (res.error) setMsg(res.error, true);
    } else {
      login = null;
      setMsg((res && res.error) || 'Could not start sign in.', true);
    }
  } catch (err) {
    login = null;
    setMsg(err && err.message ? err.message : 'Could not start sign in.', true);
  }
  render();
}

async function cancelLogin() {
  const auth = authApi();
  login = null;
  render();
  if (auth) {
    try {
      await auth.loginCancel();
    } catch (_) {}
  }
}

async function saveClientId() {
  const auth = authApi();
  if (!auth) return;
  const value = formVals.clientId.trim();
  if (!value) {
    setMsg('Paste the Client ID first.', true);
    render();
    return;
  }
  try {
    const res = await auth.setClientId(value);
    if (res && res.success) {
      setupOpen = false;
      setMsg(null);
      startLogin();
    } else {
      setMsg((res && res.error) || 'Could not save the Client ID.', true);
      render();
    }
  } catch (err) {
    setMsg(err && err.message ? err.message : 'Could not save the Client ID.', true);
    render();
  }
}

async function onLoginResult(res) {
  login = null;
  if (res && res.success) {
    accounts = res.accounts || accounts;
    updateButton();
    if (res.account) {
      if (res.account.id === activeId) {
        setMsg('@' + res.account.username + ' signed in again and its token was replaced.');
        render();
        return;
      }
      await switchTo(res.account.id);
      return;
    }
  } else if (res && !res.cancelled) {
    setMsg((res && res.error) || 'Sign in failed.', true);
  }
  render();
}

async function addAccount() {
  const a = api();
  if (!a || busy) return;
  const token = formVals.token.trim();
  if (!token) {
    setMsg('Paste a personal access token first.', true);
    render();
    return;
  }
  busy = { kind: 'add' };
  setMsg(null);
  render();
  try {
    const res = await a.add({ token, label: formVals.label });
    if (res && res.success) {
      accounts = res.accounts || accounts;
      formVals.token = '';
      formVals.label = '';
      formOpen = false;
      const who = res.account ? '@' + res.account.username : 'Account';
      setMsg(who + (res.updated ? ' updated.' : ' saved.') + ' Click it to use it in this repo.');
    } else {
      setMsg((res && res.error) || 'Could not add the account.', true);
    }
  } catch (err) {
    setMsg(err && err.message ? err.message : 'Could not add the account.', true);
  }
  busy = null;
  updateButton();
  render();
}

async function removeAccount(id) {
  const a = api();
  const acc = accounts.find((x) => x.id === id);
  if (!a || !acc || busy) return;
  const ok = await confirmDialog(
    'Remove <b>@' + esc(acc.username) + '</b> from Helper Tool? Its saved token is deleted from this PC, and repos using it go back to your system git login.',
    { title: 'Remove GitHub account', confirmText: 'Remove' }
  );
  if (!ok) return;
  busy = { kind: 'del', id };
  setMsg(null);
  render();
  try {
    const res = await a.remove(id);
    if (res && res.success) {
      accounts = res.accounts || [];
      if (activeId === id) activeId = null;
      setMsg('Removed @' + acc.username + '.');
    } else {
      setMsg((res && res.error) || 'Could not remove the account.', true);
    }
  } catch (err) {
    setMsg(err && err.message ? err.message : 'Could not remove the account.', true);
  }
  busy = null;
  updateButton();
  render();
}

function copyCode() {
  if (!login || !login.userCode) return;
  try {
    navigator.clipboard.writeText(login.userCode);
    setMsg('Code copied.');
  } catch (_) {
    setMsg('Could not copy the code.', true);
  }
  render();
}

function openRepoTool(kind) {
  if (!activeAccount()) {
    setMsg('Select a GitHub account first. System default cannot list or create repositories.', true);
    render();
    return;
  }
  closePanel();
  if (kind === 'clone') openCloneModal();
  else openCreateModal();
}
function onPanelClick(e) {
  const actEl = e.target.closest('[data-act]');
  if (actEl) {
    const act = actEl.dataset.act;
    if (act === 'del') removeAccount(actEl.dataset.id);
    else if (act === 'clone-repo') openRepoTool('clone');
    else if (act === 'create-repo') openRepoTool('create');
    else if (act === 'signin') startLogin();
    else if (act === 'cancel-login') cancelLogin();
    else if (act === 'copy-code') copyCode();
    else if (act === 'open-verify' && login) openUrl(login.uri);
    else if (act === 'save-client') saveClientId();
    else if (act === 'cancel-setup') {
      setupOpen = false;
      render();
    } else if (act === 'dev-page') openUrl(DEV_URL);
    else if (act === 'open-form') {
      formOpen = true;
      focusSel = '#gaToken';
      render();
    } else if (act === 'cancel-form') {
      formOpen = false;
      render();
    } else if (act === 'submit-form') addAccount();
    else if (act === 'token-page') openUrl(TOKEN_URL);
    else if (act === 'open-gh' && actEl.dataset.user) openUrl('https://github.com/' + encodeURIComponent(actEl.dataset.user));
    return;
  }
  const row = e.target.closest('.ga-row');
  if (row) switchTo(row.dataset.id);
}

function onPanelInput(e) {
  const t = e.target;
  if (t.id === 'gaToken') formVals.token = t.value;
  else if (t.id === 'gaLabel') formVals.label = t.value;
  else if (t.id === 'gaClient') formVals.clientId = t.value;
}

function onPanelKey(e) {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'gaToken' || e.target.id === 'gaLabel') {
    e.preventDefault();
    addAccount();
  } else if (e.target.id === 'gaClient') {
    e.preventDefault();
    saveClientId();
  }
}

function isOpen() {
  return !!panel && !panel.hidden;
}

function closePanel() {
  if (panel) panel.hidden = true;
}

function openPanel() {
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'ga-panel';
    panel.hidden = true;
    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('input', onPanelInput);
    panel.addEventListener('keydown', onPanelKey);
    document.body.appendChild(panel);
  }
  panel.hidden = false;
  render();
  refresh();
}

function onDocDown(e) {
  if (!isOpen()) return;
  if (e.target.closest && e.target.closest('.cf-overlay')) return;
  if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
  closePanel();
}

function onDocKey(e) {
  if (e.key !== 'Escape' || !isOpen()) return;
  if (document.querySelector('.cf-overlay')) return;
  closePanel();
}

function createButton() {
  const anchor = document.getElementById('editDocignoreBtn');
  if (!anchor || !anchor.parentElement || document.getElementById('gitAccountBtn')) return;
  btn = document.createElement('button');
  btn.id = 'gitAccountBtn';
  btn.type = 'button';
  btn.className = 'tool-btn git-account-btn';
  btn.title = 'GitHub accounts';
  btn.innerHTML = I_USER;
  btn.addEventListener('click', () => {
    if (isOpen()) closePanel();
    else openPanel();
  });
  anchor.insertAdjacentElement('afterend', btn);
}

function init() {
  injectCss();
  createButton();
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onDocKey, true);
  document.addEventListener('repo:switched', () => {
    seq++;
    refresh();
  });
  document.addEventListener('error', (ev) => {
    const t = ev.target;
    if (t && t.tagName === 'IMG' && t.closest && t.closest('.ga-av')) t.remove();
  }, true);
  window.addEventListener('resize', () => {
    if (isOpen()) position();
  });
  window.addEventListener('focus', () => {
    if (isOpen() && !busy && !login) refresh();
  });
  const auth = authApi();
  if (auth && auth.onLoginResult) auth.onLoginResult(onLoginResult);
  refresh();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}