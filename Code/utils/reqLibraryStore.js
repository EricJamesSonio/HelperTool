const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PRESETS, PRESET_VERSION } = require('./reqPresets/index.js');

const DATA_VERSION = 2;
const LEVELS = ['must-have', 'standard', 'medium', 'strict'];

const GROUPS = [
    'Functional Requirements',
    'Security Requirements',
    'Performance Requirements',
    'Architecture Requirements',
    'Data Management Requirements',
    'Error Handling Requirements',
    'User Experience Requirements',
    'Accessibility Requirements',
    'Testing Requirements',
    'Integration Requirements',
    'Acceptance Criteria',
];

const BUILTIN_APP_TYPES = [
    { id: 'web', name: 'Web Application', builtin: true },
    { id: 'offline', name: 'Offline Application', builtin: true },
    { id: 'desktop', name: 'Desktop Application', builtin: true },
    { id: 'mobile', name: 'Mobile Application', builtin: true },
    { id: 'backend', name: 'Backend / API', builtin: true },
    { id: 'hybrid', name: 'Hybrid Application', builtin: true },
];

const DEFAULT_CATEGORIES = [
    'Frontend',
    'Pages',
    'Design System',
    'Backend',
    'Database',
    'Architecture',
    'Security',
    'Performance',
    'Testing',
    'DevOps',
    'Other',
];

function newId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

function clip(v, max) {
    return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function arr(v) {
    return Array.isArray(v) ? v : [];
}

function uniq(list) {
    return Array.from(new Set(list));
}

function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'type';
}

function repoNameOf(repoPath) {
    return String(repoPath).split(/[\\/]/).filter(Boolean).pop() || String(repoPath);
}

function normalizeProfile(profile, validAppTypeIds) {
    const o = profile || {};
    return {
        appType: validAppTypeIds.includes(o.appType) ? o.appType : 'web',
        strictness: LEVELS.includes(o.strictness) ? o.strictness : 'strict',
        stack: clip(o.stack, 300),
        notes: clip(o.notes, 2000),
    };
}

function normalizeReq(r) {
    const o = r || {};
    return {
        id: str(o.id) || newId('req'),
        group: GROUPS.includes(o.group) ? o.group : GROUPS[0],
        level: LEVELS.includes(o.level) ? o.level : 'standard',
        title: str(o.title),
        description: typeof o.description === 'string' ? o.description.trim() : '',
        notes: typeof o.notes === 'string' ? o.notes.trim() : '',
        appTypes: uniq(arr(o.appTypes).map(str).filter(Boolean)),
    };
}

function normalizeSpec(spec, validAppTypeIds) {
    const o = spec || {};
    const now = new Date().toISOString();
    return {
        id: str(o.id) || newId('spec'),
        presetKey: str(o.presetKey) || null,
        name: str(o.name),
        description: typeof o.description === 'string' ? o.description.trim() : '',
        category: str(o.category) || 'Other',
        subcategory: str(o.subcategory),
        tags: uniq(arr(o.tags).map(str).filter(Boolean)),
        appTypes: uniq(arr(o.appTypes).map(str).filter(Boolean)).filter((id) => validAppTypeIds.includes(id)),
        related: uniq(arr(o.related).map(str).filter(Boolean)),
        version: Number.isFinite(o.version) ? o.version : 1,
        favorite: !!o.favorite,
        createdAt: str(o.createdAt) || now,
        updatedAt: str(o.updatedAt) || now,
        lastAccessedAt: str(o.lastAccessedAt) || null,
        requirements: arr(o.requirements).map((r) => {
            const nr = normalizeReq(r);
            nr.appTypes = nr.appTypes.filter((id) => validAppTypeIds.includes(id));
            return nr;
        }),
    };
}

function specFromPreset(p) {
    const now = new Date().toISOString();
    return {
        id: newId('spec'),
        presetKey: p.key,
        name: p.name,
        description: p.description,
        category: p.category,
        subcategory: p.subcategory || '',
        tags: p.tags.slice(),
        appTypes: p.appTypes.slice(),
        related: [],
        version: 1,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: null,
        requirements: p.requirements.map((r) => ({
            id: newId('req'),
            group: r.group,
            level: r.level,
            title: r.title,
            description: r.description,
            notes: '',
            appTypes: r.appTypes.slice(),
        })),
    };
}

function ensureTaxonomy(data) {
    for (const spec of data.specs) {
        if (!data.categories.includes(spec.category)) data.categories.push(spec.category);
        for (const t of spec.tags) {
            if (!data.tags.includes(t)) data.tags.push(t);
        }
    }
    if (!data.categories.includes('Other')) data.categories.push('Other');
}

function addPresets(data, includeRemoved) {
    const have = new Set(data.specs.map((s) => s.presetKey).filter(Boolean));
    const added = [];
    for (const p of PRESETS) {
        if (have.has(p.key)) continue;
        if (!includeRemoved && data.removedPresets.includes(p.key)) continue;
        added.push({ preset: p, spec: specFromPreset(p) });
    }
    for (const item of added) data.specs.push(item.spec);

    const idByKey = new Map(data.specs.filter((s) => s.presetKey).map((s) => [s.presetKey, s.id]));
    for (const item of added) {
        item.spec.related = uniq(arr(item.preset.related).map((k) => idByKey.get(k)).filter(Boolean));
    }
    if (includeRemoved) {
        const addedKeys = added.map((a) => a.preset.key);
        data.removedPresets = data.removedPresets.filter((k) => !addedKeys.includes(k));
    }
    ensureTaxonomy(data);
    return added.length;
}

function makeReqLibraryStore({ app }) {
    const DIR = path.join(app.getPath('userData'), 'req-library');
    const cache = new Map();

    function fileFor(repoPath) {
        const key = String(repoPath).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
        return path.join(DIR, hash + '.json');
    }

    function persist(data) {
        data.updatedAt = new Date().toISOString();
        if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
        const file = fileFor(data.repoPath);
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tmp, file);
        cache.set(file, data);
    }

    function normalizeData(raw, root) {
        const customTypes = arr(raw.appTypes).filter((t) => t && str(t.id) && str(t.name) && !BUILTIN_APP_TYPES.some((b) => b.id === t.id));
        const appTypes = BUILTIN_APP_TYPES.map((t) => ({ ...t })).concat(
            customTypes.map((t) => ({ id: str(t.id), name: str(t.name), builtin: false }))
        );
        const ids = appTypes.map((t) => t.id);
        const data = {
            version: DATA_VERSION,
            presetVersion: Number.isFinite(raw.presetVersion) ? raw.presetVersion : 0,
            repoPath: root,
            repoName: repoNameOf(root),
            profile: normalizeProfile(raw.profile, ids),
            categories: uniq(arr(raw.categories).map(str).filter(Boolean)),
            tags: uniq(arr(raw.tags).map(str).filter(Boolean)),
            appTypes,
            removedPresets: uniq(arr(raw.removedPresets).map(str).filter(Boolean)),
            specs: arr(raw.specs).map((s) => normalizeSpec(s, ids)),
            updatedAt: str(raw.updatedAt) || new Date().toISOString(),
        };
        ensureTaxonomy(data);
        return data;
    }

    function newData(root) {
        const data = {
            version: DATA_VERSION,
            presetVersion: PRESET_VERSION,
            repoPath: root,
            repoName: repoNameOf(root),
            profile: normalizeProfile(null, BUILTIN_APP_TYPES.map((t) => t.id)),
            categories: DEFAULT_CATEGORIES.slice(),
            tags: [],
            appTypes: BUILTIN_APP_TYPES.map((t) => ({ ...t })),
            removedPresets: [],
            specs: [],
            updatedAt: new Date().toISOString(),
        };
        addPresets(data, true);
        return data;
    }

    function read(repoPath) {
        const root = String(repoPath || '').trim();
        if (!root) throw new Error('Select a repository first');
        const file = fileFor(root);
        if (cache.has(file)) return cache.get(file);

        let raw = null;
        if (fs.existsSync(file)) {
            try {
                raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
            } catch (_) {
                try { fs.copyFileSync(file, file + '.corrupt-' + Date.now()); } catch (_e) { /* keep going */ }
                raw = null;
            }
        }

        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.specs)) {
            const fresh = newData(root);
            persist(fresh);
            return fresh;
        }

        const data = normalizeData(raw, root);
        if (data.presetVersion < PRESET_VERSION) {
            addPresets(data, false);
            data.presetVersion = PRESET_VERSION;
            persist(data);
        } else {
            cache.set(file, data);
        }
        return data;
    }

    function appTypeIds(data) {
        return data.appTypes.map((t) => t.id);
    }

    function loadAll({ repoPath }) {
        const data = read(repoPath);
        const have = new Set(data.specs.map((s) => s.presetKey).filter(Boolean));
        return {
            version: data.version,
            repoPath: data.repoPath,
            repoName: data.repoName,
            profile: data.profile,
            categories: data.categories,
            tags: data.tags,
            appTypes: data.appTypes,
            specs: data.specs,
            updatedAt: data.updatedAt,
            levels: LEVELS,
            groups: GROUPS,
            presetTotal: PRESETS.length,
            presetMissing: PRESETS.filter((p) => !have.has(p.key) && !data.removedPresets.includes(p.key)).length,
            presetRemoved: PRESETS.filter((p) => !have.has(p.key) && data.removedPresets.includes(p.key)).length,
        };
    }

    function updateProfile({ repoPath, profile }) {
        const data = read(repoPath);
        data.profile = normalizeProfile(profile, appTypeIds(data));
        persist(data);
        return data.profile;
    }

    function syncPresets({ repoPath, includeRemoved }) {
        const data = read(repoPath);
        const added = addPresets(data, !!includeRemoved);
        persist(data);
        return { added };
    }

    function upsertSpec({ repoPath, spec }) {
        const data = read(repoPath);
        const incoming = normalizeSpec(spec, appTypeIds(data));
        if (!incoming.name) throw new Error('Specification name is required');
        incoming.related = incoming.related.filter((rid) => rid !== incoming.id);
        const now = new Date().toISOString();
        const idx = data.specs.findIndex((s) => s.id === incoming.id);
        if (idx === -1) {
            incoming.presetKey = null;
            incoming.createdAt = now;
            incoming.updatedAt = now;
            incoming.version = 1;
            incoming.lastAccessedAt = null;
            data.specs.push(incoming);
        } else {
            const existing = data.specs[idx];
            incoming.presetKey = existing.presetKey;
            incoming.createdAt = existing.createdAt;
            incoming.lastAccessedAt = existing.lastAccessedAt;
            incoming.favorite = existing.favorite;
            incoming.version = (existing.version || 1) + 1;
            incoming.updatedAt = now;
            data.specs[idx] = incoming;
        }
        ensureTaxonomy(data);
        persist(data);
        return incoming;
    }

    function deleteSpec({ repoPath, id }) {
        const data = read(repoPath);
        const spec = data.specs.find((s) => s.id === id);
        if (spec && spec.presetKey && !data.removedPresets.includes(spec.presetKey)) {
            data.removedPresets.push(spec.presetKey);
        }
        data.specs = data.specs.filter((s) => s.id !== id);
        for (const s of data.specs) {
            s.related = s.related.filter((rid) => rid !== id);
        }
        persist(data);
        return true;
    }

    function duplicateSpec({ repoPath, id }) {
        const data = read(repoPath);
        const src = data.specs.find((s) => s.id === id);
        if (!src) throw new Error('Specification not found');
        const now = new Date().toISOString();
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = newId('spec');
        copy.presetKey = null;
        copy.name = src.name + ' (Copy)';
        copy.favorite = false;
        copy.version = 1;
        copy.createdAt = now;
        copy.updatedAt = now;
        copy.lastAccessedAt = null;
        copy.requirements = copy.requirements.map((r) => ({ ...r, id: newId('req') }));
        data.specs.push(copy);
        persist(data);
        return copy;
    }

    function toggleFavorite({ repoPath, id }) {
        const data = read(repoPath);
        const spec = data.specs.find((s) => s.id === id);
        if (!spec) throw new Error('Specification not found');
        spec.favorite = !spec.favorite;
        persist(data);
        return spec;
    }

    function markViewed({ repoPath, id }) {
        if (!id) return null;
        const data = read(repoPath);
        const spec = data.specs.find((s) => s.id === id);
        if (!spec) return null;
        spec.lastAccessedAt = new Date().toISOString();
        persist(data);
        return spec.lastAccessedAt;
    }

    function addItem({ repoPath, kind, value }) {
        const data = read(repoPath);
        const v = str(value);
        if (!v) throw new Error('A name is required');
        if (kind === 'category') {
            if (!data.categories.includes(v)) data.categories.push(v);
        } else if (kind === 'tag') {
            if (!data.tags.includes(v)) data.tags.push(v);
        } else if (kind === 'appType') {
            let id = 'custom-' + slug(v);
            while (data.appTypes.some((t) => t.id === id)) id += '-x';
            data.appTypes.push({ id, name: v, builtin: false });
        } else {
            throw new Error('Unknown item kind');
        }
        persist(data);
        return true;
    }

    function renameItem({ repoPath, kind, value, newValue }) {
        const data = read(repoPath);
        const nv = str(newValue);
        if (!nv) throw new Error('A name is required');
        if (kind === 'category') {
            const i = data.categories.indexOf(value);
            if (i === -1) throw new Error('Category not found');
            if (data.categories.includes(nv) && nv !== value) throw new Error('That category already exists');
            data.categories[i] = nv;
            for (const s of data.specs) {
                if (s.category === value) s.category = nv;
            }
        } else if (kind === 'tag') {
            const i = data.tags.indexOf(value);
            if (i === -1) throw new Error('Tag not found');
            if (data.tags.includes(nv) && nv !== value) throw new Error('That tag already exists');
            data.tags[i] = nv;
            for (const s of data.specs) {
                s.tags = uniq(s.tags.map((t) => (t === value ? nv : t)));
            }
        } else if (kind === 'appType') {
            const t = data.appTypes.find((x) => x.id === value);
            if (!t) throw new Error('Application type not found');
            if (t.builtin) throw new Error('Built-in application types cannot be renamed');
            t.name = nv;
        } else {
            throw new Error('Unknown item kind');
        }
        persist(data);
        return true;
    }

    function deleteItem({ repoPath, kind, value }) {
        const data = read(repoPath);
        if (kind === 'category') {
            if (value === 'Other') throw new Error('The Other category cannot be deleted');
            data.categories = data.categories.filter((c) => c !== value);
            for (const s of data.specs) {
                if (s.category === value) s.category = 'Other';
            }
        } else if (kind === 'tag') {
            data.tags = data.tags.filter((t) => t !== value);
            for (const s of data.specs) {
                s.tags = s.tags.filter((t) => t !== value);
            }
        } else if (kind === 'appType') {
            const t = data.appTypes.find((x) => x.id === value);
            if (!t) throw new Error('Application type not found');
            if (t.builtin) throw new Error('Built-in application types cannot be deleted');
            data.appTypes = data.appTypes.filter((x) => x.id !== value);
            for (const s of data.specs) {
                s.appTypes = s.appTypes.filter((id) => id !== value);
                for (const r of s.requirements) {
                    r.appTypes = r.appTypes.filter((id) => id !== value);
                }
            }
            if (data.profile.appType === value) data.profile.appType = 'web';
        } else {
            throw new Error('Unknown item kind');
        }
        ensureTaxonomy(data);
        persist(data);
        return true;
    }

    function importLibrary({ repoPath, data: incoming }) {
        const data = read(repoPath);
        const src = incoming && typeof incoming === 'object' ? incoming : {};
        let specs = arr(src.specs);
        if (src.spec && typeof src.spec === 'object') specs = [src.spec];

        for (const t of arr(src.appTypes)) {
            if (!t || !str(t.id) || !str(t.name)) continue;
            if (data.appTypes.some((x) => x.id === t.id)) continue;
            data.appTypes.push({ id: str(t.id), name: str(t.name), builtin: false });
        }

        const ids = appTypeIds(data);
        let imported = 0;
        let skipped = 0;
        for (const raw of specs) {
            const spec = normalizeSpec(raw, ids);
            if (!spec.name) {
                skipped += 1;
                continue;
            }
            if (data.specs.some((s) => s.id === spec.id)) {
                spec.id = newId('spec');
            }
            if (spec.presetKey && data.specs.some((s) => s.presetKey === spec.presetKey)) {
                spec.presetKey = null;
                spec.name = spec.name + ' (Imported)';
            }
            spec.related = [];
            spec.favorite = false;
            data.specs.push(spec);
            imported += 1;
        }
        ensureTaxonomy(data);
        persist(data);
        return { imported, skipped };
    }

    return {
        loadAll,
        updateProfile,
        syncPresets,
        upsertSpec,
        deleteSpec,
        duplicateSpec,
        toggleFavorite,
        markViewed,
        addItem,
        renameItem,
        deleteItem,
        importLibrary,
    };
}

module.exports = { makeReqLibraryStore };