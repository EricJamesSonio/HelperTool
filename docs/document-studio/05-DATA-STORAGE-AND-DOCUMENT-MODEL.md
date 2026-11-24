# 05 — Data Storage and Document Model (Proposed)

**Evidence status:** This document describes a PROPOSED persistence architecture for Document Studio. All existing HelperTool
file paths and patterns are CONFIRMED from `01-CODEBASE-ARCHITECTURE.md`. Proposed paths, entities, and relationships
are explicitly labelled **PROPOSED** and require implementation. Nothing has been built or modified in the repository.

---

## 1. Storage structure proposal (not existing)

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

---

## 2. Proposed database entities & relationships (PROPOSED — node:sqlite)

A `document-studio.db` under `<userData>/document-studio/database/` — analogous to the `repo-console/console.db`
pattern from `Code/database/consoleDb.js`. Tables:

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `templates` | Imported PDF templates | `id`, `name`, `filePath`, `version`, `created_at`, `metadata` |
| `template_versions` | Versioned template snapshots | `id`, `templateId`, `version`, `snapshotJson`, `description` |
| `projects` | Document projects | `id`, `name`, `description`, `rootPath`, `created_at`, `updated_at` |
| `page_mappings` | Template → output page mapping | `id`, `projectId`, `templatePage`, `outputPage`, `policy`, `status` |
| `instructions` | User instructions for generation | `id`, `projectId`, `json`, `created_at` |
| `generation_plans` | Parsed page-generation plan | `id`, `projectId`, `json`, `outputPageCount`, `status`, `created_at` |
| `jobs` | Processing jobs | `id`, `projectId`, `type`, `status`, `progress`, `error`, `created_at`, `completed_at`, `outputPath` |
| `ocr_results` | Cached OCR output | `id`, `jobId`, `pageNo`, `text`, `confidence`, `created_at` |
| `previews` | Rendered preview PDFs | `id`, `jobId`, `previewPath`, `created_at` |
| `exports` | Final exported files | `id`, `jobId`, `outputPath`, `outputType` (pdf/docx), `created_at` |
---

## 3. Job data model (PROPOSED)

Each Document Studio job has a `jobId` (UUID) and the following shape:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Primary key |
| `type` | `'convert-pdf-to-docx' | 'write-pdf-from-template' | 'inspect-pdf' | Job category |
| `status` | `'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | Lifecycle state |
| `projectId` | string | FK to `projects.id` |
| `payload` | JSON | Original request parameters |
| `progress` | number (0–100) | Last reported percent |
| `stage` | string | e.g. `'ocr'`, `'reconstruct'`, `'layout'`, `'export'` |
| `page` | number | Current page being processed |
| `error` | string | Last error message |
| `outputPath` | string | Final exported file path |
| `created_at` | number (epoch ms) | Job creation time |
| `completed_at` | number (epoch ms) | Completion time |
| `durationMs` | number | `completed_at - created_at` |

### Progress & cancellation data (PROPOSED)

- Sidecar emits JSON Lines from stdout: `{ id, type: 'progress', data: { percent, stage, page, totalPages, message } }`.
- Main process stores `jobs.progress` and `jobs.stage` and forwards to renderer via `win.webContents.send('document-studio:progress', ...)`.
- Cancellation: renderer calls `document-studio:cancel-job` with `jobId` → main sends cancel to sidecar → sidecar stops current job, `jobs.status` = `'cancelled'`.
---

## 4. Document inspection result model (PROPOSED)

Per-page result from the `inspect` request (sidecar → main):

```json
{
  "pageNo": 1,
  "width": 595.28,
  "height": 841.92,
  "orientation": "portrait",
  "text": "Introduction  \n\n1. Purpose  \n\n...",
  "images": [
    { "filePath": "C:\\...\\image1.png", "width": 100, "height": 50, "x": 50, "y": 700 }
  ],
  "isScanned": false,
  "isImageOnly": false,
  "blocks": [
    { "type": 'paragraph', "x": 50, "y": 600, "width": 400, "height": 20, "text": 'Introduction' }
  ],
  "tables": [],
  "metadata": { "author": "Unknown", "creationDate": "2024-01-01" }
}
```

A global `metadata` object may also include: `title`, `author`, `subject`, `creator`, `producer`, `creationDate`, `pageCount`, `fileSize`.
---

## 5. Template model (PROPOSED)

- Stored as files under `<userData>/document-studio/templates/`.
- Each template file has a companion metadata row in the `templates` table:
  - `filePath`: absolute or repo-relative path to the PDF.
  - `name`: user-assigned name.
  - `version`: incremental version string (e.g. `v1`, `v2`).
  - `metadata`: extracted metadata at import time (page count, author, etc.).
- Template versions tracked in `template_versions` for rollback/reproducibility.

---

## 6. How storage does not interfere (PROPOSED)

- Existing app data directories (`symbol-index/`, `repo-console/`) are completely separate.
- Config file (`helper-config.json`) at `<userData>/helper-config.json` is untouched.
- New directory `<userData>/document-studio/` is created only on first Document Studio use.
- The main app's `initDatabase()` and `consoleDb.init()` continue unaffected; no shared schema changes.
This does not interfere with existing `symbol-index/`, `repo-console/`, or `helper-config.json`.