# HelperTool Knowledge Graph Report

Generated: 2026-07-10T00:53:17.519Z

## Overview

- **Repository**: HelperTool
- **Files**: 389
- **Symbols**: 18406
- **Imports**: 618
- **Graph Nodes**: 389
- **Graph Edges**: 285
- **Features**: 27
- **Concepts**: 9

---

## Feature Map

### core
- **Description**: Core application infrastructure: main process, IPC, preload, utilities, and services
- **Files**: 140 files
  - `Code/config/config.js`
  - `Code/ipc/automation_ipc.js`
  - `Code/ipc/apitool_ipc.js`
  - `Code/ipc/blueprintLibrary/handlers.js`
  - `Code/ipc/blueprintLibrary/db.js`
  - `Code/ipc/blueprintLibrary/index.js`
  - `Code/ipc/blueprintLibrary/motherBoxHandlers.js`
  - `Code/ipc/blueprintLibrary/motherBoxData.js`
  - `Code/ipc/canvas_ipc.js`
  - `Code/ipc/blueprintLibrary/kitHandlers.js`
  - ... and 130 more

### database
- **Description**: SQLite database access layer for all persistent storage
- **Files**: 9 files
  - `Code/database/db.js`
  - `Code/database/chatDb.js`
  - `Code/database/dbInspector.js`
  - `Code/database/imports.js`
  - `Code/database/githubTrees.js`
  - `Code/database/codebaseMap.js`
  - `Code/database/indexedFiles.js`
  - `Code/database/repositories.js`
  - `Code/database/symbols.js`

### indexing
- **Description**: Source code indexing: parsing, symbol extraction, and symbol index management
- **Files**: 9 files
  - `Code/indexer/indexer.js`
  - `Code/indexer/resolver.js`
  - `Code/indexer/parser.js`
  - `Code/indexer/restoreFlag.js`
  - `Code/indexer-service/cache.js`
  - `Code/indexer/watcher.js`
  - `Code/indexer-service/exportToJson.js`
  - `Code/indexer-service/parser.js`
  - `Code/indexer-service/indexer.js`

### knowledgeGraph
- **Description**: Knowledge graph system: graph building, query engine, visualization, and AI enrichment
- **Files**: 11 files
  - `Code/graphify-service/db.js`
  - `Code/graphify-service/exporter.js`
  - `Code/graphify-service/explainer.js`
  - `Code/graphify-service/server.js`
  - `Code/graphify-service/graphBuilder.js`
  - `Code/graphify-service/queryEngine.js`
  - `Code/renderer/graphify/graphifyClient.js`
  - `Code/renderer/graphify/index.js`
  - `Code/renderer/graphify.js`
  - `Code/renderer/graphify/graphifyState.js`
  - ... and 1 more

### git
- **Description**: Git integration: repository management, branch management, diff viewing
- **Files**: 21 files
  - `Code/ipc/git_ipc.js`
  - `Code/renderer/diffViewer.js`
  - `Code/renderer/gitTool/branchManager/graph.js`
  - `Code/renderer/gitTool/branchManager/animations.js`
  - `Code/renderer/gitTool/branchManager/conflictViewer.js`
  - `Code/renderer/gitTool/branchManager/createFlow.js`
  - `Code/renderer/gitTool/branchManager/mergeFlow.js`
  - `Code/renderer/gitTool/branchManager/list.js`
  - `Code/renderer/gitTool/branchManager/index.js`
  - `Code/renderer/gitTool/branchManager/pullRequest.js`
  - ... and 11 more

### chat
- **Description**: Chat interface for codebase conversations and AI-assisted development
- **Files**: 7 files
  - `Code/database/chatDb.js`
  - `Code/renderer/codebbaseChat/chatNLP.js`
  - `Code/renderer/codebbaseChat/chatQueryEngine.js`
  - `Code/renderer/codebbaseChat/chatState.js`
  - `Code/renderer/codebbaseChat/chatRenderer.js`
  - `Code/renderer/codebbaseChat/chatUI.js`
  - `Code/renderer/codebbaseChat.js`

### codeswamp
- **Description**: CodeSwamp: multi-terminal management with code execution and output handling
- **Files**: 20 files
  - `Code/renderer/codeswampUI/buildKitPanel.js`
  - `Code/renderer/codeswampUI/conversationStore.js`
  - `Code/renderer/codeswampUI/history.js`
  - `Code/renderer/codeswampUI/filePicker.js`
  - `Code/renderer/codeswampUI/index.js`
  - `Code/renderer/codeswampUI/chat.js`
  - `Code/renderer/codeswampUI/input.js`
  - `Code/renderer/codeswampUI/loading.js`
  - `Code/renderer/codeswampUI/providers.js`
  - `Code/renderer/codeswampUI/repoTabs.js`
  - ... and 10 more

### canvas
- **Description**: Canvas tool: visual drawing and diagramming within the application
- **Files**: 7 files
  - `Code/renderer/canvasTool/boards.js`
  - `Code/renderer/canvasTool/engine.js`
  - `Code/renderer/canvasTool/shortcutConfig.js`
  - `Code/renderer/canvasTool/template.js`
  - `Code/renderer/canvasTool/state.js`
  - `Code/renderer/canvasTool/tools.js`
  - `Code/renderer/canvasTool.js`

### dbInspector
- **Description**: Database inspector: browse, query, and visualize SQLite database contents
- **Files**: 18 files
  - `Code/renderer/databaseInspector/graph-bundle.css`
  - `Code/renderer/databaseInspector/colors.js`
  - `Code/renderer/databaseInspector/detailsPanel.js`
  - `Code/renderer/databaseInspector/graph.jsx`
  - `Code/renderer/databaseInspector/queryBuilder/formBuilder.js`
  - `Code/renderer/databaseInspector/queryBuilder/index.js`
  - `Code/renderer/databaseInspector/queryBuilder/mongoBuilder.js`
  - `Code/renderer/databaseInspector/graph-bundle.js`
  - `Code/renderer/databaseInspector/queryBuilder/queryTypes.js`
  - `Code/renderer/databaseInspector/queryBuilder/state.js`
  - ... and 8 more

### docker
- **Description**: Docker container management: build, run, and monitor containers
- **Files**: 8 files
  - `Code/renderer/dockerTool/tabs/stats.js`
  - `Code/renderer/dockerTool/logs.js`
  - `Code/renderer/dockerTool/template.js`
  - `Code/renderer/dockerTool/tabs/images.js`
  - `Code/renderer/dockerTool/state.js`
  - `Code/renderer/dockerTool/tabs/containers.js`
  - `Code/renderer/dockerTool/ui.js`
  - `Code/renderer/dockerTool.js`

### secrets
- **Description**: Secret management: secure storage and retrieval of sensitive credentials
- **Files**: 10 files
  - `Code/renderer/secretHolder/index.js`
  - `Code/renderer/secretHolder/lock.js`
  - `Code/renderer/secretHolder/notes.js`
  - `Code/renderer/secretHolder/secrets.js`
  - `Code/renderer/secretHolder/state.js`
  - `Code/renderer/secretHolder/reset.js`
  - `Code/renderer/secretHolder/tabs.js`
  - `Code/renderer/secretHolder/template.js`
  - `Code/renderer/secretHolder/utils.js`
  - `Code/renderer/secretHolder.js`

### video
- **Description**: Video tool: screen recording, video capture, and media processing
- **Files**: 8 files
  - `Code/renderer/videoTool/imageRenderer.js`
  - `Code/renderer/videoTool/imageState.js`
  - `Code/renderer/videoTool/videoPresets.js`
  - `Code/renderer/videoTool/timelineRenderer.js`
  - `Code/renderer/videoTool/videoState.js`
  - `Code/renderer/videoTool/videoUI.js`
  - `Code/renderer/videoTool/videoRenderer.js`
  - `Code/renderer/videoTool.js`

### settings
- **Description**: Settings management: application configuration, preferences, and theming
- **Files**: 10 files
  - `Code/renderer/settingsManager/colors.js`
  - `Code/renderer/settingsManager/core.js`
  - `Code/renderer/settingsManager/features.js`
  - `Code/renderer/settingsManager/index.js`
  - `Code/renderer/settingsManager/state.js`
  - `Code/renderer/settingsManager/ui.js`
  - `Code/renderer/settingsManager/utils.js`
  - `Code/renderer/settingsManager/themes.js`
  - `Code/renderer/settingsManager.js`
  - `Code/renderer/settingsManager/wiring.js`

### shortcuts
- **Description**: Keyboard shortcuts: shortcut definitions, mode management, and key bindings
- **Files**: 11 files
  - `Code/renderer/shortcutMode/index.js`
  - `Code/renderer/shortcutMode/constants.js`
  - `Code/renderer/shortcutMode/levenshtein.js`
  - `Code/renderer/shortcutMode/core.js`
  - `Code/renderer/shortcutMode/modal.js`
  - `Code/renderer/shortcutMode.js`
  - `Code/renderer/shortcuts/parser.js`
  - `Code/renderer/shortcuts/listener.js`
  - `Code/renderer/shortcuts/index.js`
  - `Code/renderer/shortcuts/ui.js`
  - ... and 1 more

### workspace
- **Description**: Workspace management: file tree, project navigation, and workspace organization
- **Files**: 8 files
  - `Code/renderer/workspace/projectManager.js`
  - `Code/renderer/workspace/buildKitManager.js`
  - `Code/renderer/workspace/workerManager.js`
  - `Code/renderer/workspace/ticketManager.js`
  - `Code/renderer/workspace/workspaceRenderer.js`
  - `Code/renderer/workspace/workspaceStore.js`
  - `Code/renderer/workspace/workspaceTool.js`
  - `Code/renderer/workspaceTool.js`

### envManager
- **Description**: Environment variable manager: view and edit environment configurations
- **Files**: 8 files
  - `Code/renderer/envManager/createFlow.js`
  - `Code/renderer/envManager/editor.js`
  - `Code/renderer/envManager/index.js`
  - `Code/renderer/envManager/fileList.js`
  - `Code/renderer/envManager/state.js`
  - `Code/renderer/envManager/template.js`
  - `Code/renderer/envManager/utils.js`
  - `Code/renderer/envManager.js`

### prompts
- **Description**: Prompt management: AI prompt templates and prompt engineering tools
- **Files**: 9 files
  - `Code/renderer/promptTool/categories.js`
  - `Code/renderer/promptTool/index.js`
  - `Code/renderer/promptTool/prompts.js`
  - `Code/renderer/promptTool/state.js`
  - `Code/renderer/promptTool/template.js`
  - `Code/renderer/promptTool/selectionModal.js`
  - `Code/renderer/promptTool/utils.js`
  - `Code/renderer/promptTool/wiring.js`
  - `Code/renderer/promptTool.js`

### fileSeeder
- **Description**: File seeder: generate boilerplate files and project scaffolding
- **Files**: 6 files
  - `Code/renderer/fileSeederTool/index.js`
  - `Code/renderer/fileSeederTool/parser.js`
  - `Code/renderer/fileSeederTool.js`
  - `Code/renderer/fileSeederTool/ui.js`
  - `Code/renderer/fileSeederTool/template.js`
  - `Code/renderer/fileSeederTool/state.js`

### automation
- **Description**: Automation: app manager, automation sketch, and workflow automation
- **Files**: 22 files
  - `Code/renderer/app_manager/dragScroll.js`
  - `Code/renderer/app_manager/generateManager.js`
  - `Code/renderer/app_manager/panels/panelFactory.js`
  - `Code/renderer/app_manager/appState.js`
  - `Code/renderer/app_manager/lightSettingsModal.js`
  - `Code/renderer/app_manager/prefetchManager.js`
  - `Code/renderer/app_manager/panels/panelRegistry.js`
  - `Code/renderer/app_manager/sidebarManager.js`
  - `Code/renderer/app_manager/repoManager.js`
  - `Code/renderer/app_manager/viewManager.js`
  - ... and 12 more

### worker
- **Description**: Worker service: background thread execution for CPU-intensive tasks
- **Files**: 19 files
  - `Code/worker-service/tasks/dbInspector.js`
  - `Code/worker-service/tasks/folderTree.js`
  - `Code/worker-service/tasks/generate.js`
  - `Code/worker-service/tasks/gitGraph.js`
  - `Code/worker-service/tasks/loc.js`
  - `Code/worker-service/tasks/imageToIco.js`
  - `Code/worker-service/tasks/gitBranches.js`
  - `Code/worker-service/tasks/portManager.js`
  - `Code/worker-service/tasks/imageCompress.js`
  - `Code/worker-service/tasks/gitOperations.js`
  - ... and 9 more

### gmail
- **Description**: Gmail integration: send, read, and manage email through Gmail API
- **Files**: 4 files
  - `Code/renderer/gmailTool/gmailState.js`
  - `Code/renderer/gmailTool/gmailTool.js`
  - `Code/renderer/gmailTool/gmailUI.js`
  - `Code/renderer/gmailTool/gmailRenderer.js`

### github
- **Description**: GitHub integration: browse repositories, manage issues and pull requests
- **Files**: 5 files
  - `Code/renderer/githubExplorer/githubTreeRenderer.js`
  - `Code/renderer/githubExplorer/githubTransformer.js`
  - `Code/renderer/githubExplorer/githubState.js`
  - `Code/renderer/githubExplorer/githubUI.js`
  - `Code/renderer/githubExplorer/githubExplorer.js`

### symbolIndex
- **Description**: Symbol index UI: browse and search indexed code symbols
- **Files**: 4 files
  - `Code/renderer/symbolIndex/symbolIndexHandler.js`
  - `Code/renderer/symbolIndex.js`
  - `Code/renderer/symbolIndex/symbolIndexUI.js`
  - `Code/renderer/symbolIndex/symbolIndexManager.js`

### apiTool
- **Description**: API tool: HTTP client for testing and debugging REST APIs
- **Files**: 2 files
  - `Code/renderer/apiTool.js`
  - `Code/renderer/apiToolUI.js`

### uiLayout
- **Description**: UI layout helper: panel management, resizing, and layout persistence
- **Files**: 9 files
  - `Code/renderer/uiLayoutHelper/codeswampBridge.js`
  - `Code/renderer/uiLayoutHelper/dslParser.js`
  - `Code/renderer/uiLayoutHelper/state.js`
  - `Code/renderer/uiLayoutHelper/index.js`
  - `Code/renderer/uiLayoutHelper/layoutEngine.js`
  - `Code/renderer/uiLayoutHelper/template.js`
  - `Code/renderer/uiLayoutHelper/presets.js`
  - `Code/renderer/uiLayoutHelper.js`
  - `Code/renderer/uiLayoutHelper/visualBuilder.js`

### codebaseMap
- **Description**: Codebase map: interactive graph visualization of the codebase structure
- **Files**: 5 files
  - `Code/renderer/codebaseMap.js`
  - `Code/renderer/codebaseMap/codebaseMapGraph.jsx`
  - `Code/renderer/codebaseMap/codebaseMap-graph-bundle.css`
  - `Code/renderer/codebaseMap/codebaseMapUI.js`
  - `Code/renderer/codebaseMap/codebaseMap-graph-bundle.js`

### blueprint
- **Description**: Blueprint library: reusable code patterns and component templates
- **Files**: 1 files
  - `Code/renderer/blueprintLibrary.js`

---

## Top Files by Symbol Count

| File | Symbols | Exported | Functions | Classes | Centrality |
|------|---------|----------|-----------|---------|------------|
| `Code/renderer/codebaseMap/codebaseMap-graph-bundle.js` | 3440 | 0 | 1211 | 2 | 0.005 |
| `Code/renderer/databaseInspector/graph-bundle.js` | 3433 | 0 | 1211 | 2 | 0.000 |
| `Code/renderer/canvasTool/tools.js` | 307 | 0 | 41 | 0 | 0.005 |
| `Code/indexer-service/indexer.js` | 244 | 0 | 64 | 0 | 0.005 |
| `Code/renderer/workspace/workspaceRenderer.js` | 233 | 0 | 36 | 0 | 0.005 |
| `Code/renderer/teamActivityFeed.js` | 203 | 0 | 35 | 0 | 0.000 |
| `Code/renderer/databaseInspector/ui.js` | 198 | 0 | 42 | 0 | 0.000 |
| `Code/renderer/blueprintLibrary.js` | 190 | 0 | 43 | 0 | 0.000 |
| `Code/renderer/profile.js` | 182 | 0 | 30 | 0 | 0.000 |
| `Code/graphify-service/graphBuilder.js` | 181 | 0 | 0 | 1 | 0.008 |
| `Code/renderer/codeswampUI/terminalManager.js` | 160 | 0 | 42 | 0 | 0.000 |
| `Code/renderer/diffViewer.js` | 160 | 0 | 28 | 0 | 0.000 |
| `Code/renderer/canvasTool/engine.js` | 159 | 0 | 46 | 0 | 0.005 |
| `Code/services/gmailService.js` | 155 | 0 | 35 | 0 | 0.003 |
| `Code/ipc/profile.js` | 146 | 0 | 7 | 0 | 0.005 |
| `Code/renderer/canvasTool.js` | 146 | 0 | 26 | 0 | 0.005 |
| `Code/renderer/gitTool/gitToolUI.js` | 145 | 0 | 0 | 1 | 0.000 |
| `Code/renderer/graphify/graphifyUI.js` | 145 | 0 | 27 | 0 | 0.005 |
| `Code/renderer/videoTool/videoUI.js` | 138 | 0 | 0 | 1 | 0.005 |
| `Code/renderer/codebbaseChat/chatUI.js` | 132 | 0 | 0 | 1 | 0.005 |

---

## Top Files by Centrality

| File | Centrality | Fan-In | Fan-Out | Degree |
|------|------------|--------|---------|--------|
| `Code/main.js` | 0.131 | 0 | 0 | 51 |
| `Code/worker-service/worker.js` | 0.093 | 0 | 18 | 36 |
| `Code/database/db.js` | 0.028 | 8 | 0 | 11 |
| `Code/indexer/indexer.js` | 0.026 | 1 | 7 | 10 |
| `Code/database/repositories.js` | 0.018 | 3 | 1 | 7 |
| `Code/ipc/codebaseMap_ipc.js` | 0.018 | 0 | 6 | 7 |
| `Code/database/chatDb.js` | 0.015 | 1 | 0 | 6 |
| `Code/database/imports.js` | 0.015 | 2 | 1 | 6 |
| `Code/database/indexedFiles.js` | 0.015 | 2 | 1 | 6 |
| `Code/database/symbols.js` | 0.015 | 2 | 1 | 6 |
| `Code/graphify-service/server.js` | 0.015 | 0 | 4 | 6 |
| `Code/database/githubTrees.js` | 0.013 | 1 | 1 | 5 |
| `Code/graphify-service/db.js` | 0.013 | 3 | 0 | 5 |
| `Code/graphify-service/queryEngine.js` | 0.013 | 1 | 2 | 5 |
| `Code/ipc/workerProxy.js` | 0.013 | 4 | 0 | 5 |
| `Code/database/codebaseMap.js` | 0.010 | 1 | 0 | 4 |
| `Code/graphify-service/exporter.js` | 0.010 | 1 | 1 | 4 |
| `Code/indexer/parser.js` | 0.010 | 2 | 0 | 4 |
| `Code/indexer/watcher.js` | 0.010 | 1 | 1 | 4 |
| `Code/ipc/symbolIndex_ipc.js` | 0.010 | 0 | 3 | 4 |

---

## Summary Source

| Source | Count |
|--------|-------|
| AI (fileSummaries.json) | 0 |
| Heuristic (path-based) | 389 |

---

## Import Graph Stats

- **Total import relationships**: 67
- **Total semantic edges**: 218

---

## Concepts

### IPC-Communication
- **Description**: Inter-Process Communication between main and renderer processes via Electron ipcMain/ipcRenderer
- **Keywords**: ipcMain, ipcRenderer, contextBridge, handle, invoke, on
- **Locations**: 51 files
  - `Code/ipc/automation_ipc.js`
  - `Code/ipc/apitool_ipc.js`
  - `Code/ipc/blueprintLibrary/handlers.js`
  - `Code/ipc/blueprintLibrary/db.js`
  - `Code/ipc/blueprintLibrary/index.js`
  - ... and 46 more

### Database-Access
- **Description**: SQLite database operations using better-sqlite3 in main process and sql.js in renderer
- **Keywords**: db, database, sql, query, better-sqlite3, sql.js
- **Locations**: 9 files
  - `Code/database/db.js`
  - `Code/database/chatDb.js`
  - `Code/database/dbInspector.js`
  - `Code/database/imports.js`
  - `Code/database/githubTrees.js`
  - ... and 4 more

### Code-Indexing
- **Description**: Source code parsing and symbol extraction pipeline
- **Keywords**: parse, tokenize, symbol, AST, extract
- **Locations**: 10 files
  - `Code/indexer/indexer.js`
  - `Code/indexer/resolver.js`
  - `Code/indexer/parser.js`
  - `Code/indexer/restoreFlag.js`
  - `Code/indexer-service/cache.js`
  - ... and 5 more

### Knowledge-Graph
- **Description**: Graph-based codebase analysis with community detection, query engine, and visualization
- **Keywords**: graph, node, edge, community, visualization
- **Locations**: 13 files
  - `Code/graphify-service/db.js`
  - `Code/graphify-service/exporter.js`
  - `Code/graphify-service/explainer.js`
  - `Code/graphify-service/server.js`
  - `Code/graphify-service/graphBuilder.js`
  - ... and 8 more

### UI-Components
- **Description**: React/Vanilla JS UI components for the renderer process
- **Keywords**: render, component, UI, panel, widget
- **Locations**: 278 files
  - `Code/renderer/apiTool.js`
  - `Code/renderer/apiToolUI.js`
  - `Code/renderer/app_manager/dragScroll.js`
  - `Code/renderer/app_manager/generateManager.js`
  - `Code/renderer/app.js`
  - ... and 273 more

### Worker-Tasks
- **Description**: Background worker thread tasks for CPU-intensive operations
- **Keywords**: worker, thread, task, background
- **Locations**: 19 files
  - `Code/worker-service/tasks/dbInspector.js`
  - `Code/worker-service/tasks/folderTree.js`
  - `Code/worker-service/tasks/generate.js`
  - `Code/worker-service/tasks/gitGraph.js`
  - `Code/worker-service/tasks/loc.js`
  - ... and 14 more

### Git-Integration
- **Description**: Git operations: clone, commit, branch, diff, log, and repository management
- **Keywords**: git, branch, commit, diff, repository
- **Locations**: 21 files
  - `Code/ipc/git_ipc.js`
  - `Code/renderer/diffViewer.js`
  - `Code/renderer/gitTool/branchManager/graph.js`
  - `Code/renderer/gitTool/branchManager/animations.js`
  - `Code/renderer/gitTool/branchManager/conflictViewer.js`
  - ... and 16 more

### Authentication-Secrets
- **Description**: Secure credential storage and API authentication management
- **Keywords**: secret, credential, auth, token, encrypt
- **Locations**: 17 files
  - `Code/ipc/gmail_ipc.js`
  - `Code/renderer/gmailTool/gmailState.js`
  - `Code/renderer/gmailTool/gmailTool.js`
  - `Code/renderer/gmailTool/gmailUI.js`
  - `Code/renderer/gmailTool/gmailRenderer.js`
  - ... and 12 more

### File-System-Operations
- **Description**: File reading, writing, watching, and directory traversal utilities
- **Keywords**: fs, file, path, read, write, watch
- **Locations**: 19 files
  - `Code/renderer/fileSeederTool/index.js`
  - `Code/renderer/fileSeederTool/parser.js`
  - `Code/renderer/fileSeederTool.js`
  - `Code/renderer/fileSeederTool/ui.js`
  - `Code/renderer/fileSeederTool/template.js`
  - ... and 14 more

---

## Architecture Overview

The HelperTool is an Electron desktop application organized in a three-tier architecture:

### 1. Main Process (`Code/main.js`, `Code/ipc/`, `Code/services/`)
- Entry point and lifecycle management
- IPC handlers bridging main and renderer
- Backend service integrations (Gmail, etc.)

### 2. Renderer Process (`Code/renderer/`)
- UI components for all features
- DOM-based rendering (no React/Vue framework)
- Feature modules: git, docker, canvas, video, chat, etc.

### 3. Worker Process (`Code/worker-service/`)
- Background thread for CPU-intensive tasks
- Task-based architecture with 18 task modules

### Shared Layers
- **Database** (`Code/database/`): SQLite access via better-sqlite3 (main) and sql.js (renderer)
- **Indexer** (`Code/indexer/`, `Code/indexer-service/`): Code parsing and symbol extraction
- **Knowledge Graph** (`Code/graphify-service/`): Graph-based codebase analysis
- **Utils** (`Code/utils/`): Shared helper functions

---

## Edge Type Summary

| Type | Count | Description |
|------|-------|-------------|
| COLLABORATES_WITH | 149 | Files belonging to the same feature |
| IMPORTS | 67 | File imports another file (resolved dependency) |
| ORCHESTRATES | 42 | Main process registers/controls IPC handlers |
| EXECUTES | 18 | Worker service dispatches background tasks |
| INITIALIZES | 9 | Main process initializes database modules |

---

## Symbol Type Distribution

| Type | Count |
|------|-------|
| variable | 12912 |
| function | 4589 |
| method | 851 |
| class | 54 |

