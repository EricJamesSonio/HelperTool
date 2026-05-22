import { S } from './state.js';
import { FULL_THEMES, ACCENT_SWATCHES } from './themes.js';
import { saveAndApply } from './utils.js';

function renderThemeGrid() {
  const grid = document.getElementById('settingsThemeGrid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.entries(FULL_THEMES).forEach(([id, theme]) => {
    const isActive = S.settings.themeId === id;
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
      S.settings.themeId      = id;
      S.settings.customAccent = null;
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
  noneEl.className   = 'swatch swatch-none' + (!S.settings.customAccent ? ' active' : '');
  noneEl.title       = 'Theme default';
  noneEl.textContent = '\u2205';
  noneEl.addEventListener('click', () => {
    S.settings.customAccent = null; saveAndApply(); renderSwatches(); renderThemeGrid();
  });
  container.appendChild(noneEl);

  ACCENT_SWATCHES.forEach(sw => {
    const isActive = S.settings.customAccent === sw.hex;
    const el = document.createElement('div');
    el.className        = 'swatch' + (isActive ? ' active' : '');
    el.title            = sw.label;
    el.style.background = sw.hex;
    el.addEventListener('click', () => {
      S.settings.customAccent = sw.hex; saveAndApply(); renderSwatches(); renderThemeGrid();
    });
    container.appendChild(el);
  });

  const isCustomActive = S.settings.customAccent && !ACCENT_SWATCHES.find(s => s.hex === S.settings.customAccent);
  const custom = document.createElement('div');
  custom.className = 'swatch swatch-custom' + (isCustomActive ? ' active' : '');
  custom.title     = 'Custom color';
  if (isCustomActive) custom.style.background = S.settings.customAccent;
  const picker = document.createElement('input');
  picker.type  = 'color';
  picker.value = S.settings.customAccent || '#ffffff';
  picker.addEventListener('input', e => {
    S.settings.customAccent = e.target.value; saveAndApply(); renderSwatches(); renderThemeGrid();
  });
  custom.appendChild(picker);
  container.appendChild(custom);
}

export { renderThemeGrid, renderSwatches };
