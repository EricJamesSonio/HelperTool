export function getModalShell() {
  return `
    <div class="env-overlay" id="envOverlay">
      <div class="env-modal" id="envModal">
        <div class="env-header">
          <span class="env-header-icon">\uD83D\uDD10</span>
          <span class="env-header-title">ENV Manager</span>
          <span class="env-header-repo" id="envHeaderRepo"></span>
          <div class="env-header-spacer"></div>
          <button class="env-btn env-btn-close" id="envCloseBtn">\u2715 Close</button>
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
