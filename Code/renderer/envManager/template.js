export function getModalShell() {
  return `
    <div class="env-overlay" id="envOverlay">
      <div class="env-modal" id="envModal">
        <div class="env-header">
          <span class="env-header-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="14" height="12" rx="1.5"/><path d="M3 9h14"/><path d="M7 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><circle cx="10" cy="12" r="1"/><path d="M10 13v2"/></svg></span>
          <span class="env-header-title">ENV Manager</span>
          <span class="env-header-repo" id="envHeaderRepo"></span>
          <div class="env-header-spacer"></div>
          <button class="env-btn env-add-section-btn" id="envHeaderAddBtn">+ Add Section</button>
          <button class="env-btn env-btn-close" id="envCloseBtn"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg> Close</button>
        </div>
        <div class="env-body" id="envBody">
          <div class="env-panels" id="envPanels"></div>
        </div>
        <div class="env-add-section" id="envAddSection" style="display:none">
          <div class="env-add-section-overlay" id="envAddSectionOverlay"></div>
          <div class="env-add-section-card">
            <div class="env-add-section-title">Add Section</div>
            <div class="env-add-section-desc">Enter a file pattern to track (e.g. <code>.gitignore</code>, <code>Dockerfile*</code>)</div>
            <input class="env-add-section-input" id="envAddSectionInput" placeholder="e.g. .gitignore" spellcheck="false">
            <div class="env-add-section-error" id="envAddSectionError"></div>
            <div class="env-add-section-actions">
              <button class="env-btn env-btn-primary env-btn-sm" id="envAddSectionConfirm">Add</button>
              <button class="env-btn env-btn-sm" id="envAddSectionCancel">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
