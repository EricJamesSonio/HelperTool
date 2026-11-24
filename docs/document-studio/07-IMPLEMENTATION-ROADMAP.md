# 07 — Implementation Roadmap (Phased)

**Evidence status:** All phases build on the CONFIRMED codebase analysis in `01-CODEBASE-ARCHITECTURE.md` and the PROPOSED
design in `03-DOCUMENT-STUDIO-PROPOSED-ARCHITECTURE.md`. Phase 0 is this investigation. Subsequent phases are
implementation targets for future agents. No source code has been modified.

---

## 0. Phase 0 — Architecture reconnaissance (this investigation)

- **Objective:** Understand HelperTool's existing architecture, inventory all relevant modules, and identify integration
  opportunities and risks for Document Studio.
- **Prerequisites:** None (existing codebase).
- **Proposed files:** None (read-only reconnaissance).
- **Dependencies:** None.
- **Expected deliverables:** `docs/document-studio/README.md` + `01-CODEBASE-ARCHITECTURE.md` + `02-EXISTING-INTEGRATION-PATTERNS.md`
  + `03-DOCUMENT-STUDIO-PROPOSED-ARCHITECTURE.md` + `04-DEPENDENCY-AND-LIBRARY-RESEARCH.md` + `05-DATA-STORAGE-AND-DOCUMENT-MODEL.md`
  + `06-SECURITY-AND-RISK-ASSESSMENT.md` + `09-OPEN-QUESTIONS-AND-DECISIONS.md`.
- **Tests:** N/A (read-only).
- **Acceptance criteria:** All 9 documentation files created; every referenced existing file verified; all IPC patterns,
  worker patterns, and file-management patterns documented from actual source.
- **Risks:** Codebase may have changed since this snapshot (commit `60c9531`); implementers must re-verify affected files.
---

## 1. Phase 1 — Python Document Inspector proof of concept

- **Objective:** Validate that a Python sidecar can successfully inspect a PDF (page count, dimensions, text extraction,
  image detection, scanned-page detection) and return structured results to the Electron main process via JSON Lines.
- **Prerequisites:** Phase 0 complete; Python 3.10+ installed; PyMuPDF/pikepdf installed; Tesseract installed with one
  language pack.
- **Proposed files:**
  - `Code/python-sidecar/document_inspector_sidecar.py` — minimal sidecar that reads `{id, type, payload}` from stdin,
    responds with `{id, type, data}` on stdout.
  - `Code/python-sidecar/test_inspector.py` — tiny test script that spawns the sidecar, sends an `inspect` request,
    and prints the response.
- **Dependencies:** Python sidecar libraries (PyMuPDF, pytesseract, Tesseract binary).
- **Implementation tasks:**
  1. Create sidecar entry point that reads JSON Lines from stdin, responds on stdout.
  2. Implement `inspect` request handler: open PDF via PyMuPDF, extract page count, dimensions, orientation, per-page text,
     images, detect scanned pages (heuristic: no text layer + image presence).
  3. Return structured result matching the proposed `Document Inspector` model.
  4. Test: spawn sidecar, send inspect request for a sample PDF, verify JSON Lines output.
- **Expected deliverables:** A working Python sidecar that can inspect a PDF and return structured results; `test_inspector.py`
  passes.
- **Tests:** `test_inspector.py` exercises the sidecar end-to-end.
- **Acceptance criteria:** Sidecar successfully inspects a sample PDF; text, images, scanned-page detection all work;
  JSON Lines protocol is verified.
- **Risks:** Tesseract not installed/bundled; PyMuPDF AGPL licensing issue (see 04/06); sidecar stdout/stdio protocol
  mismatches renderer expectations.
- **Dependencies on previous phases:** Phase 0 (codebase inventory).
---

## 2. Phase 2 — Electron and Python sidecar integration

- **Objective:** Integrate the Python sidecar into the Electron main process: spawn on demand, communicate via JSON Lines,
  handle progress and cancellation, and expose narrow IPC methods through the preload bridge.
- **Prerequisites:** Phase 1 complete; Python sidecar working; Electron app running.
- **Proposed files:**
  - `Code/services/documentStudioService.js` — sidecar supervisor (spawn/stop, send requests, parse progress, cancel).
  - `Code/ipc/document-studio_ipc.js` — IPC handlers (`pickPdf`, `inspect`, `convert-pdf-to-docx`, `write-pdf-from-template`,
    `cancel-job`, `reveal-file`).
  - `Code/preload.js` — `documentStudioBridge` spread into `window.electronAPI`.
- **Dependencies:** Phase 1 sidecar; Electron 44.0.0; `child_process.spawn` (no shell).
- **Implementation tasks:**
  1. Create `documentStudioService.js` that manages sidecar lifecycle, request/response protocol, progress parsing, cancel.
  2. Create `document-studio_ipc.js` IPC handlers returning `{ success: true, ... }` / `{ success: false, error }`.
  3. Add `documentStudioBridge` to `Code/preload.js` with narrow methods (`pickPdf`, `inspect`, `cancelJob`, `onProgress`, ...).
  4. Register IPC in `registerAllIpc` (tier 2, feature-gated via `documentStudio` flag).
  5. Test: open Document Studio panel → pick PDF → inspect → see results in renderer.
- **Expected deliverables:** Electron main process can spawn Python sidecar, send inspect request, receive structured results;
  IPC bridge works end-to-end.
- **Tests:** Integration test that spawns sidecar via the service, sends inspect, verifies response.
- **Acceptance criteria:** Sidecar starts; inspector panel opens; picking a PDF returns page count, dimensions, text extraction,
  scanned-page detection; cancel works.
- **Risks:** Sidecar crash loops; protocol mismatches; AGPL licensing blocker if PyMuPDF used.
- **Dependencies on previous phases:** Phase 1 (Python Document Inspector PoC).
---

## 3. Phase 3 — Template Manager and Page Mapper

- **Objective:** Implement template import, version tracking, and page-level policy mapping (PRESERVE/OVERLAY/REBUILD/GENERATE/
  BLANK_RESERVED) for the PDF Writer.
- **Prerequisites:** Phase 2 complete; sidecar can inspect PDFs; template import UI built.
- **Proposed files:**
  - `Code/renderer/documentStudio.js` — tool module with `open/close/isOpen`.
  - `Code/renderer/documentStudio/templates/` — template management UI.
  - `Code/services/templateService.js` — template CRUD + version metadata.
- **Dependencies:** Phase 2; node:sqlite `document-studio.db` schema migrations.
- **Implementation tasks:**
  1. Build template import flow: file picker → copy to `<userData>/document-studio/templates/` → metadata row in DB.
  2. Build template version tracking: `template_versions` table; snapshot on each import.
  3. Build page-mapping UI: user maps template pages → output pages, selects policy per page.
  4. Sidecar `write-pdf-from-template` request handler: receive `{ templatePath, instructions, outputPath }`; use pikepdf to
     copy template pages, ReportLab to overlay/generate content; return `{ outputPath, pageCount, warnings }`.
- **Expected deliverables:** User can import a PDF template, assign page policies, generate a new PDF respecting policies.
- **Tests:** Unit test: sidecar writes PDF from template + instructions; UI test: template import + policy assignment.
- **Acceptance criteria:** Template imported; policies assigned; generated PDF has correct page count and policies applied.
- **Risks:** Page mapping not 1:1 due to dynamic sections; ReportLab layout positioning complexity.
- **Dependencies on previous phases:** Phase 2 (sidecar integration); 05 (database schema for templates/projects/jobs).
---

## 4. Phase 4 — PDF Writer MVP

- **Objective:** Generate a PDF from a template with page-handling policies (PRESERVE, OVERLAY, REBUILD, GENERATE, BLANK_RESERVED),
  including table of contents, and export PDF + optionally DOCX.
- **Prerequisites:** Phase 3 complete; template management; page-policy mapping UI.
- **Proposed files:**
  - `Code/ipc/document-studio_ipc.js` — `write-pdf-from-template` handler.
  - `Code/services/documentStudioService.js` — sidecar `write-pdf-from-template` orchestration.
  - `Code/renderer/documentStudio.js` — "Generate PDF" action in RUN.
- **Dependencies:** Phase 3; ReportLab; pikepdf; python-docx (for optional DOCX export).
- **Implementation tasks:**
  1. Sidecar `write-pdf-from-template` receives `{ templatePath, instructions, outputPath }`.
  2. Use pikepdf to copy template pages; use ReportLab to add content per policy (OVERLAY adds text/graphics on top;
     GENERATE creates new pages; PRESERVE keeps as-is; REBUILD reconstructs; BLANK_RESERVED leaves blank).
  3. Generate TOC after final pagination; include in PDF metadata.
  4. Optional: export DOCX via python-docx (export only, not full layout fidelity).
  5. Return `{ outputPath, pageCount, warnings }` to renderer.
  6. Renderer shows success toast + revealFile option.
- **Expected deliverables:** User can build a PDF from a template with policies; TOC included; optional DOCX export.
- **Tests:** End-to-end: pick template → assign policies → generate PDF → verify output path + page count; optional DOCX export.
- **Acceptance criteria:** PDF generated with correct policies; TOC present; optional DOCX exports without crash.
- **Risks:** ReportLab positioning edge cases; TOC generation after dynamic pagination; DOCX export quality.
- **Dependencies on previous phases:** Phase 3 (template manager + page mapper).
---

## 5. Phase 5 — PDF to DOCX Converter

- **Objective:** Convert PDF to DOCX with text extraction, structure (paragraphs/headings), embedded images, and OCR for
  scanned pages; display conversion results; allow user inspection and manual correction.
- **Prerequisites:** Phase 2 complete; Python sidecar with inspection + text extraction; feature flag for OCR.
- **Proposed files:**
  - `Code/ipc/document-studio_ipc.js` — `convert-pdf-to-docx` handler.
  - `Code/services/documentStudioService.js` — sidecar `convert-pdf-to-docx` orchestration.
  - `Code/renderer/documentStudio.js` — converter UI + result display.
- **Dependencies:** Phase 2; python-docx; PyMuPDF; Tesseract (optional).
- **Implementation tasks:**
  1. Sidecar `convert-pdf-to-docx` receives `{ filePath, ocr: boolean }`.
  2. Use PyMuPDF to extract text, images, layout per page; detect scanned pages (no text layer + images).
  3. If `ocr` flag: run Tesseract on image-only pages; embed OCR text.
  4. Use python-docx to build DOCX: headings from PDF outline/structure, paragraphs from extracted text, images embedded.
  5. Flag low-confidence reconstructions for user review (e.g., pages where text could not be reliably extracted).
  5. Return `{ outputPath, previewPaths, warnings, needsReview }` to renderer.
  6. Renderer displays: converted DOCX preview, warning flags, "review & manual correct" affordances.
- **Expected deliverables:** User can convert a PDF to DOCX; text + images extracted; scanned pages OCR'd; low-confidence
  areas flagged; DOCX file produced.
- **Tests:** End-to-end: pick PDF → convert → verify DOCX opens; verify OCR on scanned PDF; verify warning flags for low-confidence.
- **Acceptance criteria:** DOCX produced from PDF; text + images present; OCR works on scanned PDF; low-confidence areas flagged.
- **Risks:** Conversion quality varies by PDF complexity; OCR accuracy depends on image quality; python-docx layout fidelity
  (inherently limited for fixed-layout → flowable conversion).
- **Dependencies on previous phases:** Phase 2 (sidecar integration); 04 (library decisions: python-docx, PyMuPDF, Tesseract).
---

## 6. Phase 6 — Packaging, testing, and offline verification

- **Objective:** Package the Python sidecar (PyInstaller), verify offline operation, run the existing test suite, and validate
  all security requirements from `06-SECURITY-AND-RISK-ASSESSMENT.md`.
- **Prerequisites:** Phases 1–5 complete; PyInstaller license resolved; all new dependencies verified.
- **Proposed files:**
  - PyInstaller build configuration (onedir recommended for Tesseract stability).
  - Updated `Code/package.json` / build scripts if needed.
  - Security verification test suite.
- **Dependencies:** All prior phases; PyInstaller (GPLv2 + exception verified); antivirus test environment.
- **Implementation tasks:**
  1. Build Python sidecar with PyInstaller `onedir` (recommended for Tesseract binary stability); place exe/output outside
     Electron ASAR via `extraResources` or build config.
  2. Verify sidecar launches from Electron main process via `child_process.spawn` (no shell).
  3. Run full Document Studio workflow end-to-end (inspect → convert → write PDF from template).
  3. Validate all security checklist items from `06-SECURITY-AND-RISK-ASSESSMENT.md §5`.
  4. Run existing HelperTool test suite (`node --test tests/*.test.mjs`) to confirm no regressions.
  5. Test offline: disable network, verify Document Studio functions without internet.
- **Expected deliverables:** Packaged sidecar .exe; full workflow verified end-to-end; existing test suite passes; security
  checklist 100% complete; offline verification documented.
- **Tests:** `test_inspector.py`; `test_converter.py`; existing HelperTool `node --test` suite; manual offline verification.
- **Acceptance criteria:** Packaged sidecar works from Electron; full workflow verified; no regressions in existing tests;
  all security checklist items pass; offline mode functional.
- **Risks:** PyInstaller antivirus false positives blocking launch; Tesseract bundle size; existing test suite fragility.
- **Dependencies on previous phases:** Phases 1–5 (full Document Studio implementation).
---

## 7. Open questions & decisions still needed (from `09-OPEN-QUESTIONS-AND-DECISIONS.md`)

Phase 0–6 decisions must resolve the items recorded in `09-OPEN-QUESTIONS-AND-DECISIONS.md` before implementation
commences. No phase should begin until its prerequisites and required decisions are met.
- **Dependencies on previous phases:** None (this is the first phase).