export const HISTORY_CSS = `
.ft-right[data-mode="history"] > *:not(.ft-history) { display: none !important; }
.ft-history {
  display: none;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
}
.ft-right[data-mode="history"] .ft-history { display: flex; }
.ft-history-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 30px;
}
.ft-history-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, 32%) 1fr;
  gap: 12px;
}
.ft-history-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 4px;
}
.ft-hist-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  background: rgba(255,255,255,0.02);
}
.ft-hist-item:hover { background: rgba(255,255,255,0.05); }
.ft-hist-item[data-selected="true"] { border-color: var(--accent, #f0b429); background: rgba(255,255,255,0.06); }
.ft-hist-item[data-reverted="true"] .ft-hist-title { opacity: 0.55; }
.ft-hist-title { font-size: 0.8rem; font-weight: 700; }
.ft-hist-sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 0.72rem; color: var(--text-muted, #7d8590); }
.ft-history-detail {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}
.ft-hist-files {
  flex-shrink: 0;
  max-height: 30%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ft-hist-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  background: rgba(255,255,255,0.02);
}
.ft-hist-file:hover { background: rgba(255,255,255,0.05); }
.ft-hist-file[data-selected="true"] { border-color: var(--accent, #f0b429); }
.ft-hist-file-name {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ft-hist-file[data-reverted="true"] .ft-hist-file-name { opacity: 0.5; text-decoration: line-through; }
.ft-chip[data-kind="modified"] { background: rgba(240,180,41,0.15); color: var(--accent, #f0b429); }
.ft-chip[data-kind="deleted"] { background: rgba(248,113,113,0.15); color: #f87171; }
.ft-chip[data-kind="reverted"] { background: rgba(255,255,255,0.08); color: var(--text-secondary, #9aa4b2); }
@media (max-width: 1100px) {
  .ft-history-body { grid-template-columns: 1fr; }
}
`;