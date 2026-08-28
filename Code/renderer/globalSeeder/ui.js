import { state } from './state.js';
import { parseInput, parseContentBlocks } from './parser.js';

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
            header.textContent = `📁 ${folder}/`;
            list.appendChild(header);
        }
        for (const item of entries) {
            const row = document.createElement('div');
            row.className = `gs-preview-row gs-preview-row--${item.status}`;
            const icon   = item.status === 'create' ? '✚' : item.status === 'overwrite' ? '⟳' : '⊘';
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
        <span class="gs-badge gs-badge-create">✚ ${preview.toCreate.length} to create</span>
        ${preview.toSkip.length > 0 ? `<span class="gs-badge gs-badge-skip">⊘ ${preview.toSkip.length} already exist</span>` : ''}
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

    summary.innerHTML = `
        <span class="gs-badge gs-badge-create">✚ ${preview.toCreate.length} to create</span>
        ${preview.toOverwrite.length > 0 ? `<span class="gs-badge gs-badge-overwrite">⟳ ${preview.toOverwrite.length} will be overwritten</span>` : ''}
    `;

    const items = [
        ...preview.toCreate.map(p    => ({ path: p, status: 'create'    })),
        ...preview.toOverwrite.map(p => ({ path: p, status: 'overwrite' })),
    ];
    renderRows(list, items);
}

function setModeUI(mode) {
    document.getElementById('gsModeStructure')?.classList.toggle('gs-mode-tab--active', mode === 'structure');
    document.getElementById('gsModeContent')?.classList.toggle('gs-mode-tab--active', mode === 'content');

    const label = document.getElementById('gsInputLabel');
    const hint  = document.getElementById('gsInputHint');
    if (mode === 'structure') {
        if (label) label.textContent = 'Paste file structure below';
        if (hint)  hint.textContent  = 'Supports flat lists, indented trees, and box-drawing trees. Missing folders/files are created; existing ones are skipped.';
    } else {
        if (label) label.textContent = 'Paste file paths + code blocks below';
        if (hint)  hint.textContent  = 'Paste Claude-style output: a file path followed by a fenced code block. New files are created, existing files are overwritten.';
    }
}

export function wireUI(onClose, getBasePath) {
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
                state.contentEntries = entries;
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
                result = await window.electronAPI.fileSeeder.seedContent(basePath, state.contentEntries);
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