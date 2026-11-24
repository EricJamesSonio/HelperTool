# 08 — Acceptance Criteria and Open Decisions

## 1. MVP acceptance criteria

### Inspector

- [ ] Opens supported local PDFs.
- [ ] Reports page count and available metadata.
- [ ] Reports dimensions and orientation for each page.
- [ ] Distinguishes pages with extractable text from likely image-only pages.
- [ ] Detects embedded images where supported.
- [ ] Displays page previews.
- [ ] Produces structured inspection output.
- [ ] Does not modify the source file.
- [ ] Works without internet access.

### PDF-to-DOCX

- [ ] Converts supported text-based PDFs into DOCX.
- [ ] Extracts and places supported images.
- [ ] Preserves basic paragraphs and formatting.
- [ ] Identifies scanned pages and offers local OCR.
- [ ] Clearly reports pages or regions retained as images.
- [ ] Allows page-range selection.
- [ ] Saves to a new destination.
- [ ] Does not modify the source PDF.
- [ ] Output opens in a compatible word processor.

### PDF Writer

- [ ] Imports a PDF template without modifying the original.
- [ ] Stores a managed immutable template copy and hash.
- [ ] Creates and reopens projects.
- [ ] Supports the five defined page policies.
- [ ] Supports basic text and image content blocks.
- [ ] Previews generated output.
- [ ] Exports a valid PDF.
- [ ] Reports unresolved references and layout overflow.
- [ ] Separates source page references from final output page numbers.

### Shared platform behavior

- [ ] Runs inside HelperTool rather than a separate GUI.
- [ ] Uses a narrow preload API and validated IPC.
- [ ] Shows job state and errors.
- [ ] Handles sidecar startup failure.
- [ ] Handles unexpected sidecar exit.
- [ ] Cleans temporary data safely.
- [ ] Works offline.
- [ ] Does not regress existing HelperTool tools.

## 2. Test-document corpus

Create a controlled local test set containing:

1. Simple text PDF with selectable text.
2. Multi-page text PDF with headings and page numbers.
3. Scanned image-only PDF.
4. Mixed PDF with text and scanned pages.
5. PDF with tables.
6. PDF with multiple columns.
7. PDF with embedded images and captions.
8. PDF with different page sizes or orientations.
9. PDF with unusual fonts or symbols.
10. Encrypted PDF.
11. Damaged or malformed PDF.
12. Large PDF near the configured resource limits.

Use documents that the project is permitted to test and distribute internally. Do not include confidential personal documents in automated test fixtures.

## 3. Quality evaluation

### Inspector

Measure:
- Correct page count.
- Correct dimensions/orientation.
- Text detection accuracy.
- Scanned-page detection quality.
- Preview rendering time.
- Memory and disk use.

### PDF-to-DOCX

Evaluate:
- Text completeness.
- Reading order.
- Paragraph reconstruction.
- Table structure.
- Image placement.
- OCR accuracy.
- Editability.
- Visual similarity.
- Manual correction effort.

Do not use a single visual-fidelity score as the only success measure. Editability and visual similarity may conflict.

### PDF Writer

Evaluate:
- Page-policy correctness.
- Content ordering.
- Pagination stability.
- Overflow detection.
- Header/footer consistency.
- TOC page-number accuracy.
- Output validity.
- Preview/export consistency.

## 4. Open product decisions

These decisions should be made before the relevant phase begins.

| Decision | Why it matters | Suggested timing |
|---|---|---|
| Private/internal use or commercial distribution? | Determines dependency license constraints. | Phase 0 |
| Which Windows versions are supported? | Affects packaging and runtime compatibility. | Phase 0 |
| Which OCR languages are required at launch? | Affects OCR engine and package size. | Phase 0 / Phase 1 |
| Is OCR bundled or separately installed? | Affects offline guarantees and installation size. | Phase 1 |
| Which PDF page features must be preserved? | Defines PDF Writer scope. | Phase 0 / Phase 4 |
| What exactly does BLANK_RESERVED mean? | Prevents ambiguous page behavior. | Before Phase 3 |
| Should PDF Writer support DOCX export in the first release? | Expands layout and conversion scope. | Before Phase 4 |
| Should projects be portable between computers? | Affects file references and packaging. | Before Phase 3 |
| What are acceptable file/page/job limits? | Controls resource use and user expectations. | Phase 1 |
| Which document types are explicitly unsupported? | Helps communicate limitations. | Phase 1 / Phase 6 |

## 5. Recommended default decisions

- Offline processing is mandatory for core features.
- OCR is local and can be optional during the first inspector prototype.
- The original input file is never modified.
- The project pins a specific template version.
- Source pages, logical sections, and output pages are separate concepts.
- The TOC is generated after pagination.
- The sidecar is a processing engine, not a web server or GUI.
- No mandatory AI or cloud API is included.
- Licensing is a release blocker, not an afterthought.
- The first prototype is the Python Document Inspector.

## 6. Definition of done

A phase is complete only when:

1. Its stated deliverables exist.
2. Acceptance criteria for that phase pass.
3. Relevant tests and representative document cases pass.
4. Limitations and known issues are documented.
5. No unrelated HelperTool behavior has been changed.
6. The next phase's dependencies and decisions are clear.
