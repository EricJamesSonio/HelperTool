import { DEFAULT_PREFERENCES } from '../../defaultPreferences.js';

export const state = {
  mode: localStorage.getItem('helpertool-dbi-query-mode') || DEFAULT_PREFERENCES.databaseInspector.queryMode,
  step: 'table',
  dbType: 'postgres',
  tables: [],
  selectedTable: null,
  selectedType: null,
  columns: [],
  form: {},
  conditions: { column: '', operator: '=', value: '' },
  rangeFrom: '',
  rangeTo: '',
  selectedColumns: [],
  orderBy: '',
  builtQuery: '',
  loading: false,
  error: null,
  onRunQuery: null,
};

let _onChange = null;

export function setState(patch) {
  Object.assign(state, patch);
  if (_onChange) _onChange(state);
}

export function onChange(cb) {
  _onChange = cb;
}
