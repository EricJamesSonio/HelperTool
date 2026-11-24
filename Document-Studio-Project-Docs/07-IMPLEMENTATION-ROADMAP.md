# 07 — Implementation Roadmap

## Delivery strategy

Build Document Studio incrementally. Validate the local document engine before integrating a large feature set into HelperTool. Do not begin by implementing the full PDF Writer and converter simultaneously.

## Phase 0 — Product and technical decisions

**Goal:** Confirm the requirements, constraints, and dependency choices.

Tasks:
- Review the existing HelperTool architecture and integration conventions.
- Confirm supported Windows versions and minimum hardware assumptions.
- Decide whether the application will be distributed commercially or privately.
- Review licenses for PDF, OCR, DOCX, and packaging libraries.
- Select a first supported PDF feature set.
- Define initial file-size, page-count, DPI, and job limits.
- Define the sidecar protocol and job lifecycle.
- Approve the project data model and page-policy semantics.

Deliverables:
- Approved requirements.
- Dependency and licensing decision record.
- Sidecar protocol specification.
- Initial test-document corpus.

Exit criteria:
- No unresolved critical licensing issue.
- Core architecture and security boundaries approved.

## Phase 1 — Python Document Inspector prototype

**Goal:** Prove that local PDF inspection works independently of the HelperTool UI.

Tasks:
- Create a Python processing prototype.
- Open representative text-based, scanned, and mixed PDFs.
- Extract metadata and page dimensions.
- Detect text and image presence per page.
- Render page previews.
- Produce structured inspection JSON.
- Evaluate OCR on selected scanned pages.
- Measure runtime and memory use.
- Record unsupported and edge-case behavior.

Deliverables:
- Working local inspector prototype.
- Sample inspection reports.
- Dependency/license review.
- Performance and limitation report.

Exit criteria:
- Works offline.
- Handles the agreed test corpus.
- Produces stable structured results.
- Does not modify input files.

## Phase 2 — Sidecar and HelperTool integration

**Goal:** Run the inspector through the existing HelperTool interface.

Tasks:
- Package the Python engine for Windows.
- Implement the Electron main-process sidecar manager.
- Implement the preload bridge and validated IPC handlers.
- Add the Document Studio tool entry and workspace.
- Implement JSONL request/result/progress handling.
- Implement job IDs, error handling, and shutdown behavior.
- Verify clean installation and launch.

Deliverables:
- Document Studio visible inside HelperTool.
- Inspector workflow operating through the sidecar.
- Job status and diagnostic logs.

Exit criteria:
- No separate GUI application.
- Existing HelperTool tools remain functional.
- Offline inspection succeeds on a clean Windows environment.

## Phase 3 — Template manager and project foundation

**Goal:** Build reusable template and project management without full document generation.

Tasks:
- Import and hash source templates.
- Store immutable template versions.
- Create, open, rename, duplicate, and delete projects.
- Display template pages and metadata.
- Add page-policy assignment UI and validation.
- Define stable source-page, section, and block IDs.
- Persist project state.

Deliverables:
- Template library.
- Project manager.
- Page mapping editor.
- Persistent project manifest/database.

Exit criteria:
- Template versions remain immutable.
- Projects reopen with their settings and mappings intact.
- Source page references are validated.

## Phase 4 — PDF Writer MVP

**Goal:** Generate a valid PDF from a template and structured content.

Tasks:
- Implement PRESERVE and basic OVERLAY.
- Implement basic REBUILD and GENERATE paths.
- Define BLANK_RESERVED behavior precisely.
- Add text and image content blocks.
- Add headers, footers, and page numbering.
- Implement basic dynamic pagination.
- Generate preview pages.
- Validate output before export.

Deliverables:
- Working template-based PDF generation.
- Preview and export.
- Page-level warnings and generation report.

Exit criteria:
- Source pages and generated pages follow the selected policies.
- Dynamic content does not silently overflow.
- Exported PDF opens and matches the preview.

## Phase 5 — Advanced pagination and document structure

**Goal:** Support complex multi-section documents.

Tasks:
- Add stable logical sections and content blocks.
- Add section ordering and pagination rules.
- Add final page-range calculation.
- Generate TOC after pagination.
- Add TOC regeneration when content changes.
- Improve tables, headers, footers, and overflow handling.
- Add regression tests for pagination.

Deliverables:
- Dynamic multi-page document generation.
- Final page map.
- Generated TOC and page numbering.

Exit criteria:
- TOC page references match final output.
- Reordering or editing sections triggers correct repagination.
- No stale source-page-to-output-page assumptions.

## Phase 6 — PDF to DOCX MVP

**Goal:** Convert supported PDFs into useful editable Word documents.

Tasks:
- Implement native text extraction and DOCX reconstruction.
- Add image extraction and placement.
- Add basic paragraph and table reconstruction.
- Integrate OCR for scanned pages.
- Add conversion modes and page-range selection.
- Generate a conversion report.
- Test with representative real-world PDFs.

Deliverables:
- PDF-to-DOCX workflow.
- Conversion report with page-level limitations.
- Supported-format and quality documentation.

Exit criteria:
- Output DOCX opens in a compatible word processor.
- Editable versus image-retained content is clearly reported.
- Conversion does not modify the original PDF.

## Phase 7 — Hardening and release

**Goal:** Prepare the feature for reliable distribution.

Tasks:
- Test on clean Windows machines.
- Test with network disabled.
- Test malformed, oversized, encrypted, and mixed-content PDFs.
- Test sidecar crashes, timeouts, cancellation, and app shutdown.
- Validate packaged OCR language data.
- Review antivirus false positives and packaging behavior.
- Verify dependency notices and licenses.
- Measure memory, CPU, disk, and processing time.
- Add user documentation and troubleshooting guidance.

Deliverables:
- Release candidate.
- Security and reliability test report.
- Dependency notices.
- User guide and known-limitations list.

Exit criteria:
- Core workflows work offline.
- No known critical security or licensing blocker.
- Existing HelperTool features pass regression testing.

## Recommended first implementation

Start with **Phase 1: Python Document Inspector prototype**. Keep it independent from the HelperTool UI until inspection output, dependency choices, and performance are validated. Do not start with full PDF Writer generation or PDF-to-DOCX reconstruction.
