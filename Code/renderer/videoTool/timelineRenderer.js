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
  { id: 'small',    label: 'Small',        desc: '640p · fast' },
  { id: 'balanced', label: 'Balanced',     desc: '854p · normal' },
  { id: 'high',     label: 'High Quality', desc: '1280p · slow' },
];

export function renderDropZone() {
  return `
    <div class="tl-drop-zone" id="vtDropZone">
      <div class="tl-drop-icon">${ICONS.film}</div>
      <div class="tl-drop-title">Timeline Video Editor</div>
      <div class="tl-drop-sub">Split, trim, adjust speed &middot; Export MP4 or GIF</div>
      <button class="tl-browse-btn" id="vtBrowseBtn">Select Video</button>
    </div>`;
}

export function renderFileInfo(inputPath, inputMeta) {
  const name = inputPath.split(/[\\/]/).pop();
  const dur = inputMeta ? formatDuration(inputMeta.duration) : '...';
  const res = inputMeta ? inputMeta.resolution : '...';
  const size = inputMeta ? formatSize(inputMeta.fileSize) : '...';
  return `
    <div class="tl-file-info">
      <span class="tl-file-icon">${ICONS.film}</span>
      <div class="tl-file-details">
        <div class="tl-file-name">${escapeHtml(name)}</div>
        <div class="tl-file-meta"><span>${dur}</span><span class="vt-meta-sep">|</span><span>${res}</span><span class="vt-meta-sep">|</span><span>${size}</span></div>
      </div>
      <button class="tl-file-remove" id="vtRemoveFile" title="Remove file">${ICONS.x}</button>
    </div>`;
}

export function renderOutputRow(outputFolder) {
  const displayPath = outputFolder || 'Temp folder (default)';
  return `
    <div class="vt-output-row">
      <span>Output:</span>
      <span class="vt-output-path">${escapeHtml(displayPath)}</span>
      <button class="vt-output-change-btn" id="tlChangeOutputBtn">Change</button>
    </div>`;
}

export function renderPlayerSlot() {
  return `<div id="tlPlayerSlot" class="tl-player-slot"></div>`;
}

export function renderTimeline(segments, duration, currentTime, selectedId, getColor) {
  if (segments.length === 0) {
    return `<div class="tl-timeline-empty">No clips. Use suggestions or add clips below.</div>`;
  }

  let rulerHtml = '<div class="tl-timeline-ruler">';
  const interval = duration > 120 ? 30 : duration > 60 ? 15 : duration > 30 ? 10 : 5;
  for (let t = 0; t <= duration; t += interval) {
    const pct = (t / duration) * 100;
    rulerHtml += `<span class="tl-ruler-mark" style="left:${pct}%">${t}s</span>`;
  }
  rulerHtml += '</div>';

  const barsHtml = segments.map((seg, i) => {
    if (!seg.enabled) return '';
    const left = (seg.startTime / duration) * 100;
    const w = ((seg.endTime - seg.startTime) / duration) * 100;
    const color = getColor ? getColor(i) : '#4fc3f7';
    const isSelected = seg.id === selectedId;
    const outDur = ((seg.endTime - seg.startTime) / seg.speed).toFixed(1);
    return `
      <div class="tl-seg-bar ${isSelected ? 'tl-seg-bar--selected' : ''}"
           data-seg-id="${seg.id}"
           style="left:${left}%;width:${w}%;background:${color}">
        <span class="tl-seg-bar-label">#${i + 1} ${seg.speed !== 1 ? seg.speed + 'x' : ''}</span>
        <span class="tl-seg-bar-time">${seg.startTime}s&ndash;${seg.endTime}s</span>
        <span class="tl-seg-bar-out">${outDur}s out</span>
      </div>`;
  }).join('');

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return `
    <div class="tl-timeline-section">
      <div class="tl-timeline-label">Timeline</div>
      <div class="tl-timeline" id="tlTimeline">
        ${rulerHtml}
        <div class="tl-timeline-track">
          ${barsHtml}
          <div class="tl-playhead" style="left:${playheadPct}%"></div>
        </div>
      </div>
    </div>`;
}

export function renderSegmentActions(segment, index) {
  if (!segment) return '';
  return `
    <div class="tl-seg-actions">
      <span class="tl-seg-actions-label">Clip #${(index || 0) + 1}</span>
      <span class="tl-seg-actions-dur">${segment.startTime}s &rarr; ${segment.endTime}s
        ${segment.speed !== 1 ? ' @ ' + segment.speed + 'x' : ''}</span>
      <select class="tl-speed-select">
        <option value="0.5" ${segment.speed === 0.5 ? 'selected' : ''}>0.5x</option>
        <option value="1" ${segment.speed === 1 ? 'selected' : ''}>1x</option>
        <option value="2" ${segment.speed === 2 ? 'selected' : ''}>2x</option>
        <option value="3" ${segment.speed === 3 ? 'selected' : ''}>3x</option>
      </select>
      <button class="tl-act-btn tl-act-split" id="tlSplitBtn">${ICONS.scissors} Split</button>
      <button class="tl-act-btn tl-act-delete" id="tlDeleteBtn">${ICONS.trash} Cut</button>
    </div>`;
}

export function renderSuggestions(suggestions) {
  if (!suggestions || suggestions.length === 0) return '';
  return `
    <div class="tl-suggestions-bar">
      <span class="tl-suggestions-label">Quick add:</span>
      ${suggestions.map(s => `
        <button class="tl-suggestion-pill" data-start="${s.startTime}" data-dur="${s.duration}">
          ${ICONS.plus} ${s.startTime}s &ndash; ${(s.startTime + s.duration).toFixed(1)}s
        </button>
      `).join('')}
    </div>`;
}

export function renderAddClipButton() {
  return `<button class="tl-add-clip-btn" id="tlAddClipBtn">${ICONS.plus} Add Clip</button>`;
}

export function renderPresets(selectedPreset) {
  return `
    <div class="tl-presets-section">
      <div class="tl-section-label">Export Preset</div>
      <div class="tl-preset-row">
        ${PRESETS.map(p => `
          <div class="tl-preset-card ${p.id === selectedPreset ? 'tl-preset-card--active' : ''}" data-preset="${p.id}">
            <div class="tl-preset-label">${p.label}</div>
            <div class="tl-preset-desc">${p.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

export function renderExportButtons(exportMode) {
  return `
    <div class="tl-export-row">
      <button class="tl-export-btn tl-export-mp4 ${exportMode === 'mp4' ? 'tl-export-btn--active' : ''}" id="tlExportMp4Btn">
        ${ICONS.download} Render MP4
      </button>
      <button class="tl-export-btn tl-export-gif ${exportMode === 'gif' ? 'tl-export-btn--active' : ''}" id="tlExportGifBtn">
        ${ICONS.gif} Export GIF
      </button>
    </div>`;
}

export function renderProgress(progress) {
  if (!progress) return '';
  const pct = progress.percent || 0;
  const step = progress.step || '';
  return `
    <div class="tl-progress-section">
      <div class="tl-progress-label">Processing... ${pct}%</div>
      <div class="tl-progress-track"><div class="tl-progress-fill" style="width:${pct}%"></div></div>
      ${step ? `<div class="tl-progress-step">${escapeHtml(step)}</div>` : ''}
    </div>`;
}

export function renderResult(result) {
  if (!result) return '';
  return `
    <div class="tl-result">
      <div class="tl-result-title">${ICONS.download} Export Complete!</div>
      <div class="tl-result-row"><span class="tl-result-label">Duration</span><span class="tl-result-value">${result.duration}s</span></div>
      <div class="tl-result-row"><span class="tl-result-label">Size</span><span class="tl-result-value tl-result-highlight">${formatSize(result.fileSize)}</span></div>
      <div class="tl-result-actions">
        <button class="tl-result-btn tl-result-btn--primary" id="tlOpenFileBtn">${ICONS.download} Open File</button>
        <button class="tl-result-btn" id="tlOpenFolderBtn">Open Folder</button>
        <button class="tl-result-btn" id="tlNewBtn">New</button>
      </div>
    </div>`;
}

export function renderError(error) {
  if (!error) return '';
  return `
    <div class="tl-error">
      <span>${escapeHtml(error)}</span>
      <button class="tl-error-retry" id="tlRetryBtn">Retry</button>
    </div>`;
}
