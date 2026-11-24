# 04 — Dependency and Library Research (Python Sidecar)

**Evidence status:** All candidate libraries below are evaluated against the requirements in the brief. No packages have
been installed. Licensing notes are based on publicly known license identifiers at the time of writing and are marked
**REQUIRES VERIFICATION** where I have not confirmed the exact terms from the project's own LICENSE file. Do not treat
any licensing statement here as legal advice — verify each library's LICENSE before distribution.

---

## 1. Candidate library evaluation matrix

| Requirement | Candidate technology | Offline | Windows | MVP? | License |
|-------------|---------------------|---------|---------|------|---------|
| PDF inspection & manipulation | PyMuPDF (fitz) | Yes | Yes | Yes | AGPL v3 |
| PDF structural operations | pikepdf | Yes | Yes | Yes | MPL-2.0 |
| New PDF generation | ReportLab | Yes | Yes | Yes | BSD-like |
| DOCX generation | python-docx | Yes | Yes | Yes | MIT |
| PDF to DOCX conversion | pdf2docx | Yes | Yes | Yes | MIT |
| OCR | Tesseract OCR | Yes | Yes | Optional | Apache 2.0 |
| OCR (alternative) | RapidOCR | Yes | Yes | Optional | Apache 2.0 / MIT |
| Image operations | Pillow | Yes | Yes | Yes | HPND |
| Advanced image analysis | OpenCV | Yes | Yes | Optional | Apache 2.0 |
| Request/response validation | Pydantic | Yes | Yes | Yes | MIT |
---

## 2. PyMuPDF (fitz)

**What it does:** PDF parsing, text extraction, page rendering, image extraction, link/annotation inspection, basic page manipulation (insert, delete, rotate, redaction), XREF access.

**Why useful:** Primary candidate for Document Inspector (page count, dimensions, orientation, text, images, scanned-page detection, layout, metadata) and for low-level PDF operations in PDF Writer (page copy/preserve).

**Limitations:** Rendering/extraction fidelity varies with complex PDFs; text-position-based layout reconstruction is approximate; AGPL v3 license is a distribution concern.

**Offline suitability:** Yes — fully local, no network.

**Windows compatibility:** Yes — wheels available for Windows (PyMuPDF wheels bundle MuPDF native library).

**Licensing:** **AGPL v3.** This is a strong copyleft license. If HelperTool is distributed as a combined work and PyMuPDF is linked, AGPL may require the whole application's source to be made available or require a commercial license from Artifex. **REQUIRES DECISION:** Confirm whether AGPL v3 is acceptable for HelperTool's distribution model, or obtain a commercial MuPDF license, or select an alternative (e.g., pikepdf + pdfminer.six for text, avoiding PyMuPDF). Treat as a **licensing risk (High)** until resolved.

**MVP classification:** Useful for MVP but licensing must be resolved first. Optional if licensing is unacceptable.
---
## 3. pikepdf

**What it does:** Low-level PDF object model manipulation based on qpdf. Copy/delete pages, merge, repair, metadata edit, encryption handling, object inspection.

**Why useful:** PDF Writer page preservation (copy template pages unchanged), page deletion/reordering, incremental update, preserving image-only pages, low-level structural operations PyMuPDF doesn't handle as cleanly.

**Limitations:** Not a high-level text/layout extraction library; pairs with PyMuPDF/pdfminer rather than replacing it.

**Offline suitability:** Yes.

**Windows compatibility:** Yes — wheels bundle qpdf.

**Licensing:** MPL-2.0 (qpdf-based) / the Python bindings are MIT. **REQUIRES VERIFICATION.** Generally permissive, lower risk than AGPL.

**MVP classification:** Recommended for PDF Writer page-preservation operations (MVP).
---
## 4. ReportLab

**What it does:** Programmatic PDF generation (canvas + platypus flowables). Draw text, shapes, images, tables; build multi-page documents from scratch.

**Why useful:** Generating NEW pages and overlay content for PDF Writer (REBUILD/GENERATE policies), building a table of contents, creating overlays to merge with preserved template pages.

**Limitations:** Canvas API is low-level (manual positioning); platypus is higher-level but still requires layout logic. Not a PDF editor — works best generating fresh content to be merged via pikepdf/PyMuPDF.

**Offline suitability:** Yes.

**Windows compatibility:** Yes — pure Python wheel.

**Licensing:** ReportLab has a dual model: commercial license and a free "ReportLab License" (BSDL-like but with restrictions). **REQUIRES VERIFICATION** of the exact version's license terms.

**MVP classification:** Recommended for PDF Writer new-page/TOC generation (MVP).
---
## 5. python-docx

**What it does:** Create and modify Microsoft Word `.docx` documents (OOXML). Paragraphs, headings, tables, images, sections, styles.

**Why useful:** DOCX export for both PDF to DOCX Converter and PDF Writer (optional DOCX export). Builds editable Word documents from reconstructed PDF content.

**Limitations:** DOCX is flowable; converting fixed-layout PDF to an *editable, well-formatted* DOCX is inherently lossy. python-docx builds documents; it does not import PDF. The Converter must reconstruct content first, then write DOCX.

**Offline suitability:** Yes.

**Windows compatibility:** Yes — pure Python wheel.

**Licensing:** MIT. **REQUIRES VERIFICATION.** Low risk.

**MVP classification:** Required for DOCX export (MVP).
---
## 6. pdf2docx

**What it does:** Converts PDF to DOCX by extracting text, images, tables and laying them out in a Word document.

**Why useful:** Potential drop-in for the PDF to DOCX Converter MVP — handles extraction + DOCX writing in one library.

**Limitations:** Conversion quality varies; struggles with complex layouts, multi-column, precise positioning. Output is an approximation, not a faithful reconstruction. Still requires the Document Inspector to flag scanned pages and apply OCR separately (pdf2docx does not OCR).

**Offline suitability:** Yes.

**Windows compatibility:** Yes — pure Python wheel (depends on pdfminer.six, PyMuPDF or similar).

**Licensing:** MIT. **REQUIRES VERIFICATION.** Low risk.

**MVP classification:** Candidate for Converter MVP, but output quality must be evaluated; hybrid approach (PyMuPDF extraction + python-docx writing) may give more control. Optional pending evaluation.
---
## 7. OCR — Tesseract

**What it does:** Optical character recognition engine (command-line `tesseract` + `pytesseract` Python wrapper). Supports many languages via traineddata files.

**Why useful:** OCR for scanned/image-based PDF pages detected by the Document Inspector. Produces text that can be included in DOCX export or a searchable PDF overlay.

**Limitations:** Requires the `tesseract` executable AND language traineddata files (`.traineddata`) to be bundled and available offline. Accuracy depends on image quality and language packs. Adds significant bundle size.

**Offline suitability:** Yes — if binaries + traineddata are bundled locally.

**Windows compatibility:** Yes — Windows installer available; must ship `tesseract.exe` + DLLs + traineddata.

**Licensing:** Apache 2.0 (engine). Traineddata files vary (many Apache 2.0, some have other terms). **REQUIRES VERIFICATION** for each language pack distributed.

**MVP classification:** Optional for MVP (OCR can be behind a flag); recommended for full scanned-page support.
---
## 8. OCR alternative — RapidOCR

**What it does:** OnnxRuntime-based OCR (detection + recognition), Python package.

**Why useful:** Potentially simpler bundling than Tesseract (No external executable; ONNX models bundled with package). Good accuracy on document images.

**Limitations:** Requires `onnxruntime` (heavy dependency, ~100+ MB) and model files. Less mature ecosystem than Tesseract for document workflows.

**Offline suitability:** Yes — models bundled locally.

**Windows compatibility:** Yes — onnxruntime Windows wheels.

**Licensing:** Apache 2.0 (RapidOCR); onnxruntime is MIT. **REQUIRES VERIFICATION.**

**MVP classification:** Optional alternative to Tesseract; evaluate bundle size vs. ease of packaging.
---
## 9. Pillow (PIL)

**What it does:** Image loading, saving, resizing, format conversion, basic filtering.

**Why useful:** Image preprocessing for OCR, image extraction support, thumbnail/preview generation, image-only page handling.

**Limitations:** Basic image ops only; not for PDF layout.

**Offline suitability:** Yes.

**Windows compatibility:** Yes — pure Python wheel.

**Licensing:** HPND (Historical Permission Notice and Disclosure). **REQUIRES VERIFICATION.** Permissive.

**MVP classification:** Recommended (MVP) — useful alongside PyMuPDF image extraction.
---
## 10. OpenCV (opencv-python)

**What it does:** Computer vision: image processing, contour detection, deskewing, line/table detection, preprocessing.

**Why useful:** Advanced scanned-page detection heuristics, image cleanup before OCR, table boundary detection, layout analysis support.

**Limitations:** Heavy bundle (~40-90 MB wheel). Mostly optional; Pillow + PyMuPDF may suffice for MVP.

**Offline suitability:** Yes.

**Windows compatibility:** Yes — opencv-python headless wheel recommended (no GUI deps).

**Licensing:** Apache 2.0. **REQUIRES VERIFICATION.**

**MVP classification:** Optional — post-MVP for advanced layout/image analysis.
---
## 11. Pydantic

**What it does:** Data validation and settings management using Python type annotations.

**Why useful:** Validate every sidecar request/response (job payloads, inspection results, generation plans). Prevents malformed IPC from reaching processing code. Supports the structured instruction plan (Pydantic models for page policy, section, instruction).

**Limitations:** Adds a dependency; validation is only as good as the schemas defined.

**Offline suitability:** Yes — pure Python.

**Windows compatibility:** Yes.

**Licensing:** MIT. **REQUIRES VERIFICATION.** Low risk.

**MVP classification:** Recommended (MVP) — enforces the IPC contract and structured plans.
---
## 12. PyInstaller

**What it does:** Freezes Python applications into standalone Windows executables (onedir: folder of files; onefile: single bundle that extracts to temp at runtime).

**Why useful:** Bundle the Python sidecar + all libraries + (optionally) Tesseract binaries/models into something the Electron main process can spawn via `child_process.spawn`.

**Limitations:**
- **onefile:** extracts to a temp directory at startup (slower first launch, antivirus scanning of extracted temp, `sys._MEIPASS` path quirks, relative asset paths need `sys._MEIPASS` resolution). Not ideal if Tesseract executables need stable paths.
- **onedir:** folder of DLLs/executables; easier to reference Tesseract binaries and traineddata by stable relative path; larger to ship but more predictable. Needs `asarUnpack`/`extraResources` in electron-builder so files are accessible outside the ASAR archive.
- Antivirus false positives are common for PyInstaller bootloaders (packaged Python executables are frequently heuristically flagged).
- Python version must match the build target.

**Offline suitability:** Yes — fully self-contained.

**Windows compatibility:** Yes — builds `.exe` on Windows.

**Licensing:** GPLv2 with exception. **REQUIRES VERIFICATION** — the exception allows distributing frozen applications without GPL-izing them, but confirm terms.

**MVP classification:** Recommended (MVP) for sidecar packaging. **REQUIRES DECISION:** onedir vs onefile (recommend onedir for Tesseract/binary stability).
---

## 5. License risk summary

| Library | License | Risk | Action |
|---------|---------|------|--------|
| PyMuPDF | AGPL v3 | High | Resolve before use (commercial license or alternative) |
| pikepdf | MPL-2.0/MIT | Low | Verify LICENSE |
| ReportLab | dual/commercial | Medium | Verify exact terms for version used |
| python-docx | MIT | Low | Verify |
| pdf2docx | MIT | Low | Verify |
| Tesseract | Apache 2.0 | Low | Verify traineddata terms |
| RapidOCR | Apache 2.0/MIT | Low | Verify |
| Pillow | HPND | Low | Verify |
| OpenCV | Apache 2.0 | Low | Verify |
| Pydantic | MIT | Low | Verify |
| PyInstaller | GPLv2 + exception | Low/Medium | Verify exception covers distribution |
| Packaging | PyInstaller | Yes | Yes | Yes | GPLv2 + exception |