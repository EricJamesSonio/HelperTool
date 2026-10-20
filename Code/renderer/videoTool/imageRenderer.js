import { CONVERT_FORMATS, QUALITY_PRESETS } from './imageState.js';

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

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function renderConvertOutputRow(outputFolder) {
  const displayPath = outputFolder || 'Temp folder (default)';
  return `
    <div class="vt-output-row">
      <span>Output:</span>
      <span class="vt-output-path">${escapeHtml(displayPath)}</span>
      <button class="vt-output-change-btn" id="imChangeOutputBtn">Change</button>
    </div>`;
}

export function renderConvertDropZone(files, metas) {
  if (files.length === 1) {
    const name = files[0].split(/[\\/]/).pop();
    const meta = metas[0] || {};
    return `
      <div class="im-file-info">
        <span class="im-file-icon">${ICONS.image}</span>
        <div class="im-file-details">
          <div class="im-file-name">${escapeHtml(name)}</div>
          <div class="im-file-meta"><span>${meta.resolution || '?'}</span><span class="vt-meta-sep">|</span><span>${formatSize(meta.fileSize)}</span></div>
        </div>
        <button class="ic-browse-btn" id="imAddMoreBtn">Add More</button>
        <button class="im-file-remove" data-idx="0" title="Remove image">${ICONS.x}</button>
      </div>`;
  }

  if (files.length > 1) {
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
          <button class="ic-browse-btn" id="imAddMoreBtn">Add More</button>
        </div>
        ${items}
      </div>`;
  }

  return `
    <div class="im-drop-zone" id="imDropZone">
      <div class="im-drop-icon">${ICONS.image}</div>
      <div class="im-drop-title">Convert Image</div>
      <div class="im-drop-sub">PNG, JPG, WebP, GIF, TIFF, AVIF or SVG &middot; Convert to PNG, JPG, WebP, ICO or SVG</div>
      <button class="im-browse-btn" id="imBrowseBtn">Select Image(s)</button>
    </div>`;
}

export function renderConvertControls(format, preset) {
  const formatOptions = CONVERT_FORMATS.map(f =>
    `<option value="${f.id}" ${format === f.id ? 'selected' : ''}>${f.label}</option>`
  ).join('');

  const active = CONVERT_FORMATS.find(f => f.id === format);
  const showPresets = active ? active.supportsQuality : true;

  const presetCards = showPresets
    ? QUALITY_PRESETS.map(p => `
        <div class="vt-preset-card ${preset === p.id ? 'vt-preset-card--active' : ''}" data-preset="${p.id}">
          <div class="vt-preset-card-icon">${ICONS[p.icon] || ICONS.image}</div>
          <div class="vt-preset-card-body">
            <div class="vt-preset-label">${p.label}</div>
            <div class="vt-preset-desc">${p.desc}</div>
          </div>
        </div>`).join('')
    : '';

  const presetHint = showPresets ? '' : `
    <div class="im-format-hint">${format === 'ico'
      ? 'ICO generates 16&times;16 to 256&times;256 from your source image.'
      : 'SVG wraps your image as an embedded picture that scales cleanly.'}</div>`;

  return `
    <div class="vt-layout">
      <div class="vt-sidebar">
        ${showPresets ? `
          <div class="vt-section-label">Quality Preset</div>
          <div class="vt-presets" id="imPresets">${presetCards}</div>` : presetHint}
      </div>
      <div class="vt-main">
        <div class="vt-section">
          <div class="vt-output-row">
            <span>Convert to:</span>
            <select class="ic-format-select" id="imFormatSelect">${formatOptions}</select>
          </div>
        </div>
      </div>
    </div>`;
}

export function renderConvertButton(formatLabel, fileCount) {
  const label = fileCount > 1 ? `Convert All (${fileCount} files) to ${formatLabel}` : `Convert to ${formatLabel}`;
  return `<button class="vt-compress-btn" id="imConvertBtn">${ICONS.download} ${label}</button>`;
}

export function renderConvertProgress(progress) {
  if (!progress) return '';
  const pct = progress.percent || 0;
  const step = progress.step || '';
  const fileInfo = progress.fileName
    ? `<div class="vt-progress-size">${escapeHtml(progress.fileName)} (${progress.currentFile}/${progress.totalFiles})</div>`
    : '';
  return `
    <div class="im-progress-section">
      <div class="im-progress-label">Converting... ${pct}%</div>
      <div class="im-progress-track"><div class="im-progress-fill" style="width:${pct}%"></div></div>
      ${step ? `<div class="im-progress-step">${escapeHtml(step)}</div>` : ''}
      ${fileInfo}
    </div>`;
}

function renderIcoRows(ico) {
  if (!ico) return '';
  const sizesStr = (ico.sizesIncluded || []).map(s => s + '×' + s).join(', ');
  return `
    <div class="vt-result-row"><span class="vt-result-label">Sizes</span><span class="vt-result-value">${sizesStr}</span></div>
    ${ico.skippedSizes > 0 ? `<div class="vt-result-warn">${ico.skippedSizes} size(s) skipped (larger than source)</div>` : ''}`;
}

export function renderConvertResult(result, formatLabel, warning) {
  if (!result) return '';

  if (result.batch) {
    const totalSaved = result.totalOriginalSize - result.totalOutputSize;
    const rows = result.results.filter(r => !r.error).map(r => {
      const name = r.inputPath.split(/[\\/]/).pop();
      const pct = r.reductionPercent || 0;
      const sign = pct > 0 ? '-' : (pct < 0 ? '+' : '');
      return `
        <div class="ic-result-file">
          <span class="ic-result-fname">${escapeHtml(name)}</span>
          <span class="ic-result-fsize">${formatSize(r.originalSize)} → ${formatSize(r.outputSize)}</span>
          <span class="ic-result-fsave ${pct > 0 ? 'ic-result-fsave--pos' : ''}">${sign}${Math.abs(pct)}%</span>
        </div>`;
    }).join('');
    const errCount = result.errors ? result.errors.length : 0;
    return `
      <div class="vt-result">
        <div class="vt-result-title">${ICONS.download} Converted to ${escapeHtml(formatLabel)}!</div>
        <div class="vt-result-row"><span class="vt-result-label">Files processed</span><span class="vt-result-value">${result.results.length - errCount} / ${result.results.length}</span></div>
        <div class="vt-result-row"><span class="vt-result-label">Total original</span><span class="vt-result-value">${formatSize(result.totalOriginalSize)}</span></div>
        <div class="vt-result-row"><span class="vt-result-label">Total output</span><span class="vt-result-value vt-result-highlight">${formatSize(result.totalOutputSize)}</span></div>
        <div class="vt-result-row"><span class="vt-result-label">Total saved</span><span class="vt-result-value vt-result-highlight">${totalSaved >= 0 ? '-' : '+'}${formatSize(Math.abs(totalSaved))} (${Math.abs(result.totalReductionPercent)}%)</span></div>
        <div class="ic-result-files">${rows}</div>
        ${errCount > 0 ? `<div class="vt-result-warn">${errCount} file(s) failed</div>` : ''}
        ${warning ? `<div class="vt-result-warn">${escapeHtml(warning)}</div>` : ''}
        <div class="vt-result-actions">
          <button class="vt-result-btn vt-result-btn--primary" id="imOpenFolderBtn">${ICONS.download} Open Folder</button>
          <button class="vt-result-btn" id="imConvertAnotherBtn">Convert More</button>
        </div>
      </div>`;
  }

  const saved = result.originalSize - result.outputSize;
  return `
    <div class="vt-result">
      <div class="vt-result-title">${ICONS.download} Converted to ${escapeHtml(formatLabel)}!</div>
      <div class="vt-result-row"><span class="vt-result-label">Original</span><span class="vt-result-value">${formatSize(result.originalSize)}</span></div>
      <div class="vt-result-row"><span class="vt-result-label">Output</span><span class="vt-result-value vt-result-highlight">${formatSize(result.outputSize)}</span></div>
      <div class="vt-result-row"><span class="vt-result-label">Size change</span><span class="vt-result-value">${saved >= 0 ? '-' : '+'}${formatSize(Math.abs(saved))} (${Math.abs(result.reductionPercent)}%)</span></div>
      <div class="vt-result-row"><span class="vt-result-label">Resolution</span><span class="vt-result-value">${result.originalResolution}</span></div>
      ${renderIcoRows(result.ico)}
      ${warning ? `<div class="vt-result-warn">${escapeHtml(warning)}</div>` : ''}
      <div class="vt-result-actions">
        <button class="vt-result-btn vt-result-btn--primary" id="imOpenFileBtn">${ICONS.download} Open File</button>
        <button class="vt-result-btn" id="imOpenFolderBtn">Open Folder</button>
        <button class="vt-result-btn" id="imConvertAnotherBtn">Convert Another</button>
      </div>
    </div>`;
}

export function renderConvertError(error) {
  if (!error) return '';
  return `
    <div class="vt-error">
      <span>${escapeHtml(error)}</span>
      <button class="vt-error-retry" id="imRetryBtn">Retry</button>
    </div>`;
}
