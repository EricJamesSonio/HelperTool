import { escapeHtml } from './utils.js';
import { state } from '../app_manager/appState.js';

const ICON_PROMPT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4a2 2 0 0 1 2-2h4.5L15 7.5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M10.5 2v5.5H16"/><path d="M7 9h4"/><path d="M7 13h4"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10 4 4 8-8"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4v12"/><path d="M4 10h12"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10H5"/><path d="m10 5-5 5 5 5"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14"/><path d="M7 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M5 5v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5"/></svg>';
const ICON_REMOVE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';
const ICON_FOLDER = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H9L7 4H4a2 2 0 0 0-2 2v1z"/></svg>';
export const ICON_STAR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 1l2.3 4.7 5.2.8-3.8 3.6.9 5.2L10 13.2l-4.6 2.1.9-5.2L2.5 6.5l5.2-.8L10 1z"/></svg>';
export const ICON_STAR_FILLED = '<svg viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M10 1l2.3 4.7 5.2.8-3.8 3.6.9 5.2L10 13.2l-4.6 2.1.9-5.2L2.5 6.5l5.2-.8L10 1z"/></svg>';
export const ICON_PIN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2l4 4-8 8-4-4 8-8z"/><path d="M5 15l-3 3"/></svg>';
export const ICON_EDIT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3.5a2.12 2.12 0 0 1 3 3L5.5 19l-4 1 1-4Z"/></svg>';

export function getMainTemplate() {
    return `
      <div class="modal-content pt-modal">
        <div class="modal-header pt-header">
          <h3 class="modal-title pt-title">${ICON_PROMPT} Prompt Tool</h3>
          <button class="modal-close-btn" id="promptToolCloseBtn">${ICON_REMOVE}</button>
        </div>
        <div class="modal-body pt-main">
          <div class="pt-sidebar">
            <div class="pt-sidebar-header">
              <div class="pt-sidebar-title">Categories</div>
            </div>
            <div id="promptCats" class="pt-cat-list"></div>
            <div class="pt-add-cat">
              <input id="promptCatName" class="sh-input sh-input-sm pt-input" placeholder="New category name" />
              <button id="promptCatAdd" class="sh-btn sh-btn-accent sh-btn-sm" type="button">${ICON_PLUS} Add</button>
            </div>
          </div>

          <div class="pt-content">
            <div class="pt-no-cat-message">
              <div class="pt-no-cat-icon">${ICON_FOLDER}</div>
              <div class="pt-no-cat-text">Select a category to manage prompts</div>
            </div>
            <div class="pt-prompt-list-wrap">
              <div class="pt-sidebar-header">
                <button class="pt-back-btn" id="promptBackToCats" type="button">${ICON_BACK} Back</button>
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
                <button id="promptSave" class="sh-btn sh-btn-primary sh-btn-sm" type="button">${ICON_CHECK} Save</button>
                <button id="promptDelete" class="sh-btn sh-btn-danger sh-btn-sm" type="button" style="display:none;">${ICON_DELETE} Delete</button>
                <div style="flex:1"></div>
                <button id="promptToggleFavorite" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">${ICON_STAR} Favorite</button>
                <button id="promptTogglePin" class="sh-btn sh-btn-ghost sh-btn-sm" type="button">${ICON_PIN} Pin</button>
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
          <h3 class="modal-title pt-title">${ICON_PROMPT} Select Prompt(s)</h3>
          <button class="modal-close-btn" id="promptSelectionCloseBtn">${ICON_REMOVE}</button>
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
          <button class="modal-btn modal-btn-primary" id="promptSelectionConfirmBtn" type="button">${ICON_CHECK} Apply & Continue</button>
        </div>
      </div>
    `;
}
