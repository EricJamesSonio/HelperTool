import { escapeHtml } from './utils.js';
import { state } from '../app_manager/appState.js';

export function getMainTemplate() {
    return `
      <div class="modal-content pt-modal">
        <div class="modal-header pt-header">
          <h3 class="modal-title pt-title">🧩 Prompt Tool</h3>
          <button class="modal-close-btn" id="promptToolCloseBtn">×</button>
        </div>
        <div class="modal-body pt-main">
          <div class="pt-sidebar">
            <div class="pt-sidebar-header">
              <div class="pt-sidebar-title">Categories</div>
            </div>
            <div id="promptCats" class="pt-cat-list"></div>
            <div class="pt-add-cat">
              <input id="promptCatName" class="sh-input sh-input-sm pt-input" placeholder="New category name" />
              <button id="promptCatAdd" class="sh-btn sh-btn-accent sh-btn-sm" type="button">＋ Add</button>
            </div>
          </div>

          <div class="pt-content">
            <div class="pt-no-cat-message">
              <div class="pt-no-cat-icon">📂</div>
              <div class="pt-no-cat-text">Select a category to manage prompts</div>
            </div>
            <div class="pt-prompt-list-wrap">
              <div class="pt-sidebar-header">
                <button class="pt-back-btn" id="promptBackToCats" type="button">← Back</button>
                <div class="pt-sidebar-title">Prompts</div>
              </div>
              <div id="promptList" class="pt-prompt-list"></div>
            </div>

            <div class="pt-editor">
              <div class="pt-editor-row">
                <div class="pt-editor-label">Applies to:</div>
                <select id="promptSupports" class="sh-input sh-input-sm pt-input">
                  <option value="code">Code Mode</option>
                  <option value="structure">Structure Mode</option>
                  <option value="both" selected>Both</option>
                </select>
                <button id="promptResetEditor" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">New Prompt</button>
              </div>
              <input id="promptTitle" class="sh-input pt-input" placeholder="Prompt title" />
              <textarea id="promptBody" class="sh-input pt-textarea" placeholder="Prompt text..."></textarea>
              <div class="pt-actions">
                <button id="promptSave" class="sh-btn sh-btn-primary sh-btn-sm" type="button">💾 Save</button>
                <button id="promptDelete" class="sh-btn sh-btn-danger sh-btn-sm" type="button" style="display:none;">🗑 Delete</button>
                <div style="flex:1"></div>
                <button id="promptToggleFavorite" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">☆ Favorite</button>
                <button id="promptTogglePin" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">📌 Pin</button>
              </div>
              <div style="font-size:12px; opacity:0.75;">Tip: Pins are per prompt and appear first in applicable results.</div>
            </div>
          </div>
        </div>
      </div>
    `;
}

export function getSelectionModalTemplate() {
    return `
      <div class="modal-content pt-selection-modal">
        <div class="modal-header pt-header">
          <h3 class="modal-title pt-title">🧩 Select Prompt(s)</h3>
          <button class="modal-close-btn" id="promptSelectionCloseBtn">×</button>
        </div>

        <div class="modal-body pt-selection-body">
          <div class="pt-selection-list">
            <div class="pt-editor-row">
              <div class="pt-editor-label">Filtered by: <b>${escapeHtml(state.actionType || '')}</b></div>
              <button id="promptSelectionClearBtn" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">Clear selected</button>
            </div>
            <div id="promptSelectionList" class="pt-prompt-list"></div>
          </div>

          <div class="pt-selection-preview">
            <div class="pt-sidebar-title">Selected Prompt Text</div>
            <textarea id="promptSelectionPreview" class="sh-input pt-textarea" readonly></textarea>
            <div style="font-size:12px; opacity:0.75; line-height:1.3;">
              Your selected prompt text will be prepended at the top of generated output.
            </div>
          </div>
        </div>

        <div class="modal-actions pt-actions">
          <button class="modal-btn modal-btn-secondary" id="promptSelectionCancelBtn" type="button">Cancel</button>
          <div style="flex:1"></div>
          <button class="modal-btn modal-btn-primary" id="promptSelectionConfirmBtn" type="button">✅ Apply & Continue</button>
        </div>
      </div>
    `;
}
