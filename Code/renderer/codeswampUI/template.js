export function getTemplate(mode = 'full') {
  if (mode === 'content') {
    return `
<div class="oc-panel" id="ocPanel">
  <div class="oc-header">
    <div class="oc-header-left">
      <svg class="oc-logo" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      <span class="oc-title">Code Swamp</span>
    </div>
    <div class="oc-header-right">
      <button class="oc-btn oc-btn-icon" id="ocCloseBtn" title="Close (Esc)">✕</button>
    </div>
  </div>

  <div class="oc-body">
    <div class="oc-sidebar" id="ocSidebar">

      <div class="oc-repo-path-bar" id="ocRepoPath"></div>

      <div class="oc-sidebar-top">
      <div class="oc-repo-tabs" id="ocRepoTabs" style="display:none"></div>
        <div style="display:flex;gap:4px">
          <button class="oc-btn oc-btn-new-chat" id="ocNewChatBtn" style="flex:1">+ New Chat</button>
          <button class="oc-btn oc-btn-new-chat" id="ocRefreshBtn" style="width:32px;flex:none;font-size:14px" title="Refresh conversations">⟳</button>
        </div>
      </div>

      <div class="oc-term-settings" id="ocTermSettings">
        <label class="oc-settings-label">Terminal</label>
        <select class="oc-settings-select" id="ocShellSelect"></select>
      </div>

      <div class="oc-term-settings" id="ocAISettings">
        <label class="oc-settings-label">AI Provider</label>
        <select class="oc-settings-select" id="ocAIProviderSelect"></select>
      </div>

      <div class="oc-conv-list" id="ocConvList"></div>
    </div>
    <button class="oc-sidebar-toggle" id="ocSidebarToggle" title="Toggle sidebar">◀</button>

    <div class="oc-main" id="ocMain">
      <div class="oc-loading-overlay" id="ocLoadingOverlay">
        <div class="oc-loading-spinner"></div>
        <div class="oc-loading-progress">
          <div class="oc-loading-bar" id="ocLoadingBar"></div>
        </div>
        <div class="oc-loading-label" id="ocLoadingLabel">Starting...</div>
      </div>
      <div class="oc-welcome" id="ocWelcome">
        <div class="oc-welcome-content">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <h2>Code Swamp</h2>
          <p>Start a new chat to open a terminal with CodeSwamp.</p>
        </div>
      </div>
      <div class="oc-terminal" id="ocTerminal" style="display:none">
        <div class="oc-terminal-container" id="ocTerminalContainer"></div>
      </div>
      <div class="oc-response-overlay" id="ocResponseOverlay" style="display:none">
        <div class="oc-response-overlay-header">
          <span class="oc-response-overlay-title">Response</span>
          <button class="oc-btn oc-btn-icon oc-response-overlay-close" id="ocResponseOverlayClose">✕</button>
        </div>
        <div class="oc-response-overlay-body" id="ocResponseContent"></div>
      </div>
      <div class="oc-input-area" id="ocInputArea"></div>
    </div>
  </div>
</div>
`;
  }
  return '';
}