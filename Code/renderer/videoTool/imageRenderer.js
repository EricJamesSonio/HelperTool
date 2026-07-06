const ICONS = {
  image: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/></svg>',
  x: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>',
  download: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v12"/><path d="M5 10l5 5 5-5"/><path d="M3 15v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/></svg>',
  max: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14l7-7 7 7"/></svg>',
  high: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15l5-8 4 4 5-7"/></svg>',
  bal: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16l4-6 5 5 5-9"/></svg>',
  min: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l4-4 5 5 5-12"/></svg>',
};

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '?';
  const kb = bytes / 1024;
  if (kb < 1) return bytes + ' B';
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}

export function renderImageOutputRow(outputFolder) {
  const displayPath = outputFolder || 'Temp folder (default)';
  return `
    <div class="vt-output-row">
      <span>Output:</span>
      <span class="vt-output-path">${escapeHtml(displayPath)}</span>
      <button class="vt-output-change-btn" id="imChangeOutputBtn">Change</button>
    </div>`;
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

export function renderCompressDropZone(mode, files, metas) {
  if (mode === 'batch' && files.length > 0) {
    const items = files.map((f, i) => {
      const name = f.split(/[\\/]/).pop();
      const meta = metas[i] || {};
      return `
        <div class="ic-file-row" data-idx="${i}">
          <span class="ic-file-icon">${ICONS.image}</span>
          <div class="ic-file-details">
            <div class="ic-file-name">${escapeHtml(name)}</div>
            <div class="ic-file-meta"><span>${meta.resolution || '?'}</span><span class="vt-meta-sep">|</span><span>${formatSize(meta.fileSize)}</span></div>
          </div>
          <button class="ic-file-remove" data-idx="${i}" title="Remove">${ICONS.x}</button>
        </div>`;
    }).join('');
    return `
      <div class="ic-file-list">
        <div class="ic-file-list-header">
          <span>${files.length} image(s) selected</span>
          <button class="ic-browse-btn" id="icAddMoreBtn">Add More</button>
        </div>
        ${items}
      </div>`;
  }
  if (mode === 'single' && files.length === 1) {
    const name = files[0].split(/[\\/]/).pop();
    const meta = metas[0] || {};
    return `
      <div class="im-file-info">
        <span class="im-file-icon">${ICONS.image}</span>
        <div class="im-file-details">
          <div class="im-file-name">${escapeHtml(name)}</div>
          <div class="im-file-meta"><span>${meta.resolution || '?'}</span><span class="vt-meta-sep">|</span><span>${formatSize(meta.fileSize)}</span></div>
        </div>
        <button class="im-file-remove" id="icRemoveFile" title="Remove">${ICONS.x}</button>
      </div>`;
  }
  return `
    <div class="im-drop-zone" id="icDropZone">
      <div class="im-drop-icon">${ICONS.image}</div>
      <div class="im-drop-title">Compress Images</div>
      <div class="im-drop-sub">PNG, JPG or WebP &middot; Single or batch mode</div>
      <button class="im-browse-btn" id="icBrowseBtn">Select Image(s)</button>
    </div>`;
}

export function renderCompressControls(preset, format) {
  const presets = [
    { id: 'lossless', label: 'Lossless', desc: 'Maximum quality, larger file', icon: 'max' },
    { id: 'high',     label: 'High',     desc: '90% quality, great balance',  icon: 'high' },
    { id: 'balanced', label: 'Balanced', desc: '75% quality, recommended',    icon: 'bal' },
    { id: 'small',    label: 'Small',    desc: '50% quality, smallest file',  icon: 'min' },
  ];
  const formatOptions = [
    { id: 'auto', label: 'Auto (keep original)' },
    { id: 'jpeg', label: 'JPEG' },
    { id: 'png',  label: 'PNG' },
    { id: 'webp', label: 'WebP' },
  ];
  const presetCards = presets.map(p => `
    <div class="vt-preset-card ${preset === p.id ? 'vt-preset-card--active' : ''}" data-preset="${p.id}">
      <div class="vt-preset-card-icon">${ICONS[p.icon] || ICONS.image}</div>
      <div class="vt-preset-card-body">
        <div class="vt-preset-label">${p.label}</div>
        <div class="vt-preset-desc">${p.desc}</div>
      </div>
    </div>`).join('');
  const formatSelect = formatOptions.map(o =>
    `<option value="${o.id}" ${format === o.id ? 'selected' : ''}>${o.label}</option>`
  ).join('');
  return `
    <div class="vt-layout">
      <div class="vt-sidebar">
        <div class="vt-section-label">Quality Preset</div>
        <div class="vt-presets">${presetCards}</div>
      </div>
      <div class="vt-main">
        <div class="vt-section">
          <div class="vt-output-row">
            <span>Format:</span>
            <select class="ic-format-select" id="icFormatSelect">${formatSelect}</select>
          </div>
        </div>
      </div>
    </div>`;
}

export function renderCompressOutputRow(outputFolder) {
  const displayPath = outputFolder || 'Temp folder (default)';
  return `
    <div class="vt-output-row">
      <span>Output:</span>
      <span class="vt-output-path">${escapeHtml(displayPath)}</span>
      <button class="vt-output-change-btn" id="icChangeOutputBtn">Change</button>
    </div>`;
}

export function renderCompressButton(mode, fileCount) {
  const label = mode === 'batch' ? `Compress All (${fileCount} files)` : 'Compress Image';
  return `<button class="vt-compress-btn" id="icCompressBtn">${ICONS.download} ${label}</button>`;
}

export function renderCompressProgress(progress) {
  if (!progress) return '';
  const pct = progress.percent || 0;
  const fileInfo = progress.fileName
    ? `<div class="vt-progress-size">${escapeHtml(progress.fileName)} (${progress.currentFile}/${progress.totalFiles})</div>`
    : '';
  return `
    <div class="vt-progress-section">
      <div class="vt-progress-label">Compressing... ${pct}%</div>
      <div class="vt-progress-track"><div class="vt-progress-fill" style="width:${pct}%"></div></div>
      ${fileInfo}
    </div>`;
}

export function renderCompressResult(result) {
  if (!result) return '';
  if (result.batch) {
    const totalSaved = result.totalOriginalSize - result.totalCompressedSize;
    const rows = result.results.filter(r => !r.error).map(r => {
      const name = r.inputPath.split(/[\\/]/).pop();
      const saved = r.originalSize - r.compressedSize;
      return `
        <div class="ic-result-file">
          <span class="ic-result-fname">${escapeHtml(name)}</span>
          <span class="ic-result-fsize">${formatSize(r.originalSize)} → ${formatSize(r.compressedSize)}</span>
          <span class="ic-result-fsave ${r.reductionPercent > 0 ? 'ic-result-fsave--pos' : ''}">-${r.reductionPercent}%</span>
        </div>`;
    }).join('');
    const errCount = result.errors ? result.errors.length : 0;
    return `
      <div class="vt-result">
        <div class="vt-result-title">${ICONS.download} Batch Complete!</div>
        <div class="vt-result-row"><span class="vt-result-label">Files processed</span><span class="vt-result-value">${result.results.length - errCount} / ${result.results.length}</span></div>
        <div class="vt-result-row"><span class="vt-result-label">Total original</span><span class="vt-result-value">${formatSize(result.totalOriginalSize)}</span></div>
        <div class="vt-result-row"><span class="vt-result-label">Total compressed</span><span class="vt-result-value vt-result-highlight">${formatSize(result.totalCompressedSize)}</span></div>
        <div class="vt-result-row"><span class="vt-result-label">Total saved</span><span class="vt-result-value vt-result-highlight">${formatSize(totalSaved)} (${result.totalReductionPercent}%)</span></div>
        <div class="ic-result-files">${rows}</div>
        ${errCount > 0 ? `<div class="im-result-warn">${errCount} file(s) failed</div>` : ''}
        <div class="vt-result-actions">
          <button class="vt-result-btn vt-result-btn--primary" id="icOpenFolderBtn">${ICONS.download} Open Folder</button>
          <button class="vt-result-btn" id="icCompressAnotherBtn">Compress More</button>
        </div>
      </div>`;
  }
  const saved = result.originalSize - result.compressedSize;
  return `
    <div class="vt-result">
      <div class="vt-result-title">${ICONS.download} Compressed!</div>
      <div class="vt-result-row"><span class="vt-result-label">Original</span><span class="vt-result-value">${formatSize(result.originalSize)}</span></div>
      <div class="vt-result-row"><span class="vt-result-label">Compressed</span><span class="vt-result-value vt-result-highlight">${formatSize(result.compressedSize)}</span></div>
      <div class="vt-result-row"><span class="vt-result-label">Saved</span><span class="vt-result-value vt-result-highlight">${formatSize(saved)} (${result.reductionPercent}%)</span></div>
      <div class="vt-result-row"><span class="vt-result-label">Resolution</span><span class="vt-result-value">${result.originalResolution}</span></div>
      <div class="vt-result-actions">
        <button class="vt-result-btn vt-result-btn--primary" id="icOpenFileBtn">${ICONS.download} Open File</button>
        <button class="vt-result-btn" id="icOpenFolderBtn">Open Folder</button>
        <button class="vt-result-btn" id="icCompressAnotherBtn">Compress Another</button>
      </div>
    </div>`;
}

export function renderCompressError(error) {
  if (!error) return '';
  return `
    <div class="vt-error">
      <span>${escapeHtml(error)}</span>
      <button class="vt-error-retry" id="icRetryBtn">Retry</button>
    </div>`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}