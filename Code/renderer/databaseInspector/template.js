export function getPanelTemplate() {
  return `
    <div class="dbi-panel" id="dbiPanel">
      <div class="dbi-header">
        <div class="dbi-header-left">
          <span class="dbi-header-icon">🗃️</span>
          <span class="dbi-header-title">Database Inspector</span>
        </div>
        <div class="dbi-header-center">
          <select class="dbi-select" id="dbiConnectionSelect">
            <option value="">— No connection —</option>
          </select>
        </div>
        <div class="dbi-header-right">
          <button class="dbi-btn" id="dbiNewScanBtn">+ New Scan</button>
          <button class="dbi-btn dbi-btn-secondary" id="dbiRefreshBtn">⟳ Refresh</button>
          <button class="dbi-btn-icon" id="dbiCloseBtn">✕</button>
        </div>
      </div>

      <div class="dbi-body" id="dbiBody">
        <div class="dbi-welcome" id="dbiWelcome">
          <div class="dbi-welcome-icon">🗃️</div>
          <div class="dbi-welcome-title">Database Inspector</div>
          <div class="dbi-welcome-desc">Connect to a database to scan and visualize its schema.</div>
          <div class="dbi-past-connections" id="dbiPastConnections"></div>
          <button class="dbi-btn dbi-btn-primary dbi-welcome-btn" id="dbiWelcomeScanBtn">+ New Scan</button>
        </div>

        <div class="dbi-layout" id="dbiLayout" style="display:none">
          <div class="dbi-panel-left" id="dbiPanelLeft">
            <div class="dbi-table-search">
              <input type="text" class="dbi-input" id="dbiTableSearch" placeholder="Filter tables…" />
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
              <div class="dbi-detail-icon">📋</div>
              <div class="dbi-detail-text">Click a table to see details</div>
            </div>
            <div class="dbi-detail-content" id="dbiDetailContent" style="display:none"></div>
            <div class="dbi-query-panel" id="dbiQueryPanel" style="display:none">
              <textarea class="dbi-query-editor" id="dbiQueryEditor" spellcheck="false" placeholder="SELECT * FROM table_name LIMIT 100"></textarea>
              <div class="dbi-query-toolbar">
                <button class="dbi-btn dbi-btn-primary" id="dbiQueryRunBtn">▶ Run</button>
                <button class="dbi-btn" id="dbiQueryCopyBtn">📋 Copy</button>
                <span class="dbi-query-status" id="dbiQueryStatus"></span>
              </div>
              <div class="dbi-query-results" id="dbiQueryResults"></div>
            </div>
            <div class="dbi-seed-panel" id="dbiSeedPanel" style="display:none">
              <div class="dbi-seed-header">
                <select class="dbi-select dbi-seed-select" id="dbiSeedSelect">
                  <option value="">— Select seed —</option>
                </select>
                <button class="dbi-btn" id="dbiSeedNewBtn">+ New</button>
                <button class="dbi-btn dbi-btn-secondary" id="dbiSeedDeleteBtn" disabled>🗑</button>
              </div>
              <textarea class="dbi-seed-editor" id="dbiSeedEditor" spellcheck="false" placeholder="INSERT INTO ..."></textarea>
              <div class="dbi-seed-toolbar">
                <button class="dbi-btn" id="dbiSeedSaveBtn">💾 Save Seed</button>
                <button class="dbi-btn dbi-btn-primary" id="dbiSeedRunBtn">▶ Run Seed</button>
                <button class="dbi-btn" id="dbiSeedCopyBtn">📋 Copy</button>
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
          <button class="dbi-btn-icon dbi-scan-close" id="dbiScanClose">✕</button>
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
              <select class="dbi-select" id="dbiSavedConnSelect"></select>
            </div>
          </div>

          <div id="dbiNewConnSection">
            <div class="dbi-form-row">
              <label class="dbi-form-label">Name</label>
              <input type="text" class="dbi-input" id="dbiScanName" placeholder="My Database" />
            </div>
            <div class="dbi-form-row">
              <label class="dbi-form-label">Type</label>
              <select class="dbi-select" id="dbiScanType">
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
            <div class="dbi-form-row">
              <label class="dbi-form-label">Database</label>
              <input type="text" class="dbi-input" id="dbiScanDatabase" placeholder="database_name" />
            </div>
            <div class="dbi-form-row">
              <label class="dbi-form-label">Username</label>
              <input type="text" class="dbi-input" id="dbiScanUser" placeholder="username" />
            </div>
            <div class="dbi-form-row">
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
          <button class="dbi-btn dbi-btn-primary" id="dbiScanStartBtn">⟳ Scan</button>
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
      <span class="dbi-detail-rel-arrow">→</span>
      <span class="dbi-detail-rel-tgt">${esc(r.targetTable)}.${esc(r.targetColumn)}</span>
    </div>
  `).join('');

  const refHtml = details.referencedBy.map(r => `
    <div class="dbi-detail-rel">
      <span class="dbi-detail-rel-src">${esc(r.table)}.${esc(r.column)}</span>
      <span class="dbi-detail-rel-arrow">→</span>
      <span class="dbi-detail-rel-tgt">${esc(details.name)}</span>
    </div>
  `).join('');

  return `
    <div class="dbi-detail-section">
      <div class="dbi-detail-title-row">
        <div class="dbi-detail-title">${esc(details.name)}</div>
        <button class="dbi-btn-icon dbi-detail-copy-btn" data-copy-table="${esc(details.name)}" title="Copy table details">📋</button>
      </div>
      <div class="dbi-detail-meta">
        <span class="dbi-detail-rows">${details.rowCount.toLocaleString()} rows</span>
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
