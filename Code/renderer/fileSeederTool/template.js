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
            placeholder="app.css&#10;&#10;tokens/&#10;  _tokens.css&#10;  _typography.css&#10;&#10;base/&#10;  _reset.css&#10;  _utilities.css&#10;&#10;components/&#10;  _button.css&#10;  _card.css&#10;  _section.css&#10;  _navbar.css&#10;  _footer.css&#10;&#10;sections/&#10;  _hero.css&#10;  _features.css&#10;  _about.css&#10;  _pricing.css&#10;  _resources.css"
            spellcheck="false"
        ></textarea>
        <div class="fs-input-actions">
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