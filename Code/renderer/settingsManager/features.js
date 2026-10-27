import { getFeatures, saveFeatures } from '../featureManager.js';

const SVG_OPEN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">';
const svg = (inner) => SVG_OPEN + inner + '</svg>';

const FEATURE_SVGS = {
  apiTool:       svg('<path d="M7 2v6a3 3 0 006 0V2"/><path d="M5 8h10"/><path d="M9 14v4"/>'),
  secretHolder:  svg('<rect x="4" y="10" width="12" height="8" rx="1"/><path d="M7 10V6a3 3 0 016 0v4"/><circle cx="10" cy="14" r=".5" fill="currentColor"/><path d="M10 14v2"/>'),
  themeEngine:   svg('<circle cx="10" cy="10" r="7"/><circle cx="7" cy="8" r="1" fill="currentColor"/><circle cx="13" cy="8" r="1" fill="currentColor"/><circle cx="10" cy="13" r="1" fill="currentColor"/>'),
  folderFilters: svg('<path d="M2 7v9a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2H9L7 4H4a2 2 0 00-2 2v1z"/>'),
  swagger:       svg('<path d="M12 2L5 11h5l-2 9 9-9h-5l2-9z"/>'),
  canvasTool:    svg('<path d="M16 2a2 2 0 00-2.83 0L4 11.17V16h4.83L16 6.83A2 2 0 0016 2z"/><path d="M4 16l-2 2"/>'),
  dbInspector:   svg('<ellipse cx="10" cy="4" rx="7" ry="2"/><path d="M3 4v6c0 1.1 3.13 2 7 2s7-.9 7-2V4"/><path d="M3 10v6c0 1.1 3.13 2 7 2s7-.9 7-2v-6"/>'),
  generic:       svg('<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 8h6"/><path d="M7 12h4"/>'),
};

const GROUPS = ['Code and Git', 'AI and Prompts', 'API and Data', 'Workspace and Utilities', 'Monitoring', 'Appearance'];

const FEATURES_META = [
  { id: 'gitTool',              group: 'Code and Git', label: 'Git Tool',           desc: 'Stage, commit & push changes' },
  { id: 'githubExplorer',       group: 'Code and Git', label: 'GitHub Explorer',    desc: 'Browse any public repo file tree' },
  { id: 'codebaseMap',          group: 'Code and Git', label: 'Codebase Map',       desc: 'Visual codebase structure & dependencies' },
  { id: 'graphify',             group: 'Code and Git', label: 'Graphify',           desc: 'Find relevant code by natural language' },
  { id: 'symbolIndex',          group: 'Code and Git', label: 'Symbol Index',       desc: 'AST-based code symbol search with SQLite indexing', heavy: true },
  { id: 'projectInspector',     group: 'Code and Git', label: 'Project Inspector',  desc: 'Analyze languages, frameworks & tools used in this project' },
  { id: 'locDetector',          group: 'Code and Git', label: 'LOC Detector',       desc: 'Find bloated files by line count' },
  { id: 'codebbaseChat',        group: 'Code and Git', label: 'HelperChat',         desc: 'Query your codebase structure' },
  { id: 'teamActivityTool',     group: 'Code and Git', label: 'Team Activity',      desc: 'Contributor stats & commit timeline' },

  { id: 'promptTool',           group: 'AI and Prompts', label: 'Prompt Tool',      desc: 'Manage custom AI prompts' },
  { id: 'codeswampChat',        group: 'AI and Prompts', label: 'Code Swamp',       desc: 'Chat with AI via Code Swamp' },
  { id: 'researcherTool',       group: 'AI and Prompts', label: 'Researcher',       desc: 'Select AI & build prompts with live browser' },
  { id: 'mcp',                  group: 'AI and Prompts', label: 'MCP',              desc: 'Tool provider & server manager' },
  { id: 'harnessTool',          group: 'AI and Prompts', label: 'Harness Tool',     desc: 'Controlled AI execution loop' },
  { id: 'globalSeeder',         group: 'AI and Prompts', label: 'Global Seeder',    desc: 'Seed structure or code across the whole repo (sidebar and shortcut)' },
  { id: 'shortcutMode',         group: 'AI and Prompts', label: 'Shortcut Mode',    desc: 'Paste a file list to auto-select files (shortcut)' },
  { id: 'fileSeeder',           group: 'AI and Prompts', label: 'File Seeder',      desc: 'Seed files into a folder' },

  { id: 'apiTool',              group: 'API and Data', label: 'API Tool',           desc: 'Built-in API tester + Swagger import', heavy: true },
  { id: 'swagger',              group: 'API and Data', label: 'Swagger Import',     desc: 'OpenAPI spec import - only useful with API Tool' },
  { id: 'dbInspector',          group: 'API and Data', label: 'Database Inspector', desc: 'Visualize & explore database schemas' },
  { id: 'dockerTool',           group: 'API and Data', label: 'Docker Manager',     desc: 'Manage containers & images' },
  { id: 'portManagerTool',      group: 'API and Data', label: 'Port Manager',       desc: 'View & kill processes on ports' },
  { id: 'envManager',           group: 'API and Data', label: 'Env Files',          desc: 'Manage .env configuration files' },
  { id: 'secretHolder',         group: 'API and Data', label: 'Secret Holder',      desc: 'Password-protected vault for keys & notes' },

  { id: 'workspaceTool',        group: 'Workspace and Utilities', label: 'Workspace',          desc: 'Projects, tickets & workers' },
  { id: 'terminalTool',         group: 'Workspace and Utilities', label: 'Terminal',           desc: 'Integrated command-line terminal' },
  { id: 'canvasTool',           group: 'Workspace and Utilities', label: 'Canvas Tool',        desc: 'Infinite canvas for diagrams, sketches & flowcharts' },
  { id: 'automationSketch',     group: 'Workspace and Utilities', label: 'Automation Sketch',  desc: 'Visual flow builder' },
  { id: 'uiLayoutHelper',       group: 'Workspace and Utilities', label: 'UI Layout Helper',   desc: 'Draw UI layouts as ASCII art' },
  { id: 'blueprintLibraryTool', group: 'Workspace and Utilities', label: 'Blueprint Library',  desc: 'Architecture patterns & code structure guides' },
  { id: 'essentialsGlossary',   group: 'Workspace and Utilities', label: 'SE Essentials',      desc: 'Software engineering term glossary' },
  { id: 'profileTool',          group: 'Workspace and Utilities', label: 'Profile',            desc: 'Personal stats & activity heatmap' },
  { id: 'videoTool',            group: 'Workspace and Utilities', label: 'Video Compressor',   desc: 'Compress video files with FFmpeg' },
  { id: 'gmailTool',            group: 'Workspace and Utilities', label: 'Gmail Inbox',        desc: 'Check unread emails' },

  { id: 'ecosystemWatcher',     group: 'Monitoring', label: 'Ecosystem Dashboard',  desc: 'Real-time logs, network, console & errors' },
  { id: 'performanceTracker',   group: 'Monitoring', label: 'Performance Tracker',  desc: 'Browser performance metrics & timing data' },

  { id: 'themeEngine',          group: 'Appearance', label: 'Full Theme Engine',    desc: '20 themes + accent pickers (reload required)', heavy: true },
  { id: 'folderFilters',        group: 'Appearance', label: 'Folder Filters',       desc: 'Ignore / Focus folder panels' },
].map((f) => ({ ...f, icon: FEATURE_SVGS[f.id] || FEATURE_SVGS.generic, heavy: !!f.heavy }));

const HEAVY_BADGE =
  '<span style="display:inline-block;font-size:0.6rem;font-weight:700;' +
  'text-transform:uppercase;letter-spacing:0.5px;color:var(--yellow);background:var(--yellow-dim);' +
  'border:1px solid rgba(251,191,36,0.25);border-radius:4px;padding:1px 5px;margin-left:4px;' +
  'vertical-align:middle">heavy</span>';

const INPUT_STYLE =
  'flex:1;min-width:0;padding:6px 9px;border-radius:7px;border:1px solid var(--border-default);' +
  'background:var(--bg-elevated);color:var(--text-primary);font-size:0.78rem;outline:none';

const BTN_STYLE =
  'padding:6px 10px;border-radius:7px;border:1px solid var(--border-default);background:transparent;' +
  'color:var(--text-secondary);cursor:pointer;font-size:0.74rem;white-space:nowrap';

function _checkboxes() {
  return Array.from(document.querySelectorAll('#settingsFeatureList input[id^="sf-feat-"]'));
}

function _updateCount() {
  const el = document.getElementById('settingsFeatCount');
  if (!el) return;
  const boxes = _checkboxes();
  el.textContent = boxes.filter((b) => b.checked).length + ' of ' + boxes.length + ' enabled';
}

function _applyFilter() {
  const input = document.getElementById('settingsFeatureFilter');
  const q = (input ? input.value : '').trim().toLowerCase();
  const list = document.getElementById('settingsFeatureList');
  if (!list) return;
  const visibleByGroup = {};
  list.querySelectorAll('.sf-feat-row').forEach((row) => {
    const hit = !q || (row.dataset.search || '').includes(q);
    row.style.display = hit ? 'flex' : 'none';
    if (hit) visibleByGroup[row.dataset.group] = true;
  });
  list.querySelectorAll('.sf-feat-group').forEach((head) => {
    head.style.display = visibleByGroup[head.dataset.group] ? 'block' : 'none';
  });
}

function _setVisible(on) {
  _checkboxes().forEach((cb) => {
    const row = cb.closest('.sf-feat-row');
    if (!row || row.style.display === 'none') return;
    if (cb.checked === on) return;
    cb.checked = on;
    cb.dispatchEvent(new Event('change'));
  });
  _updateCount();
}

function _buildToolbar() {
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px';
  bar.innerHTML =
    '<input type="search" id="settingsFeatureFilter" placeholder="Filter tools..." style="' + INPUT_STYLE + '" />' +
    '<button type="button" id="settingsFeatAllOn" style="' + BTN_STYLE + '">Enable all</button>' +
    '<button type="button" id="settingsFeatAllOff" style="' + BTN_STYLE + '">Disable all</button>' +
    '<span id="settingsFeatCount" style="width:100%;font-size:0.72rem;color:var(--text-muted)"></span>';
  bar.querySelector('#settingsFeatureFilter').addEventListener('input', _applyFilter);
  bar.querySelector('#settingsFeatAllOn').addEventListener('click', () => _setVisible(true));
  bar.querySelector('#settingsFeatAllOff').addEventListener('click', () => _setVisible(false));
  return bar;
}

function _buildRow(f, isOn) {
  const row = document.createElement('label');
  row.htmlFor = 'sf-feat-' + f.id;
  row.className = 'sf-feat-row';
  row.dataset.group = f.group;
  row.dataset.search = (f.label + ' ' + f.desc + ' ' + f.id).toLowerCase();
  row.style.cssText =
    'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;' +
    'border:1px solid var(--border-subtle);' +
    'background:' + (isOn ? 'var(--bg-active)' : 'transparent') + ';' +
    'transition:background 0.15s, border-color 0.15s;';

  row.innerHTML =
    '<span style="display:inline-flex;align-items:center;flex-shrink:0">' + f.icon + '</span>' +
    '<span style="flex:1;min-width:0">' +
      '<span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);display:block">' +
        f.label + (f.heavy ? HEAVY_BADGE : '') +
      '</span>' +
      '<span style="font-size:0.74rem;color:var(--text-muted)">' + f.desc + '</span>' +
    '</span>' +
    '<input type="checkbox" id="sf-feat-' + f.id + '"' + (isOn ? ' checked' : '') +
    ' style="width:15px;height:15px;cursor:pointer;accent-color:var(--accent);flex-shrink:0" />';

  const cb = row.querySelector('input');
  cb.addEventListener('change', () => {
    row.style.background  = cb.checked ? 'var(--bg-active)' : 'transparent';
    row.style.borderColor = cb.checked ? 'var(--border-default)' : 'var(--border-subtle)';
    _updateCount();
  });
  return row;
}

function _renderFeaturesList() {
  const list = document.getElementById('settingsFeatureList');
  if (!list) return;

  const current = getFeatures();
  list.innerHTML = '';
  list.appendChild(_buildToolbar());

  GROUPS.forEach((group) => {
    const items = FEATURES_META.filter((f) => f.group === group);
    if (!items.length) return;
    const head = document.createElement('div');
    head.className = 'sf-feat-group';
    head.dataset.group = group;
    head.textContent = group;
    head.style.cssText =
      'margin:10px 0 2px;font-size:0.68rem;font-weight:700;text-transform:uppercase;' +
      'letter-spacing:0.6px;color:var(--text-muted)';
    list.appendChild(head);
    items.forEach((f) => list.appendChild(_buildRow(f, current[f.id] !== false)));
  });

  _updateCount();
}

export { FEATURES_META, _renderFeaturesList, saveFeatures };