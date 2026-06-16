function icon(name) {
  const SVG = {
    lock:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="8" width="12" height="10" rx="1.5"/><path d="M6 8V5a4 4 0 0 1 8 0v3"/><circle cx="10" cy="13" r="1.2"/></svg>',
    eye:     '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="10" cy="10" r="2.5"/></svg>',
    key:     '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a4 4 0 0 0-5.4 5.4L3 17v2h3l1.5-1.5L9 19l2-2-1.5-1.5L12 13A4 4 0 0 0 17 3z"/><circle cx="14" cy="6" r="1"/></svg>',
    note:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M12 2v4h4"/><path d="M6 9h8"/><path d="M6 12h6"/><path d="M6 15h4"/></svg>',
    plus:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 3v14"/><path d="M3 10h14"/></svg>',
    search:  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="9" r="5"/><path d="M13 13l4 4"/></svg>',
    edit:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2l4 4-10 10H4v-4L14 2z"/></svg>',
    copy:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="11" height="11" rx="1.5"/><path d="M4 11V4h7"/></svg>',
    trash:   '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h14"/><path d="M6 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M8 9v5"/><path d="M12 9v5"/><path d="M5 6l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/></svg>',
    check:   '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4 4 8-8"/></svg>',
    gear:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2"/><path d="M10 17v2"/><path d="M1 10h2"/><path d="M17 10h2"/><path d="M3.93 3.93l1.41 1.41"/><path d="M14.66 14.66l1.41 1.41"/><path d="M3.93 16.07l1.41-1.41"/><path d="M14.66 5.34l1.41-1.41"/></svg>',
    close:   '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>',
    save:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M12 2v4h4"/><path d="M6 10h8"/><path d="M6 14h8"/><path d="M6 6h2"/></svg>',
    lockSm:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5 7V4a3 3 0 0 1 6 0v3"/></svg>',
  };
  return SVG[name] || '';
}

export function getTemplate() {
    return `
<div id="shLockScreen" class="sh-lock-screen">
  <div class="sh-lock-card">
    <div class="sh-lock-icon">${icon('lock')}</div>
    <h2 class="sh-lock-title" id="shPwLabel">Secret Holder</h2>
    <p class="sh-lock-subtitle" id="shPwSubtitle"></p>
    <div class="sh-pw-wrap">
      <input id="shPwInput" type="password" class="sh-input"
             placeholder="Enter password..." autocomplete="off" />
      <button id="shTogglePw" class="sh-toggle-pw" type="button" title="Show / hide">${icon('eye')}</button>
    </div>
    <div id="shPwError" class="sh-msg sh-msg-error" style="display:none"></div>
    <button id="shPwSubmit" class="sh-btn sh-btn-primary sh-btn-block" type="button">Unlock</button>
    <button id="shCloseLock" class="sh-btn sh-btn-ghost sh-btn-block sh-btn-sm" type="button">Cancel</button>
  </div>
</div>
<div id="shMainScreen" class="sh-main-screen" style="display:none">
  <div class="sh-header">
    <span class="sh-header-title">${icon('lockSm')} Secret Holder</span>
    <div class="sh-header-btns">
      <button id="shLockBtn"  class="sh-btn sh-btn-ghost sh-btn-sm" type="button">${icon('lockSm')} Lock</button>
      <button id="shCloseBtn" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">${icon('close')} Close</button>
    </div>
  </div>
  <div class="sh-tabs">
    <button id="shTabSecrets" class="sh-tab sh-tab-active" type="button">${icon('key')} Secrets</button>
    <button id="shTabNotes"   class="sh-tab"               type="button">${icon('note')} Notes</button>
  </div>
  <div id="shPanelSecrets" class="sh-tab-panel">
    <div class="sh-add-bar">
      <input id="shAddName"  class="sh-input sh-input-sm" placeholder="Name  (e.g. JWT_SECRET)" />
      <input id="shAddValue" class="sh-input sh-input-sm sh-mono" placeholder="Value" />
      <button id="shAddBtn"  class="sh-btn sh-btn-accent sh-btn-sm" type="button">${icon('plus')} Add</button>
    </div>
    <div class="sh-search-bar">
      <div class="sh-search-wrap">
        <span class="sh-search-icon">${icon('search')}</span>
        <input id="shSearchSecrets" class="sh-input sh-input-sm sh-search-input"
               placeholder="Search by name or value..." autocomplete="off" />
      </div>
    </div>
    <div id="shSecretsList" class="sh-list"></div>
    <details class="sh-settings" id="shResetSection">
      <summary class="sh-settings-summary">${icon('gear')} Change password</summary>
      <div class="sh-settings-body">
        <label class="sh-label">Current password</label>
        <input id="shResetOld" type="password" class="sh-input sh-input-sm" placeholder="Current password" />
        <label class="sh-label">New password</label>
        <input id="shResetNew" type="password" class="sh-input sh-input-sm" placeholder="New password" />
        <button id="shResetBtn" class="sh-btn sh-btn-warn sh-btn-sm" type="button">Update password</button>
        <div id="shResetErr"     class="sh-msg sh-msg-error"   style="display:none"></div>
        <div id="shResetSuccess" class="sh-msg sh-msg-success" style="display:none">Password updated!</div>
      </div>
    </details>
  </div>
  <div id="shPanelNotes" class="sh-tab-panel sh-notes-layout" style="display:none">
    <div class="sh-notes-sidebar">
      <div class="sh-notes-sidebar-header">
        <span class="sh-notes-sidebar-title">${icon('note')} Notes</span>
        <button id="shNoteNewBtn" class="sh-btn sh-btn-accent sh-btn-xs" type="button">${icon('plus')} New</button>
      </div>
      <div class="sh-notes-search">
        <div class="sh-search-wrap">
          <span class="sh-search-icon">${icon('search')}</span>
          <input id="shSearchNotes" class="sh-input sh-input-sm sh-search-input"
                 placeholder="Search notes..." autocomplete="off" />
        </div>
      </div>
      <div id="shNotesList" class="sh-notes-sidebar-list"></div>
    </div>
    <div class="sh-notes-editor">
      <div id="shNotesEditorEmpty" class="sh-notes-editor-empty">
        <div class="sh-notes-empty-icon">${icon('note')}</div>
        <div class="sh-notes-empty-text">Select a note or create a new one.</div>
      </div>
      <div id="shNotesEditorForm" class="sh-notes-editor-form" style="display:none">
        <div class="sh-notes-editor-topbar">
          <input id="shNoteFormTitle" class="sh-input sh-notes-editor-title-input" placeholder="Note title..." maxlength="120" />
          <input id="shNoteFormDate"  class="sh-input sh-input-sm sh-mono sh-note-date-input" type="date" />
        </div>
        <textarea id="shNoteFormBody" class="sh-input sh-notes-editor-textarea" placeholder="Write your note here..."></textarea>
        <div class="sh-notes-editor-actions">
          <button id="shNoteDeleteBtn" class="sh-btn sh-btn-danger sh-btn-sm" type="button" style="display:none">${icon('trash')} Delete</button>
          <div style="flex:1"></div>
          <button id="shNoteCancelBtn" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">${icon('close')} Discard</button>
          <button id="shNoteSaveBtn"   class="sh-btn sh-btn-accent sh-btn-sm" type="button">${icon('save')} Save</button>
        </div>
      </div>
    </div>
  </div>
</div>
<div id="shEditModal" class="sh-modal-back" style="display:none">
  <div class="sh-modal">
    <div class="sh-modal-title">${icon('edit')} Edit secret</div>
    <label class="sh-label">Name</label>
    <input id="shEditName"  class="sh-input" />
    <label class="sh-label">Value</label>
    <input id="shEditValue" class="sh-input sh-mono" />
    <div class="sh-modal-foot">
      <button id="shEditCancel" class="sh-btn sh-btn-ghost"   type="button">Cancel</button>
      <button id="shEditSave"   class="sh-btn sh-btn-primary" type="button">Save</button>
    </div>
  </div>
</div>`;
}