import { state, setState, onChange } from './state.js';
import { render as renderTableList } from './tableList.js';
import { render as renderQueryTypes } from './queryTypes.js';
import { render as renderForm } from './formBuilder.js';

let _container = null;
let _mounted = false;
let _prevStep = 'table';

export function setSchema(tables, snapshotId, dbType) {
  setState({
    tables: tables || [],
    snapshotId: snapshotId || state.snapshotId,
    dbType: dbType || state.dbType,
    step: 'table',
    selectedTable: null,
    selectedType: null,
    columns: [],
    builtQuery: '',
  });
}

export function mount(containerEl, onRunQuery) {
  _container = containerEl;
  _mounted = true;
  setState({ onRunQuery: onRunQuery || null });

  if (!_container.querySelector('.qb-root')) {
    const root = document.createElement('div');
    root.className = 'qb-root';
    root.innerHTML = '<div class="qb-step"></div>';
    _container.appendChild(root);
  }

  onChange((s) => {
    if (_mounted) {
      if (s.step !== _prevStep) {
        _prevStep = s.step;
        render();
      } else if (s.step === 'form' && s.columns && s.columns.length > 0) {
        render();
      }
    }
  });

  _prevStep = state.step;
  render();
}

export function unmount() {
  _mounted = false;
  _container = null;
}

export function getMode() {
  return state.mode;
}

export function setMode(mode) {
  setState({ mode });
  try { localStorage.setItem('helpertool-dbi-query-mode', mode); } catch (_) {}
  if (state.mode === 'easy') {
    setState({ step: 'table', selectedTable: null, selectedType: null, builtQuery: '' });
  }
}

export function getBuiltQuery() {
  return state.builtQuery;
}

function render() {
  if (!_container) return;
  const stepEl = _container.querySelector('.qb-step');
  if (!stepEl) return;

  switch (state.step) {
    case 'table':
      renderTableList(stepEl);
      break;
    case 'type':
      renderQueryTypes(stepEl);
      break;
    case 'form':
      renderForm(stepEl);
      break;
  }
}
