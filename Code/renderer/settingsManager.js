/**
 * settingsManager.js
 * Handles the settings modal: theme, accent color, font size, presets.
 * All settings saved to localStorage under 'helpertool-settings'.
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
  { id: 'sky-dark',      label: 'Sky Dark',    theme: 'dark',  accentId: 'sky'    },
  { id: 'sunset',        label: 'Sunset',      theme: 'dark',  accentId: 'orange' },
];

/* ─── Defaults ────────────────────────────────────────────────────────────── */
const DEFAULT_SETTINGS = {
  theme:        'dark',
  accentId:     'amber',
  customAccent: null,
  fontSize:     14,
  compactMode:  false,
};

const STORAGE_KEY = 'helpertool-settings';

let settings  = loadSettings();
let overlayEl = null;

/* ─── Storage ─────────────────────────────────────────────────────────────── */
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

/* ─── Color helpers ───────────────────────────────────────────────────────── */
function hexToRgb(hex) {
  const h    = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}
function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Given the accent hex, return the 5 depth-level colors.
 * Depth 0 = accent. Depths 1-4 = fixed harmonious palette
 * (sky, violet, teal, rose) — they stay consistent regardless of accent
 * so the tree stays readable.
 */
function buildDepthPalette(accentHex, isDark) {
  const fixed = isDark
    ? ['#38bdf8', '#a78bfa', '#2dd4bf', '#fb7185']
    : ['#0284c7', '#7c3aed', '#0d9488', '#be123c'];

  return [accentHex, ...fixed].map(color => ({
    color,
    bg:     rgba(color, isDark ? 0.10 : 0.08),
    bgH:    rgba(color, isDark ? 0.18 : 0.14),
    border: rgba(color, isDark ? 0.40 : 0.35),
    line:   rgba(color, isDark ? 0.35 : 0.30),
  }));
}

/* ─── Apply everything ────────────────────────────────────────────────────── */
function applySettings(s = settings) {
  const root   = document.documentElement;
  const isDark = s.theme !== 'light';

  /* 1 — Theme */
  isDark
    ? root.removeAttribute('data-theme')
    : root.setAttribute('data-theme', 'light');

  /* 2 — Resolve accent */
  const accentEntry = ACCENTS.find(a => a.id === s.accentId) || ACCENTS[0];
  const accentHex   = s.customAccent
    ? s.customAccent
    : (isDark ? accentEntry.dark : accentEntry.light);

  /* 3 — Core accent vars */
  root.style.setProperty('--accent',        accentHex);
  root.style.setProperty('--accent-dim',    rgba(accentHex, isDark ? 0.15 : 0.12));
  root.style.setProperty('--accent-glow',   rgba(accentHex, isDark ? 0.25 : 0.22));
  root.style.setProperty('--accent-border', rgba(accentHex, isDark ? 0.35 : 0.32));

  /* 4 — Depth-level color tokens (these are what color the tree folders) */
  buildDepthPalette(accentHex, isDark).forEach(({ color, bg, bgH, border, line }, i) => {
    root.style.setProperty(`--dl${i}-color`,  color);
    root.style.setProperty(`--dl${i}-bg`,     bg);
    root.style.setProperty(`--dl${i}-bg-h`,   bgH);
    root.style.setProperty(`--dl${i}-border`, border);
    root.style.setProperty(`--dl${i}-line`,   line);
  });

  /* 5 — Selected node highlight colors */
  root.style.setProperty('--node-selected-file',   accentHex);
  root.style.setProperty('--node-selected-folder', isDark ? '#34d399' : '#059669');

  /* 6 — Font size on <body> so px values in CSS scale relative to it */
  document.body.style.fontSize = `${s.fontSize}px`;

  /* 7 — Compact mode class */
  root.classList.toggle('compact-mode', !!s.compactMode);

  /* 8 — Sync navbar legacy button */
  syncThemeToggleBtn();
}

function syncThemeToggleBtn() {
  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (!icon || !label) return;
  if (settings.theme === 'light') {
    icon.textContent  = '🌙';
    label.textContent = 'Dark';
  } else {
    icon.textContent  = '☀️';
    label.textContent = 'Light';
  }
  localStorage.setItem('helpertool-theme', settings.theme);
}

/* ─── Build modal ─────────────────────────────────────────────────────────── */
function buildModal() {
  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay';
  overlay.id        = 'settingsOverlay';
  overlay.innerHTML = `
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
          <div class="settings-section-label">Quick Presets</div>
          <div class="settings-presets" id="settingsPresets"></div>
        </div>

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
              <small>Reduces padding and button sizes across the UI</small>
            </div>
            <label class="settings-toggle">
              <input type="checkbox" id="settingsCompactToggle">
              <span class="settings-toggle-track"></span>
            </label>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-label">Accent Color</div>
          <div class="settings-row">
            <div class="settings-row-label">
              Color
              <small>Buttons, highlights, tree folder depth-0 color, focus rings</small>
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

      </div>

      <div class="settings-footer">
        <button class="settings-reset-btn" id="settingsResetBtn">↺ Reset defaults</button>
        <span class="settings-saved-badge" id="settingsSavedBadge">✓ Saved</span>
      </div>

    </div>
  `;
  return overlay;
}

/* ─── Render swatches ─────────────────────────────────────────────────────── */
function renderSwatches() {
  const container = document.getElementById('settingsSwatches');
  if (!container) return;
  container.innerHTML = '';
  const isDark = settings.theme !== 'light';

  ACCENTS.forEach(accent => {
    const color    = isDark ? accent.dark : accent.light;
    const isActive = settings.accentId === accent.id && !settings.customAccent;
    const el       = document.createElement('div');
    el.className         = 'swatch' + (isActive ? ' active' : '');
    el.title             = accent.label;
    el.style.background  = color;
    el.addEventListener('click', () => {
      settings.accentId     = accent.id;
      settings.customAccent = null;
      saveAndApply();
      renderSwatches();
      renderPresets();
    });
    container.appendChild(el);
  });

  // Custom picker
  const custom = document.createElement('div');
  custom.className = 'swatch swatch-custom' + (settings.customAccent ? ' active' : '');
  custom.title     = 'Custom color';
  if (settings.customAccent) custom.style.background = settings.customAccent;

  const picker = document.createElement('input');
  picker.type  = 'color';
  picker.value = settings.customAccent || '#ffffff';
  picker.addEventListener('input', e => {
    settings.customAccent = e.target.value;
    settings.accentId     = null;
    saveAndApply();
    renderSwatches();
    renderPresets();
  });
  custom.appendChild(picker);
  container.appendChild(custom);
}

/* ─── Render presets ──────────────────────────────────────────────────────── */
function renderPresets() {
  const container = document.getElementById('settingsPresets');
  if (!container) return;
  container.innerHTML = '';

  PRESETS.forEach(preset => {
    const accent   = ACCENTS.find(a => a.id === preset.accentId);
    const color    = preset.theme === 'light' ? accent.light : accent.dark;
    const isActive = settings.theme === preset.theme
                  && settings.accentId === preset.accentId
                  && !settings.customAccent;

    const chip = document.createElement('button');
    chip.className = 'preset-chip' + (isActive ? ' active' : '');
    chip.innerHTML = `<span class="preset-dot" style="background:${color}"></span>${preset.label}`;
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

/* ─── Sync all controls ───────────────────────────────────────────────────── */
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

/* ─── Save + apply + badge ────────────────────────────────────────────────── */
function saveAndApply() {
  saveSettings();
  applySettings();
  flashSaved();
}

function flashSaved() {
  const badge = document.getElementById('settingsSavedBadge');
  if (!badge) return;
  badge.classList.add('visible');
  clearTimeout(badge._t);
  badge._t = setTimeout(() => badge.classList.remove('visible'), 1800);
}

/* ─── Public API ──────────────────────────────────────────────────────────── */
export function openSettings() {
  if (!overlayEl) return;
  syncControls();
  overlayEl.classList.add('open');
}

export function closeSettings() {
  overlayEl?.classList.remove('open');
}

export function hookLegacyThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  // Replace to clear old listeners
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener('click', () => {
    settings.theme = settings.theme === 'light' ? 'dark' : 'light';
    saveAndApply();
    if (overlayEl?.classList.contains('open')) syncControls();
  });
}

export function initSettings() {
  applySettings(); // apply immediately on boot

  overlayEl = buildModal();
  document.body.appendChild(overlayEl);

  // Backdrop click
  overlayEl.addEventListener('click', e => {
    if (e.target === overlayEl) closeSettings();
  });

  document.getElementById('settingsCloseBtn')
    ?.addEventListener('click', closeSettings);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlayEl.classList.contains('open')) closeSettings();
  });

  document.getElementById('settingsThemeToggle')
    ?.addEventListener('change', e => {
      settings.theme = e.target.checked ? 'dark' : 'light';
      saveAndApply();
      renderSwatches();
      renderPresets();
    });

  document.getElementById('settingsCompactToggle')
    ?.addEventListener('change', e => {
      settings.compactMode = e.target.checked;
      saveAndApply();
    });

  const slider = document.getElementById('settingsFontSlider');
  const sliderVal = document.getElementById('settingsFontValue');
  slider?.addEventListener('input', e => {
    settings.fontSize       = parseInt(e.target.value);
    sliderVal.textContent   = `${settings.fontSize}px`;
    saveAndApply();
  });

  document.getElementById('settingsResetBtn')
    ?.addEventListener('click', () => {
      settings = { ...DEFAULT_SETTINGS };
      saveAndApply();
      syncControls();
    });
}