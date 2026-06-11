import { isAnimated, escHtml } from './utils.js';

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
        <button class="bm-btn" id="bmPRBtn">Pull Requests</button>
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

export function getBranchRow(b, isCurrent, color, defaultBranch) {
  const dot = isCurrent ? '●' : '○';
  const behind = b.behind ? `<button class="bm-behind bm-pr-trigger" data-action="pr-behind" title="Pull changes into this branch">↓${b.behind}</button>` : '';
  const ahead = b.ahead ? `<button class="bm-ahead bm-pr-trigger" data-action="pr-ahead" title="Merge this branch into current">↑${b.ahead}</button>` : '';
  const lastCommit = b.lastCommit ? `<span class="bm-commit-hash">${b.lastCommit}</span>` : '';
  const msg = b.message ? `<span class="bm-commit-msg">${b.message}</span>` : '';

  let vsDefaultText = '';
  if (defaultBranch && b.name !== defaultBranch) {
    const da = b.vsDefaultAhead || 0;
    const db = b.vsDefaultBehind || 0;
    if (da > 0 && db > 0) vsDefaultText = `${db} behind, ${da} ahead ${defaultBranch}`;
    else if (db > 0) vsDefaultText = `${db} behind ${defaultBranch}`;
    else if (da > 0) vsDefaultText = `${da} ahead ${defaultBranch}`;
    else vsDefaultText = `up to date with ${defaultBranch}`;
  } else if (defaultBranch && b.name === defaultBranch) {
    vsDefaultText = 'default branch';
  }

  const prItem = !isCurrent ? `<button class="bm-dropdown-item" data-action="create-pr">Create Pull Request</button>` : '';
  return `
    <div class="bm-branch-row" data-name="${b.name}">
      <span class="bm-branch-dot" style="color:${color}">${dot}</span>
      <div class="bm-branch-info">
        <span class="bm-branch-name">${b.name}</span>
        <div class="bm-branch-meta">
          ${ahead} ${behind} ${vsDefaultText ? `<span class="bm-vs-default">${vsDefaultText}</span>` : ''} ${lastCommit} ${msg}
        </div>
      </div>
      <div class="bm-branch-actions">
        <button class="bm-btn bm-btn-sm bm-switch" data-action="switch" ${isCurrent ? 'disabled' : ''}>Switch</button>
        <button class="bm-btn bm-btn-sm bm-merge-btn" data-action="merge" ${isCurrent ? 'disabled' : ''}>Merge</button>
        <div class="bm-dropdown" data-name="${b.name}">
          <button class="bm-btn bm-btn-sm bm-dropdown-toggle">···</button>
          <div class="bm-dropdown-menu">
            ${prItem}
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
          <svg viewBox="0 0 500 200" class="bm-merge-svg">
            <circle cx="120" cy="50" r="16" fill="${fromColor}" stroke="#fff" stroke-width="2.5"/>
            <text x="120" y="80" text-anchor="middle" fill="${fromColor}" font-size="13" font-weight="700">${from}</text>
            <circle cx="380" cy="50" r="16" fill="${intoColor}" stroke="#fff" stroke-width="2.5"/>
            <text x="380" y="80" text-anchor="middle" fill="${intoColor}" font-size="13" font-weight="700">${into}</text>
            <path class="bm-merge-arrow" d="M 136 50 C 220 50, 220 140, 364 50" fill="none" stroke="${fromColor}" stroke-width="3" stroke-linecap="round" stroke-dasharray="350" stroke-dashoffset="350"/>
          </svg>
        </div>
        <div class="bm-merge-info">
          Merge <strong style="color:${fromColor}">${from}</strong> into <strong style="color:${intoColor}">${into}</strong>
        </div>
        <div class="bm-merge-desc">
          The commits from <strong style="color:${fromColor}">${from}</strong> will be merged into <strong style="color:${intoColor}">${into}</strong>, creating a merge commit.
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
      <div class="bm-merge-desc">
        The commits from <strong style="color:${fromColor}">${from}</strong> will be merged into <strong style="color:${intoColor}">${into}</strong>, creating a merge commit.
      </div>
      <div class="bm-merge-actions">
        <button class="bm-btn" id="bmMergeCancel">Cancel</button>
        <button class="bm-btn bm-btn-primary" id="bmMergeStart">Merge</button>
      </div>
    </div>
  `;
}

export function getMergeSuccessText(from, into, detail, files, summary, pushed) {
  const fileRows = (files || []).map(f => `
    <div class="bm-merge-file-row" data-file="${f.file}">
      <span class="bm-merge-file-status">
        <span class="bm-merge-ins">+${f.insertions}</span>
        <span class="bm-merge-del">-${f.deletions}</span>
      </span>
      <span class="bm-merge-file-name" title="${f.file}">${f.file}</span>
      <button class="bm-btn bm-btn-sm bm-merge-view-diff" data-file="${f.file}">View Diff</button>
    </div>
  `).join('');

  const summaryLine = summary ? `${summary.changes} file${summary.changes !== 1 ? 's' : ''} changed, ${summary.insertions} insertion${summary.insertions !== 1 ? 's' : ''}(+), ${summary.deletions} deletion${summary.deletions !== 1 ? 's' : ''}(-)` : '';

  const hasChanges = (summary?.changes || 0) > 0;

  return `
    <div class="bm-merge-result bm-merge-success">
      <div class="bm-merge-result-text">${detail}</div>
      ${hasChanges ? `<div class="bm-merge-push-status">${pushed ? 'Pushed to remote ✓' : 'Merged locally (push failed)'}</div>` : ''}
      ${summaryLine ? `<div class="bm-merge-summary">${summaryLine}</div>` : ''}
      ${fileRows ? `<div class="bm-merge-file-list">${fileRows}</div>` : ''}
      <div class="bm-merge-diff-view" id="bmMergeDiffView" style="display:none"></div>
      <button class="bm-btn bm-btn-primary" id="bmMergeDone">Done</button>
    </div>
  `;
}

export function getConflictResolver(conflicts, from, into) {
  const fileList = conflicts.map(c => {
    const resolved = c.status === 'resolved' || c.status === 'accepted';
    return `
    <div class="bm-conflict-file ${resolved ? 'bm-conflict-resolved' : ''}" data-file="${c.file}">
      <input type="checkbox" class="bm-conflict-cb" data-file="${c.file}" ${resolved ? 'checked' : ''}>
      <span class="bm-conflict-dot ${resolved ? 'bm-dot-resolved' : 'bm-dot-conflict'}"></span>
      <span class="bm-conflict-file-name">${c.file}</span>
      <span class="bm-conflict-status">${resolved ? '✓ resolved' : '● conflict'}</span>
      <button class="bm-btn bm-btn-sm bm-conflict-view-btn" data-file="${c.file}">${resolved ? 'View' : 'Resolve'}</button>
    </div>
    `;
  }).join('');
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

/* ── Pull Requests ── */

export function getPRList(prs, current) {
  if (!prs?.length) {
    return `
      <div class="bm-pr-list">
        <div class="bm-pr-list-header">Pull Requests</div>
        <div class="bm-empty">No pull requests yet</div>
        <div class="bm-pr-hint">Click the behind (↓) or ahead (↑) badge on a branch to create one</div>
      </div>
    `;
  }
  const rows = prs.map(pr => {
    const statusClass = pr.status === 'merged' ? 'bm-pr-merged' : pr.status === 'declined' ? 'bm-pr-declined' : 'bm-pr-open';
    return `
      <div class="bm-pr-row ${statusClass}" data-pr-id="${pr.id}">
        <div class="bm-pr-row-title">${escHtml(pr.title)}</div>
        <div class="bm-pr-row-meta">
          <span class="bm-pr-row-branches">${pr.sourceBranch} → ${pr.targetBranch}</span>
          <span class="bm-pr-row-status">${pr.status}</span>
        </div>
      </div>
    `;
  }).join('');
  return `
    <div class="bm-pr-list">
      <div class="bm-pr-list-header">Pull Requests (${prs.length})</div>
      <div class="bm-pr-rows">${rows}</div>
    </div>
  `;
}

export function getPRCreateForm(source, target, files, commits) {
  const fileRows = (files || []).map(f => `
    <div class="bm-pr-create-file">
      <span class="file-status-badge status-${f.status.toLowerCase()}">${f.status}</span>
      <span class="bm-pr-create-file-name">${escHtml(f.file)}</span>
    </div>
  `).join('') || '<div class="bm-empty">No file changes</div>';

  const commitRows = (commits || []).map(c => `
    <div class="bm-pr-create-commit">
      <span class="bm-pr-commit-hash">${c.hash.substring(0, 7)}</span>
      <span class="bm-pr-commit-msg">${escHtml(c.message)}</span>
    </div>
  `).join('') || '<div class="bm-empty">No commits</div>';

  return `
    <div class="bm-pr-create">
      <div class="bm-pr-create-header">Create Pull Request</div>
      <div class="bm-pr-create-branches">
        <strong>${escHtml(source)}</strong> → <strong>${escHtml(target)}</strong>
      </div>
      <div class="bm-pr-create-field">
        <label class="bm-pr-create-label">Title</label>
        <input class="bm-pr-create-input" id="bmPRCreateTitle" placeholder="Short description of this pull request" autofocus>
      </div>
      <div class="bm-pr-create-field">
        <label class="bm-pr-create-label">Description</label>
        <textarea class="bm-pr-create-textarea" id="bmPRCreateDesc" placeholder="Optional details…" rows="3"></textarea>
      </div>
      <div class="bm-pr-create-section">
        <div class="bm-pr-create-section-title">Commits (${commits?.length || 0})</div>
        <div class="bm-pr-create-commits">${commitRows}</div>
      </div>
      <div class="bm-pr-create-section">
        <div class="bm-pr-create-section-title">Files (${files?.length || 0})</div>
        <div class="bm-pr-create-files">${fileRows}</div>
      </div>
      <div class="bm-pr-create-actions">
        <button class="bm-btn" id="bmPRCreateCancel">Cancel</button>
        <button class="bm-btn bm-btn-primary" id="bmPRCreateSubmit">Create Pull Request</button>
      </div>
    </div>
  `;
}

export function getPRDetail(pr) {
  const statusLabel = pr.status === 'merged' ? 'Merged' : pr.status === 'declined' ? 'Declined' : 'Open';
  const statusClass = pr.status === 'merged' ? 'bm-pr-merged' : pr.status === 'declined' ? 'bm-pr-declined' : 'bm-pr-open';

  const fileRows = (pr.files || []).map(f => `
    <div class="bm-pr-detail-file">
      <span class="file-status-badge status-${(f.status || 'M').toLowerCase()}">${f.status || 'M'}</span>
      <span class="bm-pr-detail-file-name">${escHtml(f.file)}</span>
      <button class="bm-btn bm-btn-sm bm-pr-view-diff" data-file="${f.file}">View Diff</button>
    </div>
  `).join('') || '<div class="bm-empty">No files</div>';

  const commitRows = (pr.commits || []).map(c => `
    <div class="bm-pr-detail-commit">
      <span class="bm-pr-commit-hash">${c.hash?.substring(0, 7) || ''}</span>
      <span class="bm-pr-commit-msg">${escHtml(c.message || '')}</span>
    </div>
  `).join('');

  const acceptBtn = pr.status === 'open' ? `
    <button class="bm-btn bm-btn-primary" id="bmPRAccept">Accept & Merge</button>
    <button class="bm-btn" id="bmPRDecline">Decline</button>
  ` : '';

  const mergeInfo = pr.status === 'merged' ? `<div class="bm-pr-merge-info">Merged ${pr.mergedAt ? new Date(pr.mergedAt).toLocaleString() : ''}</div>` : '';

  return `
    <div class="bm-pr-detail ${statusClass}">
      <div class="bm-pr-detail-header">
        <span class="bm-pr-detail-status">${statusLabel}</span>
        <span class="bm-pr-detail-branches">${escHtml(pr.sourceBranch)} → ${escHtml(pr.targetBranch)}</span>
      </div>
      <div class="bm-pr-detail-title">${escHtml(pr.title)}</div>
      ${pr.description ? `<div class="bm-pr-detail-desc">${escHtml(pr.description)}</div>` : ''}
      ${mergeInfo}
      <div class="bm-pr-detail-section">
        <div class="bm-pr-detail-section-title">Commits (${(pr.commits || []).length})</div>
        <div class="bm-pr-detail-commits">${commitRows}</div>
      </div>
      <div class="bm-pr-detail-section">
        <div class="bm-pr-detail-section-title">Files (${(pr.files || []).length})</div>
        <div class="bm-pr-detail-files">${fileRows}</div>
      </div>
      <div class="bm-pr-detail-diff" id="bmPRDiffView" style="display:none"></div>
      <div class="bm-pr-detail-actions">${acceptBtn}</div>
      <button class="bm-btn" id="bmPRBack">← Back to PR list</button>
    </div>
  `;
}
