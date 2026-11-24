# 03 — User Workflows and Interface

## 1. Entry point

Document Studio appears as a tool inside the existing HelperTool navigation. It should follow HelperTool's current tool and panel conventions rather than introducing a separate application window or independent GUI framework.

The workspace can use three primary tabs:

- Inspector
- PDF to DOCX
- PDF Writer

Shared areas may include Recent Projects, Job Queue, and Settings.

## 2. Inspect a PDF

1. User opens Document Studio.
2. User selects a PDF or drops it into the workspace.
3. The app validates the file and creates an inspection job.
4. The Inspector analyzes document metadata and pages.
5. The user sees a document summary and page list.
6. Selecting a page shows its preview, extracted text, detected images, and classification.
7. The user may run OCR on selected pages.
8. The user may save or export the inspection report, or continue to conversion or PDF Writer.

### Expected screen areas

- Document summary.
- Page thumbnail strip or list.
- Selected-page preview.
- Page analysis panel.
- OCR action and status.
- Warnings and report export.

## 3. Convert PDF to DOCX

1. User selects a source PDF.
2. Inspector results are reused or generated.
3. User chooses page range and conversion mode.
4. User configures OCR and language options if required.
5. The app displays expected limitations and detected scanned pages.
6. User starts conversion.
7. Job progress is displayed by stage.
8. User reviews the conversion summary and output.
9. User saves the DOCX to a selected destination.

### Example job stages

- Validating input.
- Inspecting pages.
- Extracting text and images.
- Running OCR on selected pages.
- Reconstructing paragraphs and tables.
- Building DOCX.
- Validating output.
- Completed.

## 4. Create a PDF Writer project

1. User creates a project.
2. User imports a template PDF or chooses a blank document.
3. The app creates an immutable managed copy and records its hash.
4. User reviews template pages.
5. User assigns a page policy to each page or logical page region.
6. User adds logical sections and content blocks.
7. User enters or imports content.
8. User configures headers, footers, page numbering, and TOC settings.
9. The app validates instructions and unresolved references.
10. User generates a preview.
11. The layout engine paginates dynamic content.
12. The app calculates final page ranges and generates the TOC.
13. User reviews warnings and corrects content or layout.
14. User exports the final PDF.

## 5. Page policy editor

For each source page, show:

- Source page number.
- Thumbnail.
- Current policy.
- Whether the page is retained or reconstructed.
- Associated content blocks or overlay instructions.
- Warnings.

Changing a policy should not silently discard user-authored content. Confirm destructive changes and preserve recoverable project data.

## 6. Project navigation

A PDF Writer project should provide a clear distinction between:

- **Source pages:** pages in the imported template.
- **Logical sections:** named content units in the project.
- **Output pages:** pages produced after layout and pagination.

The interface must not imply these numbers are interchangeable.

## 7. Job queue

Each job should show:

- Job ID.
- Job type.
- Source/project name.
- Current state.
- Progress stage.
- Start time and elapsed time.
- Output location when complete.
- Error summary when failed.
- Cancel action when cancellation is supported.

A completed job should remain distinguishable from a successful export. For example, conversion may complete but output validation may fail.

## 8. Error and warning presentation

Use clear, actionable messages. Examples:

- “This PDF is password-protected. Unlock it before importing.”
- “Page 4 appears to be a scanned image. OCR is needed to extract editable text.”
- “The table on page 7 may need manual correction.”
- “This section exceeds the available template region and will continue on another page.”
- “A referenced source page no longer exists. Review the page mapping before generating.”
- “The output could not be validated. The source file has not been changed.”

Avoid presenting raw stack traces as the primary user-facing error. Keep diagnostic details in logs.

## 9. Accessibility and usability

- Keyboard-accessible primary actions.
- Visible focus states.
- Clear status labels and icons.
- Do not rely on color alone to communicate job state or warnings.
- Provide readable progress messages.
- Confirm destructive project actions.
- Keep source and output paths visible.
