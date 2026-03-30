/**
 * featureManager.js
 * -----------------
 * Manages optional feature flags.
 * - On first launch (features === null in config) shows a setup wizard.
 * - Subsequent launches read saved flags and skip disabled features.
 * - Exposes getFeatures() so app.js can gate conditional inits.
 */

const DEFAULT_FEATURES = {
  apiTool:       true,
  secretHolder:  true,
  themeEngine:   true,   // full 20-theme switcher
  folderFilters: true,
  swagger:       true,
};

let _features = { ...DEFAULT_FEATURES };
let _wizardResolve = null;

/** Call once at boot. Returns resolved feature map. */
export async function initFeatures() {
  try {
    const saved = await window.electronAPI.featuresGet();
    if (saved === null) {
      // First launch — show wizard and wait for user to confirm
      _features = await _showWizard();
      await window.electronAPI.featuresSet(_features);
    } else {
      _features = { ...DEFAULT_FEATURES, ...saved };
    }
  } catch (err) {
    console.warn('[Features] Could not load flags, using defaults:', err);
    _features = { ...DEFAULT_FEATURES };
  }
  _applyBodyClasses();
  return _features;
}

/** Read current feature map (after initFeatures resolves). */
export function getFeatures() {
  return { ..._features };
}

/** Save updated map (called from settings panel). */
export async function saveFeatures(updated) {
  _features = { ...DEFAULT_FEATURES, ...updated };
  _applyBodyClasses();
  await window.electronAPI.featuresSet(_features);
}

// ─── body class helpers ──────────────────────────────────────────────
function _applyBodyClasses() {
  document.body.classList.toggle('feat-no-theme-engine',   !_features.themeEngine);
  document.body.classList.toggle('feat-no-api-tool',       !_features.apiTool);
  document.body.classList.toggle('feat-no-secret-holder',  !_features.secretHolder);
  document.body.classList.toggle('feat-no-folder-filters', !_features.folderFilters);
}

// ─── First-launch wizard ─────────────────────────────────────────────
function _showWizard() {
  return new Promise((resolve) => {
    _wizardResolve = resolve;
    _injectWizard();
  });
}

function _injectWizard() {
  if (document.getElementById('featureWizard')) return;

  const FEATURES_META = [
    {
      id: 'apiTool',
      icon: '🔌',
      label: 'API Tool',
      desc: 'Built-in Postman-like tester with Swagger import. Skip to save ~30 KB JS + CSS.',
      heavy: true,
    },
    {
      id: 'secretHolder',
      icon: '🔐',
      label: 'Secret Holder',
      desc: 'Password-protected vault for API keys & notes. Skippable if you don\'t need it.',
      heavy: false,
    },
    {
      id: 'themeEngine',
      icon: '🎨',
      label: 'Full Theme Engine',
      desc: '20 themes + accent pickers. Disable for a single optimised dark theme — saves ~15 KB.',
      heavy: true,
    },
    {
      id: 'folderFilters',
      icon: '📁',
      label: 'Folder Filters',
      desc: 'Ignore / Focus folder panels. Disable if you only use extension filters.',
      heavy: false,
    },
    {
      id: 'swagger',
      icon: '⚡',
      label: 'Swagger / OpenAPI Import',
      desc: 'Auto-import endpoints from OpenAPI specs. Only useful alongside the API Tool.',
      heavy: false,
    },
  ];

  const el = document.createElement('div');
  el.id = 'featureWizard';
  el.innerHTML = `
    <div class="fw-overlay">
      <div class="fw-modal">
        <div class="fw-header">
          <div class="fw-logo">⚡</div>
          <h1 class="fw-title">Welcome to Helper Tool</h1>
          <p class="fw-subtitle">Choose which features to load. You can change this any time in <strong>Settings → Features</strong>.</p>
        </div>

        <div class="fw-features">
          ${FEATURES_META.map(f => `
            <label class="fw-feature" data-id="${f.id}">
              <div class="fw-feature-left">
                <span class="fw-feature-icon">${f.icon}</span>
                <div class="fw-feature-info">
                  <span class="fw-feature-label">${f.label}${f.heavy ? ' <span class="fw-badge">heavy</span>' : ''}</span>
                  <span class="fw-feature-desc">${f.desc}</span>
                </div>
              </div>
              <div class="fw-toggle-wrap">
                <input type="checkbox" class="fw-cb" id="fw-${f.id}" checked />
                <span class="fw-toggle-track">
                  <span class="fw-toggle-thumb"></span>
                </span>
              </div>
            </label>
          `).join('')}
        </div>

        <div class="fw-footer">
          <span class="fw-footer-note">💡 Disabled features won't be loaded at startup — they can be re-enabled in Settings.</span>
          <button id="fwConfirm" class="fw-confirm-btn">Save &amp; Launch →</button>
        </div>
      </div>
    </div>
  `;

  // inject styles
  const style = document.createElement('style');
  style.textContent = `
    #featureWizard {
      position: fixed; inset: 0; z-index: 99999;
      display: flex; align-items: center; justify-content: center;
    }
    .fw-overlay {
      position: absolute; inset: 0;
      background: rgba(7, 13, 26, 0.92);
      backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
    }
    .fw-modal {
      background: var(--bg-elevated, #111d34);
      border: 1px solid var(--border-default, rgba(255,255,255,0.10));
      border-radius: 16px;
      width: min(520px, 94vw);
      box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
      overflow: hidden;
      animation: fw-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
    }
    @keyframes fw-in {
      from { opacity:0; transform: translateY(24px) scale(0.96); }
      to   { opacity:1; transform: translateY(0) scale(1); }
    }
    .fw-header {
      padding: 28px 28px 20px;
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
      text-align: center;
    }
    .fw-logo { font-size: 2.2rem; margin-bottom: 8px; }
    .fw-title {
      margin: 0 0 6px;
      font-size: 1.3rem;
      font-weight: 700;
      color: var(--text-primary, #eef2ff);
      letter-spacing: -0.3px;
    }
    .fw-subtitle {
      margin: 0;
      font-size: 0.82rem;
      color: var(--text-muted, #556080);
      line-height: 1.5;
    }
    .fw-subtitle strong { color: var(--accent, #f0b429); }

    .fw-features {
      padding: 12px 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .fw-feature {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background 0.15s, border-color 0.15s;
    }
    .fw-feature:hover { background: var(--bg-hover, rgba(255,255,255,0.04)); }
    .fw-feature:has(.fw-cb:checked) {
      border-color: var(--border-subtle, rgba(255,255,255,0.06));
      background: var(--bg-active, rgba(255,255,255,0.06));
    }
    .fw-feature-left {
      display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0;
    }
    .fw-feature-icon { font-size: 1.3rem; flex-shrink: 0; margin-top: 1px; }
    .fw-feature-info { display: flex; flex-direction: column; gap: 2px; }
    .fw-feature-label {
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text-primary, #eef2ff);
    }
    .fw-badge {
      display: inline-block;
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--yellow, #fbbf24);
      background: var(--yellow-dim, rgba(251,191,36,0.13));
      border: 1px solid rgba(251,191,36,0.25);
      border-radius: 4px;
      padding: 1px 5px;
      margin-left: 4px;
      vertical-align: middle;
    }
    .fw-feature-desc {
      font-size: 0.76rem;
      color: var(--text-muted, #556080);
      line-height: 1.45;
    }

    /* checkbox hidden */
    .fw-cb { display: none; }

    /* toggle track */
    .fw-toggle-wrap { flex-shrink: 0; }
    .fw-toggle-track {
      display: flex;
      align-items: center;
      width: 42px; height: 24px;
      border-radius: 99px;
      background: var(--bg-raised, #1a2540);
      border: 1px solid var(--border-default, rgba(255,255,255,0.10));
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
      position: relative;
    }
    .fw-cb:checked ~ .fw-toggle-track {
      background: var(--accent, #f0b429);
      border-color: var(--accent, #f0b429);
    }
    .fw-toggle-thumb {
      position: absolute;
      left: 3px;
      width: 18px; height: 18px;
      border-radius: 50%;
      background: var(--text-muted, #556080);
      transition: left 0.2s, background 0.2s;
    }
    .fw-cb:checked ~ .fw-toggle-track .fw-toggle-thumb {
      left: 21px;
      background: #fff;
    }

    .fw-footer {
      padding: 16px 20px;
      border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .fw-footer-note {
      flex: 1;
      font-size: 0.74rem;
      color: var(--text-faint, #364060);
      line-height: 1.4;
    }
    .fw-confirm-btn {
      flex-shrink: 0;
      padding: 9px 20px;
      border: none;
      border-radius: 8px;
      background: var(--accent, #f0b429);
      color: #000;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.1s;
      letter-spacing: -0.2px;
    }
    .fw-confirm-btn:hover { opacity: 0.88; transform: scale(1.02); }
    .fw-confirm-btn:active { transform: scale(0.98); }
  `;

  document.head.appendChild(style);
  document.body.appendChild(el);

  // Wire confirm button
  document.getElementById('fwConfirm').addEventListener('click', () => {
    const result = {};
    document.querySelectorAll('.fw-cb').forEach(cb => {
      const id = cb.id.replace('fw-', '');
      result[id] = cb.checked;
    });
    el.style.animation = 'none';
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.2s';
    setTimeout(() => el.remove(), 220);
    _wizardResolve?.({ ...DEFAULT_FEATURES, ...result });
    _wizardResolve = null;
  });
}