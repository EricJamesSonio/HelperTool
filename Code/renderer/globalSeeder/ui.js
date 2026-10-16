
import { state } from './state.js';
import { parseInput, parseContentBlocks } from './parser.js';
import * as diffViewer from '../diffViewer.js';

function isSyntaxWarning(w){ return w && w.includes('syntax error'); }
function syntaxLabel(w){ return w.split(';').find(s=>s.includes('syntax error'))?.trim()||w; }

let _selectorDebounce = null;

function showStage(id) {
    ['gsInputStage', 'gsPreviewStage', 'gsSeedingStage'].forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.toggle('gs-stage-hidden', s !== id);
    });
}

function groupByTopFolder(items) {
    const groups = {};
    for (const item of items) {
        const parts  = item.path.split('/');
        const folder = parts.length > 1 ? parts[0] : '__root__';
        if (!groups[folder]) groups[folder] = [];
        groups[folder].push(item);
    }
    return groups;
}

function isStructureSkipped(rel) {
    return !!(state.previewSkipped && state.previewSkipped.has(rel));
}

function refreshStructureSummary() {
    const summary = document.getElementById('gsPreviewSummary');
    const countEl = document.getElementById('gsPreviewCount');
    const seedBtn = document.getElementById('gsSeedBtn');
    if (!state.preview) return;
    const skipped = state.previewSkipped || new Set();
    const active = state.preview.toCreate.filter(p => !skipped.has(p));
    if (summary) {
        summary.innerHTML = `
            <span class="gs-badge gs-badge-create">+${active.length} to create</span>
            ${state.preview.toSkip.length > 0 ? `<span class="gs-badge gs-badge-skip">x ${state.preview.toSkip.length} already exist</span>` : ''}
            ${skipped.size > 0 ? `<span class="gs-badge gs-badge-ambig">${skipped.size} skipped</span>` : ''}
        `;
    }
    if (countEl) countEl.textContent = `${active.length} / ${state.preview.toCreate.length} selected`;
    if (seedBtn) seedBtn.textContent = active.length ? `Seed (${active.length})` : 'Seed';
}

function renderRows(list, items) {
    list.innerHTML = '';
    const grouped = groupByTopFolder(items);

    for (const [folder, entries] of Object.entries(grouped)) {
        if (folder !== '__root__') {
            const header = document.createElement('div');
            header.className   = 'gs-preview-folder';
            header.textContent = `${folder}/`;
            list.appendChild(header);
        }
        for (const item of entries) {
            const row = document.createElement('div');
            const skipped = item.skippable && isStructureSkipped(item.path);
            row.className = `gs-preview-row gs-preview-row--${item.status}${skipped ? ' gs-preview-row--skipped' : ''}`;
            const icon   = skipped ? 'x' : item.status === 'create' ? '+' : item.status === 'overwrite' ? '~' : 'x';
            const label  = skipped ? 'skipped' : item.status === 'create' ? 'new' : item.status === 'overwrite' ? 'overwrite' : 'exists';
            const name   = item.path.split('/').pop();
            const subdir = item.path.includes('/') ? item.path.substring(0, item.path.lastIndexOf('/') + 1) : '';
            row.innerHTML = `
                ${item.skippable ? `<input type="checkbox" class="gs-row-check" ${skipped ? '' : 'checked'} title="Uncheck to skip this file" />` : ''}
                <span class="gs-row-icon">${icon}</span>
                <span class="gs-row-path">${subdir ? `<span class="gs-row-subdir">${escapeHtml(subdir)}</span>` : ''}${escapeHtml(name)}</span>
                <span class="gs-row-badge">${label}</span>
                ${item.skippable ? `<button class="gs-row-cancel" title="Skip this file">×</button>` : ''}
            `;
            if (item.skippable) {
                const check = row.querySelector('.gs-row-check');
                const cancel = row.querySelector('.gs-row-cancel');
                const toggle = (skip) => {
                    if (!state.previewSkipped) state.previewSkipped = new Set();
                    if (skip) state.previewSkipped.add(item.path);
                    else state.previewSkipped.delete(item.path);
                    row.classList.toggle('gs-preview-row--skipped', skip);
                    if (check) check.checked = !skip;
                    const badge = row.querySelector('.gs-row-badge');
                    if (badge) badge.textContent = skip ? 'skipped' : 'new';
                    const ic = row.querySelector('.gs-row-icon');
                    if (ic) ic.textContent = skip ? 'x' : '+';
                    refreshStructureSummary();
                };
                check?.addEventListener('click', (e) => e.stopPropagation());
                check?.addEventListener('change', (e) => { e.stopPropagation(); toggle(!e.target.checked); });
                cancel?.addEventListener('click', (e) => { e.stopPropagation(); toggle(true); });
            }
            list.appendChild(row);
        }
    }
}

function renderStructurePreview(preview) {
    const list = document.getElementById('gsPreviewList');
    if (!list) return;
    if (!state.previewSkipped) state.previewSkipped = new Set();

    const items = [
        ...preview.toCreate.map(p => ({ path: p, status: 'create', skippable: true })),
        ...preview.toSkip.map(p   => ({ path: p, status: 'skip' })),
    ];
    renderRows(list, items);
    refreshStructureSummary();
    wirePreviewToolbar('structure');
}

function activeDetails() {
    const details = state.contentPreview?.details || [];
    return details.filter((_, i) => !isEntrySkipped(i));
}
function isEntrySkipped(idx) {
    return !!(state.contentEntries && state.contentEntries[idx] && state.contentEntries[idx].skipped);
}
function refreshContentSummary() {
    const summary = document.getElementById('gsPreviewSummary');
    const countEl = document.getElementById('gsPreviewCount');
    const seedBtn = document.getElementById('gsSeedBtn');
    const preview = state.contentPreview;
    if (!summary || !preview) return;
    const details = preview.details || [];
    const activeIdx = [];
    for (let i = 0; i < details.length; i++) if (!isEntrySkipped(i)) activeIdx.push(i);
    const active = activeIdx.map(i => details[i]);
    const toCreateN = active.filter(d => !d.exists && !(d.mode && d.mode !== 'full' && d.mode !== 'partial')).length;
    const toOverwriteN = active.filter(d => d.exists && !(d.mode && d.mode !== 'full' && d.mode !== 'partial')).length;
    const toPatchN = active.filter(d => d.mode && d.mode !== 'full' && d.mode !== 'partial').length;
    const ambiguousCount = active.filter(d => d.ambiguous).length;
    const syntaxOnes = active.filter(d => isSyntaxWarning(d.warning));
    const warnOnes = active.filter(d => d.warning);
    const fallbackCount = warnOnes.length - syntaxOnes.length;
    const skipped = details.length - active.length;
    const syntaxWarnings = syntaxOnes.map(d => `${d.resolved}: ${d.warning}`);
    const warnings = preview.warnings || [];
    summary.innerHTML = `
        <span class="gs-badge gs-badge-create">+${toCreateN} to create</span>
        ${toOverwriteN > 0 ? `<span class="gs-badge gs-badge-overwrite">~${toOverwriteN} will be overwritten</span>` : ''}
        ${toPatchN > 0 ? `<span class="gs-badge gs-badge-patch">~${toPatchN} to patch</span>` : ''}
        ${syntaxOnes.length > 0 ? `<span class="gs-badge gs-badge-verify" title="${escapeHtml(syntaxWarnings.join('\n'))}">! ${syntaxOnes.length} syntax error</span>` : ''}
        ${fallbackCount > 0 ? `<span class="gs-badge gs-badge-ambig" title="${escapeHtml(warnings.filter(w=>!isSyntaxWarning(w.warning)).map(w=>w.warning).join('; '))}">!${fallbackCount} patch will fallback to full</span>` : ''}
        ${ambiguousCount > 0 ? `<span class="gs-badge gs-badge-ambig">!${ambiguousCount} need target choice</span>` : ''}
        ${skipped > 0 ? `<span class="gs-badge gs-badge-skip">${skipped} skipped</span>` : ''}
    `;
    if (countEl) countEl.textContent = `${active.length} / ${details.length} selected`;
    if (seedBtn) seedBtn.textContent = active.length ? `Seed (${active.length})` : 'Seed';
}

function wirePreviewToolbar(mode) {
    const allBtn = document.getElementById('gsSelectAllBtn');
    const noneBtn = document.getElementById('gsSelectNoneBtn');
    if (allBtn) allBtn.onclick = () => setAllSkipped(false, mode);
    if (noneBtn) noneBtn.onclick = () => setAllSkipped(true, mode);
}

function setAllSkipped(skip, mode) {
    if (mode === 'structure') {
        if (!state.preview) return;
        if (!state.previewSkipped) state.previewSkipped = new Set();
        if (skip) state.preview.toCreate.forEach(p => state.previewSkipped.add(p));
        else state.previewSkipped.clear();
        renderStructurePreview(state.preview);
        return;
    }
    if (!state.contentEntries) return;
    state.contentEntries.forEach(e => { e.skipped = skip; });
    if (state.contentPreview) renderContentPreview(state.contentPreview);
}

function renderContentPreview(preview) {
    const summary = document.getElementById('gsPreviewSummary');
    const list    = document.getElementById('gsPreviewList');
    if (!summary || !list) return;

    refreshContentSummary();

    list.innerHTML = '';
    if (!preview.details || !preview.details.length) {
        const items = [
            ...preview.toCreate.map(p    => ({ path: p, status: 'create'    })),
            ...preview.toOverwrite.map(p => ({ path: p, status: 'overwrite' })),
        ];
        renderRows(list, items);
        return;
    }

    // Group by resolved top folder but keep ambiguous selector inline
    const grouped = {};
    for (let i = 0; i < preview.details.length; i++) {
        const d = preview.details[i];
        const top = d.resolved.includes('/') ? d.resolved.split('/')[0] : '__root__';
        if (!grouped[top]) grouped[top] = [];
        grouped[top].push({ d, idx: i });
    }

    for (const [folder, arr] of Object.entries(grouped)) {
        if (folder !== '__root__') {
            const header = document.createElement('div');
            header.className   = 'gs-preview-folder';
            header.textContent = `${folder}/`;
            list.appendChild(header);
        }
        for (const { d, idx } of arr) {
            const surgical = d.mode && d.mode !== 'full' && d.mode !== 'partial';
            const isPatch = surgical;
            const isSyntax = isSyntaxWarning(d.warning);
            const hasWarning = !!d.warning;
            const skipped = isEntrySkipped(idx);
            const status = skipped ? 'skipped' : isSyntax ? 'verify-warn' : hasWarning ? 'patch-warn' : (isPatch ? 'patch' : (d.exists ? 'overwrite' : 'create'));
            const row = document.createElement('div');
            row.className = `gs-preview-row gs-preview-row--${status}${d.ambiguous ? ' gs-preview-row--ambig' : ''}${skipped ? ' gs-preview-row--skipped' : ''}`;
            const icon  = skipped ? 'x' : isSyntax ? '!' : hasWarning ? '!' : (isPatch ? '~' : (d.exists ? '~' : '+'));
            let patchLabel = '';
            if (d.mode === 'addAfter') patchLabel = `add after: ${escapeHtml(d.target||'')}`;
            else if (d.mode === 'addBefore') patchLabel = `add before: ${escapeHtml(d.target||'')}`;
            else if (d.mode === 'remove') patchLabel = `remove: ${escapeHtml(d.target||'')}`;
            else if (isPatch) patchLabel = `patch: ${escapeHtml(d.target||'')}`;
            const _syntaxLabel = isSyntax ? syntaxLabel(d.warning) : '';
            const label = skipped ? 'skipped' : isSyntax ? `${escapeHtml(_syntaxLabel)}` : hasWarning ? `fallback: ${escapeHtml(d.warning || 'target not found')}` : (isPatch ? patchLabel : (d.exists ? 'overwrite' : 'new'));
            const subdir = d.resolved.includes('/') ? d.resolved.substring(0, d.resolved.lastIndexOf('/') + 1) : '';
            const name   = d.resolved.split('/').pop();
            const hasSelector = d.ambiguous && d.candidates && d.candidates.length > 1;

            // Build base row
            const pathHtml = `${subdir ? `<span class="gs-row-subdir">${escapeHtml(subdir)}</span>` : ''}${escapeHtml(name)}`;
            const origHint = d.original !== d.resolved ? ` title="from: ${escapeHtml(d.original)}"` : '';

            row.innerHTML = `
                <input type="checkbox" class="gs-row-check" ${skipped ? '' : 'checked'} title="Uncheck to skip this file (won't be seeded)" />
                <span class="gs-row-icon">${icon}</span>
                <span class="gs-row-path"${origHint}>${pathHtml}</span>
                ${d.original !== d.resolved ? `<span class="gs-row-orig" title="${escapeHtml(d.original)}">← ${escapeHtml(d.original.split('/')[0])}/…</span>` : ''}
                <span class="gs-row-badge">${label}</span>
                <button class="gs-row-cancel" title="Skip this file">×</button>
            `;
            const checkEl = row.querySelector('.gs-row-check');
            const cancelEl = row.querySelector('.gs-row-cancel');
            const applySkip = (skip) => {
                if (state.contentEntries && state.contentEntries[idx]) state.contentEntries[idx].skipped = skip;
                row.classList.toggle('gs-preview-row--skipped', skip);
                if (checkEl) checkEl.checked = !skip;
                const badge = row.querySelector('.gs-row-badge');
                if (badge) badge.textContent = skip ? 'skipped' : badge.textContent;
                refreshContentSummary();
                // re-render to keep status classes/badges consistent
                if (state.contentPreview) {
                    const curScroll = document.getElementById('gsPreviewList')?.scrollTop || 0;
                    renderContentPreview(state.contentPreview);
                    const listEl = document.getElementById('gsPreviewList');
                    if (listEl) listEl.scrollTop = curScroll;
                }
            };
            checkEl?.addEventListener('click', (e) => e.stopPropagation());
            checkEl?.addEventListener('change', (e) => { e.stopPropagation(); applySkip(!e.target.checked); });
            cancelEl?.addEventListener('click', (e) => { e.stopPropagation(); applySkip(true); });

            // If ambiguous, append a selector for the target base
            if (hasSelector) {
                const selWrap = document.createElement('div');
                selWrap.className = 'gs-ambig-wrap';
                const sel = document.createElement('select');
                sel.className = 'gs-ambig-select';
                sel.dataset.idx = String(idx);
                const isBare = !d.original.includes('/');
                const rest = d.resolved.includes('/') ? d.resolved.substring(d.resolved.indexOf('/') + 1) : '';
                for (const cand of d.candidates) {
                    const opt = document.createElement('option');
                    opt.value = cand;
                    if (cand === '') {
                        const origName = d.original.split('/').pop();
                        opt.textContent = `Root (repo root/${origName})`;
                    } else {
                        opt.textContent = cand;
                    }
                    // select current resolved: bare files compare full path, folder-anchored compare prefix
                    if (isBare) {
                        if (cand === '' && d.resolved === d.original) opt.selected = true;
                        else if (cand !== '' && cand === d.resolved) opt.selected = true;
                        else if (d.candidates.length === 1 && cand === d.resolved) opt.selected = true;
                    } else {
                        const curPrefix = d.resolved.slice(0, d.resolved.length - rest.length - 1);
                        if (cand === curPrefix || (cand === '' && d.resolved === d.original)) opt.selected = true;
                    }
                    sel.appendChild(opt);
                }
                sel.addEventListener('change', (e) => {
                    const newBase = e.target.value;
                    let newResolved;
                    if (isBare) {
                        // candidates are full file paths for bare files
                        newResolved = newBase === '' ? d.original : newBase;
                    } else {
                        const originalRest = d.original.split('/').slice(1).join('/');
                        newResolved = newBase === '' ? d.original : (originalRest ? `${newBase}/${originalRest}` : newBase);
                    }
                    // update preview model and row display
                    d.resolved = newResolved;
                    if (state.contentEntries && state.contentEntries[idx]) {
                        state.contentEntries[idx].resolved = newResolved;
                    }
                    // update path visuals in row
                    const newSubdir = newResolved.includes('/') ? newResolved.substring(0, newResolved.lastIndexOf('/') + 1) : '';
                    const newName = newResolved.split('/').pop();
                    const pathEl = row.querySelector('.gs-row-path');
                    if (pathEl) {
                        pathEl.innerHTML = `${newSubdir ? `<span class="gs-row-subdir">${escapeHtml(newSubdir)}</span>` : ''}${escapeHtml(newName)}`;
                    }
                    // live re-verify: debounce 150ms then refresh exists/warning via previewContent
                    row.classList.add('gs-preview-row--stale');
                    row.title = 're-run Preview to verify new path';
                    if (_selectorDebounce) clearTimeout(_selectorDebounce);
                    _selectorDebounce = setTimeout(async () => {
                        const basePath = window._gsGetBasePath ? window._gsGetBasePath() : null;
                        if (!basePath || !window.electronAPI?.fileSeeder?.previewContent) {
                            return;
                        }
                        try {
                            const result = await window.electronAPI.fileSeeder.previewContent(basePath, state.contentEntries);
                            if (!result || !result.details || !result.details[idx]) {
                                return;
                            }
                            const nd = result.details[idx];
                            // refresh model
                            d.warning = nd.warning;
                            d.exists = nd.exists;
                            d.resolved = nd.resolved;
                            // sync state preview details for badge counts
                            if (state.contentPreview && state.contentPreview.details && state.contentPreview.details[idx]) {
                                state.contentPreview.details[idx].warning = nd.warning;
                                state.contentPreview.details[idx].exists = nd.exists;
                            }
                            // update row classes & badge without full re-render
                            const isSyn = isSyntaxWarning(nd.warning);
                            const hasWarn = !!nd.warning;
                            const surg = nd.mode && nd.mode !== 'full' && nd.mode !== 'partial';
                            const newStatus = isSyn ? 'verify-warn' : hasWarn ? 'patch-warn' : (surg ? 'patch' : (nd.exists ? 'overwrite' : 'create'));
                            row.className = `gs-preview-row gs-preview-row--${newStatus}${nd.ambiguous ? ' gs-preview-row--ambig' : ''} gs-preview-row--clickable`;
                            const badge = row.querySelector('.gs-row-badge');
                            const iconEl = row.querySelector('.gs-row-icon');
                            if (badge) {
                                if (isSyn) badge.textContent = syntaxLabel(nd.warning);
                                else if (hasWarn) badge.textContent = `fallback: ${nd.warning || 'target not found'}`;
                                else if (surg) badge.textContent = `patch: ${nd.target || ''}`;
                                else badge.textContent = nd.exists ? 'overwrite' : 'new';
                            }
                            if (iconEl) iconEl.textContent = isSyn || hasWarn ? '!' : (surg ? '~' : (nd.exists ? '~' : '+'));
                            row.classList.remove('gs-preview-row--stale');
                            row.title = 'Click to view diff: Current ↔ Will Be';
                            // update badge counts in summary without full re-render
                            refreshContentSummary();
                            {
                                const summary = document.getElementById('gsPreviewSummary');
                                // mark stale badge if pending
                                if (summary && row.classList.contains('gs-preview-row--stale')) {
                                    const vBadge = summary.querySelector('.gs-badge-verify');
                                    if (vBadge) vBadge.classList.add('gs-badge-verify--stale');
                                }
                            }
                        } catch (err) {
                            row.classList.add('gs-preview-row--stale');
                            row.title = 're-run Preview to verify new path';
                        }
                    }, 150);
                });
                selWrap.appendChild(sel);
                row.appendChild(selWrap);
            }

            // Make row clickable to show full diff (lazy per-click, with loading)
            row.style.cursor = 'pointer';
            row.title = 'Click to view diff: Current ↔ Will Be';
            row.classList.add('gs-preview-row--clickable');
            row.addEventListener('click', (e) => {
                if (e.target.closest('.gs-ambig-select') || e.target.closest('.gs-ambig-wrap')) return;
                if (e.target.closest('.gs-row-check') || e.target.closest('.gs-row-cancel')) return;
                openPreviewDiff(idx);
            });

            list.appendChild(row);
        }
    }
    wirePreviewToolbar('content');
}

let _previewDiffIndex = 0;
async function openPreviewDiff(idx) {
    const basePath = window._gsGetBasePath ? window._gsGetBasePath() : null;
    if (basePath == null) return;
    const preview = state.contentPreview;
    if (!preview || !preview.details || !preview.details[idx]) return;
    _previewDiffIndex = idx;
    const d = preview.details[idx];
    const resolved = d.resolved;
    const absPath = basePath.replace(/[\/\\]+$/, '') + '/' + resolved.replace(/^[\/\\]+/, '');
    try {
        // Show loading in diffViewer
        const allEntries = state.contentEntries || [];
        // Use global loading overlay for processing
        const loadingEl = document.getElementById('appLoadingOverlay');
        if (loadingEl) {
            loadingEl.classList.remove('app-loading-hidden');
            const sub = document.getElementById('appLoadingSub');
            if (sub) sub.textContent = `Generating diff for ${resolved}…`;
        }
        const result = await window.electronAPI.fileSeeder.getPatchedPreview(basePath, resolved, allEntries);
        if (loadingEl) loadingEl.classList.add('app-loading-hidden');
        if (result.error) {
            showNotice(`Diff error: ${result.error}`);
            return;
        }
        const leftText = result.left ?? '';
        const rightText = result.right ?? '';
        const syntaxError = result.syntaxError || null;
        const activeList = [];
        for (let i = 0; i < preview.details.length; i++) if (!isEntrySkipped(i)) activeList.push(i);
        const total = activeList.length || preview.details.length;
        const pos = activeList.includes(idx) ? activeList.indexOf(idx) : idx;
        diffViewer.openPreview({
            filePath: absPath,
            repoPath: basePath,
            leftText,
            rightText,
            syntaxError,
            mode: d.mode,
            target: d.target,
            fileIndex: pos,
            total,
            onSave: async (newRightText) => {
                const entriesForFile = allEntries.filter(e => e.resolved === resolved);
                if (entriesForFile.length === 1) {
                    entriesForFile[0].content = newRightText;
                } else if (entriesForFile.length > 1) {
                    const last = entriesForFile[entriesForFile.length - 1];
                    last.content = newRightText;
                    last.mode = 'full';
                    last.target = null;
                    for (let i = 0; i < entriesForFile.length - 1; i++) {
                        entriesForFile[i].mode = 'partial';
                    }
                }
                showNotice('Preview edited — will be used on Seed');
                // live re-verify after edit via getPatchedPreview and update banner without closing
                try {
                    if (window.electronAPI?.fileSeeder?.getPatchedPreview) {
                        const res = await window.electronAPI.fileSeeder.getPatchedPreview(basePath, resolved, allEntries);
                        const newV = res.syntaxError || null;
                        let synStr = null;
                        if (newV) synStr = `syntax error — ${newV.error}` + (newV.line ? ` at line ${newV.line}` : '');
                        if (synStr) {
                            if (d.warning && isSyntaxWarning(d.warning)) {
                                const nonSyntax = d.warning.split(';').filter(s=> !s.includes('syntax error')).map(s=>s.trim()).filter(Boolean).join('; ');
                                d.warning = nonSyntax ? nonSyntax + '; ' + synStr : synStr;
                            } else if (d.warning) {
                                d.warning = d.warning + '; ' + synStr;
                            } else {
                                d.warning = synStr;
                            }
                        } else {
                            if (d.warning && isSyntaxWarning(d.warning)) {
                                const nonSyntax = d.warning.split(';').filter(s=> !s.includes('syntax error')).map(s=>s.trim()).filter(Boolean).join('; ');
                                d.warning = nonSyntax || null;
                            }
                        }
                        if (state.contentPreview && state.contentPreview.details && state.contentPreview.details[idx]) {
                            state.contentPreview.details[idx].warning = d.warning;
                        }
                        if (diffViewer.updateSyntaxError) diffViewer.updateSyntaxError(newV);
                    }
                } catch (_) {}
            },
            onNavigate: (dir) => {
                const details = (state.contentPreview?.details || []);
                const n = details.length;
                if (!n) return;
                let next = _previewDiffIndex;
                for (let step = 0; step < n; step++) {
                    next = (next + dir + n) % n;
                    if (!isEntrySkipped(next)) break;
                }
                openPreviewDiff(next);
            }
        });
    } catch (err) {
        const loadingEl = document.getElementById('appLoadingOverlay');
        if (loadingEl) loadingEl.classList.add('app-loading-hidden');
        console.error('[GlobalSeeder] diff preview error:', err);
        showNotice('Failed to load diff preview');
    }
}

function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setModeUI(mode) {
    document.getElementById('gsModeStructure')?.classList.toggle('gs-mode-tab--active', mode === 'structure');
    document.getElementById('gsModeContent')?.classList.toggle('gs-mode-tab--active', mode === 'content');

    const label = document.getElementById('gsInputLabel');
    const hint  = document.getElementById('gsInputHint');
    if (mode === 'structure') {
        if (label) label.textContent = 'Paste file structure below';
        if (hint)  hint.textContent  = 'Flat lists, indented/box trees. Files missing are created at repo root (existing folders/files skipped).';
    } else {
        if (label) label.textContent = 'Paste file paths + code blocks below';
        if (hint)  hint.textContent  = 'Paste Claude/Copilot output: each file path + code (fenced or plain). Smart-anchored to nearest matching folder — choose target if duplicates.';
    }
}

export function wireUI(onClose, getBasePath) {
    window._gsGetBasePath = getBasePath;
    document.getElementById('gsCloseBtn')?.addEventListener('click', onClose);

    document.querySelectorAll('.gs-mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            state.mode = tab.dataset.mode;
            setModeUI(state.mode);
        });
    });

    document.getElementById('gsClearBtn')?.addEventListener('click', () => {
        const ta = document.getElementById('gsInput');
        if (ta) ta.value = '';
        state.rawInput = '';
    });

    document.getElementById('gsParseBtn')?.addEventListener('click', async () => {
        const basePath = getBasePath();
        if (!basePath) {
            showNotice('No repo selected.');
            return;
        }

            const ta  = document.getElementById('gsInput');
        const raw = ta?.value ?? '';
        if (!raw.trim()) return;
        console.error('[RawDebug] textarea raw input:', JSON.stringify(raw));
        state.rawInput = raw;

        showStage('gsSeedingStage');
        const seedingLabel = document.getElementById('gsSeedingLabel');
        if (seedingLabel) seedingLabel.textContent = 'Analysing…';

        try {
            if (state.mode === 'structure') {
                const parsed = parseInput(raw);
                if (!parsed.length) {
                    showNotice('Could not parse any file paths from the input.');
                    showStage('gsInputStage');
                    return;
                }
                const preview = await window.electronAPI.fileSeeder.preview(basePath, parsed);
                if (preview.error) {
                    showNotice(`Error: ${preview.error}`);
                    showStage('gsInputStage');
                    return;
                }
                state.preview = preview;
                state.previewSkipped = new Set();
                renderStructurePreview(preview);
            } else {
                const entries = parseContentBlocks(raw);
                if (!entries.length) {
                    showNotice('Could not find any "path + code block" pairs in the input.');
                    showStage('gsInputStage');
                    return;
                }
                const preview = await window.electronAPI.fileSeeder.previewContent(basePath, entries);
                if (preview.error) {
                    showNotice(`Error: ${preview.error}`);
                    showStage('gsInputStage');
                    return;
                }
                // Enrich entries with resolved/candidates for seeding
                const enriched = entries.map((e, i) => {
                    const d = preview.details?.[i];
                    return {
                        relPath: e.relPath,
                        content: e.content,
                        resolved: d?.resolved ?? e.relPath,
                        candidates: d?.candidates ?? [],
                        ambiguous: !!d?.ambiguous,
                        mode: e.mode ?? 'full',
                        target: e.target ?? null,
                        skipped: false,
                    };
                });
                state.contentEntries = enriched;
                state.contentPreview = preview;
                renderContentPreview(preview);
            }
            showStage('gsPreviewStage');
        } catch (err) {
            console.error('[GlobalSeeder] preview error:', err);
            showNotice('Failed to contact main process.');
            showStage('gsInputStage');
        }
    });

    document.getElementById('gsBackBtn')?.addEventListener('click', () => {
        showStage('gsInputStage');
        const ta = document.getElementById('gsInput');
        if (ta) ta.value = state.rawInput;
    });

    document.getElementById('gsSeedBtn')?.addEventListener('click', async () => {
        const basePath = getBasePath();
        if (!basePath) {
            showNotice('No repo selected.');
            return;
        }

        showStage('gsSeedingStage');
        const seedingLabel = document.getElementById('gsSeedingLabel');
        if (seedingLabel) seedingLabel.textContent = 'Seeding…';

        try {
            let result;
            if (state.mode === 'structure') {
                const skipped = state.previewSkipped || new Set();
                const active = (state.preview?.toCreate || []).filter(p => !skipped.has(p));
                if (!active.length) {
                    showNotice(state.preview?.toCreate?.length ? 'All files skipped — nothing to seed.' : 'Nothing to create.');
                    showStage('gsPreviewStage');
                    return;
                }
                result = await window.electronAPI.fileSeeder.seed(basePath, active);
            } else {
                const activeEntries = (state.contentEntries || []).filter(e => !e.skipped);
                if (!activeEntries?.length) {
                    showNotice(state.contentEntries?.length ? 'All files skipped — nothing to seed.' : 'Nothing to seed.');
                    showStage('gsPreviewStage');
                    return;
                }
                // send enriched entries with chosen resolved (skipped excluded)
                const payload = activeEntries.map(e => ({
                    relPath: e.relPath,
                    content: e.content,
                    resolved: e.resolved,
                    mode: e.mode,
                    target: e.target,
                }));
                result = await window.electronAPI.fileSeeder.seedContent(basePath, payload);
            }

            if (result.error) {
                showNotice(`Seed failed: ${result.error}`);
                showStage('gsPreviewStage');
                return;
            }

            const errCount = result.errors?.length ?? 0;
            if (errCount > 0) console.warn('[GlobalSeeder] Some files had errors:', result.errors);

            onClose({
                seeded: true,
                created: result.created,
                overwritten: result.overwritten ?? [],
                patched: result.patched ?? [],
                errors: result.errors,
            });
        } catch (err) {
            console.error('[GlobalSeeder] seed error:', err);
            showNotice('Failed to seed files.');
            showStage('gsPreviewStage');
        }
    });
}

export function resetUI() {
    showStage('gsInputStage');
    const ta = document.getElementById('gsInput');
    if (ta) ta.value = '';
    state.rawInput = '';
    setModeUI('content');
    const summary = document.getElementById('gsPreviewSummary');
    const list    = document.getElementById('gsPreviewList');
    const count   = document.getElementById('gsPreviewCount');
    const seedBtn = document.getElementById('gsSeedBtn');
    if (summary) summary.innerHTML = '';
    if (list)    list.innerHTML    = '';
    if (count) count.textContent = '';
    if (seedBtn) seedBtn.textContent = 'Seed';
}

export function setTargetLabel(label) {
    const el = document.getElementById('gsTargetLabel');
    if (el) el.textContent = label ? `→ ${label}` : 'No repo selected';
}

function showNotice(msg) {
    let notice = document.getElementById('gsNotice');
    if (!notice) {
        notice = document.createElement('div');
        notice.id        = 'gsNotice';
        notice.className = 'gs-notice';
        document.querySelector('.gs-panel-inner')?.prepend(notice);
    }
    notice.textContent = msg;
    notice.classList.add('gs-notice--visible');
    setTimeout(() => notice.classList.remove('gs-notice--visible'), 3500);
}