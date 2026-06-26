const CAT_PALETTE = [
  '#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa',
  '#f472b6', '#fb923c', '#2dd4bf', '#e879f9', '#38bdf8',
];

const ICON_MAP = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"/><circle cx="10" cy="9" r="1.5"/><circle cx="6" cy="9" r="1.5"/><circle cx="14" cy="9" r="1.5"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="12" height="14" rx="1.5"/><path d="M3 15V3a1 1 0 0 1 1-1h10"/></svg>';

let _overlay = null;
let _data = null;

export async function openCodebaseMap() {
  closeCodebaseMap();
  _overlay = document.createElement('div');
  _overlay.className = 'cm-overlay';
  _overlay.innerHTML = `
    <div class="cm-modal">
      <div class="cm-header">
        <div class="cm-title">${ICON_MAP} Codebase Map</div>
        <div class="cm-header-actions">
          <button class="cm-btn" id="cmCopyBtn">${ICON_COPY} Copy Map</button>
          <button class="cm-btn-close" id="cmCloseBtn">✕</button>
        </div>
      </div>
      <div class="cm-body" id="cmBody">
        <div class="cm-loading">Generating map...</div>
      </div>
    </div>
  `;
  document.body.appendChild(_overlay);

  _overlay.querySelector('#cmCloseBtn').addEventListener('click', closeCodebaseMap);
  _overlay.querySelector('#cmCopyBtn')?.addEventListener('click', copyMap);
  _overlay.addEventListener('click', e => { if (e.target === _overlay) closeCodebaseMap(); });
  document.addEventListener('keydown', _escHandler);

  await loadAndRender();
}

function _escHandler(e) {
  if (e.key === 'Escape') closeCodebaseMap();
}

export function closeCodebaseMap() {
  if (_overlay) {
    _overlay.remove();
    _overlay = null;
    _data = null;
  }
  document.removeEventListener('keydown', _escHandler);
}

export function isOpen() {
  return !!_overlay && document.body.contains(_overlay);
}

async function loadAndRender() {
  const body = document.getElementById('cmBody');
  if (!body) return;

  try {
    const repoPath = await getActiveRepoPath();
    if (!repoPath) {
      body.innerHTML = '<div class="cm-error">No repository selected. Open a project first.</div>';
      return;
    }

    _data = await window.electronAPI.codebaseMap.generate({ repoPath });
    if (!_data || _data.error) {
      body.innerHTML = `<div class="cm-error">${_esc(_data?.error || 'Failed to generate map')}</div>`;
      return;
    }

    render(body);
  } catch (err) {
    body.innerHTML = `<div class="cm-error">${_esc(err.message)}</div>`;
  }
}

async function getActiveRepoPath() {
  try {
    const result = await window.electronAPI.getActiveProject?.();
    return result?.repoPath || result || null;
  } catch { return null; }
}

function render(body) {
  const { overview, modules, keyFiles, circularDeps } = _data;

  let html = '';

  // Overview Bar
  html += '<div class="cm-overview">';
  html += overviewBarItem('📁', `${overview.totalFiles}`, 'files');
  html += overviewBarItem('🔧', `${overview.totalSymbols}`, 'symbols');
  html += overviewBarItem('🔗', `${overview.totalImports}`, 'imports');
  for (const [lang, count] of Object.entries(overview.languages || {})) {
    if (lang) html += `<span class="cm-lang-badge">${_esc(lang.toUpperCase())} ${count}</span>`;
  }
  html += '</div>';

  // Circular deps warning
  if (circularDeps && circularDeps.length > 0) {
    html += '<div class="cm-circular">';
    html += '<div class="cm-circular-title">⚠️ ' + circularDeps.length + ' circular dependenc' + (circularDeps.length !== 1 ? 'ies' : 'y') + ' detected</div>';
    for (let i = 0; i < Math.min(circularDeps.length, 5); i++) {
      html += `<div class="cm-cycle-row">Cycle ${i + 1}: ${circularDeps[i].join(' → ')}</div>`;
    }
    html += '</div>';
  }

  // Module Grid
  html += '<div class="cm-section-title">Modules</div>';
  html += '<div class="cm-module-grid" id="cmModuleGrid">';
  html += '</div>';

  // Key Files
  html += '<div class="cm-keyfiles">';
  html += '<div class="cm-section-title">Key Files</div>';
  for (const kf of (keyFiles || []).slice(0, 10)) {
    const label = kf.dependentCount === 0 && kf.importCount > 5 ? 'entry point' :
                  kf.dependentCount > 10 ? 'core/shared' :
                  kf.dependentCount > 3 ? 'shared utility' : '';
    html += `<div class="cm-keyfile-row" data-path="${_esc(kf.path)}">
      <span class="cm-kf-path">${_esc(kf.path)}</span>
      <span class="cm-kf-badge imports">${kf.importCount} imports</span>
      <span class="cm-kf-badge dependents">${kf.dependentCount} dependents</span>
      <span class="cm-kf-badge symbols">${kf.symbolCount} symbols</span>
      ${label ? `<span class="cm-kf-label">— ${label}</span>` : ''}
    </div>`;
  }
  html += '</div>';

  body.innerHTML = html;

  // Render module cards
  const grid = document.getElementById('cmModuleGrid');
  if (grid) renderModuleGrid(grid, modules);

  // Key file click → select in tree
  body.querySelectorAll('.cm-keyfile-row').forEach(el => {
    el.addEventListener('click', () => selectFileInTree(el.dataset.path));
  });
}

function overviewBarItem(icon, value, label) {
  return `<span class="cm-stat">${icon} <strong>${value}</strong> ${label}</span>`;
}

function renderModuleGrid(grid, modules) {
  modules.forEach((m, i) => {
    const color = CAT_PALETTE[i % CAT_PALETTE.length];
    const card = document.createElement('div');
    card.className = 'cm-module-card';
    card.style.setProperty('--cm-color', color);
    card.dataset.module = m.name;

    let depsHtml = '';
    if (m.importsFrom.length) {
      depsHtml += m.importsFrom.map(d => `<span class="cm-dep-badge imports">→ ${_esc(d)}</span>`).join('');
    }
    if (m.importedBy.length) {
      depsHtml += m.importedBy.map(d => `<span class="cm-dep-badge imported-by">← ${_esc(d)}</span>`).join('');
    }

    card.innerHTML = `
      <div class="cm-module-gem">
        <svg viewBox="0 0 40 40" width="22" height="22">
          <polygon points="20,4 36,14 36,26 20,36 4,26 4,14" fill="${color}22" stroke="${color}" stroke-width="1.5"/>
          <polygon points="20,4 36,14 20,18" fill="${color}44"/>
          <polygon points="20,18 36,14 36,26 20,36" fill="${color}33"/>
        </svg>
        <span class="cm-module-name">${_esc(m.name)}</span>
      </div>
      <div class="cm-module-stats">
        <span>📁 ${m.fileCount}</span>
        <span>🔧 ${m.symbolCount}</span>
      </div>
      ${depsHtml ? `<div class="cm-module-deps">${depsHtml}</div>` : ''}
      <div class="cm-expanded" id="cmExpand_${_esc(m.name)}" style="display:none"></div>
    `;

    card.addEventListener('click', () => toggleModule(card, m, color));
    grid.appendChild(card);
  });
}

function toggleModule(card, module, color) {
  const wasExpanded = card.classList.contains('expanded');
  // Close all others
  document.querySelectorAll('.cm-module-card.expanded').forEach(c => {
    c.classList.remove('expanded');
    const exp = c.querySelector('.cm-expanded');
    if (exp) exp.style.display = 'none';
  });

  if (wasExpanded) return;

  card.classList.add('expanded');
  const exp = card.querySelector('.cm-expanded');
  exp.style.display = 'grid';

  // Files
  let filesHtml = '<div class="cm-expanded-section"><div class="cm-expanded-section-title">Files</div>';
  for (const f of module.files) {
    const exports = f.exports || [];
    const exportHint = exports.length ? ` (${exports.length} exports)` : '';
    filesHtml += `<div class="cm-expanded-file" data-path="${_esc(f.path)}">
      <span class="cm-filename">${_esc(f.path)}${exportHint}</span>
      <span class="cm-file-symcount">${f.symbolCount} syms</span>
    </div>`;
  }
  filesHtml += '</div>';

  // Dependencies
  let depsHtml = '<div class="cm-expanded-section"><div class="cm-expanded-section-title">Dependencies</div>';
  if (module.importsFrom.length) {
    depsHtml += module.importsFrom.map(d =>
      `<div class="cm-expanded-file" style="cursor:default"><span class="cm-filename">→ ${_esc(d)}</span></div>`
    ).join('');
  } else {
    depsHtml += '<div class="cm-expanded-empty">(standalone — no cross-module imports)</div>';
  }

  depsHtml += '<div style="margin-top:8px"></div>';
  depsHtml += '<div class="cm-expanded-section-title">Used by</div>';
  if (module.importedBy.length) {
    depsHtml += module.importedBy.map(d =>
      `<div class="cm-expanded-file" style="cursor:default"><span class="cm-filename">← ${_esc(d)}</span></div>`
    ).join('');
  } else {
    depsHtml += '<div class="cm-expanded-empty">(not imported by other modules)</div>';
  }
  depsHtml += '</div>';

  exp.innerHTML = filesHtml + depsHtml;

  // Click file → navigate
  exp.querySelectorAll('.cm-expanded-file[data-path]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectFileInTree(el.dataset.path);
    });
  });
}

function selectFileInTree(filePath) {
  const treeContainer = document.getElementById('treeContainer');
  if (!treeContainer) return;

  const allItems = treeContainer.querySelectorAll('[data-node-path]');
  for (const item of allItems) {
    const nodePath = item.dataset.nodePath;
    if (nodePath === filePath || nodePath?.endsWith('/' + filePath)) {
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      item.style.outline = '2px solid var(--accent, #f0b429)';
      item.style.outlineOffset = '-1px';
      setTimeout(() => { item.style.outline = ''; }, 2000);
      return;
    }
  }

  // Try searching the tree
  const searchInput = document.getElementById('treeSearchInput');
  if (searchInput) {
    searchInput.value = filePath;
    searchInput.dispatchEvent(new Event('input'));
    setTimeout(() => {
      for (const item of treeContainer.querySelectorAll('[data-node-path]')) {
        if (item.dataset.nodePath?.endsWith(filePath.split('/').pop()) || item.dataset.nodePath === filePath) {
          item.scrollIntoView({ behavior: 'smooth', block: 'center' });
          item.style.outline = '2px solid var(--accent, #f0b429)';
          item.style.outlineOffset = '-1px';
          setTimeout(() => { item.style.outline = ''; }, 2000);
          break;
        }
      }
    }, 200);
  }
}

async function copyMap() {
  if (!_data || !_data.textMap) return;

  const text = _data.textMap;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  showToast();
}

function showToast() {
  const modal = _overlay?.querySelector('.cm-modal');
  if (!modal) return;
  const toast = document.createElement('div');
  toast.className = 'cm-toast';
  toast.textContent = 'Map copied to clipboard!';
  modal.appendChild(toast);
  setTimeout(() => toast.remove(), 1600);
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
