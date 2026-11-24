# Document Studio — Project Documentation

**Document type:** Product overview, requirements, feature specification, architecture direction, and implementation plan  
**Target application:** Existing HelperTool Electron desktop application  
**Operating model:** Windows desktop, offline-first, local document processing

## Document index

1. [Project Overview](01-PROJECT-OVERVIEW.md)
2. [Functional Requirements and Features](02-FUNCTIONAL-REQUIREMENTS.md)
3. [User Workflows and Interface](03-USER-WORKFLOWS-AND-INTERFACE.md)
4. [Technical Architecture](04-TECHNICAL-ARCHITECTURE.md)
5. [Data, Projects, and File Management](05-DATA-AND-FILE-MANAGEMENT.md)
6. [Security, Privacy, and Reliability](06-SECURITY-AND-RELIABILITY.md)
7. [Implementation Roadmap](07-IMPLEMENTATION-ROADMAP.md)
8. [Acceptance Criteria and Decisions](08-ACCEPTANCE-CRITERIA-AND-OPEN-DECISIONS.md)

## Product direction

Document Studio is a document-processing workspace inside HelperTool. It is not a separate desktop application and must not replace or disrupt existing HelperTool tools.

Its initial scope is:

- PDF Inspector — inspect pages, metadata, text, images, and scan characteristics.
- PDF to DOCX — convert PDF content into editable Word documents, with OCR for scanned pages.
- PDF Writer — create and assemble PDFs from reusable templates, page instructions, and dynamic content.

The application should work without an internet connection. Processing should happen locally. OCR and other heavyweight capabilities should be optional components that can be packaged and verified independently.

## Important product principles

- Preserve the original source file; never silently overwrite it.
- Show users what can be reconstructed and what may not be editable.
- Separate source-page references from final output-page numbers.
- Preview before export.
- Make long-running jobs observable, cancellable where technically possible, and recoverable after failure.
- Do not introduce mandatory cloud services or AI APIs.
- Treat this documentation as a product and planning baseline, not proof that any particular source-code path or integration point exists.
