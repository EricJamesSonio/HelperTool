/**
 * renderer/fileSeederTool/template.js
 */

export function getPanelHTML() {
    return `
<div class="fs-panel-inner">

    <!-- Header -->
    <div class="fs-header">
        <div class="fs-header-left">
            <span class="fs-icon">🌱</span>
            <div class="fs-header-text">
                <span class="fs-title">File Seeder</span>
                <span class="fs-target-label" id="fsTargetLabel">No folder selected</span>
            </div>
        </div>
        <button class="fs-close-btn" id="fsCloseBtn" title="Close">✕</button>
    </div>

    <!-- Input stage -->
    <div class="fs-stage" id="fsInputStage">
        <div class="fs-section-label">Paste file structure below</div>
        <div class="fs-hint">
            Supports flat lists, indented trees, and box-drawing trees.
            Same indent = siblings, deeper indent = children. Comments start with <code>#</code>.
        </div>
        <textarea
            id="fsInput"
            class="fs-textarea"
            placeholder="Paste or type your file structure here…"
            spellcheck="false"
        >app/
├── Modules/
│   ├── Auth/
│   │   ├── Controllers/
│   │   ├── Services/
│   │   ├── Requests/
│   │   ├── Resources/
│   │   ├── Models/
│   │   ├── Policies/
│   │   ├── DTOs/
│   │   ├── Exceptions/
│   │   └── routes.php
│   │
│   ├── User/
│   │   ├── Controllers/
│   │   ├── Services/
│   │   ├── Requests/
│   │   ├── Resources/
│   │   ├── Models/
│   │   ├── DTOs/
│   │   ├── Policies/
│   │   ├── Exceptions/
│   │   └── routes.php
│   │
│   ├── Product/
│   │   ├── Controllers/
│   │   ├── Services/
│   │   ├── Requests/
│   │   ├── Resources/
│   │   ├── Models/
│   │   ├── DTOs/
│   │   ├── Policies/
│   │   ├── Exceptions/
│   │   └── routes.php
│   │
│   └── Order/
│       ├── Controllers/
│       ├── Services/
│       ├── Requests/
│       ├── Resources/
│       ├── Models/
│       ├── DTOs/
│       ├── Policies/
│       ├── Exceptions/
│       └── routes.php
│
├── Shared/
│   ├── Base/
│   │   ├── BaseController.php
│   │   ├── BaseService.php
│   │   └── BaseRepository.php
│   │
│   ├── Traits/
│   ├── Helpers/
│   ├── Enums/
│   ├── Exceptions/
│   ├── Middleware/
│   └── Services/
│
└── Providers/</textarea>
        <div class="fs-input-actions">
            <button class="fs-btn fs-btn-secondary" id="fsResetBtn">↺ Reset</button>
            <button class="fs-btn fs-btn-secondary" id="fsClearBtn">Clear</button>
            <button class="fs-btn fs-btn-primary"   id="fsParseBtn">Parse &amp; Preview →</button>
        </div>
    </div>

    <!-- Preview stage -->
    <div class="fs-stage fs-stage-hidden" id="fsPreviewStage">
        <div class="fs-section-label">Review before seeding</div>

        <div class="fs-preview-summary" id="fsPreviewSummary"></div>

        <div class="fs-preview-list" id="fsPreviewList"></div>

        <div class="fs-preview-actions">
            <button class="fs-btn fs-btn-secondary" id="fsBackBtn">← Edit</button>
            <button class="fs-btn fs-btn-primary"   id="fsSeedBtn">Seed Files</button>
        </div>
    </div>

    <!-- Seeding stage (progress feedback) -->
    <div class="fs-stage fs-stage-hidden" id="fsSeedingStage">
        <div class="fs-seeding-spinner">🌱</div>
        <div class="fs-seeding-label">Seeding files…</div>
    </div>

</div>`;
}