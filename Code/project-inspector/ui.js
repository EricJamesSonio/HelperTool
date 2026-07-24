export function initProjectInspector(container, repoPath) {
  let currentRepo = repoPath;
  let inspection = null;
  let loading = false;

  function render() {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'pi-wrapper';
    wrapper.innerHTML = `
      <div class="pi-header">
        <div class="pi-title-row">
          <h2 class="pi-title">Project Inspector</h2>
          <span class="pi-status" id="piStatus">${inspection ? 'Inspected' : 'Not inspected'}</span>
        </div>
        <div class="pi-actions">
          <button class="pi-btn pi-btn-primary" id="piInspectBtn">
            ${inspection ? 'Re-inspect' : 'Inspect Codebase'}
          </button>
          ${inspection ? '<button class="pi-btn pi-btn-danger" id="piDeleteBtn">Delete</button>' : ''}
        </div>
      </div>
      <div class="pi-body" id="piBody">
        ${inspection ? renderInspection(inspection) : renderEmpty()}
      </div>
    `;
    container.appendChild(wrapper);

    document.getElementById('piInspectBtn').addEventListener('click', () => runInspection());
    const deleteBtn = document.getElementById('piDeleteBtn');
    if (deleteBtn) deleteBtn.addEventListener('click', () => deleteInspection());
  }

  function renderEmpty() {
    return `
      <div class="pi-empty">
        <div class="pi-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <circle cx="12" cy="8" r="0.5" fill="currentColor"/>
          </svg>
        </div>
        <p class="pi-empty-text">No inspection data for this project.</p>
        <p class="pi-empty-sub">Click <strong>Inspect Codebase</strong> to analyze languages, frameworks, databases, and more.</p>
      </div>
    `;
  }

  function renderInspection(data) {
    const timeAgo = data.inspectedAt ? formatTimeAgo(data.inspectedAt) : '';

    const gridSections = [
      data.languages && data.languages.length > 0 ? renderSection('Languages', renderLanguages(data.languages)) : '',
      data.frameworks && data.frameworks.length > 0 ? renderSection('Frameworks', renderFrameworks(data.frameworks)) : '',
      data.databases && data.databases.length > 0 ? renderSection('Databases', renderChips(data.databases, 'db')) : '',
      data.thirdPartyTools && data.thirdPartyTools.length > 0 ? renderSection('Third-Party Tools', renderChips(data.thirdPartyTools, 'tool')) : '',
      data.envKeys && data.envKeys.length > 0 ? renderSection('Environment Keys', renderEnvKeys(data.envKeys)) : '',
      data.scripts ? renderSection('Scripts', renderScripts(data.scripts)) : '',
      ...(data.subProjects && data.subProjects.length > 0
        ? data.subProjects.filter(sp => sp.scripts && Object.keys(sp.scripts).length > 0).map(sp =>
            renderSection('Scripts (' + esc(sp.name) + ')', renderScripts(sp.scripts))
          )
        : []),
      data.packageManager ? renderSection('Package Manager', `<span class="pi-chip pi-chip-pm">${data.packageManager}</span>`) : '',
      data.entryPoints && data.entryPoints.length > 0 ? renderSection('Entry Points', data.entryPoints.map(e => `<code class="pi-code">${esc(e)}</code>`).join(' ')) : '',
    ].filter(Boolean).join('');

    return `
      <div class="pi-summary">
        <div class="pi-summary-item">
          <span class="pi-summary-label">Project Type</span>
          <span class="pi-summary-value pi-type-badge pi-type-${data.projectType}">${data.projectType}</span>
        </div>
        <div class="pi-summary-item">
          <span class="pi-summary-label">Total Files</span>
          <span class="pi-summary-value">${data.totalFiles?.toLocaleString() || 0}</span>
        </div>
        <div class="pi-summary-item">
          <span class="pi-summary-label">Last inspected</span>
          <span class="pi-summary-value">${timeAgo || 'N/A'}</span>
        </div>
      </div>

      <div class="pi-sections-grid">${gridSections}</div>
    `;
  }

  function renderSection(title, content) {
    return `
      <div class="pi-section">
        <h3 class="pi-section-title">${title}</h3>
        <div class="pi-section-content">${content}</div>
      </div>
    `;
  }

  function renderLanguages(languages) {
    const maxCount = languages[0]?.fileCount || 1;
    return languages.map(lang => {
      const pct = lang.percentage || 0;
      const barWidth = Math.max((lang.fileCount / maxCount) * 100, 5);
      return `
        <div class="pi-lang-row">
          <span class="pi-lang-name">${esc(lang.name)}</span>
          <div class="pi-lang-bar-track">
            <div class="pi-lang-bar-fill" style="width:${barWidth}%"></div>
          </div>
          <span class="pi-lang-count">${lang.fileCount.toLocaleString()} <span class="pi-lang-pct">${pct}%</span></span>
        </div>
      `;
    }).join('');
  }

  function renderFrameworks(frameworks) {
    return frameworks.map(fw => `
      <div class="pi-fw-row">
        <span class="pi-fw-name">${esc(fw.name)}</span>
        ${fw.version ? `<code class="pi-code">${esc(fw.version)}</code>` : ''}
        <span class="pi-fw-type pi-type-badge pi-type-${fw.type}">${fw.type}</span>
      </div>
    `).join('');
  }

  function renderChips(items, type) {
    return items.map(item => `<span class="pi-chip pi-chip-${type}">${esc(item)}</span>`).join(' ');
  }

  function renderEnvKeys(envKeys) {
    return envKeys.map(entry => `
      <div class="pi-env-group">
        <div class="pi-env-source">${esc(entry.source)}</div>
        <div class="pi-env-keys">
          ${entry.keys && entry.keys.length > 0
            ? entry.keys.map(k => `<code class="pi-code pi-env-key">${esc(k)}</code>`).join(' ')
            : '<span class="pi-env-empty">(empty or comments only)</span>'}
        </div>
      </div>
    `).join('');
  }

  function renderScripts(scripts) {
    return Object.entries(scripts).map(([name, cmd]) => `
      <div class="pi-script-row">
        <span class="pi-script-name">${esc(name)}</span>
        <code class="pi-code pi-script-cmd">${esc(cmd)}</code>
      </div>
    `).join('');
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTimeAgo(isoString) {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  async function runInspection() {
    if (loading) return;
    if (!currentRepo) return;
    loading = true;
    const btn = document.getElementById('piInspectBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Inspecting...'; }

    try {
      const res = await window.projectInspector.inspect(currentRepo);
      if (res.success) {
        inspection = res.data;
        render();
      } else {
        console.error('[PI] Inspect failed:', res.error);
      }
    } catch (err) {
      console.error('[PI] Inspect error:', err);
    } finally {
      loading = false;
    }
  }

  async function deleteInspection() {
    if (!currentRepo) return;
    try {
      await window.projectInspector.delete(currentRepo);
      inspection = null;
      render();
    } catch (err) {
      console.error('[PI] Delete error:', err);
    }
  }

  async function loadExisting() {
    if (!currentRepo) return;
    try {
      const res = await window.projectInspector.get(currentRepo);
      if (res.success && res.data) {
        inspection = res.data;
        render();
      } else {
        render();
      }
    } catch {
      render();
    }
  }

  function updateRepo(newRepo) {
    currentRepo = newRepo;
    inspection = null;
    loadExisting();
  }

  loadExisting();

  return { updateRepo, render };
}
