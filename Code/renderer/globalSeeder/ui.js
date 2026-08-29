
import { state } from './state.js';
import { parseInput, parseContentBlocks } from './parser.js';
import * as diffViewer from '../diffViewer.js';

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
            row.className = `gs-preview-row gs-preview-row--${item.status}`;
            const icon   = item.status === 'create' ? '+' : item.status === 'overwrite' ? '~' : 'x';
            const label  = item.status === 'create' ? 'new' : item.status === 'overwrite' ? 'overwrite' : 'exists';
            const name   = item.path.split('/').pop();
            const subdir = item.path.includes('/') ? item.path.substring(0, item.path.lastIndexOf('/') + 1) : '';
            row.innerHTML = `
                <span class="gs-row-icon">${icon}</span>
                <span class="gs-row-path">${subdir ? `<span class="gs-row-subdir">${subdir}</span>` : ''}${name}</span>
                <span class="gs-row-badge">${label}</span>
            `;
            list.appendChild(row);
        }
    }
}

function renderStructurePreview(preview) {
    const summary = document.getElementById('gsPreviewSummary');
    const list    = document.getElementById('gsPreviewList');
    if (!summary || !list) return;

    summary.innerHTML = `
        <span class="gs-badge gs-badge-create">+ ${preview.toCreate.length} to create</span>
        ${preview.toSkip.length > 0 ? `<span class="gs-badge gs-badge-skip">x ${preview.toSkip.length} already exist</span>` : ''}
    `;

    const items = [
        ...preview.toCreate.map(p => ({ path: p, status: 'create' })),
        ...preview.toSkip.map(p   => ({ path: p, status: 'skip'   })),
    ];
    renderRows(list, items);
}

function renderContentPreview(preview) {
    const summary = document.getElementById('gsPreviewSummary');
    const list    = document.getElementById('gsPreviewList');
    if (!summary || !list) return;

    const ambiguousCount = (preview.details || []).filter(d => d.ambiguous).length;
    const patchCount = (preview.toPatch || []).length;
    const warnCount = (preview.details || []).filter(d => d.warning).length;
    const warnings = preview.warnings || [];

    summary.innerHTML = `
        <span class="gs-badge gs-badge-create">+${preview.toCreate.length} to create</span>
        ${preview.toOverwrite.length > 0 ? `<span class="gs-badge gs-badge-overwrite">~${preview.toOverwrite.length} will be overwritten</span>` : ''}
        ${patchCount > 0 ? `<span class="gs-badge gs-badge-patch">~${patchCount} to patch</span>` : ''}
        ${warnCount > 0 ? `<span class="gs-badge gs-badge-ambig" title="${escapeHtml(warnings.map(w=>w.warning).join('; '))}">!${warnCount} patch will fallback to full</span>` : ''}
        ${ambiguousCount > 0 ? `<span class="gs-badge gs-badge-ambig">!${ambiguousCount} need target choice</span>` : ''}
    `;

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
            const hasWarning = !!d.warning;
            const status = hasWarning ? 'patch-warn' : (isPatch ? 'patch' : (d.exists ? 'overwrite' : 'create'));
            const row = document.createElement('div');
            row.className = `gs-preview-row gs-preview-row--${status}${d.ambiguous ? ' gs-preview-row--ambig' : ''}`;
            const icon  = hasWarning ? '!' : (isPatch ? '~' : (d.exists ? '~' : '+'));
            let patchLabel = '';
            if (d.mode === 'addAfter') patchLabel = `add after: ${escapeHtml(d.target||'')}`;
            else if (d.mode === 'addBefore') patchLabel = `add before: ${escapeHtml(d.target||'')}`;
            else if (d.mode === 'remove') patchLabel = `remove: ${escapeHtml(d.target||'')}`;
            else if (isPatch) patchLabel = `patch: ${escapeHtml(d.target||'')}`;
            const label = hasWarning ? `fallback: ${escapeHtml(d.warning || 'target not found')}` : (isPatch ? patchLabel : (d.exists ? 'overwrite' : 'new'));
            const subdir = d.resolved.includes('/') ? d.resolved.substring(0, d.resolved.lastIndexOf('/') + 1) : '';
            const name   = d.resolved.split('/').pop();
            const hasSelector = d.ambiguous && d.candidates && d.candidates.length > 1;

            // Build base row
            const pathHtml = `${subdir ? `<span class="gs-row-subdir">${escapeHtml(subdir)}</span>` : ''}${escapeHtml(name)}`;
            const origHint = d.original !== d.resolved ? ` title="from: ${escapeHtml(d.original)}"` : '';

            row.innerHTML = `
                <span class="gs-row-icon">${icon}</span>
                <span class="gs-row-path"${origHint}>${pathHtml}</span>
                ${d.original !== d.resolved ? `<span class="gs-row-orig" title="${escapeHtml(d.original)}">← ${escapeHtml(d.original.split('/')[0])}/…</span>` : ''}
                <span class="gs-row-badge">${label}</span>
            `;

            // If ambiguous, append a selector for the target base
            if (hasSelector) {
                const selWrap = document.createElement('div');
                selWrap.className = 'gs-ambig-wrap';
                const sel = document.createElement('select');
                sel.className = 'gs-ambig-select';
                sel.dataset.idx = String(idx);
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
                    // select current resolved prefix
                    const curPrefix = d.resolved.slice(0, d.resolved.length - rest.length - 1);
                    if (cand === curPrefix || (cand === '' && curPrefix === d.original.split('/')[0])) opt.selected = true;
                    sel.appendChild(opt);
                }
                sel.addEventListener('change', (e) => {
                    const newBase = e.target.value;
                    const originalRest = d.original.split('/').slice(1).join('/');
                    const newResolved = newBase === '' ? d.original : (originalRest ? `${newBase}/${originalRest}` : newBase);
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
                    // also need to re-check exists state? preview counts already done; we keep original exists flag for now
                    // but update status badge if target changes from exists to not — re-query optimistically skip
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
                openPreviewDiff(idx);
            });

            list.appendChild(row);
        }
    }
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
        const total = preview.details.length;
        diffViewer.openPreview({
            filePath: absPath,
            repoPath: basePath,
            leftText,
            rightText,
            mode: d.mode,
            target: d.target,
            fileIndex: idx,
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
            },
            onNavigate: (dir) => {
                const nextIdx = (_previewDiffIndex + dir + total) % total;
                openPreviewDiff(nextIdx);
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
                if (!state.preview?.toCreate?.length) {
                    showNotice('Nothing to create.');
                    showStage('gsPreviewStage');
                    return;
                }
                result = await window.electronAPI.fileSeeder.seed(basePath, state.preview.toCreate);
            } else {
                if (!state.contentEntries?.length) {
                    showNotice('Nothing to seed.');
                    showStage('gsPreviewStage');
                    return;
                }
                // send enriched entries with chosen resolved
                const payload = state.contentEntries.map(e => ({
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
    setModeUI('structure');
    const summary = document.getElementById('gsPreviewSummary');
    const list    = document.getElementById('gsPreviewList');
    if (summary) summary.innerHTML = '';
    if (list)    list.innerHTML    = '';
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