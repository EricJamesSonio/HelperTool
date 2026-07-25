const researchers = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai' },
];

export function getResearchers() { return researchers; }
export function getResearcher(id) { return researchers.find(r => r.id === id); }

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
            <div class="rs-home" id="rsHome">
              <div class="rs-header">
                <div class="rs-title-row">
                  <h3 class="rs-title">Select Researcher</h3>
                </div>
                <p class="rs-subtitle">Choose an AI assistant to work with</p>
              </div>
              <div class="rs-researcher-grid" id="rsResearcherGrid">
                ${researchers.map(r => `
                  <button class="rs-researcher-card" data-id="${r.id}">
                    <div class="rs-researcher-icon">${r.id === 'chatgpt' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>'}</div>
                    <div class="rs-researcher-name">${r.name}</div>
                    <div class="rs-researcher-url">${r.url}</div>
                  </button>
                `).join('')}
              </div>
            </div>
            <div class="rs-split-view rs-hidden" id="rsSplitView">
              <div class="rs-left-panel" id="rsLeftPanel">
                <div class="rs-left-header">
                  <span class="rs-left-title" id="rsLeftTitle">ChatGPT</span>
                  <button class="rs-back-btn" id="rsBackBtn" title="Back to selection">← Back</button>
                </div>
                <div class="rs-left-body">
                  <textarea class="rs-textarea" id="rsTextarea" placeholder="Type your prompt here..."></textarea>
                  <div class="rs-toolbar">
                    <button class="rs-btn rs-btn-secondary" id="rsInsertTicketBtn">Insert Ticket</button>
                    <button class="rs-btn rs-btn-secondary" id="rsApplyPromptBtn">Apply Prompt</button>
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