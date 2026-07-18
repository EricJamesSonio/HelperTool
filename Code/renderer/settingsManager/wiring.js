import { S, DEFAULT_SETTINGS } from './state.js';
import { FEATURES_META, _renderFeaturesList, saveFeatures } from './features.js';
import { renderThemeGrid, renderSwatches } from './ui.js';
import { saveAndApply } from './utils.js';

const ICON_SETTINGS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="10" cy="10" r="7"/><circle cx="7" cy="8" r="1" fill="currentColor"/><circle cx="13" cy="8" r="1" fill="currentColor"/><circle cx="10" cy="13" r="1" fill="currentColor"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 10l4 4 6-6"/></svg>';
const ICON_RESET = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.5 15.5A8 8 0 1018 10a8 8 0 00-7-7.9"/></svg>';

function _ensureModal() {
  if (S._modalBuilt) return;
  S._modalBuilt = true;

  S.overlayEl = document.createElement('div');
  S.overlayEl.className = 'settings-overlay';
  S.overlayEl.id        = 'settingsOverlay';
  S.overlayEl.innerHTML = `
    <div class="settings-modal" role="dialog" aria-label="Settings">
      <div class="settings-header">
        <span class="settings-title">
          <span class="settings-title-icon">${ICON_SETTINGS}</span>
          Settings
        </span>
        <button class="settings-close-btn" id="settingsCloseBtn" title="Close">${ICON_CLOSE}</button>
      </div>
      <div class="settings-body">

        <div style="display:flex;flex-direction:column;gap:24px">
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
            <div class="settings-section-label">Layout Scale</div>
            <div class="settings-row">
              <div class="settings-row-label">
                UI size
                <small>Make the interface compact or spacious (50% = default)</small>
              </div>
              <div class="settings-slider-wrap">
                <input type="range" class="settings-slider" id="settingsCompactSlider" min="1" max="100" step="1">
                <span class="settings-slider-value" id="settingsCompactValue">50%</span>
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:24px">
          <div class="settings-section" id="settingsFeaturesSection">
            <div class="settings-section-label">Features</div>
            <p style="font-size:0.77rem;color:var(--text-muted);margin:0 0 10px;line-height:1.5">
              Disable features you don't use to make the app load faster.
              Changes take effect after reloading the app.
            </p>
            <div id="settingsFeatureList" style="display:flex;flex-direction:column;gap:5px"></div>
            <div style="display:flex;align-items:center;justify-content:flex-end;margin-top:12px;gap:10px">
              <span id="settingsFeatSavedBadge"
                style="display:inline-flex;align-items:center;gap:4px;font-size:0.75rem;color:var(--green);opacity:0;transition:opacity 0.3s">
                ${ICON_CHECK} Saved \u2014 reloading\u2026
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

      </div>
      <div class="settings-footer">
        <button class="settings-reset-btn" id="settingsResetBtn">${ICON_RESET} Reset appearance defaults</button>
        <span class="settings-saved-badge" id="settingsSavedBadge">${ICON_CHECK} Saved</span>
      </div>
    </div>`;

  document.body.appendChild(S.overlayEl);

  S.overlayEl.addEventListener('click', e => { if (e.target === S.overlayEl) closeSettings(); });
  document.getElementById('settingsCloseBtn')?.addEventListener('click', closeSettings);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.overlayEl.classList.contains('open')) closeSettings();
  });
  document.getElementById('settingsCompactSlider')?.addEventListener('input', e => {
    S.settings.uiScale = parseInt(e.target.value); saveAndApply();
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
  const compactSlider = document.getElementById('settingsCompactSlider');
  const compactValue  = document.getElementById('settingsCompactValue');
  const fontSlider    = document.getElementById('settingsFontSlider');
  const fontValue     = document.getElementById('settingsFontValue');
  if (compactSlider) { compactSlider.value = S.settings.uiScale; }
  if (compactValue)  { compactValue.textContent = `${S.settings.uiScale}%`; }
  if (fontSlider)    { fontSlider.value       = S.settings.fontSize; }
  if (fontValue)     { fontValue.textContent  = `${S.settings.fontSize}px`; }
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
