export function getPanelHTML() {
    return `
<div class="gs-panel-inner">

    <div class="gs-header">
        <div class="gs-header-left">
            <span class="gs-icon">🌐</span>
            <div class="gs-header-text">
                <span class="gs-title">Global Seeder</span>
                <span class="gs-target-label" id="gsTargetLabel">No repo selected</span>
            </div>
        </div>
        <button class="gs-close-btn" id="gsCloseBtn" title="Close">✕</button>
    </div>

    <div class="gs-mode-tabs">
        <button class="gs-mode-tab gs-mode-tab--active" id="gsModeStructure" data-mode="structure">
            📁 Structure
        </button>
        <button class="gs-mode-tab" id="gsModeContent" data-mode="content">
            📝 Structure + Content
        </button>
    </div>

    <!-- Input stage -->
    <div class="gs-stage" id="gsInputStage">
        <div class="gs-section-label" id="gsInputLabel">Paste file structure below</div>
        <div class="gs-hint" id="gsInputHint">
            Supports flat lists, indented trees, and box-drawing trees. Missing folders/files are created; existing ones are skipped.
        </div>
        <textarea
            id="gsInput"
            class="gs-textarea"
            placeholder="Paste your file structure or Claude-style file blocks here…"
            spellcheck="false"
        ></textarea>
        <div class="gs-input-actions">
            <button class="gs-btn gs-btn-secondary" id="gsClearBtn">Clear</button>
            <button class="gs-btn gs-btn-primary"   id="gsParseBtn">Parse &amp; Preview →</button>
        </div>
    </div>

    <!-- Preview stage -->
    <div class="gs-stage gs-stage-hidden" id="gsPreviewStage">
        <div class="gs-section-label">Review before seeding</div>
        <div class="gs-preview-summary" id="gsPreviewSummary"></div>
        <div class="gs-preview-list" id="gsPreviewList"></div>
        <div class="gs-preview-actions">
            <button class="gs-btn gs-btn-secondary" id="gsBackBtn">← Edit</button>
            <button class="gs-btn gs-btn-primary"   id="gsSeedBtn">Seed</button>
        </div>
    </div>

    <!-- Seeding stage -->
    <div class="gs-stage gs-stage-hidden" id="gsSeedingStage">
        <div class="gs-seeding-spinner">🌐</div>
        <div class="gs-seeding-label" id="gsSeedingLabel">Seeding…</div>
    </div>

</div>`;
}