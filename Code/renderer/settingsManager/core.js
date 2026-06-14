import { S } from './state.js';
import { rgba } from './colors.js';
import { FULL_THEMES } from './themes.js';

function applySettings(s = S.settings) {
  const root      = document.documentElement;
  const theme     = FULL_THEMES[s.themeId] || FULL_THEMES['neon-dark'];
  const accentHex = s.customAccent || theme.accent;

  const depths = s.customAccent
    ? [s.customAccent, ...theme.depths.slice(1)]
    : theme.depths;

  const depthVars = depths.map((color, i) => `
  --dl${i}-color:  ${color};
  --dl${i}-bg:     ${rgba(color, 0.10)};
  --dl${i}-bg-h:   ${rgba(color, 0.18)};
  --dl${i}-border: ${rgba(color, 0.40)};
  --dl${i}-line:   ${rgba(color, 0.35)};`).join('');

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
  --green-dim:      ${rgba(theme.green, 0.13)};
  --red:            ${theme.red};
  --red-dim:        ${rgba(theme.red, 0.13)};
  --blue:           ${theme.blue};
  --blue-dim:       ${rgba(theme.blue, 0.13)};
  --purple:         ${theme.purple};
  --purple-dim:     ${rgba(theme.purple, 0.13)};
  --yellow:         ${theme.yellow};
  --yellow-dim:     ${rgba(theme.yellow, 0.13)};
  --accent:         ${accentHex};
  --accent-dim:     ${rgba(accentHex, 0.15)};
  --accent-glow:    ${rgba(accentHex, 0.25)};
  --accent-border:  ${rgba(accentHex, 0.35)};
  --node-folder:          ${theme.blue};
  --node-file:            ${theme.text.secondary};
  --node-selected-file:   ${accentHex};
  --node-selected-folder: ${theme.green};
  --folder-text:          ${theme.blue};
  --folder-bg:            ${rgba(theme.blue, 0.08)};
  --folder-border:        ${rgba(theme.blue, 0.20)};
  --folder-bg-h:          ${rgba(theme.blue, 0.14)};
  --folder-hover-border:  ${rgba(theme.blue, 0.38)};
  --folder-hover-color:   ${theme.text.primary};
  --file-bg:              ${rgba(theme.text.muted, 0.05)};
  --file-border:          ${rgba(theme.text.muted, 0.13)};
  --file-text:            ${theme.text.secondary};
  --file-bg-h:            ${rgba(theme.text.muted, 0.10)};
  --file-hover-border:    ${rgba(theme.text.muted, 0.28)};
  --file-hover-color:     ${theme.text.primary};
  --connector-color:      rgba(255,255,255,0.10);
  ${depthVars}
}`;

  if (!S._themeStyleEl) {
    S._themeStyleEl = document.createElement('style');
    S._themeStyleEl.id = 'theme-vars';
    document.head.appendChild(S._themeStyleEl);
  }
  S._themeStyleEl.textContent = css;

  document.body.style.fontSize = `${s.fontSize}px`;
  root.classList.toggle('compact-mode', !!s.compactMode);
}

export { applySettings };
