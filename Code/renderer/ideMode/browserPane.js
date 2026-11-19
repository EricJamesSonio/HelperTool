import { esc } from './highlight.js';

const CSS_ID = 'ideBrowserCss';
const PARTITION = 'persist:ide-browser';

const SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
const I_BACK = SVG + '<path d="M9.5 3.5L5 8l4.5 4.5"/></svg>';
const I_FWD = SVG + '<path d="M6.5 3.5L11 8l-4.5 4.5"/></svg>';
const I_RELOAD = SVG + '<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2.5v3h-3"/></svg>';
const I_FULL = SVG + '<path d="M2.5 6V2.5H6"/><path d="M10 2.5h3.5V6"/><path d="M13.5 10v3.5H10"/><path d="M6 13.5H2.5V10"/></svg>';
const I_MIN = SVG + '<path d="M6 2.5V6H2.5"/><path d="M10 2.5V6h3.5"/><path d="M13.5 10H10v3.5"/><path d="M2.5 10H6v3.5"/></svg>';
const I_OPEN = SVG + '<path d="M9 2.5h4.5V7"/><path d="M13.5 2.5L7.5 8.5"/><path d="M12 9.5V13a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 3 13V5a.5.5 0 0 1 .5-.5H7"/></svg>';
const I_X = SVG + '<path d="M4 4l8 8M12 4l-8 8"/></svg>';

const TEMPLATE =
  '<div class="ide-bv-bar">' +
    '<button type="button" class="ide-bv-ico" data-bv="back" title="Back" disabled>' + I_BACK + '</button>' +
    '<button type="button" class="ide-bv-ico" data-bv="forward" title="Forward" disabled>' + I_FWD + '</button>' +
    '<button type="button" class="ide-bv-ico" data-bv="reload" title="Reload">' + I_RELOAD + '</button>' +
    '<input class="ide-bv-url" type="text" spellcheck="false" autocomplete="off" />' +
    '<span class="ide-bv-tag"></span>' +
    '<button type="button" class="ide-bv-btn" data-bv="full" title="Show the app over the whole IDE">' + I_FULL + '<span>Full screen</span></button>' +
    '<button type="button" class="ide-bv-btn" data-bv="external" title="Open in your default browser">' + I_OPEN + '<span>Open in browser</span></button>' +
    '<button type="button" class="ide-bv-ico" data-bv="close" title="Close this view">' + I_X + '</button>' +
  '</div>' +
  '<div class="ide-bv-body">' +
    '<div class="ide-bv-error" hidden></div>' +
  '</div>';

let pane = null;
let wv = null;
let refs = null;
let ready = false;
let url = '';
let full = false;
let wired = false;

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement('link');
  link.id = CSS_ID;
  link.rel = 'stylesheet';
  link.href = './styles/ide-browser.css';
  document.head.appendChild(link);
}

function hostEl() {
  if (!document.body.classList.contains('ide-mode')) return null;
  return document.querySelector('#ideMain .ide-editor');
}

function normalize(raw) {
  let v = String(raw || '').trim();
  if (!v) return '';
  if (/^\d{2,5}$/.test(v)) v = 'localhost:' + v;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'http://' + v;
  if (!/^https?:\/\//i.test(v)) return '';
  return v.replace(/^(https?:\/\/)(?:0\.0\.0\.0|\[::\])/i, '$1localhost');
}

function resetState() {
  pane = null;
  wv = null;
  refs = null;
  ready = false;
  url = '';
  full = false;
}

function swallow(p) {
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function hideError() {
  if (refs) refs.error.hidden = true;
}

function showError(target, desc) {
  if (!refs) return;
  refs.error.innerHTML =
    '<div class="ide-bv-err-title">Cannot reach the page</div>' +
    '<div class="ide-bv-err-url">' + esc(target || url) + '</div>' +
    '<div class="ide-bv-err-desc">' + esc(desc || 'The server may still be starting.') + '</div>' +
    '<button type="button" class="ide-bv-btn" data-bv="reload">Retry</button>';
  refs.error.hidden = false;
}

function setUrl(next) {
  if (!next || !refs) return;
  url = next;
  if (document.activeElement !== refs.urlIn) refs.urlIn.value = next;
}

function syncNav() {
  if (!refs || !wv) return;
  try {
    refs.back.disabled = !(ready && wv.canGoBack());
    refs.forward.disabled = !(ready && wv.canGoForward());
  } catch (_) {}
}

function load(next) {
  url = next;
  refs.urlIn.value = next;
  hideError();
  try {
    if (ready) swallow(wv.loadURL(next));
    else wv.setAttribute('src', next);
  } catch (_) {
    wv.setAttribute('src', next);
  }
}

function reload() {
  hideError();
  try {
    if (ready) wv.reload();
    else swallow(wv.loadURL(url));
  } catch (_) {
    wv.setAttribute('src', url);
  }
}

function goBack() {
  try {
    if (ready && wv.canGoBack()) wv.goBack();
  } catch (_) {}
}

function goForward() {
  try {
    if (ready && wv.canGoForward()) wv.goForward();
  } catch (_) {}
}

function setFull(on) {
  full = !!on;
  if (!pane) return;
  pane.classList.toggle('ide-bv--full', full);
  refs.full.innerHTML = (full ? I_MIN : I_FULL) + '<span>' + (full ? 'Minimize' : 'Full screen') + '</span>';
  refs.full.title = full ? 'Back to the editor area (Esc)' : 'Show the app over the whole IDE';
}

function onPaneClick(e) {
  const b = e.target.closest('[data-bv]');
  if (!b || b.disabled) return;
  const act = b.dataset.bv;
  if (act === 'back') goBack();
  else if (act === 'forward') goForward();
  else if (act === 'reload') reload();
  else if (act === 'full') setFull(!full);
  else if (act === 'external') window.electronAPI.openExternal(url);
  else if (act === 'close') close();
}

function onUrlKey(e) {
  e.stopPropagation();
  if (e.key === 'Enter') {
    e.preventDefault();
    const next = normalize(refs.urlIn.value);
    if (!next) {
      refs.urlIn.value = url;
      return;
    }
    load(next);
    refs.urlIn.blur();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    refs.urlIn.value = url;
    refs.urlIn.blur();
  }
}

function wireWebview() {
  wv.addEventListener('dom-ready', () => {
    ready = true;
    syncNav();
  });
  wv.addEventListener('did-start-loading', () => {
    if (pane) pane.classList.add('loading');
    hideError();
  });
  wv.addEventListener('did-stop-loading', () => {
    if (pane) pane.classList.remove('loading');
    syncNav();
  });
  wv.addEventListener('did-navigate', (e) => {
    setUrl(e.url);
    syncNav();
  });
  wv.addEventListener('did-navigate-in-page', (e) => {
    if (e.isMainFrame) setUrl(e.url);
    syncNav();
  });
  wv.addEventListener('page-title-updated', (e) => {
    if (refs) refs.urlIn.title = e.title || '';
  });
  wv.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || e.errorCode === -3) return;
    showError(e.validatedURL, e.errorDescription);
  });
}

function onDocClick(e) {
  if (!pane || pane.hidden || full) return;
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('.ide-tab') || t.closest('#ideSidebar .ide-row:not(.folder)') || t.closest('.ide-oe-item')) {
    hide();
  }
}

function onKey(e) {
  if (!pane || pane.hidden || !full) return;
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopPropagation();
  setFull(false);
}

function onBodyClass() {
  if (!document.body.classList.contains('ide-mode')) hide();
}

function wireGlobal() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('repo:switched', hide);
  new MutationObserver(onBodyClass).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function build(host, firstUrl) {
  ensureCss();
  pane = document.createElement('div');
  pane.className = 'ide-browser';
  pane.innerHTML = TEMPLATE;
  host.appendChild(pane);
  refs = {
    back: pane.querySelector('[data-bv="back"]'),
    forward: pane.querySelector('[data-bv="forward"]'),
    urlIn: pane.querySelector('.ide-bv-url'),
    tag: pane.querySelector('.ide-bv-tag'),
    full: pane.querySelector('[data-bv="full"]'),
    body: pane.querySelector('.ide-bv-body'),
    error: pane.querySelector('.ide-bv-error'),
  };
  url = firstUrl;
  ready = false;
  refs.urlIn.value = firstUrl;
  wv = document.createElement('webview');
  wv.className = 'ide-bv-view';
  wv.setAttribute('partition', PARTITION);
  wv.setAttribute('src', firstUrl);
  refs.body.appendChild(wv);
  wireWebview();
  pane.addEventListener('click', onPaneClick);
  refs.urlIn.addEventListener('keydown', onUrlKey);
  wireGlobal();
}

export function show(opts) {
  const o = opts || {};
  const next = normalize(o.url);
  const host = hostEl();
  if (!next || !host) return false;
  if (pane && !pane.isConnected) resetState();
  if (!pane) build(host, next);
  else if (next !== url) load(next);
  if (typeof o.title === 'string') refs.tag.textContent = o.title;
  pane.hidden = false;
  return true;
}

export function hide() {
  if (!pane) return;
  setFull(false);
  pane.hidden = true;
}

export function close() {
  if (pane) pane.remove();
  resetState();
}

export function isOpen() {
  return !!pane && !pane.hidden;
}

export function isFullscreen() {
  return !!pane && !pane.hidden && full;
}