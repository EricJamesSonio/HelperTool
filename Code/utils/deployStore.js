'use strict';

const fs = require('fs');
const path = require('path');
const { ROLES, getProvider, normalizeUrl } = require('./deployProviders.js');

const ROLE_IDS = new Set(ROLES.map((r) => r.id));
const FILE_NAME = 'deploy-tool.json';
const MAX_TARGETS = 40;
const MAX_ACCOUNTS = 60;

function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max || 200) : '';
}

function safeId(v) {
  const s = clean(v, 80);
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : '';
}

function repoKey(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function normalizeAccount(raw) {
  const o = raw || {};
  const provider = getProvider(clean(o.providerId, 40));
  const label = clean(o.label, 60);
  if (!provider || !label) return null;
  return { id: safeId(o.id) || newId('acc'), providerId: provider.id, label };
}

function normalizeTarget(raw) {
  const o = raw || {};
  const provider = getProvider(clean(o.providerId, 40));
  if (!provider) return null;
  const role = ROLE_IDS.has(o.role) ? o.role : 'custom';
  return {
    id: safeId(o.id) || newId('tgt'),
    role,
    roleLabel: role === 'custom' ? clean(o.roleLabel, 24) || 'Custom' : '',
    providerId: provider.id,
    accountId: safeId(o.accountId),
    name: clean(o.name, 60) || provider.name,
    url: normalizeUrl(o.url) || provider.url,
  };
}

function normalizeData(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const accounts = [];
  const seen = new Set();
  for (const a of Array.isArray(src.accounts) ? src.accounts : []) {
    const n = normalizeAccount(a);
    if (n && !seen.has(n.id)) {
      seen.add(n.id);
      accounts.push(n);
    }
  }
  const repos = {};
  const srcRepos = src.repos && typeof src.repos === 'object' ? src.repos : {};
  for (const key of Object.keys(srcRepos)) {
    const list = srcRepos[key] && Array.isArray(srcRepos[key].targets) ? srcRepos[key].targets : [];
    const targets = [];
    const ids = new Set();
    for (const t of list) {
      const n = normalizeTarget(t);
      if (n && !ids.has(n.id)) {
        ids.add(n.id);
        targets.push(n);
      }
    }
    repos[key] = { targets };
  }
  return { version: 1, accounts, repos, ui: { mode: src.ui && src.ui.mode === 'focus' ? 'focus' : 'grid' } };
}

function makeDeployStore({ app }) {
  const file = path.join(app.getPath('userData'), FILE_NAME);
  let data = null;

  function load() {
    if (data) return data;
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (_) {
      raw = null;
    }
    data = normalizeData(raw);
    return data;
  }

  function save() {
    const tmp = file + '.tmp';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  }

  function targetsOf(repoPath) {
    const d = load();
    const entry = d.repos[repoKey(repoPath)];
    return entry ? entry.targets : [];
  }

  function view(repoPath) {
    const d = load();
    const ids = new Set(d.accounts.map((a) => a.id));
    return {
      accounts: d.accounts.map((a) => Object.assign({}, a)),
      targets: targetsOf(repoPath).map((t) => Object.assign({}, t, { accountId: ids.has(t.accountId) ? t.accountId : '' })),
      ui: Object.assign({}, d.ui),
    };
  }

  function saveAccount(input) {
    const d = load();
    const n = normalizeAccount(input);
    if (!n) throw new Error('Pick a provider and type a name for the account');
    const dup = d.accounts.find((a) => a.providerId === n.providerId && a.label.toLowerCase() === n.label.toLowerCase() && a.id !== n.id);
    if (dup) return { account: Object.assign({}, dup), accounts: d.accounts.map((a) => Object.assign({}, a)) };
    const idx = d.accounts.findIndex((a) => a.id === n.id);
    if (idx >= 0) {
      d.accounts[idx] = n;
    } else {
      if (d.accounts.length >= MAX_ACCOUNTS) throw new Error('Too many accounts. Remove one first.');
      d.accounts.push(n);
    }
    save();
    return { account: Object.assign({}, n), accounts: d.accounts.map((a) => Object.assign({}, a)) };
  }

  function deleteAccount(id) {
    const d = load();
    const key = safeId(id);
    d.accounts = d.accounts.filter((a) => a.id !== key);
    for (const repo of Object.keys(d.repos)) {
      for (const t of d.repos[repo].targets) {
        if (t.accountId === key) t.accountId = '';
      }
    }
    save();
    return { accounts: d.accounts.map((a) => Object.assign({}, a)) };
  }

  function saveTarget(repoPath, raw) {
    const d = load();
    const key = repoKey(repoPath);
    if (!key) throw new Error('Open a repository first');
    const n = normalizeTarget(raw);
    if (!n) throw new Error('Pick a provider first');
    if (n.accountId && !d.accounts.some((a) => a.id === n.accountId)) n.accountId = '';
    if (!d.repos[key]) d.repos[key] = { targets: [] };
    const list = d.repos[key].targets;
    const idx = list.findIndex((t) => t.id === n.id);
    if (idx >= 0) {
      list[idx] = n;
    } else {
      if (list.length >= MAX_TARGETS) throw new Error('Too many targets for this repo');
      list.push(n);
    }
    save();
    return { target: Object.assign({}, n) };
  }

  function deleteTarget(repoPath, id) {
    const d = load();
    const key = repoKey(repoPath);
    if (d.repos[key]) {
      d.repos[key].targets = d.repos[key].targets.filter((t) => t.id !== safeId(id));
      save();
    }
  }

  function setUi(ui) {
    const d = load();
    d.ui = { mode: ui && ui.mode === 'focus' ? 'focus' : 'grid' };
    save();
    return Object.assign({}, d.ui);
  }

  return { view, saveAccount, deleteAccount, saveTarget, deleteTarget, setUi };
}

module.exports = { makeDeployStore, normalizeAccount, normalizeTarget, repoKey };