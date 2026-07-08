import { getFeatures, saveFeatures } from '../featureManager.js';

const FEATURE_SVGS = {
  apiTool:       '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M7 2v6a3 3 0 006 0V2"/><path d="M5 8h10"/><path d="M9 14v4"/></svg>',
  secretHolder:  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="4" y="10" width="12" height="8" rx="1"/><path d="M7 10V6a3 3 0 016 0v4"/><circle cx="10" cy="14" r=".5" fill="currentColor"/><path d="M10 14v2"/></svg>',
  themeEngine:   '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="10" cy="10" r="7"/><circle cx="7" cy="8" r="1" fill="currentColor"/><circle cx="13" cy="8" r="1" fill="currentColor"/><circle cx="10" cy="13" r="1" fill="currentColor"/></svg>',
  folderFilters: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M2 7v9a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2H9L7 4H4a2 2 0 00-2 2v1z"/></svg>',
  swagger:       '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 2L5 11h5l-2 9 9-9h-5l2-9z"/></svg>',
  canvasTool:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M16 2a2 2 0 00-2.83 0L4 11.17V16h4.83L16 6.83A2 2 0 0016 2z"/><path d="M4 16l-2 2"/></svg>',
  dbInspector:   '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><ellipse cx="10" cy="4" rx="7" ry="2"/><path d="M3 4v6c0 1.1 3.13 2 7 2s7-.9 7-2V4"/><path d="M3 10v6c0 1.1 3.13 2 7 2s7-.9 7-2v-6"/></svg>',
};

const FEATURES_META = [
  { id: 'apiTool',       icon: FEATURE_SVGS.apiTool,       label: 'API Tool',          desc: 'Built-in API tester + Swagger import', heavy: true  },
  { id: 'secretHolder',  icon: FEATURE_SVGS.secretHolder,  label: 'Secret Holder',     desc: 'Password-protected vault for keys & notes', heavy: false },
  { id: 'themeEngine',   icon: FEATURE_SVGS.themeEngine,   label: 'Full Theme Engine', desc: '20 themes + accent pickers (reload required)', heavy: true  },
  { id: 'folderFilters', icon: FEATURE_SVGS.folderFilters, label: 'Folder Filters',    desc: 'Ignore / Focus folder panels', heavy: false },
  { id: 'swagger',       icon: FEATURE_SVGS.swagger,       label: 'Swagger Import',    desc: 'OpenAPI spec import \u2014 only useful with API Tool', heavy: false },
  { id: 'canvasTool',    icon: FEATURE_SVGS.canvasTool,    label: 'Canvas Tool',      desc: 'Infinite canvas for diagrams, sketches & flowcharts', heavy: false },
  { id: 'dbInspector',   icon: FEATURE_SVGS.dbInspector,   label: 'Database Inspector', desc: 'Visualize & explore database schemas', heavy: false },
];

function _renderFeaturesList() {
  const list = document.getElementById('settingsFeatureList');
  if (!list) return;

  const current = getFeatures();
  list.innerHTML = '';

  FEATURES_META.forEach(f => {
    const isOn = !!current[f.id];

    const row = document.createElement('label');
    row.htmlFor   = `sf-feat-${f.id}`;
    row.className = 'sf-feat-row';
    row.style.cssText = `
      display:flex; align-items:center; gap:10px;
      padding:8px 10px; border-radius:8px; cursor:pointer;
      border:1px solid var(--border-subtle);
      background:${isOn ? 'var(--bg-active)' : 'transparent'};
      transition:background 0.15s, border-color 0.15s;
    `;

    row.innerHTML = `
      <span style="display:inline-flex;align-items:center;flex-shrink:0">${f.icon}</span>
      <span style="flex:1;min-width:0">
        <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);display:block">
          ${f.label}
          ${f.heavy ? `<span style="
            display:inline-block;font-size:0.6rem;font-weight:700;
            text-transform:uppercase;letter-spacing:0.5px;
            color:var(--yellow);background:var(--yellow-dim);
            border:1px solid rgba(251,191,36,0.25);border-radius:4px;
            padding:1px 5px;margin-left:4px;vertical-align:middle">heavy</span>` : ''}
        </span>
        <span style="font-size:0.74rem;color:var(--text-muted)">${f.desc}</span>
      </span>
      <input
        type="checkbox"
        id="sf-feat-${f.id}"
        ${isOn ? 'checked' : ''}
        style="width:15px;height:15px;cursor:pointer;accent-color:var(--accent);flex-shrink:0"
      />
    `;

    const cb = row.querySelector('input');
    cb.addEventListener('change', () => {
      row.style.background    = cb.checked ? 'var(--bg-active)' : 'transparent';
      row.style.borderColor   = cb.checked ? 'var(--border-default)' : 'var(--border-subtle)';
    });

    list.appendChild(row);
  });
}

export { FEATURES_META, _renderFeaturesList, saveFeatures };
