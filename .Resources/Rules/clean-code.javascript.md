# Codebase Map: HelperTool

## Architecture Overview

- Modular structure with **11** modules
- **343** files total, **13141** symbols, **545** imports
- Languages: JAVASCRIPT (299), CSS (42), HTML (2)
- Symbols: variable (9369), function (3050), method (682), class (40)

## Modules

### renderer (248 files, 9791 symbols)

Files:
└── renderer/
├── app_manager/
│ ├── panels/
│ │ ├── panelFactory.js (15 syms, javascript)
│ │ │ // panels
│ │ └── panelRegistry.js (23 syms, javascript)
│ │ // panels
│ ├── appState.js (1 syms, javascript)
│ │ // app manager
│ ├── dragScroll.js (10 syms, javascript)
│ │ // app manager
│ ├── generateManager.js (40 syms, 2 imports, javascript)
│ │ // app manager
│ ├── lightSettingsModal.js (20 syms, javascript)
│ │ // app manager
│ ├── prefetchManager.js (11 syms, javascript)
│ │ // app manager
│ ├── repoManager.js (13 syms, 2 imports, javascript)
│ │ // app manager
│ ├── sidebarManager.js (6 syms, javascript)
│ │ // app manager
│ ├── themeManager.js (4 syms, javascript)
│ │ // app manager
│ ├── toolsManager.js (89 syms, 7 imports, javascript)
│ │ // app manager
│ ├── viewManager.js (48 syms, 4 imports, javascript)
│ │ // app manager
│ └── zoomManager.js (14 syms, javascript)
│ // app manager
├── automationSketch/
│ ├── canvas/
│ │ └── canvasEngine.js (107 syms, 1 imports, javascript)
│ │ // canvas
│ ├── nodes/
│ │ ├── nodeFactory.js (6 syms, 1 imports, javascript)
│ │ │ // nodes
│ │ └── nodeRegistry.js (6 syms, javascript)
│ │ // nodes
│ ├── state/
│ │ └── sketchState.js (31 syms, 1 imports, javascript)
│ │ // state
│ ├── ui/
│ │ ├── inspector.js (19 syms, 1 imports, javascript)
│ │ │ // ui
│ │ ├── sidebar.js (9 syms, 1 imports, javascript)
│ │ │ // ui
│ │ ├── sketchList.js (6 syms, javascript)
│ │ │ // ui
│ │ └── toolbar.js (5 syms, javascript)
│ │ // ui
│ └── automationSketch.js (89 syms, 2 imports, javascript)
│ // automationSketch
├── canvasTool/
│ ├── boards.js (28 syms, javascript)
│ │ // canvasTool
│ ├── engine.js (159 syms, javascript)
│ │ // canvasTool
│ ├── shortcutConfig.js (32 syms, 1 imports, javascript)
│ │ // canvasTool
│ ├── state.js (24 syms, javascript)
│ │ // canvasTool
│ ├── template.js (12 syms, javascript)
│ │ // canvasTool
│ └── tools.js (307 syms, javascript)
│ // canvasTool
├── codebaseMap/
│ └── codebaseMapUI.js (68 syms, javascript)
│ // codebaseMap
├── codebbaseChat/
│ ├── chatNLP.js (26 syms, 1 imports, javascript)
│ │ // codebbaseChat
│ ├── chatQueryEngine.js (86 syms, javascript)
│ │ // codebbaseChat
│ ├── chatRenderer.js (56 syms, javascript)
│ │ // codebbaseChat
│ ├── chatState.js (29 syms, javascript)
│ │ // codebbaseChat
│ └── chatUI.js (132 syms, 1 imports, javascript)
│ // codebbaseChat
├── codeswampUI/
│ ├── chat.js (11 syms, 2 imports, javascript)
│ │ // codeswampUI
│ ├── history.js (4 syms, javascript)
│ │ // codeswampUI
│ ├── index.js (20 syms, 5 imports, javascript) ← entry-point
│ │ // Module entry point — re-exports public API
│ ├── input.js (31 syms, 6 imports, javascript)
│ │ // codeswampUI
│ ├── loading.js (19 syms, javascript)
│ │ // codeswampUI
│ ├── promptPicker.js (24 syms, javascript)
│ │ // codeswampUI
│ ├── providers.js (3 syms, javascript)
│ │ // codeswampUI
│ ├── repoTabs.js (28 syms, 3 imports, javascript)
│ │ // codeswampUI
│ ├── sidebar.js (54 syms, 3 imports, javascript)
│ │ // codeswampUI
│ ├── state.js (1 syms, javascript)
│ │ // codeswampUI
│ ├── template.js (1 syms, javascript)
│ │ // codeswampUI
│ ├── terminalManager.js (75 syms, 3 imports, javascript)
│ │ // codeswampUI
│ └── utils.js (21 syms, javascript)
│ // codeswampUI
├── databaseInspector/
│ ├── queryBuilder/
│ │ ├── formBuilder.js (88 syms, 1 imports, javascript)
│ │ │ // queryBuilder
│ │ ├── index.js (12 syms, javascript)
│ │ │ // Module entry point — re-exports public API
│ │ ├── mongoBuilder.js (50 syms, javascript)
│ │ │ // queryBuilder
│ │ ├── queryTypes.js (5 syms, javascript)
│ │ │ // queryBuilder
│ │ ├── sqlPreview.js (4 syms, 1 imports, javascript)
│ │ │ // queryBuilder
│ │ ├── state.js (4 syms, javascript)
│ │ │ // queryBuilder
│ │ ├── tableList.js (12 syms, javascript)
│ │ │ // queryBuilder
│ │ └── utils.js (43 syms, 1 imports, javascript)
│ │ // queryBuilder
│ ├── colors.js (2 syms, javascript)
│ │ // databaseInspector
│ ├── detailsPanel.js (3 syms, 1 imports, javascript)
│ │ // databaseInspector
│ ├── graph-bundle.css (css)
│ │ // databaseInspector
│ ├── graph-bundle.js (3433 syms, javascript)
│ │ // databaseInspector
│ ├── graph.jsx (42 syms, 2 imports, javascript)
│ │ // databaseInspector
│ ├── scanner.js (35 syms, 1 imports, javascript)
│ │ // databaseInspector
│ ├── state.js (2 syms, javascript)
│ │ // databaseInspector
│ ├── template.js (13 syms, javascript)
│ │ // databaseInspector
│ └── ui.js (198 syms, 4 imports, javascript)
│ // databaseInspector
├── dependencies/
│ ├── dependenciesHandler.js (3 syms, javascript)
│ │ // dependencies
│ └── dependenciesUI.js (56 syms, 1 imports, javascript)
│ // dependencies
├── dockerTool/
│ ├── tabs/
│ │ ├── containers.js (15 syms, 2 imports, javascript)
│ │ │ // tabs
│ │ ├── images.js (10 syms, 1 imports, javascript)
│ │ │ // tabs
│ │ └── stats.js (13 syms, 1 imports, javascript)
│ │ // tabs
│ ├── logs.js (8 syms, 1 imports, javascript)
│ │ // dockerTool
│ ├── state.js (5 syms, javascript)
│ │ // dockerTool
│ ├── template.js (7 syms, javascript)
│ │ // dockerTool
│ └── ui.js (7 syms, javascript)
│ // dockerTool
├── envManager/
│ ├── createFlow.js (14 syms, 3 imports, javascript)
│ │ // envManager
│ ├── editor.js (42 syms, 1 imports, javascript)
│ │ // envManager
│ ├── fileList.js (12 syms, 2 imports, javascript)
│ │ // envManager
│ ├── index.js (17 syms, 3 imports, javascript)
│ │ // Module entry point — re-exports public API
│ ├── state.js (2 syms, javascript)
│ │ // envManager
│ ├── template.js (1 syms, javascript)
│ │ // envManager
│ └── utils.js (10 syms, javascript)
│ // envManager
├── fileSeederTool/
│ ├── index.js (12 syms, 1 imports, javascript)
│ │ // Module entry point — re-exports public API
│ ├── parser.js (39 syms, javascript)
│ │ // fileSeederTool
│ ├── state.js (2 syms, javascript)
│ │ // fileSeederTool
│ ├── template.js (1 syms, javascript)
│ │ // fileSeederTool
│ └── ui.js (38 syms, 2 imports, javascript)
│ // fileSeederTool
├── githubExplorer/
│ ├── githubExplorer.js (5 syms, 2 imports, javascript)
│ │ // githubExplorer
│ ├── githubState.js (1 syms, javascript)
│ │ // githubExplorer
│ ├── githubTransformer.js (31 syms, javascript)
│ │ // githubExplorer
│ ├── githubTreeRenderer.js (35 syms, 1 imports, javascript)
│ │ // githubExplorer
│ └── githubUI.js (68 syms, 2 imports, javascript)
│ // githubExplorer
├── gitTool/
│ ├── branchManager/
│ │ ├── animations.js (5 syms, 1 imports, javascript)
│ │ │ // branchManager
│ │ ├── conflictViewer.js (34 syms, 2 imports, javascript)
│ │ │ // branchManager
│ │ ├── createFlow.js (17 syms, 4 imports, javascript)
│ │ │ // branchManager
│ │ ├── graph.js (17 syms, 3 imports, javascript)
│ │ │ // branchManager
│ │ ├── index.js (30 syms, 2 imports, javascript)
│ │ │ // Module entry point — re-exports public API
│ │ ├── list.js (7 syms, javascript)
│ │ │ // branchManager
│ │ ├── mergeFlow.js (16 syms, 1 imports, javascript)
│ │ │ // branchManager
│ │ ├── pullRequest.js (27 syms, 3 imports, javascript)
│ │ │ // branchManager
│ │ ├── remoteOps.js (19 syms, 1 imports, javascript)
│ │ │ // branchManager
│ │ ├── state.js (2 syms, javascript)
│ │ │ // branchManager
│ │ ├── template.js (59 syms, javascript)
│ │ │ // branchManager
│ │ └── utils.js (22 syms, javascript)
│ │ // branchManager
│ ├── branchManager.js (4 syms, javascript)
│ │ // gitTool
│ ├── gitCommandHandler.js (30 syms, javascript)
│ │ // gitTool
│ ├── gitManager.js (41 syms, javascript)
│ │ // gitTool
│ ├── gitPersistence.js (27 syms, javascript)
│ │ // gitTool
│ ├── gitToolUI.js (145 syms, javascript)
│ │ // gitTool
│ └── gitWatcher.js (javascript)
│ // gitTool
├── gmailTool/
│ ├── gmailRenderer.js (68 syms, javascript)
│ │ // gmailTool
│ ├── gmailState.js (17 syms, javascript)
│ │ // gmailTool
│ ├── gmailTool.js (36 syms, 2 imports, javascript)
│ │ // gmailTool
│ └── gmailUI.js (34 syms, javascript)
│ // gmailTool
├── locDetector/
│ ├── locResultsRenderer.js (21 syms, javascript)
│ │ // locDetector
│ ├── locScanner.js (3 syms, javascript)
│ │ // locDetector
│ ├── locSettings.js (8 syms, javascript)
│ │ // locDetector
│ └── locToolUI.js (25 syms, 1 imports, javascript)
│ // locDetector
├── promptTool/
│ ├── categories.js (12 syms, 2 imports, javascript)
│ │ // promptTool
│ ├── index.js (10 syms, 3 imports, javascript)
│ │ // Module entry point — re-exports public API
│ ├── prompts.js (14 syms, 1 imports, javascript)
│ │ // promptTool
│ ├── selectionModal.js (37 syms, 3 imports, javascript)
│ │ // promptTool
│ ├── state.js (12 syms, javascript)
│ │ // promptTool
│ ├── template.js (13 syms, 2 imports, javascript)
│ │ // promptTool
│ ├── utils.js (1 syms, javascript)
│ │ // promptTool
│ └── wiring.js (25 syms, javascript)
│ // promptTool
├── secretHolder/
│ ├── index.js (10 syms, 4 imports, javascript) ← entry-point
│ │ // Module entry point — re-exports public API
│ ├── lock.js (10 syms, javascript)
│ │ // secretHolder
│ ├── notes.js (23 syms, javascript)
│ │ // secretHolder
│ ├── reset.js (4 syms, 1 imports, javascript)
│ │ // secretHolder
│ ├── secrets.js (22 syms, 1 imports, javascript)
│ │ // secretHolder
│ ├── state.js (2 syms, javascript)
│ │ // secretHolder
│ ├── tabs.js (1 syms, 2 imports, javascript)
│ │ // secretHolder
│ ├── template.js (3 syms, javascript)
│ │ // secretHolder
│ └── utils.js (9 syms, javascript)
│ // secretHolder
├── settingsManager/
│ ├── colors.js (7 syms, javascript)
│ │ // settingsManager
│ ├── core.js (7 syms, 3 imports, javascript)
│ │ // settingsManager
│ ├── features.js (7 syms, javascript)
│ │ // settingsManager
│ ├── index.js (3 syms, 4 imports, javascript) ← entry-point
│ │ // Module entry point — re-exports public API
│ ├── state.js (7 syms, javascript)
│ │ // settingsManager
│ ├── themes.js (2 syms, javascript)
│ │ // settingsManager
│ ├── ui.js (13 syms, 2 imports, javascript)
│ │ // settingsManager
│ ├── utils.js (3 syms, 2 imports, javascript)
│ │ // settingsManager
│ └── wiring.js (11 syms, 1 imports, javascript)
│ // settingsManager
├── shortcutMode/
│ ├── constants.js (1 syms, javascript)
│ │ // shortcutMode
│ ├── core.js (43 syms, 5 imports, javascript)
│ │ // shortcutMode
│ ├── index.js (15 syms, 1 imports, javascript)
│ │ // Module entry point — re-exports public API
│ ├── levenshtein.js (9 syms, javascript)
│ │ // shortcutMode
│ └── modal.js (15 syms, javascript)
│ // shortcutMode
├── shortcuts/
│ ├── index.js (3 syms, 1 imports, javascript)
│ │ // Module entry point — re-exports public API
│ ├── listener.js (10 syms, 2 imports, javascript)
│ │ // shortcuts
│ ├── parser.js (12 syms, javascript)
│ │ // shortcuts
│ ├── state.js (7 syms, javascript)
│ │ // shortcuts
│ └── ui.js (36 syms, 1 imports, javascript)
│ // shortcuts
├── styles/
│ ├── api-tool.css (css)
│ │ // styles
│ ├── automation-sketch.css (css)
│ │ // styles
│ ├── base.css (css)
│ │ // styles
│ ├── blueprint-library.css (css)
│ │ // styles
│ ├── branch-manager.css (css)
│ │ // styles
│ ├── canvas-tool.css (css)
│ │ // styles
│ ├── codebase-chat.css (css)
│ │ // styles
│ ├── codebase-map.css (css)
│ │ // styles
│ ├── codeswamp-ui.css (css)
│ │ // styles
│ ├── database-inspector.css (css)
│ │ // styles
│ ├── dependencies.css (css)
│ │ // styles
│ ├── diff-viewer.css (css)
│ │ // styles
│ ├── docignore-manager.css (css)
│ │ // styles
│ ├── docker-tool.css (css)
│ │ // styles
│ ├── env-manager.css (css)
│ │ // styles
│ ├── file-seeder.css (css)
│ │ // styles
│ ├── git-tool.css (css)
│ │ // styles
│ ├── github-explorer.css (css)
│ │ // styles
│ ├── gmail-tool.css (css)
│ │ // styles
│ ├── ignore-panel.css (css)
│ │ // styles
│ ├── layout-chrome.css (css)
│ │ // styles
│ ├── layout-tree.css (css)
│ │ // styles
│ ├── loc-detector.css (css)
│ │ // styles
│ ├── minified.css (css)
│ │ // styles
│ ├── note-mode.css (css)
│ │ // styles
│ ├── port-manager.css (css)
│ │ // styles
│ ├── profile.css (css)
│ │ // styles
│ ├── prompt-tool.css (css)
│ │ // styles
│ ├── query-builder.css (css)
│ │ // styles
│ ├── root-jumper.css (css)
│ │ // styles
│ ├── secret-holder.css (css)
│ │ // styles
│ ├── service-tracker.css (css)
│ │ // styles
│ ├── session-notes.css (css)
│ │ // styles
│ ├── settings.css (css)
│ │ // styles
│ ├── shared-components.css (css)
│ │ // styles
│ ├── shortcuts.css (css)
│ │ // styles
│ ├── symbol-index.css (css)
│ │ // styles
│ ├── team-activity.css (css)
│ │ // styles
│ ├── terminal.css (css)
│ │ // styles
│ ├── video-tool.css (css)
│ │ // styles
│ └── workspaceTool.css (css)
│ // styles
├── symbolIndex/
│ ├── symbolIndexHandler.js (20 syms, javascript)
│ │ // symbolIndex
│ ├── symbolIndexManager.js (4 syms, javascript)
│ │ // symbolIndex
│ └── symbolIndexUI.js (127 syms, 1 imports, javascript)
│ // symbolIndex
├── terminal/
│ └── terminalUI.js (46 syms, javascript)
│ // terminal
├── utils/
│ ├── confirmDialog.js (16 syms, javascript)
│ │ // utils
│ └── contextMenu.js (30 syms, javascript)
│ // utils
├── videoTool/
│ ├── imageRenderer.js (15 syms, javascript)
│ │ // videoTool
│ ├── imageState.js (3 syms, javascript)
│ │ // videoTool
│ ├── timelineRenderer.js (39 syms, javascript)
│ │ // videoTool
│ ├── videoPresets.js (3 syms, javascript)
│ │ // videoTool
│ ├── videoRenderer.js (27 syms, 1 imports, javascript)
│ │ // videoTool
│ ├── videoState.js (34 syms, javascript)
│ │ // videoTool
│ └── videoUI.js (116 syms, javascript)
│ // videoTool
├── workspace/
│ ├── projectManager.js (24 syms, javascript)
│ │ // workspace
│ ├── ticketManager.js (17 syms, 2 imports, javascript)
│ │ // workspace
│ ├── workerManager.js (13 syms, javascript)
│ │ // workspace
│ ├── workspaceRenderer.js (179 syms, 1 imports, javascript)
│ │ // workspace
│ ├── workspaceStore.js (6 syms, javascript)
│ │ // workspace
│ └── workspaceTool.js (9 syms, 2 imports, javascript)
│ // workspace
├── apiTool.js (30 syms, javascript)
│ // renderer
├── apiToolUI.js (120 syms, javascript)
│ // renderer
├── app.js (29 syms, 5 imports, javascript) ← entry-point
│ // Application bootstrap and initialization
├── blueprintLibrary.js (118 syms, javascript)
│ // renderer
├── canvasTool.js (146 syms, 2 imports, javascript)
│ // renderer
├── codebaseMap.js (javascript)
│ // renderer
├── codebbaseChat.js (13 syms, 3 imports, javascript)
│ // renderer
├── codeswampUI.js (6 syms, 2 imports, javascript)
│ // renderer
├── databaseInspector.js (7 syms, 1 imports, javascript)
│ // renderer
├── diffViewer.js (160 syms, javascript)
│ // renderer
├── docignoreManagerUI.js (84 syms, javascript)
│ // renderer
├── dockerTool.js (16 syms, 2 imports, javascript)
│ // renderer
├── envManager.js (1 syms, javascript)
│ // renderer
├── featureManager.js (26 syms, javascript)
│ // renderer
├── fileSeederTool.js (javascript)
│ // renderer
├── fileViewer.js (3 syms, javascript)
│ // renderer
├── filterManager.js (114 syms, javascript)
│ // renderer
├── gitTool.js (12 syms, 3 imports, javascript)
│ // renderer
├── index.html (html)
│ // renderer
├── loc_panel.html (html)
│ // renderer
├── locDetector.js (11 syms, 3 imports, javascript)
│ // renderer
├── portManagerTool.js (39 syms, javascript)
│ // renderer
├── profile.js (182 syms, javascript)
│ // renderer
├── promptTool.js (javascript)
│ // renderer
├── searchManager.js (56 syms, 1 imports, javascript)
│ // renderer
├── secretHolder.js (javascript)
│ // renderer
├── serviceTracker.js (34 syms, javascript)
│ // renderer
├── sessionNotes.js (79 syms, javascript)
│ // renderer
├── settingsManager.js (javascript)
│ // renderer
├── shortcutEntry.js (javascript)
│ // renderer
├── shortcutMode.js (javascript)
│ // renderer
├── swaggerImport.js (30 syms, javascript)
│ // renderer
├── symbolIndex.js (10 syms, 3 imports, javascript)
│ // renderer
├── teamActivityFeed.js (203 syms, javascript)
│ // renderer
├── videoTool.js (63 syms, 3 imports, javascript)
│ // renderer
└── workspaceTool.js (115 syms, 1 imports, javascript)
// renderer
👉 Depends on: (standalone)
Symbols: variable (6633), function (2497), method (626), class (35)

### ipc (38 files, 1216 symbols)

Files:
└── ipc/
├── blueprintLibrary/
│ ├── db.js (2 syms, 1 imports, javascript)
│ │ // blueprintLibrary
│ ├── handlers.js (21 syms, 4 imports, javascript)
│ │ // blueprintLibrary
│ ├── index.js (1 syms, 1 imports, javascript)
│ │ // Module entry point — re-exports public API
│ └── rulesLoader.js (28 syms, 3 imports, javascript)
│ // blueprintLibrary
├── apitool_ipc.js (4 syms, 1 imports, javascript)
│ // ipc
├── automation_ipc.js (6 syms, 2 imports, javascript)
│ // ipc
├── canvas_ipc.js (19 syms, 3 imports, javascript)
│ // ipc
├── codebaseMap_ipc.js (13 syms, 7 imports, javascript)
│ // ipc
├── codebbaseChat_ipc.js (57 syms, 6 imports, javascript)
│ // ipc
├── dbInspector_ipc.js (43 syms, 5 imports, javascript)
│ // ipc
├── docignoreManager_ipc.js (13 syms, 4 imports, javascript)
│ // ipc
├── docker_ipc.js (15 syms, 2 imports, javascript)
│ // ipc
├── env_ipc.js (26 syms, 3 imports, javascript)
│ // ipc
├── features_ipc.js (5 syms, 1 imports, javascript)
│ // ipc
├── fileseeder_ipc.js (3 syms, 2 imports, javascript)
│ // ipc
├── gemini_ipc.js (29 syms, 3 imports, javascript)
│ // ipc
├── generate_ipc.js (11 syms, 4 imports, javascript)
│ // ipc
├── git_ipc.js (107 syms, 16 imports, javascript)
│ // ipc
├── github_ipc.js (20 syms, 3 imports, javascript)
│ // ipc
├── gitService.js (24 syms, 1 imports, javascript)
│ // ipc
├── gmail_ipc.js (38 syms, 2 imports, javascript)
│ // ipc
├── image_ipc.js (16 syms, 5 imports, javascript)
│ // ipc
├── indexerProxy.js (35 syms, 5 imports, javascript)
│ // ipc
├── loc_ipc.js (6 syms, 3 imports, javascript)
│ // ipc
├── opencode_ipc.js (110 syms, 5 imports, javascript)
│ // ipc
├── portManager.js (65 syms, 5 imports, javascript)
│ // ipc
├── prefetchService.js (59 syms, 10 imports, javascript)
│ // ipc
├── profile.js (146 syms, 18 imports, javascript)
│ // ipc
├── prompts_ipc.js (4 syms, 2 imports, javascript)
│ // ipc
├── repo_ipc.js (47 syms, 5 imports, javascript)
│ // ipc
├── secrets_ipc.js (17 syms, 4 imports, javascript)
│ // ipc
├── serviceTracker_ipc.js (7 syms, 1 imports, javascript)
│ // ipc
├── symbolIndex_ipc.js (78 syms, 8 imports, javascript)
│ // ipc
├── teamActivityFeed.js (53 syms, 5 imports, javascript)
│ // ipc
├── terminal_ipc.js (26 syms, 5 imports, javascript)
│ // ipc
├── video_ipc.js (22 syms, 3 imports, javascript)
│ // ipc
├── workerProxy.js (31 syms, 4 imports, javascript)
│ // ipc
└── workspace_ipc.js (9 syms, 3 imports, javascript)
// ipc
👉 Depends on: root
Symbols: variable (1045), function (157), method (13), class (1)

### worker-service (18 files, 589 symbols)

Files:
└── worker-service/
├── tasks/
│ ├── dbInspector.js (111 syms, 5 imports, javascript)
│ │ // tasks
│ ├── folderTree.js (10 syms, 3 imports, javascript)
│ │ // tasks
│ ├── generate.js (48 syms, 4 imports, javascript)
│ │ // tasks
│ ├── gitBranches.js (27 syms, 1 imports, javascript)
│ │ // tasks
│ ├── gitGraph.js (27 syms, 1 imports, javascript)
│ │ // tasks
│ ├── gitOperations.js (28 syms, 2 imports, javascript)
│ │ // tasks
│ ├── imageToIco.js (33 syms, 4 imports, javascript)
│ │ // tasks
│ ├── loc.js (27 syms, 3 imports, javascript)
│ │ // tasks
│ ├── portManager.js (32 syms, 1 imports, javascript)
│ │ // tasks
│ ├── profileData.js (50 syms, 3 imports, javascript)
│ │ // tasks
│ ├── profileSync.js (10 syms, 2 imports, javascript)
│ │ // tasks
│ ├── teamActivity.js (29 syms, 1 imports, javascript)
│ │ // tasks
│ ├── videoCompress.js (35 syms, 6 imports, javascript)
│ │ // tasks
│ ├── videoPreview.js (15 syms, 5 imports, javascript)
│ │ // tasks
│ ├── videoRender.js (27 syms, 5 imports, javascript)
│ │ // tasks
│ ├── videoToGif.js (48 syms, 6 imports, javascript)
│ │ // tasks
│ └── walkDir.js (12 syms, 3 imports, javascript)
│ // tasks
└── worker.js (20 syms, 17 imports, javascript)
// worker service
👉 Depends on: root
Symbols: variable (488), function (94), method (6), class (1)

### database (9 files, 414 symbols)

Files:
└── database/
├── chatDb.js (22 syms, 3 imports, javascript)
│ // database
├── codebaseMap.js (125 syms, 1 imports, javascript)
│ // database
├── db.js (38 syms, 6 imports, javascript)
│ // database
├── dbInspector.js (75 syms, 1 imports, javascript)
│ // database
├── githubTrees.js (13 syms, 1 imports, javascript)
│ // database
├── imports.js (31 syms, 1 imports, javascript)
│ // database
├── indexedFiles.js (39 syms, 1 imports, javascript)
│ // database
├── repositories.js (22 syms, 1 imports, javascript)
│ // database
└── symbols.js (49 syms, 1 imports, javascript)
// database
👉 Depends on: root
Symbols: variable (322), function (92)

### preload (9 files, 11 symbols)

Files:
└── preload/
├── apitool_bridge.js (1 syms, 1 imports, javascript)
│ // preload
├── features_bridge.js (1 syms, 1 imports, javascript)
│ // preload
├── fileseeder_bridge.js (1 syms, 1 imports, javascript)
│ // preload
├── generate_bridge.js (2 syms, 1 imports, javascript)
│ // preload
├── git_bridge.js (1 syms, 1 imports, javascript)
│ // preload
├── loc_bridge.js (2 syms, 1 imports, javascript)
│ // preload
├── repo_bridge.js (1 syms, 1 imports, javascript)
│ // preload
├── secrets_bridge.js (1 syms, 1 imports, javascript)
│ // preload
└── workspace_bridge.js (1 syms, 1 imports, javascript)
// preload
👉 Depends on: root
Symbols: variable (11)

### utils (8 files, 237 symbols)

Files:
└── utils/
├── codeOps.js (31 syms, 3 imports, javascript)
│ // utils
├── docignore.js (21 syms, 4 imports, javascript)
│ // utils
├── dockerClient.js (22 syms, 1 imports, javascript)
│ // utils
├── fileOps.js (28 syms, 3 imports, javascript)
│ // utils
├── fileSeeder.js (11 syms, 2 imports, javascript)
│ // utils
├── gitOps.js (35 syms, 2 imports, javascript)
│ // utils
├── promptStore.js (46 syms, 2 imports, javascript)
│ // utils
└── treeView.js (43 syms, javascript)
// utils
👉 Depends on: root
Symbols: variable (166), function (55), method (15), class (1)

### indexer (5 files, 203 symbols)

Files:
└── indexer/
├── indexer.js (64 syms, 10 imports, javascript)
│ // indexer
├── parser.js (101 syms, 2 imports, javascript)
│ // indexer
├── resolver.js (11 syms, 2 imports, javascript)
│ // indexer
├── restoreFlag.js (10 syms, 2 imports, javascript)
│ // indexer
└── watcher.js (17 syms, 3 imports, javascript)
// indexer
👉 Depends on: root
Symbols: variable (172), function (31)

### indexer-service (3 files, 388 symbols)

Files:
└── indexer-service/
├── cache.js (102 syms, javascript)
│ // indexer service
├── indexer.js (242 syms, 7 imports, javascript)
│ // indexer service
└── parser.js (44 syms, javascript)
// indexer service
👉 Depends on: root
Symbols: variable (295), function (69), method (22), class (2)

### root (2 files, 106 symbols)

Files:
├── main.js (70 syms, 48 imports, javascript) ← entry-point
│ // Application bootstrap and initialization
└── preload.js (36 syms, 1 imports, javascript)
// Code
👉 Depends on: (standalone)
👈 Used by: config, database, indexer, indexer-service, ipc, preload, services, utils, worker-service
Symbols: variable (100), function (6)

### services (2 files, 168 symbols)

Files:
└── services/
├── automationStore.js (18 syms, 3 imports, javascript)
│ // services
└── gmailService.js (150 syms, 7 imports, javascript)
// services
👉 Depends on: root
Symbols: variable (126), function (42)

### config (1 file, 18 symbols)

Files:
└── config/
└── config.js (18 syms, 3 imports, javascript) ← config
// Configuration and environment settings
👉 Depends on: root
Symbols: variable (11), function (7)

## Key Files

- Code/ipc/blueprintLibrary/index.js — 1 imports, 0 dependents
- Code/main.js — 48 imports, 0 dependents (entry point)
- Code/renderer/app.js — 5 imports, 0 dependents
- Code/renderer/codeswampUI/index.js — 5 imports, 0 dependents
- Code/renderer/databaseInspector/queryBuilder/index.js — 0 imports, 0 dependents
- Code/renderer/envManager/index.js — 3 imports, 0 dependents
- Code/renderer/fileSeederTool/index.js — 1 imports, 0 dependents
- Code/renderer/gitTool/branchManager/index.js — 2 imports, 0 dependents
- Code/renderer/index.html — 0 imports, 0 dependents
- Code/renderer/promptTool/index.js — 3 imports, 0 dependents
