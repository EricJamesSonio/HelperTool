# Knowledge Graph: HelperTool

- **Graph Version:** 2
- **Generated At:** 2026-07-14T11:40:57.842Z
- **Total Nodes:** 394
- **Total Edges:** 328
- **Total Features:** 27
- **Total Concepts:** 9

## Incremental Update Info

| Metric | Value |
|--------|-------|
| Total | 394 |
| Reused | 389 |
| Rebuilt | 0 |
| New | 5 |
| Changed | 13 |
| Neighbor Affected | 0 |
| Affected Set Size | 18 |

## Changed Files

| File | Summary | Symbols | Functions |
|------|---------|---------|-----------|
| Code/database/changeDetector.js | Database access layer for changeDetector. Provides CRUD operations via better-sqlite3 or sql.js. | 91 | 15 |
| Code/database/errorCopDb.js | Database access layer for errorCopDb. Provides CRUD operations via better-sqlite3 or sql.js. | 24 | 8 |
| Code/database/symbolsJsonLoader.js | Database access layer for symbolsJsonLoader. Provides CRUD operations via better-sqlite3 or sql.js. | 41 | 11 |
| Code/graphify-service/db.js | Graphify service db. Part of the knowledge graph system for codebase analysis. | 26 | 7 |
| Code/graphify-service/exporter.js | Graphify service exporter. Part of the knowledge graph system for codebase analysis. | 41 | 6 |
| Code/graphify-service/graphBuilder.js | Graphify service graphBuilder. Part of the knowledge graph system for codebase analysis. | 231 | 5 |
| Code/graphify-service/queryEngine.js | Graphify service queryEngine. Part of the knowledge graph system for codebase analysis. | 62 | 8 |
| Code/graphify-service/server.js | Graphify service server. Part of the knowledge graph system for codebase analysis. | 124 | 35 |
| Code/indexer/watcher.js | Codebase indexer watcher. Parses source code to extract symbols, imports, and structure. | 17 | 3 |
| Code/ipc/git_ipc.js | IPC handler for git_ipc. Manages inter-process communication between main and renderer processes. | 108 | 1 |
| Code/ipc/graphify_ipc.js | IPC handler for graphify_ipc. Manages inter-process communication between main and renderer processes. | 128 | 16 |
| Code/ipc/symbolIndex_ipc.js | IPC handler for symbolIndex_ipc. Manages inter-process communication between main and renderer processes. | 96 | 3 |
| Code/preload.js | Preload script. Context bridge between main and renderer processes via Electron contextBridge. | 38 | 0 |
| Code/renderer/graphify/graphifyState.js | Graphify renderer graphifyState. Knowledge graph visualization in the renderer process. | 11 | 6 |
| Code/renderer/graphify/graphifyUI.js | Graphify renderer graphifyUI. Knowledge graph visualization in the renderer process. | 332 | 47 |
| Code/renderer/styles/graphify.css | Render process module graphify.css. UI component for the HelperTool application. | 0 | 0 |
| Code/terminal/error-cop/browser-collector.js | Error Cop browser-collector. Error collection and analysis for terminal error monitoring. | 36 | 0 |
| Code/terminal/error-cop/error-parser.js | Error Cop error-parser. Error collection and analysis for terminal error monitoring. | 8 | 2 |

## Stats

- Total Symbols: 19007
- Total Functions: 4674
- Total Classes: 55
- Total Methods: 1245
- Total Variables: 12466

## Features

### core
- Description: Core application infrastructure: main process, IPC, preload, utilities, and services
- Files: 140

### database
- Description: SQLite database access layer for all persistent storage
- Files: 12

### indexing
- Description: Source code indexing: parsing, symbol extraction, and symbol index management
- Files: 9

### knowledgeGraph
- Description: Knowledge graph system: graph building, query engine, visualization, and AI enrichment
- Files: 13

### git
- Description: Git integration: repository management, branch management, diff viewing
- Files: 21

### chat
- Description: Chat interface for codebase conversations and AI-assisted development
- Files: 7

### codeswamp
- Description: CodeSwamp: multi-terminal management with code execution and output handling
- Files: 20

### canvas
- Description: Canvas tool: visual drawing and diagramming within the application
- Files: 7

### dbInspector
- Description: Database inspector: browse, query, and visualize SQLite database contents
- Files: 18

### docker
- Description: Docker container management: build, run, and monitor containers
- Files: 8

### secrets
- Description: Secret management: secure storage and retrieval of sensitive credentials
- Files: 10

### video
- Description: Video tool: screen recording, video capture, and media processing
- Files: 8

### settings
- Description: Settings management: application configuration, preferences, and theming
- Files: 10

### shortcuts
- Description: Keyboard shortcuts: shortcut definitions, mode management, and key bindings
- Files: 11

### workspace
- Description: Workspace management: file tree, project navigation, and workspace organization
- Files: 8

### envManager
- Description: Environment variable manager: view and edit environment configurations
- Files: 8

### prompts
- Description: Prompt management: AI prompt templates and prompt engineering tools
- Files: 9

### fileSeeder
- Description: File seeder: generate boilerplate files and project scaffolding
- Files: 6

### automation
- Description: Automation: app manager, automation sketch, and workflow automation
- Files: 22

### worker
- Description: Worker service: background thread execution for CPU-intensive tasks
- Files: 19

### gmail
- Description: Gmail integration: send, read, and manage email through Gmail API
- Files: 4

### github
- Description: GitHub integration: browse repositories, manage issues and pull requests
- Files: 5

### symbolIndex
- Description: Symbol index UI: browse and search indexed code symbols
- Files: 4

### apiTool
- Description: API tool: HTTP client for testing and debugging REST APIs
- Files: 2

### uiLayout
- Description: UI layout helper: panel management, resizing, and layout persistence
- Files: 9

### codebaseMap
- Description: Codebase map: interactive graph visualization of the codebase structure
- Files: 5

### blueprint
- Description: Blueprint library: reusable code patterns and component templates
- Files: 1

## Concepts

### IPC-Communication
- Description: Inter-Process Communication between main and renderer processes via Electron ipcMain/ipcRenderer
- Locations: 51
- Keywords: ipcMain, ipcRenderer, contextBridge, handle, invoke, on

### Database-Access
- Description: SQLite database operations using better-sqlite3 in main process and sql.js in renderer
- Locations: 12
- Keywords: db, database, sql, query, better-sqlite3, sql.js

### Code-Indexing
- Description: Source code parsing and symbol extraction pipeline
- Locations: 10
- Keywords: parse, tokenize, symbol, AST, extract

### Knowledge-Graph
- Description: Graph-based codebase analysis with community detection, query engine, and visualization
- Locations: 13
- Keywords: graph, node, edge, community, visualization

### UI-Components
- Description: React/Vanilla JS UI components for the renderer process
- Locations: 278
- Keywords: render, component, UI, panel, widget

### Worker-Tasks
- Description: Background worker thread tasks for CPU-intensive operations
- Locations: 19
- Keywords: worker, thread, task, background

### Git-Integration
- Description: Git operations: clone, commit, branch, diff, log, and repository management
- Locations: 21
- Keywords: git, branch, commit, diff, repository

### Authentication-Secrets
- Description: Secure credential storage and API authentication management
- Locations: 17
- Keywords: secret, credential, auth, token, encrypt

### File-System-Operations
- Description: File reading, writing, watching, and directory traversal utilities
- Locations: 19
- Keywords: fs, file, path, read, write, watch

