# 09 — Open Questions and Decisions (Requiring Approval Before Implementation)

**Evidence status:** All items are explicitly unresolved decisions marked **REQUIRES DECISION**. No item should be implemented
until the decision is recorded. This document is the authoritative source for all "must-decide-before-implementation" items.

---

## 1. Processing engine (REQUIRES DECISION)

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| Which approach for document processing? | **A:** Extend existing Node worker<br>**B:** Dedicated Python sidecar (spawn via `child_process.spawn`, JSON Lines)<br>**C:** Dedicated Node/hybrid service | **B** (recommended in 03/04) | **PENDING** — must be resolved before Phase 2 |

---

## 2. Sidecar communication protocol (REQUIRES DECISION)

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| How does Electron talk to the Python sidecar? | **A:** stdio JSON Lines<br>**B:** HTTP server in sidecar + fetch from renderer<br>**C:** Named pipes | **A** (recommended in 03/04) | **PENDING** |

---

## 3. Sidecar packaging (REQUIRES DECISION)

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| How is the Python sidecar bundled for Windows? | **A:** PyInstaller `onedir` (folder of DLLs/exes; stable paths for Tesseract)<br>**B:** PyInstaller `onefile` (single exe; extracts to temp at startup)<br>**C:** `venv` + zip; invoke via `python -m` | **A** (recommended in 04) — easier to bundle Tesseract binaries + traineddata; larger distro | **PENDING** |

---

## 4. OCR engine (REQUIRES DECISION)

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| Which OCR engine for scanned pages? | **A:** Tesseract (command-line + `pytesseract`; needs `tesseract.exe` + `tessdata/`)<br>**B:** RapidOCR (ONNXRuntime + bundled models; no separate exe)<br>**C:** None (MVP: OCR disabled behind feature flag) | **A** (most mature; optional behind flag) — or **C** for minimal MVP | **PENDING** — decide based on bundle-size tolerance |

---

## 5. PDF-to-DOCX strategy (REQUIRES DECISION)

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| Which PDF→DOCX strategy for MVP? | **A:** `python-docx` reconstruction (text + images + headings)<br>**B:** `pdf2docx` library (single-library approximation)<br>**C:** Hybrid: PyMuPDF extraction + `python-docx` writing (more control) | **C** (more control over quality; recommended in 04) | **PENDING** |

---

## 6. Database approach (REQUIRES DECISION)

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| Where does Document Studio persist its data? | **A:** Shared `symbol-index/index.db` (sql.js WASM) — reuse existing DB<br>**B:** Separate `node:sqlite` `document-studio.db` — isolated, dedicated schema<br>**C:** Filesystem-only (JSON files; no DB) | **B** (recommended in 05) — minimizes coupling; mirrors existing `consoleDb.js` pattern | **PENDING** |

---

## 7. PDF-to-DOCX licensing concerns (REQUIRES DECISION)

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| Is PyMuPDF (AGPL v3) acceptable for distribution? | **A:** Yes — acceptable for internal/closed distribution<br>**B:** No — requires commercial license from Artifex; use pikepdf + pdfminer.six instead<br>**C:** Defer decision; use only pikepdf/pdfminer for MVP (no PyMuPDF) | **B/C** (avoid AGPL risk) | **PENDING** — must resolve before any PDF library usage |

---

## 8. Feature flag placement (REQUIRES DECISION)

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| Where is the `documentStudio` feature flag registered? | **A:** In `Code/config/config.js` features object + `TOOL_FEATURE` in `sidebarManager.js`<br>**B:** Only in `sidebarManager.js` (feature flag auto-detected)<br>**C:** Only in `toolsManager.js` `TOOLS` array | **A** (consistent with all other tools; verified in 02) | **PENDING** — must match existing pattern |

---

## 9. Tesseract language packs (REQUIRES DECISION)

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| Which Tesseract language packs ship with the sidecar? | **A:** English only (smallest bundle; ~5 MB traineddata)<br>**B:** English + Spanish + French (common documents; ~15 MB)<br>**C:** All available packs (large bundle; ~100+ MB) | **A** (recommended in 04 for minimize bundle; OCR optional behind flag) | **PENDING** |

---

## 10. Antivirus false positive mitigation (REQUIRES DECISION)

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| How are PyInstaller false positives handled? | **A:** Add installer whitelist; notify user on first launch; keep executable signatures valid<br>**B:** Distribute via internal channel only; do not ship to public<br>**C:** Use `onefile` + embedded manifest to reduce flagging (unproven) | **A** (recommended; verified in 06) | **PENDING** |

---

## Summary — All pending decisions (REQUIRES DECISION before any implementation phase)

| # | Decision | Must resolve before |
|---|----------|---------------------|
| 1 | Processing engine (A/B/C) | Phase 2 |
| 2 | Sidecar communication protocol (A/B/C) | Phase 2 |
| 3 | Sidecar packaging (A/B/C) | PyInstaller build |
| 4 | OCR engine (A/B/C) | Phase 1 sidecar |
| 5 | PDF→DOCX strategy (A/B/C) | Phase 5 |
| 6 | Database approach (A/B/C) | Phase 3 (DB schema) |
| 7 | PyMuPDF licensing (A/B/C) | Any PDF library usage |
| 8 | Feature flag placement (A/B/C) | Phase 2 IPC registration |
| 9 | Tesseract language packs (A/B/C) | Phase 1 sidecar |
| 10 | Antivirus false positive mitigation (A/B/C) | Packaging/signing |

**No phase should begin until its required decisions are recorded in this document.**