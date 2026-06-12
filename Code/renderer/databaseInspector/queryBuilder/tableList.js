import { state, setState } from './state.js';

export function render(container) {
  container.innerHTML = `
    <div class="qb-step-title">Select a table</div>
    <div class="qb-table-search">
      <input type="text" class="qb-input" id="qbTableSearch" placeholder="Search tables\u2026" />
    </div>
    <div class="qb-table-list" id="qbTableList">
      ${state.tables.length === 0 ? '<div class="qb-empty">No tables available</div>' : ''}
    </div>
  `;

  const searchInput = container.querySelector('#qbTableSearch');
  const listEl = container.querySelector('#qbTableList');

  renderTableList(listEl, state.tables, '');

  searchInput.addEventListener('input', () => {
    renderTableList(listEl, state.tables, searchInput.value);
  });

  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.qb-table-row');
    if (row) {
      setState({
        selectedTable: row.dataset.table,
        step: 'type',
        columns: [],
        selectedType: null,
        form: {},
        conditions: { column: '', operator: '=', value: '' },
        rangeFrom: '',
        rangeTo: '',
        selectedColumns: [],
        orderBy: '',
        builtQuery: '',
      });
      _loadColumns(row.dataset.table);
    }
  });
}

async function _loadColumns(tableName) {
  const table = state.tables.find(t => t.name === tableName);
  if (table && table.columns && table.columns.length > 0) {
    setState({ columns: table.columns });
    return;
  }
  try {
    const details = await window.electronAPI.dbInspector.getTableDetails(state.snapshotId, tableName);
    if (details && details.columns) {
      setState({ columns: details.columns });
      const idx = state.tables.findIndex(t => t.name === tableName);
      if (idx >= 0) {
        state.tables[idx].columns = details.columns;
      }
    }
  } catch (_) {}
}

function renderTableList(listEl, tables, query) {
  if (!tables || tables.length === 0) {
    listEl.innerHTML = '<div class="qb-empty">No tables loaded — scan a database first</div>';
    return;
  }
  const q = query.toLowerCase().trim();
  const filtered = q ? tables.filter(t => t.name.toLowerCase().includes(q)) : tables;
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="qb-empty">No matching tables</div>';
    return;
  }
  listEl.innerHTML = filtered.map(t => `
    <div class="qb-table-row" data-table="${esc(t.name)}">
      <span class="qb-table-row-name">${esc(t.name)}</span>
      <span class="qb-table-row-count">${(t.rowCount || 0).toLocaleString()} rows</span>
    </div>
  `).join('');
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
