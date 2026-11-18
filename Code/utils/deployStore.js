'use strict';

const fs = require('fs');
const path = require('path');
const { ROLES, getProvider, normalizeUrl } = require('./deployProviders.js');

const ROLE_IDS = new Set(ROLES.map((r) => r.id));
const FILE_NAME = 'deploy-tool.json';
const MAX_TARGETS = 40;
const MAX_LEGACY = 80;
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

function targetSig(t) {
  return t.providerId + '|' + t.accountId + '|' + t.url;
}

function normalizeTargets(list, max) {
  const out = [];
  const ids = new Set();
  const sigs = new Set();
  const src = Array.isArray(list) ? list : [];
  for (const t of src) {
    const n = normalizeTarget(t);
    if (!n) continue;
    const sig = targetSig(n);
    if (ids.has(n.id) || sigs.has(sig)) continue;
    ids.add(n.id);
    sigs.add(sig);
    out.push(n);
  }
  return out.slice(0, max);
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
  const repos = {};
  const srcRepos = src.repos && typeof src.repos === 'object' ? src.repos : {};
  for (const rawKey of Object.keys(srcRepos)) {
    const key = repoKey(rawKey);
    if (!key) continue;
    const entry = srcRepos[rawKey];
    const list = entry && Array.isArray(entry.targets) ? entry.targets : [];
    const prev = repos[key] ? repos[key].targets : [];
    const targets = normalizeTargets(prev.concat(list), MAX_TARGETS);
    if (targets.length) repos[key] = { targets };
  }
  const legacySrc = [];
  if (Array.isArray(src.targets)) legacySrc.push(...src.targets);
  if (Array.isArray(src.legacy)) legacySrc.push(...src.legacy);
  const srcUi = src.ui && typeof src.ui === 'object' ? src.ui : {};
  return {
    version: 3,
    accounts,
    repos,
    legacy: normalizeTargets(legacySrc, MAX_LEGACY),
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

  function view(repoPath) {
    const d = load();
    const key = repoKey(repoPath);
    const ids = new Set(d.accounts.map((a) => a.id));
    const fix = (t) => Object.assign({}, t, { accountId: ids.has(t.accountId) ? t.accountId : '' });
    const mine = key && d.repos[key] ? d.repos[key].targets.map(fix) : [];
    const seen = new Set(mine.map(targetSig));
    const pool = [];
    for (const k of Object.keys(d.repos)) {
      if (k !== key) pool.push(...d.repos[k].targets);
    }
    pool.push(...d.legacy);
    const others = [];
    for (const t of pool) {
      const f = fix(t);
      const sig = targetSig(f);
      if (seen.has(sig)) continue;
      seen.add(sig);
      others.push(f);
    }
    return {
      accounts: d.accounts.map((a) => Object.assign({}, a)),
      targets: mine,
      others,
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
    const lists = Object.keys(d.repos).map((k) => d.repos[k].targets);
    lists.push(d.legacy);
    for (const list of lists) {
      for (const t of list) {
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
      save();
      return { target: Object.assign({}, n) };
    }
    const sig = targetSig(n);
    const dupIdx = list.findIndex((t) => targetSig(t) === sig);
    if (dupIdx >= 0) {
      const merged = Object.assign({}, n, { id: list[dupIdx].id });
      list[dupIdx] = merged;
      save();
      return { target: Object.assign({}, merged) };
    }
    if (list.length >= MAX_TARGETS) throw new Error('Too many targets in this repo');
    list.push(n);
    save();
    return { target: Object.assign({}, n) };
  }

  function deleteTarget(repoPath, id) {
    const d = load();
    const key = repoKey(repoPath);
    const tid = safeId(id);
    if (key && d.repos[key]) {
      d.repos[key].targets = d.repos[key].targets.filter((t) => t.id !== tid);
    }
    if (d.ui.open) d.ui.open = d.ui.open.filter((x) => x !== tid);
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