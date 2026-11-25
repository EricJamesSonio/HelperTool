import { OCR_LANGS } from './ocrState.js';

const ICONS = {
  image: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/></svg>',
  text: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14"/><path d="M3 9h10"/><path d="M3 13h14"/><path d="M3 17h8"/></svg>',
  x: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>',
  check: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/></svg>',
};

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '?';
  const kb = bytes / 1024;
  if (kb < 1) return bytes + ' B';
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}

function baseName(p) {
  return String(p || '').split(/[\\/]/).pop();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function renderOcrOutputRow(outputFolder) {
  const displayPath = outputFolder || 'Temp folder (default)';
  return `
    <div class="vt-output-row">
      <span>Save .txt to:</span>
      <span class="vt-output-path">${escapeHtml(displayPath)}</span>
      <button class="vt-output-change-btn" id="ocChangeOutputBtn">Change</button>
    </div>`;
}

export function renderOcrDropZone(files, metas) {
  if (files.length === 1) {
    const meta = metas[0] || {};
    return `
      <div class="im-file-info">
        <span class="im-file-icon">${ICONS.image}</span>
        <div class="im-file-details">
          <div class="im-file-name">${escapeHtml(baseName(files[0]))}</div>
          <div class="im-file-meta"><span>${meta.resolution || '?'}</span><span class="vt-meta-sep">|</span><span>${formatSize(meta.fileSize)}</span></div>
        </div>
        <button class="ic-browse-btn" id="ocAddMoreBtn">Add More</button>
        <button class="oc-file-remove" data-idx="0" title="Remove image">${ICONS.x}</button>
      </div>`;
  }

  if (files.length > 1) {
    const items = files.map((f, i) => {
      const meta = metas[i] || {};
      return `
        <div class="ic-file-row" data-idx="${i}">
          <span class="ic-file-icon">${ICONS.image}</span>
          <div class="ic-file-details">
            <div class="ic-file-name">${escapeHtml(baseName(f))}</div>
            <div class="ic-file-meta"><span>${meta.resolution || '?'}</span><span class="vt-meta-sep">|</span><span>${formatSize(meta.fileSize)}</span></div>
          </div>
          <button class="oc-file-remove" data-idx="${i}" title="Remove">${ICONS.x}</button>
        </div>`;
    }).join('');
    return `
      <div class="ic-file-list">
        <div class="ic-file-list-header">
          <span>${files.length} image(s) selected</span>
          <button class="ic-browse-btn" id="ocAddMoreBtn">Add More</button>
        </div>
        ${items}
      </div>`;
  }

  return `
    <div class="im-drop-zone" id="ocDropZone">
      <div class="im-drop-icon">${ICONS.text}</div>
      <div class="im-drop-title">Image to Text</div>
      <div class="im-drop-sub">PNG, JPG, WebP, GIF, TIFF, AVIF or SVG &middot; single image or a whole batch &middot; extracted as .txt</div>
      <button class="im-browse-btn" id="ocBrowseBtn">Select Image(s)</button>
    </div>`;
}

export function renderOcrControls(lang) {
  const options = OCR_LANGS.map((l) =>
    `<option value="${l.id}" ${lang === l.id ? 'selected' : ''}>${l.label}</option>`
  ).join('');
  return `
    <div class="oc-section">
      <div class="vt-output-row">
        <span>Text language:</span>
        <select class="ic-format-select" id="ocLangSelect">${options}</select>
      </div>
      <div class="im-format-hint">The first run of a language downloads its data once (internet needed), then it is cached. Images are read on your machine.</div>
    </div>`;
}

export function renderOcrButton(fileCount) {
  const label = fileCount > 1 ? `Extract Text from All (${fileCount} images)` : 'Extract Text';
  return `<button class="vt-compress-btn" id="ocExtractBtn">${ICONS.text} ${label}</button>`;
}

export function renderOcrProgress(progress) {
  if (!progress) {
    return `
      <div class="im-progress-section">
        <div class="im-progress-label">Starting...</div>
        <div class="im-progress-track"><div class="im-progress-fill" style="width:0%"></div></div>
      </div>`;
  }
  const pct = progress.percent || 0;
  const step = progress.step || '';
  const fileInfo = progress.fileName
    ? `<div class="im-progress-step">${escapeHtml(progress.fileName)} (${progress.currentFile}/${progress.totalFiles})</div>`
    : '';
  return `
    <div class="im-progress-section">
      <div class="im-progress-label">Extracting text... ${pct}%</div>
      <div class="im-progress-track"><div class="im-progress-fill" style="width:${pct}%"></div></div>
      ${step ? `<div class="im-progress-step">${escapeHtml(step)}</div>` : ''}
      ${fileInfo}
    </div>`;
}

export function renderOcrResult(result, activeIndex, copied) {
  if (!result || !result.results || result.results.length === 0) return '';
  const items = result.results;
  const failed = items.filter((r) => r.error).length;
  const okCount = items.length - failed;
  const active = items[activeIndex] || items[0];

  const list = items.length > 1
    ? `<div class="oc-result-list">${items.map((r, i) => {
        const meta = r.error
          ? 'Failed'
          : (r.empty ? 'No text found' : `${r.wordCount} words, ${r.confidence}% confidence`);
        return `
          <div class="oc-result-item ${i === activeIndex ? 'oc-result-item--active' : ''}" data-idx="${i}">
            <span class="oc-result-iname">${escapeHtml(baseName(r.inputPath))}</span>
            <span class="oc-result-imeta">${meta}</span>
          </div>`;
      }).join('')}</div>`
    : '';

  let textBlock = '';
  if (active.error) {
    textBlock = `<div class="vt-result-warn">${escapeHtml(active.error)}</div>`;
  } else {
    textBlock = `<textarea class="oc-text-area" readonly spellcheck="false">${escapeHtml(active.text)}</textarea>`;
    if (active.empty) {
      textBlock += '<div class="vt-result-warn">No text was detected in this image.</div>';
    } else if (active.confidence < 60) {
      textBlock += '<div class="vt-result-warn">Low confidence. Check the language setting or use a sharper image.</div>';
    }
  }

  const copyLabel = copied === 'one' ? 'Copied!' : 'Copy Text';
  const copyAllLabel = copied === 'all' ? 'Copied!' : 'Copy All';

  return `
    <div class="vt-result">
      <div class="vt-result-title">${ICONS.check} Text extracted!</div>
      <div class="vt-result-row"><span class="vt-result-label">Images processed</span><span class="vt-result-value">${okCount} / ${items.length}</span></div>
      <div class="vt-result-row"><span class="vt-result-label">Total words</span><span class="vt-result-value vt-result-highlight">${result.totalWords}</span></div>
      <div class="vt-result-row"><span class="vt-result-label">Total characters</span><span class="vt-result-value">${result.totalChars}</span></div>
      ${failed > 0 ? `<div class="vt-result-warn">${failed} image(s) failed</div>` : ''}
      ${list}
      ${textBlock}
      <div class="vt-result-actions">
        ${active.error ? '' : `<button class="vt-result-btn vt-result-btn--primary" id="ocCopyBtn">${copyLabel}</button>`}
        ${okCount > 1 ? `<button class="vt-result-btn" id="ocCopyAllBtn">${copyAllLabel}</button>` : ''}
        ${active.error ? '' : '<button class="vt-result-btn" id="ocOpenFileBtn">Open File</button>'}
        <button class="vt-result-btn" id="ocOpenFolderBtn">Open Folder</button>
        <button class="vt-result-btn" id="ocAnotherBtn">Extract More</button>
      </div>
    </div>`;
}

export function renderOcrError(error) {
  if (!error) return '';
  return `
    <div class="vt-error">
      <span>${escapeHtml(error)}</span>
      <button class="vt-error-retry" id="ocRetryBtn">Retry</button>
    </div>`;
}