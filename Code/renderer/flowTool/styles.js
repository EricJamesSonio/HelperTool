export const FLOW_CSS = `
.ft-panel {
  position: fixed;
  inset: 0;
  top: var(--titlebar-h, 34px);
  z-index: 9998;
  display: none;
  flex-direction: column;
  box-sizing: border-box;
  background: var(--bg-base, #010409);
  color: var(--text-primary, #eef2ff);
  font-size: 13px;
}
.ft-panel.open { display: flex; animation: overlayFadeIn 0.2s ease; }
.ft-hidden { display: none !important; }
.ft-spacer { flex: 1; }

.ft-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-default, rgba(255,255,255,0.08));
  background: var(--bg-overlay, #0d1117);
  flex-shrink: 0;
}
.ft-title { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.2px; }
.ft-round { font-size: 0.78rem; color: var(--text-muted, #7d8590); }
.ft-check { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--text-secondary, #9aa4b2); cursor: pointer; user-select: none; }
.ft-close {
  display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: none; border-radius: 8px; cursor: pointer;
  background: rgba(255,255,255,0.05); color: var(--text-secondary, #9aa4b2); font-size: 1.2rem; line-height: 1;
}
.ft-close:hover { background: rgba(255,255,255,0.12); color: var(--text-primary, #fff); }

.ft-badge {
  font-size: 0.72rem; font-weight: 700; padding: 2px 9px; border-radius: 999px;
  background: rgba(255,255,255,0.06); color: var(--text-muted, #7d8590);
}
.ft-badge[data-state="working"] { background: rgba(96,165,250,0.15); color: #60a5fa; }
.ft-badge[data-state="ready"], .ft-badge[data-state="done"] { background: rgba(52,211,153,0.15); color: #34d399; }
.ft-badge[data-state="warning"], .ft-badge[data-state="review"], .ft-badge[data-state="unknown"] { background: rgba(240,180,41,0.15); color: var(--accent, #f0b429); }
.ft-badge[data-state="error"] { background: rgba(248,113,113,0.15); color: #f87171; }

.ft-btn {
  display: inline-flex; align-items: center; justify-content: center; height: 30px; box-sizing: border-box;
  padding: 0 12px; border-radius: 8px; cursor: pointer; font-size: 0.78rem; font-weight: 600;
  border: 1px solid var(--border-default, rgba(255,255,255,0.1)); background: transparent; color: var(--text-primary, #eef2ff);
  transition: background 0.15s, border-color 0.15s, opacity 0.15s; white-space: nowrap;
}
.ft-btn:hover:not(:disabled) { background: rgba(255,255,255,0.07); }
.ft-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ft-primary { background: var(--accent, #f0b429); border-color: var(--accent, #f0b429); color: #000; }
.ft-primary:hover:not(:disabled) { background: var(--accent, #f0b429); opacity: 0.88; }
.ft-danger { border-color: rgba(248,113,113,0.5); color: #f87171; }

.ft-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(340px, 34%) 1fr; }
.ft-col { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 16px 20px; overflow: hidden; }
.ft-left { border-right: 1px solid var(--border-default, rgba(255,255,255,0.08)); }
.ft-col-title { display: flex; align-items: center; min-height: 30px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted, #7d8590); }
.ft-row { flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 8px; }

.ft-box {
  flex: 1 1 0; min-height: 120px; resize: none; padding: 12px; border-radius: 10px;
  border: 1px solid var(--border-default, rgba(255,255,255,0.1)); background: var(--bg-elevated, #0d1117);
  color: var(--text-primary, #eef2ff); font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; line-height: 1.5; outline: none;
}
.ft-box:focus { border-color: var(--accent, #f0b429); }

.ft-steps { flex-shrink: 0; display: flex; flex-direction: column; gap: 3px; }
.ft-step { display: flex; align-items: center; gap: 8px; font-size: 0.78rem; color: var(--text-muted, #7d8590); }
.ft-step[data-state="active"] { color: var(--text-primary, #eef2ff); }
.ft-step[data-state="done"] { color: #34d399; }
.ft-step[data-state="warn"] { color: var(--accent, #f0b429); }
.ft-step[data-state="error"] { color: #f87171; }
.ft-step-icon { width: 14px; flex-shrink: 0; text-align: center; font-weight: 700; }
.ft-step[data-state="active"] .ft-step-icon {
  width: 10px; height: 10px; margin: 0 2px; border: 2px solid rgba(96,165,250,0.3); border-top-color: #60a5fa;
  border-radius: 50%; font-size: 0; animation: ftSpin 0.8s linear infinite;
}
.ft-step-detail { margin-left: auto; font-size: 0.72rem; color: var(--text-muted, #7d8590); }
@keyframes ftSpin { to { transform: rotate(360deg); } }

.ft-result { flex: 0 1 auto; min-height: 0; max-height: 45%; overflow-y: auto; border: 1px solid var(--border-default, rgba(255,255,255,0.08)); border-radius: 10px; padding: 10px 12px; background: rgba(255,255,255,0.02); }
.ft-result-title { font-weight: 700; margin-bottom: 4px; }
.ft-lines { display: flex; flex-direction: column; gap: 3px; }
.ft-line { font-size: 0.76rem; line-height: 1.4; color: var(--text-muted, #7d8590); word-break: break-word; }
.ft-line[data-tone="ok"] { color: #34d399; }
.ft-line[data-tone="warn"] { color: var(--accent, #f0b429); }
.ft-line[data-tone="error"] { color: #f87171; }

.ft-review-head { flex-shrink: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 30px; }
.ft-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.ft-chip { font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,0.06); color: var(--text-secondary, #9aa4b2); }
.ft-chip[data-kind="new"] { background: rgba(52,211,153,0.15); color: #34d399; }
.ft-chip[data-kind="overwrite"], .ft-chip[data-kind="multi"] { background: rgba(240,180,41,0.15); color: var(--accent, #f0b429); }
.ft-chip[data-kind="patch"] { background: rgba(96,165,250,0.15); color: #60a5fa; }
.ft-chip[data-kind="problem"], .ft-chip[data-kind="invalid"] { background: rgba(248,113,113,0.15); color: #f87171; }
.ft-chip[data-kind="applied"] { background: rgba(52,211,153,0.25); color: #34d399; }
.ft-chip[data-kind="skip"] { background: rgba(255,255,255,0.06); color: var(--text-muted, #7d8590); }

.ft-banner { flex-shrink: 0; padding: 10px 12px; border-radius: 10px; font-size: 0.8rem; border: 1px solid var(--border-default, rgba(255,255,255,0.1)); }
.ft-banner[data-tone="ok"] { border-color: rgba(52,211,153,0.4); color: #34d399; background: rgba(52,211,153,0.07); }
.ft-banner[data-tone="error"] { border-color: rgba(248,113,113,0.4); color: #f87171; background: rgba(248,113,113,0.07); }
.ft-banner[data-tone="info"] { color: var(--text-secondary, #9aa4b2); }

.ft-reply {
  flex-shrink: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 10px;
  border: 1px solid var(--border-default, rgba(255,255,255,0.08)); background: rgba(255,255,255,0.02);
}
.ft-reply-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ft-reply-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted, #7d8590); }
.ft-reply-text {
  flex: 1; min-height: 0; margin: 0; overflow: auto; padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--border-default, rgba(255,255,255,0.08)); background: var(--bg-elevated, #0d1117);
  font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
}
.ft-reply[data-open="false"] .ft-reply-text { display: none; }
.ft-right[data-reply="full"] .ft-reply { flex: 1 1 0; }
.ft-right[data-reply="full"] .ft-review-body { display: none; }
.ft-right[data-reply="compact"] .ft-reply[data-open="true"] { max-height: 40%; }

.ft-review-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(240px, 32%) 1fr; gap: 12px; }
.ft-review-body[data-empty="true"] { grid-template-columns: 1fr; }
.ft-review-body[data-empty="true"] .ft-files { display: none; }
.ft-files { overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 4px; }
.ft-file {
  display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 8px; cursor: pointer;
  border: 1px solid transparent; background: rgba(255,255,255,0.02);
}
.ft-file:hover { background: rgba(255,255,255,0.05); }
.ft-file[data-selected="true"] { border-color: var(--accent, #f0b429); background: rgba(255,255,255,0.06); }
.ft-file[data-skipped="true"] .ft-file-name { opacity: 0.5; text-decoration: line-through; }
.ft-file-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ft-file-name { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ft-file-sub { font-size: 0.7rem; color: var(--text-muted, #7d8590); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ft-file input { flex-shrink: 0; accent-color: var(--accent, #f0b429); }

.ft-detail { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.ft-empty { margin: auto; text-align: center; color: var(--text-muted, #7d8590); max-width: 360px; line-height: 1.6; }
.ft-detail-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ft-detail-path { font-family: var(--font-mono, ui-monospace, monospace); font-size: 13px; font-weight: 700; word-break: break-all; }
.ft-notes { display: flex; flex-direction: column; gap: 3px; }
.ft-note { font-size: 0.76rem; line-height: 1.4; color: var(--text-muted, #7d8590); }
.ft-note[data-tone="error"] { color: #f87171; }
.ft-note[data-tone="warn"] { color: var(--accent, #f0b429); }
.ft-note[data-tone="ok"] { color: #34d399; }
.ft-tabs { display: flex; gap: 6px; align-items: center; }
.ft-tab[data-active="true"] { border-color: var(--accent, #f0b429); color: var(--accent, #f0b429); }
.ft-select { padding: 5px 8px; border-radius: 8px; border: 1px solid var(--border-default, rgba(255,255,255,0.1)); background: var(--bg-elevated, #0d1117); color: var(--text-primary, #eef2ff); font-size: 0.78rem; max-width: 100%; }
.ft-code {
  flex: 1; min-height: 0; margin: 0; overflow: auto; padding: 10px 0; border-radius: 10px;
  border: 1px solid var(--border-default, rgba(255,255,255,0.08)); background: var(--bg-elevated, #0d1117);
  font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; line-height: 1.5;
}
.ft-code-line { display: flex; white-space: pre; padding: 0 12px; min-width: min-content; }
.ft-code-no { width: 44px; flex-shrink: 0; text-align: right; padding-right: 10px; color: var(--text-faint, #484f58); user-select: none; }
.ft-code-line[data-t="+"] { background: rgba(52,211,153,0.12); }
.ft-code-line[data-t="-"] { background: rgba(248,113,113,0.12); }
.ft-code-line[data-t="..."] { color: var(--text-faint, #484f58); background: rgba(255,255,255,0.03); }
.ft-code-sign { width: 14px; flex-shrink: 0; user-select: none; color: var(--text-muted, #7d8590); }

@media (max-width: 1100px) {
  .ft-body { grid-template-columns: 1fr; overflow-y: auto; }
  .ft-review-body { grid-template-columns: 1fr; }
  .ft-left { overflow-y: auto; }
}
`;