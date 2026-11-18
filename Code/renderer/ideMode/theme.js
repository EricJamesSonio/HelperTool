const LS_KEY = 'helpertool-ide-theme';
const CSS_ID = 'ideThemeCss';

const THEMES = [
  { id: 'app', name: 'App theme', tone: 'dark' },
  { id: 'darkplus', name: 'Dark+', tone: 'dark' },
  { id: 'onedark', name: 'One Dark', tone: 'dark' },
  { id: 'dracula', name: 'Dracula', tone: 'dark' },
  { id: 'monokai', name: 'Monokai', tone: 'dark' },
  { id: 'nightowl', name: 'Night Owl', tone: 'dark' },
  { id: 'synthwave', name: 'Synthwave', tone: 'dark' },
  { id: 'cobalt', name: 'Cobalt', tone: 'dark' },
  { id: 'tokyo', name: 'Tokyo Night', tone: 'dark' },
  { id: 'ember', name: 'Ember', tone: 'dark' },
  { id: 'solardark', name: 'Solarized Dark', tone: 'dark' },
  { id: 'ghdark', name: 'GitHub Dark', tone: 'dark' },
  { id: 'ghlight', name: 'GitHub Light', tone: 'light' },
  { id: 'lightplus', name: 'Light+', tone: 'light' },
  { id: 'daylight', name: 'Daylight', tone: 'light' },
  { id: 'sollight', name: 'Solarized Light', tone: 'light' },
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

const FLAGS = ['ruler', 'chrome', 'shell'];

const DEFAULTS = {
  theme: 'app',
  font: 'default',
  icons: 'classic',
  guides: 'normal',
  ruler: true,
  chrome: true,
  shell: true,
};

const APP_CARD_MAP = [
  ['--th-bg', '--bg-base'],
  ['--th-fg', '--text-primary'],
  ['--th-fg2', '--text-secondary'],
  ['--th-mu', '--text-muted'],
  ['--th-ac', '--accent'],
  ['--sx-c', '--text-muted'],
  ['--sx-s', '--green'],
  ['--sx-n', '--yellow'],
  ['--sx-k', '--purple'],
  ['--sx-f', '--blue'],
];

const ICON_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2a5.8 5.8 0 1 0 0 11.6c.9 0 1.3-.6 1.3-1.2 0-.9-.7-1.1-.7-1.9 0-.7.6-1.2 1.4-1.2h1.3A2.6 2.6 0 0 0 13.9 7C13.9 4.3 11.3 2.2 8 2.2z"/><circle cx="5" cy="7.2" r=".6" fill="currentColor"/><circle cx="7.5" cy="4.9" r=".6" fill="currentColor"/><circle cx="10.6" cy="5.6" r=".6" fill="currentColor"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

let prefs = load();
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
  return '<div class="ith-row"><span>' + label + '</span>' +
    '<button type="button" class="ith-sw" data-act="flag" data-key="' + key + '" role="switch" aria-checked="false"><i></i></button></div>';
}

function modalHtml() {
  const dark = THEMES.filter((t) => t.tone === 'dark').map(cardHtml).join('');
  const light = THEMES.filter((t) => t.tone === 'light').map(cardHtml).join('');
  const fonts = FONTS.map(fontHtml).join('');
  return '<div class="ith-box" role="dialog" aria-modal="true" aria-label="IDE theme">' +
    '<div class="ith-head">' +
      '<span class="ith-title">IDE theme</span>' +
      '<span class="ith-sub">Only applies while IDE mode is on</span>' +
      '<span class="ith-spacer"></span>' +
      '<button type="button" class="ith-reset" data-act="reset">Reset</button>' +
      '<button type="button" class="ith-x" data-act="close" title="Close (Esc)" aria-label="Close">' + CLOSE_SVG + '</button>' +
    '</div>' +
    '<div class="ith-body">' +
      '<aside class="ith-side">' +
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
        '<div class="ith-sec ith-sec-first">Dark themes</div><div class="ith-grid">' + dark + '</div>' +
        '<div class="ith-sec">Light themes</div><div class="ith-grid">' + light + '</div>' +
      '</section>' +
    '</div>' +
  '</div>';
}

function paintAppCard() {
  if (!pop) return;
  const card = pop.querySelector('.ith-card[data-t="app"]');
  if (!card) return;
  const cs = getComputedStyle(document.documentElement);
  for (const pair of APP_CARD_MAP) {
    const v = cs.getPropertyValue(pair[1]).trim();
    if (v) card.style.setProperty(pair[0], v);
  }
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

function build() {
  if (pop) return;
  pop = document.createElement('div');
  pop.className = 'ide-th-modal';
  pop.hidden = true;
  pop.innerHTML = modalHtml();
  pop.addEventListener('click', onPopClick);
  document.body.appendChild(pop);
}

export function isOpen() {
  return !!pop && !pop.hidden;
}

export function close() {
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  if (btn) btn.classList.remove('on');
}

export function open() {
  document.dispatchEvent(new CustomEvent('ide:close-search'));
  build();
  pop.hidden = false;
  if (btn) btn.classList.add('on');
  paintAppCard();
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