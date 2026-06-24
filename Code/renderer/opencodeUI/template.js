export function getTemplate(mode = 'full') {
  if (mode === 'content') {
    return `
<div class="oc-panel" id="ocPanel">
  <div class="oc-header">
    <div class="oc-header-left">
      <svg class="oc-logo" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      <span class="oc-title">OpenCode</span>
    </div>
    <div class="oc-header-right">
      <button class="oc-btn oc-btn-icon oc-close-btn" id="ocCloseBtn" title="Close (Esc)">✕</button>
    </div>
  </div>

  <div class="oc-body" id="ocBody">
    <div class="oc-sidebar" id="ocSidebar">
      <div class="oc-sidebar-top">
        <div class="oc-repo-tabs" id="ocRepoTabs"></div>
        <button class="oc-btn oc-btn-new-chat" id="ocNewChatBtn">+ New Chat</button>
      </div>
      <div class="oc-conv-list" id="ocConvList"></div>
    </div>

    <div class="oc-main" id="ocMain">
      <div class="oc-welcome" id="ocWelcome">
        <div class="oc-welcome-content">
          <svg class="oc-logo" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <h2>OpenCode Chat</h2>
          <p>Select a conversation or start a new chat.</p>
        </div>
      </div>
      <div class="oc-chat" id="ocChat" style="display:none">
        <div class="oc-chat-header" id="ocChatHeader"></div>
        <div class="oc-messages" id="ocMessages"></div>
        <div class="oc-input-area" id="ocInputArea"></div>
      </div>
    </div>
  </div>
</div>
`;
  }

  return '';
}
