export function getPanelTemplate() {
  return `
    <div class="dt-overlay" id="dtOverlay">
      <div class="dt-panel" id="dtPanel">
        <div class="dt-header">
          <div class="dt-header-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
              <circle cx="12" cy="12" r="10"/>
              <path d="M7 12l3 3 7-7"/>
            </svg>
            <span class="dt-title">Docker Manager</span>
            <span class="dt-badge" id="dtStatusBadge">disconnected</span>
          </div>
          <div class="dt-header-actions">
            <button class="dt-btn dt-btn-icon" id="dtRefreshBtn" title="Refresh all">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <polyline points="15 4 18 4 18 7"/><path d="M18 4a7 7 0 1 1-2-5"/>
              </svg>
            </button>
            <button class="dt-btn dt-btn-icon" id="dtCloseBtn" title="Close">&times;</button>
          </div>
        </div>
        <div class="dt-tabs" id="dtTabs">
          <button class="dt-tab active" data-tab="containers">Containers</button>
          <button class="dt-tab" data-tab="images">Images</button>
          <button class="dt-tab" data-tab="stats">Stats</button>
        </div>
        <div class="dt-body" id="dtBody">
          <div class="dt-tab-content active" id="dtTabContainers"></div>
          <div class="dt-tab-content" id="dtTabImages"></div>
          <div class="dt-tab-content" id="dtTabStats"></div>
        </div>
      </div>
    </div>
  `;
}

export function getContainerRow(c) {
  const stateColor = c.state === 'running' ? 'var(--green)' : c.state === 'exited' ? 'var(--red)' : 'var(--yellow)';
  return `
    <div class="dt-container-row" data-id="${c.id}">
      <div class="dt-container-indicator" style="background:${stateColor}"></div>
      <div class="dt-container-info">
        <div class="dt-container-name">${c.name}</div>
        <div class="dt-container-meta">${c.image}</div>
        <div class="dt-container-meta">${c.ports.join(', ')}</div>
      </div>
      <div class="dt-container-status">${c.status}</div>
      <div class="dt-container-actions">
        <button class="dt-btn dt-btn-sm dt-start" data-action="start" ${c.state === 'running' ? 'disabled' : ''}>Start</button>
        <button class="dt-btn dt-btn-sm dt-stop" data-action="stop" ${c.state !== 'running' ? 'disabled' : ''}>Stop</button>
        <button class="dt-btn dt-btn-sm dt-restart" data-action="restart">Restart</button>
        <button class="dt-btn dt-btn-sm dt-remove" data-action="remove">Remove</button>
        <button class="dt-btn dt-btn-sm dt-logs" data-action="logs">Logs</button>
      </div>
    </div>
  `;
}

export function getImageRow(i) {
  const sizeLabel = i.size > 1073741824 ? (i.size / 1073741824).toFixed(1) + ' GB'
    : i.size > 1048576 ? (i.size / 1048576).toFixed(1) + ' MB'
    : (i.size / 1024).toFixed(1) + ' KB';
  return `
    <div class="dt-image-row" data-id="${i.id}">
      <div class="dt-image-info">
        <div class="dt-image-tag">${i.repoTag}</div>
        <div class="dt-image-meta">${sizeLabel}</div>
      </div>
      <div class="dt-image-actions">
        <button class="dt-btn dt-btn-sm dt-remove" data-action="remove-image">Remove</button>
      </div>
    </div>
  `;
}

export function getStatsPanel() {
  return `
    <div class="dt-stats-wrap" id="dtStatsWrap">
      <div class="dt-stats-header">
        <select class="dt-stats-select" id="dtStatsSelect">
          <option value="">— Select container —</option>
        </select>
      </div>
      <div class="dt-stats-grid" id="dtStatsGrid">
        <div class="dt-stat-card">
          <div class="dt-stat-label">CPU</div>
          <div class="dt-stat-value" id="dtStatCpu">—</div>
        </div>
        <div class="dt-stat-card">
          <div class="dt-stat-label">Memory</div>
          <div class="dt-stat-value" id="dtStatMem">—</div>
          <div class="dt-stat-bar" id="dtStatMemBar"><div class="dt-stat-bar-fill" id="dtStatMemFill" style="width:0%"></div></div>
        </div>
        <div class="dt-stat-card">
          <div class="dt-stat-label">Network RX</div>
          <div class="dt-stat-value" id="dtStatNetRx">—</div>
        </div>
        <div class="dt-stat-card">
          <div class="dt-stat-label">Network TX</div>
          <div class="dt-stat-value" id="dtStatNetTx">—</div>
        </div>
        <div class="dt-stat-card">
          <div class="dt-stat-label">PIDs</div>
          <div class="dt-stat-value" id="dtStatPids">—</div>
        </div>
      </div>
    </div>
  `;
}

export function getLogModal() {
  return `
    <div class="dt-log-overlay" id="dtLogOverlay">
      <div class="dt-log-modal">
        <div class="dt-log-header">
          <span class="dt-log-title" id="dtLogTitle">Logs</span>
          <button class="dt-btn dt-btn-icon" id="dtLogClose">&times;</button>
        </div>
        <div class="dt-log-body" id="dtLogBody"></div>
      </div>
    </div>
  `;
}
