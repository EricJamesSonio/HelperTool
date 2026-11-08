import { highlightRange, langFor, langLabel, esc, pathKey } from './highlight.js';
import { fileIcon } from './fileIcons.js';
import * as diffPane from './diffPane.js';
import * as minimap from './minimap.js';
import * as mediaViewer from './mediaViewer.js';
import { state } from '../app_manager/appState.js';
import { confirmDialog } from '../utils/confirmDialog.js';
import * as ext from './extensions/index.js';

const SEV_CLS = { error: 'e', warning: 'w', info: 'i' };
const SEV_LABEL = { error: 'Error', warning: 'Warning', info: 'Info' };
const SEV_ICON = { error: '\u2297', warning: '\u26A0', info: '\u24D8' };
const SEV_RANK = { error: 3, warning: 2, info: 1 };
const INLINE_MAX = 140;
const OPEN_JS = ['(', '[', String.fromCharCode(123)];
const OPEN_PY = OPEN_JS.concat([':']);

function worstDiag(arr) {
  let best = arr[0];
  for (const d of arr) {
    if (SEV_RANK[d.sev] > SEV_RANK[best.sev]) best = d;
  }
  return best;
}

let diag = { list: [], byLine: new Map(), lineCount: 0 };
let tipDiag = null;
let tipRaf = 0;
let tipX = 0;
let tipY = 0;
let problemsOpen = false;

function buildDiagIndex(list) {
  const byLine = new Map();
  for (const d of list) {
    let a = byLine.get(d.line);
    if (!a) {
      a = [];
      byLine.set(d.line, a);
    }
    a.push(d);
  }
  for (const a of byLine.values()) a.sort((x, y) => x.col - y.col);
  return byLine;
}

function diagHtml(from, to) {
  if (!diag.list.length) return '';
  const parts = [];
  for (let i = from; i <= to; i++) {
    const arr = diag.byLine.get(i + 1);
    if (!arr) {
      parts.push('<span class="ide-dl"></span>');
      continue;
    }
    const line = lines[i] || '';
    let out = '';
    if (line.length) {
      let pos = 0;
      for (const d of arr) {
        const s = Math.min(d.col, line.length - 1);
        if (s < pos) continue;
        let e = Math.min(line.length, s + Math.max(1, d.len));
        if (e <= s) e = Math.min(line.length, s + 1);
        out += esc(line.slice(pos, s)) + '<span class="ide-dg ide-dg-' + SEV_CLS[d.sev] + '">' + esc(line.slice(s, e)) + '</span>';
        pos = e;
      }
      out += esc(line.slice(pos));
    }
    const top = worstDiag(arr);
    let msg = top.msg.length > INLINE_MAX ? top.msg.slice(0, INLINE_MAX - 1) + '\u2026' : top.msg;
    if (arr.length > 1) msg += '  (+' + (arr.length - 1) + ' more)';
    out += '<span class="ide-dm ide-dm-' + SEV_CLS[top.sev] + '">' + SEV_ICON[top.sev] + ' ' + esc(msg) + '</span>';
    parts.push('<span class="ide-dl ide-dl-' + SEV_CLS[top.sev] + '">' + out + '</span>');
  }
  return parts.join('');
}

function renderProblemsList() {
  if (!els) return;
  const total = diag.list.length;
  els.pbList.innerHTML = total
    ? diag.list.slice(0, 200).map((d, i) =>
      '<div class="ide-pb-row" data-i="' + i + '">' +
        '<span class="ide-pb-sev ' + SEV_CLS[d.sev] + '"></span>' +
        '<span class="ide-pb-msg">' + esc(d.msg) + '</span>' +
        '<span class="ide-pb-src">' + esc(d.src || '') + '</span>' +
        '<span class="ide-pb-loc">[' + d.line + ':' + (d.col + 1) + ']</span>' +
      '</div>'
    ).join('')
    : '<div class="ide-pb-empty">No problems detected in this file.</div>';
  els.pbTitle.textContent = 'Problems' + (total ? ' (' + total + ')' : '');
}

function setProblemsOpen(on) {
  problemsOpen = !!on;
  els.problems.hidden = !problemsOpen;
  els.stProb.classList.toggle('open', problemsOpen);
  if (problemsOpen) renderProblemsList();
}

function updateProblemsUi() {
  if (!els) return;
  const tab = activeTab();
  const show = isText(tab) && ext.handles(tab.name);
  els.stProb.hidden = !show;
  if (!show) {
    if (problemsOpen) setProblemsOpen(false);
    return;
  }
  let e = 0;
  let w = 0;
  let n = 0;
  for (const d of diag.list) {
    if (d.sev === 'error') e++;
    else if (d.sev === 'warning') w++;
    else n++;
  }
  els.stProb.innerHTML =
    '<span class="ide-pc e' + (e ? ' has' : '') + '">\u2297 ' + e + '</span>' +
    '<span class="ide-pc w' + (w ? ' has' : '') + '">\u26A0 ' + w + '</span>' +
    (n ? '<span class="ide-pc i has">\u24D8 ' + n + '</span>' : '');
  els.stProb.title = e + ' error(s), ' + w + ' warning(s), ' + n + ' info. Click to toggle the Problems list (F8: next problem)';
  if (problemsOpen) renderProblemsList();
}

function setDiags(list, quiet) {
  const arr = Array.isArray(list) ? list.slice() : [];
  arr.sort((a, b) => (a.line - b.line) || (a.col - b.col));
  const had = diag.list.length > 0;
  diag = { list: arr, byLine: buildDiagIndex(arr), lineCount: lines.length };
  updateProblemsUi();
  hideTip();
  if (!quiet && (had || arr.length)) invalidate();
}

function queueDiag(delay) {
  const tab = activeTab();
  if (!isText(tab)) return;
  const path = tab.path;
  ext.analyze(path, tab.name, () => els.ta.value, delay, (list) => {
    if (activePath !== path) return;
    if (!isText(activeTab())) return;
    setDiags(list || []);
  });
}

function gotoDiag(d) {
  const tab = activeTab();
  if (!isText(tab) || !d) return;
  const starts = lineStartsOf(els.ta.value);
  const ln = Math.min(Math.max(1, d.line), starts.length) - 1;
  const col = Math.max(0, d.col);
  const off = starts[ln] + col;
  try { els.ta.setSelectionRange(off, off); } catch (_) {}
  revealMatch(ln, col, d.len, true);
  startPulse(ln, col, d.len);
  els.ta.focus({ preventScroll: true });
  scheduleCursor();
}

function stepDiag(dir) {
  if (!diag.list.length) return;
  const starts = lineStartsOf(els.ta.value);
  const caret = els.ta.selectionStart;
  const offs = diag.list.map((d) => (starts[Math.min(d.line, starts.length) - 1] || 0) + d.col);
  let pick = -1;
  if (dir > 0) {
    for (let i = 0; i < offs.length; i++) {
      if (offs[i] > caret) {
        pick = i;
        break;
      }
    }
    if (pick < 0) pick = 0;
  } else {
    for (let i = offs.length - 1; i >= 0; i--) {
      if (offs[i] < caret) {
        pick = i;
        break;
      }
    }
    if (pick < 0) pick = offs.length - 1;
  }
  gotoDiag(diag.list[pick]);
}

function onDiagKey(e) {
  if (e.key !== 'F8' || e.ctrlKey || e.altKey || e.metaKey) return;
  e.preventDefault();
  stepDiag(e.shiftKey ? -1 : 1);
}

function diagAt(x, y) {
  if (!diag.list.length) return null;
  const ta = els.ta;
  const r = ta.getBoundingClientRect();
  const px = x - r.left + ta.scrollLeft - 12;
  const py = y - r.top + ta.scrollTop - PAD;
  if (px < 0 || py < 0) return null;
  const line = Math.floor(py / LH) + 1;
  const col = Math.floor(px / charWidth());
  const arr = diag.byLine.get(line);
  if (!arr) return null;
  for (const d of arr) {
    if (col >= d.col && col < d.col + Math.max(1, d.len)) return d;
  }
  return null;
}

function hideTip() {
  tipDiag = null;
  if (els && els.tip) els.tip.hidden = true;
}

function onTaMove(e) {
  if (!diag.list.length) {
    if (tipDiag) hideTip();
    return;
  }
  tipX = e.clientX;
  tipY = e.clientY;
  if (tipRaf) return;
  tipRaf = requestAnimationFrame(() => {
    tipRaf = 0;
    const d = diagAt(tipX, tipY);
    if (!d) {
      hideTip();
      return;
    }
    if (d !== tipDiag) {
      tipDiag = d;
      els.tip.className = 'ide-diag-tip ide-tip-' + SEV_CLS[d.sev];
      els.tip.innerHTML =
        '<div class="ide-tip-head">' +
          '<span class="ide-tip-sev ' + SEV_CLS[d.sev] + '">' + SEV_ICON[d.sev] + ' ' + SEV_LABEL[d.sev] + '</span>' +
          (d.src ? '<span class="ide-tip-src">' + esc(d.src) + '</span>' : '') +
          '<span class="ide-tip-loc">Ln ' + d.line + ', Col ' + (d.col + 1) + '</span>' +
        '</div>' +
        '<div class="ide-tip-msg">' + esc(d.msg) + '</div>';
    }
    els.tip.hidden = false;
    const er = els.editor.getBoundingClientRect();
    const x = Math.max(4, Math.min(tipX - er.left + 14, er.width - 450));
    els.tip.style.left = x + 'px';
    els.tip.style.top = (tipY - er.top + 20) + 'px';
  });
}

function onProblemsClick(e) {
  if (e.target.closest('.ide-pb-x')) {
    setProblemsOpen(false);
    return;
  }
  const row = e.target.closest('.ide-pb-row');
  if (!row) return;
  gotoDiag(diag.list[Number(row.dataset.i)]);
}

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
        '<div class="ide-wk"><span>Next problem</span><span class="ide-wk-keys"><kbd>F8</kbd></span></div>' +
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
      '<div class="ide-diag-layer"><pre class="ide-diag-inner"></pre></div>' +
      '<div class="ide-find-layer"><pre class="ide-find-inner"></pre></div>' +
      '<div class="ide-hl"><pre class="ide-hl-inner"></pre></div>' +
      '<textarea class="ide-ta" wrap="off" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off"></textarea>' +
    '</div>' +
    '<div class="ide-minimap"></div>' +
  '</div>' +
  '<div class="ide-diag-tip" hidden></div>' +
'</div>' +
'<div class="ide-problems" hidden>' +
  '<div class="ide-pb-head">' +
    '<span class="ide-pb-title">Problems</span>' +
    '<span class="ide-pb-hint">F8 next problem, Shift+F8 previous</span>' +
    '<button type="button" class="ide-pb-x" title="Close">' + I_X + '</button>' +
  '</div>' +
  '<div class="ide-pb-list"></div>' +
'</div>' +
'<div class="ide-status">' +
  '<span class="ide-st-msg"></span>' +
  '<span class="ide-st-spacer"></span>' +
  '<span class="ide-st-item ide-st-problems" hidden></span>' +
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
    hist: null,
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
  els.diagInner.style.transform = tr;
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
    const fresh = tabSwitched;
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
    if (diag.list.length && diag.lineCount !== lines.length) {
      diag = { list: [], byLine: new Map(), lineCount: lines.length };
      updateProblemsUi();
    }
    queueDiag(fresh ? 40 : 650);
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
    els.diagInner.innerHTML = diagHtml(from, to);
    let nums = '';
    for (let i = from; i <= to; i++) {
      const arr = diag.list.length ? diag.byLine.get(i + 1) : null;
      if (arr) nums += '<span class="ide-gn ide-gn-' + SEV_CLS[worstDiag(arr).sev] + '">' + (i + 1) + '</span>';
      else nums += String(i + 1);
      if (i < to) nums += '\n';
    }
    els.gutterInner.innerHTML = nums;
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
  setDiags([], true);
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
  if (!tab.hist) tab.hist = histNew(tab);
  wireHist();
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
  const fileExt = tab.name.split('.').pop().toLowerCase();
  if (BINARY_EXT.has(fileExt)) {
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
  tab.hist = null;
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

function replaceAllText(text, q, rep, cs) {
  if (!q) return { out: text, n: 0 };
  const hay = cs ? text : text.toLowerCase();
  const needle = cs ? q : q.toLowerCase();
  let out = '';
  let pos = 0;
  let n = 0;
  for (;;) {
    const i = hay.indexOf(needle, pos);
    if (i === -1) break;
    out += text.slice(pos, i) + rep;
    pos = i + needle.length;
    n++;
  }
  out += text.slice(pos);
  return { out, n };
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
  const res = replaceAllText(text, find.q, els.repIn.value, find.cs);
  if (!res.n) {
    flash('No results to replace');
    return;
  }
  const out = res.out;
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
  flash('Replaced ' + res.n + ' occurrence' + (res.n === 1 ? '' : 's'));
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

const HIST_MAX = 400;
const HIST_GAP = 700;
let histWired = false;

function histNew(tab) {
  return { stack: [{ v: tab.content, s: tab.selStart || 0, e: tab.selEnd || 0 }], idx: 0, t: 0, pre: null };
}

function wireHist() {
  if (histWired || !els) return;
  histWired = true;
  els.ta.addEventListener('beforeinput', () => {
    const tab = activeTab();
    if (!isText(tab) || !tab.hist) return;
    tab.hist.pre = { s: els.ta.selectionStart, e: els.ta.selectionEnd };
  });
}

function histRecord() {
  const tab = activeTab();
  if (!isText(tab)) return;
  if (!tab.hist) tab.hist = histNew(tab);
  const h = tab.hist;
  const ta = els.ta;
  const v = ta.value;
  const cur = h.stack[h.idx];
  if (cur && cur.v === v) return;
  const now = Date.now();
  h.stack.length = h.idx + 1;
  const snap = { v, s: ta.selectionStart, e: ta.selectionEnd };
  if (h.idx > 0 && now - h.t < HIST_GAP) {
    h.stack[h.idx] = snap;
  } else {
    if (h.pre && cur) {
      cur.s = h.pre.s;
      cur.e = h.pre.e;
    }
    h.stack.push(snap);
    if (h.stack.length > HIST_MAX) h.stack.shift();
    h.idx = h.stack.length - 1;
  }
  h.t = now;
  h.pre = null;
}

function histApply(snap) {
  const ta = els.ta;
  const st = ta.scrollTop;
  const sl = ta.scrollLeft;
  ta.value = snap.v;
  try { ta.setSelectionRange(snap.s, snap.e); } catch (_) {}
  ta.scrollTop = st;
  ta.scrollLeft = sl;
  textChanged = true;
  schedule();
  scheduleCursor();
  const before = snap.v.slice(0, snap.s);
  const line = before.split('\n').length - 1;
  const col = snap.s - (before.lastIndexOf('\n') + 1);
  revealMatch(line, col, 0, false);
}

function histStep(dir) {
  const tab = activeTab();
  if (!isText(tab)) return;
  if (!tab.hist) tab.hist = histNew(tab);
  histRecord();
  const h = tab.hist;
  const next = h.idx + dir;
  if (next < 0 || next >= h.stack.length) {
    flash(dir < 0 ? 'Nothing to undo' : 'Nothing to redo');
    return;
  }
  h.idx = next;
  h.t = 0;
  h.pre = null;
  histApply(h.stack[next]);
}

const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const CLOSERS = ')]}';

function lineBlock(v, s, e) {
  const bs = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
  const eEff = e > s && v[e - 1] === '\n' ? e - 1 : e;
  let be = v.indexOf('\n', eEff);
  if (be === -1) be = v.length;
  return { bs, be };
}

function commentSyntax() {
  if (lang === 'js' || lang === 'clike') return { a: '//', b: '' };
  if (lang === 'py' || lang === 'conf') return { a: '#', b: '' };
  if (lang === 'css') return { a: '/*', b: '*/' };
  if (lang === 'html' || lang === 'md') return { a: '<!--', b: '-->' };
  return null;
}

function toggleComment() {
  const syn = commentSyntax();
  if (!syn) {
    flash('No comment syntax for this file type');
    return;
  }
  const ta = els.ta;
  const v = ta.value;
  const s0 = ta.selectionStart;
  const e0 = ta.selectionEnd;
  const blk = lineBlock(v, s0, e0);
  const rows = v.slice(blk.bs, blk.be).split('\n');
  const used = rows.filter((r) => r.trim());
  if (!used.length) return;
  const isOff = (r) => {
    const t = r.trim();
    return t.indexOf(syn.a) === 0 && (!syn.b || t.slice(-syn.b.length) === syn.b);
  };
  let out;
  if (used.every(isOff)) {
    out = rows.map((r) => {
      if (!r.trim()) return r;
      const i = r.indexOf(syn.a);
      const head = r.slice(0, i);
      let tail = r.slice(i + syn.a.length);
      if (tail[0] === ' ') tail = tail.slice(1);
      if (syn.b) {
        const tr = tail.replace(/\s+$/, '');
        tail = (tr.slice(-syn.b.length) === syn.b ? tr.slice(0, -syn.b.length) : tr).replace(/\s$/, '');
      }
      return head + tail;
    });
  } else {
    let min = Infinity;
    for (const r of used) min = Math.min(min, /^[ \t]*/.exec(r)[0].length);
    out = rows.map((r) => {
      if (!r.trim()) return r;
      return r.slice(0, min) + syn.a + ' ' + r.slice(min) + (syn.b ? ' ' + syn.b : '');
    });
  }
  const text = out.join('\n');
  const delta = text.length - (blk.be - blk.bs);
  ta.setSelectionRange(blk.bs, blk.be);
  exec(text);
  if (s0 === e0) {
    const p = Math.max(blk.bs, s0 + delta);
    ta.setSelectionRange(p, p);
  } else {
    ta.setSelectionRange(blk.bs, blk.bs + text.length);
  }
  scheduleCursor();
}

function moveLines(dir) {
  const ta = els.ta;
  const v = ta.value;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const blk = lineBlock(v, s, e);
  const block = v.slice(blk.bs, blk.be);
  let from;
  let to;
  let text;
  let delta;
  if (dir > 0) {
    if (blk.be >= v.length) return;
    let ne = v.indexOf('\n', blk.be + 1);
    if (ne === -1) ne = v.length;
    const next = v.slice(blk.be + 1, ne);
    from = blk.bs;
    to = ne;
    text = next + '\n' + block;
    delta = next.length + 1;
  } else {
    if (blk.bs === 0) return;
    const ps = blk.bs - 1 === 0 ? 0 : v.lastIndexOf('\n', blk.bs - 2) + 1;
    const prev = v.slice(ps, blk.bs - 1);
    from = ps;
    to = blk.be;
    text = block + '\n' + prev;
    delta = -(prev.length + 1);
  }
  ta.setSelectionRange(from, to);
  exec(text);
  ta.setSelectionRange(s + delta, e + delta);
  scheduleCursor();
}

function dupLines(dir) {
  const ta = els.ta;
  const v = ta.value;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const blk = lineBlock(v, s, e);
  const block = v.slice(blk.bs, blk.be);
  if (dir > 0) {
    ta.setSelectionRange(blk.be, blk.be);
    exec('\n' + block);
    ta.setSelectionRange(s + block.length + 1, e + block.length + 1);
  } else {
    ta.setSelectionRange(blk.bs, blk.bs);
    exec(block + '\n');
    ta.setSelectionRange(s, e);
  }
  scheduleCursor();
}

function deleteLines() {
  const ta = els.ta;
  const v = ta.value;
  const blk = lineBlock(v, ta.selectionStart, ta.selectionEnd);
  let a = blk.bs;
  let b = blk.be;
  if (blk.be < v.length) b = blk.be + 1;
  else if (blk.bs > 0) a = blk.bs - 1;
  ta.focus();
  ta.setSelectionRange(a, b);
  document.execCommand('delete');
}

function indentExtra(before) {
  if (lang === 'md' || lang === 'plain') return '';
  if (lang === 'html') {
    return /<(?!\/|!|(?:br|hr|img|input|meta|link)\b)[A-Za-z][^<>]*(?<!\/)>\s*$/.test(before) ? '  ' : '';
  }
  const re = lang === 'py' ? /[{(\[:]\s*$/ : /[{(\[]\s*$/;
  return re.test(before) ? '  ' : '';
}

function insertLine(above) {
  const ta = els.ta;
  const v = ta.value;
  const blk = lineBlock(v, ta.selectionStart, ta.selectionStart);
  const row = v.slice(blk.bs, blk.be);
  const lead = /^[ \t]*/.exec(row)[0];
  if (above) {
    ta.setSelectionRange(blk.bs, blk.bs);
    exec(lead + '\n');
    const p = blk.bs + lead.length;
    ta.setSelectionRange(p, p);
  } else {
    ta.setSelectionRange(blk.be, blk.be);
    exec('\n' + lead + indentExtra(row));
  }
  scheduleCursor();
}

function editShortcut(e, mod, alt, key) {
  if (mod && !alt && !e.shiftKey && (e.key === '/' || e.code === 'Slash')) {
    toggleComment();
    return true;
  }
  if (mod && !alt && e.shiftKey && key === 'k') {
    deleteLines();
    return true;
  }
  if (mod && !alt && key === 'enter') {
    insertLine(e.shiftKey);
    return true;
  }
  if (!mod && alt && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    if (e.shiftKey) dupLines(dir);
    else moveLines(dir);
    return true;
  }
  return false;
}

function smartEnter(e) {
  const ta = els.ta;
  const v = ta.value;
  const s = ta.selectionStart;
  const en = ta.selectionEnd;
  const ls = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
  const before = v.slice(ls, s);
  const lead = /^[ \t]*/.exec(before)[0];
  const prev = s > 0 ? v[s - 1] : '';
  const next = v[en] || '';
  e.preventDefault();
  const pairBetween = s === en && !!prev && CLOSERS.indexOf(next) !== -1 && PAIRS[prev] === next && prev !== next;
  const tagBetween = lang === 'html' && s === en && prev === '>' && v.slice(s, s + 2) === '</';
  if (pairBetween || tagBetween) {
    exec('\n' + lead + '  \n' + lead);
    const pos = s + 1 + lead.length + 2;
    ta.setSelectionRange(pos, pos);
    scheduleCursor();
    return;
  }
  exec('\n' + lead + indentExtra(before));
}

function smartBackspace(e) {
  const ta = els.ta;
  const v = ta.value;
  const s = ta.selectionStart;
  if (s !== ta.selectionEnd || s === 0) return false;
  const prev = v[s - 1];
  const next = v[s];
  if (PAIRS[prev] && PAIRS[prev] === next) {
    e.preventDefault();
    ta.setSelectionRange(s - 1, s + 1);
    document.execCommand('delete');
    return true;
  }
  const ls = v.lastIndexOf('\n', s - 1) + 1;
  const before = v.slice(ls, s);
  if (before.length >= 2 && /^ +$/.test(before)) {
    const n = before.length % 2 === 0 ? 2 : 1;
    e.preventDefault();
    ta.setSelectionRange(s - n, s);
    document.execCommand('delete');
    return true;
  }
  return false;
}

function smartHome(e) {
  const ta = els.ta;
  const v = ta.value;
  const s = ta.selectionStart;
  if (s !== ta.selectionEnd) return;
  const ls = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
  let fe = v.indexOf('\n', ls);
  if (fe === -1) fe = v.length;
  const lead = /^[ \t]*/.exec(v.slice(ls, fe))[0].length;
  const first = ls + lead;
  if (s === first || lead === 0) return;
  e.preventDefault();
  ta.setSelectionRange(first, first);
  scheduleCursor();
}

function autoCloseOk(next) {
  return !next || /[\s)\]}>,;:.]/.test(next);
}

function typedChar(e) {
  const ch = e.key;
  if (ch.length !== 1 || lang === 'plain' || lang === 'md') return false;
  const ta = els.ta;
  const v = ta.value;
  const s = ta.selectionStart;
  const en = ta.selectionEnd;
  const sel = s !== en;
  const next = v[en] || '';
  const prev = s > 0 ? v[s - 1] : '';
  const isCloser = CLOSERS.indexOf(ch) !== -1;
  const isQuote = ch === '"' || ch === "'" || ch === '`';
  if ((isCloser || isQuote) && !sel && next === ch) {
    e.preventDefault();
    ta.setSelectionRange(s + 1, s + 1);
    scheduleCursor();
    return true;
  }
  if (isCloser) {
    if (sel) return false;
    const ls = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
    const before = v.slice(ls, s);
    if (before.length >= 2 && /^ +$/.test(before)) {
      e.preventDefault();
      ta.setSelectionRange(s - 2, s);
      exec(ch);
      return true;
    }
    return false;
  }
  const isOpen = ch === '(' || ch === '[' || ch === '{';
  if (!isOpen && !isQuote) return false;
  if (sel) {
    const inner = v.slice(s, en);
    e.preventDefault();
    exec(ch + inner + PAIRS[ch]);
    ta.setSelectionRange(s + 1, s + 1 + inner.length);
    scheduleCursor();
    return true;
  }
  if (isQuote) {
    let wordBefore = /[\w$]/.test(prev);
    if (wordBefore && lang === 'py' && /[rRbBfFuU]/.test(prev) && !/[\w$]/.test(v[s - 2] || '')) wordBefore = false;
    if (wordBefore || prev === ch) return false;
  }
  if (!autoCloseOk(next)) return false;
  e.preventDefault();
  exec(ch + PAIRS[ch]);
  ta.setSelectionRange(s + 1, s + 1);
  scheduleCursor();
  return true;
}
function onKeyDown(e) {
  if (e.isComposing) return;
  const gr = !!(e.getModifierState && e.getModifierState('AltGraph'));
  const alt = e.altKey && !gr;
  const mod = (e.ctrlKey || e.metaKey) && !gr;
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
  if (mod && !alt && key === 'z') {
    e.preventDefault();
    e.stopPropagation();
    histStep(e.shiftKey ? 1 : -1);
    return;
  }
  if (mod && !alt && !e.shiftKey && key === 'y') {
    e.preventDefault();
    e.stopPropagation();
    histStep(1);
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
  if (!mod && !alt) e.stopPropagation();
  if (mod || alt) {
    if (editShortcut(e, mod, alt, key)) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    indent(e.shiftKey);
    return;
  }
  if (e.key === 'Enter') {
    smartEnter(e);
    return;
  }
  if (e.key === 'Backspace') {
    smartBackspace(e);
    return;
  }
  if (e.key === 'Home' && !e.shiftKey) {
    smartHome(e);
    return;
  }
  if (e.key.length === 1) typedChar(e);
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

const CENTER_MIN_H = 120;
let centerRaf = 0;

function centerCaret() {
  if (!els || els.codewrap.hidden) return;
  const ta = els.ta;
  if (document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd) return;
  const h = ta.clientHeight;
  if (h < CENTER_MIN_H) return;
  const pb = PAD + Math.round(h * 0.5) + 'px';
  if (ta.style.paddingBottom !== pb) ta.style.paddingBottom = pb;
  const v = ta.value;
  const s = ta.selectionStart;
  let row = 0;
  let i = -1;
  for (;;) {
    i = v.indexOf('\n', i + 1);
    if (i === -1 || i >= s) break;
    row++;
  }
  const y = row * LH + PAD;
  const rel = y - ta.scrollTop;
  const mid = (h - LH) / 2;
  if (rel > mid + LH / 2) ta.scrollTop = Math.max(0, y - mid);
  const ls = s === 0 ? 0 : v.lastIndexOf('\n', s - 1) + 1;
  const x = (s - ls) * charWidth() + 12;
  const w = ta.clientWidth || 800;
  if (x - ta.scrollLeft > w - 100) ta.scrollLeft = Math.max(0, x - Math.round(w * 0.5));
}

function scheduleCenter() {
  if (centerRaf) return;
  centerRaf = requestAnimationFrame(() => {
    centerRaf = 0;
    centerCaret();
  });
}
function onInput() {
  histRecord();
  textChanged = true;
  schedule();
  scheduleCursor();
  scheduleCenter();
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
    editor: mainEl.querySelector('.ide-editor'),
    codewrap: mainEl.querySelector('.ide-codewrap'),
    minimap: mainEl.querySelector('.ide-minimap'),
    gutterInner: mainEl.querySelector('.ide-gutter-inner'),
    hlInner: mainEl.querySelector('.ide-hl-inner'),
    findInner: mainEl.querySelector('.ide-find-inner'),
    diagInner: mainEl.querySelector('.ide-diag-inner'),
    tip: mainEl.querySelector('.ide-diag-tip'),
    problems: mainEl.querySelector('.ide-problems'),
    pbList: mainEl.querySelector('.ide-pb-list'),
    pbTitle: mainEl.querySelector('.ide-pb-title'),
    stProb: mainEl.querySelector('.ide-st-problems'),
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
  els.ta.addEventListener('scroll', hideTip, { passive: true });
  els.ta.addEventListener('keydown', onKeyDown);
  els.ta.addEventListener('keydown', onDiagKey);
  els.ta.addEventListener('keyup', scheduleCursor);
  els.ta.addEventListener('mouseup', scheduleCursor);
  els.ta.addEventListener('mousemove', onTaMove);
  els.ta.addEventListener('mouseleave', hideTip);
  els.ta.addEventListener('focus', scheduleCursor);
  els.tabs.addEventListener('click', onTabClick);
  els.tabs.addEventListener('auxclick', onTabAux);
  els.tabs.addEventListener('wheel', onTabsWheel, { passive: false });
  els.findIn.addEventListener('input', () => runFind(true));
  els.findIn.addEventListener('keydown', onFindKey);
  els.repIn.addEventListener('keydown', onFindKey);
  els.find.addEventListener('click', onFindClick);
  els.stProb.addEventListener('click', () => setProblemsOpen(!problemsOpen));
  els.problems.addEventListener('click', onProblemsClick);
  mainEl.addEventListener('keydown', onMainKeyDown);
  window.addEventListener('beforeunload', persistNow);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      rendered.to = -1;
      schedule();
    }).observe(els.codewrap);
  }
  ext.mount({ onChange: () => queueDiag(60) });
  showTab(null);
}