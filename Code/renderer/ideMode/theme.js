import { fileIcon } from './fileIcons.js';

const LS_KEY = 'helpertool-ide-theme';
const CSS_ID = 'ideThemeCss';

const GROUPS = [
  { id: 'dark', title: 'Dark themes' },
  { id: 'light', title: 'Light themes' },
  { id: 'mac', title: 'macOS themes' },
];

const THEMES = [
  { id: 'app', name: 'App theme', tone: 'dark', group: 'dark' },
  { id: 'darkplus', name: 'Dark+', tone: 'dark', group: 'dark' },
  { id: 'onedark', name: 'One Dark', tone: 'dark', group: 'dark' },
  { id: 'dracula', name: 'Dracula', tone: 'dark', group: 'dark' },
  { id: 'monokai', name: 'Monokai', tone: 'dark', group: 'dark' },
  { id: 'nightowl', name: 'Night Owl', tone: 'dark', group: 'dark' },
  { id: 'synthwave', name: 'Synthwave', tone: 'dark', group: 'dark' },
  { id: 'cobalt', name: 'Cobalt', tone: 'dark', group: 'dark' },
  { id: 'tokyo', name: 'Tokyo Night', tone: 'dark', group: 'dark' },
  { id: 'ember', name: 'Ember', tone: 'dark', group: 'dark' },
  { id: 'solardark', name: 'Solarized Dark', tone: 'dark', group: 'dark' },
  { id: 'ghdark', name: 'GitHub Dark', tone: 'dark', group: 'dark' },
  { id: 'indigo', name: 'Midnight Indigo', tone: 'dark', group: 'dark' },
  { id: 'ocean', name: 'Deep Ocean', tone: 'dark', group: 'dark' },
  { id: 'gold', name: 'Midnight Gold', tone: 'dark', group: 'dark' },
  { id: 'noir', name: 'Noir Slate', tone: 'dark', group: 'dark' },
  { id: 'neon', name: 'Neon Night', tone: 'dark', group: 'dark' },
  { id: 'scarlet', name: 'Scarlet Pop', tone: 'dark', group: 'dark' },
  { id: 'ghlight', name: 'GitHub Light', tone: 'light', group: 'light' },
  { id: 'lightplus', name: 'Light+', tone: 'light', group: 'light' },
  { id: 'daylight', name: 'Daylight', tone: 'light', group: 'light' },
  { id: 'sollight', name: 'Solarized Light', tone: 'light', group: 'light' },
  { id: 'macdark', name: 'macOS Dark', tone: 'dark', group: 'mac' },
  { id: 'maclight', name: 'macOS Light', tone: 'light', group: 'mac' },
];

const FONTS = [
  { id: 'default', name: 'App default', css: 'var(--font-mono)' },
  { id: 'cascadia', name: 'Cascadia Code', css: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace" },
  { id: 'consolas', name: 'Consolas', css: "Consolas, 'Courier New', monospace" },
  { id: 'jetbrains', name: 'JetBrains Mono', css: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace" },
  { id: 'fira', name: 'Fira Code', css: "'Fira Code', 'Fira Mono', 'Cascadia Code', Consolas, monospace" },
  { id: 'courier', name: 'Courier New', css: "'Courier New', Courier, monospace" },
];

const ICON_SETS = [
  { id: 'classic', name: 'Classic' },
  { id: 'vivid', name: 'Vivid' },
  { id: 'mono', name: 'Mono' },
  { id: 'dots', name: 'Dots' },
];

const GUIDES = [
  { id: 'off', name: 'Off' },
  { id: 'soft', name: 'Soft' },
  { id: 'normal', name: 'Normal' },
  { id: 'bold', name: 'Bold' },
];

const SCOPES = [
  { id: 'ide', name: 'IDE mode only' },
  { id: 'app', name: 'Whole app' },
];

const FLAGS = ['ruler', 'chrome', 'shell'];

const DEFAULTS = {
  theme: 'app',
  font: 'default',
  icons: 'classic',
  guides: 'normal',
  scope: 'ide',
  ruler: true,
  chrome: true,
  shell: true,
};

const APP_VARS = [
  ['--pa-bg', '--bg-base'],
  ['--pa-sf', '--bg-surface'],
  ['--pa-el', '--bg-elevated'],
  ['--pa-fg', '--text-primary'],
  ['--pa-fg2', '--text-secondary'],
  ['--pa-mu', '--text-muted'],
  ['--pa-ac', '--accent'],
  ['--pa-green', '--green'],
  ['--pa-yellow', '--yellow'],
  ['--pa-purple', '--purple'],
  ['--pa-blue', '--blue'],
  ['--pa-red', '--red'],
];

const CODE = [
  { ind: 0, h: '<i class="k">import</i> { <i class="f">run</i> } <i class="k">from</i> <i class="s">\'./loop\'</i>;' },
  { ind: 0, h: '<i class="c">// retry until the result validates</i>' },
  { ind: 0, h: '<i class="k">const</i> <i class="t">MAX</i> = <i class="n">3</i>;' },
  { ind: 0, h: '' },
  { ind: 0, h: '<i class="k">async function</i> <i class="f">loop</i>(prompt) {' },
  { ind: 2, h: '<i class="k">for</i> (<i class="k">let</i> i = <i class="n">0</i>; i &lt; <i class="t">MAX</i>; i++) {' },
  { ind: 4, h: '<i class="k">const</i> ok = <i class="k">await</i> <i class="f">run</i>(prompt, <i class="s">\'test\'</i>);' },
  { ind: 4, h: '<i class="k">if</i> (ok) <i class="k">return</i> <i class="k">true</i>;' },
  { ind: 2, h: '}' },
  { ind: 0, h: '}' },
];

const ICON_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2a5.8 5.8 0 1 0 0 11.6c.9 0 1.3-.6 1.3-1.2 0-.9-.7-1.1-.7-1.9 0-.7.6-1.2 1.4-1.2h1.3A2.6 2.6 0 0 0 13.9 7C13.9 4.3 11.3 2.2 8 2.2z"/><circle cx="5" cy="7.2" r=".6" fill="currentColor"/><circle cx="7.5" cy="4.9" r=".6" fill="currentColor"/><circle cx="10.6" cy="5.6" r=".6" fill="currentColor"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
const FOLDER_SVG = '<span class="ide-ficon"><svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H9L7 4H4a2 2 0 0 0-2 2v1z"/></svg></span>';

let prefs = load();
let hover = { theme: null, font: null };
let btn = null;
let pop = null;
let started = false;

function pick(list, value, fallback) {
  return list.some((x) => x.id === value) ? value : fallback;
}

function flagOf(raw, key) {
  return typeof raw[key] === 'boolean' ? raw[key] : DEFAULTS[key];
}

function load() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  } catch (_) {
    raw = null;
  }
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    theme: pick(THEMES, r.theme, DEFAULTS.theme),
    font: pick(FONTS, r.font, DEFAULTS.font),
    icons: pick(ICON_SETS, r.icons, DEFAULTS.icons),
    guides: pick(GUIDES, r.guides, DEFAULTS.guides),
    scope: pick(SCOPES, r.scope, DEFAULTS.scope),
    ruler: flagOf(r, 'ruler'),
    chrome: flagOf(r, 'chrome'),
    shell: flagOf(r, 'shell'),
  };
}

function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch (_) {
    return;
  }
}

function toneOf(id) {
  const t = THEMES.find((x) => x.id === id);
  return t ? t.tone : 'dark';
}

function nameOf(list, id) {
  const t = list.find((x) => x.id === id);
  return t ? t.name : '';
}

function setAttr(el, name, value) {
  if (value === null || value === undefined) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
    return;
  }
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function apply(notify) {
  const b = document.body;
  if (!b) return;
  setAttr(b, 'data-ide-theme', prefs.theme === 'app' ? null : prefs.theme);
  setAttr(b, 'data-ide-tone', toneOf(prefs.theme));
  setAttr(b, 'data-ide-font', prefs.font === 'default' ? null : prefs.font);
  setAttr(b, 'data-ide-icons', prefs.icons === 'classic' ? null : prefs.icons);
  setAttr(b, 'data-ide-guides', prefs.guides);
  setAttr(b, 'data-ide-scope', prefs.scope === 'app' ? 'app' : null);
  setAttr(b, 'data-ide-ruler', prefs.ruler ? '1' : null);
  setAttr(b, 'data-ide-chrome', prefs.chrome ? '1' : null);
  setAttr(b, 'data-ide-shell', prefs.shell ? '1' : null);
  if (notify) document.dispatchEvent(new CustomEvent('ide:theme-changed'));
}

function injectCss() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement('link');
  link.id = CSS_ID;
  link.rel = 'stylesheet';
  link.href = './styles/ide-theme.css';
  document.head.appendChild(link);
}

function cardHtml(t) {
  return '<button type="button" class="ith-card" data-act="theme" data-t="' + t.id + '" title="' + t.name + '">' +
    '<span class="ith-prev">' +
      '<span class="ith-ln"><i class="k">const</i> <i class="f">run</i> = <i class="n">42</i>;</span>' +
      '<span class="ith-ln"><i class="c">// note</i> <i class="s">\'ok\'</i></span>' +
      '<span class="ith-ln"><i class="k">return</i> <i class="f">run</i>();</span>' +
    '</span>' +
    '<span class="ith-meta"><span class="ith-name">' + t.name + '</span>' +
    (t.tone === 'light' ? '<span class="ith-tone">Light</span>' : '') + '</span>' +
  '</button>';
}

function fontHtml(f) {
  return '<button type="button" class="ith-font" data-act="font" data-v="' + f.id + '">' +
    '<span class="ith-font-name">' + f.name + '</span>' +
    '<span class="ith-font-sample" style="font-family:' + f.css + '">const a = 42;</span>' +
  '</button>';
}

function segHtml(key, items) {
  return '<div class="ith-seg">' + items.map((i) =>
    '<button type="button" class="ith-sb" data-act="set" data-key="' + key + '" data-v="' + i.id + '">' + i.name + '</button>'
  ).join('') + '</div>';
}

function rowHtml(key, label) {
  return '<div class="ith-row" data-row="' + key + '"><span>' + label + '</span>' +
    '<button type="button" class="ith-sw" data-act="flag" data-key="' + key + '" role="switch" aria-checked="false"><i></i></button></div>';
}

function treeRow(name, active) {
  return '<div class="pv-item' + (active ? ' on' : '') + '"><span class="pv-sp"></span>' + fileIcon(name) + '<span>' + name + '</span></div>';
}

function previewHtml() {
  const nums = CODE.map((l, i) => String(i + 1)).join('\n');
  const body = CODE.map((l) =>
    (l.ind ? '<span class="ith-ig" style="width:' + l.ind + 'ch"></span>' : '') + l.h
  ).join('\n');
  return '<div class="ith-pv" data-t="app" data-g="normal" data-r="1" data-c="1" data-s="1">' +
    '<div class="pv-nav">' +
      '<span class="pv-chip pv-acc">Global Seed</span>' +
      '<span class="pv-chip">Select Repo</span>' +
      '<span class="pv-search">Search in codebase</span>' +
      '<span class="pv-grow"></span>' +
      '<span class="pv-chip pv-acc">IDE Mode</span>' +
    '</div>' +
    '<div class="pv-row">' +
      '<div class="pv-side">' +
        '<div class="pv-sh">HELPERTOOL</div>' +
        '<div class="pv-item"><span class="pv-ch">\u25BE</span>' + FOLDER_SVG + '<span>harness</span></div>' +
        treeRow('loop.js', true) +
        treeRow('promptFixer.js', false) +
        treeRow('runner.js', false) +
        treeRow('validator.js', false) +
        '<div class="pv-item"><span class="pv-ch">\u203A</span>' + FOLDER_SVG + '<span>indexer</span></div>' +
      '</div>' +
      '<div class="pv-main">' +
        '<div class="pv-tabs">' +
          '<span class="pv-tab on">' + fileIcon('loop.js') + '<span>loop.js</span></span>' +
          '<span class="pv-tab">' + fileIcon('runner.js') + '<span>runner.js</span></span>' +
        '</div>' +
        '<div class="pv-code">' +
          '<pre class="pv-gut">' + nums + '</pre>' +
          '<pre class="pv-body">' + body + '</pre>' +
        '</div>' +
        '<div class="pv-status"><span class="pv-grow"></span><span>Ln 7, Col 12</span><span>Spaces: 2</span><span>UTF-8</span><span class="pv-acc">JavaScript</span></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function themeSectionsHtml() {
  return GROUPS.map((g, i) => {
    const cards = THEMES.filter((t) => t.group === g.id).map(cardHtml).join('');
    return '<div class="ith-sec' + (i === 0 ? ' ith-sec-first' : '') + '">' + g.title + '</div>' +
      '<div class="ith-grid">' + cards + '</div>';
  }).join('');
}

function modalHtml() {
  const fonts = FONTS.map(fontHtml).join('');
  return '<div class="ith-box" role="dialog" aria-modal="true" aria-label="IDE theme">' +
    '<div class="ith-head">' +
      '<span class="ith-title">IDE theme</span>' +
      '<span class="ith-sub"></span>' +
      '<span class="ith-spacer"></span>' +
      '<button type="button" class="ith-reset" data-act="reset">Reset</button>' +
      '<button type="button" class="ith-x" data-act="close" title="Close (Esc)" aria-label="Close">' + CLOSE_SVG + '</button>' +
    '</div>' +
    '<div class="ith-body">' +
      '<aside class="ith-side">' +
        '<div class="ith-sec ith-sec-first">Apply theme to</div>' + segHtml('scope', SCOPES) +
        '<div class="ith-hint">Whole app also themes the main view outside IDE mode. Open IDE mode to change this theme.</div>' +
        '<div class="ith-sec">Editor font</div>' +
        '<div class="ith-fonts">' + fonts + '</div>' +
        '<div class="ith-hint">Uses fonts installed on this computer. A missing font falls back to the default.</div>' +
        '<div class="ith-sec">File icons</div>' + segHtml('icons', ICON_SETS) +
        '<div class="ith-sec">Indent guides</div>' + segHtml('guides', GUIDES) +
        '<div class="ith-sec">Extras</div>' +
        rowHtml('ruler', 'Thin line at the start of the code') +
        rowHtml('chrome', 'Theme the sidebar, tabs and status bar') +
        rowHtml('shell', 'Theme the whole app in IDE mode') +
      '</aside>' +
      '<section class="ith-main">' +
        '<div class="ith-pvwrap">' +
          '<div class="ith-pvhead"><span>Live preview</span><span class="ith-pvname"></span></div>' +
          previewHtml() +
        '</div>' +
        '<div class="ith-cards">' + themeSectionsHtml() + '</div>' +
      '</section>' +
    '</div>' +
  '</div>';
}

function paintAppVars() {
  if (!pop) return;
  const cs = getComputedStyle(document.documentElement);
  for (const pair of APP_VARS) {
    const v = cs.getPropertyValue(pair[1]).trim();
    if (v) pop.style.setProperty(pair[0], v);
  }
}

function updatePreview() {
  if (!pop) return;
  const pv = pop.querySelector('.ith-pv');
  if (!pv) return;
  const themeId = hover.theme || prefs.theme;
  const fontId = hover.font || prefs.font;
  const font = FONTS.find((f) => f.id === fontId);
  const shell = prefs.scope === 'app' || prefs.shell;
  pv.setAttribute('data-t', themeId);
  pv.setAttribute('data-g', prefs.guides);
  pv.setAttribute('data-r', prefs.ruler ? '1' : '0');
  pv.setAttribute('data-c', prefs.chrome ? '1' : '0');
  pv.setAttribute('data-s', shell ? '1' : '0');
  pv.style.setProperty('--pvfont', font ? font.css : 'var(--font-mono)');
  const label = pop.querySelector('.ith-pvname');
  if (label) label.textContent = nameOf(THEMES, themeId) + '  \u00B7  ' + nameOf(FONTS, fontId);
  const sub = pop.querySelector('.ith-sub');
  if (sub) sub.textContent = prefs.scope === 'app' ? 'Applies to the whole app' : 'Only applies while IDE mode is on';
}

function sync() {
  if (!pop) return;
  pop.querySelectorAll('.ith-card').forEach((c) => c.classList.toggle('on', c.dataset.t === prefs.theme));
  pop.querySelectorAll('.ith-font').forEach((b) => b.classList.toggle('on', b.dataset.v === prefs.font));
  pop.querySelectorAll('.ith-sb').forEach((b) => b.classList.toggle('on', prefs[b.dataset.key] === b.dataset.v));
  pop.querySelectorAll('.ith-sw').forEach((b) => {
    const on = !!prefs[b.dataset.key];
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  const shellRow = pop.querySelector('.ith-row[data-row="shell"]');
  if (shellRow) shellRow.classList.toggle('dim', prefs.scope === 'app');
  updatePreview();
}

function commit() {
  save();
  apply(true);
  sync();
}

function onPopClick(e) {
  if (e.target === pop) {
    close();
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'close') {
    close();
    return;
  }
  if (act === 'theme') {
    prefs.theme = pick(THEMES, el.dataset.t, prefs.theme);
  } else if (act === 'font') {
    prefs.font = pick(FONTS, el.dataset.v, prefs.font);
  } else if (act === 'set') {
    if (el.dataset.key === 'icons') prefs.icons = pick(ICON_SETS, el.dataset.v, prefs.icons);
    else if (el.dataset.key === 'guides') prefs.guides = pick(GUIDES, el.dataset.v, prefs.guides);
    else if (el.dataset.key === 'scope') prefs.scope = pick(SCOPES, el.dataset.v, prefs.scope);
    else return;
  } else if (act === 'flag') {
    if (FLAGS.indexOf(el.dataset.key) === -1) return;
    prefs[el.dataset.key] = !prefs[el.dataset.key];
  } else if (act === 'reset') {
    prefs = Object.assign({}, DEFAULTS);
  } else {
    return;
  }
  commit();
}

function onPopOver(e) {
  const card = e.target.closest ? e.target.closest('.ith-card') : null;
  const font = e.target.closest ? e.target.closest('.ith-font') : null;
  const t = card ? card.dataset.t : null;
  const f = font ? font.dataset.v : null;
  if (t === hover.theme && f === hover.font) return;
  hover.theme = t;
  hover.font = f;
  updatePreview();
}

function onPopLeave() {
  if (hover.theme === null && hover.font === null) return;
  hover.theme = null;
  hover.font = null;
  updatePreview();
}

function build() {
  if (pop) return;
  pop = document.createElement('div');
  pop.className = 'ide-th-modal';
  pop.hidden = true;
  pop.innerHTML = modalHtml();
  pop.addEventListener('click', onPopClick);
  pop.addEventListener('mouseover', onPopOver);
  pop.addEventListener('mouseleave', onPopLeave);
  document.body.appendChild(pop);
}

export function isOpen() {
  return !!pop && !pop.hidden;
}

export function close() {
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  hover.theme = null;
  hover.font = null;
  if (btn) btn.classList.remove('on');
}

export function open() {
  document.dispatchEvent(new CustomEvent('ide:close-search'));
  build();
  pop.hidden = false;
  if (btn) btn.classList.add('on');
  paintAppVars();
  sync();
}

function toggle() {
  if (isOpen()) close();
  else open();
}

function onKey(e) {
  if (e.key !== 'Escape' || !isOpen()) return;
  e.preventDefault();
  e.stopPropagation();
  close();
}

function makeBtn() {
  btn = document.createElement('button');
  btn.id = 'ideThemeBtn';
  btn.type = 'button';
  btn.className = 'tool-btn ide-th-btn';
  btn.title = 'IDE theme: colors, font, icons and guides';
  btn.setAttribute('aria-label', 'IDE theme');
  btn.innerHTML = ICON_SVG;
  btn.addEventListener('click', toggle);
}

function placeBtn() {
  const ext = document.getElementById('ideExtBtn');
  if (!ext || !ext.parentElement) return false;
  if (!btn) makeBtn();
  if (btn.parentElement !== ext.parentElement) ext.parentElement.appendChild(btn);
  return true;
}

function run() {
  injectCss();
  apply(true);
  document.addEventListener('ide:close-search', close);
  document.addEventListener('keydown', onKey, true);
  let ticks = 0;
  const timer = setInterval(() => {
    ticks++;
    if (placeBtn() || ticks > 60) clearInterval(timer);
  }, 400);
  placeBtn();
}

export function init() {
  if (started) return;
  started = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}