# HelperTool — Project Overview

**Author:** Eric Sonio  
**Version:** 1.0.0  
**Description:** Tray-based developer helper tool for managing repos, writing prompts, testing APIs, and exploring databases.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Electron v39 |
| Language | JavaScript (ES modules renderer, CommonJS main) |
| UI | React v19 + custom CSS |
| Bundler | esbuild (for DB Inspector graph only) |
| Packaging | electron-builder (NSIS Windows installer) |

---

## Database

**SQLite via sql.js** (WASM, no native dependencies)

- Runs in-memory, persisted to `<userData>/symbol-index/index.db`
- WAL journal mode, foreign keys enabled
- Tables: repositories, indexed_files, symbols, symbols_fts (FTS5), file_imports, boards, db_connections, schema_snapshots, schema_tables, schema_columns, schema_relationships, schema_indexes, seed_scripts

---

## Storage

**localStorage keys:**
| Key | Purpose |
|-----|---------|
| helpertool-theme | Theme fallback |
| helpertool-settings | Full theme engine config |
| helpertool-viewmode | Tree view mode (list/tree) |
| helpertool-shortcuts | Keyboard shortcut mappings |
| helpertool-canvas-shortcuts | Canvas tool shortcuts |
| git-commits-* | Per-repo commit history |
| secret-holder-notes | Encrypted notes |
| dbi_grid_cols | DB Inspector grid layout |
| dbi_panel_state | DB Inspector panel state |
| loc-settings | LOC Detector settings |

**On-disk JSON:** helper-config.json for feature flags.

---

## Features

### Sidebar Tools
| Tool | Description |
|------|-------------|
| **API Tool** 🔌 | Built-in API tester + Swagger/OpenAPI import |
| **Prompt Tool** 🧩 | Manage custom AI prompts |
| **Git Tool** 🔄 | Stage, commit & push changes |
| **File Seeder** 🌱 | Seed file templates into folders |
| **LOC Detector** 📏 | Find bloated files by line count |
| **Settings** 🎨 | Appearance & features panel |
| **Secret Holder** 🔐 | Password-protected vault for keys & notes |
| **CLI Tool** ⌨️ | Keyboard shortcut configuration |
| **Workspace** 👥 | Projects, tickets & worker management |
| **Symbol Index** 🔍 | AST-based code symbol search & navigation |
| **Canvas** 🎨 | Infinite drawing canvas for diagrams & sketches |
| **DB Inspector** 🗃️ | Database schema visualizer & query tool (Postgres, MySQL, SQLite, MongoDB) |

### Built-in Features
| Feature | Description |
|---------|-------------|
| **File tree browser** | Navigate repo files with folder tree |
| **Extension filter/ignore** | Show/hide files by extension |
| **Generate output** | Export repo structure as text (Normal, Minified, Prompt modes) |
| **Search** | File/folder search with fuzzy scoring |
| **Shortcut mode** | Paste file paths to auto-select in tree |
| **Dependency viewer** | Right-click to see file imports/dependencies |
| **Context menus** | Right-click files/folders for seed, LOC, dependencies |
| **Code symbol indexing** | AST parsing via tree-sitter (JS, TS, Python, CSS, HTML) |
| **Theme engine** | 20 themes + accent pickers + compact mode |

---

## Dependencies

**Key runtime packages:** electron, react, reactflow, sql.js, pg, mysql2, mongodb, chokidar, simple-git, micromatch, web-tree-sitter + tree-sitter grammars for JS, TS, Python, CSS, HTML.

**Dev:** electron-builder, esbuild

---

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| start | npm start | Launch app in dev mode |
| build | npm run build | Package for distribution (all platforms) |
| build:win | npm run build:win | Package for Windows only |
| build:dbgraph | npm run build:dbgraph | Bundle DB Inspector ReactFlow graph |

---

## Architecture

```
main.js  ── Electron main process
 ├── config/         JSON config file management
 ├── database/       SQLite schema, CRUD (db.js, dbInspector.js)
 ├── ipc/            13 IPC handler modules
 ├── indexer/        AST indexer, parser, watcher
 ├── grammars/       tree-sitter WASM grammars
 ├── preload.js      Context bridge (electronAPI)
 └── renderer/       Frontend
      ├── app.js         Bootstrap
      ├── featureManager.js  Feature flag system
      ├── app_manager/   Theme, view, repo, tools managers
      ├── settingsManager/  Settings panels
      ├── tool modules   (apiTool, gitTool, canvasTool, etc.)
      ├── databaseInspector/  DB schema visualizer (ReactFlow)
      ├── shortcuts/     Keyboard shortcut manager
      ├── styles/        18 CSS files
      └── utils/         Context menu, confirm dialog
```
