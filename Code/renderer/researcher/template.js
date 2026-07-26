const serviceTypes = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' },
];

export function getServiceTypes() { return serviceTypes; }
export function getServiceType(id) { return serviceTypes.find(s => s.id === id); }

export function getAccountTypeIcon(typeId) {
  const t = serviceTypes.find(s => s.id === typeId);
  return t ? t.icon : '';
}

export function getAccountTypeName(typeId) {
  const t = serviceTypes.find(s => s.id === typeId);
  return t ? t.name : typeId;
}

export function getTemplate() {
  return `
    <div class="rs-panel" id="rsPanel">
      <div class="rs-panel-content" id="rsContent">
        <div class="rs-navbar">
          <h2 class="rs-panel-title">Researcher</h2>
          <button class="rs-panel-close-btn" id="rsCloseBtn" title="Close">✕</button>
        </div>
        <div class="rs-panel-body" id="rsBody">
          <div class="rs-wrapper" id="rsWrapper">
            <!-- HOME VIEW -->
            <div class="rs-home" id="rsHome">
              <div class="rs-header">
                <div class="rs-title-row">
                  <h3 class="rs-title">Researcher Accounts</h3>
                </div>
                <p class="rs-subtitle">Select a saved account or add a new one</p>
              </div>

              <div class="rs-home-body">
                <div class="rs-account-list" id="rsAccountList">
                  <div class="rs-section-label">Saved Accounts</div>
                  <div class="rs-account-rows" id="rsAccountRows"></div>
                  <button class="rs-add-account-btn" id="rsAddAccountBtn">+ Add Account</button>
                  <div class="rs-empty-accounts" id="rsEmptyAccounts">No saved accounts yet</div>
                </div>

                <div class="rs-add-new-section" id="rsAddNewSection">
                  <div class="rs-section-label">Add New Account</div>
                  <div class="rs-add-new-grid" id="rsAddNewGrid">
                    ${serviceTypes.map(s => `
                      <button class="rs-add-new-card" data-id="${s.id}">
                        <div class="rs-researcher-icon">${s.icon}</div>
                        <div class="rs-researcher-name">${s.name}</div>
                      </button>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>

            <!-- SPLIT VIEW -->
            <div class="rs-split-view rs-hidden" id="rsSplitView">
              <div class="rs-left-panel" id="rsLeftPanel">
                <div class="rs-left-header">
                  <span class="rs-left-title" id="rsLeftTitle">Researcher</span>
                  <button class="rs-back-btn" id="rsBackBtn" title="Back to accounts">← Back</button>
                </div>
                <div class="rs-left-body">
                  <div class="rs-save-account rs-hidden" id="rsSaveAccount">
                    <div class="rs-save-info">Log in to your account in the browser panel on the right, then save it below.</div>
                    <input type="text" class="rs-save-input" id="rsSaveInput" placeholder="e.g. my@email.com" autocomplete="off">
                    <div class="rs-save-error" id="rsSaveError"></div>
                    <button class="rs-btn rs-btn-primary" id="rsSaveBtn">Save Account</button>
                  </div>
                  <div class="rs-account-info rs-hidden" id="rsAccountInfo">
                    <div class="rs-account-badge" id="rsAccountBadge"></div>
                  </div>
                  <textarea class="rs-textarea" id="rsTextarea" placeholder="Type your prompt here..."></textarea>
                  <div class="rs-toolbar">
                    <button class="rs-btn rs-btn-secondary" id="rsInsertTicketBtn">Insert Ticket</button>
                    <button class="rs-btn rs-btn-secondary" id="rsApplyPromptBtn">Apply Prompt</button>
                    <button class="rs-btn rs-btn-secondary" id="rsPlanningBtn">Planning</button>
                    <button class="rs-btn rs-btn-secondary" id="rsStonesBtn">Stones</button>
                    <button class="rs-btn rs-btn-secondary" id="rsKitBtn">Kit</button>
                  </div>
                  <div class="rs-actions">
                    <button class="rs-btn rs-btn-primary" id="rsCopyBtn">Copy</button>
                    <button class="rs-btn rs-btn-danger" id="rsClearBtn">Clear</button>
                  </div>
                </div>
              </div>
              <div class="rs-right-panel" id="rsRightPanel"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
