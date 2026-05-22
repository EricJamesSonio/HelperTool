const fs = require('fs');
const path = require('path');

/**
 * Prompt store persistence for categories + prompts + favorites + pinning.
 *
 * NOTE: This runs in Electron main process.
 */

function makePromptStore({ app }) {
    const DATA_PATH = path.join(app.getPath('userData'), 'prompts.json');

    function ensureFile() {
        const dir = path.dirname(DATA_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        if (!fs.existsSync(DATA_PATH)) {
            const initial = {
                categories: [],
                prompts: [],
                updatedAt: new Date().toISOString(),
            };
            fs.writeFileSync(DATA_PATH, JSON.stringify(initial, null, 2), 'utf-8');
        }
    }

    function read() {
        ensureFile();
        try {
            const raw = fs.readFileSync(DATA_PATH, 'utf-8');
            const parsed = JSON.parse(raw);
            return {
                categories: Array.isArray(parsed.categories) ? parsed.categories : [],
                prompts: Array.isArray(parsed.prompts) ? parsed.prompts : [],
                updatedAt: parsed.updatedAt || null,
            };
        } catch {
            return { categories: [], prompts: [], updatedAt: null };
        }
    }

    function write(data) {
        ensureFile();
        const payload = {
            categories: data.categories || [],
            prompts: data.prompts || [],
            updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    }

    function newId(prefix = 'id') {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function normalizeSupports(s) {
        if (s === 'code' || s === 'structure' || s === 'both') return s;
        return 'both';
    }

    function loadAll() {
        return read();
    }

    function createCategory({ name }) {
        const data = read();
        const cat = {
            id: newId('cat'),
            name: (name || '').trim(),
            createdAt: new Date().toISOString(),
            updatedAt: null,
        };
        if (!cat.name) throw new Error('Category name is required');
        data.categories.push(cat);
        write(data);
        return cat;
    }

    function updateCategory({ id, name }) {
        const data = read();
        const cat = data.categories.find(c => c.id === id);
        if (!cat) throw new Error('Category not found');
        cat.name = (name || '').trim();
        cat.updatedAt = new Date().toISOString();
        if (!cat.name) throw new Error('Category name is required');
        write(data);
        return cat;
    }

    function deleteCategory({ id }) {
        const data = read();
        data.categories = data.categories.filter(c => c.id !== id);
        data.prompts = data.prompts.filter(p => p.categoryId !== id);
        write(data);
        return true;
    }

    function upsertPrompt({
        id,
        categoryId,
        title,
        body,
        supports,
        isFavorite,
        pinnedAt,
    }) {
        const data = read();
        const cat = data.categories.find(c => c.id === categoryId);
        if (!cat) throw new Error('Category not found');

        const nextSupports = normalizeSupports(supports);
        const now = new Date().toISOString();

        if (!id) {
            const p = {
                id: newId('prm'),
                categoryId,
                title: (title || '').trim() || '(Untitled)',
                body: body || '',
                supports: nextSupports,
                isFavorite: !!isFavorite,
                pinnedAt: pinnedAt || null,
                createdAt: now,
                updatedAt: null,
            };
            data.prompts.push(p);
            write(data);
            return p;
        }

        const p = data.prompts.find(x => x.id === id);
        if (!p) throw new Error('Prompt not found');

        p.categoryId = categoryId;
        p.title = (title || '').trim() || '(Untitled)';
        p.body = body || '';
        p.supports = nextSupports;
        p.isFavorite = !!isFavorite;
        p.pinnedAt = pinnedAt || null;
        p.updatedAt = now;

        write(data);
        return p;
    }

    function deletePrompt({ id }) {
        const data = read();
        data.prompts = data.prompts.filter(p => p.id !== id);
        write(data);
        return true;
    }

    function toggleFavorite({ id }) {
        const data = read();
        const p = data.prompts.find(x => x.id === id);
        if (!p) throw new Error('Prompt not found');
        p.isFavorite = !p.isFavorite;
        p.updatedAt = new Date().toISOString();
        write(data);
        return p;
    }

    function togglePin({ id }) {
        const data = read();
        const p = data.prompts.find(x => x.id === id);
        if (!p) throw new Error('Prompt not found');
        p.pinnedAt = p.pinnedAt ? null : new Date().toISOString();
        p.updatedAt = new Date().toISOString();
        write(data);
        return p;
    }

    function getApplicablePrompts({ mode }) {
        const data = read();
        const m = mode === 'code' ? 'code' : mode === 'structure' ? 'structure' : 'both';
        const supportsOk = (s) => s === 'both' || s === m;

        const applicable = data.prompts.filter(p => supportsOk(p.supports));

        // pinned first within category, then favorites, then newest
        const pinned = applicable.filter(p => !!p.pinnedAt);
        pinned.sort((a, b) => (b.pinnedAt || '').localeCompare(a.pinnedAt || ''));

        const rest = applicable.filter(p => !p.pinnedAt);
        rest.sort((a, b) => {
            if (!!b.isFavorite !== !!a.isFavorite) return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
            return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
        });

        const merged = [...pinned, ...rest];
        return { categories: data.categories, prompts: merged };
    }

    return {
        loadAll,
        createCategory,
        updateCategory,
        deleteCategory,
        upsertPrompt,
        deletePrompt,
        toggleFavorite,
        togglePin,
        getApplicablePrompts,
    };
}

module.exports = { makePromptStore };

