# 04 — Technical Architecture

## 1. Architecture overview

Document Studio should reuse the existing HelperTool Electron application shell.

Recommended responsibility split:

### Electron main process

- Owns the Python sidecar process lifecycle.
- Registers and validates Document Studio IPC handlers.
- Opens native file dialogs where appropriate.
- Creates isolated job directories.
- Enforces allowed input/output locations and processing limits.
- Receives sidecar progress and result events.
- Handles application shutdown and sidecar cleanup.

### Renderer

- Displays the Document Studio interface.
- Collects user choices and structured instructions.
- Displays previews, job state, warnings, and results.
- Calls a narrow, purpose-built preload API.
- Does not access Node.js filesystem or child-process APIs directly.

### Preload bridge

- Exposes only the required Document Studio operations.
- Validates or constrains request shapes where appropriate.
- Does not expose raw `ipcRenderer`, `fs`, or `child_process`.

### Python document engine

- Performs PDF inspection, extraction, OCR coordination, DOCX generation, PDF generation, and validation.
- Communicates through a documented local process protocol.
- Does not host an HTTP server unless a future requirement justifies it.
- Does not require network access for core processing.

## 2. Sidecar recommendation

Use a bundled Python sidecar launched by Electron's main process.

A packaged executable built with PyInstaller is a candidate deployment approach. Evaluate one-folder (`onedir`) packaging first because it is generally easier to diagnose and can avoid repeated extraction overhead. Confirm the final approach through clean-machine packaging tests.

Do not introduce a second GUI framework. The sidecar is a processing engine only.

## 3. Process communication

A JSON Lines protocol over stdin/stdout is a suitable initial design:

- One JSON object per line.
- Standard output is reserved for protocol messages.
- Standard error is reserved for diagnostics.
- Every request and response includes a request ID.
- Long-running operations emit progress events.
- The protocol has explicit success, failure, and cancellation states.

### Example message shapes

Request:

```json
{
  "type": "request",
  "requestId": "unique-id",
  "operation": "inspect_pdf",
  "payload": {
    "jobId": "job-id",
    "inputPath": "managed-input.pdf"
  }
}
```

Progress:

```json
{
  "type": "progress",
  "requestId": "unique-id",
  "jobId": "job-id",
  "stage": "rendering_pages",
  "percent": 45,
  "message": "Rendering page previews"
}
```

Result:

```json
{
  "type": "result",
  "requestId": "unique-id",
  "jobId": "job-id",
  "status": "completed",
  "payload": {
    "pageCount": 12
  }
}
```

Error:

```json
{
  "type": "error",
  "requestId": "unique-id",
  "jobId": "job-id",
  "code": "UNSUPPORTED_DOCUMENT",
  "message": "The document cannot be processed."
}
```

These are illustrative protocol examples, not existing HelperTool APIs.

## 4. Lifecycle, concurrency, and cancellation

The implementation must define:

- Whether the sidecar is persistent or started per job.
- How multiple jobs are queued and scheduled.
- How request IDs are correlated with job IDs.
- What happens if the sidecar exits unexpectedly.
- How pending requests are failed or retried.
- How cancellation is requested and acknowledged.
- How timeouts are applied.
- How temporary files are cleaned up.
- How application shutdown waits for or terminates active work.

A single synchronous CPU-bound OCR operation can prevent a Python process from reading a cancellation message. Therefore cancellation cannot be assumed to work merely because a `cancel` JSON message exists. Use a worker process, cooperative checkpoints, or another verified mechanism for interruptible jobs.

Start with conservative concurrency. Increase it only after measuring CPU, RAM, and disk use on representative documents.

## 5. Candidate Python components

These are candidates for evaluation, not a finalized dependency list.

| Capability | Candidate | Evaluation notes |
|---|---|---|
| PDF inspection and text extraction | PyMuPDF or another PDF library | Review license and distribution implications before selection. |
| PDF manipulation | pikepdf / another suitable library | Validate preservation and supported operations. |
| PDF generation | ReportLab or a suitable layout engine | Test pagination, font embedding, and page overlays. |
| DOCX creation | python-docx | Suitable for document construction; layout reconstruction remains application logic. |
| PDF-to-DOCX baseline | pdf2docx or custom pipeline | Evaluate output quality and license before adoption. |
| OCR | Tesseract or RapidOCR | Compare offline packaging, languages, accuracy, and licensing. |
| Image processing | Pillow; optional OpenCV | Include only where needed. |
| Schema validation | Pydantic | Validate sidecar requests and structured project data. |
| Packaging | PyInstaller | Test Windows runtime dependencies and antivirus behavior. |

### Licensing gate

Do not finalize a library solely because it is technically convenient. Review the exact version's license, transitive dependencies, redistribution terms, and intended distribution model. PyMuPDF's AGPL/commercial licensing requires particular attention before it is selected for a distributed application.

## 6. PDF-to-DOCX processing strategy

Use a hybrid pipeline:

1. Inspect the PDF.
2. Classify each page and region.
3. Extract native text and geometry where available.
4. Run OCR on image-based pages when enabled.
5. Identify paragraphs, columns, tables, and images.
6. Reconstruct DOCX content using editable structures where feasible.
7. Retain selected complex regions as images only when the user chooses or the conversion policy requires it.
8. Produce a conversion report.
9. Validate that the DOCX opens and contains expected content.

Do not promise exact visual fidelity. Provide a clear mode choice between editability and layout similarity.

## 7. PDF Writer processing strategy

Represent the document as a structured project rather than a list of fixed output page numbers.

Recommended conceptual entities:

- Template and template version.
- Source page.
- Page policy.
- Logical section.
- Content block.
- Placement anchor.
- Generation settings.
- Layout result.
- Final page range.
- Job and output artifact.

Stable section and block IDs should survive reordering and repagination. Final page numbers should be derived from the completed layout, not stored as permanent references in the source template.

### Generation sequence

1. Load project and pinned template version.
2. Validate source references and instructions.
3. Resolve page policies.
4. Build the ordered logical content stream.
5. Measure and paginate content.
6. Apply headers, footers, and page numbering.
7. Determine final section page ranges.
8. Generate the TOC from final pagination.
9. Render final PDF.
10. Validate output and report warnings.

If TOC generation changes pagination, use a controlled second layout pass or reserve a defined TOC region and verify the final page map.

## 8. Preview strategy

The renderer may display page previews generated by the local engine. Use thumbnails for navigation and render higher-resolution pages on demand. Cache previews by source/template hash and relevant render settings. Bound cache size and allow cleanup.

## 9. Database choice

A dedicated Document Studio local database is recommended initially to reduce coupling with HelperTool's existing database schema. Reuse existing database infrastructure only after verifying that it is appropriate.

The database should store project metadata, template references, job history, and settings—not large PDF/DOCX binary contents. Store document files in managed directories and keep paths and hashes in the database.

If using `node:sqlite`, verify support in the actual Electron runtime, not only the system Node.js installation.
