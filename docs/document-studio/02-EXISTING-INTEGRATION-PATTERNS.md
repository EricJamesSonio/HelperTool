# 02 — Existing Integration Patterns (Simple + Complex Tools)

**Evidence status:** All traces below are verified against source code at commit `60c9531`. This document shows how an
existing tool travels from a user click to backend execution and back. It is the template future agents should follow
when integrating Document Studio.

---

## 1. Integration pattern summary (CONFIRMED)

Every HelperTool tool follows the same end-to-end path:

```
User clicks sidebar item
  → toolsManager.js RUN[key] (lazy-imports the tool module)
  → Tool module renders into a panel (panelFactory.createPanel)
  → Tool calls window.electronAPI.<domain>.<op>(payload)  [preload]
  → preload: ipcRenderer.invoke('channel:<op>', payload)
  → Main: ipcMain.handle('channel:<op>', ...)  [Code/ipc/*_ipc.js]
  → (if CPU-heavy) workerProxy.send('task:type', payload) → forks worker-service/worker.js
  → Worker task processes, calls onProgress(data)
  → workerProxy forwards progress → main win.webContents.send('channel:progress', ...)
  → preload: ipcRenderer.on('channel:progress', callback)
  → Tool UI updates state
  → Worker returns { id, type: 'result', data } → ipcMain.handle resolves
  → preload invoke promise resolves { success: true, ...result } or { success: false, error }
  → Tool UI shows result / error
```

### Key files (CONFIRMED paths)

| Concern | File |
|---------|------|
| Tool registry | `Code/renderer/app_manager/toolsManager.js` (`TOOLS` array + `RUN` object) |
| Sidebar items | `Code/renderer/app_manager/sidebarManager.js` (`TOOL_FEATURE` map, `createSidebarItem`) |
| Panel creation | `Code/renderer/app_manager/panels/panelFactory.js` (`createPanel()`) |
| Panel lifecycle | `Code/renderer/app_manager/panels/panelRegistry.js` (`closeAll()` = single-active-tool) |
| Preload bridge | `Code/preload.js` (`contextBridge.exposeInMainWorld`) |
| IPC handlers | `Code/ipc/<tool>_ipc.js` (`ipcMain.handle`) |
| Worker proxy | `Code/ipc/workerProxy.js` (`fork` worker, request/response, progress) |
| Worker entry | `Code/worker-service/worker.js` (message dispatch) |
| Worker tasks | `Code/worker-service/tasks/<task>.js` |
| Feature flags | `Code/ipc/features_ipc.js` + `Code/config/config.js` |

---

## 2. Execution-path diagram (Mermaid)

```mermaid
flowchart LR
    U[User clicks sidebar tool]
    TM[toolsManager.js RUN[key]]:::js
    PM[panelFactory.createPanel()]:::js
    UI[tool module renders into panel]:::js
    PA[window.electronAPI.<op>()]:::js
    PRE[preload: ipcRenderer.invoke]:::js
    IPC[ipcMain.handle channel:<op>]:::main
    WP[workerProxy.send task:type]:::main
    WK[worker-service/worker.js]:::worker
    TS[worker task: ffmpeg / loc / etc.]:::worker
    PROG[win.webContents.send channel:progress]:::main
    PRE2[preload: ipcRenderer.on progress]:::js

    U --> TM
    TM --> PM
    PM --> UI
    UI --> PA
    PA --> PRE
    PRE --> IPC
    IPC -->|CPU-heavy| WP
    WP --> WK
    WK --> TS
    TS -->|onProgress| PROG
    PROG --> PRE2
    PRE2 --> UI
    TS -->|result| WK
    WK -->|result| IPC
    IPC -->|resolve| PRE
    PRE -->|promise| UI

    classDef js fill:#e1f5fe,stroke:#01579b;
    classDef main fill:#fff3e0,stroke:#e65100;
    classDef worker fill:#f3e5f5,stroke:#4a148c;
```

---

## 3. Conventions future agents must follow (CONFIRMED patterns)

| Convention | Requirement | Source |
|------------|-------------|--------|
| Tool registration | Add `{ id, key, flag, icon, name, desc, shortcut }` to `TOOLS` in `toolsManager.js` | toolsManager.js:736-774 |
| RUN action | Add `RUN.<key>` async function: toggle, `closeAll()`, init panel + tool, show panel | toolsManager.js:457-733 |
| Panel | Use `panelFactory.createPanel({ id, className, title, containerId, closeBtnId })` | panelFactory.js:10-49 |
| Feature flag | Add flag to `TOOL_FEATURE` in `sidebarManager.js`; default in `config.js` features | sidebarManager.js:9-45, config.js:22-62 |
| Preload bridge | Add methods to a bridge object, spread into `electronAPI` (or standalone `contextBridge.exposeInMainWorld`), using `ipcRenderer.invoke` / `ipcRenderer.on` + `removeAllListeners` | preload.js |
| IPC handler | Register `ipcMain.handle('channel:<op>', ...)` in `Code/ipc/<tool>_ipc.js`; call via `safeRegister` / `FEATURE_IPC` in `registerAllIpc` | main.js:227-363 |
| Response envelope | Return `{ success: true, ...result }` or `{ success: false, error }` | loc_ipc.js, image_ipc.js, video_ipc.js |
| Progress | `win.webContents.send('channel:progress', data)` from IPC handler; renderer listens via `ipcRenderer.on('channel:progress', ...)` | video_ipc.js, image_ipc.js |
| CPU-heavy work | Offload to `workerProxy.send('task:type', payload)`; worker task in `worker-service/tasks/`; register in `worker.js` `progressTasks`/`tasks` | worker.js, workerProxy.js |
| Dialogs | Use `dialog.showOpenDialog`/`showSaveDialog` in main process; return paths to renderer; renderer never calls Node fs/dialog | video_ipc.js, image_ipc.js |
| File validation | Validate input paths exist (`fs.existsSync`); use dialog filters | loc_ipc.js:8-9 |
| Child processes | `child_process.spawn` (no shell) from worker process | videoCompress.js:101 |
| Shutdown cleanup | Tool `destroy()` removes listeners, resets state, clears container | videoTool.js:63-70 |
| Single-active-tool | Opening a tool closes all others via `PanelRegistry.closeAll()` | panelRegistry.js:66-171 |
| Error handling | Wrap IPC handler bodies in try/catch; return error envelope; never throw to renderer | loc_ipc.js, video_ipc.js |


---

## 4. Simple tool trace — LOC Detector (CONFIRMED)

### 4.1 Files involved

| Layer | File | Role |
|-------|------|------|
| Registry entry | `Code/renderer/app_manager/toolsManager.js:745` | `{ id:'loc', key:'loc', flag:'locDetector', name:'LOC Detector', ... }` |
| RUN action | `Code/renderer/app_manager/toolsManager.js:520-524` | `RUN.loc` → `locDetector.open(folderPath, name)` |
| Tool module | `Code/renderer/locDetector.js` | exports `open/close/isOpen/initLocDetector` |
| Panel | `Code/renderer/locDetector.js` creates its own `.loc-detector-panel` DOM | slide-over panel |
| IPC handler | `Code/ipc/loc_ipc.js` | `loc:scan`, `loc:openFile` |
| Worker proxy | `Code/ipc/workerProxy.js` | `workerProxy.send('loc:scan', ...)` |
| Worker task | `Code/worker-service/tasks/loc.js` | walks folder tree, counts lines per file |
| Worker entry | `Code/worker-service/worker.js:11` | `'loc:scan': lazy('./tasks/loc')` (simple task, no progress) |
| Feature flag | `locDetector` (config.js:50, default `false`) |

### 4.2 Execution trace

1. **User clicks** the "LOC Detector" sidebar item → `toolsManager.js` `_run('loc', item)` → `RUN.loc()` (line 520).
   - If already open, `locDetector.close()` and return.
   - Else `_registry.closeAll()` (single-active-tool), then `locDetector.open(state.selectedRepoPath || '', name)`.
2. `locDetector.open()` (renderer/locDetector.js:53):
   - `_ensureInit()`: `new LocScanner()`, `new LocSettings().load()`.
   - `_ensurePanel()`: creates `div.loc-detector-panel`, appends to `document.body`, wires close button + Escape key, instantiates `LocToolUI` into `#locDetectorBody`.
   - `_panel.classList.add('open')`.
3. UI triggers a scan → `window.electronAPI.loc.scan(options)` (preload `locBridge`, line 207: `scan: (options) => ipcRenderer.invoke('loc:scan', options)`).
4. **Main** `loc_ipc.js:6-16`: `ipcMain.handle('loc:scan', ...)` validates `rootPath` exists (`fs.existsSync`), loads ignore rules via `docignoreUtils.getIgnoreRules(rootPath)`, returns `await workerProxy.send('loc:scan', { rootPath, threshold, mode, ignoreRules })`. On failure returns `{ success: false, error }`.
5. **Worker** `workerProxy.send('loc:scan', payload)` → `worker.js` dispatches to `tasks/loc.js` (`tasks['loc:scan']`). `loc.js` walks the tree and counts lines; `worker.js` sends `{ id, type: 'result', data: result }`.
6. `loc_ipc.js` resolves `{ success: true, ...result }` (or `{ success: false, error }`).
7. Renderer receives the promise result, updates `LocToolUI` state, displays line counts.

### 4.3 Notes for Document Studio

- LOC Detector is UI-side scan + worker for counting; `loc:scan` is a **simple task** (not in `progressTasks`), so no progress events.
- The tool module manages its own panel DOM rather than `panelFactory` (a deviation, acceptable for simple tools).
- Feature flag `locDetector` defaults to `false` — disabled until first-launch setup.
- No persistence of scan results beyond the session (no DB table for LOC results).


---

## 5. Complex/background tool trace — Video Compressor (CONFIRMED)

### 5.1 Files involved

| Layer | File | Role |
|-------|------|------|
| Registry entry | `Code/renderer/app_manager/toolsManager.js:741` | `{ id:'video', key:'video', flag:'videoTool', name:'Video Compressor', ... }` |
| RUN action | `Code/renderer/app_manager/toolsManager.js:488-494` | `RUN.video` — init panel + `_initializeVideoTool()` |
| Panel factory | `Code/renderer/app_manager/panels/panelFactory.js:93-101` | `createVideoPanel()` → `#videoToolPanel` / `#videoToolContainer` |
| Tool module | `Code/renderer/videoTool.js` | class `VideoTool` (`initialize/render/destroy`) |
| State | `Code/renderer/videoTool/videoState.js` | `VideoState`, `ImageState` |
| UI | `Code/renderer/videoTool/videoUI.js` | `VideoUI` renders into container |
| Preload bridge | `Code/preload.js:533-560` | `videoBridge` (`video:pickFile`, `video:compress`, `video:render`, `video:gif`, `video:preview`, `video:getMetadata`, `video:revealFile`, `onProgress`, `onGifProgress`, `onRenderProgress`, `onPreviewProgress`) |
| IPC handler | `Code/ipc/video_ipc.js` | `video:compress`, `video:render`, `video:gif`, `video:preview`, `video:getMetadata`, `video:pickFile`, `video:pickOutputFolder`, `video:revealFile` |
| Worker proxy | `Code/ipc/workerProxy.js` | `send`, `onProgress`/`offProgress` |
| Worker task | `Code/worker-service/tasks/videoCompress.js` | ffmpeg compress with progress |
| Worker task | `Code/worker-service/tasks/videoRender.js` | timeline render |
| Worker task | `Code/worker-service/tasks/videoToGif.js` | gif |
| Worker task | `Code/worker-service/tasks/videoPreview.js` | preview |
| Worker entry | `Code/worker-service/worker.js:27-34` | `progressTasks`: `video:compress`, `video:gif`, `video:render`, `video:preview` |
| Feature flag | `videoTool` (config.js:46, default `true`) |
| FFmpeg | `Code/utils/ffmpeg.js` + `Code/utils/ffprobe.js` (ffmpeg-static / ffprobe-static) |

### 5.2 Execution trace — compress

1. **User clicks** "Video Compressor" → `RUN.video()` (toolsManager.js:488): toggle closed if open; else `_registry.closeAll()`, `_initVideoPanel()` (`createVideoPanel()`), `_initializeVideoTool()` (dynamic `import('../videoTool.js')`, `new VideoTool()`, `initialize()`, `render(_videoContainer)`).
2. **User** picks file (`window.electronAPI.video.pickFile()` → `dialog.showOpenDialog`), picks output folder (`video:pickOutputFolder`), chooses preset, clicks Compress.
3. `VideoTool._startCompress()` (videoTool.js:299): sets `compressStatus='compressing'`; registers progress `window.electronAPI.video.onProgress((data)=>{ st.compressProgress=data; this.ui.update(); })`; calls `window.electronAPI.video.compress({ inputPath, preset, outputPath })`; after completion unregisters progress. On success `compressStatus='compressed'` + result; on error `compressStatus='error'` + `compressError`.
4. **Preload** `videoBridge.compress` → `ipcRenderer.invoke('video:compress', payload)`.
5. **Main** `video_ipc.js:43-58`: `ipcMain.handle('video:compress', ...)` creates `progressHandler` → `win.webContents.send('video:progress', progress)`; `workerProxy.onProgress(progressHandler)`; `await workerProxy.send('video:compress', payload)`; `workerProxy.offProgress(progressHandler)`; returns `{ success: true, ...result }` or `{ success: false, error }`.
6. **Worker proxy** `send('video:compress', payload)` → `worker.js` → `progressTasks['video:compress']` = `tasks/videoCompress.js(payload, onProgress)`.
7. **Task** `videoCompress.js:70-147`: validates `inputPath` exists; `getMetadata` via `spawn(ffprobePath,...)`; output dir `userOutputPath || os.tmpdir()`; `spawn(ffmpegPath, args)` with `-progress pipe:1 -nostats`; parses `out_time_ms=` from ffmpeg stdout → `onProgress({ percent, currentTime, totalTime, estimatedOutputSize, originalSize })`; on close code 0 resolves else rejects; returns `{ outputPath, originalSize, compressedSize, reductionPercent, ... }`.
8. **Progress flow**: worker `onProgress` → `worker.js` sends `{ id, type: 'progress', data }` → `workerProxy.js` child `message` handler → `_events.emit('progress', data)` → `video_ipc` progressHandler → `win.webContents.send('video:progress', progress)` → preload `ipcRenderer.on('video:progress', callback)` → `VideoTool` updates `st.compressProgress` → UI re-renders.
9. Result returns up the chain; UI shows "compressed" state with `revealFile`/`revealFolder`.

### 5.3 Execution trace — render (timeline MP4 / GIF)

Same pattern as compress, using `video:render` / `video:gif` channels and `videoRender.js` / `videoToGif.js` tasks. Progress channels: `video:renderProgress`, `video:gifProgress`. Preview uses `video:preview` / `video:previewProgress`.

### 5.4 Notes for Document Studio

- Progress is request-scoped at the IPC level but **global in workerProxy** (`workerProxy.onProgress` is a single EventEmitter). The IPC handler registers/unregisters around each call; concurrent progress tasks would clobber each other (CONFIRMED limitation — risk in 03/06).
- `ipcMain.handle` returns `{ success: true, ...result }` / `{ success: false, error }` envelope (CONFIRMED).
- Dialogs run in the main process and return paths to the renderer; the renderer never calls Node fs/dialog directly (CONFIRMED, contextIsolation).
- FFmpeg is invoked via `child_process.spawn` (no shell interpolation) from the worker process (CONFIRMED). This is the model for invoking the Python sidecar: **spawn, not shell**.
- Temp output defaults to `os.tmpdir()` when no user output folder (CONFIRMED videoCompress.js:91). Document Studio should use isolated job directories instead (see 06 security).


---

## 6. Panel mounting flow (CONFIRMED)

When a tool is opened via `RUN[key]`:

1. `_registry.closeAll()` — closes every other panel (single-active-tool rule).
2. If no panel exists, `_init<Tool>Panel()` calls `createXxxPanel()` → appends panel `div` to `document.body`, returns `{ panel, container }`; `_registry.register('<tool>', panel)`.
3. `panel.classList.add('open')`.
4. Tool module is lazily imported (`import('../videoTool.js')`) and `render(container)` is called.
5. On repo change (`handleRepoChange`), tool is destroyed (`_destroy<Tool>Tool()` → `tool.destroy()`, `container.innerHTML = ''`, panel `classList.remove('open')`).
6. On `window.beforeunload`, all tools are destroyed.

---

## 7. Recommended integration pattern for Document Studio

Based on the patterns above, Document Studio should:

1. **Feature flag + registry:** Add a `documentStudio` feature flag and a `TOOLS` entry (`id: 'document-studio'`, `name: 'Document Studio'`, flag: `documentStudio`) in `toolsManager.js`, plus a `TOOL_FEATURE` mapping in `sidebarManager.js`.
2. **Tool module + panel:** Create `renderer/documentStudio.js` following the `VideoTool` class pattern (`initialize/render/destroy`) OR the `locDetector` export pattern (`open/close/isOpen`), depending on complexity. Create a slide-over panel via `panelFactory.createPanel` registered in `PanelRegistry`.
3. **Preload bridge:** Add a `documentStudioBridge` in `Code/preload.js` with narrow methods (`inspectPdf`, `convertPdfToDocx`, `writePdfFromTemplate`, `pickPdf`, `pickOutputFolder`, `onProgress`, `onJobEvent`, ...) → `ipcRenderer.invoke('document-studio:<op>', ...)`.
4. **IPC handlers:** Add `Code/ipc/document-studio_ipc.js` with `ipcMain.handle('document-studio:<op>', ...)` returning `{ success: true, ... }` / `{ success: false, error }`. Register in `registerAllIpc` (tier 2, feature-gated) via `safeRegister` + `FEATURE_IPC`.
5. **Processing engine:** Offload PDF/DOCX work to a **separate Python sidecar process** (not the shared Node worker), because document processing is CPU/memory-intensive, long-running (OCR), and the shared worker has a 120s default timeout + a global progress listener. See Phase E evaluation in `03-DOCUMENT-STUDIO-PROPOSED-ARCHITECTURE.md`.
6. **Persistence:** Persist Document Studio metadata in a dedicated `node:sqlite` database (following the `consoleDb.js` pattern) under `<userData>/document-studio/`, NOT the shared `symbol-index/index.db`, to minimize coupling with existing HelperTool features.
7. **Child processes:** Spawn the Python sidecar via `child_process.spawn` (no shell), mirroring `videoCompress.js` and `workerProxy.js`.

| Config | `Code/config/config.js` (`helper-config.json`) |
