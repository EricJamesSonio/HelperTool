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

function cleanGithubUser(v) {
  const s = clean(v, 60).replace(/^@/, '');
  return /^[A-Za-z0-9-]{1,39}$/.test(s) ? s : '';
}

function repoKey(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function normalizeAccount(raw) {
  const o = raw || {};
  const provider = getProvider(clean(o.providerId, 40));
  const label = clean(o.label, 60);
  if (!provider || !label) return null;
  let githubUser = cleanGithubUser(o.githubUser);
  if (!githubUser && provider.id === 'github') githubUser = cleanGithubUser(label);
  return {
    id: safeId(o.id) || newId('acc'),
    providerId: provider.id,
    label,
    githubUser,
  };
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

function mergeTargets(src) {
  const lists = [];
  if (Array.isArray(src.targets)) lists.push(src.targets);
  const srcRepos = src.repos && typeof src.repos === 'object' ? src.repos : {};
  for (const key of Object.keys(srcRepos)) {
    const list = srcRepos[key] && Array.isArray(srcRepos[key].targets) ? srcRepos[key].targets : [];
    lists.push(list);
  }
  const out = [];
  const ids = new Set();
  const sigs = new Set();
  for (const list of lists) {
    for (const t of list) {
      const n = normalizeTarget(t);
      if (!n) continue;
      const sig = n.providerId + '|' + n.accountId + '|' + n.url;
      if (ids.has(n.id) || sigs.has(sig)) continue;
      ids.add(n.id);
      sigs.add(sig);
      out.push(n);
    }
  }
  return out.slice(0, MAX_TARGETS);
}

function cleanOpen(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const v of list) {
    const id = safeId(v);
    if (id && out.indexOf(id) === -1) out.push(id);
  }
  return out.slice(0, 4);
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
  const srcUi = src.ui && typeof src.ui === 'object' ? src.ui : {};
  return {
    version: 2,
    accounts,
    targets: mergeTargets(src),
    ui: { mode: srcUi.mode === 'focus' ? 'focus' : 'grid', open: cleanOpen(srcUi.open) },
  };
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

  function view() {
    const d = load();
    const ids = new Set(d.accounts.map((a) => a.id));
    return {
      accounts: d.accounts.map((a) => Object.assign({}, a)),
      targets: d.targets.map((t) => Object.assign({}, t, { accountId: ids.has(t.accountId) ? t.accountId : '' })),
      ui: { mode: d.ui.mode, open: d.ui.open ? d.ui.open.slice() : null },
    };
  }

  function saveAccount(input) {
    const d = load();
    const n = normalizeAccount(input);
    if (!n) throw new Error('Pick a provider and type a name for the account');
    const dup = d.accounts.find((a) => a.providerId === n.providerId && a.label.toLowerCase() === n.label.toLowerCase() && a.id !== n.id);
    if (dup) {
      if (n.githubUser && dup.githubUser !== n.githubUser) {
        dup.githubUser = n.githubUser;
        save();
      }
      return { account: Object.assign({}, dup), accounts: d.accounts.map((a) => Object.assign({}, a)) };
    }
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
    for (const t of d.targets) {
      if (t.accountId === key) t.accountId = '';
    }
    save();
    return { accounts: d.accounts.map((a) => Object.assign({}, a)) };
  }

  function saveTarget(_repoPath, raw) {
    const d = load();
    const n = normalizeTarget(raw);
    if (!n) throw new Error('Pick a provider first');
    if (n.accountId && !d.accounts.some((a) => a.id === n.accountId)) n.accountId = '';
    const idx = d.targets.findIndex((t) => t.id === n.id);
    if (idx >= 0) {
      d.targets[idx] = n;
    } else {
      if (d.targets.length >= MAX_TARGETS) throw new Error('Too many targets');
      d.targets.push(n);
    }
    save();
    return { target: Object.assign({}, n) };
  }

  function deleteTarget(_repoPath, id) {
    const d = load();
    const key = safeId(id);
    d.targets = d.targets.filter((t) => t.id !== key);
    if (d.ui.open) d.ui.open = d.ui.open.filter((x) => x !== key);
    save();
  }

  function setUi(ui) {
    const d = load();
    const src = ui && typeof ui === 'object' ? ui : {};
    if (src.mode === 'focus' || src.mode === 'grid') d.ui.mode = src.mode;
    const open = cleanOpen(src.open);
    if (open) d.ui.open = open;
    save();
    return { mode: d.ui.mode, open: d.ui.open ? d.ui.open.slice() : null };
  }

  return { view, saveAccount, deleteAccount, saveTarget, deleteTarget, setUi };
}

module.exports = { makeDeployStore, normalizeAccount, normalizeTarget, repoKey };