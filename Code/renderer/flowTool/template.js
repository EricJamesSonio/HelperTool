export function getTemplate() {
  return `
<div class="ft-panel" id="ftPanel">
  <div class="ft-header">
    <div class="ft-title">Flow Tool</div>
    <span class="ft-badge" id="ftBadge" data-state="idle">Idle</span>
    <span class="ft-round" id="ftRound">Round 0</span>
    <div class="ft-spacer"></div>
    <label class="ft-check" title="Watch the clipboard and process Claude's reply as soon as you copy it">
      <input type="checkbox" id="ftAuto"> Auto-process clipboard
    </label>
    <button class="ft-btn" id="ftProtocolBtn" title="Append the marker protocol to the box">Protocol</button>
    <button class="ft-btn" id="ftNewBtn" title="Start a new ticket (clears round, sent-files memory and the review)">New ticket</button>
    <button class="ft-close" id="ftCloseBtn" title="Close (Esc)">&times;</button>
  </div>
  <div class="ft-body">
    <section class="ft-col ft-left">
      <div class="ft-col-title">Ticket and replies</div>
      <textarea class="ft-box" id="ftBox" spellcheck="false" placeholder="Paste your ticket here. The reply for Claude appears here after you process Claude's answer."></textarea>
      <div class="ft-row">
        <button class="ft-btn ft-primary" id="ftProcessBtn">Process clipboard</button>
        <button class="ft-btn ft-danger ft-hidden" id="ftCancelBtn">Cancel</button>
        <button class="ft-btn" id="ftCopyBtn">Copy box</button>
        <button class="ft-btn" id="ftClearBtn">Clear box</button>
      </div>
      <div class="ft-steps ft-hidden" id="ftSteps"></div>
      <div class="ft-result ft-hidden" id="ftResult">
        <div class="ft-result-title" id="ftResultTitle"></div>
        <div class="ft-lines" id="ftLines"></div>
      </div>
    </section>
    <section class="ft-col ft-right">
      <div class="ft-review-head">
        <div class="ft-col-title">Review</div>
        <div class="ft-chips" id="ftChips"></div>
        <div class="ft-spacer"></div>
        <button class="ft-btn" id="ftSelAllBtn">Select all</button>
        <button class="ft-btn" id="ftSelNoneBtn">Select none</button>
        <button class="ft-btn ft-primary" id="ftApplyBtn" disabled>Apply selected</button>
      </div>
      <div class="ft-banner ft-hidden" id="ftBanner"></div>
      <div class="ft-review-body" id="ftReviewBody" data-empty="true">
        <div class="ft-files" id="ftFiles"></div>
        <div class="ft-detail" id="ftDetail"></div>
      </div>
    </section>
  </div>
</div>`;
}