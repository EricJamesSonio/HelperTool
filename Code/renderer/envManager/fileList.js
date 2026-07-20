import { escHtml } from './utils.js';

const ICON_DOT_FILLED = '<svg viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="3.5"/></svg>';
const ICON_DOT_EMPTY = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="5" cy="5" r="3.5"/></svg>';

export function renderFileListHTML(sectionIdx, sec) {
  if (!sec.files || !sec.files.length) {
    return '<div class="env-empty-inline">No files found</div>';
  }
  return sec.files.map(f => {
    const active = f === sec.activeFile ? ' env-file-active' : '';
    const dot = f === sec.activeFile ? ICON_DOT_FILLED : ICON_DOT_EMPTY;
    const dirtyDot = sec.dirty && f === sec.activeFile ? `<span class="env-file-dirty-dot">${ICON_DOT_FILLED}</span>` : '';
    return `<div class="env-file-row${active}" data-section="${sectionIdx}" data-file="${escHtml(f)}">
      <span class="env-file-dot">${dot}</span>
      <span class="env-file-name">${escHtml(f)}</span>
      ${dirtyDot}
    </div>`;
  }).join('');
}
