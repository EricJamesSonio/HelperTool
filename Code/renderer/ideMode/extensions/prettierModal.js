import * as fmt from './formatter.js';
import { esc } from '../highlight.js';

const NOTES = {
  js: 'Indent width, uneven indents, trailing spaces and blank lines between functions, classes and methods. Template literals are never touched.',
  py: 'Python is indentation sensitive, so nesting levels are never changed. Only the indent width is converted, and only when the file is consistent. PEP 8 uses 4 spaces.',
  json: 'Parsed and rewritten with your indent. Short arrays stay on one line. Files with comments or very long numbers are left alone.',
  css: 'Indent width and one blank line between rules. Nested SCSS rules are spaced the same way.',
  html: 'Tag structure is kept. Only indent width, trailing spaces and blank lines change. Vue files get a blank line between template, script and style blocks.',
  php: 'Indent width and blank lines between functions and classes. Other C-like languages only get indent and cleanup.',
};

let overlay = null;
let host = {};
let active = 'js';
let showWs = true;

function chip(act, attrs, label, on) {
  return '<button type="button" class="ide-pr-chip' + (on ? ' on' : '') + '" data-act="' + act + '" ' + attrs + '>' + label + '</button>';
}

function parseVal(v) {
  if (v === undefined) return undefined;
  if (v === 'tab') return 'tab';
  return Number(v);
}

function vis(text) {
  const rows = text.split('\n');
  if (rows.length && rows[rows.length - 1] === '') rows.pop();
  return rows.map((line) => {
    const lead = /^[ \t]*/.exec(line)[0];
    const rest = line.slice(lead.length);
    const trail = /[ \t]+$/.exec(rest);
    const body = trail ? rest.slice(0, rest.length - trail[0].length) : rest;
    let head = lead;
    if (showWs) {
      head = lead.replace(/ /g, '<i class="ws">\u00b7</i>').replace(/\t/g, '<i class="ws">\u2192\u00a0\u00a0\u00a0</i>');
    }
    const tail = trail && showWs ? '<i class="ws trail">' + '\u00b7'.repeat(trail[0].length) + '</i>' : (trail ? trail[0] : '');
    return head + esc(body) + tail;
  }).join('\n');
}

function render() {
  if (!overlay) return;
  const o = fmt.getOptions();
  const on = host.isOn ? host.isOn() : false;
  const grp = fmt.GROUPS.find((x) => x.id === active) || fmt.GROUPS[0];
  const lab = (v) => (v === 0 ? 'Off' : String(v));
  const optRow = (title, key, vals) =>
    '<div class="ide-pr-row"><span class="ide-pr-lbl">' + title + '</span><div class="ide-pr-chips">' +
    vals.map((v) => chip('opt', 'data-key="' + key + '" data-val="' + v + '"', lab(v), o[key] === v)).join('') +
    '</div></div>';
  const tog = (title, key) =>
    '<button type="button" class="ide-pr-tog' + (o[key] ? ' on' : '') + '" data-act="tog" data-key="' + key + '">' +
    '<span class="ide-pr-tog-sw"></span><span>' + title + '</span></button>';
  const presets = fmt.PRESETS.map((p) =>
    '<button type="button" class="ide-pr-preset' + (o.preset === p.id ? ' on' : '') + '" data-act="preset" data-id="' + p.id + '">' +
    '<b>' + esc(p.label) + '</b><span>' + esc(p.desc) + '</span></button>').join('');
  const tabs = fmt.GROUPS.map((g) =>
    '<button type="button" class="ide-pr-tab' + (g.id === grp.id ? ' on' : '') + '" data-act="tab" data-group="' + g.id + '">' + esc(g.label) + '</button>').join('');
  const sizes = grp.sizes.map((v) =>
    chip('ind', 'data-group="' + grp.id + '" data-val="' + v + '"', v === 'tab' ? 'Tab' : v + ' spaces', o.indent[grp.id] === v)).join('');
  const before = fmt.sampleFor(grp.id);
  const afterRaw = fmt.formatText(before, grp.sample, o);
  const after = afterRaw === null ? before : afterRaw;
  const banner = on
    ? '<div class="ide-pr-banner on"><span>Prettier is ON. Files are formatted on save when "Format on save" is enabled.</span><button type="button" data-act="power">Turn off</button></div>'
    : '<div class="ide-pr-banner"><span>Prettier is OFF. Turn it on to format files.</span><button type="button" data-act="power">Turn on</button></div>';

  overlay.querySelector('.ide-pr-left').innerHTML =
    banner +
    '<div class="ide-pr-sec">Preset</div><div class="ide-pr-presets">' + presets + '</div>' +
    '<div class="ide-pr-sec">Spacing</div>' +
    optRow('Blank lines allowed in a row', 'maxBlank', [1, 2, 3]) +
    optRow('Blank lines between functions', 'fnGap', [0, 1, 2]) +
    optRow('Python: top-level def / class', 'pyGap', [1, 2]) +
    optRow('Python: between methods', 'pyMethodGap', [0, 1, 2]) +
    '<div class="ide-pr-sec">Cleanup</div>' +
    '<div class="ide-pr-togs">' +
      tog('Format on save', 'formatOnSave') +
      tog('Trim trailing spaces', 'trimTrailing') +
      tog('Final newline', 'finalNewline') +
    '</div>';

  overlay.querySelector('.ide-pr-right').innerHTML =
    '<div class="ide-pr-tabs">' + tabs + '</div>' +
    '<div class="ide-pr-row ide-pr-indrow"><span class="ide-pr-lbl">Indent for ' + esc(grp.label) + '</span><div class="ide-pr-chips">' + sizes + '</div></div>' +
    '<div class="ide-pr-note">' + esc(NOTES[grp.id] || '') + '</div>' +
    '<div class="ide-pr-cmp">' +
      '<div class="ide-pr-col"><div class="ide-pr-colt">Before</div><pre class="ide-pr-pre">' + vis(before) + '</pre></div>' +
      '<div class="ide-pr-col"><div class="ide-pr-colt">After</div><pre class="ide-pr-pre">' + vis(after) + '</pre></div>' +
    '</div>' +
    '<label class="ide-pr-ws"><input type="checkbox" data-act="ws"' + (showWs ? ' checked' : '') + ' /> Show whitespace (dots are spaces, arrows are tabs)</label>';
}

function runEvent(name) {
  close();
  document.dispatchEvent(new CustomEvent('ide:close-search'));
  setTimeout(() => document.dispatchEvent(new CustomEvent(name)), 40);
}

function onClick(e) {
  if (e.target === overlay) {
    close();
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const val = parseVal(b.dataset.val);
  if (act === 'close') close();
  else if (act === 'preset') {
    fmt.applyPreset(b.dataset.id);
    render();
  } else if (act === 'opt') {
    fmt.setOptions({ [b.dataset.key]: val, preset: 'custom' });
    render();
  } else if (act === 'ind') {
    fmt.setOptions({ indent: { [b.dataset.group]: val }, preset: 'custom' });
    render();
  } else if (act === 'tog') {
    const cur = fmt.getOptions();
    fmt.setOptions({ [b.dataset.key]: !cur[b.dataset.key] });
    render();
  } else if (act === 'tab') {
    active = b.dataset.group;
    render();
  } else if (act === 'ws') {
    showWs = !showWs;
    render();
  } else if (act === 'power') {
    if (host.toggle) host.toggle();
    render();
  } else if (act === 'fmt-doc') runEvent('ide:format-document');
  else if (act === 'fmt-open') runEvent('ide:format-open');
}

function onKey(e) {
  if (e.key !== 'Escape' || !overlay || overlay.hidden) return;
  e.preventDefault();
  e.stopPropagation();
  close();
}

function build() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'ide-pr-overlay ide-root';
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="ide-pr-modal">' +
      '<div class="ide-pr-head">' +
        '<span class="ide-pr-title">Prettier</span>' +
        '<span class="ide-pr-sub">Choose how your code should be formatted. The preview is language aware.</span>' +
        '<button type="button" class="ide-pr-x" data-act="close" title="Close">&times;</button>' +
      '</div>' +
      '<div class="ide-pr-body"><div class="ide-pr-left"></div><div class="ide-pr-right"></div></div>' +
      '<div class="ide-pr-foot">' +
        '<span class="ide-pr-hint">Shift+Alt+F formats the current file. Formatting is undoable with Ctrl+Z.</span>' +
        '<button type="button" class="ide-pr-btn" data-act="fmt-doc">Format current file</button>' +
        '<button type="button" class="ide-pr-btn" data-act="fmt-open">Format all open files</button>' +
        '<button type="button" class="ide-pr-btn primary" data-act="close">Done</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener('click', onClick);
  document.addEventListener('ide:close-search', () => close());
}

export function open(h) {
  host = h || {};
  build();
  overlay.hidden = false;
  document.addEventListener('keydown', onKey, true);
  render();
}

export function close() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.removeEventListener('keydown', onKey, true);
}