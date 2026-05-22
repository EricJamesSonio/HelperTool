export function getTemplate() {
    return `
<!-- ══ LOCK SCREEN ══ -->
<div id="shLockScreen" class="sh-lock-screen">
  <div class="sh-lock-card">
    <div class="sh-lock-icon">🔐</div>
    <h2 class="sh-lock-title" id="shPwLabel">Secret Holder</h2>
    <p  class="sh-lock-subtitle" id="shPwSubtitle"></p>
    <div class="sh-pw-wrap">
      <input id="shPwInput" type="password" class="sh-input"
             placeholder="Enter password…" autocomplete="off" />
      <button id="shTogglePw" class="sh-toggle-pw" type="button" title="Show / hide">👁</button>
    </div>
    <div id="shPwError" class="sh-msg sh-msg-error" style="display:none"></div>
    <button id="shPwSubmit" class="sh-btn sh-btn-primary sh-btn-block" type="button">Unlock</button>
    <button id="shCloseLock" class="sh-btn sh-btn-ghost sh-btn-block sh-btn-sm" type="button">✕ Cancel</button>
  </div>
</div>
<!-- ══ MAIN SCREEN ══ -->
<div id="shMainScreen" class="sh-main-screen" style="display:none">
  <div class="sh-header">
    <span class="sh-header-title">🔐 Secret Holder</span>
    <div class="sh-header-btns">
      <button id="shLockBtn"  class="sh-btn sh-btn-ghost sh-btn-sm" type="button">🔒 Lock</button>
      <button id="shCloseBtn" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">✕ Close</button>
    </div>
  </div>
  <div class="sh-tabs">
    <button id="shTabSecrets" class="sh-tab sh-tab-active" type="button">🔑 Secrets</button>
    <button id="shTabNotes"   class="sh-tab"               type="button">📝 Notes</button>
  </div>
  <!-- SECRETS PANEL -->
  <div id="shPanelSecrets" class="sh-tab-panel">
    <div class="sh-add-bar">
      <input id="shAddName"  class="sh-input sh-input-sm" placeholder="Name  (e.g. JWT_SECRET)" />
      <input id="shAddValue" class="sh-input sh-input-sm sh-mono" placeholder="Value" />
      <button id="shAddBtn"  class="sh-btn sh-btn-accent sh-btn-sm" type="button">＋ Add</button>
    </div>
    <div id="shSecretsList" class="sh-list"></div>
    <details class="sh-settings" id="shResetSection">
      <summary class="sh-settings-summary">⚙️ Change password</summary>
      <div class="sh-settings-body">
        <label class="sh-label">Current password</label>
        <input id="shResetOld" type="password" class="sh-input sh-input-sm" placeholder="Current password" />
        <label class="sh-label">New password</label>
        <input id="shResetNew" type="password" class="sh-input sh-input-sm" placeholder="New password" />
        <button id="shResetBtn" class="sh-btn sh-btn-warn sh-btn-sm" type="button">Update password</button>
        <div id="shResetErr"     class="sh-msg sh-msg-error"   style="display:none"></div>
        <div id="shResetSuccess" class="sh-msg sh-msg-success" style="display:none">✓ Password updated!</div>
      </div>
    </details>
  </div>
  <!-- NOTES PANEL -->
  <div id="shPanelNotes" class="sh-tab-panel sh-notes-layout" style="display:none">
    <div class="sh-notes-sidebar">
      <div class="sh-notes-sidebar-header">
        <span class="sh-notes-sidebar-title">📝 Notes</span>
        <button id="shNoteNewBtn" class="sh-btn sh-btn-accent sh-btn-xs" type="button">＋ New</button>
      </div>
      <div id="shNotesList" class="sh-notes-sidebar-list"></div>
    </div>
    <div class="sh-notes-editor">
      <div id="shNotesEditorEmpty" class="sh-notes-editor-empty">
        <div class="sh-notes-empty-icon">📝</div>
        <div class="sh-notes-empty-text">Select a note or create a new one.</div>
      </div>
      <div id="shNotesEditorForm" class="sh-notes-editor-form" style="display:none">
        <div class="sh-notes-editor-topbar">
          <input id="shNoteFormTitle" class="sh-input sh-notes-editor-title-input" placeholder="Note title…" maxlength="120" />
          <input id="shNoteFormDate"  class="sh-input sh-input-sm sh-mono sh-note-date-input" type="date" />
        </div>
        <textarea id="shNoteFormBody" class="sh-input sh-notes-editor-textarea" placeholder="Write your note here…"></textarea>
        <div class="sh-notes-editor-actions">
          <button id="shNoteDeleteBtn" class="sh-btn sh-btn-danger  sh-btn-sm" type="button" style="display:none">🗑 Delete</button>
          <div style="flex:1"></div>
          <button id="shNoteCancelBtn" class="sh-btn sh-btn-ghost   sh-btn-sm" type="button">✕ Discard</button>
          <button id="shNoteSaveBtn"   class="sh-btn sh-btn-accent  sh-btn-sm" type="button">💾 Save</button>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- EDIT MODAL -->
<div id="shEditModal" class="sh-modal-back" style="display:none">
  <div class="sh-modal">
    <div class="sh-modal-title">✏️ Edit secret</div>
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
