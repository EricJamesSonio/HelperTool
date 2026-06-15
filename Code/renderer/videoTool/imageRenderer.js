const ICONS = {
  image: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/></svg>',
  x: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>',
  download: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v12"/><path d="M5 10l5 5 5-5"/><path d="M3 15v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/></svg>',
};

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '?';
  const kb = bytes / 1024;
  if (kb < 1) return bytes + ' B';
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}

export function renderImageDropZone(inputPath, inputMeta) {
  if (inputPath && inputMeta) {
    const name = inputPath.split(/[\\/]/).pop();
    return `
      <div class="im-file-info">
        <span class="im-file-icon">${ICONS.image}</span>
        <div class="im-file-details">
          <div class="im-file-name">${escapeHtml(name)}</div>
          <div class="im-file-meta"><span>${inputMeta.resolution}</span><span class="vt-meta-sep">|</span><span>${formatSize(inputMeta.fileSize)}</span></div>
        </div>
        <button class="im-file-remove" id="imRemoveFile" title="Remove image">${ICONS.x}</button>
      </div>`;
  }
  return `
    <div class="im-drop-zone" id="imDropZone">
      <div class="im-drop-icon">${ICONS.image}</div>
      <div class="im-drop-title">Convert Image to ICO</div>
      <div class="im-drop-sub">PNG or JPG &middot; Generates 16×16 to 256×256</div>
      <button class="im-browse-btn" id="imBrowseBtn">Select Image</button>
    </div>`;
}

export function renderImageResult(result) {
  if (!result) return '';
  const sizesStr = result.sizesIncluded.map(s => s + '×' + s).join(', ');
  return `
    <div class="im-result">
      <div class="im-result-title">${ICONS.download} ICO Created!</div>
      <div class="im-result-row"><span class="im-result-label">Sizes</span><span class="im-result-value">${sizesStr}</span></div>
      <div class="im-result-row"><span class="im-result-label">Source</span><span class="im-result-value">${result.originalResolution} (${formatSize(result.srcSize)})</span></div>
      <div class="im-result-row"><span class="im-result-label">ICO size</span><span class="im-result-value im-result-highlight">${formatSize(result.fileSize)}</span></div>
      ${result.skippedSizes > 0 ? `<div class="im-result-warn">${result.skippedSizes} size(s) skipped (larger than source)</div>` : ''}
      <div class="im-result-actions">
        <button class="im-result-btn im-result-btn--primary" id="imOpenFileBtn">${ICONS.download} Open File</button>
        <button class="im-result-btn" id="imOpenFolderBtn">Open Folder</button>
        <button class="im-result-btn" id="imConvertAnotherBtn">Convert Another</button>
      </div>
    </div>`;
}

export function renderImageProgress(progress) {
  if (!progress) return '';
  const pct = progress.percent || 0;
  const step = progress.step || '';
  return `
    <div class="im-progress-section">
      <div class="im-progress-label">Converting... ${pct}%</div>
      <div class="im-progress-track"><div class="im-progress-fill" style="width:${pct}%"></div></div>
      ${step ? `<div class="im-progress-step">${escapeHtml(step)}</div>` : ''}
    </div>`;
}

export function renderImageError(error) {
  if (!error) return '';
  return `<div class="im-error"><span>${escapeHtml(error)}</span><button class="im-error-retry" id="imRetryBtn">Retry</button></div>`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}