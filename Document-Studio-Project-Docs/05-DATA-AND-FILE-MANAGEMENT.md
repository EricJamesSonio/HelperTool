# 05 — Data, Projects, and File Management

## 1. Storage root

Use a dedicated application data directory under Electron's user data location, for example:

`<userData>/document-studio/`

Suggested structure:

```text
document-studio/
├── database/
│   └── document-studio.sqlite
├── templates/
│   └── <template-id>/
│       ├── source.pdf
│       ├── manifest.json
│       └── previews/
├── projects/
│   └── <project-id>/
│       ├── project.json
│       ├── inputs/
│       ├── outputs/
│       └── previews/
├── jobs/
│   └── <job-id>/
│       ├── input/
│       ├── work/
│       ├── output/
│       └── job-log.json
├── cache/
├── exports/
└── logs/
```

This is a proposed logical structure. Final paths should follow the existing application's conventions after codebase inspection.

## 2. Storage rules

- Keep user-selected originals unchanged.
- Copy imported templates into managed storage.
- Record a cryptographic hash for source files and template versions.
- Separate temporary work files from final exports.
- Use unique job directories to prevent collisions.
- Do not trust a filename or path supplied by the renderer.
- Do not allow a project to silently switch to a different template version.
- Provide cleanup controls for cache and old temporary files.
- Do not delete source documents as part of ordinary cleanup.

## 3. Core data concepts

### Template

- `templateId`
- `name`
- `description`
- `createdAt`
- `updatedAt`
- `activeVersionId`

### Template version

- `templateVersionId`
- `templateId`
- `version`
- `sourceFilePath`
- `sourceHash`
- `pageCount`
- `pageMetadata`
- `createdAt`

### Project

- `projectId`
- `name`
- `createdAt`
- `updatedAt`
- `templateVersionId` (nullable for blank projects)
- `projectStatus`
- `settings`

### Source page

- `sourcePageId`
- `templateVersionId`
- `sourcePageIndex`
- `dimensions`
- `orientation`
- `inspectionData`

### Page policy

- `pagePolicyId`
- `projectId`
- `sourcePageId` or logical target
- `policy`
- `configuration`

### Logical section

- `sectionId`
- `projectId`
- `title`
- `orderIndex`
- `paginationRules`

### Content block

- `blockId`
- `sectionId`
- `blockType`
- `content`
- `style`
- `anchor`
- `orderIndex`

### Job

- `jobId`
- `projectId` (nullable for standalone inspection/conversion)
- `jobType`
- `status`
- `progress`
- `startedAt`
- `finishedAt`
- `errorCode`
- `errorSummary`

### Output artifact

- `artifactId`
- `jobId`
- `artifactType`
- `filePath`
- `fileHash`
- `createdAt`

These are conceptual fields. Final schemas should be designed after the chosen libraries and actual workflows are validated.

## 4. Project portability

A future project export/import feature may package:

- Project manifest.
- Structured instructions.
- Template reference or an included template copy, subject to size and user choice.
- Required source assets.
- Generated outputs, optionally.

The initial release does not need a portable archive format, but project manifests should avoid unnecessary machine-specific assumptions.

## 5. Retention and cleanup

Define configurable policies for:

- Temporary job directories.
- Preview cache.
- Failed job artifacts.
- Old generated outputs.
- Logs.

Cleanup must verify that a path is inside the Document Studio managed root before deleting it. Never recursively delete a path based only on untrusted project data.

## 6. Backup expectations

At minimum, provide a way to preserve project manifests and templates. Consider a project backup/export feature after the MVP workflows are stable. A database backup should be coordinated with active writes.
