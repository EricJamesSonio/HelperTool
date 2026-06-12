import { state, setState } from './state.js';
import { render as renderPreview } from './sqlPreview.js';

export function render(container) {
  if (state.dbType === 'mongodb') {
    import('./mongoBuilder.js').then(mod => mod.render(container));
    return;
  }

  switch (state.selectedType) {
    case 'GET_ALL':
    case 'COUNT':
      renderNoForm(container);
      break;
    case 'GET_WHERE':
      renderGetWhere(container);
      break;
    case 'GET_RANGE':
      renderGetRange(container);
      break;
    case 'GET_COLUMNS':
      renderGetColumns(container);
      break;
    case 'INSERT':
      renderInsert(container);
      break;
    case 'UPDATE':
      renderUpdate(container);
      break;
    case 'DELETE':
      renderDelete(container);
      break;
    default:
      container.innerHTML = '<div class="qb-empty">Unknown query type</div>';
  }
}

function renderNoForm(container) {
  const label = state.selectedType === 'GET_ALL' ? 'GET ALL' : 'COUNT';
  const q = state.selectedType === 'GET_ALL'
    ? `SELECT * FROM ${state.selectedTable} LIMIT 100`
    : `SELECT COUNT(*) FROM ${state.selectedTable}`;

  setState({ builtQuery: q });

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTypes">&larr; Back</button>
    </div>
    <div class="qb-step-title">${esc(state.selectedTable)} &mdash; ${label}</div>
    <div class="qb-no-form-note">No additional parameters needed.</div>
    <div class="qb-preview-wrap"></div>
    <div class="qb-actions">
      <button class="qb-btn qb-btn-secondary" id="qbCancelBtn">Back</button>
      <button class="qb-btn qb-btn-primary" id="qbRunBtn">&#9654; Run Query</button>
    </div>
  `;

  wireBack(container);
  wireRun(container);
  renderPreview(container.querySelector('.qb-preview-wrap'));
}

function renderGetWhere(container) {
  const columns = state.columns || [];
  const c = state.conditions;

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTypes">&larr; Back</button>
    </div>
    <div class="qb-step-title">${esc(state.selectedTable)} &mdash; GET WHERE</div>
    <div class="qb-form-row">
      <label class="qb-form-label">Column</label>
      <select class="qb-select" id="qbWhereColumn">
        <option value="">-- select --</option>
        ${columns.map(col => `<option value="${esc(col.name)}" ${col.name === c.column ? 'selected' : ''}>${esc(col.name)}</option>`).join('')}
      </select>
    </div>
    <div class="qb-form-row">
      <label class="qb-form-label">Operator</label>
      <select class="qb-select" id="qbWhereOperator">
        ${['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'].map(op => `<option value="${op}" ${op === c.operator ? 'selected' : ''}>${op}</option>`).join('')}
      </select>
    </div>
    <div class="qb-form-row">
      <label class="qb-form-label">Value</label>
      <input type="text" class="qb-input" id="qbWhereValue" value="${esc(c.value)}" placeholder="value" />
    </div>
    <div class="qb-preview-wrap"></div>
    <div class="qb-actions">
      <button class="qb-btn qb-btn-secondary" id="qbCancelBtn">Back</button>
      <button class="qb-btn qb-btn-primary" id="qbRunBtn">&#9654; Run Query</button>
    </div>
  `;

  wireBack(container);
  wireRun(container);

  const updatePreview = () => {
    const vals = readInputs(container, ['qbWhereColumn', 'qbWhereOperator', 'qbWhereValue']);
    const conditions = { column: vals.qbWhereColumn, operator: vals.qbWhereOperator, value: vals.qbWhereValue };
    const q = buildWherePreview(conditions);
    setState({ conditions, builtQuery: q });
    renderPreview(container.querySelector('.qb-preview-wrap'));
  };

  wireInputs(container, ['qbWhereColumn', 'qbWhereOperator', 'qbWhereValue'], updatePreview);
  updatePreview();
}

function renderGetRange(container) {
  const columns = state.columns || [];
  const ob = state.orderBy || (columns[0]?.name || '');
  const rf = state.rangeFrom;
  const rt = state.rangeTo;

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTypes">&larr; Back</button>
    </div>
    <div class="qb-step-title">${esc(state.selectedTable)} &mdash; GET RANGE</div>
    <div class="qb-form-row">
      <label class="qb-form-label">Order by</label>
      <select class="qb-select" id="qbRangeOrderBy">
        ${columns.map(col => `<option value="${esc(col.name)}" ${col.name === ob ? 'selected' : ''}>${esc(col.name)}</option>`).join('')}
      </select>
    </div>
    <div class="qb-form-row">
      <label class="qb-form-label">From (offset)</label>
      <input type="number" class="qb-input" id="qbRangeFrom" value="${rf || 0}" min="0" />
    </div>
    <div class="qb-form-row">
      <label class="qb-form-label">To (offset + limit)</label>
      <input type="number" class="qb-input" id="qbRangeTo" value="${rt || 100}" min="1" />
    </div>
    <div class="qb-preview-wrap"></div>
    <div class="qb-actions">
      <button class="qb-btn qb-btn-secondary" id="qbCancelBtn">Back</button>
      <button class="qb-btn qb-btn-primary" id="qbRunBtn">&#9654; Run Query</button>
    </div>
  `;

  wireBack(container);
  wireRun(container);

  const updatePreview = () => {
    const vals = readInputs(container, ['qbRangeOrderBy', 'qbRangeFrom', 'qbRangeTo']);
    const q = buildRangePreview(vals);
    setState({ orderBy: vals.qbRangeOrderBy, rangeFrom: vals.qbRangeFrom, rangeTo: vals.qbRangeTo, builtQuery: q });
    renderPreview(container.querySelector('.qb-preview-wrap'));
  };

  wireInputs(container, ['qbRangeOrderBy', 'qbRangeFrom', 'qbRangeTo'], updatePreview);
  updatePreview();
}

function renderGetColumns(container) {
  const columns = state.columns || [];
  const selected = state.selectedColumns.length > 0 ? state.selectedColumns : columns.map(c => c.name);

  setState({ selectedColumns: selected });

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTypes">&larr; Back</button>
    </div>
    <div class="qb-step-title">${esc(state.selectedTable)} &mdash; GET COLUMNS</div>
    <div class="qb-column-select-actions">
      <button class="qb-btn qb-btn-small" id="qbSelectAll">Select All</button>
      <button class="qb-btn qb-btn-small" id="qbDeselectAll">Deselect All</button>
    </div>
    <div class="qb-column-grid">
      ${columns.map(c => `
        <label class="qb-column-check">
          <input type="checkbox" class="qb-col-checkbox" value="${esc(c.name)}" ${selected.includes(c.name) ? 'checked' : ''} />
          <span>${esc(c.name)}</span>
          <span class="qb-col-type">${esc(c.dataType || '')}</span>
        </label>
      `).join('')}
    </div>
    <div class="qb-preview-wrap"></div>
    <div class="qb-actions">
      <button class="qb-btn qb-btn-secondary" id="qbCancelBtn">Back</button>
      <button class="qb-btn qb-btn-primary" id="qbRunBtn">&#9654; Run Query</button>
    </div>
  `;

  const updatePreview = () => {
    const checked = [];
    container.querySelectorAll('.qb-col-checkbox:checked').forEach(cb => checked.push(cb.value));
    const q = checked.length > 0 ? `SELECT ${checked.join(', ')} FROM ${state.selectedTable} LIMIT 100` : `SELECT * FROM ${state.selectedTable} LIMIT 100`;
    setState({ selectedColumns: checked, builtQuery: q });
    renderPreview(container.querySelector('.qb-preview-wrap'));
  };

  container.querySelector('#qbSelectAll').addEventListener('click', () => {
    container.querySelectorAll('.qb-col-checkbox').forEach(cb => cb.checked = true);
    updatePreview();
  });

  container.querySelector('#qbDeselectAll').addEventListener('click', () => {
    container.querySelectorAll('.qb-col-checkbox').forEach(cb => cb.checked = false);
    updatePreview();
  });

  container.querySelectorAll('.qb-col-checkbox').forEach(cb => {
    cb.addEventListener('change', updatePreview);
  });

  wireBack(container);
  wireRun(container);
  updatePreview();
}

function renderInsert(container) {
  const columns = state.columns || [];

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTypes">&larr; Back</button>
    </div>
    <div class="qb-step-title">${esc(state.selectedTable)} &mdash; INSERT</div>
    <div class="qb-form-scroll">
      ${columns.map(c => renderInsertField(c)).join('')}
    </div>
    <div class="qb-preview-wrap"></div>
    <div class="qb-actions">
      <button class="qb-btn qb-btn-secondary" id="qbCancelBtn">Back</button>
      <button class="qb-btn qb-btn-primary" id="qbRunBtn">&#9654; Run Query</button>
    </div>
  `;

  wireBack(container);
  wireRun(container);

  const updatePreview = () => {
    const form = collectInsertForm(container, columns);
    const q = buildInsertPreview(form);
    setState({ form, builtQuery: q });
    renderPreview(container.querySelector('.qb-preview-wrap'));
  };

  const ids = columns.filter(c => !(c.isPk && !c.defaultValue)).map(c => 'qbIns_' + c.name);
  wireInputs(container, ids, updatePreview);
  updatePreview();
}

function renderUpdate(container) {
  const columns = state.columns || [];

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTypes">&larr; Back</button>
    </div>
    <div class="qb-step-title">${esc(state.selectedTable)} &mdash; UPDATE</div>
    <div class="qb-form-section">
      <div class="qb-form-section-title">WHERE</div>
      <div class="qb-form-row">
        <label class="qb-form-label">Column</label>
        <select class="qb-select" id="qbUpdColumn">
          <option value="">-- select --</option>
          ${columns.map(c => `<option value="${esc(c.name)}" ${c.name === state.conditions.column ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="qb-form-row">
        <label class="qb-form-label">Operator</label>
        <select class="qb-select" id="qbUpdOperator">
          ${['=', '!=', '>', '<', '>=', '<='].map(op => `<option value="${op}" ${op === state.conditions.operator ? 'selected' : ''}>${op}</option>`).join('')}
        </select>
      </div>
      <div class="qb-form-row">
        <label class="qb-form-label">Value</label>
        <input type="text" class="qb-input" id="qbUpdValue" value="${esc(state.conditions.value)}" placeholder="value" />
      </div>
    </div>
    <div class="qb-form-section">
      <div class="qb-form-section-title">SET (leave empty to skip)</div>
      <div class="qb-form-scroll">
        ${columns.map(c => `
          <div class="qb-form-row">
            <label class="qb-form-label">${esc(c.name)}</label>
            ${c.dataType && c.dataType.toLowerCase().includes('bool') ? `
              <input type="checkbox" class="qb-input qb-input-inline" id="qbSet_${c.name}" />
            ` : `
              <input type="${isSensitive(c.name) ? 'password' : 'text'}" class="qb-input" id="qbSet_${c.name}" placeholder="leave empty to skip" />
            `}
          </div>
        `).join('')}
      </div>
    </div>
    <div class="qb-preview-wrap"></div>
    <div class="qb-actions">
      <button class="qb-btn qb-btn-secondary" id="qbCancelBtn">Back</button>
      <button class="qb-btn qb-btn-primary" id="qbRunBtn">&#9654; Run Query</button>
    </div>
  `;

  wireBack(container);
  wireRun(container);

  const updatePreview = () => {
    const setForm = {};
    for (const c of columns) {
      const el = container.querySelector('#qbSet_' + c.name);
      if (el) setForm[c.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    const cond = {
      column: container.querySelector('#qbUpdColumn')?.value || '',
      operator: container.querySelector('#qbUpdOperator')?.value || '=',
      value: container.querySelector('#qbUpdValue')?.value || '',
    };
    const q = buildUpdatePreview(cond, setForm);
    setState({ conditions: cond, form: { set: setForm }, builtQuery: q });
    renderPreview(container.querySelector('.qb-preview-wrap'));
  };

  const allIds = ['qbUpdColumn', 'qbUpdOperator', 'qbUpdValue', ...columns.map(c => 'qbSet_' + c.name)];
  wireInputs(container, allIds, updatePreview);
  updatePreview();
}

function renderDelete(container) {
  const columns = state.columns || [];

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTypes">&larr; Back</button>
    </div>
    <div class="qb-step-title">${esc(state.selectedTable)} &mdash; DELETE</div>
    <div class="qb-form-row">
      <label class="qb-form-label">Column</label>
      <select class="qb-select" id="qbDelColumn">
        <option value="">-- select --</option>
        ${columns.map(c => `<option value="${esc(c.name)}" ${c.name === state.conditions.column ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="qb-form-row">
      <label class="qb-form-label">Operator</label>
      <select class="qb-select" id="qbDelOperator">
        ${['=', '!=', '>', '<', '>=', '<='].map(op => `<option value="${op}" ${op === state.conditions.operator ? 'selected' : ''}>${op}</option>`).join('')}
      </select>
    </div>
    <div class="qb-form-row">
      <label class="qb-form-label">Value</label>
      <input type="text" class="qb-input" id="qbDelValue" value="${esc(state.conditions.value)}" placeholder="value" />
    </div>
    <div class="qb-warning">This will permanently delete rows.</div>
    <div class="qb-preview-wrap"></div>
    <div class="qb-actions">
      <button class="qb-btn qb-btn-secondary" id="qbCancelBtn">Back</button>
      <button class="qb-btn qb-btn-danger" id="qbRunBtn">&#9654; Run Delete</button>
    </div>
  `;

  wireBack(container);

  const updatePreview = () => {
    const vals = readInputs(container, ['qbDelColumn', 'qbDelOperator', 'qbDelValue']);
    const cond = { column: vals.qbDelColumn, operator: vals.qbDelOperator, value: vals.qbDelValue };
    const q = buildDeletePreview(cond);
    setState({ conditions: cond, builtQuery: q });
    renderPreview(container.querySelector('.qb-preview-wrap'));
  };

  wireInputs(container, ['qbDelColumn', 'qbDelOperator', 'qbDelValue'], updatePreview);
  updatePreview();

  container.querySelector('#qbRunBtn').addEventListener('click', () => {
    if (!state.conditions.column) return;
    if (state.onRunQuery && state.builtQuery) state.onRunQuery(state.builtQuery);
  });
}

// ── Helpers ──

function renderInsertField(c) {
  const isAutoPk = c.isPk && (c.defaultValue === null || c.dataType?.toLowerCase().includes('int'));
  const hasDefault = c.defaultValue !== null && c.defaultValue !== undefined;
  const isBool = c.dataType && c.dataType.toLowerCase().includes('bool');

  if (isAutoPk) {
    return `<div class="qb-form-row"><label class="qb-form-label">${esc(c.name)}</label><span class="qb-auto-value">auto</span></div>`;
  }

  if (isBool) {
    return `<div class="qb-form-row"><label class="qb-form-label">${esc(c.name)}</label><input type="checkbox" class="qb-input qb-input-inline" id="qbIns_${c.name}" ${hasDefault ? 'checked' : ''} /></div>`;
  }

  const isInt = c.dataType && c.dataType.toLowerCase().includes('int');
  const masked = isSensitive(c.name);
  const defaultValue = hasDefault ? String(c.defaultValue).replace(/^'|'$/g, '') : '';

  return `<div class="qb-form-row"><label class="qb-form-label">${esc(c.name)}</label><input type="${masked ? 'password' : isInt ? 'number' : 'text'}" class="qb-input" id="qbIns_${c.name}" value="${esc(defaultValue)}" placeholder="${masked ? 'enter value' : ''}" ${isInt ? 'min="0"' : ''} /></div>`;
}

function isSensitive(name) {
  const lower = name.toLowerCase();
  return lower.includes('password') || lower.includes('secret') || lower.includes('hash') || lower.includes('token');
}

function collectInsertForm(container, columns) {
  const form = {};
  for (const c of columns) {
    if (c.isPk && c.defaultValue === null) continue;
    const el = container.querySelector('#qbIns_' + c.name);
    if (!el) continue;
    form[c.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return form;
}

function readInputs(container, ids) {
  const vals = {};
  for (const id of ids) {
    const el = container.querySelector('#' + id);
    if (el) vals[id] = el.value;
  }
  return vals;
}

// ── Preview builders (called at runtime, read from args) ──

function buildWherePreview(cond) {
  if (!cond.column || !cond.value) return `SELECT * FROM ${state.selectedTable} LIMIT 100`;
  const val = isNumeric(cond.value) ? cond.value : `'${String(cond.value).replace(/'/g, "''")}'`;
  return `SELECT * FROM ${state.selectedTable} WHERE ${cond.column} ${cond.operator} ${val} LIMIT 100`;
}

function buildRangePreview(vals) {
  const from = parseInt(vals.qbRangeFrom) || 0;
  const to = parseInt(vals.qbRangeTo) || 100;
  const limit = to - from;
  if (limit <= 0) return `SELECT * FROM ${state.selectedTable} ORDER BY ${vals.qbRangeOrderBy || (state.columns[0]?.name || '1')}`;
  const col = vals.qbRangeOrderBy || (state.columns[0]?.name || '1');
  return `SELECT * FROM ${state.selectedTable} ORDER BY ${col} LIMIT ${limit} OFFSET ${from}`;
}

function buildInsertPreview(form) {
  const cols = Object.keys(form).filter(k => form[k] !== '' && form[k] !== null && form[k] !== undefined);
  if (cols.length === 0) return `INSERT INTO ${state.selectedTable} (col1, col2, ...) VALUES (...)`;
  const vals = cols.map(c => {
    if (typeof form[c] === 'boolean') return form[c] ? '1' : '0';
    if (isNumeric(form[c])) return form[c];
    return `'${String(form[c]).replace(/'/g, "''")}'`;
  });
  return `INSERT INTO ${state.selectedTable} (${cols.join(', ')}) VALUES (${vals.join(', ')})`;
}

function buildUpdatePreview(cond, setForm) {
  const setCols = Object.keys(setForm).filter(k => setForm[k] !== '' && setForm[k] !== null && setForm[k] !== undefined);
  if (setCols.length === 0 || !cond.column || !cond.value) return `UPDATE ${state.selectedTable} SET ... WHERE ...`;
  const setClause = setCols.map(c => {
    const v = typeof setForm[c] === 'boolean' ? (setForm[c] ? '1' : '0') : (isNumeric(setForm[c]) ? setForm[c] : `'${String(setForm[c]).replace(/'/g, "''")}'`);
    return `${c} = ${v}`;
  }).join(', ');
  const wVal = isNumeric(cond.value) ? cond.value : `'${String(cond.value).replace(/'/g, "''")}'`;
  return `UPDATE ${state.selectedTable} SET ${setClause} WHERE ${cond.column} ${cond.operator} ${wVal}`;
}

function buildDeletePreview(cond) {
  if (!cond.column || !cond.value) return `DELETE FROM ${state.selectedTable} WHERE ...`;
  const val = isNumeric(cond.value) ? cond.value : `'${String(cond.value).replace(/'/g, "''")}'`;
  return `DELETE FROM ${state.selectedTable} WHERE ${cond.column} ${cond.operator} ${val}`;
}

// ── Event wiring ──

function wireBack(container) {
  const btn = container.querySelector('#qbBackToTypes');
  if (btn) btn.addEventListener('click', () => { setState({ step: 'type', builtQuery: '' }); });
  const cancel = container.querySelector('#qbCancelBtn');
  if (cancel) cancel.addEventListener('click', () => { setState({ step: 'type', builtQuery: '' }); });
}

function wireRun(container) {
  container.querySelector('#qbRunBtn')?.addEventListener('click', () => {
    if (state.onRunQuery && state.builtQuery) state.onRunQuery(state.builtQuery);
  });
}

function wireInputs(container, ids, callback) {
  for (const id of ids) {
    const el = container.querySelector('#' + id);
    if (el) {
      el.addEventListener('input', callback);
      el.addEventListener('change', callback);
    }
  }
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function isNumeric(v) {
  if (typeof v === 'number') return true;
  if (typeof v !== 'string' || v.trim() === '') return false;
  return !isNaN(Number(v));
}
