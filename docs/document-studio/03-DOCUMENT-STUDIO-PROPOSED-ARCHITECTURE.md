# 03 — Document Studio Proposed Architecture

**Evidence status:** This document contains PROPOSED design. All references to existing HelperTool files/paths are CONFIRMED
(see `01-CODEBASE-ARCHITECTURE.md`). All proposed paths, components, and decisions are explicitly labelled **PROPOSED** and
require implementation. Nothing here has been built.

---

## 1. Overview

Document Studio is integrated into HelperTool as **another tool/panel** in the existing sidebar, following the conventions
documented in `02-EXISTING-INTEGRATION-PATTERNS.md`. It is NOT a separate desktop GUI application. The Electron main process
remains the primary application and UI host.

Core design principle: heavy document processing (PDF inspection, OCR, PDF generation, DOCX conversion) runs in a **locally
managed Python sidecar process**, not in the renderer and not in the shared Node worker. Electron + Python communicate over

---

## 2. Phase E evaluation — worker vs. sidecar (EVIDENCE-BASED)

The investigation (Phase E) compared three approaches against the existing worker implementation. Key evidence from the
codebase:

| Evidence | `Code/worker-service/worker.js` | `Code/ipc/workerProxy.js` |
|----------|--------------------------------|---------------------------|
| Process model | Single shared child process forked by main | Same process, request/response proxy |
| Message format | `{ id, type, payload }` → `{ id, type:'result'|'progress'|'error' }` | Same |
| Default timeout | 120s per request (`_sendRaw`, line 112) | Same |
| Progress | Global EventEmitter, not request-scoped (`onProgress`/`offProgress`) | Same |
| Concurrency | `_pending` Map supports multiple in-flight requests, but one global progress listener | Same |
| Lifecycle | `start()`/`stop()`/`sleep()`/`wake()`, auto-restart with exponential backoff | Same |
| Tasks | `progressTasks`: `generate`, `video:compress`, `image:convert`, `video:gif`, `video:render`, `video:preview` | Same |

### Option A — Extend the existing worker system

- Add document-processing tasks to `worker-service/tasks/` and register in `worker.js`.
- **Pros:** Reuses existing `workerProxy` lifecycle (spawn, restart, sleep/wake, service tracker); no new process type; consistent IPC pattern.
- **Cons:** 
  - Shared worker is single-process; a long OCR/PDF job blocks all other worker tasks (`loc:scan`, `video:compress`, etc.) — **risk to existing tools**.
  - 120s default timeout is too short for large PDFs / OCR; would need per-task timeout overrides.
  - Global progress listener is not request-scoped — concurrent document jobs would clobber progress (CONFIRMED limitation in `workerProxy.js`).
  - Python libraries cannot run inside a Node worker; would still need `child_process.spawn` from within the worker, nesting processes.
- **Verdict:** NOT RECOMMENDED for the processing engine. Reusing the worker *lifecycle pattern* as a reference is fine, but the worker itself is unsuitable for long-running document jobs.

### Option B — Dedicated Python sidecar process managed by Electron main

- Main process spawns a Python child process (`child_process.spawn`, no shell) and speaks JSON Lines over stdin/stdout.
- **Pros:** 
  - Full isolation from existing tools (document jobs don't block `loc:scan`/`video:compress`).
  - Python native libraries (PyMuPDF, pikepdf, ReportLab, python-docx, Pillow, Tesseract/RapidOCR) without Node bridging.
  - No 120s Node worker timeout constraint; sidecar manages its own job queue/timeouts.
  - Request-scoped progress and cancellation (sidecar assigns job IDs).
  - Matches the proposed architecture in the task brief exactly.
  - `spawn` (no shell) matches `videoCompress.js` and `workerProxy.js` security pattern.
- **Cons:** 
  - New process type to package, start, stop, and health-check.
  - Need to bundle Python runtime or use PyInstaller (see 04, 08).
  - Two-process debugging is more complex.
- **Verdict:** **RECOMMENDED** for the processing engine.

### Option C — Dedicated document-processing service using worker infrastructure as lifecycle reference

- A new main-process-managed service (Node or hybrid) modeled on `workerProxy` semantics but for documents.
- **Pros:** Reuses lifecycle concepts without touching the shared worker.
- **Cons:** Still leaves Python execution to `child_process.spawn` from Node (no benefit over Option B); adds a third process model to maintain.
- **Verdict:** NOT RECOMMENDED — Option B is simpler and directly matches the brief.

### Recommendation (REQUIRES DECISION)

Use **Option B** (dedicated Python sidecar) for the processing engine, with the Electron main process as the supervisor.
Reference `workerProxy.js` and `video_ipc.js` patterns for IPC/progress/cancellation, but do not reuse the shared worker
process itself.


---

## 3. Electron integration (PROPOSED paths)

| Concern | Proposed path | Status | Basis |
|---------|--------------|--------|-------|
| Feature flag | `documentStudio` in `Code/config/config.js` features + `helper-config.json` | PROPOSED | follows config.js:22-62 pattern |
| Tool registry entry | `Code/renderer/app_manager/toolsManager.js` `TOOLS` array | PROPOSED (modify) | follows toolsManager.js:736-774 |
| RUN action | `RUN['document-studio']` in toolsManager.js | PROPOSED (modify) | follows toolsManager.js:457-733 |
| Sidebar flag mapping | `Code/renderer/app_manager/sidebarManager.js` `TOOL_FEATURE` | PROPOSED (modify) | follows sidebarManager.js:9-45 |
| Tool module | `Code/renderer/documentStudio.js` | PROPOSED (new) | follows videoTool.js / locDetector.js |
| Panel | `Code/renderer/app_manager/panels/panelFactory.js` `createDocumentStudioPanel()` | PROPOSED (new) | follows panelFactory.js |
| CSS | `Code/renderer/styles/document-studio.css` | PROPOSED (new) | follows 18 existing CSS files |
| Preload bridge | `Code/preload.js` → `documentStudioBridge` spread into `electronAPI` | PROPOSED (modify) | follows preload.js bridge pattern |
| IPC module | `Code/ipc/document-studio_ipc.js` | PROPOSED (new) | follows video_ipc.js / image_ipc.js |
| Main-process service | `Code/services/documentStudioService.js` (sidecar supervisor) | PROPOSED (new) | follows services/ pattern |
| Sidecar entry | `Code/python-sidecar/document_studio_sidecar.py` | PROPOSED (new) | outside Code/ node tree |
| Sidecar bundle output | `Code/dist-python/` or `Code/resources/python/` | PROPOSED (new) | packaging decision (08) |
| Database | `<userData>/document-studio/document-studio.db` via `node:sqlite` | PROPOSED (new) | follows consoleDb.js pattern |

### 3.1 Where the tool is registered (PROPOSED)

In `Code/renderer/app_manager/toolsManager.js`:
- Add `{ id: 'document-studio', key: 'document-studio', flag: 'documentStudio', icon: ICONS.<doc>, name: 'Document Studio', desc: 'PDF conversion, writing & inspection', shortcut: null }` to `TOOLS`.
- Add `RUN['document-studio']` that toggles, calls `_registry.closeAll()`, inits the panel via `_initDocumentStudioPanel()`, shows it.

### 3.2 Where the renderer UI lives (PROPOSED)

- `Code/renderer/documentStudio.js` — tool module (class or export `open/close/isOpen`), following `videoTool.js` class pattern.
- `Code/renderer/documentStudio/` — supporting modules (state, UI components for inspector, converter, writer).
- `Code/renderer/styles/document-studio.css` — added to `index.html` `<link>` list (existing pattern: 18+ CSS files, `media="print"` deferred).
- Panel mounted into a container created by `panelFactory.createPanel` (slide-over), respecting single-active-tool.


### 3.3 IPC module structure (PROPOSED)

`Code/ipc/document-studio_ipc.js`:
```js
const { ipcMain, dialog } = require('electron');
const documentStudioService = require('../services/documentStudioService.js');

function register({ getMainWindow }) {
  ipcMain.handle('document-studio:pickPdf', async () => { ... dialog.showOpenDialog ... });
  ipcMain.handle('document-studio:pickOutputFolder', async () => { ... dialog.showOpenDialog ... });
  ipcMain.handle('document-studio:inspect', async (event, payload) => { ... service.inspect(payload) ... });
  ipcMain.handle('document-studio:convert-pdf-to-docx', async (event, payload) => { ... });
  ipcMain.handle('document-studio:write-pdf-from-template', async (event, payload) => { ... });
  ipcMain.handle('document-studio:cancel-job', async (event, { jobId }) => { ... service.cancel(jobId) ... });
  ipcMain.handle('document-studio:reveal-file', async (event, { filePath }) => { shell.showItemInFolder(filePath); });
}
module.exports = { register };
```
- Response envelope: `{ success: true, ...result }` / `{ success: false, error }` (matches video_ipc/image_ipc/loc_ipc).
- Progress: `win.webContents.send('document-studio:progress', { jobId, percent, stage, message })`.
- Validation: every payload validated before forwarding to the sidecar (see 06 security).

### 3.4 Preload methods (PROPOSED)

Add to `Code/preload.js` a `documentStudioBridge`:
```js
const documentStudioBridge = {
  documentStudio: {
    pickPdf: () => ipcRenderer.invoke('document-studio:pickPdf'),
    pickOutputFolder: () => ipcRenderer.invoke('document-studio:pickOutputFolder'),
    inspect: (payload) => ipcRenderer.invoke('document-studio:inspect', payload),
    convertPdfToDocx: (payload) => ipcRenderer.invoke('document-studio:convert-pdf-to-docx', payload),
    writePdfFromTemplate: (payload) => ipcRenderer.invoke('document-studio:write-pdf-from-template', payload),
    cancelJob: (jobId) => ipcRenderer.invoke('document-studio:cancel-job', { jobId }),
    revealFile: (payload) => ipcRenderer.invoke('document-studio:reveal-file', payload),
    onProgress: (callback) => {
      ipcRenderer.removeAllListeners('document-studio:progress');
      ipcRenderer.on('document-studio:progress', (_, data) => callback(data));
    },
    onJobEvent: (callback) => {
      ipcRenderer.removeAllListeners('document-studio:job-event');
      ipcRenderer.on('document-studio:job-event', (_, data) => callback(data));
    },
  },
};
```
- Follows existing `videoBridge`/`imageBridge` patterns exactly (invoke + on + removeAllListeners).
- Spread into `window.electronAPI` at line 789.


### 3.5 Main-process service (PROPOSED)

`Code/services/documentStudioService.js` — supervisor for the Python sidecar:
- `startSidecar()` / `stopSidecar()` — spawn via `child_process.spawn` (no shell), manage lifecycle.
- `sendRequest({ jobId, type, payload })` → write JSON line to sidecar stdin, wait for matching stdout line.
- `onProgress(cb)` / `onJobEvent(cb)` — parse stdout `type: 'progress'|'job-event'|'log'` lines.
- `cancelJob(jobId)` → send cancel request or terminate sidecar job.
- Health check / readiness (sidecar emits `{"type":"ready"}` on startup, mirroring `worker.js` bootstrap).
- Integrate with `serviceTracker_ipc.js` for UI service status (worker uses `updateService('worker', ...)`).

### 3.6 Communication with the Python sidecar (PROPOSED)

- Main process spawns sidecar with `child_process.spawn(pythonExecutable, [], { stdio: ['pipe', 'pipe', 'pipe'] })`, no shell.
- Protocol: JSON Lines (one JSON object per line) on stdin/stdout.
- Sidecar stderr → diagnostic logs (kept separate from stdout protocol).
- Request: `{ id, type, payload }` (mirrors worker message format for consistency).
- Response: `{ id, type: 'result'|'progress'|'job-event'|'error'|'ready', data|message }`.
- Cancellation: request `{ id, type: 'cancel', payload: { jobId } }` or sidecar honors a `cancelRequested` flag checked between stages.
- Timeouts: sidecar-managed per-job; main process has an optional overall request timeout.


---

## 4. Python sidecar design (PROPOSED)

| Attribute | Decision |
|-----------|----------|
| Process model | Child process of Electron main, spawned via `child_process.spawn` (no shell) |
| Communication | JSON Lines over stdin/stdout |
| Network | **No HTTP server** — strictly stdio |
| Offline | Fully offline; no cloud/API calls |
| Logging | stderr for diagnostics; stdout reserved for protocol |
| Packaging | PyInstaller (onedir or onefile) — evaluated in 04/08 |
| Entry point | `document_studio_sidecar.py` |
| Request validation | Pydantic models (validated in sidecar, not trusted from renderer) |

### Sidecar message contract (PROPOSED)

Request (main → sidecar):
```json
{ "id": "job-123", "type": "inspect", "payload": { "filePath": "C:\\...\\doc.pdf" } }
```
Response (sidecar → main):
```json
{ "id": "job-123", "type": "result", "data": { ... } }
```
Progress:
```json
{ "id": "job-123", "type": "progress", "data": { "percent": 45, "stage": "ocr", "page": 3 } }
```
Error:
```json
{ "id": "job-123", "type": "error", "message": "PDF is password-protected" }
```
Ready (sidecar startup):
```json
{ "id": "bootstrap", "type": "ready" }
```
This mirrors `worker.js` (`{ id, type, payload }` → `{ id, type: 'result'|'progress'|'error' }`) for consistency.

### Sidecar responsibilities (PROPOSED)

- PDF inspection (page count, dimensions, orientation, text, images, scanned-page detection, OCR, layout, metadata).
- PDF to DOCX conversion (reconstructed content + images + rasterized fallback).
- PDF writing from templates (page-handling policies, overlay, dynamic sections, TOC, pagination).
- Job queue, progress, cancellation, structured errors.

### Sidecar NOT responsible for (PROPOSED)

- UI rendering, window management, native file dialogs (Electron/main process).
- IPC to renderer directly (sidecar only talks to main process over stdio).

---

## 5. Document-processing pipeline (PROPOSED)

| # | Stage | Electron | Python | Notes |
|---|-------|----------|--------|-------|
| 1 | Import document (file pick) | ✅ dialog | | `dialog.showOpenDialog`, PDF filter |
| 2 | Validate file (extension, size, path) | ✅ | | path traversal rejection, size cap |
| 3 | Calculate document hash (SHA-256) | | ✅ | content-addressed caching |
| 4 | Inspect metadata | | ✅ | PyMuPDF/pikepdf |
| 5 | Analyze individual pages | | ✅ | dimensions, orientation, text, images |
| 6 | Extract text and images | | ✅ | per page |
| 7 | Detect scanned pages | | ✅ | heuristic: no text layer + image presence |
| 8 | Run OCR when required | | ✅ | Tesseract/RapidOCR, optional flag |
| 9 | Build structured inspection result | | ✅ | return to Electron |
| 10 | Display inspection results | ✅ | | renderer UI |
| 11 | Parse user instructions | | ✅ | deterministic structured plan (Pydantic) |
| 12 | Build page-generation plan | | ✅ | page mappings, policies |
| 13 | Validate the plan | | ✅ | page bounds, policy consistency |
| 14 | Request user approval | ✅ | | preview of plan |
| 15 | Generate/modify document | | ✅ | ReportLab + pikepdf overlay |
| 16 | Final validation | | ✅ | page count, TOC correctness |
| 17 | Generate preview | ✅ | | render preview images/PDF |
| 18 | Export output (PDF/DOCX) | ✅ (save dialog) | ✅ (write bytes) | `dialog.showSaveDialog` |

### Which stages belong where (PROPOSED)

- **Electron/main process:** file dialogs, path validation, IPC orchestration, UI state, progress display, save dialog, window/panel lifecycle, feature flags.
- **Python sidecar:** all document understanding and generation (stages 3-9, 11-13, 15-16), OCR, hash calculation.
- **Boundary:** Electron passes file paths (already validated) and job parameters; Python returns structured results + output file paths. Python never calls Electron APIs.


---

## 6. Document Inspector (PROPOSED)

A shared analysis component used by both PDF Writer and PDF to DOCX Converter.

Provides (eventually):
- Page count, dimensions, orientation.
- Text extraction (with font/size/position where available).
- Image detection (count, size, placement per page).
- Image-only page detection (no text layer).
- Scanned-page detection (heuristic + optional OCR confirmation).
- OCR capability (Tesseract/RapidOCR, offline).
- Basic layout detection (blocks, columns).
- Tables and text-block detection.
- Document metadata (title, author, subject, creator, producer, creation date, page count).
- Page-level inspection results (per-page array).

### Implementation (PROPOSED)

- Sidecar exposes `inspect` request: `{ filePath, options: { ocr: boolean, layout: boolean } }`.
- Returns `{ pages: [{ pageNo, width, height, orientation, text, images: [...], isScanned, isImageOnly, blocks, tables }], metadata, pageCount }`.
- Electron renders results in the Document Studio inspector UI (table + per-page preview).

---

## 7. PDF Writer (PROPOSED)

Template-based document generation with page-handling policies.

### Page-handling policies (from brief)

| Policy | Meaning |
|--------|---------|
| PRESERVE | Keep original page unchanged |
| OVERLAY | Keep original page + add new content |
| REBUILD | Reconstruct page with editable content |
| GENERATE | Create a new page |
| BLANK_RESERVED | Preserve intentionally blank page |

### Template & page mapping model (PROPOSED)

- Original template page number → final output page number (not 1:1 due to dynamic sections).
- Each output page has: policy, source template page (or null for GENERATE/BLANK_RESERVED), required new content, reserved content, anchors, overflow handling.
- **Dynamic sections:** a section (e.g. "daily journal entries") can expand across multiple pages. Original template page numbers must NOT be assumed stable after pagination — the plan is recomputed after final pagination, then TOC generated.

### Capabilities (from brief)

1. Import PDF templates; 2. Inspect pages/structure; 3. Import instructions; 4. Interpret into generation plan; 5. Preserve pages; 6. Overlay content; 7. Generate new pages; 8. Leave reserved pages blank; 9. Preserve image-only pages; 10. Expandable sections; 11. TOC after final pagination; 12. Preview; 13. Export PDF + optionally DOCX.

### Implementation (PROPOSED)

- Sidecar: `write-pdf-from-template` request with `{ templatePath, instructions, outputPath }`.
- Uses pikepdf/PyMuPDF to preserve/copy pages, ReportLab to overlay/generate content.
- Returns `{ outputPath, pageCount, warnings }`.

---

## 8. PDF to DOCX Converter (PROPOSED)

### Capabilities (from brief)

- Extract text and document structure; detect paragraphs, headings, tables, images, page boundaries.
- Preserve layout/formatting as much as reasonably possible.
- Detect scanned/image-based pages; local OCR when necessary.
- Inspect conversion results; export editable DOCX.

### Important model distinction (from brief)

PDF (fixed-layout) and DOCX (flowable) have different document models. Exact visual preservation and full editability conflict. Output must distinguish:
- Editable reconstructed content (text/headings/tables).
- Preserved images (embedded as images).
- Rasterized page content (scanned pages → image + optional OCR text).
- Content requiring manual correction (flagged to user).

### Honest MVP (PROPOSED)

- Do not promise perfect conversion.
- MVP: text extraction + basic structure (paragraphs/headings) + embedded images + OCR for scanned pages + DOCX export via python-docx.
- Visual fidelity beyond MVP is a later phase; flag low-confidence reconstructions for user review.


---

## 9. Template management (PROPOSED)

- Templates stored under `<userData>/document-studio/templates/` (filesystem).
- Template metadata + versions in the dedicated SQLite database (see 05).
- Users import templates via file picker; Electron copies/references them into the templates folder.
- Templates are inspected by the Document Inspector before use.

---

## 10. Storage (PROPOSED)

Proposed structure (not existing — see `05-DATA-STORAGE-AND-DOCUMENT-MODEL.md`):

```
<userData>/document-studio/
  database/       document-studio.db (node:sqlite)
  templates/      imported PDF templates
  projects/       document projects
  jobs/           job state / job files
  cache/          OCR results, previews
  exports/        final exported PDF/DOCX
  logs/           sidecar + service logs
```

This does not interfere with existing `symbol-index/`, `repo-console/`, or `helper-config.json`.

---

## 11. Job management: progress & cancellation (PROPOSED)

- Each document job gets a `jobId` (UUID).
- Sidecar emits progress lines `{ id, type: 'progress', data: { percent, stage, page, totalPages } }`.
- Main process forwards to renderer via `win.webContents.send('document-studio:progress', ...)`.
- Renderer updates progress bar (`#progressBar` / `#progressText`) and UI state.
- Cancellation: renderer calls `document-studio:cancel-job` → main sends cancel to sidecar → sidecar stops current job, cleans temp files, returns `{ type: 'result', data: { cancelled: true } }` or error.
- Job state persisted in the Document Studio database (status: queued/running/completed/failed/cancelled).

---

## 12. Offline operation (PROPOSED)

- No cloud APIs, external AI services, or online document conversion.
- All libraries bundled locally; Python sidecar runs without internet.
- Tesseract OCR data files (traineddata) bundled with the sidecar if Tesseract is used (packaging decision — 08).
- Electron remains the primary UI; sidecar is a local child process, not a network service.

---

## 13. Decision summary (REQUIRES DECISION)

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Processing engine | Option A (extend worker) / Option B (Python sidecar) / Option C (dedicated service) | **Option B** |
| Sidecar communication | stdio JSON Lines / HTTP / named pipes | **stdio JSON Lines** |
| Sidecar packaging | PyInstaller onedir / onefile / venv + zip | See 04/08 |
| OCR engine | Tesseract / RapidOCR / none (MVP optional) | See 04 |
| PDF→DOCX strategy | python-docx reconstruction / pdf2docx / hybrid | See 04/09 |
| Database | shared sql.js / separate node:sqlite / filesystem-only | See 05 |

JSON Lines on stdin/stdout.
