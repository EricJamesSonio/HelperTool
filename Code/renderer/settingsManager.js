/**
 * settingsManager.js
 * Handles the settings modal: theme, accent color, font size, presets.
 * All settings are saved to localStorage under 'helpertool-settings'.
 */

/* ─── Accent palette ──────────────────────────────────────────────────────── */
const ACCENTS = [
  { id: 'amber',  dark: '#f0b429', light: '#d97706', label: 'Amber'  },
  { id: 'teal',   dark: '#2dd4bf', light: '#0d9488', label: 'Teal'   },
  { id: 'violet', dark: '#a78bfa', light: '#7c3aed', label: 'Violet' },
  { id: 'rose',   dark: '#fb7185', light: '#e11d48', label: 'Rose'   },
  { id: 'sky',    dark: '#38bdf8', light: '#0284c7', label: 'Sky'    },
  { id: 'lime',   dark: '#a3e635', light: '#65a30d', label: 'Lime'   },
  { id: 'orange', dark: '#fb923c', light: '#ea580c', label: 'Orange' },
  { id: 'pink',   dark: '#f472b6', light: '#db2777', label: 'Pink'   },
];

/* ─── Preset themes ───────────────────────────────────────────────────────── */
const PRESETS = [
  { id: 'default-dark',  label: 'Navy Dark',   theme: 'dark',  accentId: 'amber'  },
  { id: 'default-light', label: 'Cream Light', theme: 'light', accentId: 'teal'   },
  { id: 'violet-dark',   label: 'Violet Dark', theme: 'dark',  accentId: 'violet' },
  { id: 'rose-light',    label: 'Rose Light',  theme: 'light', accentId: 'rose'   },
  { id: 'matrix',        label: 'Matrix',      theme: 'dark',  accentId: 'lime'   },
];

/* ─── Default settings ────────────────────────────────────────────────────── */
const DEFAULT_SETTINGS = {
  theme:         'dark',
  accentId:      'amber',
  customAccent:  null,   // hex string or null
  fontSize:      14,
  compactMode:   false,
};

const STORAGE_KEY = 'helpertool-settings';

/* ─── State ───────────────────────────────────────────────────────────────── */
let settings = loadSettings();
let overlayEl = null;

/* ─── Persist & load ──────────────────────────────────────────────────────── */
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/* ─── Apply settings to DOM ───────────────────────────────────────────────── */
function applySettings(s = settings) {
  const root = document.documentElement;

  // Theme
  if (s.theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }

  // Accent color
  const accent = s.customAccent
    ? { dark: s.customAccent, light: s.customAccent }
    : ACCENTS.find(a => a.id === s.accentId) || ACCENTS[0];

  const accentValue  = s.theme === 'light' ? accent.light : accent.dark;

  // Helper: hex to rgba string
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  root.style.setProperty('--accent',        accentValue);
  root.style.setProperty('--accent-dim',    hexToRgba(accentValue, 0.15));
  root.style.setProperty('--accent-glow',   hexToRgba(accentValue, 0.25));
  root.style.setProperty('--accent-border', hexToRgba(accentValue, 0.35));

  // Font size
  root.style.setProperty('font-size', `${s.fontSize}px`);

  // Compact mode
  root.classList.toggle('compact-mode', !!s.compactMode);
}

/* ─── Sync existing theme toggle button in navbar ─────────────────────────── */
function syncThemeToggleBtn() {
  const themeIcon  = document.getElementById('themeIcon');
  const themeLabel = document.getElementById('themeLabel');
  if (!themeIcon || !themeLabel) return;
  if (settings.theme === 'light') {
    themeIcon.textContent  = '🌙';
    themeLabel.textContent = 'Dark';
  } else {
    themeIcon.textContent  = '☀️';
    themeLabel.textContent = 'Light';
  }
  // Keep localStorage in sync for the legacy theme key
  localStorage.setItem('helpertool-theme', settings.theme);
}

/* ─── Build modal HTML ────────────────────────────────────────────────────── */
function buildModal() {
  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay';
  overlay.id = 'settingsOverlay';

  overlay.innerHTML = `
    <div class="settings-modal" role="dialog" aria-label="Settings">

      <div class="settings-header">
        <span class="settings-title">
          <span class="settings-title-icon">⚙️</span>
          Appearance Settings
        </span>
        <button class="settings-close-btn" id="settingsCloseBtn" title="Close">✕</button>
      </div>

      <div class="settings-body">

        <!-- ── Presets ── -->
        <div class="settings-section">
          <div class="settings-section-label">Quick Presets</div>
          <div class="settings-presets" id="settingsPresets"></div>
        </div>

        <!-- ── Theme ── -->
        <div class="settings-section">
          <div class="settings-section-label">Theme</div>

          <div class="settings-row">
            <div class="settings-row-label">
              Dark mode
              <small>Deep navy background with rich contrasts</small>
            </div>
            <label class="settings-toggle">
              <input type="checkbox" id="settingsThemeToggle">
              <span class="settings-toggle-track"></span>
            </label>
          </div>

          <div class="settings-row">
            <div class="settings-row-label">
              Compact mode
              <small>Reduces padding and button sizes</small>
            </div>
            <label class="settings-toggle">
              <input type="checkbox" id="settingsCompactToggle">
              <span class="settings-toggle-track"></span>
            </label>
          </div>
        </div>

        <!-- ── Accent Color ── -->
        <div class="settings-section">
          <div class="settings-section-label">Accent Color</div>
          <div class="settings-row">
            <div class="settings-row-label">
              Color
              <small>Used for highlights, buttons, and focus rings</small>
            </div>
            <div class="settings-swatches" id="settingsSwatches"></div>
          </div>
        </div>

        <!-- ── Font Size ── -->
        <div class="settings-section">
          <div class="settings-section-label">Font Size</div>
          <div class="settings-row">
            <div class="settings-row-label">
              UI font size
              <small>Base size for all interface text</small>
            </div>
            <div class="settings-slider-wrap">
              <input type="range" class="settings-slider" id="settingsFontSlider"
                min="11" max="18" step="1">
              <span class="settings-slider-value" id="settingsFontValue">14px</span>
            </div>
          </div>
        </div>

      </div>

      <div class="settings-footer">
        <button class="settings-reset-btn" id="settingsResetBtn">↺ Reset defaults</button>
        <span class="settings-saved-badge" id="settingsSavedBadge">✓ Saved</span>
      </div>

    </div>
  `;

  return overlay;
}

/* ─── Populate swatches ───────────────────────────────────────────────────── */
function renderSwatches() {
  const container = document.getElementById('settingsSwatches');
  if (!container) return;
  container.innerHTML = '';

  ACCENTS.forEach(accent => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch' + (settings.accentId === accent.id && !settings.customAccent ? ' active' : '');
    swatch.title = accent.label;
    swatch.style.background = settings.theme === 'light' ? accent.light : accent.dark;
    swatch.addEventListener('click', () => {
      settings.accentId     = accent.id;
      settings.customAccent = null;
      saveAndApply();
      renderSwatches();
      renderPresets();
    });
    container.appendChild(swatch);
  });

  // Custom color picker swatch
  const customSwatch = document.createElement('div');
  customSwatch.className = 'swatch swatch-custom' + (settings.customAccent ? ' active' : '');
  customSwatch.title = 'Custom color';
  if (settings.customAccent) customSwatch.style.background = settings.customAccent;

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = settings.customAccent || '#ffffff';
  colorInput.addEventListener('input', e => {
    settings.customAccent = e.target.value;
    settings.accentId     = null;
    saveAndApply();
    renderSwatches();
    renderPresets();
  });
  customSwatch.appendChild(colorInput);
  container.appendChild(customSwatch);
}

/* ─── Populate presets ────────────────────────────────────────────────────── */
function renderPresets() {
  const container = document.getElementById('settingsPresets');
  if (!container) return;
  container.innerHTML = '';

  PRESETS.forEach(preset => {
    const accent = ACCENTS.find(a => a.id === preset.accentId);
    const isActive = settings.theme === preset.theme && settings.accentId === preset.accentId && !settings.customAccent;

    const chip = document.createElement('button');
    chip.className = 'preset-chip' + (isActive ? ' active' : '');
    chip.innerHTML = `
      <span class="preset-dot" style="background:${preset.theme === 'light' ? accent.light : accent.dark}"></span>
      ${preset.label}
    `;
    chip.addEventListener('click', () => {
      settings.theme        = preset.theme;
      settings.accentId     = preset.accentId;
      settings.customAccent = null;
      saveAndApply();
      syncControls();
    });
    container.appendChild(chip);
  });
}

/* ─── Sync all controls to current settings ──────────────────────────────── */
function syncControls() {
  const themeToggle   = document.getElementById('settingsThemeToggle');
  const compactToggle = document.getElementById('settingsCompactToggle');
  const fontSlider    = document.getElementById('settingsFontSlider');
  const fontValue     = document.getElementById('settingsFontValue');

  if (themeToggle)   themeToggle.checked   = settings.theme === 'dark';
  if (compactToggle) compactToggle.checked = !!settings.compactMode;
  if (fontSlider)    fontSlider.value      = settings.fontSize;
  if (fontValue)     fontValue.textContent = `${settings.fontSize}px`;

  renderSwatches();
  renderPresets();
}

/* ─── Save + apply + flash badge ─────────────────────────────────────────── */
function saveAndApply() {
  saveSettings();
  applySettings();
  syncThemeToggleBtn();
  flashSaved();
}

function flashSaved() {
  const badge = document.getElementById('settingsSavedBadge');
  if (!badge) return;
  badge.classList.add('visible');
  clearTimeout(badge._timeout);
  badge._timeout = setTimeout(() => badge.classList.remove('visible'), 1800);
}

/* ─── Open / close ────────────────────────────────────────────────────────── */
export function openSettings() {
  if (!overlayEl) return;
  syncControls();
  overlayEl.classList.add('open');
}

export function closeSettings() {
  if (!overlayEl) return;
  overlayEl.classList.remove('open');
}

/* ─── Init ────────────────────────────────────────────────────────────────── */
export function initSettings() {
  // Apply saved settings immediately on boot
  applySettings();
  syncThemeToggleBtn();

  // Build and inject modal
  overlayEl = buildModal();
  document.body.appendChild(overlayEl);

  // Close on backdrop click
  overlayEl.addEventListener('click', e => {
    if (e.target === overlayEl) closeSettings();
  });

  // Close button
  document.getElementById('settingsCloseBtn')?.addEventListener('click', closeSettings);

  // Keyboard: Escape to close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlayEl.classList.contains('open')) closeSettings();
  });

  // Theme toggle
  document.getElementById('settingsThemeToggle')?.addEventListener('change', e => {
    settings.theme = e.target.checked ? 'dark' : 'light';
    saveAndApply();
    renderSwatches(); // update swatch colors for new theme
    renderPresets();
  });

  // Compact toggle
  document.getElementById('settingsCompactToggle')?.addEventListener('change', e => {
    settings.compactMode = e.target.checked;
    saveAndApply();
  });

  // Font size slider
  const fontSlider = document.getElementById('settingsFontSlider');
  const fontValue  = document.getElementById('settingsFontValue');
  fontSlider?.addEventListener('input', e => {
    settings.fontSize    = parseInt(e.target.value);
    fontValue.textContent = `${settings.fontSize}px`;
    saveAndApply();
  });

  // Reset button
  document.getElementById('settingsResetBtn')?.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    saveAndApply();
    syncControls();
  });
}

/* ─── Override the legacy theme toggle in navbar ─────────────────────────── */
// Call this after initSettings so the old toggle also updates our settings
export function hookLegacyThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  // Replace existing listeners by cloning the button
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', () => {
    settings.theme = settings.theme === 'light' ? 'dark' : 'light';
    saveAndApply();
    // Re-sync swatches if modal is open
    if (overlayEl?.classList.contains('open')) {
      syncControls();
    }
  });
}