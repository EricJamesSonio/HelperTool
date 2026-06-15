const ICONS = {
  film: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M9 3v14"/><path d="M15 3v14"/><path d="M2 9h6"/><path d="M12 9h6"/><path d="M2 12h6"/><path d="M12 12h6"/><path d="M2 6h6"/><path d="M12 6h6"/></svg>',
  gif: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><text x="5" y="14" font-size="8" font-weight="bold" stroke="none" fill="currentColor">GIF</text></svg>',
  x: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>',
  play: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,3 17,10 5,17"/></svg>',
  download: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v12"/><path d="M5 10l5 5 5-5"/><path d="M3 15v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/></svg>',
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4v12"/><path d="M4 10h12"/></svg>',
  scissors: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l5 6"/><path d="M11 4l-5 6"/><circle cx="4" cy="15" r="2"/><circle cx="16" cy="15" r="2"/><path d="M11 10l5 5"/></svg>',
  trash: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14"/><path d="M6 5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M8 9v6"/><path d="M12 9v6"/><path d="M5 5l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"/></svg>',
  clock: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></svg>',
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

const PRESETS = [
  { id: 'small',    label: 'Small',        desc: '320p · 10fps' },
  { id: 'balanced', label: 'Balanced',     desc: '480p · 15fps' },
  { id: 'high',     label: 'High Quality', desc: '720p · 24fps' },
];

export function renderGifOutputRow(outputFolder) {
  const displayPath = outputFolder || 'Temp folder (default)';
  return `
    <div class="vt-output-row">
      <span>Output:</span>
      <span class="vt-output-path">${escapeHtml(displayPath)}</span>
      <button class="vt-output-change-btn" id="gfChangeOutputBtn">Change</button>
    </div>`;
}

export function renderGifDropZone() {
  return `
    <div class="gf-drop-zone" id="gfDropZone">
      <div class="gf-drop-icon">${ICONS.gif}</div>
      <div class="gf-drop-title">Create GIF from Video</div>
      <div class="gf-drop-sub">Cut multiple clips &middot; Set speed per clip &middot; Concatenate into one GIF</div>
      <button class="gf-browse-btn" id="gfBrowseBtn">Select Video</button>
    </div>`;
}

export function renderGifFileInfo(inputPath, inputMeta) {
  const name = inputPath.split(/[\\/]/).pop();
  const dur = inputMeta ? formatDuration(inputMeta.duration) : '...';
  const res = inputMeta ? inputMeta.resolution : '...';
  const size = inputMeta ? formatSize(inputMeta.fileSize) : '...';
  return `
    <div class="gf-file-info">
      <span class="gf-file-icon">${ICONS.film}</span>
      <div class="gf-file-details">
        <div class="gf-file-name">${escapeHtml(name)}</div>
        <div class="gf-file-meta"><span>${dur}</span><span class="vt-meta-sep">|</span><span>${res}</span><span class="vt-meta-sep">|</span><span>${size}</span></div>
      </div>
      <button class="gf-file-remove" id="gfRemoveFile" title="Remove file">${ICONS.x}</button>
    </div>`;
}

export function renderGifPlayerSlot() {
  return `<div id="gfPlayerSlot" class="gf-player-slot"></div>`;
}

export function renderGifTimeline(segments, duration, currentTime, selectedId, getColor) {
  if (segments.length === 0) {
    return `<div class="gf-timeline-empty">No clips. Use suggestions or add clips below.</div>`;
  }

  let rulerHtml = '<div class="gf-timeline-ruler">';
  const interval = duration > 120 ? 30 : duration > 60 ? 15 : duration > 30 ? 10 : 5;
  for (let t = 0; t <= duration; t += interval) {
    const pct = (t / duration) * 100;
    rulerHtml += `<span class="gf-ruler-mark" style="left:${pct}%">${t}s</span>`;
  }
  rulerHtml += '</div>';

  const barsHtml = segments.map((seg, i) => {
    const left = (seg.startTime / duration) * 100;
    const w = ((seg.endTime - seg.startTime) / duration) * 100;
    const color = getColor ? getColor(i) : '#4fc3f7';
    const isSelected = seg.id === selectedId;
    const outDur = ((seg.endTime - seg.startTime) / seg.speed).toFixed(1);
    return `
      <div class="gf-seg-bar ${isSelected ? 'gf-seg-bar--selected' : ''}"
           data-seg-id="${seg.id}"
           style="left:${left}%;width:${w}%;background:${color}">
        <span class="gf-seg-bar-label">#${i + 1} ${seg.speed !== 1 ? seg.speed + 'x' : ''}</span>
        <span class="gf-seg-bar-time">${seg.startTime}s&ndash;${seg.endTime}s</span>
        <span class="gf-seg-bar-out">${outDur}s out</span>
      </div>`;
  }).join('');

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return `
    <div class="gf-timeline-section">
      <div class="gf-timeline-label">Timeline (source seconds)</div>
      <div class="gf-timeline" id="gfTimeline">
        ${rulerHtml}
        <div class="gf-timeline-track">
          ${barsHtml}
          <div class="gf-playhead" style="left:${playheadPct}%"></div>
        </div>
      </div>
    </div>`;
}

export function renderGifSegmentActions(segment, index) {
  if (!segment) return '';
  return `
    <div class="gf-seg-actions">
      <span class="gf-seg-actions-label">Clip #${(index || 0) + 1}</span>
      <span class="gf-seg-actions-dur">${segment.startTime}s &rarr; ${segment.endTime}s
        ${segment.speed !== 1 ? ' @ ' + segment.speed + 'x' : ''}</span>
      <button class="gf-act-btn gf-act-split" id="gfSplitBtn">${ICONS.scissors} Split</button>
      <button class="gf-act-btn gf-act-delete" id="gfDeleteBtn">${ICONS.trash} Delete</button>
    </div>`;
}

export function renderGifSuggestions(suggestions) {
  if (!suggestions || suggestions.length === 0) return '';
  return `
    <div class="gf-suggestions-bar">
      <span class="gf-suggestions-label">Quick add:</span>
      ${suggestions.map(s => `
        <button class="gf-suggestion-pill" data-start="${s.startTime}" data-dur="${s.duration}">
          ${ICONS.plus} ${s.startTime}s &ndash; ${(s.startTime + s.duration).toFixed(1)}s
        </button>
      `).join('')}
    </div>`;
}

export function renderGifAddClipButton() {
  return `<button class="gf-add-clip-btn" id="gfAddClipBtn">${ICONS.plus} Add Clip</button>`;
}

export function renderGifPresets(selectedPreset) {
  return `
    <div class="gf-presets-section">
      <div class="gf-section-label">Quality Preset</div>
      <div class="gf-preset-row">
        ${PRESETS.map(p => `
          <div class="gf-preset-card ${p.id === selectedPreset ? 'gf-preset-card--active' : ''}" data-preset="${p.id}">
            <div class="gf-preset-label">${p.label}</div>
            <div class="gf-preset-desc">${p.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

export function renderGifGenerateButton() {
  return `<button class="gf-generate-btn" id="gfGenerateBtn">${ICONS.play} Generate GIF</button>`;
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
