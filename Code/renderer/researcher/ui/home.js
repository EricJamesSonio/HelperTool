import { state, getSavedAccounts, removeAccount } from '../state.js';
import { getServiceType, getServiceTypes, getAccountTypeIcon, getAccountTypeName } from '../template.js';
import { openSplitView } from './splitView.js';

export function initHome() {
  renderAccountList();
  setupAddNewGrid();
  setupAddAccountBtn();
}

function setupAddAccountBtn() {
  const btn = document.getElementById('rsAddAccountBtn');
  if (!btn) return;
  btn.addEventListener('click', showAddAccountPicker);
}

function showAddAccountPicker() {
  const existing = document.getElementById('rsAddAccountPicker');
  if (existing) { existing.remove(); return; }

  const types = getServiceTypes();
  const overlay = document.createElement('div');
  overlay.id = 'rsAddAccountPicker';
  overlay.className = 'rs-add-picker-overlay';
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  const box = document.createElement('div');
  box.className = 'rs-add-picker-box';

  types.forEach(t => {
    const card = document.createElement('button');
    card.className = 'rs-add-picker-card';
    card.dataset.id = t.id;
    card.innerHTML = `
      <div class="rs-researcher-icon">${t.icon}</div>
      <div class="rs-researcher-name">${t.name}</div>
    `;
    card.addEventListener('click', () => {
      overlay.remove();
      const accountId = 'acc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      openSplitView({ url: t.url, name: t.name, type: t.id }, accountId);
    });
    box.appendChild(card);
  });

  overlay.appendChild(box);
}

function setupAddNewGrid() {
  const grid = document.getElementById('rsAddNewGrid');
  if (!grid) return;

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.rs-add-new-card');
    if (!card) return;
    const id = card.dataset.id;
    const serviceType = getServiceType(id);
    if (!serviceType) return;
    const accountId = 'acc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    openSplitView({ url: serviceType.url, name: serviceType.name, type: serviceType.id }, accountId);
  });
}

export function renderAccountList() {
  const rows = document.getElementById('rsAccountRows');
  const empty = document.getElementById('rsEmptyAccounts');
  if (!rows) {
    console.log('[RS] renderAccountList: rows not found');
    return;
  }

  const accounts = getSavedAccounts();
  console.log('[RS] renderAccountList: got', accounts.length, 'saved accounts');
  rows.innerHTML = '';

  if (accounts.length === 0) {
    rows.style.display = 'none';
    if (empty) {
      empty.style.display = 'block';
      console.log('[RS] renderAccountList: showing empty state');
    }
    return;
  }

  rows.style.display = '';
  if (empty) empty.style.display = 'none';

  accounts.forEach(acc => {
    const row = document.createElement('div');
    row.className = 'rs-account-row';
    row.dataset.id = acc.id;

    const icon = getAccountTypeIcon(acc.type);
    const typeName = getAccountTypeName(acc.type);

    row.innerHTML = `
      <div class="rs-account-info-row">
        <div class="rs-account-type-icon">${icon}</div>
        <div class="rs-account-details">
          <div class="rs-account-email">${escHtml(acc.email)}</div>
          <div class="rs-account-meta">
            <span class="rs-account-type-badge rs-type-${acc.type}">${typeName}</span>
          </div>
        </div>
      </div>
      <button class="rs-account-delete-btn" title="Remove account">✕</button>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.rs-account-delete-btn')) return;
      openSplitView({ url: acc.url, name: acc.email || getAccountTypeName(acc.type), type: acc.type }, acc.id);
    });

    const delBtn = row.querySelector('.rs-account-delete-btn');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeAccount(acc.id);
      renderAccountList();
    });

    rows.appendChild(row);
  });
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}