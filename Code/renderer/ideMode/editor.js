import { highlightRange, langFor, langLabel, esc, pathKey } from './highlight.js';
import { fileIcon } from './fileIcons.js';
import * as diffPane from './diffPane.js';
import * as minimap from './minimap.js';
import * as mediaViewer from './mediaViewer.js';
import { state } from '../app_manager/appState.js';
import { confirmDialog } from '../utils/confirmDialog.js';

const LH = 20;
const PAD = 8;
const BUF = 25;
const MAX_CHARS = 2000000;
const MAX_MATCHES = 10000;
const PULSE_MS = 2000;
const SESS_KEY = 'helpertool-ide-session:';
const SAVE_GAP = 600;
const BINARY_EXT = new Set('png jpg jpeg gif webp bmp ico icns pdf zip gz tgz rar 7z exe dll so dylib node wasm mp3 mp4 mov avi mkv webm woff woff2 ttf otf eot db sqlite bin class jar'.split(' '));

const FS = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
const I_UP = FS + '<path d="M3.5 10L8 5.5 12.5 10"/></svg>';
const I_DOWN = FS + '<path d="M3.5 6L8 10.5 12.5 6"/></svg>';
const I_X = FS + '<path d="M4 4l8 8M12 4l-8 8"/></svg>';
const I_CHEV = FS + '<path d="M6 3.5L10.5 8 6 12.5"/></svg>';

const TEMPLATE =
'<div class="ide-tabs"></div>' +
'<div class="ide-crumbs"></div>' +
'<div class="ide-editor">' +
  '<div class="ide-welcome">' +
    '<div class="ide-welcome-home">' +
      '<div class="ide-welcome-logo">&lt;/&gt;</div>' +
      '<div class="ide-welcome-title">Helper Tool IDE</div>' +
      '<div class="ide-welcome-msg">Open a file from the explorer to start editing.</div>' +
      '<div class="ide-welcome-grid">' +
        '<div class="ide-wk"><span>Save file</span><span class="ide-wk-keys"><kbd>Ctrl</kbd><kbd>S</kbd></span></div>' +
        '<div class="ide-wk"><span>Find in file</span><span class="ide-wk-keys"><kbd>Ctrl</kbd><kbd>F</kbd></span></div>' +
        '<div class="ide-wk"><span>Replace in file</span><span class="ide-wk-keys"><kbd>Ctrl</kbd><kbd>H</kbd></span></div>' +
        '<div class="ide-wk"><span>Search codebase</span><span class="ide-wk-keys"><kbd>F2</kbd></span></div>' +
        '<div class="ide-wk"><span>Close tab</span><span class="ide-wk-keys"><kbd>Ctrl</kbd><kbd>W</kbd></span></div>' +
      '</div>' +
      '<div class="ide-welcome-foot">Images, video, audio and PDF files open right here too.</div>' +
    '</div>' +
    '<div class="ide-notice" hidden></div>' +
  '</div>' +
  '<div class="ide-find" hidden>' +
    '<button type="button" class="ide-find-btn ide-find-tog" data-f="toggle" title="Toggle Replace (Ctrl+H)">' + I_CHEV + '</button>' +
    '<div class="ide-find-rows">' +
      '<div class="ide-find-row">' +
        '<input class="ide-find-in" type="text" placeholder="Find" spellcheck="false" autocomplete="off" />' +
        '<button type="button" class="ide-find-btn ide-find-cs" data-f="case" title="Match Case (Alt+C)">Aa</button>' +
        '<span class="ide-find-count"></span>' +
        '<button type="button" class="ide-find-btn" data-f="prev" title="Previous Match (Shift+Enter)">' + I_UP + '</button>' +
        '<button type="button" class="ide-find-btn" data-f="next" title="Next Match (Enter)">' + I_DOWN + '</button>' +
        '<button type="button" class="ide-find-btn" data-f="close" title="Close (Escape)">' + I_X + '</button>' +
      '</div>' +
      '<div class="ide-find-row ide-find-rrow" hidden>' +
        '<input class="ide-find-in ide-rep-in" type="text" placeholder="Replace" spellcheck="false" autocomplete="off" />' +
        '<button type="button" class="ide-find-btn ide-find-txt" data-f="replace" title="Replace (Enter)">Replace</button>' +
        '<button type="button" class="ide-find-btn ide-find-txt" data-f="replaceall" title="Replace All (Ctrl+Alt+Enter)">All</button>' +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div class="ide-dv" hidden></div>' +
  '<div class="ide-media" hidden></div>' +
  '<div class="ide-codewrap" hidden>' +
    '<div class="ide-gutter"><pre class="ide-gutter-inner"></pre></div>' +
    '<div class="ide-code">' +
      '<div class="ide-find-layer"><pre class="ide-find-inner"></pre></div>' +
      '<div class="ide-hl"><pre class="ide-hl-inner"></pre></div>' +
      '<textarea class="ide-ta" wrap="off" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off"></textarea>' +
    '</div>' +
    '<div class="ide-minimap"></div>' +
  '</div>' +
'</div>' +
'<div class="ide-status">' +
  '<span class="ide-st-msg"></span>' +
  '<span class="ide-st-spacer"></span>' +
  '<span class="ide-st-item ide-st-pos"></span>' +
  '<span class="ide-st-item">Spaces: 2</span>' +
  '<span class="ide-st-item">UTF-8</span>' +
  '<span class="ide-st-item ide-st-eol"></span>' +
  '<span class="ide-st-item ide-st-lang"></span>' +
'</div>';

let tabs = [];
let activePath = null;
let els = null;
let onChange = null;
let lang = 'plain';
let lines = [''];
let textChanged = true;
let tabSwitched = false;
let rendered = { from: -1, to: -1 };
let rafId = 0;
let cursorRaf = 0;
let flashTimer = 0;
let charW = 0;
let pulse = null;
let pulseTimer = 0;
let sessRepo = null;
let suspendSave = false;
let saveTimer = 0;
let find = { open: false, repOpen: false, q: '', cs: false, matches: [], idx: -1, byLine: new Map() };

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function normRepo(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function activeTab() {
  return tabs.find((t) => t.path === activePath) || null;
}

function isText(tab) {
  return !!tab && !tab.kind && !tab.media && !tab.loading && !tab.notice;
}

function makeTab(path, name, media) {
  return {
    path,
    key: pathKey(path),
    name,
    media,
    content: '',
    saved: '',
    eol: '\n',
    dirty: false,
    loading: !media,
    notice: null,
    scrollTop: 0,
    scrollLeft: 0,
    selStart: 0,
    selEnd: 0,
  };
}

function notify() {
  if (!suspendSave) scheduleSave();
  if (!onChange) return;
  const list = tabs.filter((t) => !t.kind).map((t) => ({ path: t.path, name: t.name, dirty: !!t.dirty }));
  const act = activeTab();
  const actPath = act ? (act.kind ? act.filePath : act.path) : null;
  onChange(list, actPath);
}

function schedule() {
  if (!rafId) rafId = requestAnimationFrame(render);
}

function scheduleCursor() {
  if (!cursorRaf) cursorRaf = requestAnimationFrame(updateCursor);
}

function invalidate() {
  rendered.from = -1;
  rendered.to = -1;
  schedule();
}

function flash(msg) {
  els.msg.textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { els.msg.textContent = ''; }, 2000);
}

function scheduleSave() {
  if (suspendSave || !sessRepo) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, SAVE_GAP);
}

function persistNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (suspendSave || !els || !sessRepo) return;
  saveViewState();
  const list = tabs.filter((t) => !t.kind).map((t) => ({
    path: t.path,
    scrollTop: t.scrollTop || 0,
    scrollLeft: t.scrollLeft || 0,
    selStart: t.selStart || 0,
    selEnd: t.selEnd || 0,
  }));
  const act = activeTab();
  const payload = { v: 1, active: act ? (act.kind ? act.filePath : act.path) : null, tabs: list };
  try {
    localStorage.setItem(SESS_KEY + sessRepo, JSON.stringify(payload));
  } catch (_) {}
}

function relParts(p) {
  const n = p.replace(/\\/g, '/');
  const r = (state.selectedRepoPath || '').replace(/\\/g, '/');
  const rel = r && n.toLowerCase().indexOf(r.toLowerCase() + '/') === 0 ? n.slice(r.length + 1) : n;
  return rel.split('/').filter(Boolean);
}

function lineStartsOf(text) {
  const a = [0];
  let i = -1;
  for (;;) {
    i = text.indexOf('\n', i + 1);
    if (i === -1) break;
    a.push(i + 1);
  }
  return a;
}

function charWidth() {
  if (charW) return charW;
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = '13px ' + (getComputedStyle(els.ta).fontFamily || 'monospace');
  charW = ctx.measureText('MMMMMMMMMM').width / 10 || 7.8;
  return charW;
}

function renderCrumbs(tab) {
  if (!tab) {
    els.crumbs.innerHTML = '';
    return;
  }
  els.crumbs.innerHTML = relParts(tab.filePath || tab.path)
    .map((part, i, arr) => '<span class="ide-crumb' + (i === arr.length - 1 ? ' last' : '') + '">' + esc(part) + '</span>')
    .join('<span class="ide-crumb-sep"></span>');
}

function tabIcon(t) {
  if (t.kind === 'diff') return '<span class="ide-fi" style="color:var(--accent)">+-</span>';
  if (t.kind === 'view') return '<span class="ide-fi" style="color:var(--purple)">@</span>';
  return fileIcon(t.name);
}

function renderTabs() {
  const counts = new Map();
  for (const t of tabs) {
    if (!t.kind) counts.set(t.name, (counts.get(t.name) || 0) + 1);
  }
  els.tabs.innerHTML = tabs.map((t) => {
    let dir = '';
    if (!t.kind && counts.get(t.name) > 1) {
      const parts = relParts(t.path);
      if (parts.length > 1) dir = '<span class="ide-tab-dir">' + esc(parts[parts.length - 2]) + '</span>';
    }
    const title = t.kind ? t.filePath + (t.kind === 'diff' ? ' (diff)' : ' (history)') : t.path;
    return '<div class="ide-tab' + (t.path === activePath ? ' active' : '') + (t.kind ? ' ide-tab-pane' : '') + '" data-path="' + attr(t.path) + '" title="' + attr(title) + '">' +
      tabIcon(t) +
      '<span class="ide-tab-name">' + esc(t.name) + '</span>' +
      dir +
      '<span class="ide-tab-x' + (t.dirty ? ' dirty' : '') + '"></span>' +
    '</div>';
  }).join('');
  const a = els.tabs.querySelector('.ide-tab.active');
  if (a) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function syncTransform() {
  const ta = els.ta;
  const y = Math.max(0, rendered.from) * LH + PAD - ta.scrollTop;
  const tr = 'translate(' + (-ta.scrollLeft) + 'px,' + y + 'px)';
  els.hlInner.style.transform = tr;
  els.findInner.style.transform = tr;
  els.gutterInner.style.transform = 'translateY(' + y + 'px)';
}

function clearPulse() {
  clearTimeout(pulseTimer);
  pulseTimer = 0;
  pulse = null;
}

function startPulse(line, col, len) {
  clearPulse();
  if (!len) return;
  pulse = { line, col, len, t0: Date.now() };
  pulseTimer = setTimeout(() => {
    pulseTimer = 0;
    pulse = null;
    invalidate();
  }, PULSE_MS);
  invalidate();
}

function computeMatches(src) {
  const m = [];
  const byLine = new Map();
  if (find.open && find.q) {
    const q = find.cs ? find.q : find.q.toLowerCase();
    for (let i = 0; i < src.length && m.length < MAX_MATCHES; i++) {
      const hay = find.cs ? src[i] : src[i].toLowerCase();
      let p = hay.indexOf(q);
      while (p !== -1 && m.length < MAX_MATCHES) {
        const hit = { line: i, col: p };
        m.push(hit);
        let arr = byLine.get(i);
        if (!arr) {
          arr = [];
          byLine.set(i, arr);
        }
        arr.push(hit);
        p = hay.indexOf(q, p + Math.max(1, q.length));
      }
    }
  }
  find.matches = m;
  find.byLine = byLine;
  if (!m.length) find.idx = -1;
  else if (find.idx >= m.length) find.idx = m.length - 1;
  else if (find.idx < 0) find.idx = 0;
  updateFindCount();
}

function overlayHtml(from, to) {
  const flen = find.open ? find.q.length : 0;
  const cur = find.matches[find.idx];
  const parts = [];
  for (let i = from; i <= to; i++) {
    const line = lines[i];
    const ranges = [];
    if (pulse && pulse.line === i && pulse.col < line.length) {
      const elapsed = Math.min(PULSE_MS, Date.now() - pulse.t0);
      ranges.push({
        s: pulse.col,
        e: Math.min(line.length, pulse.col + pulse.len),
        cls: 'ide-pulse',
        st: ' style="animation-delay:-' + elapsed + 'ms"',
      });
    }
    const hits = flen ? find.byLine.get(i) : null;
    if (hits) {
      for (const h of hits) {
        ranges.push({ s: h.col, e: h.col + flen, cls: 'ide-fm' + (h === cur ? ' cur' : ''), st: '' });
      }
    }
    if (!ranges.length) {
      parts.push(esc(line));
      continue;
    }
    ranges.sort((a, b) => a.s - b.s);
    let out = '';
    let pos = 0;
    for (const r of ranges) {
      if (r.s < pos) continue;
      out += esc(line.slice(pos, r.s));
      out += '<span class="' + r.cls + '"' + r.st + '>' + esc(line.slice(r.s, r.e)) + '</span>';
      pos = r.e;
    }
    out += esc(line.slice(pos));
    parts.push(out);
  }
  return parts.join('\n');
}

function updateFindCount() {
  const n = find.matches.length;
  let label = '';
  if (find.q) label = n ? (find.idx + 1) + ' of ' + n + (n >= MAX_MATCHES ? '+' : '') : 'No results';
  els.findCount.textContent = label;
  els.find.classList.toggle('empty', !!find.q && !n);
}

function render() {
  rafId = 0;
  const tab = activeTab();
  if (!tab || tab.kind || tab.media || tab.loading || tab.notice || els.codewrap.hidden) return;
  const ta = els.ta;
  let forced = false;
  if (textChanged) {
    textChanged = false;
    forced = true;
    const text = ta.value;
    tab.content = text;
    const d = text !== tab.saved;
    if (d !== tab.dirty) {
      tab.dirty = d;
      renderTabs();
      notify();
    }
    lines = text.split('\n');
    minimap.setContent(lines, lang, tabSwitched);
    tabSwitched = false;
    els.codewrap.style.setProperty('--digits', String(Math.max(3, String(lines.length).length)));
    if (find.open) computeMatches(lines);
  }
  const top = ta.scrollTop;
  const h = ta.clientHeight || 600;
  const last = lines.length - 1;
  const vFrom = Math.max(0, Math.floor((top - PAD) / LH));
  const vTo = Math.min(last, Math.ceil((top + h - PAD) / LH));
  if (forced || vFrom < rendered.from || vTo > rendered.to) {
    const from = Math.max(0, vFrom - BUF);
    const to = Math.min(last, vTo + BUF);
    els.hlInner.innerHTML = highlightRange(lines, from, to, lang);
    const wantOverlay = (find.open && !!find.q) || !!pulse;
    els.findInner.innerHTML = wantOverlay ? overlayHtml(from, to) : '';
    let nums = '';
    for (let i = from; i <= to; i++) nums += (i + 1) + (i < to ? '\n' : '');
    els.gutterInner.textContent = nums;
    rendered.from = from;
    rendered.to = to;
  }
  syncTransform();
}

function updateCursor() {
  cursorRaf = 0;
  scheduleSave();
  const tab = activeTab();
  if (!tab || tab.kind || tab.media || tab.loading || tab.notice) {
    if (!tab || !tab.media) els.pos.textContent = '';
    return;
  }
  const ta = els.ta;
  const v = ta.value;
  const pos = ta.selectionStart;
  let line = 1;
  let idx = -1;
  for (;;) {
    idx = v.indexOf('\n', idx + 1);
    if (idx === -1 || idx >= pos) break;
    line++;
  }
  const ls = pos === 0 ? 0 : v.lastIndexOf('\n', pos - 1) + 1;
  const sel = ta.selectionEnd - pos;
  els.pos.textContent = 'Ln ' + line + ', Col ' + (pos - ls + 1) + (sel > 0 ? ' (' + sel + ' selected)' : '');
}

function updateStatus(tab) {
  if (tab && tab.media) {
    els.lang.textContent = mediaViewer.labelFor(tab.media);
    els.eol.textContent = '';
    els.pos.textContent = '';
    return;
  }
  els.lang.textContent = tab ? langLabel(tab.fileName || tab.name) : '';
  els.eol.textContent = tab && !tab.kind && !tab.notice && !tab.loading ? (tab.eol === '\r\n' ? 'CRLF' : 'LF') : '';
  if (!tab || tab.kind || tab.notice || tab.loading) els.pos.textContent = '';
}

function saveViewState() {
  const cur = activeTab();
  if (!cur || cur.kind || cur.media || cur.loading || cur.notice) return;
  cur.content = els.ta.value;
  cur.dirty = cur.content !== cur.saved;
  cur.scrollTop = els.ta.scrollTop;
  cur.scrollLeft = els.ta.scrollLeft;
  cur.selStart = els.ta.selectionStart;
  cur.selEnd = els.ta.selectionEnd;
}

function showTab(tab) {
  clearPulse();
  const isPane = !!tab && !!tab.kind;
  const isMedia = !!tab && !isPane && !!tab.media;
  const showCode = !!tab && !isPane && !isMedia && !tab.loading && !tab.notice;
  els.codewrap.hidden = !showCode;
  els.dv.hidden = !isPane;
  els.media.hidden = !isMedia;
  els.welcome.hidden = showCode || isPane || isMedia;
  els.home.hidden = !!tab;
  els.notice.hidden = !tab || isPane || isMedia;
  if (!isPane) diffPane.hide();
  if (!isMedia) mediaViewer.hide();
  if (tab && !showCode && !isPane && !isMedia) els.notice.textContent = tab.loading ? 'Loading...' : tab.notice;
  renderCrumbs(tab);
  if (isPane) {
    closeFind(true);
    diffPane.show(tab);
    updateStatus(tab);
    return;
  }
  if (isMedia) {
    closeFind(true);
    updateStatus(tab);
    mediaViewer.show({ path: tab.path, name: tab.name, kind: tab.media });
    return;
  }
  if (!showCode) {
    closeFind(true);
    updateStatus(tab);
    return;
  }
  lang = langFor(tab.name);
  els.hlInner.dataset.lang = lang;
  els.ta.value = tab.content;
  textChanged = true;
  tabSwitched = true;
  rendered.from = -1;
  rendered.to = -1;
  els.ta.scrollTop = tab.scrollTop;
  els.ta.scrollLeft = tab.scrollLeft;
  try { els.ta.setSelectionRange(tab.selStart, tab.selEnd); } catch (_) {}
  render();
  els.ta.focus({ preventScroll: true });
  updateStatus(tab);
  scheduleCursor();
}

function activate(path) {
  const tab = tabs.find((t) => t.path === path);
  if (!tab) return;
  if (path === activePath) {
    if (isText(tab)) els.ta.focus({ preventScroll: true });
    return;
  }
  saveViewState();
  activePath = path;
  showTab(tab);
  renderTabs();
  notify();
}

async function loadTab(tab) {
  const ext = tab.name.split('.').pop().toLowerCase();
  if (BINARY_EXT.has(ext)) {
    tab.notice = 'Binary file - preview is not available.';
  } else {
    try {
      const res = await window.electronAPI.readFile(tab.path);
      if (!res || !res.success) {
        tab.notice = 'Cannot open file: ' + ((res && res.error) || 'unknown error');
      } else if (res.content.length > MAX_CHARS) {
        tab.notice = 'File is too large for the built-in editor (' + Math.round(res.content.length / 1024) + ' KB).';
      } else if (res.content.indexOf('\u0000') !== -1) {
        tab.notice = 'Binary file - preview is not available.';
      } else {
        tab.eol = res.content.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
        tab.content = tab.eol === '\r\n' ? res.content.replace(/\r\n/g, '\n') : res.content;
        tab.saved = tab.content;
      }
    } catch (err) {
      tab.notice = 'Cannot open file: ' + (err && err.message ? err.message : String(err));
    }
  }
  tab.loading = false;
  if (tabs.includes(tab) && activePath === tab.path) showTab(tab);
}

export async function openFile(path) {
  if (!els || !path) return;
  const key = pathKey(path);
  let tab = tabs.find((t) => t.key === key);
  if (tab) {
    activate(tab.path);
    return;
  }
  const name = path.split(/[\\/]/).pop();
  const media = mediaViewer.mediaKind(name);
  tab = makeTab(path, name, media);
  tabs.push(tab);
  activate(tab.path);
  if (!media) await loadTab(tab);
}

function openPane(kind, spec) {
  if (!els || !spec || !spec.filePath) return;
  const fileName = String(spec.filePath).split(/[\\/]/).pop();
  const key = kind + '|' + (spec.leftHash || '') + '|' + (spec.rightHash || '') + '|' + pathKey(spec.filePath);
  let tab = tabs.find((t) => t.key === key);
  if (tab) {
    activate(tab.path);
    return;
  }
  const short = String(spec.rightHash || '').slice(0, 7);
  const name = kind === 'diff' ? fileName + ' (' + short + ')' : fileName + ' @ ' + short;
  tab = {
    path: key,
    key,
    kind,
    spec,
    filePath: spec.filePath,
    fileName,
    name,
    dirty: false,
    content: '',
    saved: '',
    eol: '\n',
    loading: false,
    notice: null,
    scrollTop: 0,
    scrollLeft: 0,
    selStart: 0,
    selEnd: 0,
  };
  tabs.push(tab);
  activate(tab.path);
}

export function openDiff(spec) {
  openPane('diff', spec);
}

export function openView(spec) {
  openPane('view', spec);
}

export async function openAt(path, line, col, len) {
  await openFile(path);
  const tab = activeTab();
  if (!tab || tab.kind || tab.media || tab.key !== pathKey(path) || tab.loading || tab.notice) return;
  const ta = els.ta;
  const starts = lineStartsOf(ta.value);
  const ln = Math.min(Math.max(1, line || 1), starts.length) - 1;
  const c = Math.max(0, col || 0);
  const l = Math.max(0, len || 0);
  const off = starts[ln] + c;
  try { ta.setSelectionRange(off, off); } catch (_) {}
  revealMatch(ln, c, l, true);
  startPulse(ln, c, l);
  ta.focus({ preventScroll: true });
  invalidate();
  scheduleCursor();
}

export async function closeTab(path) {
  const key = pathKey(path);
  const i = tabs.findIndex((t) => t.key === key);
  if (i < 0) return;
  const tab = tabs[i];
  if (tab.path === activePath) saveViewState();
  if (tab.dirty) {
    const ok = await confirmDialog('Discard unsaved changes to <b>' + esc(tab.name) + '</b>?');
    if (!ok) return;
  }
  const idx = tabs.indexOf(tab);
  if (idx < 0) return;
  tabs.splice(idx, 1);
  if (activePath === tab.path) {
    const next = tabs[idx] || tabs[idx - 1] || null;
    activePath = null;
    if (next) {
      activate(next.path);
    } else {
      showTab(null);
      renderTabs();
      notify();
    }
  } else {
    renderTabs();
    notify();
  }
}

export function resetTabs() {
  if (!els) return;
  closeFind(true);
  clearPulse();
  tabs = [];
  activePath = null;
  els.ta.value = '';
  lines = [''];
  textChanged = true;
  rendered.from = -1;
  rendered.to = -1;
  showTab(null);
  renderTabs();
  notify();
}

export async function clearAll() {
  if (!els || !tabs.length) return;
  saveViewState();
  const dirty = tabs.filter((t) => t.dirty);
  if (dirty.length) {
    const ok = await confirmDialog('Discard unsaved changes in <b>' + dirty.length + '</b> file(s) and close all open files?');
    if (!ok) return;
  }
  resetTabs();
}

export function getSelectedText() {
  if (!els || els.codewrap.hidden) return '';
  const ta = els.ta;
  const s = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  return s && s.indexOf('\n') === -1 && s.length <= 120 ? s.trim() : '';
}

export function isDirty(path) {
  const key = pathKey(path);
  const tab = tabs.find((t) => t.key === key);
  if (!tab || tab.kind) return false;
  if (tab.path === activePath && isText(tab)) return els.ta.value !== tab.saved;
  return !!tab.dirty;
}

export async function reloadFromDisk(path) {
  if (!els || !path) return;
  const key = pathKey(path);
  const tab = tabs.find((t) => t.key === key);
  if (!isText(tab)) return;
  if (isDirty(path)) return;
  let res = null;
  try {
    res = await window.electronAPI.readFile(tab.path);
  } catch (_) {
    res = null;
  }
  if (!res || !res.success || typeof res.content !== 'string') return;
  if (isDirty(path)) return;
  const eol = res.content.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  const content = eol === '\r\n' ? res.content.replace(/\r\n/g, '\n') : res.content;
  if (content === tab.saved) return;
  const isActive = tab.path === activePath;
  if (isActive) saveViewState();
  tab.eol = eol;
  tab.content = content;
  tab.saved = content;
  tab.dirty = false;
  if (isActive) showTab(tab);
  renderTabs();
  notify();
}

async function restoreTabs(data) {
  const created = [];
  for (const st of data.tabs.slice(0, 40)) {
    if (!st || typeof st.path !== 'string') continue;
    const key = pathKey(st.path);
    if (tabs.some((t) => t.key === key)) continue;
    const name = st.path.split(/[\\/]/).pop();
    const tab = makeTab(st.path, name, mediaViewer.mediaKind(name));
    tab.scrollTop = Number(st.scrollTop) || 0;
    tab.scrollLeft = Number(st.scrollLeft) || 0;
    tab.selStart = Number(st.selStart) || 0;
    tab.selEnd = Number(st.selEnd) || 0;
    tabs.push(tab);
    created.push(tab);
  }
  if (!created.length) return;
  const want = data.active ? pathKey(data.active) : '';
  const first = tabs.find((t) => t.key === want) || created[created.length - 1];
  activate(first.path);
  await Promise.all(created.filter((t) => !t.media).map(loadTab));
  const dead = created.filter((t) => t.notice && t.notice.indexOf('Cannot open file') === 0);
  if (!dead.length) return;
  for (const t of dead) {
    const i = tabs.indexOf(t);
    if (i >= 0) tabs.splice(i, 1);
  }
  if (!tabs.some((t) => t.path === activePath)) {
    activePath = null;
    const next = tabs[tabs.length - 1];
    if (next) {
      activate(next.path);
    } else {
      showTab(null);
      renderTabs();
      notify();
    }
  } else {
    renderTabs();
    notify();
  }
}

export async function restoreSession() {
  if (!els) return;
  const repo = state.selectedRepoPath;
  sessRepo = repo ? normRepo(repo) : null;
  if (!sessRepo || tabs.length) return;
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SESS_KEY + sessRepo) || 'null');
  } catch (_) {
    data = null;
  }
  if (!data || !Array.isArray(data.tabs) || !data.tabs.length) return;
  suspendSave = true;
  try {
    await restoreTabs(data);
  } finally {
    suspendSave = false;
    scheduleSave();
  }
}

export async function switchRepo() {
  if (!els) return;
  persistNow();
  suspendSave = true;
  try {
    resetTabs();
  } finally {
    suspendSave = false;
  }
  await restoreSession();
}

async function save() {
  const tab = activeTab();
  if (!isText(tab)) return;
  const text = els.ta.value;
  const out = tab.eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
  let res;
  try {
    res = await window.electronAPI.writeFile(tab.path, out);
  } catch (err) {
    res = { success: false, error: err && err.message ? err.message : String(err) };
  }
  if (res && res.success) {
    tab.content = text;
    tab.saved = text;
    tab.dirty = false;
    textChanged = true;
    renderTabs();
    notify();
    schedule();
    flash('Saved ' + tab.name);
  } else {
    flash('Save failed: ' + ((res && res.error) || 'unknown error'));
  }
}

function revealMatch(line, col, len, center) {
  const ta = els.ta;
  const h = ta.clientHeight || 600;
  const y = line * LH + PAD;
  if (center || y < ta.scrollTop + LH || y + LH > ta.scrollTop + h - LH) {
    ta.scrollTop = Math.max(0, y - Math.floor(h / 2));
  }
  const cw = charWidth();
  const x = col * cw;
  const w = ta.clientWidth || 800;
  if (x < ta.scrollLeft || x + len * cw > ta.scrollLeft + w - 60) {
    ta.scrollLeft = Math.max(0, x - 80);
  }
  syncTransform();
  schedule();
}

function jumpToCurrent() {
  const hit = find.matches[find.idx];
  if (!hit) {
    invalidate();
    return;
  }
  const text = els.ta.value;
  const starts = lineStartsOf(text);
  const off = starts[hit.line] + hit.col;
  try { els.ta.setSelectionRange(off, off + find.q.length); } catch (_) {}
  revealMatch(hit.line, hit.col, find.q.length, false);
  invalidate();
  scheduleCursor();
}

function stepMatch(dir) {
  if (!find.open || !find.matches.length) return;
  find.idx = (find.idx + dir + find.matches.length) % find.matches.length;
  updateFindCount();
  jumpToCurrent();
}

function runFind(fromCursor) {
  const text = els.ta.value;
  find.q = els.findIn.value;
  computeMatches(text.split('\n'));
  if (!find.matches.length) {
    updateFindCount();
    invalidate();
    return;
  }
  let pick = 0;
  if (fromCursor) {
    const starts = lineStartsOf(text);
    const pos = els.ta.selectionStart;
    for (let i = 0; i < find.matches.length; i++) {
      const h = find.matches[i];
      if (starts[h.line] + h.col >= pos) {
        pick = i;
        break;
      }
    }
  }
  find.idx = pick;
  updateFindCount();
  jumpToCurrent();
}

function setRepOpen(on) {
  find.repOpen = !!on;
  els.repRow.hidden = !on;
  els.findTog.classList.toggle('open', !!on);
}

function openFind(withReplace) {
  const tab = activeTab();
  if (!isText(tab) || els.codewrap.hidden) return;
  const ta = els.ta;
  const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  if (sel && sel.indexOf('\n') === -1 && sel.length <= 200) els.findIn.value = sel;
  find.open = true;
  els.find.hidden = false;
  if (withReplace) setRepOpen(true);
  els.findIn.focus();
  els.findIn.select();
  runFind(true);
}

function closeFind(silent) {
  if (!els) return;
  const was = find.open;
  find.open = false;
  find.matches = [];
  find.byLine = new Map();
  find.idx = -1;
  els.find.hidden = true;
  if (was) invalidate();
  if (!silent && !els.codewrap.hidden) els.ta.focus({ preventScroll: true });
}

function toggleCase() {
  find.cs = !find.cs;
  els.findCs.classList.toggle('on', find.cs);
  runFind(true);
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceOne() {
  const tab = activeTab();
  if (!isText(tab) || !find.q) return;
  if (!find.matches.length) {
    runFind(true);
    return;
  }
  const hit = find.matches[find.idx];
  if (!hit) return;
  const text = els.ta.value;
  const starts = lineStartsOf(text);
  const off = starts[hit.line] + hit.col;
  const seg = text.slice(off, off + find.q.length);
  const same = find.cs ? seg === find.q : seg.toLowerCase() === find.q.toLowerCase();
  if (!same) {
    runFind(true);
    return;
  }
  const keep = document.activeElement;
  try { els.ta.setSelectionRange(off, off + find.q.length); } catch (_) {}
  exec(els.repIn.value);
  if (keep && keep !== els.ta && typeof keep.focus === 'function') keep.focus();
  runFind(true);
}

function replaceAll() {
  const tab = activeTab();
  if (!isText(tab) || !find.q) return;
  const ta = els.ta;
  const text = ta.value;
  const rep = els.repIn.value;
  const re = new RegExp(escRe(find.q), find.cs ? 'g' : 'gi');
  let n = 0;
  const out = text.replace(re, () => {
    n++;
    return rep;
  });
  if (!n) {
    flash('No results to replace');
    return;
  }
  const keep = document.activeElement;
  const st = ta.scrollTop;
  const sl = ta.scrollLeft;
  const caret = ta.selectionStart;
  try { ta.setSelectionRange(0, text.length); } catch (_) {}
  exec(out);
  ta.scrollTop = st;
  ta.scrollLeft = sl;
  try { ta.setSelectionRange(Math.min(caret, out.length), Math.min(caret, out.length)); } catch (_) {}
  if (keep && keep !== ta && typeof keep.focus === 'function') keep.focus();
  runFind(true);
  flash('Replaced ' + n + ' occurrence' + (n === 1 ? '' : 's'));
}

function onFindKey(e) {
  e.stopPropagation();
  const key = e.key;
  const mod = e.ctrlKey || e.metaKey;
  const inRep = e.target === els.repIn;
  if (mod && e.altKey && key === 'Enter') {
    e.preventDefault();
    replaceAll();
    return;
  }
  if (key === 'Enter' || key === 'F3') {
    e.preventDefault();
    if (inRep && key === 'Enter') {
      replaceOne();
      return;
    }
    stepMatch(e.shiftKey ? -1 : 1);
    return;
  }
  if (key === 'Escape') {
    e.preventDefault();
    closeFind(false);
    return;
  }
  if (e.altKey && key.toLowerCase() === 'c') {
    e.preventDefault();
    toggleCase();
    return;
  }
  if (mod && key.toLowerCase() === 'f') {
    e.preventDefault();
    els.findIn.focus();
    els.findIn.select();
    return;
  }
  if (mod && !e.shiftKey && key.toLowerCase() === 'h') {
    e.preventDefault();
    setRepOpen(true);
    els.repIn.focus();
    els.repIn.select();
    return;
  }
  if (mod && !e.shiftKey && key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
}

function onFindClick(e) {
  const btn = e.target.closest('.ide-find-btn');
  if (!btn) return;
  const f = btn.dataset.f;
  if (f === 'next') stepMatch(1);
  else if (f === 'prev') stepMatch(-1);
  else if (f === 'close') closeFind(false);
  else if (f === 'case') toggleCase();
  else if (f === 'toggle') setRepOpen(!find.repOpen);
  else if (f === 'replace') replaceOne();
  else if (f === 'replaceall') replaceAll();
}

function exec(text) {
  els.ta.focus();
  document.execCommand('insertText', false, text);
}

function indent(outdent) {
  const ta = els.ta;
  const v = ta.value;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  if (s === e && !outdent) {
    exec('  ');
    return;
  }
  const bs = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
  const eEff = e > s && v[e - 1] === '\n' ? e - 1 : e;
  let be = v.indexOf('\n', eEff);
  if (be === -1) be = v.length;
  const block = v.slice(bs, be);
  const out = block.split('\n').map((l) => (outdent ? l.replace(/^ {1,2}|^\t/, '') : '  ' + l)).join('\n');
  ta.setSelectionRange(bs, be);
  exec(out);
  ta.setSelectionRange(bs, bs + out.length);
}

function onKeyDown(e) {
  if (e.isComposing) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && !e.shiftKey && key === 's') {
    e.preventDefault();
    e.stopPropagation();
    save();
    return;
  }
  if (mod && !e.shiftKey && key === 'w') {
    e.preventDefault();
    e.stopPropagation();
    if (activePath) closeTab(activePath);
    return;
  }
  if (e.key === 'Escape' && find.open) {
    e.preventDefault();
    e.stopPropagation();
    closeFind(false);
    return;
  }
  if (e.key === 'F3' && find.open) {
    e.preventDefault();
    e.stopPropagation();
    stepMatch(e.shiftKey ? -1 : 1);
    return;
  }
  if (!mod && !e.altKey) e.stopPropagation();
  if (mod || e.altKey) return;
  if (e.key === 'Tab') {
    e.preventDefault();
    indent(e.shiftKey);
    return;
  }
  if (e.key === 'Enter') {
    const ta = els.ta;
    const v = ta.value;
    const s = ta.selectionStart;
    const ls = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
    const before = v.slice(ls, s);
    const lead = /^[ \t]*/.exec(before)[0];
    const opener = lang === 'py' ? /[{(\[:]\s*$/ : /[{(\[]\s*$/;
    const extra = opener.test(before) ? '  ' : '';
    e.preventDefault();
    exec('\n' + lead + extra);
  }
}

function onMainKeyDown(e) {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey || e.shiftKey) return;
  const key = e.key.toLowerCase();
  if (key === 'f') {
    e.preventDefault();
    e.stopPropagation();
    openFind(false);
    return;
  }
  if (key === 'h') {
    e.preventDefault();
    e.stopPropagation();
    openFind(true);
    return;
  }
  if (key === 'w') {
    e.preventDefault();
    e.stopPropagation();
    if (activePath) closeTab(activePath);
  }
}

function onInput() {
  textChanged = true;
  schedule();
  scheduleCursor();
}

function onScroll() {
  syncTransform();
  schedule();
  minimap.sync();
  scheduleSave();
}

function onTabClick(e) {
  const tabEl = e.target.closest('.ide-tab');
  if (!tabEl) return;
  const path = tabEl.dataset.path;
  if (e.target.closest('.ide-tab-x')) {
    closeTab(path);
    return;
  }
  activate(path);
}

function onTabAux(e) {
  if (e.button !== 1) return;
  const tabEl = e.target.closest('.ide-tab');
  if (!tabEl) return;
  e.preventDefault();
  closeTab(tabEl.dataset.path);
}

function onTabsWheel(e) {
  if (e.ctrlKey) return;
  const bar = els.tabs;
  if (bar.scrollWidth <= bar.clientWidth) return;
  const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!raw) return;
  e.preventDefault();
  bar.scrollLeft += e.deltaMode === 1 ? raw * 20 : raw;
}

export function getActivePath() {
  return activePath;
}

export function mount(mainEl, handlers) {
  onChange = (handlers && handlers.onTabsChange) || null;
  mainEl.innerHTML = TEMPLATE;
  els = {
    tabs: mainEl.querySelector('.ide-tabs'),
    crumbs: mainEl.querySelector('.ide-crumbs'),
    welcome: mainEl.querySelector('.ide-welcome'),
    home: mainEl.querySelector('.ide-welcome-home'),
    notice: mainEl.querySelector('.ide-notice'),
    dv: mainEl.querySelector('.ide-dv'),
    media: mainEl.querySelector('.ide-media'),
    codewrap: mainEl.querySelector('.ide-codewrap'),
    minimap: mainEl.querySelector('.ide-minimap'),
    gutterInner: mainEl.querySelector('.ide-gutter-inner'),
    hlInner: mainEl.querySelector('.ide-hl-inner'),
    findInner: mainEl.querySelector('.ide-find-inner'),
    find: mainEl.querySelector('.ide-find'),
    findIn: mainEl.querySelector('.ide-find-in'),
    findCs: mainEl.querySelector('.ide-find-cs'),
    findCount: mainEl.querySelector('.ide-find-count'),
    findTog: mainEl.querySelector('.ide-find-tog'),
    repRow: mainEl.querySelector('.ide-find-rrow'),
    repIn: mainEl.querySelector('.ide-rep-in'),
    ta: mainEl.querySelector('.ide-ta'),
    msg: mainEl.querySelector('.ide-st-msg'),
    pos: mainEl.querySelector('.ide-st-pos'),
    eol: mainEl.querySelector('.ide-st-eol'),
    lang: mainEl.querySelector('.ide-st-lang'),
  };
  diffPane.mount(els.dv, { onOpenFile: (p) => openFile(p) });
  minimap.mount(els.minimap, els.ta);
  mediaViewer.mount(els.media, {
    onInfo: (text) => {
      const a = activeTab();
      if (a && a.media) els.pos.textContent = text || '';
    },
  });
  els.ta.addEventListener('input', onInput);
  els.ta.addEventListener('scroll', onScroll, { passive: true });
  els.ta.addEventListener('keydown', onKeyDown);
  els.ta.addEventListener('keyup', scheduleCursor);
  els.ta.addEventListener('mouseup', scheduleCursor);
  els.ta.addEventListener('focus', scheduleCursor);
  els.tabs.addEventListener('click', onTabClick);
  els.tabs.addEventListener('auxclick', onTabAux);
  els.tabs.addEventListener('wheel', onTabsWheel, { passive: false });
  els.findIn.addEventListener('input', () => runFind(true));
  els.findIn.addEventListener('keydown', onFindKey);
  els.repIn.addEventListener('keydown', onFindKey);
  els.find.addEventListener('click', onFindClick);
  mainEl.addEventListener('keydown', onMainKeyDown);
  window.addEventListener('beforeunload', persistNow);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      rendered.to = -1;
      schedule();
    }).observe(els.codewrap);
  }
  showTab(null);
}