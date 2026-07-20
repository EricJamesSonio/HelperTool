import { escHtml } from './utils.js';

export function renderEditorHTML(sectionIdx, sec) {
  if (!sec.activeFile) {
    return '<div class="env-empty-inline">Select a file to edit</div>';
  }

  const fileLabel = sec.dirty ? `${escHtml(sec.activeFile)} \u25CF` : escHtml(sec.activeFile);

  let rowsHtml = '';
  const filtered = sec.entries.filter(e => {
    if (!sec.searchQuery) return true;
    if (e.key === null) return true;
    return e.key.toLowerCase().includes(sec.searchQuery.toLowerCase());
  });

  if (sec.editing) {
    // ── Edit mode: all entries are inline inputs ──
    filtered.forEach(entry => {
      const realIdx = sec.entries.indexOf(entry);
      if (entry.comment !== null && entry.comment !== undefined) {
        rowsHtml += `<div class="env-entry env-entry-comment" data-idx="${realIdx}">
          <span class="env-entry-comment-text">${escHtml(entry.comment || ' ')}</span>
        </div>`;
        return;
      }
      rowsHtml += `<div class="env-entry" data-idx="${realIdx}">
        <div class="env-entry-edit-form">
          <input class="env-edit-input env-edit-key" value="${escHtml(entry.key)}" placeholder="KEY" spellcheck="false">
          <input class="env-edit-input env-edit-val" value="${escHtml(entry.value)}" placeholder="value" spellcheck="false">
          <button class="env-btn env-btn-sm env-btn-danger env-entry-del" data-section="${sectionIdx}" data-idx="${realIdx}" title="Delete">&times;</button>
        </div>
      </div>`;
    });

    return `
      <div class="env-editor-header">
        <span class="env-editor-filename">${fileLabel}</span>
        <div class="env-editor-header-actions">
          <button class="env-btn env-btn-sm env-btn-primary env-editor-done-btn" data-section="${sectionIdx}">Done</button>
          <button class="env-btn env-btn-sm env-editor-cancel-btn" data-section="${sectionIdx}">Cancel</button>
        </div>
      </div>
      ${sec.error ? `<div class="env-editor-error">${escHtml(sec.error)}</div>` : ''}
      <div class="env-editor-search">
        <input class="env-search-input" data-section="${sectionIdx}" placeholder="Search keys\u2026" value="${escHtml(sec.searchQuery || '')}">
      </div>
      <div class="env-editor-rows" data-section="${sectionIdx}">
        ${rowsHtml || '<div class="env-empty-rows">No matching entries</div>'}
      </div>
      <div class="env-editor-add">
        <button class="env-btn env-btn-sm env-editor-add-key" data-section="${sectionIdx}">+ Add Key</button>
      </div>
    `;
  }

  // ── View mode: all values shown, per-entry delete ──
  filtered.forEach(entry => {
    const realIdx = sec.entries.indexOf(entry);
    if (entry.comment !== null && entry.comment !== undefined) {
      rowsHtml += `<div class="env-entry env-entry-comment" data-idx="${realIdx}">
        <span class="env-entry-comment-text">${escHtml(entry.comment || ' ')}</span>
        <button class="env-entry-action env-entry-del" data-section="${sectionIdx}" data-idx="${realIdx}" title="Delete">&times;</button>
      </div>`;
      return;
    }
    rowsHtml += `<div class="env-entry" data-idx="${realIdx}">
      <span class="env-entry-key">${escHtml(entry.key)}</span>
      <span class="env-entry-value">${escHtml(entry.value)}</span>
      <div class="env-entry-actions">
        <button class="env-entry-action env-entry-del" data-section="${sectionIdx}" data-idx="${realIdx}" title="Delete">&times;</button>
      </div>
    </div>`;
  });

  return `
    <div class="env-editor-header">
      <span class="env-editor-filename">${fileLabel}</span>
      <div class="env-editor-header-actions">
        <button class="env-btn env-btn-sm env-editor-copy" data-section="${sectionIdx}" title="Copy">Copy</button>
        <button class="env-btn env-btn-sm env-btn-primary env-editor-edit-btn" data-section="${sectionIdx}">Edit</button>
      </div>
    </div>
    ${sec.error ? `<div class="env-editor-error">${escHtml(sec.error)}</div>` : ''}
    <div class="env-editor-search">
      <input class="env-search-input" data-section="${sectionIdx}" placeholder="Search keys\u2026" value="${escHtml(sec.searchQuery || '')}">
    </div>
    <div class="env-editor-rows" data-section="${sectionIdx}">
      <div class="env-entry env-entry-header">
        <span class="env-entry-key">KEY</span>
        <span class="env-entry-value">VALUE</span>
        <div class="env-entry-actions"><span class="env-entry-action-label">ACTIONS</span></div>
      </div>
      ${rowsHtml || '<div class="env-empty-rows">No matching entries</div>'}
    </div>
    <div class="env-editor-add">
      <button class="env-btn env-btn-sm env-editor-add-key" data-section="${sectionIdx}">+ Add Key</button>
    </div>
  `;
}
