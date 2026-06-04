import { getScanDialogHtml } from './template.js';
import { state, setState } from './state.js';

let _resolve = null;
let _reject = null;

export function openScannerModal() {
  return new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;

    const overlay = document.createElement('div');
    overlay.innerHTML = getScanDialogHtml();
    document.body.appendChild(overlay);

    setupScanDialog(overlay);
  });
}

function setupScanDialog(overlay) {
  const radioNew = overlay.querySelector('#dbiConnRadio input[value="new"]');
  const radioSaved = overlay.querySelector('#dbiConnRadio input[value="saved"]');
  const newSection = overlay.querySelector('#dbiNewConnSection');
  const savedSection = overlay.querySelector('#dbiSavedConnSection');
  const typeSelect = overlay.querySelector('#dbiScanType');
  const hostRow = overlay.querySelector('#dbiConnHostRow');
  const portRow = overlay.querySelector('#dbiConnPortRow');
  const nameRow = overlay.querySelector('#dbiConnNameRow');
  const databaseRow = overlay.querySelector('#dbiConnDatabaseRow');
  const userRow = overlay.querySelector('#dbiConnUserRow');
  const passwordRow = overlay.querySelector('#dbiConnPasswordRow');
  const sqliteRow = overlay.querySelector('#dbiSqliteRow');
  const mongoRow = overlay.querySelector('#dbiMongoRow');
  const savedSelect = overlay.querySelector('#dbiSavedConnSelect');
  const startBtn = overlay.querySelector('#dbiScanStartBtn');
  const statusEl = overlay.querySelector('#dbiScanStatus');
  const closeBtn = overlay.querySelector('#dbiScanClose');

  // Radio toggle
  radioNew.addEventListener('change', () => {
    newSection.style.display = '';
    savedSection.style.display = 'none';
  });
  radioSaved.addEventListener('change', async () => {
    newSection.style.display = 'none';
    savedSection.style.display = '';
    try {
      const conns = await window.electronAPI.dbInspector.listConnections();
      savedSelect.innerHTML = conns.map(c => `<option value="${c.id}">${esc(c.name)} (${c.type})</option>`).join('');
    } catch (_) {}
  });

  // DB type toggles
  typeSelect.addEventListener('change', () => {
    const t = typeSelect.value;
    const hideSqlite = t === 'sqlite';
    const hideMongo = t === 'mongodb';
    hostRow.style.display = hideSqlite || hideMongo ? 'none' : '';
    portRow.style.display = hideSqlite || hideMongo ? 'none' : '';
    nameRow.style.display = hideSqlite ? 'none' : '';
    databaseRow.style.display = hideSqlite ? 'none' : '';
    userRow.style.display = hideSqlite ? 'none' : '';
    passwordRow.style.display = hideSqlite ? 'none' : '';
    sqliteRow.style.display = hideSqlite ? '' : 'none';
    mongoRow.style.display = hideMongo ? '' : 'none';
    if (t === 'sqlite' || t === 'mongodb') {
      overlay.querySelector('#dbiScanPort').value = '';
    } else if (t === 'postgres') {
      overlay.querySelector('#dbiScanPort').value = '5432';
    } else if (t === 'mysql') {
      overlay.querySelector('#dbiScanPort').value = '3306';
    }
  });

  // File browse
  overlay.querySelector('#dbiBrowseFileBtn')?.addEventListener('click', async () => {
    // Simple file input fallback
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db,.sqlite,.sqlite3';
    input.addEventListener('change', () => {
      if (input.files[0]) {
        overlay.querySelector('#dbiScanFilePath').value = input.files[0].path;
      }
    });
    input.click();
  });

  startBtn.addEventListener('click', async () => {
    if (radioNew.checked) {
      const type = typeSelect.value;
      const connection = {
        id: 'conn_' + Date.now(),
        name: overlay.querySelector('#dbiScanName').value.trim() || 'Untitled',
        type,
        host: overlay.querySelector('#dbiScanHost').value.trim() || 'localhost',
        port: parseInt(overlay.querySelector('#dbiScanPort').value, 10) || null,
        database: overlay.querySelector('#dbiScanDatabase').value.trim(),
        username: overlay.querySelector('#dbiScanUser').value.trim(),
        password: overlay.querySelector('#dbiScanPassword').value,
        file_path: overlay.querySelector('#dbiScanFilePath').value.trim() || null,
        connection_string: overlay.querySelector('#dbiScanConnStr').value.trim() || null,
      };
      const saveConnection = overlay.querySelector('#dbiSaveConnCheck').checked;
      _resolve({ connection, saveConnection });
    } else {
      const connId = savedSelect.value;
      if (!connId) { statusEl.textContent = 'Select a saved connection'; return; }
      try {
        const conns = await window.electronAPI.dbInspector.listConnections();
        const saved = conns.find(c => c.id === connId);
        if (!saved) { statusEl.textContent = 'Connection not found'; return; }
        const password = saved.encrypted_password ? await window.electronAPI.dbInspector.decrypt(saved.encrypted_password) : '';
        _resolve({
          connection: { ...saved, password },
          saveConnection: false,
        });
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
      }
    }
  });

  closeBtn.addEventListener('click', () => {
    overlay.remove();
    _resolve(null);
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      _resolve(null);
    }
  });
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
