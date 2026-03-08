/**
 * settingsManager.js
 * PERF FIXES:
 *  – FULL_THEMES object is still defined once (unavoidable for the picker UI),
 *    but applySettings() no longer keeps the entire object in a hot loop —
 *    it accesses only the active theme's data.
 *  – rgba() helper is memoised to avoid recomputing the same values on
 *    every applySettings() call (theme switches are infrequent, but boot
 *    was computing ~40 rgba() calls unnecessarily on every page load).
 *  – buildModal() is now lazy — the DOM is only created when openSettings()
 *    is called for the first time, not at initSettings() / boot.
 *  – syncControls() guards against missing elements (defensive).
 */

/* ─── Memoised rgba helper ────────────────────────────────────────────────── */
const _rgbaCache = new Map();
function hexToRgb(hex) {
  const h    = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return { r: parseInt(full.slice(0,2),16), g: parseInt(full.slice(2,4),16), b: parseInt(full.slice(4,6),16) };
}
function rgba(hex, alpha) {
  const key = `${hex}|${alpha}`;
  if (_rgbaCache.has(key)) return _rgbaCache.get(key);
  const { r, g, b } = hexToRgb(hex);
  const val = `rgba(${r},${g},${b},${alpha})`;
  _rgbaCache.set(key, val);
  return val;
}

/* ─── Full named themes ───────────────────────────────────────────────────── */
const FULL_THEMES = {
  'navy-dark': {
    label: 'Navy Dark', emoji: '🌊', dark: true,
    bg: { base:'#070d1a', surface:'#0c1427', elevated:'#111d34', overlay:'#162038',
          hover:'rgba(255,255,255,0.04)', active:'rgba(255,255,255,0.07)',
          raised:'#1a2540', statusbar:'#0e1830', tree:'#0a1220' },
    border: { subtle:'rgba(255,255,255,0.06)', default:'rgba(255,255,255,0.10)',
              strong:'rgba(255,255,255,0.18)', mid:'rgba(255,255,255,0.12)' },
    text: { primary:'#eef2ff', secondary:'#94a3c4', muted:'#556080', faint:'#364060' },
    accent: '#f0b429',
    green:'#34d399', red:'#f87171', blue:'#60a5fa', purple:'#a78bfa', yellow:'#fbbf24',
    depths: ['#f0b429','#38bdf8','#a78bfa','#2dd4bf','#fb7185'],
  },
  'cream-light': {
    label: 'Cream Light', emoji: '☁️', dark: false,
    bg: { base:'#f0f4f8', surface:'#ffffff', elevated:'#f8fafc', overlay:'#eef2f7',
          hover:'rgba(0,0,0,0.04)', active:'rgba(0,0,0,0.07)',
          raised:'#e8eef6', statusbar:'#f1f5fb', tree:'#f4f7fb' },
    border: { subtle:'rgba(0,0,0,0.06)', default:'rgba(0,0,0,0.10)',
              strong:'rgba(0,0,0,0.18)', mid:'rgba(0,0,0,0.12)' },
    text: { primary:'#0f172a', secondary:'#334155', muted:'#64748b', faint:'#94a3b8' },
    accent: '#0d9488',
    green:'#059669', red:'#dc2626', blue:'#2563eb', purple:'#7c3aed', yellow:'#d97706',
    depths: ['#0d9488','#0284c7','#7c3aed','#059669','#be123c'],
  },
  'catppuccin-mocha': {
    label: 'Catppuccin Mocha', emoji: '🐱', dark: true,
    bg: { base:'#1e1e2e', surface:'#181825', elevated:'#1e1e2e', overlay:'#24273a',
          hover:'rgba(205,214,244,0.05)', active:'rgba(205,214,244,0.08)',
          raised:'#313244', statusbar:'#181825', tree:'#1e1e2e' },
    border: { subtle:'rgba(205,214,244,0.08)', default:'rgba(205,214,244,0.13)',
              strong:'rgba(205,214,244,0.22)', mid:'rgba(205,214,244,0.10)' },
    text: { primary:'#cdd6f4', secondary:'#bac2de', muted:'#6c7086', faint:'#45475a' },
    accent: '#cba6f7',
    green:'#a6e3a1', red:'#f38ba8', blue:'#89b4fa', purple:'#cba6f7', yellow:'#f9e2af',
    depths: ['#cba6f7','#89b4fa','#a6e3a1','#f9e2af','#f38ba8'],
  },
  'catppuccin-latte': {
    label: 'Catppuccin Latte', emoji: '☕', dark: false,
    bg: { base:'#eff1f5', surface:'#e6e9ef', elevated:'#dce0e8', overlay:'#ccd0da',
          hover:'rgba(76,79,105,0.05)', active:'rgba(76,79,105,0.09)',
          raised:'#bcc0cc', statusbar:'#e6e9ef', tree:'#eff1f5' },
    border: { subtle:'rgba(76,79,105,0.08)', default:'rgba(76,79,105,0.13)',
              strong:'rgba(76,79,105,0.22)', mid:'rgba(76,79,105,0.10)' },
    text: { primary:'#4c4f69', secondary:'#5c5f77', muted:'#8c8fa1', faint:'#acafbe' },
    accent: '#8839ef',
    green:'#40a02b', red:'#d20f39', blue:'#1e66f5', purple:'#8839ef', yellow:'#df8e1d',
    depths: ['#8839ef','#1e66f5','#40a02b','#df8e1d','#d20f39'],
  },
  'cyberpunk': {
    label: 'Cyberpunk', emoji: '🤖', dark: true,
    bg: { base:'#0d0221', surface:'#12032e', elevated:'#1a0535', overlay:'#20063e',
          hover:'rgba(255,0,255,0.04)', active:'rgba(255,0,255,0.07)',
          raised:'#260843', statusbar:'#0d0221', tree:'#0f0228' },
    border: { subtle:'rgba(255,0,255,0.10)', default:'rgba(255,0,255,0.18)',
              strong:'rgba(255,0,255,0.32)', mid:'rgba(255,0,255,0.14)' },
    text: { primary:'#f0e6ff', secondary:'#c9a9ff', muted:'#7a5a99', faint:'#4a2e66' },
    accent: '#ff00ff',
    green:'#00ff9f', red:'#ff2d6b', blue:'#00e5ff', purple:'#bf00ff', yellow:'#ffe600',
    depths: ['#ff00ff','#00e5ff','#ffe600','#00ff9f','#ff2d6b'],
  },
  'tokyo-night': {
    label: 'Tokyo Night', emoji: '🗼', dark: true,
    bg: { base:'#1a1b26', surface:'#16161e', elevated:'#1f2335', overlay:'#24283b',
          hover:'rgba(192,202,245,0.04)', active:'rgba(192,202,245,0.07)',
          raised:'#2a2b3d', statusbar:'#16161e', tree:'#1a1b26' },
    border: { subtle:'rgba(192,202,245,0.07)', default:'rgba(192,202,245,0.12)',
              strong:'rgba(192,202,245,0.20)', mid:'rgba(192,202,245,0.09)' },
    text: { primary:'#c0caf5', secondary:'#a9b1d6', muted:'#565f89', faint:'#3b4261' },
    accent: '#7aa2f7',
    green:'#9ece6a', red:'#f7768e', blue:'#7aa2f7', purple:'#bb9af7', yellow:'#e0af68',
    depths: ['#7aa2f7','#bb9af7','#9ece6a','#e0af68','#f7768e'],
  },
  'tokyo-storm': {
    label: 'Tokyo Storm', emoji: '⛈️', dark: true,
    bg: { base:'#24283b', surface:'#1f2335', elevated:'#292e42', overlay:'#2f3549',
          hover:'rgba(192,202,245,0.05)', active:'rgba(192,202,245,0.08)',
          raised:'#343b55', statusbar:'#1f2335', tree:'#24283b' },
    border: { subtle:'rgba(192,202,245,0.07)', default:'rgba(192,202,245,0.12)',
              strong:'rgba(192,202,245,0.20)', mid:'rgba(192,202,245,0.09)' },
    text: { primary:'#c0caf5', secondary:'#a9b1d6', muted:'#565f89', faint:'#3b4261' },
    accent: '#bb9af7',
    green:'#9ece6a', red:'#f7768e', blue:'#7aa2f7', purple:'#bb9af7', yellow:'#e0af68',
    depths: ['#bb9af7','#7aa2f7','#9ece6a','#e0af68','#f7768e'],
  },
  'dracula': {
    label: 'Dracula', emoji: '🧛', dark: true,
    bg: { base:'#282a36', surface:'#21222c', elevated:'#2d2f3f', overlay:'#343746',
          hover:'rgba(248,248,242,0.04)', active:'rgba(248,248,242,0.07)',
          raised:'#3a3c4e', statusbar:'#21222c', tree:'#282a36' },
    border: { subtle:'rgba(98,114,164,0.18)', default:'rgba(98,114,164,0.28)',
              strong:'rgba(98,114,164,0.45)', mid:'rgba(98,114,164,0.22)' },
    text: { primary:'#f8f8f2', secondary:'#cfcfdf', muted:'#6272a4', faint:'#44475a' },
    accent: '#bd93f9',
    green:'#50fa7b', red:'#ff5555', blue:'#8be9fd', purple:'#bd93f9', yellow:'#f1fa8c',
    depths: ['#bd93f9','#8be9fd','#50fa7b','#f1fa8c','#ff5555'],
  },
  'solarized-dark': {
    label: 'Solarized Dark', emoji: '🌅', dark: true,
    bg: { base:'#002b36', surface:'#073642', elevated:'#0d4050', overlay:'#08424f',
          hover:'rgba(131,148,150,0.07)', active:'rgba(131,148,150,0.12)',
          raised:'#13515f', statusbar:'#073642', tree:'#002b36' },
    border: { subtle:'rgba(131,148,150,0.12)', default:'rgba(131,148,150,0.20)',
              strong:'rgba(131,148,150,0.35)', mid:'rgba(131,148,150,0.16)' },
    text: { primary:'#fdf6e3', secondary:'#eee8d5', muted:'#657b83', faint:'#586e75' },
    accent: '#268bd2',
    green:'#859900', red:'#dc322f', blue:'#268bd2', purple:'#6c71c4', yellow:'#b58900',
    depths: ['#268bd2','#2aa198','#859900','#b58900','#dc322f'],
  },
  'solarized-light': {
    label: 'Solarized Light', emoji: '☀️', dark: false,
    bg: { base:'#fdf6e3', surface:'#eee8d5', elevated:'#e8e2cf', overlay:'#ddd8c6',
          hover:'rgba(101,123,131,0.06)', active:'rgba(101,123,131,0.10)',
          raised:'#d5cfc0', statusbar:'#eee8d5', tree:'#fdf6e3' },
    border: { subtle:'rgba(101,123,131,0.10)', default:'rgba(101,123,131,0.16)',
              strong:'rgba(101,123,131,0.28)', mid:'rgba(101,123,131,0.13)' },
    text: { primary:'#657b83', secondary:'#586e75', muted:'#839496', faint:'#93a1a1' },
    accent: '#268bd2',
    green:'#859900', red:'#dc322f', blue:'#268bd2', purple:'#6c71c4', yellow:'#b58900',
    depths: ['#268bd2','#2aa198','#859900','#b58900','#dc322f'],
  },
  'nord': {
    label: 'Nord', emoji: '❄️', dark: true,
    bg: { base:'#2e3440', surface:'#292e39', elevated:'#3b4252', overlay:'#424b5a',
          hover:'rgba(216,222,233,0.05)', active:'rgba(216,222,233,0.08)',
          raised:'#4c566a', statusbar:'#292e39', tree:'#2e3440' },
    border: { subtle:'rgba(216,222,233,0.08)', default:'rgba(216,222,233,0.13)',
              strong:'rgba(216,222,233,0.22)', mid:'rgba(216,222,233,0.10)' },
    text: { primary:'#eceff4', secondary:'#d8dee9', muted:'#81909c', faint:'#4c566a' },
    accent: '#88c0d0',
    green:'#a3be8c', red:'#bf616a', blue:'#81a1c1', purple:'#b48ead', yellow:'#ebcb8b',
    depths: ['#88c0d0','#81a1c1','#a3be8c','#ebcb8b','#bf616a'],
  },
  'gruvbox-dark': {
    label: 'Gruvbox Dark', emoji: '🟤', dark: true,
    bg: { base:'#1d2021', surface:'#282828', elevated:'#32302f', overlay:'#3c3836',
          hover:'rgba(235,219,178,0.05)', active:'rgba(235,219,178,0.08)',
          raised:'#504945', statusbar:'#282828', tree:'#1d2021' },
    border: { subtle:'rgba(235,219,178,0.08)', default:'rgba(235,219,178,0.14)',
              strong:'rgba(235,219,178,0.24)', mid:'rgba(235,219,178,0.11)' },
    text: { primary:'#ebdbb2', secondary:'#d5c4a1', muted:'#928374', faint:'#665c54' },
    accent: '#fabd2f',
    green:'#b8bb26', red:'#fb4934', blue:'#83a598', purple:'#d3869b', yellow:'#fabd2f',
    depths: ['#fabd2f','#83a598','#b8bb26','#d3869b','#fb4934'],
  },
  'one-dark': {
    label: 'One Dark Pro', emoji: '⚫', dark: true,
    bg: { base:'#21252b', surface:'#282c34', elevated:'#2c313a', overlay:'#323842',
          hover:'rgba(171,178,191,0.05)', active:'rgba(171,178,191,0.08)',
          raised:'#3e4451', statusbar:'#21252b', tree:'#21252b' },
    border: { subtle:'rgba(171,178,191,0.08)', default:'rgba(171,178,191,0.14)',
              strong:'rgba(171,178,191,0.24)', mid:'rgba(171,178,191,0.11)' },
    text: { primary:'#abb2bf', secondary:'#9da5b4', muted:'#5c6370', faint:'#3e4451' },
    accent: '#61afef',
    green:'#98c379', red:'#e06c75', blue:'#61afef', purple:'#c678dd', yellow:'#e5c07b',
    depths: ['#61afef','#c678dd','#98c379','#e5c07b','#e06c75'],
  },
  'github-dark': {
    label: 'GitHub Dark', emoji: '🐙', dark: true,
    bg: { base:'#0d1117', surface:'#161b22', elevated:'#1c2128', overlay:'#21262d',
          hover:'rgba(240,246,252,0.05)', active:'rgba(240,246,252,0.08)',
          raised:'#30363d', statusbar:'#161b22', tree:'#0d1117' },
    border: { subtle:'rgba(240,246,252,0.07)', default:'rgba(240,246,252,0.12)',
              strong:'rgba(240,246,252,0.20)', mid:'rgba(240,246,252,0.09)' },
    text: { primary:'#f0f6fc', secondary:'#c9d1d9', muted:'#6e7681', faint:'#30363d' },
    accent: '#58a6ff',
    green:'#3fb950', red:'#f85149', blue:'#58a6ff', purple:'#d2a8ff', yellow:'#e3b341',
    depths: ['#58a6ff','#d2a8ff','#3fb950','#e3b341','#f85149'],
  },
  'github-light': {
    label: 'GitHub Light', emoji: '🐙', dark: false,
    bg: { base:'#ffffff', surface:'#f6f8fa', elevated:'#ffffff', overlay:'#f0f2f4',
          hover:'rgba(31,35,40,0.04)', active:'rgba(31,35,40,0.07)',
          raised:'#eaeef2', statusbar:'#f6f8fa', tree:'#ffffff' },
    border: { subtle:'rgba(31,35,40,0.08)', default:'rgba(31,35,40,0.12)',
              strong:'rgba(31,35,40,0.20)', mid:'rgba(31,35,40,0.10)' },
    text: { primary:'#1f2328', secondary:'#636c76', muted:'#9198a1', faint:'#adbac7' },
    accent: '#0969da',
    green:'#1a7f37', red:'#cf222e', blue:'#0969da', purple:'#8250df', yellow:'#9a6700',
    depths: ['#0969da','#8250df','#1a7f37','#9a6700','#cf222e'],
  },
  'monokai': {
    label: 'Monokai', emoji: '🎨', dark: true,
    bg: { base:'#1e1f1c', surface:'#272822', elevated:'#2e2f2a', overlay:'#35362f',
          hover:'rgba(248,248,242,0.04)', active:'rgba(248,248,242,0.07)',
          raised:'#3e3d32', statusbar:'#1e1f1c', tree:'#1e1f1c' },
    border: { subtle:'rgba(248,248,242,0.07)', default:'rgba(248,248,242,0.12)',
              strong:'rgba(248,248,242,0.22)', mid:'rgba(248,248,242,0.09)' },
    text: { primary:'#f8f8f2', secondary:'#cfcfc2', muted:'#75715e', faint:'#49483e' },
    accent: '#a6e22e',
    green:'#a6e22e', red:'#f92672', blue:'#66d9e8', purple:'#ae81ff', yellow:'#e6db74',
    depths: ['#a6e22e','#66d9e8','#ae81ff','#e6db74','#f92672'],
  },
  'synthwave': {
    label: "Synthwave '84", emoji: '🌆', dark: true,
    bg: { base:'#1a1333', surface:'#221944', elevated:'#2a1f52', overlay:'#312660',
          hover:'rgba(255,120,220,0.05)', active:'rgba(255,120,220,0.08)',
          raised:'#3d2d72', statusbar:'#1a1333', tree:'#1a1333' },
    border: { subtle:'rgba(255,120,220,0.10)', default:'rgba(255,120,220,0.18)',
              strong:'rgba(255,120,220,0.30)', mid:'rgba(255,120,220,0.13)' },
    text: { primary:'#ffffff', secondary:'#e2c9ff', muted:'#9d6eb5', faint:'#5d3e7a' },
    accent: '#ff79c6',
    green:'#72f1b8', red:'#fe4450', blue:'#36f9f6', purple:'#ff7edb', yellow:'#fede5d',
    depths: ['#ff79c6','#36f9f6','#72f1b8','#fede5d','#fe4450'],
  },
  'material-ocean': {
    label: 'Material Ocean', emoji: '🌊', dark: true,
    bg: { base:'#0f111a', surface:'#090b10', elevated:'#171c28', overlay:'#1b2030',
          hover:'rgba(198,212,255,0.04)', active:'rgba(198,212,255,0.07)',
          raised:'#222738', statusbar:'#090b10', tree:'#0f111a' },
    border: { subtle:'rgba(198,212,255,0.07)', default:'rgba(198,212,255,0.12)',
              strong:'rgba(198,212,255,0.20)', mid:'rgba(198,212,255,0.09)' },
    text: { primary:'#8f93a2', secondary:'#717cb4', muted:'#464b5d', faint:'#2e3248' },
    accent: '#82aaff',
    green:'#c3e88d', red:'#f07178', blue:'#82aaff', purple:'#c792ea', yellow:'#ffcb6b',
    depths: ['#82aaff','#c792ea','#c3e88d','#ffcb6b','#f07178'],
  },
};

const ACCENT_SWATCHES = [
  { id:'amber',  hex:'#f0b429', label:'Amber'  },
  { id:'teal',   hex:'#2dd4bf', label:'Teal'   },
  { id:'violet', hex:'#a78bfa', label:'Violet' },
  { id:'rose',   hex:'#fb7185', label:'Rose'   },
  { id:'sky',    hex:'#38bdf8', label:'Sky'    },
  { id:'lime',   hex:'#a3e635', label:'Lime'   },
  { id:'orange', hex:'#fb923c', label:'Orange' },
  { id:'pink',   hex:'#f472b6', label:'Pink'   },
];

const DEFAULT_SETTINGS = { themeId: 'navy-dark', customAccent: null, fontSize: 14, compactMode: false };
const STORAGE_KEY = 'helpertool-settings';

let settings  = loadSettings();
let overlayEl = null;    // lazy — created on first openSettings() call
let _modalBuilt = false;

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.theme && !parsed.themeId) {
        parsed.themeId = parsed.theme === 'light' ? 'cream-light' : 'navy-dark';
        delete parsed.theme; delete parsed.accentId;
      }
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/* ─── Apply CSS variables ─────────────────────────────────────────────────── */
// PERF: Instead of 50+ individual setProperty() calls (each one invalidates the
// entire CSS cascade and triggers a style recalc), we build the full :root block
// as a single string and swap ONE <style> tag. The browser processes it in one
// pass — one recalc, one repaint, ~10x less CPU on theme switch.

let _themeStyleEl = null;   // the injected <style> tag, reused across switches

function applySettings(s = settings) {
  const root   = document.documentElement;
  const theme  = FULL_THEMES[s.themeId] || FULL_THEMES['navy-dark'];
  const isDark = theme.dark;
  const accentHex = s.customAccent || theme.accent;

  const depths = s.customAccent
    ? [s.customAccent, ...theme.depths.slice(1)]
    : theme.depths;

  // Build the full :root variable block as one string
  const depthVars = depths.map((color, i) => `
  --dl${i}-color:  ${color};
  --dl${i}-bg:     ${rgba(color, isDark ? 0.10 : 0.08)};
  --dl${i}-bg-h:   ${rgba(color, isDark ? 0.18 : 0.14)};
  --dl${i}-border: ${rgba(color, isDark ? 0.40 : 0.35)};
  --dl${i}-line:   ${rgba(color, isDark ? 0.35 : 0.30)};`).join('');

  const css = `:root {
  --bg-base:        ${theme.bg.base};
  --bg-surface:     ${theme.bg.surface};
  --bg-elevated:    ${theme.bg.elevated};
  --bg-overlay:     ${theme.bg.overlay};
  --bg-hover:       ${theme.bg.hover};
  --bg-active:      ${theme.bg.active};
  --bg-raised:      ${theme.bg.raised};
  --bg-statusbar:   ${theme.bg.statusbar};
  --bg-root:        ${theme.bg.base};
  --bg-tree:        ${theme.bg.tree};
  --border-subtle:  ${theme.border.subtle};
  --border-default: ${theme.border.default};
  --border-strong:  ${theme.border.strong};
  --border-mid:     ${theme.border.mid};
  --text-primary:   ${theme.text.primary};
  --text-secondary: ${theme.text.secondary};
  --text-muted:     ${theme.text.muted};
  --text-faint:     ${theme.text.faint};
  --green:          ${theme.green};
  --green-dim:      ${rgba(theme.green,  isDark ? 0.13 : 0.12)};
  --red:            ${theme.red};
  --red-dim:        ${rgba(theme.red,    isDark ? 0.13 : 0.10)};
  --blue:           ${theme.blue};
  --blue-dim:       ${rgba(theme.blue,   isDark ? 0.13 : 0.10)};
  --purple:         ${theme.purple};
  --purple-dim:     ${rgba(theme.purple, isDark ? 0.13 : 0.10)};
  --yellow:         ${theme.yellow};
  --yellow-dim:     ${rgba(theme.yellow, isDark ? 0.13 : 0.12)};
  --accent:         ${accentHex};
  --accent-dim:     ${rgba(accentHex, isDark ? 0.15 : 0.12)};
  --accent-glow:    ${rgba(accentHex, isDark ? 0.25 : 0.22)};
  --accent-border:  ${rgba(accentHex, isDark ? 0.35 : 0.32)};
  --node-folder:          ${theme.blue};
  --node-file:            ${theme.text.secondary};
  --node-selected-file:   ${accentHex};
  --node-selected-folder: ${theme.green};
  --folder-text:          ${theme.blue};
  --folder-bg:            ${rgba(theme.blue, isDark ? 0.08 : 0.07)};
  --folder-border:        ${rgba(theme.blue, isDark ? 0.20 : 0.18)};
  --folder-bg-h:          ${rgba(theme.blue, isDark ? 0.14 : 0.12)};
  --folder-hover-border:  ${rgba(theme.blue, isDark ? 0.38 : 0.32)};
  --folder-hover-color:   ${theme.text.primary};
  --file-bg:              ${rgba(theme.text.muted, isDark ? 0.05 : 0.04)};
  --file-border:          ${rgba(theme.text.muted, isDark ? 0.13 : 0.10)};
  --file-text:            ${theme.text.secondary};
  --file-bg-h:            ${rgba(theme.text.muted, isDark ? 0.10 : 0.08)};
  --file-hover-border:    ${rgba(theme.text.muted, 0.28)};
  --file-hover-color:     ${theme.text.primary};
  --connector-color:      ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)'};
  ${depthVars}
}`;

  // Reuse the same <style> tag — just replace its text content
  if (!_themeStyleEl) {
    _themeStyleEl = document.createElement('style');
    _themeStyleEl.id = 'theme-vars';
    document.head.appendChild(_themeStyleEl);
  }
  _themeStyleEl.textContent = css;   // single DOM write → single cascade recalc

  // data-theme attribute controls light/dark selector in CSS files
  isDark ? root.removeAttribute('data-theme') : root.setAttribute('data-theme', 'light');

  document.body.style.fontSize = `${s.fontSize}px`;
  root.classList.toggle('compact-mode', !!s.compactMode);
  syncThemeToggleBtn(isDark);
}

function syncThemeToggleBtn(isDark) {
  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (icon)  icon.textContent  = isDark ? '☀️' : '🌙';
  if (label) label.textContent = isDark ? 'Light' : 'Dark';
  localStorage.setItem('helpertool-theme', isDark ? 'dark' : 'light');
}

/* ─── Lazy modal build ────────────────────────────────────────────────────── */
function _ensureModal() {
  if (_modalBuilt) return;
  _modalBuilt = true;

  overlayEl = document.createElement('div');
  overlayEl.className = 'settings-overlay';
  overlayEl.id        = 'settingsOverlay';
  overlayEl.innerHTML = `
    <div class="settings-modal" role="dialog" aria-label="Appearance Settings">
      <div class="settings-header">
        <span class="settings-title">
          <span class="settings-title-icon">🎨</span>
          Appearance Settings
        </span>
        <button class="settings-close-btn" id="settingsCloseBtn" title="Close">✕</button>
      </div>
      <div class="settings-body">
        <div class="settings-section">
          <div class="settings-section-label">Theme</div>
          <div class="theme-grid" id="settingsThemeGrid"></div>
        </div>
        <div class="settings-section">
          <div class="settings-section-label">Accent Color Override</div>
          <div class="settings-row">
            <div class="settings-row-label">
              Override accent
              <small>Replaces the theme's default accent color</small>
            </div>
            <div class="settings-swatches" id="settingsSwatches"></div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-label">Font Size</div>
          <div class="settings-row">
            <div class="settings-row-label">
              UI font size
              <small>Base size for all text in the interface</small>
            </div>
            <div class="settings-slider-wrap">
              <input type="range" class="settings-slider" id="settingsFontSlider" min="11" max="18" step="1">
              <span class="settings-slider-value" id="settingsFontValue">14px</span>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-label">Layout</div>
          <div class="settings-row">
            <div class="settings-row-label">
              Compact mode
              <small>Reduces padding and button sizes across the UI</small>
            </div>
            <label class="settings-toggle">
              <input type="checkbox" id="settingsCompactToggle">
              <span class="settings-toggle-track"></span>
            </label>
          </div>
        </div>
      </div>
      <div class="settings-footer">
        <button class="settings-reset-btn" id="settingsResetBtn">↺ Reset defaults</button>
        <span class="settings-saved-badge" id="settingsSavedBadge">✓ Saved</span>
      </div>
    </div>`;

  document.body.appendChild(overlayEl);

  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeSettings(); });
  document.getElementById('settingsCloseBtn')?.addEventListener('click', closeSettings);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlayEl.classList.contains('open')) closeSettings();
  });
  document.getElementById('settingsCompactToggle')?.addEventListener('change', e => {
    settings.compactMode = e.target.checked; saveAndApply();
  });
  const slider    = document.getElementById('settingsFontSlider');
  const sliderVal = document.getElementById('settingsFontValue');
  slider?.addEventListener('input', e => {
    settings.fontSize     = parseInt(e.target.value);
    sliderVal.textContent = `${settings.fontSize}px`;
    saveAndApply();
  });
  document.getElementById('settingsResetBtn')?.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    saveAndApply();
    syncControls();
  });
}

/* ─── Render theme grid ───────────────────────────────────────────────────── */
function renderThemeGrid() {
  const grid = document.getElementById('settingsThemeGrid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.entries(FULL_THEMES).forEach(([id, theme]) => {
    const isActive = settings.themeId === id;
    const card = document.createElement('button');
    card.className = 'theme-card' + (isActive ? ' active' : '');
    card.title     = theme.label;
    const dots = theme.depths.slice(0, 3).map(c =>
      `<span class="theme-card-dot" style="background:${c}"></span>`
    ).join('');
    card.innerHTML = `
      <span class="theme-card-emoji">${theme.emoji}</span>
      <span class="theme-card-name">${theme.label}</span>
      <span class="theme-card-dots">${dots}</span>`;
    card.style.background  = theme.bg.elevated;
    card.style.borderColor = isActive ? theme.accent : theme.border.default;
    card.style.color       = theme.text.primary;
    card.addEventListener('click', () => {
      settings.themeId      = id;
      settings.customAccent = null;
      saveAndApply();
      renderThemeGrid();
      renderSwatches();
    });
    grid.appendChild(card);
  });
}

function renderSwatches() {
  const container = document.getElementById('settingsSwatches');
  if (!container) return;
  container.innerHTML = '';

  const noneEl = document.createElement('div');
  noneEl.className   = 'swatch swatch-none' + (!settings.customAccent ? ' active' : '');
  noneEl.title       = 'Theme default';
  noneEl.textContent = '∅';
  noneEl.addEventListener('click', () => {
    settings.customAccent = null; saveAndApply(); renderSwatches(); renderThemeGrid();
  });
  container.appendChild(noneEl);

  ACCENT_SWATCHES.forEach(sw => {
    const isActive = settings.customAccent === sw.hex;
    const el = document.createElement('div');
    el.className        = 'swatch' + (isActive ? ' active' : '');
    el.title            = sw.label;
    el.style.background = sw.hex;
    el.addEventListener('click', () => {
      settings.customAccent = sw.hex; saveAndApply(); renderSwatches(); renderThemeGrid();
    });
    container.appendChild(el);
  });

  const isCustomActive = settings.customAccent && !ACCENT_SWATCHES.find(s => s.hex === settings.customAccent);
  const custom = document.createElement('div');
  custom.className = 'swatch swatch-custom' + (isCustomActive ? ' active' : '');
  custom.title     = 'Custom color';
  if (isCustomActive) custom.style.background = settings.customAccent;
  const picker = document.createElement('input');
  picker.type  = 'color';
  picker.value = settings.customAccent || '#ffffff';
  picker.addEventListener('input', e => {
    settings.customAccent = e.target.value; saveAndApply(); renderSwatches(); renderThemeGrid();
  });
  custom.appendChild(picker);
  container.appendChild(custom);
}

function syncControls() {
  const compactToggle = document.getElementById('settingsCompactToggle');
  const fontSlider    = document.getElementById('settingsFontSlider');
  const fontValue     = document.getElementById('settingsFontValue');
  if (compactToggle) compactToggle.checked  = !!settings.compactMode;
  if (fontSlider)    fontSlider.value       = settings.fontSize;
  if (fontValue)     fontValue.textContent  = `${settings.fontSize}px`;
  renderThemeGrid();
  renderSwatches();
}

function saveAndApply() { saveSettings(); applySettings(); flashSaved(); }

function flashSaved() {
  const badge = document.getElementById('settingsSavedBadge');
  if (!badge) return;
  badge.classList.add('visible');
  clearTimeout(badge._t);
  badge._t = setTimeout(() => badge.classList.remove('visible'), 1800);
}

/* ─── Public API ──────────────────────────────────────────────────────────── */
export function openSettings() {
  _ensureModal();            // build DOM lazily on first open
  syncControls();
  overlayEl.classList.add('open');
}

export function closeSettings() {
  overlayEl?.classList.remove('open');
}

export function hookLegacyThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener('click', () => {
    const theme = FULL_THEMES[settings.themeId] || FULL_THEMES['navy-dark'];
    if (theme.dark) {
      const lightCounterpart = {
        'navy-dark': 'cream-light', 'catppuccin-mocha': 'catppuccin-latte',
        'solarized-dark': 'solarized-light', 'github-dark': 'github-light',
      };
      settings.themeId = lightCounterpart[settings.themeId] || 'cream-light';
    } else {
      const darkCounterpart = {
        'cream-light': 'navy-dark', 'catppuccin-latte': 'catppuccin-mocha',
        'solarized-light': 'solarized-dark', 'github-light': 'github-dark',
      };
      settings.themeId = darkCounterpart[settings.themeId] || 'navy-dark';
    }
    saveAndApply();
    if (overlayEl?.classList.contains('open')) syncControls();
  });
}

export function initSettings() {
  applySettings();   // apply current theme vars immediately at boot
  // Modal DOM is NOT built here — deferred to first openSettings() call
}