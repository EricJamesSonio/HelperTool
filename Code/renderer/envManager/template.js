export function getModalShell() {
  return `
    <div class="env-overlay" id="envOverlay">
      <div class="env-modal" id="envModal">
        <div class="env-header">
          <span class="env-header-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="14" height="12" rx="1.5"/><path d="M3 9h14"/><path d="M7 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><circle cx="10" cy="12" r="1"/><path d="M10 13v2"/></svg></span>
          <span class="env-header-title">ENV Manager</span>
          <span class="env-header-repo" id="envHeaderRepo"></span>
          <div class="env-header-spacer"></div>
          <button class="env-btn env-btn-close" id="envCloseBtn"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg> Close</button>
        </div>
        <div class="env-body">
          <div class="env-left" id="envLeft">
            <div class="env-left-header">ENV FILES</div>
            <div class="env-file-list" id="envFileList"></div>
            <div class="env-left-actions">
              <button class="env-btn env-btn-primary env-btn-sm" id="envNewFileBtn">+ New Env File</button>
            </div>
          </div>
          <div class="env-right" id="envRight">
            <div class="env-empty" id="envRightEmpty">Select an env file to edit</div>
            <div class="env-editor" id="envEditor" style="display:none"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}
