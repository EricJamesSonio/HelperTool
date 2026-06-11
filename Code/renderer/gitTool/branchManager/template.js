import { isAnimated } from './utils.js';

export function getPanelContent(mode) {
  return `
    <div class="bm-panel bm-panel-inline">
      <div class="bm-header">
        <div class="bm-header-left">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <line x1="6" y1="4" x2="6" y2="16"/><line x1="14" y1="4" x2="14" y2="16"/>
            <polyline points="6,4 14,4"/><polyline points="6,16 14,16"/>
          </svg>
          <span class="bm-title">Branch Manager</span>
        </div>
        <div class="bm-header-actions">
          <button class="bm-mode-btn ${mode === 'beginner' ? 'active' : ''}" data-mode="beginner" title="Beginner mode with animations">🎓 Beginner</button>
          <button class="bm-mode-btn ${mode === 'pro' ? 'active' : ''}" data-mode="pro" title="Pro mode, no animations">⚡ Pro</button>
          <button class="bm-btn bm-btn-sm" id="bmCloseBtn">&larr; Back to Git</button>
        </div>
      </div>
      <div class="bm-toolbar">
        <button class="bm-btn bm-btn-primary" id="bmNewBranchBtn">+ New Branch</button>
        <button class="bm-btn" id="bmFetchBtn">⟳ Fetch</button>
        <input class="bm-search" id="bmSearch" placeholder="Filter branches\u2026">
      </div>
      <div class="bm-body">
        <div class="bm-left" id="bmLeft">
          <div id="bmBranchList"></div>
        </div>
        <div class="bm-right" id="bmRightPanel">
          <div class="bm-empty">Select an action to view details</div>
        </div>
        <div id="bmConfirmOverlay" style="display:none"></div>
      </div>
    </div>
  `;
}

export function getBranchRow(b, isCurrent, color) {
  const dot = isCurrent ? '●' : '○';
  const ahead = b.ahead ? `<span class="bm-ahead">↑${b.ahead}</span>` : '';
  const behind = b.behind ? `<span class="bm-behind">↓${b.behind}</span>` : '';
  const lastCommit = b.lastCommit ? `<span class="bm-commit-hash">${b.lastCommit}</span>` : '';
  const msg = b.message ? `<span class="bm-commit-msg">${b.message}</span>` : '';
  return `
    <div class="bm-branch-row" data-name="${b.name}">
      <span class="bm-branch-dot" style="color:${color}">${dot}</span>
      <div class="bm-branch-info">
        <span class="bm-branch-name">${b.name}</span>
        <div class="bm-branch-meta">
          ${ahead} ${behind} ${lastCommit} ${msg}
        </div>
      </div>
      <div class="bm-branch-actions">
        <button class="bm-btn bm-btn-sm bm-switch" data-action="switch" ${isCurrent ? 'disabled' : ''}>Switch</button>
        <button class="bm-btn bm-btn-sm bm-merge-btn" data-action="merge" ${isCurrent ? 'disabled' : ''}>Merge</button>
        <div class="bm-dropdown" data-name="${b.name}">
          <button class="bm-btn bm-btn-sm bm-dropdown-toggle">···</button>
          <div class="bm-dropdown-menu">
            <button class="bm-dropdown-item" data-action="push">Push to remote</button>
            <button class="bm-dropdown-item" data-action="graph">View graph</button>
            <button class="bm-dropdown-item" data-action="delete">Delete</button>
            <button class="bm-dropdown-item" data-action="delete-remote">Delete remote</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function getRemoteRow(r) {
  return `
    <div class="bm-branch-row bm-remote-row" data-name="${r.name}">
      <span class="bm-branch-dot" style="color:var(--text-faint)">○</span>
      <div class="bm-branch-info">
        <span class="bm-branch-name">${r.name}</span>
        <span class="bm-remote-label">${r.remote}</span>
      </div>
      <div class="bm-branch-actions">
        <button class="bm-btn bm-btn-sm" data-action="pull">Pull</button>
        <div class="bm-dropdown" data-name="${r.name}">
          <button class="bm-btn bm-btn-sm bm-dropdown-toggle">···</button>
          <div class="bm-dropdown-menu">
            <button class="bm-dropdown-item" data-action="delete-remote">Delete remote</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function getCreateForm() {
  return `
    <div class="bm-create-form">
      <div class="bm-create-header">Create New Branch</div>
      <div class="bm-create-row">
        <label class="bm-create-label">Base branch</label>
        <select class="bm-create-select" id="bmCreateBase"></select>
      </div>
      <div class="bm-create-row">
        <label class="bm-create-label">Prefix</label>
        <div class="bm-prefix-chips" id="bmPrefixChips">
          <button class="bm-prefix-chip active" data-prefix="feature/">feature/</button>
          <button class="bm-prefix-chip" data-prefix="fix/">fix/</button>
          <button class="bm-prefix-chip" data-prefix="chore/">chore/</button>
          <button class="bm-prefix-chip" data-prefix="hotfix/">hotfix/</button>
          <button class="bm-prefix-chip" data-prefix="release/">release/</button>
          <input class="bm-prefix-free" id="bmPrefixFree" placeholder="custom/" value="">
        </div>
      </div>
      <div class="bm-create-row">
        <label class="bm-create-label">Name</label>
        <input class="bm-create-input" id="bmCreateName" placeholder="my-branch-name" autofocus>
      </div>
      <div class="bm-create-preview" id="bmCreatePreview">feature/my-branch-name</div>
      <div class="bm-create-error" id="bmCreateError"></div>
      <div class="bm-create-actions">
        <button class="bm-btn bm-btn-primary" id="bmCreateSubmit">Create Branch</button>
        <button class="bm-btn" id="bmCreateCancel">Cancel</button>
      </div>
    </div>
  `;
}

export function getMergeConfirm(from, into, fromColor, intoColor) {
  const animated = isAnimated();
  if (animated) {
    return `
      <div class="bm-merge-flow">
        <div class="bm-merge-diagram" id="bmMergeDiagram">
          <svg viewBox="0 0 300 120" class="bm-merge-svg">
            <circle cx="80" cy="30" r="10" fill="${fromColor}" stroke="#fff" stroke-width="2"/>
            <text x="80" y="55" text-anchor="middle" fill="${fromColor}" font-size="11" font-weight="600">${from}</text>
            <circle cx="220" cy="30" r="10" fill="${intoColor}" stroke="#fff" stroke-width="2"/>
            <text x="220" y="55" text-anchor="middle" fill="${intoColor}" font-size="11" font-weight="600">${into}</text>
            <path class="bm-merge-arrow" d="M90 30 Q150 30 150 80 Q150 120 220 100" fill="none" stroke="${fromColor}" stroke-width="2" stroke-dasharray="400" stroke-dashoffset="400"/>
          </svg>
        </div>
        <div class="bm-merge-info">
          Merge <strong style="color:${fromColor}">${from}</strong> into <strong style="color:${intoColor}">${into}</strong>
        </div>
        <div class="bm-merge-actions">
          <button class="bm-btn" id="bmMergeCancel">Cancel</button>
          <button class="bm-btn bm-btn-primary" id="bmMergeStart">Start Merge →</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="bm-merge-flow bm-merge-pro">
      <div class="bm-merge-info">
        Merge <strong style="color:${fromColor}">${from}</strong> into <strong style="color:${intoColor}">${into}</strong>
      </div>
      <div class="bm-merge-actions">
        <button class="bm-btn" id="bmMergeCancel">Cancel</button>
        <button class="bm-btn bm-btn-primary" id="bmMergeStart">Merge</button>
      </div>
    </div>
  `;
}

export function getMergeSuccessText(from, into) {
  return `
    <div class="bm-merge-result bm-merge-success">
      <div class="bm-merge-result-text"><strong>${from}</strong> → <strong>${into}</strong> merged successfully ✓</div>
      <button class="bm-btn bm-btn-primary" id="bmMergeDone">Done</button>
    </div>
  `;
}

export function getConflictResolver(conflicts, from, into) {
  const fileList = conflicts.map(c => `
    <div class="bm-conflict-file ${c.status === 'resolved' || c.status === 'accepted' ? 'bm-conflict-resolved' : ''}" data-file="${c.file}">
      <input type="checkbox" class="bm-conflict-cb" data-file="${c.file}" ${c.status === 'resolved' || c.status === 'accepted' ? 'checked' : ''}>
      <span class="bm-conflict-dot ${c.status === 'resolved' || c.status === 'accepted' ? 'bm-dot-resolved' : 'bm-dot-conflict'}"></span>
      <span class="bm-conflict-file-name">${c.file}</span>
      <span class="bm-conflict-status">${c.status === 'resolved' || c.status === 'accepted' ? '✓ resolved' : '● conflict'}</span>
    </div>
  `).join('');
  const allResolved = conflicts.every(c => c.status === 'resolved' || c.status === 'accepted');
  return `
    <div class="bm-conflict-wrap">
      <div class="bm-conflict-header">Resolving: ${from} → ${into}</div>
      <div class="bm-conflict-bulk">
        <button class="bm-btn bm-btn-sm" id="bmConflictSelectAll">Select All</button>
        <button class="bm-btn bm-btn-sm" id="bmConflictAcceptIncoming">Accept Incoming for Selected</button>
        <button class="bm-btn bm-btn-sm" id="bmConflictAcceptOurs">Accept Ours for Selected</button>
      </div>
      <div class="bm-conflict-body">
        <div class="bm-conflict-file-list" id="bmConflictFileList">${fileList}</div>
        <div class="bm-conflict-diff" id="bmConflictDiff">
          <div class="bm-conflict-diff-empty">Click a file to view conflict diff</div>
        </div>
      </div>
      <div class="bm-conflict-actions">
        <button class="bm-btn bm-btn-primary" id="bmConflictCompleteMerge" ${allResolved ? '' : 'disabled'}>Complete Merge</button>
      </div>
    </div>
  `;
}

export function getGraphView(branch, commits, page, totalPages) {
  const commitRows = commits.map(c => `
    <div class="bm-graph-row">
      <span class="bm-graph-dot" style="color:${branch}">●</span>
      <span class="bm-graph-hash">${c.hash.substring(0, 7)}</span>
      <span class="bm-graph-msg">${c.message}</span>
      <span class="bm-graph-author">${c.author}</span>
      <span class="bm-graph-date">${new Date(c.date).toLocaleDateString()}</span>
    </div>
  `).join('');
  const pageBtns = [];
  if (totalPages > 1) {
    for (let i = 1; i <= Math.min(totalPages, 10); i++) {
      pageBtns.push(`<button class="bm-page-btn${i === page ? ' active' : ''}" data-graph-page="${i}">${i}</button>`);
    }
    if (totalPages > 10) pageBtns.push('<span class="bm-page-dots">…</span>');
  }
  return `
    <div class="bm-graph-wrap">
      <div class="bm-graph-header">
        <span class="bm-graph-title">${branch} — ${totalPages * 20}+ commits</span>
        <button class="bm-btn" id="bmGraphClose">Back</button>
      </div>
      <div class="bm-graph-list">${commitRows || '<div class="bm-empty">No commits</div>'}</div>
      ${pageBtns.length ? `<div class="bm-graph-pages">${pageBtns.join('')}</div>` : ''}
    </div>
  `;
}
