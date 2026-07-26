const STORAGE_KEY = 'rs_accounts';

export const state = {
  open: false,
  selectedAccount: null,
  activeUrl: null,
  initialized: false,
  accounts: [],
  addingNew: false,
};

export function loadAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    console.log('[RS] loadAccounts raw:', raw);
    if (raw) {
      state.accounts = JSON.parse(raw);
      console.log('[RS] loadAccounts parsed:', state.accounts.length, 'accounts');
    } else {
      console.log('[RS] loadAccounts: no saved data');
    }
  } catch (e) {
    console.error('[RS] loadAccounts error:', e);
  }
}

export function saveAccounts() {
  try {
    const data = JSON.stringify(state.accounts);
    localStorage.setItem(STORAGE_KEY, data);
    console.log('[RS] saveAccounts saved:', state.accounts.length, 'accounts, data length:', data.length);
  } catch (e) {
    console.error('[RS] saveAccounts error:', e);
  }
}

export function getSavedAccounts() {
  const saved = state.accounts.filter(a => a.saved);
  return saved;
}

export function findAccountByEmail(email, type) {
  const norm = email.trim().toLowerCase();
  return state.accounts.find(a => a.email?.toLowerCase() === norm && a.type === type);
}

export function addAccount(account) {
  console.log('[RS] addAccount called with:', account.email, account.type, account.id);
  state.accounts.push(account);
  console.log('[RS] addAccount after push, accounts:', state.accounts.length);
  saveAccounts();
}

export function removeAccount(id) {
  state.accounts = state.accounts.filter(a => a.id !== id);
  saveAccounts();
}
