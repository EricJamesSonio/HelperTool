# 08 — Exact File Integration Map

**Evidence status:** All referenced existing files/paths are CONFIRMED from `01-CODEBASE-ARCHITECTURE.md`. All proposed paths are explicitly labelled **PROPOSED** and require implementation. This is a read-only mapping document; no source code was modified.

---

## Purpose

Concrete file-level integration plan documenting every proposed new or modified file that future agents must create or modify to implement Document Studio. Each entry includes: status (EXISTING/NEW/MODIFY/UNKNOWN), purpose, existing dependencies, planned changes, and risk assessment.

---

## Integration Map (partial)

| File path | Status | Purpose | Existing dependency | Planned change | Risk |
|-----------|--------|---------|---------------------|----------------|------|
| `Code/config/config.js` | EXISTING | Add `documentStudio` to feature defaults | Existing feature flag schema; `defaultConfig()` function | Add `documentStudio: false` to `features` object; add to `defaultFeatures` if needed; ensure `writeConfig` / `flushConfig` handle it | LOW |
| `Code/renderer/app_manager/toolsManager.js` | MODIFY | Register Document Studio in `TOOLS` array + `RUN` action | Existing `TOOLS` array pattern; `RUN` object; `on()` flag helper; `ICONS` object; `PanelRegistry.closeAll()` | Add `{ id: 'document-studio', key: 'document-studio', flag: 'documentStudio', icon: ICONS.documentStudio, name: 'Document Studio', desc: 'PDF conversion, writing & inspection', shortcut: null }` to `TOOLS`; add `RUN['document-studio']` async function; add `TOOL_FEATURE['document-studio'] = 'documentStudio'` mapping | MEDIUM |
| `Code/renderer/app_manager/sidebarManager.js` | MODIFY | Map tool key to feature flag | Existing `TOOL_FEATURE` map (lines 9-45) | Add `'document-studio': 'documentStudio'` to `TOOL_FEATURE` object | LOW |
| `Code/renderer/documentStudio.js` | NEW | Tool module (class or export `open/close/isOpen`) | Follow `videoTool.js` class pattern or `locDetector.js` export pattern | Create full tool module with `initialize()`, `render(container)`, `destroy()` methods; UI components for converter/inspector/writer; integration with `window.electronAPI.documentStudio.*` | MEDIUM |
| `Code/main.js` | EXISTING | Entry point; register Document Studio IPC in `registerAllIpc` | Existing `FEATURE_IPC` pattern; `safeRegister`; tiered registration | Add `document-studio` feature flag to `FEATURE_IPC` entries; optionally add tier 2 registration for Document Studio IPC; call `shared.onFeaturesChanged` when flag toggles | LOW |