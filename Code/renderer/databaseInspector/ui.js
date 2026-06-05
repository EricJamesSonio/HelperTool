import { state, setState } from './state.js';
import { getPanelTemplate, getScanDialogHtml, getTableDetailHtml, getConnectionManagerHtml, getConnectionListHtml, getConnectionEditHtml } from './template.js';
import { openScannerModal } from './scanner.js';
import { renderDetails } from './detailsPanel.js';
import { initGraph, updateGraph } from './graph-bundle.js';
import { getTableColor } from './colors.js';
import { confirmDialog } from '../utils/confirmDialog.js';

let _panel = null;
let _graphRoot = null;
let _lastQueryColumns = null;
let _lastQueryRows = null;
let _lastSeedColumns = null;
let _lastSeedRows = null;

export function createPanel() {
  const wrapper = document.createElement('div');
  wrapper.id = 'databaseInspectorWrapper';
  wrapper.innerHTML = getPanelTemplate();
  document.body.appendChild(wrapper);
  _panel = wrapper.querySelector('#dbiPanel');

  window.__dbiSelectTable = (tableName) => selectTable(tableName);

  const connCenter = wrapper.querySelector('.dbi-header-center');
  if (connCenter) {
    const gear = document.createElement('button');
    gear.id = 'dbiManageConnBtn';
    gear.className = 'dbi-btn-icon dbi-manage-btn';
    gear.title = 'Manage Connections';
    gear.textContent = '⚙️';
    connCenter.appendChild(gear);
  }

  setupEventListeners(wrapper);

  return wrapper;
}

export function destroyPanel() {
  if (_panel) {
    const wrapper = _panel.closest('#databaseInspectorWrapper');
    if (wrapper) wrapper.remove();
  }
  _panel = null;
  _graphRoot = null;
}

function setupEventListeners(wrapper) {
  wrapper.querySelector('#dbiCloseBtn').addEventListener('click', () => {
    const ev = new CustomEvent('dbi-close');
    document.dispatchEvent(ev);
  });

  wrapper.querySelector('#dbiNewScanBtn').addEventListener('click', () => openScanDialog());
  wrapper.querySelector('#dbiWelcomeScanBtn').addEventListener('click', () => openScanDialog());

  wrapper.querySelector('#dbiRefreshBtn').addEventListener('click', () => refreshCurrent());

  wrapper.querySelector('#dbiConnectionSelect').addEventListener('change', (e) => {
    const connId = e.target.value;
    if (connId) loadSnapshots(connId);
  });

  wrapper.querySelector('#dbiManageConnBtn')?.addEventListener('click', () => openConnectionManager());

  // Past connection click
  wrapper.querySelector('#dbiPastConnections').addEventListener('click', (e) => {
    const item = e.target.closest('.dbi-past-item');
    if (item) {
      const connId = item.dataset.connId;
      loadSnapshots(connId);
    }
  });

  wrapper.querySelector('#dbiTableSearch').addEventListener('input', (e) => {
    filterTableList(e.target.value);
  });

  wrapper.querySelector('#dbiTableList').addEventListener('click', (e) => {
    const row = e.target.closest('.dbi-table-row');
    if (row) {
      const tableName = row.dataset.table;
      selectTable(tableName);
      switchTab('info');
    }
  });

  // Tab switching
  wrapper.querySelectorAll('.dbi-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Copy table details
  wrapper.querySelector('#dbiDetailContent').addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.dbi-detail-copy-btn');
    if (copyBtn) copyTableDetails(copyBtn);
  });

  // Query tool
  wrapper.querySelector('#dbiQueryRunBtn').addEventListener('click', () => runQuery());
  wrapper.querySelector('#dbiQueryCopyBtn').addEventListener('click', () => copyResults('query'));
  wrapper.querySelector('#dbiQueryEditor').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runQuery();
    }
  });

  // Seed tool
  wrapper.querySelector('#dbiSeedSelect').addEventListener('change', (e) => {
    selectSeed(e.target.value);
  });

  wrapper.querySelector('#dbiSeedNewBtn').addEventListener('click', () => newSeed());

  wrapper.querySelector('#dbiSeedDeleteBtn').addEventListener('click', () => deleteCurrentSeed());

  wrapper.querySelector('#dbiSeedSaveBtn').addEventListener('click', () => saveCurrentSeed());

  wrapper.querySelector('#dbiSeedRunBtn').addEventListener('click', () => runSeed());

  wrapper.querySelector('#dbiSeedCopyBtn').addEventListener('click', () => copyResults('seed'));

  wrapper.querySelector('#dbiSeedEditor').addEventListener('input', () => {
    setState({ seedDirty: true });
  });

  // Diff bar close
  wrapper.querySelector('#dbiDiffBar')?.addEventListener('click', () => {
    wrapper.querySelector('#dbiDiffBar').style.display = 'none';
  });

  // Drag handles for resizable panels
  setupDragHandle(wrapper, '#dbiDragLeft', 0, 1);
  setupDragHandle(wrapper, '#dbiDragRight', 4, -1);
}

function setupDragHandle(wrapper, handleId, colIndex, dir) {
  const handle = wrapper.querySelector(handleId);
  if (!handle) return;
  const layout = wrapper.querySelector('#dbiLayout');
  let startX = 0;
  let startCol = 0;
  let baseCols = null;

  const onMouseDown = (e) => {
    e.preventDefault();
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const inline = layout.style.gridTemplateColumns;
    baseCols = inline ? inline.split(/\s+/) : ['260px', '4px', '1fr', '4px', '340px'];

    const computed = getComputedStyle(layout).gridTemplateColumns.split(/\s+/);
    startCol = parseFloat(computed[colIndex]);
    startX = e.clientX;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e) => {
    const dx = e.clientX - startX;
    const newSize = Math.max(120, startCol + dir * dx);
    const cols = [...baseCols];
    cols[colIndex] = newSize + 'px';
    layout.style.gridTemplateColumns = cols.join(' ');
  };

  const onMouseUp = () => {
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const cols = layout.style.gridTemplateColumns;
    if (cols) _saveLayout(cols);
    baseCols = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  handle.addEventListener('mousedown', onMouseDown);
}

async function openScanDialog() {
  const result = await openScannerModal();
  if (!result) return;

  // Run scan
  const statusEl = document.querySelector('#dbiScanStatus');
  if (statusEl) statusEl.textContent = 'Scanning…';

  try {
    const scanResult = await window.electronAPI.dbInspector.scan(result.connection);
    if (scanResult.success) {
      setState({
        currentConnectionId: result.connection.id,
        currentSnapshotId: scanResult.snapshotId,
        graphData: scanResult.graphData,
        diffData: null,
      });

      // Save connection if requested
      if (result.saveConnection && result.connection.id) {
        await window.electronAPI.dbInspector.saveConnection(result.connection);
      }

      await refreshConnections();
      await showLayout(scanResult);
      await loadSeeds();
      _savePanelState();
      closeScanDialog();
    } else {
      if (statusEl) statusEl.textContent = 'Error: ' + scanResult.error;
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Error: ' + err.message;
  }
}

export async function refreshConnections() {
  const select = _panel?.querySelector('#dbiConnectionSelect');
  if (!select) return;
  try {
    const conns = await window.electronAPI.dbInspector.listConnections();
    setState({ connections: conns });
    const currentId = state.currentConnectionId;
    select.innerHTML = '<option value="">— No connection —</option>' +
      conns.map(c => `<option value="${c.id}" ${c.id === currentId ? 'selected' : ''}>${esc(c.name)} (${c.type})</option>`).join('');

    // Populate welcome screen past connections
    const pastList = _panel?.querySelector('#dbiPastConnections');
    if (pastList) {
      if (conns.length === 0) {
        pastList.innerHTML = '';
      } else {
        pastList.innerHTML = '<div class="dbi-past-title">Recent Connections</div>' +
          conns.map(c => `
            <div class="dbi-past-item" data-conn-id="${c.id}">
              <span class="dbi-past-item-icon">${c.type === 'postgres' ? '🐘' : c.type === 'mysql' ? '🐬' : c.type === 'sqlite' ? '🗄️' : '🍃'}</span>
              <span class="dbi-past-item-name">${esc(c.name)}</span>
              <span class="dbi-past-item-type">${esc(c.type)}</span>
            </div>
          `).join('');
      }
    }
  } catch (_) {}
}

async function loadSnapshots(connectionId) {
  try {
    const snapshots = await window.electronAPI.dbInspector.getSnapshots(connectionId);
    setState({ snapshots, currentConnectionId: connectionId });
    if (snapshots.length > 0) {
      const latest = snapshots[0];
      await loadSnapshot(latest.id);
    }
    _savePanelState();
  } catch (_) {}
}

async function loadSnapshot(snapshotId) {
  try {
    const graphData = await window.electronAPI.dbInspector.getGraphData(snapshotId);
    setState({ currentSnapshotId: snapshotId, graphData, selectedTable: null, selectedTableDetails: null });
    updateGraphView(graphData);
    populateTableList(graphData.nodes);
    hideWelcome();
    await loadSeeds();
    _savePanelState();
  } catch (_) {}
}

async function refreshCurrent() {
  if (!state.currentSnapshotId) return;
  const btn = _panel?.querySelector('#dbiRefreshBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⟳ Refreshing…'; }
  try {
    const result = await window.electronAPI.dbInspector.refreshSnapshot(state.currentSnapshotId);
    if (result.success) {
      setState({ currentSnapshotId: result.snapshotId, graphData: result.graphData, diffData: result.diff || null });
      updateGraphView(result.graphData);
      populateTableList(result.graphData.nodes);
      if (result.diff) showDiff(result.diff);
      if (state.selectedTable) selectTable(state.selectedTable);
      await loadSeeds();
      _savePanelState();
    } else {
      console.error('[DBI] Refresh failed:', result.error);
      const status = _panel?.querySelector('#dbiDiffBar');
      if (status) {
        status.innerHTML = `<span style="color:var(--red,#f87171)">Refresh failed: ${esc(result.error)}</span> <span class="dbi-diff-dismiss">✕</span>`;
        status.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error('[DBI] Refresh failed:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⟳ Refresh'; }
  }
}

function updateGraphView(graphData) {
  const container = _panel?.querySelector('#dbiGraphContainer');
  if (!container) return;

  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    container.innerHTML = '<div class="dbi-graph-placeholder">No tables found</div>';
    _graphRoot = null;
    return;
  }

  if (!_graphRoot) {
    _graphRoot = initGraph(container, graphData);
  } else {
    updateGraph(_graphRoot, graphData);
  }
}

function populateTableList(nodes) {
  const list = _panel?.querySelector('#dbiTableList');
  if (!list) return;
  if (!nodes || nodes.length === 0) {
    list.innerHTML = '<div class="dbi-table-empty">No tables</div>';
    return;
  }
  list.innerHTML = nodes
    .sort((a, b) => a.data.label.localeCompare(b.data.label))
    .map(n => {
      const color = getTableColor(n.data.colorIndex || 0);
      return `
      <div class="dbi-table-row" data-table="${esc(n.data.label)}">
        <span class="dbi-table-row-color" style="background:${color.bg}"></span>
        <span class="dbi-table-row-name">${esc(n.data.label)}</span>
        <span class="dbi-table-row-count">${(n.data.rowCount || 0).toLocaleString()}</span>
      </div>`;
    }).join('');
}

function filterTableList(query) {
  const rows = _panel?.querySelectorAll('.dbi-table-row');
  if (!rows) return;
  const q = query.toLowerCase();
  rows.forEach(row => {
    const name = row.dataset.table.toLowerCase();
    row.style.display = name.includes(q) ? '' : 'none';
  });
}

async function selectTable(tableName) {
  if (!state.currentSnapshotId || !tableName) return;
  setState({ selectedTable: tableName });
  try {
    const details = await window.electronAPI.dbInspector.getTableDetails(state.currentSnapshotId, tableName);
    setState({ selectedTableDetails: details });
    renderDetails(details);

    // Highlight in table list
    _panel?.querySelectorAll('.dbi-table-row').forEach(r => r.classList.toggle('active', r.dataset.table === tableName));

    // Highlight and center node in graph
    if (_graphRoot && window.__dbiCenterNode) {
      window.__dbiCenterNode(tableName);
    }
  } catch (err) {
    console.error('[DBI] Failed to load table details:', err);
  }
}

function showDiff(diff) {
  const bar = _panel?.querySelector('#dbiDiffBar');
  if (!bar) return;
  const parts = [];
  if (diff.added?.length) parts.push(`<span class="dbi-diff-added">+${diff.added.length} added</span>`);
  if (diff.removed?.length) parts.push(`<span class="dbi-diff-removed">-${diff.removed.length} removed</span>`);
  if (diff.changed?.length) parts.push(`<span class="dbi-diff-changed">~${diff.changed.length} changed</span>`);
  bar.innerHTML = 'Schema changes: ' + parts.join(' ') + ' <span class="dbi-diff-dismiss">✕</span>';
  bar.style.display = 'flex';
}

function hideWelcome() {
  const welcome = _panel?.querySelector('#dbiWelcome');
  const layout = _panel?.querySelector('#dbiLayout');
  if (welcome) welcome.style.display = 'none';
  if (layout) layout.style.display = '';
}

function showLayout(result) {
  hideWelcome();
  const graphData = result.graphData || { nodes: [], edges: [] };
  updateGraphView(graphData);
  populateTableList(graphData.nodes);
}

function closeScanDialog() {
  const overlay = document.querySelector('#dbiScanOverlay');
  if (overlay) overlay.remove();
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function switchTab(tab) {
  const panel = _panel;
  if (!panel) return;
  panel.querySelectorAll('.dbi-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  panel.querySelector('#dbiDetailPlaceholder').style.display = tab === 'info' ? '' : 'none';
  panel.querySelector('#dbiDetailContent').style.display = tab === 'info' ? '' : 'none';
  panel.querySelector('#dbiQueryPanel').style.display = tab === 'query' ? 'flex' : 'none';
  panel.querySelector('#dbiSeedPanel').style.display = tab === 'seed' ? 'flex' : 'none';
  _savePanelState();
}

async function runQuery() {
  if (!state.currentSnapshotId) {
    setQueryStatus('No active snapshot', true);
    return;
  }
  const editor = _panel?.querySelector('#dbiQueryEditor');
  const resultsEl = _panel?.querySelector('#dbiQueryResults');
  if (!editor || !resultsEl) return;
  const query = editor.value.trim();
  if (!query) { setQueryStatus('Enter a query', true); return; }

  setQueryStatus('Running…', false);
  resultsEl.innerHTML = '';

  try {
    const res = await window.electronAPI.dbInspector.executeQuery({ snapshotId: state.currentSnapshotId, query });
    if (res.success) {
      _lastQueryColumns = res.columns || null;
      _lastQueryRows = res.rows || null;
      if (res.rows && res.rows.length > 0) {
        renderQueryResults(resultsEl, res.columns, res.rows);
        setQueryStatus(`${res.rows.length} row(s) returned`, false);
      } else if (res.affectedCount !== undefined) {
        setQueryStatus(`${res.affectedCount} row(s) affected`, false);
        resultsEl.innerHTML = `<div class="dbi-query-info">Query executed successfully. ${res.affectedCount} row(s) affected.</div>`;
      } else {
        setQueryStatus('Query executed successfully', false);
        resultsEl.innerHTML = '<div class="dbi-query-info">Query executed successfully.</div>';
      }
    } else {
      setQueryStatus('Error', true);
      resultsEl.innerHTML = `<div class="dbi-query-error">${esc(res.error)}</div>`;
    }
  } catch (err) {
    setQueryStatus('Error', true);
    resultsEl.innerHTML = `<div class="dbi-query-error">${esc(err.message)}</div>`;
  }
}

function renderQueryResults(container, columns, rows) {
  const table = document.createElement('table');
  table.className = 'dbi-query-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = col;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const val of row) {
      const td = document.createElement('td');
      td.textContent = val == null ? 'NULL' : String(val);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}

function setQueryStatus(msg, isError) {
  const el = _panel?.querySelector('#dbiQueryStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--red, #f87171)' : 'var(--text-muted, #94a3c4)';
}

function copyTableDetails(btn) {
  const details = state.selectedTableDetails;
  if (!details) return;

  const lines = [];
  lines.push(`Table: ${details.name}`);
  lines.push(`Rows:  ${details.rowCount.toLocaleString()}`);
  lines.push('');

  if (details.columns.length > 0) {
    lines.push('Columns:');
    for (const c of details.columns) {
      const flags = [];
      if (c.isPk) flags.push('PK');
      if (!c.nullable) flags.push('NN');
      lines.push(`  ${c.name}  ${c.type}${flags.length ? ' [' + flags.join(', ') + ']' : ''}`);
    }
    lines.push('');
  }

  if (details.indexes.length > 0) {
    lines.push('Indexes:');
    for (const i of details.indexes) {
      lines.push(`  ${i.name} (${i.columns.join(', ')})${i.unique ? ' UNIQUE' : ''}`);
    }
    lines.push('');
  }

  if (details.relationships.length > 0) {
    lines.push('Relationships (outgoing):');
    for (const r of details.relationships) {
      lines.push(`  ${details.name}.${r.column} → ${r.targetTable}.${r.targetColumn}`);
    }
    lines.push('');
  }

  if (details.referencedBy.length > 0) {
    lines.push('Relationships (incoming):');
    for (const r of details.referencedBy) {
      lines.push(`  ${r.table}.${r.column} → ${details.name}`);
    }
    lines.push('');
  }

  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    btn.classList.add('copied');
    btn.textContent = '✓';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.textContent = '📋';
    }, 1500);
  }).catch(() => {});
}

// ── Seed Scripts ────────────────────────────────────────────

async function loadSeeds() {
  if (!state.currentSnapshotId) {
    const select = _panel?.querySelector('#dbiSeedSelect');
    if (select) { select.innerHTML = '<option value="">— Select seed —</option>'; }
    return;
  }
  try {
    const res = await window.electronAPI.dbInspector.listSeeds(state.currentSnapshotId);
    if (!res.success) return;
    setState({ seeds: res.seeds, selectedSeed: null });
    const select = _panel?.querySelector('#dbiSeedSelect');
    if (!select) return;
    const currentId = state.selectedSeed?.id;
    select.innerHTML = '<option value="">— Select seed —</option>' +
      res.seeds.map(s => `<option value="${s.id}" ${s.id === currentId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    _panel.querySelector('#dbiSeedEditor').value = '';
    _panel.querySelector('#dbiSeedResults').innerHTML = '';
    _panel.querySelector('#dbiSeedStatus').textContent = '';
    _panel.querySelector('#dbiSeedDeleteBtn').disabled = true;
  } catch (_) {}
}

function newSeed() {
  const select = _panel?.querySelector('#dbiSeedSelect');
  if (!select) return;
  select.value = '';
  setState({ selectedSeed: null, seedDirty: false });
  _panel.querySelector('#dbiSeedEditor').value = '';
  _panel.querySelector('#dbiSeedResults').innerHTML = '';
  _panel.querySelector('#dbiSeedStatus').textContent = '';
  _panel.querySelector('#dbiSeedDeleteBtn').disabled = true;
  _panel.querySelector('#dbiSeedEditor').focus();
}

function selectSeed(seedId) {
  if (!seedId) { newSeed(); return; }
  const seed = state.seeds.find(s => s.id === seedId);
  if (!seed) return;
  setState({ selectedSeed: seed, seedDirty: false });
  _panel.querySelector('#dbiSeedEditor').value = seed.sqlContent;
  _panel.querySelector('#dbiSeedResults').innerHTML = '';
  _panel.querySelector('#dbiSeedStatus').textContent = '';
  _panel.querySelector('#dbiSeedDeleteBtn').disabled = false;
}

async function saveCurrentSeed() {
  const editor = _panel?.querySelector('#dbiSeedEditor');
  if (!editor) return;
  const sqlContent = editor.value.trim();
  if (!sqlContent) {
    setSeedStatus('Nothing to save — editor is empty', true);
    return;
  }

  // Prompt for name
  const currentName = state.selectedSeed?.name || '';
  const name = prompt('Seed name:', currentName);
  if (!name || !name.trim()) return;

  try {
    const data = {
      snapshotId: state.currentSnapshotId,
      name: name.trim(),
      sqlContent,
    };
    if (state.selectedSeed?.id) data.id = state.selectedSeed.id;

    const res = await window.electronAPI.dbInspector.saveSeed(data);
    if (res.success) {
      setSeedStatus('Saved', false);
      setState({ seedDirty: false });
      await loadSeeds();
      // Re-select the saved seed
      const select = _panel?.querySelector('#dbiSeedSelect');
      if (select && res.id) {
        select.value = res.id;
        selectSeed(res.id);
      }
    } else {
      setSeedStatus('Error: ' + res.error, true);
    }
  } catch (err) {
    setSeedStatus('Error: ' + err.message, true);
  }
}

async function deleteCurrentSeed() {
  const seed = state.selectedSeed;
  if (!seed) return;
  const ok = await confirmDialog(`Delete seed "${seed.name}"?`);
  if (!ok) return;

  try {
    const res = await window.electronAPI.dbInspector.deleteSeed(seed.id);
    if (res.success) {
      setSeedStatus('Deleted', false);
      await loadSeeds();
    } else {
      setSeedStatus('Error: ' + res.error, true);
    }
  } catch (err) {
    setSeedStatus('Error: ' + err.message, true);
  }
}

async function runSeed() {
  const editor = _panel?.querySelector('#dbiSeedEditor');
  const resultsEl = _panel?.querySelector('#dbiSeedResults');
  if (!editor || !resultsEl) return;
  const query = editor.value.trim();
  if (!query) { setSeedStatus('Enter a query', true); return; }
  if (!state.currentSnapshotId) { setSeedStatus('No active snapshot', true); return; }

  const ok = await confirmDialog('Are you sure you want to run this seed?');
  if (!ok) return;

  setSeedStatus('Running…', false);
  resultsEl.innerHTML = '';

  try {
    const res = await window.electronAPI.dbInspector.executeQuery({ snapshotId: state.currentSnapshotId, query });
    if (res.success) {
      _lastSeedColumns = res.columns || null;
      _lastSeedRows = res.rows || null;
      if (res.rows && res.rows.length > 0) {
        renderQueryResults(resultsEl, res.columns, res.rows);
        setSeedStatus(`${res.rows.length} row(s) returned`, false);
      } else if (res.affectedCount !== undefined) {
        setSeedStatus(`${res.affectedCount} row(s) affected`, false);
        resultsEl.innerHTML = `<div class="dbi-query-info">Seed executed. ${res.affectedCount} row(s) affected.</div>`;
      } else {
        setSeedStatus('Executed successfully', false);
        resultsEl.innerHTML = '<div class="dbi-query-info">Seed executed successfully.</div>';
      }
    } else {
      setSeedStatus('Error', true);
      resultsEl.innerHTML = `<div class="dbi-query-error">${esc(res.error)}</div>`;
    }
  } catch (err) {
    setSeedStatus('Error', true);
    resultsEl.innerHTML = `<div class="dbi-query-error">${esc(err.message)}</div>`;
  }
}

function setSeedStatus(msg, isError) {
  const el = _panel?.querySelector('#dbiSeedStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--red, #f87171)' : 'var(--text-muted, #94a3c4)';
}

function copyResults(source) {
  const columns = source === 'query' ? _lastQueryColumns : _lastSeedColumns;
  const rows = source === 'query' ? _lastQueryRows : _lastSeedRows;
  if (!columns || !rows || rows.length === 0) {
    const btn = _panel?.querySelector(source === 'query' ? '#dbiQueryCopyBtn' : '#dbiSeedCopyBtn');
    if (btn) { btn.textContent = '⚠'; setTimeout(() => { btn.textContent = '📋 Copy'; }, 1200); }
    return;
  }

  const lines = [columns.join('\t')];
  for (const row of rows) {
    lines.push(row.map(v => v == null ? 'NULL' : String(v)).join('\t'));
  }

  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const btn = _panel?.querySelector(source === 'query' ? '#dbiQueryCopyBtn' : '#dbiSeedCopyBtn');
    if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500); }
  }).catch(() => {});
}

// ── Persistence ──────────────────────────────────────────────

function _saveLayout(gridCols) {
  try { localStorage.setItem('dbi_grid_cols', gridCols); } catch (_) {}
}

function _savePanelState() {
  try {
    const data = {
      connectionId: state.currentConnectionId || '',
      snapshotId: state.currentSnapshotId || '',
      activeTab: _panel?.querySelector('.dbi-tab.active')?.dataset?.tab || 'info',
    };
    localStorage.setItem('dbi_panel_state', JSON.stringify(data));
  } catch (_) {}
}

// ── Connection Manager ────────────────────────────────────────

async function openConnectionManager() {
  const existing = document.getElementById('dbiManagerOverlay');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = getConnectionManagerHtml();
  document.body.appendChild(wrapper);

  const overlay = wrapper.firstElementChild;
  const body = overlay.querySelector('#dbiManagerBody');
  const closeBtn = overlay.querySelector('#dbiManagerClose');

  const close = () => { overlay.remove(); };

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const conns = await window.electronAPI.dbInspector.listConnections();
  body.innerHTML = getConnectionListHtml(conns);

  body.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.dbi-manager-edit-btn');
    const deleteBtn = e.target.closest('.dbi-manager-delete-btn');
    if (editBtn) {
      const connId = editBtn.dataset.connId;
      openConnectionEdit(connId, body, close);
    } else if (deleteBtn) {
      const connId = deleteBtn.dataset.connId;
      await deleteConnection(connId, body);
    }
  });
}

async function openConnectionEdit(connId, body, closeManager) {
  const conns = await window.electronAPI.dbInspector.listConnections();
  const conn = conns.find(c => c.id === connId);
  if (!conn) { body.innerHTML = '<div class="dbi-manager-empty">Connection not found</div>'; return; }

  body.innerHTML = getConnectionEditHtml(conn);

  const isSqlite = conn.type === 'sqlite';
  const isMongo = conn.type === 'mongodb';

  body.querySelector('#dbiEditHostRow').style.display = (isSqlite || isMongo) ? 'none' : '';
  body.querySelector('#dbiEditPortRow').style.display = (isSqlite || isMongo) ? 'none' : '';
  body.querySelector('#dbiEditDbRow').style.display = isSqlite ? 'none' : '';
  body.querySelector('#dbiEditUserRow').style.display = isSqlite ? 'none' : '';
  body.querySelector('#dbiEditPasswordRow').style.display = isSqlite ? 'none' : '';
  body.querySelector('#dbiEditFilePathRow').style.display = isSqlite ? '' : 'none';
  body.querySelector('#dbiEditConnStrRow').style.display = isMongo ? '' : 'none';

  body.querySelector('#dbiEditBrowseBtn')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db,.sqlite,.sqlite3';
    input.addEventListener('change', () => {
      if (input.files[0]) {
        body.querySelector('#dbiEditFilePath').value = input.files[0].path;
      }
    });
    input.click();
  });

  body.querySelector('#dbiEditBackBtn').addEventListener('click', async () => {
    const conns = await window.electronAPI.dbInspector.listConnections();
    body.innerHTML = getConnectionListHtml(conns);
  });

  body.querySelector('#dbiEditTestBtn').addEventListener('click', async () => {
    const statusEl = body.querySelector('#dbiManagerStatus');
    statusEl.textContent = 'Testing…';
    const updated = collectEditForm(conn);
    try {
      const res = await window.electronAPI.dbInspector.testConnection(updated);
      statusEl.textContent = res.success ? 'Connected successfully' : 'Failed: ' + res.error;
      statusEl.style.color = res.success ? 'var(--green, #34d399)' : 'var(--red, #f87171)';
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.style.color = 'var(--red, #f87171)';
    }
  });

  body.querySelector('#dbiEditSaveBtn').addEventListener('click', async () => {
    const statusEl = body.querySelector('#dbiManagerStatus');
    const updated = collectEditForm(conn);
    try {
      const res = await window.electronAPI.dbInspector.saveConnection(updated);
      if (res.success) {
        statusEl.textContent = 'Saved';
        statusEl.style.color = 'var(--green, #34d399)';
        await refreshConnections();
        const conns = await window.electronAPI.dbInspector.listConnections();
        body.innerHTML = getConnectionListHtml(conns);
      } else {
        statusEl.textContent = 'Error: ' + res.error;
        statusEl.style.color = 'var(--red, #f87171)';
      }
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.style.color = 'var(--red, #f87171)';
    }
  });
}

function collectEditForm(origConn) {
  return {
    id: origConn.id,
    name: document.getElementById('dbiEditName')?.value?.trim() || origConn.name,
    type: origConn.type,
    host: document.getElementById('dbiEditHost')?.value?.trim() || null,
    port: parseInt(document.getElementById('dbiEditPort')?.value, 10) || null,
    database: document.getElementById('dbiEditDatabase')?.value?.trim() || null,
    username: document.getElementById('dbiEditUser')?.value?.trim() || null,
    password: document.getElementById('dbiEditPassword')?.value || null,
    encrypted_password: document.getElementById('dbiEditPassword')?.value ? null : origConn.encrypted_password,
    file_path: document.getElementById('dbiEditFilePath')?.value?.trim() || null,
    connection_string: document.getElementById('dbiEditConnStr')?.value?.trim() || null,
  };
}

async function deleteConnection(connId, body) {
  const conns = await window.electronAPI.dbInspector.listConnections();
  const conn = conns.find(c => c.id === connId);
  if (!conn) return;
  const ok = await confirmDialog(`Delete connection "${conn.name}"? This will also remove all its snapshots.`);
  if (!ok) return;
  try {
    await window.electronAPI.dbInspector.deleteConnection(connId);
    await refreshConnections();
    const updated = await window.electronAPI.dbInspector.listConnections();
    body.innerHTML = getConnectionListHtml(updated);
  } catch (err) {
    body.innerHTML += `<div class="dbi-manager-status" style="color:var(--red,#f87171)">Error: ${err.message}</div>`;
  }
}

export function restorePanelState() {
  try {
    // Restore grid layout
    const savedCols = localStorage.getItem('dbi_grid_cols');
    const layout = _panel?.querySelector('#dbiLayout');
    if (savedCols && layout) {
      layout.style.gridTemplateColumns = savedCols;
    }

    // Restore active tab
    const savedState = JSON.parse(localStorage.getItem('dbi_panel_state') || '{}');
    if (savedState.activeTab && _panel) {
      const tabBtn = _panel.querySelector(`.dbi-tab[data-tab="${savedState.activeTab}"]`);
      if (tabBtn) switchTab(savedState.activeTab);
    }

    // Restore connection + snapshot after connections load
    if (savedState.connectionId) {
      const select = _panel?.querySelector('#dbiConnectionSelect');
      if (select && [...select.options].some(o => o.value === savedState.connectionId)) {
        select.value = savedState.connectionId;
        loadSnapshots(savedState.connectionId);
      }
    }
  } catch (_) {}
}
