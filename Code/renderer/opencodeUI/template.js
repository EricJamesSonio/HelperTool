export function getTemplate(mode = 'full') {
  if (mode === 'content') {
    return `
<div class="oc-panel" id="ocPanel">
  <div class="oc-header">
    <div class="oc-header-left">
      <svg class="oc-logo" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      <span class="oc-title">Code Swamp</span>
      <span class="oc-repo-indicator" id="ocRepoPath"></span>
    </div>
    <div class="oc-header-right">
      <button class="oc-btn oc-btn-icon" id="ocCloseBtn" title="Close (Esc)">✕</button>
    </div>
  </div>

  <div class="oc-body">
    <div class="oc-sidebar" id="ocSidebar">
      <div class="oc-sidebar-top">
        <div class="oc-repo-tabs" id="ocRepoTabs"></div>
        <button class="oc-btn oc-btn-new-chat" id="ocNewChatBtn">+ New Chat</button>
      </div>
      <div class="oc-conv-list" id="ocConvList"></div>
    </div>

    <div class="oc-main" id="ocMain">
      <div class="oc-terminal" id="ocTerminal">
        <pre class="oc-terminal-output" id="ocTerminalOutput"><span class="oc-terminal-welcome">Code Swamp — type a message to start</span></pre>
      </div>
      <div class="oc-input-area" id="ocInputArea"></div>
    </div>
  </div>
</div>
`;
  }

  return '';
}
