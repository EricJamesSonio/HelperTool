/**
 * renderer/fileSeederTool/ui.js
 */

import { state }      from './state.js';
import { parseInput } from './parser.js';

// ── Stage helpers ─────────────────────────────────────────────────────────────

function showStage(id) {
    ['fsInputStage', 'fsPreviewStage', 'fsSeedingStage'].forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.toggle('fs-stage-hidden', s !== id);
    });
}

// ── Preview rendering ─────────────────────────────────────────────────────────

function renderPreview(preview) {
    const summary = document.getElementById('fsPreviewSummary');
    const list    = document.getElementById('fsPreviewList');
    if (!summary || !list) return;

    const createCount = preview.toCreate.length;
    const skipCount   = preview.toSkip.length;

    summary.innerHTML = `
        <span class="fs-badge fs-badge-create">✚ ${createCount} to create</span>
        ${skipCount > 0 ? `<span class="fs-badge fs-badge-skip">⊘ ${skipCount} already exist</span>` : ''}
    `;

    list.innerHTML = '';

    // Build a merged sorted list: creates first, then skips
    const allItems = [
        ...preview.toCreate.map(p => ({ path: p, status: 'create' })),
        ...preview.toSkip.map(p   => ({ path: p, status: 'skip'   })),
    ];

    // Group by top-level folder for visual clarity
    const grouped = groupByTopFolder(allItems);

    for (const [folder, items] of Object.entries(grouped)) {
        if (folder !== '__root__') {
            const header = document.createElement('div');
            header.className   = 'fs-preview-folder';
            header.textContent = `📁 ${folder}/`;
            list.appendChild(header);
        }

        for (const item of items) {
            const row = document.createElement('div');
            row.className = `fs-preview-row fs-preview-row--${item.status}`;

            const icon   = item.status === 'create' ? '✚' : '⊘';
            const label  = item.status === 'create' ? 'new'    : 'exists';
            const name   = item.path.split('/').pop();
            const subdir = item.path.includes('/')
                ? item.path.substring(0, item.path.lastIndexOf('/') + 1)
                : '';

            row.innerHTML = `
                <span class="fs-row-icon">${icon}</span>
                <span class="fs-row-path">
                    ${subdir ? `<span class="fs-row-subdir">${subdir}</span>` : ''}${name}
                </span>
                <span class="fs-row-badge">${label}</span>
            `;
            list.appendChild(row);
        }
    }
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

// ── Public wiring — called once by index.js after panel is in DOM ─────────────

export function wireUI(onClose) {

    // Close button
    document.getElementById('fsCloseBtn')?.addEventListener('click', onClose);

    // Clear
    document.getElementById('fsClearBtn')?.addEventListener('click', () => {
        const ta = document.getElementById('fsInput');
        if (ta) ta.value = '';
        state.rawInput = '';
    });

    // Parse & Preview
    document.getElementById('fsParseBtn')?.addEventListener('click', async () => {
        const ta  = document.getElementById('fsInput');
        const raw = ta?.value ?? '';

        if (!raw.trim()) return;
        state.rawInput = raw;

        const parsed = parseInput(raw);
        if (!parsed.length) {
            showNotice('Could not parse any file paths from the input.');
            return;
        }

        showStage('fsSeedingStage'); // brief loading feel
        document.getElementById('fsSeedingLabel') && (document.getElementById('fsSeedingLabel').textContent = 'Analysing…');

        try {
            const preview = await window.electronAPI.fileSeeder.preview(state.targetPath, parsed);
            if (preview.error) {
                showNotice(`Error: ${preview.error}`);
                showStage('fsInputStage');
                return;
            }
            state.preview = preview;
            renderPreview(preview);
            showStage('fsPreviewStage');
        } catch (err) {
            console.error('[FileSeeder] preview error:', err);
            showNotice('Failed to contact main process.');
            showStage('fsInputStage');
        }
    });

    // Back to edit
    document.getElementById('fsBackBtn')?.addEventListener('click', () => {
        showStage('fsInputStage');
        // Restore textarea content
        const ta = document.getElementById('fsInput');
        if (ta) ta.value = state.rawInput;
    });

    // Seed
    document.getElementById('fsSeedBtn')?.addEventListener('click', async () => {
        if (!state.preview?.toCreate?.length) {
            showNotice('Nothing to create.');
            return;
        }

        showStage('fsSeedingStage');

        try {
            const result = await window.electronAPI.fileSeeder.seed(
                state.targetPath,
                state.preview.toCreate
            );

            if (result.error) {
                showNotice(`Seed failed: ${result.error}`);
                showStage('fsPreviewStage');
                return;
            }

            const errCount = result.errors?.length ?? 0;
            if (errCount > 0) {
                console.warn('[FileSeeder] Some files had errors:', result.errors);
            }

            // Success → auto-close (handled by caller via onSeedComplete)
            onClose({ seeded: true, created: result.created, errors: result.errors });

        } catch (err) {
            console.error('[FileSeeder] seed error:', err);
            showNotice('Failed to seed files.');
            showStage('fsPreviewStage');
        }
    });
}

export function resetUI() {
    showStage('fsInputStage');
    const ta = document.getElementById('fsInput');
    if (ta) ta.value = '';
    const summary = document.getElementById('fsPreviewSummary');
    const list    = document.getElementById('fsPreviewList');
    if (summary) summary.innerHTML = '';
    if (list)    list.innerHTML    = '';
}

export function setTargetLabel(label) {
    const el = document.getElementById('fsTargetLabel');
    if (el) el.textContent = label ? `→ ${label}` : 'No folder selected';
}

// ── Simple notice (non-blocking) ──────────────────────────────────────────────

function showNotice(msg) {
    let notice = document.getElementById('fsNotice');
    if (!notice) {
        notice = document.createElement('div');
        notice.id        = 'fsNotice';
        notice.className = 'fs-notice';
        document.querySelector('.fs-panel-inner')?.prepend(notice);
    }
    notice.textContent = msg;
    notice.classList.add('fs-notice--visible');
    setTimeout(() => notice.classList.remove('fs-notice--visible'), 3500);
}