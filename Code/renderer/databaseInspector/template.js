const ICON_PATHS = {
  database: '<ellipse cx="10" cy="4.5" rx="6.5" ry="2.5"/><path d="M3.5 4.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5"/><path d="M3.5 9.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5"/>',
  plus: '<path d="M10 4v12"/><path d="M4 10h12"/>',
  refresh: '<path d="M3 10a7 7 0 0 1 11.7-4.7"/><path d="M17 10a7 7 0 0 1-11.7 4.7"/><path d="M14.5 2v4h-4"/><path d="M5.5 18v-4h4"/>',
  close: '<path d="M5 5l10 10"/><path d="M15 5L5 15"/>',
  gear: '<circle cx="10" cy="10" r="3"/><path d="M10 1v2"/><path d="M10 17v2"/><path d="M1 10h2"/><path d="M17 10h2"/><path d="M3.93 3.93l1.41 1.41"/><path d="M14.66 14.66l1.41 1.41"/><path d="M3.93 16.07l1.41-1.41"/><path d="M14.66 5.34l1.41-1.41"/>',
  copy: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H13"/>',
  check: '<path d="M4 10l4 4 8-8"/>',
  play: '<path d="M6 4l10 6-10 6V4z"/>',
  trash: '<path d="M3 6h14"/><path d="M6 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M8 9v5"/><path d="M12 9v5"/><path d="M5 6l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/>',
  save: '<path d="M5 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M12 2v4h4"/><path d="M6 10h8"/><path d="M6 14h8"/>',
  edit: '<path d="M14 2l4 4-10 10H4v-4L14 2z"/>',
  plug: '<path d="M7 2v4"/><path d="M13 2v4"/><path d="M5 6h10v3a5 5 0 0 1-10 0V6z"/><path d="M10 14v4"/>',
  bolt: '<path d="M13 2L4 11h5l-2 7 9-9h-5l2-7z"/>',
  code: '<path d="M7 6l-4 4 4 4"/><path d="M13 6l4 4-4 4"/><path d="M11.5 4l-3 12"/>',
  clipboard: '<rect x="4" y="3.5" width="12" height="14" rx="1.5"/><path d="M7.5 3.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.5"/><path d="M7 9h6"/><path d="M7 12.5h4"/>',
  warning: '<path d="M10 3l8 14H2L10 3z"/><path d="M10 8v4"/><path d="M10 14.5v.5"/>',
  table: '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M3 8.5h14"/><path d="M8 8.5V16"/>',
  list: '<path d="M4 5h12"/><path d="M4 10h12"/><path d="M4 15h12"/>',
  filter: '<path d="M3 4h14l-5.5 6.5V16l-3-1.5v-4L3 4z"/>',
  range: '<path d="M10 3v14"/><path d="M6.5 6.5L10 3l3.5 3.5"/><path d="M6.5 13.5L10 17l3.5-3.5"/>',
  columns: '<rect x="3" y="3.5" width="14" height="13" rx="1.5"/><path d="M8 3.5v13"/><path d="M12.5 3.5v13"/>',
  hash: '<path d="M7.5 3L6 17"/><path d="M14 3l-1.5 14"/><path d="M4 7.5h13"/><path d="M3 12.5h13"/>',
  arrowLeft: '<path d="M16 10H4"/><path d="M9 5l-5 5 5 5"/>',
};

export function dbiIcon(name, extraClass) {
  const p = ICON_PATHS[name] || '';
  const cls = 'dbi-ico' + (extraClass ? ' ' + extraClass : '');
  return `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

export function connIconHtml(type) {
  const t = String(type || 'db').replace(/[^a-z0-9_-]/gi, '');
  return `<span class="dbi-conn-ico dbi-conn-${t}">${dbiIcon('database')}</span>`;
}

export function fmtCount(n) {
  return typeof n === 'number' && n >= 0 ? n.toLocaleString() : '\u2014';
}

export function getPanelTemplate() {
  return `
    <div class="dbi-panel" id="dbiPanel">
      <div class="dbi-header">
        <div class="dbi-header-left">
          <span class="dbi-header-icon">${dbiIcon('database')}</span>
          <span class="dbi-header-title">Database Inspector</span>
        </div>
        <div class="dbi-header-center">
          <select class="dbi-select" id="dbiConnectionSelect">
            <option value="">\u2014 No connection \u2014</option>
          </select>
          <button class="dbi-btn-icon dbi-manage-btn" id="dbiManageConnBtn" title="Manage Connections">${dbiIcon('gear')}</button>
        </div>
        <div class="dbi-header-right">
          <button class="dbi-btn" id="dbiNewScanBtn">${dbiIcon('plus')} New Scan</button>
          <button class="dbi-btn dbi-btn-secondary" id="dbiRefreshBtn">${dbiIcon('refresh')} Refresh</button>
          <button class="dbi-btn-icon" id="dbiCloseBtn" title="Close">${dbiIcon('close')}</button>
        </div>
      </div>

      <div class="dbi-body" id="dbiBody">
        <div class="dbi-welcome" id="dbiWelcome">
          <div class="dbi-welcome-icon">${dbiIcon('database')}</div>
          <div class="dbi-welcome-title">Database Inspector</div>
          <div class="dbi-welcome-desc">Connect to a database to scan and visualize its schema.</div>
          <div class="dbi-past-connections" id="dbiPastConnections"></div>
          <button class="dbi-btn dbi-btn-primary dbi-welcome-btn" id="dbiWelcomeScanBtn">${dbiIcon('plus')} New Scan</button>
        </div>

        <div class="dbi-layout" id="dbiLayout" style="display:none">
          <div class="dbi-panel-left" id="dbiPanelLeft">
            <div class="dbi-table-search">
              <input type="text" class="dbi-input" id="dbiTableSearch" placeholder="Filter tables\u2026" />
            </div>
            <div class="dbi-table-list" id="dbiTableList"></div>
          </div>
          <div class="dbi-drag-handle" id="dbiDragLeft"></div>
          <div class="dbi-panel-center" id="dbiPanelCenter">
            <div class="dbi-graph-container" id="dbiGraphContainer">
              <div class="dbi-graph-placeholder">Select a snapshot to view the schema graph</div>
            </div>
          </div>
          <div class="dbi-drag-handle" id="dbiDragRight"></div>
          <div class="dbi-panel-right" id="dbiPanelRight">
            <div class="dbi-right-tabs">
              <button class="dbi-tab active" data-tab="info">Table Info</button>
              <button class="dbi-tab" data-tab="query">Query</button>
              <button class="dbi-tab" data-tab="seed">Seed</button>
            </div>
            <div class="dbi-detail-placeholder" id="dbiDetailPlaceholder">
              <div class="dbi-detail-icon">${dbiIcon('table')}</div>
              <div class="dbi-detail-text">Click a table to see details</div>
            </div>
            <div class="dbi-detail-content" id="dbiDetailContent" style="display:none"></div>
            <div class="dbi-query-panel" id="dbiQueryPanel" style="display:none">
              <div class="qb-mode-toggle" id="qbModeToggle">
                <button class="qb-mode-btn active" data-mode="easy">${dbiIcon('bolt')} Easy Mode</button>
                <button class="qb-mode-btn" data-mode="sql">${dbiIcon('code')} SQL Mode</button>
              </div>
              <div class="dbi-query-builder" id="dbiQueryBuilder" style="display:none"></div>
              <textarea class="dbi-query-editor" id="dbiQueryEditor" spellcheck="false" placeholder="SELECT * FROM table_name LIMIT 100"></textarea>
              <div class="dbi-query-toolbar">
                <button class="dbi-btn dbi-btn-primary" id="dbiQueryRunBtn">${dbiIcon('play')} Run</button>
                <button class="dbi-btn" id="dbiQueryCopyBtn">${dbiIcon('copy')} Copy</button>
                <span class="dbi-query-status" id="dbiQueryStatus"></span>
              </div>
              <div class="dbi-query-results" id="dbiQueryResults"></div>
            </div>
            <div class="dbi-seed-panel" id="dbiSeedPanel" style="display:none">
              <div class="dbi-seed-header">
                <select class="dbi-select dbi-seed-select" id="dbiSeedSelect">
                  <option value="">\u2014 Select seed \u2014</option>
                </select>
                <button class="dbi-btn" id="dbiSeedNewBtn">${dbiIcon('plus')} New</button>
                <button class="dbi-btn dbi-btn-secondary" id="dbiSeedDeleteBtn" title="Delete seed" disabled>${dbiIcon('trash')}</button>
              </div>
              <textarea class="dbi-seed-editor" id="dbiSeedEditor" spellcheck="false" placeholder="INSERT INTO ..."></textarea>
              <div class="dbi-seed-toolbar">
                <button class="dbi-btn" id="dbiSeedSaveBtn">${dbiIcon('save')} Save Seed</button>
                <button class="dbi-btn dbi-btn-primary" id="dbiSeedRunBtn">${dbiIcon('play')} Run Seed</button>
                <button class="dbi-btn" id="dbiSeedCopyBtn">${dbiIcon('copy')} Copy</button>
                <span class="dbi-seed-status" id="dbiSeedStatus"></span>
              </div>
              <div class="dbi-seed-results" id="dbiSeedResults"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="dbi-diff-bar" id="dbiDiffBar" style="display:none"></div>
    </div>
  `;
}

export function getScanDialogHtml() {
  return `
    <div class="dbi-scan-overlay" id="dbiScanOverlay">
      <div class="dbi-scan-modal">
        <div class="dbi-scan-modal-header">
          <span class="dbi-scan-modal-title">New Database Scan</span>
          <button class="dbi-btn-icon dbi-scan-close" id="dbiScanClose" title="Close">${dbiIcon('close')}</button>
        </div>
        <div class="dbi-scan-modal-body">
          <div class="dbi-form-row">
            <label class="dbi-form-label">Connection</label>
            <div class="dbi-radio-group" id="dbiConnRadio">
              <label class="dbi-radio-label"><input type="radio" name="dbiConnType" value="new" checked /> New Connection</label>
              <label class="dbi-radio-label"><input type="radio" name="dbiConnType" value="saved" /> Saved Connection</label>
            </div>
          </div>

          <div id="dbiSavedConnSection" style="display:none">
            <div class="dbi-form-row">
              <label class="dbi-form-label">Saved</label>
              <select class="dbi-select dbi-select-block" id="dbiSavedConnSelect"></select>
            </div>
          </div>

          <div id="dbiNewConnSection">
            <div class="dbi-form-row" id="dbiConnNameRow">
              <label class="dbi-form-label">Name</label>
              <input type="text" class="dbi-input" id="dbiScanName" placeholder="My Database" />
            </div>
            <div class="dbi-form-row">
              <label class="dbi-form-label">Type</label>
              <select class="dbi-select dbi-select-block" id="dbiScanType">
                <option value="postgres">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="sqlite">SQLite</option>
                <option value="mongodb">MongoDB</option>
              </select>
            </div>
            <div class="dbi-form-row" id="dbiConnHostRow">
              <label class="dbi-form-label">Host</label>
              <input type="text" class="dbi-input" id="dbiScanHost" placeholder="localhost" />
            </div>
            <div class="dbi-form-row" id="dbiConnPortRow">
              <label class="dbi-form-label">Port</label>
              <input type="number" class="dbi-input" id="dbiScanPort" placeholder="5432" />
            </div>
            <div class="dbi-form-row" id="dbiConnDatabaseRow">
              <label class="dbi-form-label">Database</label>
              <input type="text" class="dbi-input" id="dbiScanDatabase" placeholder="database_name" />
            </div>
            <div class="dbi-form-row" id="dbiConnUserRow">
              <label class="dbi-form-label">Username</label>
              <input type="text" class="dbi-input" id="dbiScanUser" placeholder="username" />
            </div>
            <div class="dbi-form-row" id="dbiConnPasswordRow">
              <label class="dbi-form-label">Password</label>
              <input type="password" class="dbi-input" id="dbiScanPassword" placeholder="password" />
            </div>
            <div class="dbi-form-row" id="dbiSqliteRow" style="display:none">
              <label class="dbi-form-label">File Path</label>
              <div class="dbi-file-row">
                <input type="text" class="dbi-input" id="dbiScanFilePath" placeholder="C:\\path\\to\\database.db" />
                <button class="dbi-btn" id="dbiBrowseFileBtn">Browse</button>
              </div>
            </div>
            <div class="dbi-form-row" id="dbiMongoRow" style="display:none">
              <label class="dbi-form-label">Connection String</label>
              <input type="text" class="dbi-input" id="dbiScanConnStr" placeholder="mongodb://localhost:27017/mydb" />
            </div>
          </div>

          <div class="dbi-form-row">
            <label class="dbi-form-check">
              <input type="checkbox" id="dbiSaveConnCheck" checked />
              Save connection for later
            </label>
          </div>
        </div>
        <div class="dbi-scan-modal-footer">
          <span class="dbi-scan-status" id="dbiScanStatus"></span>
          <button class="dbi-btn dbi-btn-primary" id="dbiScanStartBtn">${dbiIcon('refresh')} Scan</button>
        </div>
      </div>
    </div>
  `;
}

export function getTableDetailHtml(details) {
  if (!details) return '<div class="dbi-detail-empty">No details available</div>';

  const colsHtml = details.columns.map(c => `
    <div class="dbi-detail-col">
      <span class="dbi-detail-col-name">${esc(c.name)}</span>
      <span class="dbi-detail-col-type">${esc(c.type)}</span>
      <span class="dbi-detail-col-flags">
        ${c.isPk ? '<span class="dbi-badge dbi-badge-pk">PK</span>' : ''}
        ${!c.nullable ? '<span class="dbi-badge dbi-badge-nn">NN</span>' : ''}
      </span>
    </div>
  `).join('');

  const idxHtml = details.indexes.map(i => `
    <div class="dbi-detail-idx">
      <span class="dbi-detail-idx-name">${esc(i.name)}</span>
      <span class="dbi-detail-idx-cols">(${i.columns.map(esc).join(', ')})</span>
      ${i.unique ? '<span class="dbi-badge dbi-badge-unique">UNIQUE</span>' : ''}
    </div>
  `).join('');

  const relHtml = details.relationships.map(r => `
    <div class="dbi-detail-rel">
      <span class="dbi-detail-rel-src">${esc(details.name)}.${esc(r.column)}</span>
      <span class="dbi-detail-rel-arrow">\u2192</span>
      <span class="dbi-detail-rel-tgt">${esc(r.targetTable)}.${esc(r.targetColumn)}</span>
    </div>
  `).join('');

  const refHtml = details.referencedBy.map(r => `
    <div class="dbi-detail-rel">
      <span class="dbi-detail-rel-src">${esc(r.table)}.${esc(r.column)}</span>
      <span class="dbi-detail-rel-arrow">\u2192</span>
      <span class="dbi-detail-rel-tgt">${esc(details.name)}</span>
    </div>
  `).join('');

  const rowsText = typeof details.rowCount === 'number' && details.rowCount >= 0
    ? `${details.rowCount.toLocaleString()} rows`
    : 'Row count not available';

  return `
    <div class="dbi-detail-section">
      <div class="dbi-detail-title-row">
        <div class="dbi-detail-title">${esc(details.name)}</div>
        <button class="dbi-btn-icon dbi-detail-copy-btn" data-copy-table="${esc(details.name)}" title="Copy table details">${dbiIcon('copy')}</button>
      </div>
      <div class="dbi-detail-meta">
        <span class="dbi-detail-rows">${rowsText}</span>
      </div>
    </div>
    <div class="dbi-detail-section">
      <div class="dbi-detail-subtitle">Columns</div>
      ${colsHtml || '<div class="dbi-detail-empty">No columns</div>'}
    </div>
    <div class="dbi-detail-section">
      <div class="dbi-detail-subtitle">Indexes</div>
      ${idxHtml || '<div class="dbi-detail-empty">No indexes</div>'}
    </div>
    <div class="dbi-detail-section">
      <div class="dbi-detail-subtitle">Relationships</div>
      ${relHtml || '<div class="dbi-detail-empty">No outgoing relationships</div>'}
    </div>
    <div class="dbi-detail-section">
      <div class="dbi-detail-subtitle">Referenced By</div>
      ${refHtml || '<div class="dbi-detail-empty">Not referenced by other tables</div>'}
    </div>
  `;
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function getConnectionManagerHtml() {
  return `
    <div class="dbi-manager-overlay" id="dbiManagerOverlay">
      <div class="dbi-manager-modal">
        <div class="dbi-manager-header">
          <span class="dbi-manager-title">Connection Manager</span>
          <button class="dbi-btn-icon" id="dbiManagerClose" title="Close">${dbiIcon('close')}</button>
        </div>
        <div class="dbi-manager-body" id="dbiManagerBody"></div>
      </div>
    </div>
  `;
}

export function getConnectionListHtml(connections) {
  if (!connections || !connections.length) {
    return '<div class="dbi-manager-empty">No saved connections</div>';
  }
  return connections.map(c => `
    <div class="dbi-manager-card" data-conn-id="${c.id}">
      <div class="dbi-manager-card-icon">${connIconHtml(c.type)}</div>
      <div class="dbi-manager-card-info">
        <div class="dbi-manager-card-name">${esc(c.name)}</div>
        <div class="dbi-manager-card-meta">
          ${esc(c.type)}${c.host ? ' &middot; ' + esc(c.host) : ''}${c.port ? ':' + c.port : ''}
          ${c.database ? ' &middot; ' + esc(c.database) : ''}
        </div>
        <div class="dbi-manager-card-date">Created ${c.created_at || 'N/A'}</div>
      </div>
      <div class="dbi-manager-card-actions">
        <button class="dbi-btn dbi-manager-edit-btn" data-conn-id="${c.id}">${dbiIcon('edit')} Edit</button>
        <button class="dbi-btn dbi-btn-secondary dbi-manager-delete-btn" data-conn-id="${c.id}">${dbiIcon('trash')} Delete</button>
      </div>
    </div>
  `).join('');
}

export function getConnectionEditHtml(conn) {
  return `
    <div class="dbi-manager-edit">
      <div class="dbi-manager-edit-title">Edit Connection</div>
      <div class="dbi-form-row">
        <label class="dbi-form-label">Name</label>
        <input type="text" class="dbi-input" id="dbiEditName" value="${esc(conn.name)}" />
      </div>
      <div class="dbi-form-row">
        <label class="dbi-form-label">Type</label>
        <input type="text" class="dbi-input" value="${esc(conn.type)}" disabled />
      </div>
      <div class="dbi-form-row" id="dbiEditHostRow">
        <label class="dbi-form-label">Host</label>
        <input type="text" class="dbi-input" id="dbiEditHost" value="${esc(conn.host || '')}" />
      </div>
      <div class="dbi-form-row" id="dbiEditPortRow">
        <label class="dbi-form-label">Port</label>
        <input type="number" class="dbi-input" id="dbiEditPort" value="${conn.port || ''}" />
      </div>
      <div class="dbi-form-row" id="dbiEditDbRow">
        <label class="dbi-form-label">Database</label>
        <input type="text" class="dbi-input" id="dbiEditDatabase" value="${esc(conn.database || '')}" />
      </div>
      <div class="dbi-form-row" id="dbiEditUserRow">
        <label class="dbi-form-label">Username</label>
        <input type="text" class="dbi-input" id="dbiEditUser" value="${esc(conn.username || '')}" />
      </div>
      <div class="dbi-form-row" id="dbiEditPasswordRow">
        <label class="dbi-form-label">Password</label>
        <input type="password" class="dbi-input" id="dbiEditPassword" placeholder="Leave blank to keep current" />
      </div>
      <div class="dbi-form-row" id="dbiEditFilePathRow" style="display:none">
        <label class="dbi-form-label">File Path</label>
        <div class="dbi-file-row">
          <input type="text" class="dbi-input" id="dbiEditFilePath" value="${esc(conn.file_path || '')}" />
          <button class="dbi-btn" id="dbiEditBrowseBtn">Browse</button>
        </div>
      </div>
      <div class="dbi-form-row" id="dbiEditConnStrRow" style="display:none">
        <label class="dbi-form-label">Connection String</label>
        <input type="text" class="dbi-input" id="dbiEditConnStr" value="${esc(conn.connection_string || '')}" />
      </div>
      <div class="dbi-manager-edit-actions">
        <button class="dbi-btn" id="dbiEditBackBtn">${dbiIcon('arrowLeft')} Back</button>
        <button class="dbi-btn dbi-btn-secondary" id="dbiEditTestBtn">${dbiIcon('plug')} Test</button>
        <button class="dbi-btn dbi-btn-primary" id="dbiEditSaveBtn">${dbiIcon('save')} Save</button>
      </div>
      <div class="dbi-manager-status" id="dbiManagerStatus"></div>
    </div>
  `;
}