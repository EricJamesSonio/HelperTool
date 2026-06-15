const ICONS = {
  film: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M9 3v14"/><path d="M15 3v14"/><path d="M2 9h6"/><path d="M12 9h6"/><path d="M2 12h6"/><path d="M12 12h6"/><path d="M2 6h6"/><path d="M12 6h6"/></svg>',
  gif: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><text x="5" y="14" font-size="8" font-weight="bold" stroke="none" fill="currentColor">GIF</text></svg>',
  x: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>',
  play: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,3 17,10 5,17"/></svg>',
  clock: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></svg>',
  download: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v12"/><path d="M5 10l5 5 5-5"/><path d="M3 15v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/></svg>',
};

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '?';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}

function formatDuration(sec) {
  if (!sec || sec <= 0) return '0s';
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m + 'm ' + s + 's';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function renderGifOutputRow(outputFolder) {
  const displayPath = outputFolder || 'Temp folder (default)';
  return `
    <div class="vt-output-row">
      <span>Output:</span>
      <span class="vt-output-path">${escapeHtml(displayPath)}</span>
      <button class="vt-output-change-btn" id="gfChangeOutputBtn">Change</button>
    </div>`;
}

export function renderGifDropZone(inputPath, inputMeta) {
  if (inputPath && inputMeta) {
    const name = inputPath.split(/[\\/]/).pop();
    return `
      <div class="gf-file-info">
        <span class="gf-file-icon">${ICONS.film}</span>
        <div class="gf-file-details">
          <div class="gf-file-name">${escapeHtml(name)}</div>
          <div class="gf-file-meta"><span>${formatDuration(inputMeta.duration)}</span><span class="vt-meta-sep">|</span><span>${inputMeta.resolution}</span><span class="vt-meta-sep">|</span><span>${formatSize(inputMeta.fileSize)}</span></div>
        </div>
        <button class="gf-file-remove" id="gfRemoveFile" title="Remove file">${ICONS.x}</button>
      </div>`;
  }
  return `
    <div class="gf-drop-zone" id="gfDropZone">
      <div class="gf-drop-icon">${ICONS.gif}</div>
      <div class="gf-drop-title">Create GIF from Video</div>
      <div class="gf-drop-sub">Auto-generates clip suggestions &middot; Preview before exporting</div>
      <button class="gf-browse-btn" id="gfBrowseBtn">Select Video</button>
    </div>`;
}

export function renderGifLoading() {
  return `
    <div class="gf-loading">
      <div class="gf-loading-spinner"></div>
      <div class="gf-loading-text">Generating preview clips...</div>
    </div>`;
}

export function renderGifPreviews(previews, selectedId) {
  if (!previews || previews.length === 0) return '';
  return `
    <div class="gf-preview-section">
      <div class="gf-section-label">Select a clip</div>
      <div class="gf-preview-grid">
        ${previews.map(p => `
          <div class="gf-preview-card ${p.id === selectedId ? 'gf-preview-card--selected' : ''}" data-clip-id="${p.id}">
            <img class="gf-preview-gif" src="file://${p.gifPath}" alt="Preview ${p.id}" />
            <div class="gf-preview-info">
              <span class="gf-preview-time">${ICONS.clock} ${p.startTime}s &ndash; ${(p.startTime + p.duration).toFixed(1)}s</span>
              <span class="gf-preview-dur">${p.duration}s</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

export function renderGifSettings(settings, selectedClip) {
  const presets = [
    { id: 'small',    label: 'Small',        desc: '320p · 10fps' },
    { id: 'balanced', label: 'Balanced',     desc: '480p · 15fps' },
    { id: 'high',     label: 'High Quality', desc: '720p · 24fps' },
  ];
  const speedOpts = [0.5, 1, 2, 3];
  const start = selectedClip ? selectedClip.startTime : settings.startTime;
  const end = selectedClip ? selectedClip.startTime + selectedClip.duration : settings.endTime;

  return `
    <div class="gf-settings-section">
      <div class="gf-section-label">Clip Settings</div>
      <div class="gf-settings-row">
        <div class="gf-setting-group">
          <label class="gf-setting-label">Start (s)</label>
          <input class="gf-time-input" id="gfStartTime" type="number" step="0.1" min="0" value="${start}">
        </div>
        <div class="gf-setting-group">
          <label class="gf-setting-label">End (s)</label>
          <input class="gf-time-input" id="gfEndTime" type="number" step="0.1" min="0" value="${end}">
        </div>
        <div class="gf-setting-group">
          <label class="gf-setting-label">Speed</label>
          <div class="gf-speed-group" id="gfSpeedGroup">
            ${speedOpts.map(s => `
              <button class="gf-speed-btn ${s === settings.speed ? 'gf-speed-btn--active' : ''}" data-speed="${s}">${s}x</button>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="gf-section-label" style="margin-top:16px">Quality Preset</div>
      <div class="gf-preset-row">
        ${presets.map(p => `
          <div class="gf-preset-card ${p.id === settings.preset ? 'gf-preset-card--active' : ''}" data-preset="${p.id}">
            <div class="gf-preset-label">${p.label}</div>
            <div class="gf-preset-desc">${p.desc}</div>
          </div>
        `).join('')}
      </div>
      <button class="gf-generate-btn" id="gfGenerateBtn">${ICONS.play} Generate GIF</button>
    </div>`;
}

export function renderGifProgress(progress) {
  if (!progress) return '';
  const pct = progress.percent || 0;
  const step = progress.step || '';
  return `
    <div class="gf-progress-section">
      <div class="gf-progress-label">Generating GIF... ${pct}%</div>
      <div class="gf-progress-track"><div class="gf-progress-fill" style="width:${pct}%"></div></div>
      ${step ? `<div class="gf-progress-step">${escapeHtml(step)}</div>` : ''}
    </div>`;
}

export function renderGifResult(result) {
  if (!result) return '';
  return `
    <div class="gf-result">
      <div class="gf-result-title">${ICONS.download} GIF Created!</div>
      <div class="gf-result-row"><span class="gf-result-label">Duration</span><span class="gf-result-value">${result.duration}s</span></div>
      <div class="gf-result-row"><span class="gf-result-label">Resolution</span><span class="gf-result-value">${result.resolution}</span></div>
      <div class="gf-result-row"><span class="gf-result-label">FPS</span><span class="gf-result-value">${result.fps}</span></div>
      <div class="gf-result-row"><span class="gf-result-label">Size</span><span class="gf-result-value gf-result-highlight">${formatSize(result.fileSize)}</span></div>
      <div class="gf-result-actions">
        <button class="gf-result-btn gf-result-btn--primary" id="gfOpenFileBtn">${ICONS.download} Open File</button>
        <button class="gf-result-btn" id="gfOpenFolderBtn">Open Folder</button>
        <button class="gf-result-btn" id="gfNewGifBtn">New GIF</button>
      </div>
    </div>`;
}

export function renderGifError(error) {
  if (!error) return '';
  return `
    <div class="gf-error">
      <span>${escapeHtml(error)}</span>
      <button class="gf-error-retry" id="gfRetryBtn">Retry</button>
    </div>`;
}
