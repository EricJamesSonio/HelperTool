import { S } from './state.js';
import { rgba } from './colors.js';
import { FULL_THEMES } from './themes.js';

function applySettings(s = S.settings) {
  const root      = document.documentElement;
  const theme     = FULL_THEMES[s.themeId] || FULL_THEMES['navy-dark'];
  const isDark    = theme.dark;
  const accentHex = s.customAccent || theme.accent;

  const depths = s.customAccent
    ? [s.customAccent, ...theme.depths.slice(1)]
    : theme.depths;

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

  if (!S._themeStyleEl) {
    S._themeStyleEl = document.createElement('style');
    S._themeStyleEl.id = 'theme-vars';
    document.head.appendChild(S._themeStyleEl);
  }
  S._themeStyleEl.textContent = css;

  isDark ? root.removeAttribute('data-theme') : root.setAttribute('data-theme', 'light');
  document.body.style.fontSize = `${s.fontSize}px`;
  root.classList.toggle('compact-mode', !!s.compactMode);
  syncThemeToggleBtn(isDark);
}

function syncThemeToggleBtn(isDark) {
  const icon  = document.getElementById('themeIcon');
  if (icon)  icon.textContent  = isDark ? '\u2600\uFE0F' : '\u{1F319}';
  localStorage.setItem('helpertool-theme', isDark ? 'dark' : 'light');
}

export { applySettings };
