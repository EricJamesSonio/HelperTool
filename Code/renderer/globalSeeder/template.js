export function getPanelHTML() {
    return `
<div class="gs-panel-inner">

    <div class="gs-header">
        <div class="gs-header-left">
            <span class="gs-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="2" width="12" height="12" rx="2"/>
                    <path d="M6 6v4M10 6v4M6 10h4"/>
                </svg>
            </span>
            <div class="gs-header-text">
                <span class="gs-title">Global Seeder</span>
                <span class="gs-target-label" id="gsTargetLabel">No repo selected</span>
            </div>
        </div>
        <button class="gs-close-btn" id="gsCloseBtn" title="Close">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l12 12M16 4L4 16"/></svg>
        </button>
    </div>

    <div class="gs-mode-tabs">
        <button class="gs-mode-tab" id="gsModeStructure" data-mode="structure">
            Structure
        </button>
        <button class="gs-mode-tab gs-mode-tab--active" id="gsModeContent" data-mode="content">
            Structure + Content
        </button>
    </div>

    <!-- Input stage -->
    <div class="gs-stage" id="gsInputStage">
        <div class="gs-section-label" id="gsInputLabel">Paste file paths + code blocks below</div>
        <div class="gs-hint" id="gsInputHint">
            Paste Claude/Copilot output: each file path + code (fenced or plain). Smart-anchored to nearest matching folder — choose target if duplicates.
        </div>
        <textarea
            id="gsInput"
            class="gs-textarea"
            placeholder="Paste your file structure or Claude-style file blocks here…"
            spellcheck="false"
        ></textarea>
        <div class="gs-input-actions">
            <button class="gs-btn gs-btn-secondary" id="gsClearBtn">Clear</button>
            <button class="gs-btn gs-btn-primary"   id="gsParseBtn">Parse &amp; Preview</button>
        </div>
    </div>

    <!-- Preview stage -->
    <div class="gs-stage gs-stage-hidden" id="gsPreviewStage">
        <div class="gs-section-label">Review before seeding</div>
        <div class="gs-preview-summary" id="gsPreviewSummary"></div>
        <div class="gs-preview-list" id="gsPreviewList"></div>
        <div class="gs-preview-actions">
            <button class="gs-btn gs-btn-secondary" id="gsBackBtn">Edit</button>
            <button class="gs-btn gs-btn-primary"   id="gsSeedBtn">Seed</button>
        </div>
    </div>

    <!-- Seeding stage -->
    <div class="gs-stage gs-stage-hidden" id="gsSeedingStage">
        <div class="gs-seeding-pulse"></div>
        <div class="gs-seeding-label" id="gsSeedingLabel">Seeding…</div>
    </div>

</div>`;
}