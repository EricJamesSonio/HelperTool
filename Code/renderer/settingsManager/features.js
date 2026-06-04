import { getFeatures, saveFeatures } from '../featureManager.js';

const FEATURES_META = [
  { id: 'apiTool',       icon: '\u{1F50C}', label: 'API Tool',          desc: 'Built-in API tester + Swagger import', heavy: true  },
  { id: 'secretHolder',  icon: '\u{1F510}', label: 'Secret Holder',     desc: 'Password-protected vault for keys & notes', heavy: false },
  { id: 'themeEngine',   icon: '\u{1F3A8}', label: 'Full Theme Engine', desc: '20 themes + accent pickers (reload required)', heavy: true  },
  { id: 'folderFilters', icon: '\u{1F4C1}', label: 'Folder Filters',    desc: 'Ignore / Focus folder panels', heavy: false },
  { id: 'swagger',       icon: '\u26A1', label: 'Swagger Import',    desc: 'OpenAPI spec import \u2014 only useful with API Tool', heavy: false },
  { id: 'canvasTool',    icon: '\u{1F3A8}', label: 'Canvas Tool',      desc: 'Infinite canvas for diagrams, sketches & flowcharts', heavy: false },
  { id: 'dbInspector',   icon: '\u{1F5C3}', label: 'Database Inspector', desc: 'Visualize & explore database schemas', heavy: false },
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
      <span style="font-size:1.15rem;flex-shrink:0">${f.icon}</span>
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
