import { S, DEFAULT_SETTINGS } from './state.js';
import { FEATURES_META, _renderFeaturesList, saveFeatures } from './features.js';
import { renderThemeGrid, renderSwatches } from './ui.js';
import { saveAndApply } from './utils.js';

function _ensureModal() {
  if (S._modalBuilt) return;
  S._modalBuilt = true;

  S.overlayEl = document.createElement('div');
  S.overlayEl.className = 'settings-overlay';
  S.overlayEl.id        = 'settingsOverlay';
  S.overlayEl.innerHTML = `
    <div class="settings-modal" role="dialog" aria-label="Appearance Settings">
      <div class="settings-header">
        <span class="settings-title">
          <span class="settings-title-icon">\u{1F3A8}</span>
          Appearance &amp; Features
        </span>
        <button class="settings-close-btn" id="settingsCloseBtn" title="Close">\u2715</button>
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

        <div class="settings-section" id="settingsFeaturesSection">
          <div class="settings-section-label">Features</div>
          <p style="font-size:0.77rem;color:var(--text-muted);margin:0 0 10px;line-height:1.5">
            Disable features you don't use to make the app load faster.
            Changes take effect after reloading the app.
          </p>
          <div id="settingsFeatureList" style="display:flex;flex-direction:column;gap:5px"></div>
          <div style="display:flex;align-items:center;justify-content:flex-end;margin-top:12px;gap:10px">
            <span id="settingsFeatSavedBadge"
              style="font-size:0.75rem;color:var(--green);opacity:0;transition:opacity 0.3s">
              \u2713 Saved \u2014 reloading\u2026
            </span>
            <button id="settingsFeatSaveBtn"
              style="padding:7px 16px;border:none;border-radius:7px;
                     background:var(--accent);color:#000;font-weight:700;
                     cursor:pointer;font-size:0.8rem;transition:opacity 0.15s">
              Save &amp; Reload
            </button>
          </div>
        </div>

      </div>
      <div class="settings-footer">
        <button class="settings-reset-btn" id="settingsResetBtn">\u21BA Reset appearance defaults</button>
        <span class="settings-saved-badge" id="settingsSavedBadge">\u2713 Saved</span>
      </div>
    </div>`;

  document.body.appendChild(S.overlayEl);

  S.overlayEl.addEventListener('click', e => { if (e.target === S.overlayEl) closeSettings(); });
  document.getElementById('settingsCloseBtn')?.addEventListener('click', closeSettings);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.overlayEl.classList.contains('open')) closeSettings();
  });
  document.getElementById('settingsCompactToggle')?.addEventListener('change', e => {
    S.settings.compactMode = e.target.checked; saveAndApply();
  });
  const slider    = document.getElementById('settingsFontSlider');
  const sliderVal = document.getElementById('settingsFontValue');
  slider?.addEventListener('input', e => {
    S.settings.fontSize     = parseInt(e.target.value);
    sliderVal.textContent = `${S.settings.fontSize}px`;
    saveAndApply();
  });
  document.getElementById('settingsResetBtn')?.addEventListener('click', () => {
    Object.assign(S.settings, DEFAULT_SETTINGS);
    saveAndApply();
    syncControls();
  });

  document.getElementById('settingsFeatSaveBtn')?.addEventListener('click', async () => {
    const updated = {};
    FEATURES_META.forEach(f => {
      updated[f.id] = !!document.getElementById(`sf-feat-${f.id}`)?.checked;
    });
    await saveFeatures(updated);
    const badge = document.getElementById('settingsFeatSavedBadge');
    if (badge) { badge.style.opacity = '1'; }
    setTimeout(() => location.reload(), 900);
  });
}

function syncControls() {
  const compactToggle = document.getElementById('settingsCompactToggle');
  const fontSlider    = document.getElementById('settingsFontSlider');
  const fontValue     = document.getElementById('settingsFontValue');
  if (compactToggle) compactToggle.checked  = !!S.settings.compactMode;
  if (fontSlider)    fontSlider.value       = S.settings.fontSize;
  if (fontValue)     fontValue.textContent  = `${S.settings.fontSize}px`;
  renderThemeGrid();
  renderSwatches();
  _renderFeaturesList();
}

function openSettings() {
  _ensureModal();
  syncControls();
  S.overlayEl.classList.add('open');
}

function closeSettings() {
  S.overlayEl?.classList.remove('open');
}

export { openSettings, closeSettings, syncControls };
