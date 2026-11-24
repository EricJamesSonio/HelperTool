# Document Studio — Technical Documentation

This directory contains the evidence-based architectural analysis of the **HelperTool**
codebase performed in preparation for integrating a new feature called **Document Studio**.

## Status

**Read-only reconnaissance — no source code has been modified and no dependencies
have been installed.** This documentation is the primary technical guide for the
future implementation agent.

## Purpose

Document Studio is a proposed fully offline Windows desktop document-processing
environment to be integrated directly into HelperTool as another tool/panel.
Initial capabilities:

- **A. PDF to DOCX Converter** — extract text/structure, local OCR for scanned pages, export editable DOCX.
- **B. PDF Writer** — template-based document generation with page-handling policies (PRESERVE/OVERLAY/REBUILD/GENERATE/BLANK_RESERVED), table of contents, PDF/DOCX export.
- **C. Document Inspector** — shared page-level document analysis (text, images, scanned detection, OCR, layout).
- **D. Offline requirement** — no cloud APIs, external AI services, or internet connectivity for core functionality. Python-based document processing via a locally managed sidecar process.

## Documentation navigation

| File | Purpose |
|------|---------|
| `README.md` | This entry point: scope, navigation, status, pending decisions |
| `01-CODEBASE-ARCHITECTURE.md` | Verified existing HelperTool architecture (main, preload, IPC, renderer, worker, DB, build, packaging, tests) |
| `02-EXISTING-INTEGRATION-PATTERNS.md` | How existing tools are integrated: one simple tool (LOC Detector) and one complex/background tool (Video Compressor), traced UI → backend |
| `03-DOCUMENT-STUDIO-PROPOSED-ARCHITECTURE.md` | Proposed integration: Electron registration, Python sidecar, protocol, pipeline, storage, job management |
| `04-DEPENDENCY-AND-LIBRARY-RESEARCH.md` | Candidate Python libraries (PyMuPDF, pikepdf, ReportLab, python-docx, pdf2docx, Tesseract/RapidOCR, Pillow, OpenCV, Pydantic, PyInstaller) with licensing and offline notes |
| `05-DATA-STORAGE-AND-DOCUMENT-MODEL.md` | Proposed persistence: templates, projects, page mappings, instructions, generation plans, jobs, OCR results, previews |
| `06-SECURITY-AND-RISK-ASSESSMENT.md` | Existing Electron security controls, weaknesses, future requirements, untrusted document handling, risk priority |
| `07-IMPLEMENTATION-ROADMAP.md` | Phase 0–6 roadmap with objectives, prerequisites, files, dependencies, tasks, deliverables, tests, acceptance criteria, risks |
| `08-EXACT-FILE-INTEGRATION-MAP.md` | File-level integration map (EXISTING / NEW / MODIFY / UNKNOWN) with purpose, risk, and connections |
| `09-OPEN-QUESTIONS-AND-DECISIONS.md` | Unresolved decisions requiring product/architectural approval before implementation |

## Conventions used in this documentation

- **CONFIRMED** — directly verified in source code (file path and line referenced).
- **INFERRED** — strongly suggested by existing implementation, not directly stated.
- **UNKNOWN** — not yet established.
- **NOT PRESENT** — investigated; no implementation found.
- **REQUIRES DECISION** — requires an architectural or product decision.

Existing file paths are absolute within this repository, e.g.
`C:\Users\Windows 10\Desktop\Personal\Tools\HelperTool\Code\main.js`.
Proposed new paths are clearly labelled as proposals.

## Current investigation status

| Area | Status |
|------|--------|
| Repository inventory | CONFIRMED |
| Main process & window lifecycle | CONFIRMED |
| Preload & IPC pattern | CONFIRMED |
| Renderer & tool registration | CONFIRMED |
| Worker architecture | CONFIRMED |
| Database & persistence | CONFIRMED |
| File management & storage | CONFIRMED |
| Build & packaging | CONFIRMED |
| Testing & development workflow | CONFIRMED |
| Security architecture | CONFIRMED (existing); Document Studio requirements proposed |
| Document Studio design | PROPOSED (not implemented) |

## Important architectural decisions still pending

Recorded in `09-OPEN-QUESTIONS-AND-DECISIONS.md`. Key items include:

- Whether to extend the existing worker vs. a dedicated Python sidecar process.
- Whether Document Studio uses a dedicated SQLite database or reuses the existing one.
- Whether to bundle Tesseract OCR.
- Whether PyMuPDF licensing is acceptable for distribution.
- PDF-to-DOCX conversion strategy.

## Rule of engagement for implementers

Do **not** implement Document Studio from this documentation alone without first
re-verifying each referenced existing file against the current source. This
investigation is a snapshot at commit `60c9531` (branch `main`). If the codebase
has changed, treat the affected section as requiring re-verification.