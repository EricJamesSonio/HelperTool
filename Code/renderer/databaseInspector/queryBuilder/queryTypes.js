import { state, setState } from './state.js';

const SQL_TYPES = [
  { id: 'GET_ALL',    label: 'GET ALL',     icon: '◉' },
  { id: 'GET_WHERE',  label: 'GET WHERE',   icon: '◎' },
  { id: 'GET_RANGE',  label: 'GET RANGE',   icon: '↕' },
  { id: 'GET_COLUMNS', label: 'GET COLUMNS', icon: '☑' },
  { id: 'COUNT',      label: 'COUNT',       icon: '#' },
  { id: 'INSERT',     label: 'INSERT',      icon: '+' },
  { id: 'UPDATE',     label: 'UPDATE',      icon: '✎' },
  { id: 'DELETE',     label: 'DELETE',      icon: '✕' },
];

const MONGO_TYPES = [
  { id: 'FIND_ALL',     label: 'FIND ALL',     icon: '◉' },
  { id: 'FIND_WHERE',   label: 'FIND WHERE',   icon: '◎' },
  { id: 'COUNT',        label: 'COUNT',        icon: '#' },
  { id: 'INSERT_ONE',   label: 'INSERT ONE',   icon: '+' },
  { id: 'UPDATE_ONE',   label: 'UPDATE ONE',   icon: '✎' },
  { id: 'DELETE_ONE',   label: 'DELETE ONE',   icon: '✕' },
];

export function render(container) {
  const types = state.dbType === 'mongodb' ? MONGO_TYPES : SQL_TYPES;

  container.innerHTML = `
    <div class="qb-step-back">
      <button class="qb-back-btn" id="qbBackToTables">&larr; ${esc(state.selectedTable)}</button>
    </div>
    <div class="qb-step-title">What do you want to do?</div>
    <div class="qb-type-grid">
      ${types.map(t => `
        <button class="qb-type-btn${state.selectedType === t.id ? ' active' : ''}" data-type="${t.id}">
          <span class="qb-type-icon">${t.icon}</span>
          <span class="qb-type-label">${t.label}</span>
        </button>
      `).join('')}
    </div>
  `;

  container.querySelector('#qbBackToTables').addEventListener('click', () => {
    setState({ step: 'table', selectedType: null, builtQuery: '' });
  });

  container.querySelectorAll('.qb-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.qb-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setState({ selectedType: btn.dataset.type, step: 'form', builtQuery: '' });
    });
  });
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
