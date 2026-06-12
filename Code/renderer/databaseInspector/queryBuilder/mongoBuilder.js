import { state, setState } from './state.js';
import { render as renderPreview } from './sqlPreview.js';

const NO_FORM_TYPES = ['FIND_ALL', 'COUNT'];

function isNumeric(v) {
  if (v === '' || v === null || v === undefined) return false;
  if (typeof v === 'number') return true;
  return !isNaN(Number(v));
}

export function render(container) {
  if (NO_FORM_TYPES.includes(state.selectedType)) {
    renderNoForm(container);
    return;
  }
  switch (state.selectedType) {
    case 'FIND_WHERE':
      renderFindWhere(container);
      break;
    case 'INSERT_ONE':
      renderInsertOne(container);
      break;
    case 'UPDATE_ONE':
      renderUpdateOne(container);
      break;
    case 'DELETE_ONE':
      renderDeleteOne(container);
      break;
  }
}

function renderNoForm(container) {
  const label = state.selectedType === 'FIND_ALL' ? 'FIND ALL' : 'COUNT';
  const query = JSON.stringify({ collection: state.selectedTable, method: state.selectedType === 'FIND_ALL' ? 'find' : 'countDocuments', filter: {} });

  setState({ builtQuery: query });

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

function renderFindWhere(container) {
  const conditions = state.conditions;

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTypes">&larr; Back</button>
    </div>
    <div class="qb-step-title">${esc(state.selectedTable)} &mdash; FIND WHERE</div>
    <div class="qb-form-row">
      <label class="qb-form-label">Field</label>
      <input type="text" class="qb-input" id="qbMWhereField" value="${esc(conditions.column)}" placeholder="field name" />
    </div>
    <div class="qb-form-row">
      <label class="qb-form-label">Operator</label>
      <select class="qb-select" id="qbMWhereOp">
        ${['$eq', '$ne', '$gt', '$lt', '$gte', '$lte', '$regex'].map(op => `<option value="${op}" ${op === (conditions.operator || '$eq') ? 'selected' : ''}>${op}</option>`).join('')}
      </select>
    </div>
    <div class="qb-form-row">
      <label class="qb-form-label">Value</label>
      <input type="text" class="qb-input" id="qbMWhereVal" value="${esc(conditions.value)}" placeholder="value" />
    </div>
    <div class="qb-preview-wrap"></div>
    <div class="qb-actions">
      <button class="qb-btn qb-btn-secondary" id="qbCancelBtn">Back</button>
      <button class="qb-btn qb-btn-primary" id="qbRunBtn">&#9654; Run Query</button>
    </div>
  `;

  wireBack(container);

  const updatePreview = () => {
    const field = container.querySelector('#qbMWhereField')?.value || '';
    const op = container.querySelector('#qbMWhereOp')?.value || '$eq';
    const val = container.querySelector('#qbMWhereVal')?.value || '';
    const q = buildFindWhereQuery(field, op, val);
    setState({ conditions: { column: field, operator: op, value: val }, builtQuery: q });
    renderPreview(container.querySelector('.qb-preview-wrap'));
  };

  wireInputs(container, ['qbMWhereField', 'qbMWhereOp', 'qbMWhereVal'], updatePreview);
  wireRun(container);
  updatePreview();
}

function renderInsertOne(container) {
  const sampledFields = (state.columns && state.columns.length > 0)
    ? state.columns.filter(c => c.name !== '_id').map(c => c.name)
    : ['field1', 'field2', 'field3'];

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTypes">&larr; Back</button>
    </div>
    <div class="qb-step-title">${esc(state.selectedTable)} &mdash; INSERT ONE</div>
    <div class="qb-form-scroll">
      ${sampledFields.map(f => `
        <div class="qb-form-row">
          <label class="qb-form-label">${esc(f)}</label>
          <input type="text" class="qb-input" id="qbInsOne_${f}" value="${esc((state.form || {})[f] || '')}" placeholder="value" />
        </div>
      `).join('')}
    </div>
    <div class="qb-preview-wrap"></div>
    <div class="qb-actions">
      <button class="qb-btn qb-btn-secondary" id="qbCancelBtn">Back</button>
      <button class="qb-btn qb-btn-primary" id="qbRunBtn">&#9654; Run Query</button>
    </div>
  `;

  wireBack(container);

  const updatePreview = () => {
    const form = {};
    for (const f of sampledFields) {
      const el = container.querySelector('#qbInsOne_' + f);
      if (el) form[f] = el.value;
    }
    const q = buildInsertOneQuery(form);
    setState({ form, builtQuery: q });
    renderPreview(container.querySelector('.qb-preview-wrap'));
  };

  wireInputs(container, sampledFields.map(f => 'qbInsOne_' + f), updatePreview);
  wireRun(container);
  updatePreview();
}

function renderUpdateOne(container) {
  const formSet = (state.form && state.form.set) || {};
  const sampledFields = (state.columns && state.columns.length > 0)
    ? state.columns.filter(c => c.name !== '_id').map(c => c.name)
    : ['field1', 'field2'];

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTypes">&larr; Back</button>
    </div>
    <div class="qb-step-title">${esc(state.selectedTable)} &mdash; UPDATE ONE</div>
    <div class="qb-form-section">
      <div class="qb-form-section-title">Filter</div>
      <div class="qb-form-row">
        <label class="qb-form-label">Field</label>
        <input type="text" class="qb-input" id="qbMUpdField" value="${esc(state.conditions.column)}" placeholder="field name" />
      </div>
      <div class="qb-form-row">
        <label class="qb-form-label">Value</label>
        <input type="text" class="qb-input" id="qbMUpdVal" value="${esc(state.conditions.value)}" placeholder="value" />
      </div>
    </div>
    <div class="qb-form-section">
      <div class="qb-form-section-title">Set fields</div>
      <div class="qb-form-scroll">
        ${sampledFields.map(f => `
          <div class="qb-form-row">
            <label class="qb-form-label">${esc(f)}</label>
            <input type="text" class="qb-input" id="qbMUpdSet_${f}" value="${esc(formSet[f] || '')}" placeholder="leave empty to skip" />
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

  const updatePreview = () => {
    const field = container.querySelector('#qbMUpdField')?.value || '';
    const val = container.querySelector('#qbMUpdVal')?.value || '';
    const setForm = {};
    for (const f of sampledFields) {
      const el = container.querySelector('#qbMUpdSet_' + f);
      if (el) setForm[f] = el.value;
    }
    const q = buildUpdateOneQuery(field, val, setForm);
    setState({ conditions: { column: field, operator: '$eq', value: val }, form: { set: setForm }, builtQuery: q });
    renderPreview(container.querySelector('.qb-preview-wrap'));
  };

  wireInputs(container, ['qbMUpdField', 'qbMUpdVal', ...sampledFields.map(f => 'qbMUpdSet_' + f)], updatePreview);
  wireRun(container);
  updatePreview();
}

function renderDeleteOne(container) {
  const conditions = state.conditions;

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTypes">&larr; Back</button>
    </div>
    <div class="qb-step-title">${esc(state.selectedTable)} &mdash; DELETE ONE</div>
    <div class="qb-form-row">
      <label class="qb-form-label">Field</label>
      <input type="text" class="qb-input" id="qbMDelField" value="${esc(conditions.column)}" placeholder="field name" />
    </div>
    <div class="qb-form-row">
      <label class="qb-form-label">Value</label>
      <input type="text" class="qb-input" id="qbMDelVal" value="${esc(conditions.value)}" placeholder="value" />
    </div>
    <div class="qb-warning">This will permanently delete a document.</div>
    <div class="qb-preview-wrap"></div>
    <div class="qb-actions">
      <button class="qb-btn qb-btn-secondary" id="qbCancelBtn">Back</button>
      <button class="qb-btn qb-btn-danger" id="qbRunBtn">&#9654; Run Delete</button>
    </div>
  `;

  wireBack(container);

  const updatePreview = () => {
    const field = container.querySelector('#qbMDelField')?.value || '';
    const val = container.querySelector('#qbMDelVal')?.value || '';
    const q = buildDeleteOneQuery(field, val);
    setState({ conditions: { column: field, operator: '$eq', value: val }, builtQuery: q });
    renderPreview(container.querySelector('.qb-preview-wrap'));
  };

  wireInputs(container, ['qbMDelField', 'qbMDelVal'], updatePreview);
  updatePreview();

  container.querySelector('#qbRunBtn').addEventListener('click', () => {
    if (!state.conditions.column) return;
    if (state.onRunQuery && state.builtQuery) state.onRunQuery(state.builtQuery);
  });
}

function buildFindWhereQuery(field, op, val) {
  if (!field) return JSON.stringify({ collection: state.selectedTable, method: 'find', filter: {} });
  const mval = isNumeric(val) ? Number(val) : val;
  const filter = op === '$eq' ? { [field]: mval } : { [field]: { [op]: mval } };
  return JSON.stringify({ collection: state.selectedTable, method: 'find', filter });
}

function buildInsertOneQuery(form) {
  const doc = {};
  for (const [k, v] of Object.entries(form)) {
    if (v !== '' && v !== null && v !== undefined) doc[k] = isNumeric(v) ? Number(v) : v;
  }
  return JSON.stringify({ collection: state.selectedTable, method: 'insertOne', document: doc });
}

function buildUpdateOneQuery(field, val, setForm) {
  const filter = field ? { [field]: isNumeric(val) ? Number(val) : val } : {};
  const update = { $set: {} };
  for (const [k, v] of Object.entries(setForm)) {
    if (v !== '' && v !== null && v !== undefined) update.$set[k] = isNumeric(v) ? Number(v) : v;
  }
  return JSON.stringify({ collection: state.selectedTable, method: 'updateOne', filter, update });
}

function buildDeleteOneQuery(field, val) {
  if (!field) return JSON.stringify({ collection: state.selectedTable, method: 'deleteOne', filter: {} });
  return JSON.stringify({ collection: state.selectedTable, method: 'deleteOne', filter: { [field]: isNumeric(val) ? Number(val) : val } });
}

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
