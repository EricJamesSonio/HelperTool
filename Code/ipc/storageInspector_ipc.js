'use strict';

const { app, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { getSqlJs } = require('../database/sharedSqlJs');

const G_DB = 'SQLite databases';
const G_CRED = 'Credentials & sessions';
const G_JSON = 'JSON & config files';
const G_FILES = 'Folders, caches & media';
const G_BROWSER = 'Browser storage';
const G_OTHER = 'Everything else in the app data folder';

const MAX_TEXT = 1536 * 1024;
const MAX_IMAGE = 3 * 1024 * 1024;
const MAX_CELL = 20000;
const MAX_ROWS = 200;
const MAX_WALK = 5000;
const MAX_WALK_INTERNAL = 500;
const MAX_DIR_ENTRIES = 500;
const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022 (hidden)';
const COLUMN_SECRET = /password|passwd|token|secret|api[_-]?key/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|ico)$/i;
const DB_EXT = /\.(db|sqlite|sqlite3)$/i;
const BACKUP_RE = /\.(tmp|bak)$|\.corrupt-/i;
const INTERNAL_RE = /^(Cache|Code Cache|GPUCache|Dawn[A-Za-z]*Cache|GraphiteDawnCache|Network|Local Storage|Session Storage|Partitions|IndexedDB|blob_storage|Shared Dictionary|SharedStorage|WebStorage|Service Worker|Local State|Preferences|Cookies(-journal)?|Crashpad|DIPS(-wal)?|Trust Tokens(-journal)?|Dictionaries|Sync Data|Platform Notifications|VideoDecodeStats|Visited Links|Singleton(Lock|Cookie|Socket)|lockfile|shared_proto_db|component_crx_cache|extensions_crx_cache|segmentation_platform|optimization_guide.*|first_party_sets.*|TransportSecurity|Reporting and NEL.*|SCT Auditing Pending Reports|Safe Browsing.*|History.*|Favicons.*|Login Data.*|Web Data.*)$/i;
const CONTAINERS = new Set(['symbol-index', 'helperchat', 'error-cop', 'repo-console']);

const TABLE_TOOLS = [
  [/^(repositories|indexed_files|symbols(_fts.*)?|file_imports)$/, 'Symbol Index / HelperChat / Codebase Map / Graphify'],
  [/^boards$/, 'Canvas Tool'],
  [/^(blueprint_categories|blueprints|kit_items)$/, 'Blueprint Library'],
  [/^(profile|profile_meta|activity_days|activity_ext_days|file_save_events)$/, 'Profile Tool'],
  [/^github_repo_trees$/, 'GitHub Explorer'],
  [/^(db_connections|schema_.*|seed_scripts)$/, 'DB Inspector'],
  [/^(chat_conversations|chat_messages)$/, 'HelperChat'],
  [/^(sessions|errors|error_occurrences|browser_servers)$/, 'Error Cop / Terminal'],
  [/^(runs|run_steps|run_logs|run_errors|security_profiles|security_settings)$/, 'Repo Console / Security Tester'],
];

const MEMORY = [
  {
    id: 'mem:eco',
    name: 'ecoStore.js',
    label: 'Ecosystem event buffers',
    tools: ['Ecosystem Dashboard'],
    note: 'Five buffers (console logs, API calls, API errors, terminal errors, browser errors) with up to 200 events each. Memory only, lost when the app closes.',
  },
  {
    id: 'mem:services',
    name: 'serviceTracker_ipc.js',
    label: 'Service status list',
    tools: ['Service Tracker'],
    note: 'Start-up status of database, profile sync, watchers and similar services. Memory only.',
  },
  {
    id: 'mem:profile',
    name: 'profile.js',
    label: 'Profile overview and day caches',
    tools: ['Profile Tool'],
    note: 'Cached repo overview (about 1 minute), per-day commit lists (about 5 minutes), remote URLs (10 minutes) and a queue of unsaved file-save events (flushed every 3 seconds). Memory only.',
  },
  {
    id: 'mem:github',
    name: 'github_ipc.js',
    label: 'GitHub commit-count cache',
    tools: ['GitHub Explorer'],
    note: 'Commit counts per repo, cached for 5 minutes. Memory only.',
  },
  {
    id: 'mem:config',
    name: 'config.js',
    label: 'Config cache',
    tools: ['Core app'],
    note: 'helper-config.json is cached in memory and written back about half a second after each change.',
  },
];

let _registered = false;
let _config = null;
let _sqlCache = null;

function userRoot() {
  return path.resolve(app.getPath('userData'));
}

function readCfg() {
  try {
    return (_config && _config.readConfig()) || {};
  } catch (_) {
    return {};
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function safePath(p) {
  const root = userRoot();
  const abs = path.resolve(String(p || ''));
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('That path is outside the app data folder.');
  }
  return abs;
}

function isInternal(abs) {
  const rel = path.relative(userRoot(), abs);
  const first = rel.split(path.sep)[0];
  return !!first && INTERNAL_RE.test(first);
}

function kindOf(name, isDir) {
  if (isDir) return 'dir';
  if (DB_EXT.test(name)) return 'sqlite';
  if (/\.json$/i.test(name)) return 'json';
  if (IMAGE_EXT.test(name)) return 'image';
  if (/\.(log|txt|md|js|ts|css|html|yml|yaml)$/i.test(name)) return 'text';
  return 'file';
}

function toolForTable(name) {
  for (const entry of TABLE_TOOLS) {
    if (entry[0].test(name)) return entry[1];
  }
  return '';
}

function buildKnown() {
  const root = userRoot();
  const d = (rel, o) => Object.assign({
    id: rel,
    rel: rel,
    abs: path.join(root, ...rel.split('/')),
    name: rel.split('/').pop(),
    tools: [],
    note: '',
    sensitive: false,
    maskKeys: null,
  }, o);
  return [
    d('symbol-index/index.db', {
      group: G_DB,
      kind: 'sqlite',
      label: 'Main database (index.db)',
      tools: ['Symbol Index', 'HelperChat', 'Codebase Map', 'Graphify', 'Canvas Tool', 'Blueprint Library', 'Profile Tool', 'GitHub Explorer', 'DB Inspector'],
      note: 'One SQLite file shared by many tools. Each table is tagged with its tool inside. It is saved to disk a few seconds after a change, so this view can lag the live app a little.',
    }),
    d('helperchat/chat.db', {
      group: G_DB,
      kind: 'sqlite',
      label: 'HelperChat database (chat.db)',
      tools: ['HelperChat'],
      note: 'Conversations and messages per repo.',
    }),
    d('error-cop/errors.db', {
      group: G_DB,
      kind: 'sqlite',
      label: 'Error Cop database (errors.db)',
      tools: ['Error Cop', 'Terminal'],
      note: 'Terminal sessions, detected errors and occurrences. Sessions older than 30 days are cleaned up automatically.',
    }),
    d('repo-console/console.db', {
      group: G_DB,
      kind: 'sqlite',
      label: 'Repo Console history (console.db)',
      tools: ['Repo Console', 'Security Tester', 'CI runner'],
      note: 'Run history, steps, logs and errors per repo, plus security profiles and settings. Uses the built-in node:sqlite engine.',
    }),
    d('secrets.json', {
      group: G_CRED,
      kind: 'json',
      label: 'Secret Holder: password hash and secrets',
      tools: ['Secret Holder'],
      sensitive: true,
      maskKeys: /^(value|passwordHash)$/,
      note: 'Secret values are stored here as plain text. Only the master password is hashed (SHA-256, no salt). Anyone who can read this file can read your secrets.',
    }),
    d('git-accounts.json', {
      group: G_CRED,
      kind: 'json',
      label: 'GitHub accounts and tokens',
      tools: ['Git Tool', 'Branch Manager', 'GitHub accounts window'],
      sensitive: true,
      maskKeys: /^(token|refreshToken)$/,
      note: 'Access tokens are encrypted with the OS (Electron safeStorage) when available, otherwise stored as plain text. Check the enc flag on each account.',
    }),
    d('gmail-store.json', {
      group: G_CRED,
      kind: 'json',
      label: 'Gmail accounts and tokens',
      tools: ['Gmail Tool', 'HelperChat (email queries)'],
      sensitive: true,
      maskKeys: /token|secret|refresh|password|credential/i,
      note: 'Path assumed: the Gmail service was not inspected. If this shows as not created, Gmail keeps its data somewhere else.',
    }),
    d('Partitions', {
      group: G_CRED,
      kind: 'dir',
      label: 'Embedded browser logins (Deploy Tool)',
      tools: ['Deploy Tool', 'Researcher (possibly)'],
      sensitive: true,
      note: 'Cookies and site storage of the embedded browser, one partition per Deploy Tool account (persist:deploy-<accountId> and persist:deploy-gh-<githubUser>). The Deploy Tool does not store passwords itself. The website logins live here. Chromium internal, cannot be previewed.',
    }),
    d('helper-config.json', {
      group: G_JSON,
      kind: 'json',
      label: 'App config and per-repo settings',
      tools: ['Core app', 'Repo selector', 'Session Notes', 'Extension and folder filters', 'Feature toggles'],
      maskKeys: /^sessionNotesLock$/,
      note: 'projects.<repoPath> holds lastSelectedItems, ignoredExtensions, folderFilters, sessionNotesData (your notes) and sessionNotesLock (notes password hash). features holds the tool on/off flags.',
    }),
    d('workspace.json', {
      group: G_JSON,
      kind: 'json',
      label: 'Workspace data',
      tools: ['Workspace'],
      note: 'Projects, workers, tickets and global logs (logs older than 7 days are pruned).',
    }),
    d('prompts.json', {
      group: G_JSON,
      kind: 'json',
      label: 'Prompt library',
      tools: ['Prompt Tool'],
      note: 'Categories and prompts with favorites and pins.',
    }),
    d('deploy-tool.json', {
      group: G_JSON,
      kind: 'json',
      label: 'Deploy targets and accounts',
      tools: ['Deploy Tool'],
      note: 'Account labels and deploy targets per repo. No passwords here. The website logins are in the Partitions folder.',
    }),
    d('flow-history.json', {
      group: G_JSON,
      kind: 'json',
      label: 'Flow Tool apply history',
      tools: ['Flow Tool', 'Global Seeder'],
      note: 'Before and after contents of files changed through Flow Tool, per repo, last 40 applies.',
    }),
    d('automation-sketches.json', {
      group: G_JSON,
      kind: 'json',
      label: 'Automation sketches',
      tools: ['Automation Sketch'],
      note: 'Saved flow sketches.',
    }),
    d('global-docignore.json', {
      group: G_JSON,
      kind: 'json',
      label: 'Global ignore rules',
      tools: ['Docignore', 'Generate', 'GitHub Explorer'],
      note: 'Ignore rules applied to every repo.',
    }),
    d('symbol-index/.restore-flags.json', {
      group: G_JSON,
      kind: 'json',
      label: 'Symbol Index restore flags',
      tools: ['Symbol Index'],
      note: 'Flags used to restore indexing after a restart.',
    }),
    d('req-library', {
      group: G_FILES,
      kind: 'dir',
      label: 'Requirements Library (one JSON per repo)',
      tools: ['Requirements Library'],
      note: 'File names are a hash of the repo path. favorites.json holds the favorite presets shared across repos.',
    }),
    d('folder-tree-cache', {
      group: G_FILES,
      kind: 'dir',
      label: 'Folder tree cache',
      tools: ['File tree', 'Generate'],
      note: 'Cached folder trees (5 minute lifetime), one file per repo and ignore-rule combination.',
    }),
    d('profile-avatar.png', {
      group: G_FILES,
      kind: 'image',
      label: 'Profile avatar',
      tools: ['Profile Tool'],
      note: 'Your uploaded profile picture.',
    }),
    d('Local Storage', {
      group: G_BROWSER,
      kind: 'dir',
      label: 'localStorage on disk (LevelDB)',
      tools: ['Settings', 'Shortcuts', 'Select Shortcuts', 'DB Inspector layout'],
      note: 'This is where the window saves localStorage. Use the live localStorage entry in this group to read the keys.',
    }),
  ];
}

function knownDef(abs) {
  const target = path.resolve(abs).toLowerCase();
  const list = buildKnown();
  for (const def of list) {
    if (path.resolve(def.abs).toLowerCase() === target) return def;
  }
  return null;
}

async function dirSize(root, cap) {
  let size = 0;
  let files = 0;
  let truncated = false;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let ents = [];
    try {
      ents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
        continue;
      }
      files += 1;
      if (files > cap) {
        truncated = true;
        return { size, files, truncated };
      }
      try {
        size += (await fs.promises.stat(full)).size;
      } catch (_) {
        /* file vanished */
      }
    }
  }
  return { size, files, truncated };
}

async function statDef(def) {
  const out = {
    id: def.id,
    rel: def.rel,
    abs: def.abs,
    name: def.name,
    label: def.label,
    group: def.group,
    kind: def.kind,
    tools: def.tools,
    note: def.note,
    sensitive: !!def.sensitive,
    exists: false,
    isDir: def.kind === 'dir',
    size: 0,
    mtime: 0,
    files: 0,
    truncatedScan: false,
    internal: isInternal(def.abs),
  };
  try {
    const st = await fs.promises.stat(def.abs);
    out.exists = true;
    out.mtime = st.mtimeMs;
    if (st.isDirectory()) {
      const w = await dirSize(def.abs, out.internal ? MAX_WALK_INTERNAL : MAX_WALK);
      out.isDir = true;
      out.kind = 'dir';
      out.size = w.size;
      out.files = w.files;
      out.truncatedScan = w.truncated;
    } else {
      out.size = st.size;
    }
  } catch (_) {
    /* not created yet */
  }
  return out;
}

async function describeOther(abs, rel, isDir, repoByStorage) {
  const name = path.basename(abs);
  const lower = name.toLowerCase();
  const item = {
    id: 'other:' + rel,
    rel: rel,
    abs: abs,
    name: name,
    group: G_OTHER,
    kind: kindOf(name, isDir),
    isDir: isDir,
    exists: true,
    label: 'Unlabeled - not in the catalog yet',
    tools: [],
    note: 'Not recognised. Open it to see what is inside.',
    sensitive: false,
    size: 0,
    mtime: 0,
    files: 0,
    truncatedScan: false,
    internal: false,
  };
  if (repoByStorage.has(lower)) {
    item.label = 'Output folder for repo: ' + repoByStorage.get(lower);
    item.tools = ['Generate (Code / Structures output)', 'Repo selector'];
    item.note = 'Created when you select a repo. Holds the generated Codes and Structures files for it.';
  } else if (lower === 'helpertoolstorage') {
    item.label = 'Default storage root (baseStoragePath in config)';
    item.tools = ['Core app'];
    item.note = 'Default base folder from the config. Usually empty.';
  } else if (INTERNAL_RE.test(name)) {
    item.internal = true;
    item.label = 'Electron / Chromium internal';
    item.note = 'Created by the browser engine inside the app, not by a Helper Tool feature. Cannot be previewed.';
  } else if (BACKUP_RE.test(name)) {
    item.label = 'Temporary or backup file';
    item.note = 'Left behind by an atomic save or a corrupt-file backup.';
  } else if (rel.indexOf('/') !== -1) {
    item.label = 'Unlabeled file inside ' + rel.split('/')[0];
  }
  try {
    const st = await fs.promises.stat(abs);
    item.mtime = st.mtimeMs;
    if (st.isDirectory()) {
      const w = await dirSize(abs, item.internal ? MAX_WALK_INTERNAL : MAX_WALK);
      item.isDir = true;
      item.kind = 'dir';
      item.size = w.size;
      item.files = w.files;
      item.truncatedScan = w.truncated;
    } else {
      item.size = st.size;
    }
  } catch (_) {
    item.exists = false;
  }
  return item;
}

async function scanOthers(defs) {
  const root = userRoot();
  const cfg = readCfg();
  const repoByStorage = new Map();
  const projects = cfg.projects || {};
  for (const repoPath of Object.keys(projects)) {
    const p = projects[repoPath];
    if (p && p.storageName) repoByStorage.set(String(p.storageName).toLowerCase(), repoPath);
  }
  const covered = new Set(defs.map((x) => x.rel.split('/')[0].toLowerCase()));
  const knownRel = new Set(defs.map((x) => x.rel.toLowerCase()));
  let ents = [];
  try {
    ents = await fs.promises.readdir(root, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  const out = [];
  for (const e of ents) {
    const lower = e.name.toLowerCase();
    if (covered.has(lower)) {
      if (!CONTAINERS.has(lower) || !e.isDirectory()) continue;
      let kids = [];
      try {
        kids = await fs.promises.readdir(path.join(root, e.name), { withFileTypes: true });
      } catch (_) {
        kids = [];
      }
      for (const k of kids) {
        const rel = e.name + '/' + k.name;
        if (knownRel.has(rel.toLowerCase())) continue;
        out.push(await describeOther(path.join(root, e.name, k.name), rel, k.isDirectory(), repoByStorage));
      }
      continue;
    }
    out.push(await describeOther(path.join(root, e.name), e.name, e.isDirectory(), repoByStorage));
  }
  return out;
}

function closeSqlCache() {
  if (_sqlCache && _sqlCache.db) {
    try {
      _sqlCache.db.close();
    } catch (_) {
      /* already closed */
    }
  }
  _sqlCache = null;
}

async function openSqlJs(file) {
  const st = await fs.promises.stat(file);
  if (_sqlCache && _sqlCache.path === file && _sqlCache.mtimeMs === st.mtimeMs && _sqlCache.size === st.size) {
    return _sqlCache.db;
  }
  closeSqlCache();
  const SQL = await getSqlJs();
  const buf = await fs.promises.readFile(file);
  const db = new SQL.Database(buf);
  _sqlCache = { path: file, mtimeMs: st.mtimeMs, size: st.size, db: db };
  return db;
}

function quoteId(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function cellOut(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return '[BLOB ' + v.length + ' bytes]';
  if (typeof v === 'string' && v.length > MAX_CELL) {
    return v.slice(0, MAX_CELL) + '\n...[truncated ' + (v.length - MAX_CELL) + ' more characters]';
  }
  return v;
}

function buildWhere(cols, search) {
  const q = String(search || '').trim();
  if (!q || !cols.length) return { where: '', params: [] };
  const like = '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
  const parts = cols.map((c) => 'CAST(' + quoteId(c) + " AS TEXT) LIKE ? ESCAPE '\\'");
  return { where: ' WHERE ' + parts.join(' OR '), params: cols.map(() => like) };
}

const TABLES_SQL = "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name";

function nodeAdapter(h) {
  const all = (sql, params) => h.prepare(sql).all(...(params || []));
  return {
    tables: () => all(TABLES_SQL).map((r) => ({ name: r.name, type: r.type })),
    columns: (t) => all('PRAGMA table_info(' + quoteId(t) + ')').map((r) => r.name),
    count: (t, where, params) => Number(all('SELECT COUNT(*) AS n FROM ' + quoteId(t) + where, params)[0].n),
    rows: (t, cols, where, params, limit, offset) => all(
      'SELECT * FROM ' + quoteId(t) + where + ' LIMIT ? OFFSET ?',
      params.concat([limit, offset])
    ).map((r) => cols.map((c) => r[c])),
  };
}

function sqlJsAdapter(db) {
  const exec = (sql, params) => {
    const r = db.exec(sql, params || []);
    return r.length ? r[0] : { columns: [], values: [] };
  };
  return {
    tables: () => exec(TABLES_SQL).values.map((v) => ({ name: v[0], type: v[1] })),
    columns: (t) => exec('PRAGMA table_info(' + quoteId(t) + ')').values.map((v) => v[1]),
    count: (t, where, params) => Number(exec('SELECT COUNT(*) FROM ' + quoteId(t) + where, params).values[0][0]),
    rows: (t, cols, where, params, limit, offset) => exec(
      'SELECT * FROM ' + quoteId(t) + where + ' LIMIT ? OFFSET ?',
      params.concat([limit, offset])
    ).values,
  };
}

async function withDb(file, fn) {
  let handle = null;
  try {
    const { DatabaseSync } = require('node:sqlite');
    handle = new DatabaseSync(file, { readOnly: true });
  } catch (_) {
    handle = null;
  }
  if (handle) {
    try {
      return await fn(nodeAdapter(handle));
    } finally {
      try {
        handle.close();
      } catch (_) {
        /* already closed */
      }
    }
  }
  return fn(sqlJsAdapter(await openSqlJs(file)));
}

function flushLive(file) {
  const rel = path.relative(userRoot(), file).replace(/\\/g, '/').toLowerCase();
  try {
    if (rel === 'symbol-index/index.db') require('../database/db.js').saveImmediate();
    else if (rel === 'error-cop/errors.db') require('../database/errorCopDb.js').forceFlush();
  } catch (_) {
    /* best effort */
  }
}

function maskJson(v, re, key) {
  if (v && typeof v === 'object') {
    if (Array.isArray(v)) return v.map((x) => maskJson(x, re, key));
    const out = {};
    for (const k of Object.keys(v)) out[k] = maskJson(v[k], re, k);
    return out;
  }
  if (key && re.test(key) && v !== null && v !== undefined && v !== '') return MASK;
  return v;
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 4000);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, payload) => {
    try {
      return await fn(payload || {});
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

function register(deps) {
  if (_registered) return;
  _registered = true;
  _config = deps && deps.config ? deps.config : null;

  handle('storageInspector:catalog', async () => {
    const defs = buildKnown();
    const sources = await Promise.all(defs.map(statDef));
    const others = await scanOthers(defs);
    return { success: true, userData: userRoot(), sources: sources, others: others, memory: MEMORY, scannedAt: Date.now() };
  });

  handle('storageInspector:dbTables', async (p) => {
    const file = safePath(p.path);
    if (p.flush) {
      flushLive(file);
      await sleep(300);
    }
    return withDb(file, async (a) => {
      const tables = a.tables().map((t) => {
        let count = null;
        let error = '';
        try {
          count = a.count(t.name, '', []);
        } catch (err) {
          error = err.message;
        }
        return { name: t.name, type: t.type, count: count, error: error, tool: toolForTable(t.name) };
      });
      return { success: true, tables: tables };
    });
  });

  handle('storageInspector:dbRows', async (p) => {
    const file = safePath(p.path);
    const limit = clampInt(p.limit, 1, MAX_ROWS, 50);
    const offset = clampInt(p.offset, 0, 1000000000, 0);
    return withDb(file, async (a) => {
      const names = a.tables().map((t) => t.name);
      if (names.indexOf(p.table) === -1) throw new Error('Unknown table');
      const columns = a.columns(p.table);
      const searchCols = p.reveal ? columns : columns.filter((c) => !COLUMN_SECRET.test(c));
      const w = buildWhere(searchCols, p.search);
      const total = a.count(p.table, w.where, w.params);
      const raw = a.rows(p.table, columns, w.where, w.params, limit, offset);
      const maskedColumns = p.reveal ? [] : columns.filter((c) => COLUMN_SECRET.test(c));
      const rows = raw.map((row) => row.map((v, i) => {
        if (maskedColumns.indexOf(columns[i]) !== -1 && v !== null && v !== undefined && v !== '') return MASK;
        return cellOut(v);
      }));
      return { success: true, columns: columns, rows: rows, total: total, limit: limit, offset: offset, maskedColumns: maskedColumns };
    });
  });

  handle('storageInspector:listDir', async (p) => {
    const dir = safePath(p.path);
    const ents = await fs.promises.readdir(dir, { withFileTypes: true });
    ents.sort((x, y) => {
      if (x.isDirectory() !== y.isDirectory()) return x.isDirectory() ? -1 : 1;
      return x.name.localeCompare(y.name);
    });
    const slice = ents.slice(0, MAX_DIR_ENTRIES);
    const items = [];
    for (const e of slice) {
      const abs = path.join(dir, e.name);
      let st = null;
      try {
        st = await fs.promises.stat(abs);
      } catch (_) {
        st = null;
      }
      const def = knownDef(abs);
      items.push({
        name: e.name,
        abs: abs,
        isDir: e.isDirectory(),
        size: st && !e.isDirectory() ? st.size : null,
        mtime: st ? st.mtimeMs : 0,
        kind: kindOf(e.name, e.isDirectory()),
        internal: isInternal(abs),
        label: def ? def.label : '',
      });
    }
    return { success: true, path: dir, items: items, total: ents.length, truncated: ents.length > MAX_DIR_ENTRIES };
  });

  handle('storageInspector:readFile', async (p) => {
    const file = safePath(p.path);
    const st = await fs.promises.stat(file);
    if (st.isDirectory()) return { success: true, type: 'dir' };
    const base = { success: true, size: st.size, mtime: st.mtimeMs };
    if (isInternal(file)) return Object.assign(base, { type: 'internal' });
    const name = path.basename(file);
    if (DB_EXT.test(name)) return Object.assign(base, { type: 'sqlite' });
    if (IMAGE_EXT.test(name)) {
      if (st.size > MAX_IMAGE) return Object.assign(base, { type: 'binary' });
      const data = await fs.promises.readFile(file);
      const ext = path.extname(name).slice(1).toLowerCase();
      const mime = ext === 'jpg' ? 'jpeg' : ext === 'ico' ? 'x-icon' : ext;
      return Object.assign(base, { type: 'image', dataUrl: 'data:image/' + mime + ';base64,' + data.toString('base64') });
    }
    const fh = await fs.promises.open(file, 'r');
    const buf = Buffer.alloc(Math.min(st.size, MAX_TEXT));
    try {
      await fh.read(buf, 0, buf.length, 0);
    } finally {
      await fh.close();
    }
    if (looksBinary(buf)) return Object.assign(base, { type: 'binary' });
    const text = buf.toString('utf8');
    const truncated = st.size > MAX_TEXT;
    if (!truncated && (/\.json$/i.test(name) || /^\s*[\[{]/.test(text))) {
      try {
        let json = JSON.parse(text);
        const def = knownDef(file);
        const masked = !!(def && def.maskKeys && !p.reveal);
        if (masked) json = maskJson(json, def.maskKeys, null);
        return Object.assign(base, { type: 'json', json: json, masked: masked });
      } catch (_) {
        /* not valid JSON, show as text */
      }
    }
    return Object.assign(base, { type: 'text', text: text, truncated: truncated });
  });

  handle('storageInspector:showInFolder', async (p) => {
    const target = safePath(p.path);
    let isDir = false;
    try {
      isDir = (await fs.promises.stat(target)).isDirectory();
    } catch (_) {
      isDir = false;
    }
    if (isDir) await shell.openPath(target);
    else shell.showItemInFolder(target);
    return { success: true };
  });
}

module.exports = { register };