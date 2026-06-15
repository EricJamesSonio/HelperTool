import { PRESETS } from './videoPresets.js';

const ICONS = {
  film: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M9 3v14"/><path d="M15 3v14"/><path d="M2 9h6"/><path d="M12 9h6"/><path d="M2 12h6"/><path d="M12 12h6"/><path d="M2 6h6"/><path d="M12 6h6"/></svg>',
  play: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,3 17,10 5,17"/></svg>',
  check: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/></svg>',
  x: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>',
  folder: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H9L7 4H4a2 2 0 0 0-2 2v1z"/></svg>',
};

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '? MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return (bytes / 1024).toFixed(1) + ' KB';
  return mb.toFixed(1) + ' MB';
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function formatTime(ms) {
  const totalSec = Math.floor(ms);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function renderFileDropZone(inputPath, inputMeta) {
  if (inputPath && inputMeta) {
    const name = inputPath.split(/[\\/]/).pop();
    return `
      <div class="vt-file-info">
        <span class="vt-file-icon">${ICONS.film}</span>
        <div class="vt-file-details">
          <div class="vt-file-name">${escapeHtml(name)}</div>
          <div class="vt-file-meta"><span>${formatSize(inputMeta.originalSize)}</span><span class="vt-meta-sep">|</span><span>${inputMeta.originalResolution}</span><span class="vt-meta-sep">|</span><span>${formatDuration(inputMeta.duration)}</span></div>
        </div>
        <button class="vt-file-remove" id="vtRemoveFile" title="Remove file">${ICONS.x}</button>
      </div>`;
  }
  return `
    <div class="vt-drop-zone" id="vtDropZone">
      <div class="vt-drop-icon">${ICONS.film}</div>
      <div class="vt-drop-title">Drop a video file here</div>
      <div class="vt-drop-sub">Supports: MP4, MOV, AVI, MKV, WEBM, WMV, M4V</div>
      <button class="vt-browse-btn" id="vtBrowseBtn">Browse Files</button>
    </div>`;
}

export function renderPresetCards(selectedPreset, inputMeta) {
  return Object.values(PRESETS).map(p => {
    const isActive = p.id === selectedPreset;
    let estSize = null;
    if (inputMeta && inputMeta.originalSize) {
      estSize = inputMeta.originalSize * (1 - p.reductionMidpoint);
    }
    return `
      <div class="vt-preset-card ${isActive ? 'vt-preset-card--active' : ''}" data-preset="${p.id}">
        <div class="vt-preset-card-icon">${p.icon}</div>
        <div class="vt-preset-card-body">
          <div class="vt-preset-label">${p.label}</div>
          <div class="vt-preset-desc">${p.description}</div>
          <div class="vt-preset-reduction">~${p.estimatedReduction} smaller</div>
          ${estSize ? `<div class="vt-preset-est-size">est. ${formatSize(estSize)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

export function renderOutputRow(outputFolder) {
  const displayPath = outputFolder || 'Temp folder (default)';
  return `
    <div class="vt-output-row">
      <span>Output:</span>
      <span class="vt-output-path">${escapeHtml(displayPath)}</span>
      <button class="vt-output-change-btn" id="vtChangeOutputBtn">Change</button>
    </div>`;
}

export function renderCompressButton(status) {
  const disabled = status !== 'idle' ? 'disabled' : '';
  return `<button class="vt-compress-btn" id="vtCompressBtn" ${disabled}>${ICONS.play} Compress Video</button>`;
}

export function renderProgress(progress) {
  if (!progress) return '';
  const pct = progress.percent || 0;
  let sizeInfo = '';
  if (progress.originalSize && progress.estimatedOutputSize) {
    sizeInfo = `${formatSize(progress.originalSize)} → ~${formatSize(progress.estimatedOutputSize)}`;
  } else if (progress.originalSize) {
    sizeInfo = formatSize(progress.originalSize);
  }
  const elapsed = progress.currentTime ? formatTime(progress.currentTime) : '';
  return `
    <div class="vt-progress-section">
      <div class="vt-progress-label">Compressing... ${pct}%</div>
      <div class="vt-progress-track">
        <div class="vt-progress-fill" style="width:${pct}%"></div>
      </div>
      ${sizeInfo ? `<div class="vt-progress-size">${sizeInfo}</div>` : ''}
      ${elapsed ? `<div class="vt-progress-time">Elapsed: ${elapsed}</div>` : ''}
    </div>`;
}

export function renderResult(result) {
  if (!result) return '';
  return `
    <div class="vt-result">
      <div class="vt-result-title">${ICONS.check} Compression Complete!</div>
      <div class="vt-result-row">
        <span class="vt-result-label">Original</span>
        <span class="vt-result-value">${formatSize(result.originalSize)}</span>
      </div>
      <div class="vt-result-row">
        <span class="vt-result-label">Compressed</span>
        <span class="vt-result-value">${formatSize(result.compressedSize)}</span>
      </div>
      <div class="vt-result-row">
        <span class="vt-result-label">Reduction</span>
        <span class="vt-result-value vt-result-highlight">${result.reductionPercent}% smaller</span>
      </div>
      <div class="vt-result-row">
        <span class="vt-result-label">Resolution</span>
        <span class="vt-result-value">${result.originalResolution} → ${result.outputResolution}</span>
      </div>
      <div class="vt-result-row">
        <span class="vt-result-label">Duration</span>
        <span class="vt-result-value">${formatDuration(result.duration)}</span>
      </div>
      <div class="vt-result-row">
        <span class="vt-result-label">Processing time</span>
        <span class="vt-result-value">${formatTime(result.processingTime / 1000)}</span>
      </div>
      <div class="vt-result-actions">
        <button class="vt-result-btn vt-result-btn--primary" id="vtOpenFileBtn">Open File</button>
        <button class="vt-result-btn" id="vtOpenFolderBtn">Open Folder</button>
        <button class="vt-result-btn" id="vtCompressAnotherBtn">Compress Another</button>
      </div>
    </div>`;
}

export function renderError(error) {
  if (!error) return '';
  return `
    <div class="vt-error">
      <span>${escapeHtml(error)}</span>
      <button class="vt-error-retry" id="vtRetryBtn">Retry</button>
    </div>`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}