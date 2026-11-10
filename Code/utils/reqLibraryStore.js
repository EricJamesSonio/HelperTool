const fs = require('fs');
const path = require('path');

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

function arr(v) {
    return Array.isArray(v) ? v : [];
}

function uniq(list) {
    return Array.from(new Set(list));
}

function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'type';
}

function req(group, level, title, description, appTypes) {
    return {
        id: newId('req'),
        group,
        level,
        title,
        description,
        notes: '',
        appTypes: appTypes || [],
    };
}

function seedSpecs() {
    const now = new Date().toISOString();

    const searchBar = {
        id: newId('spec'),
        name: 'Search Bar',
        description: 'A search input that filters or queries data and shows the results to the user.',
        category: 'Frontend',
        subcategory: 'Inputs',
        tags: ['search', 'input', 'filtering'],
        appTypes: ['web', 'offline', 'desktop', 'mobile', 'hybrid'],
        related: [],
        version: 1,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: null,
        requirements: [
            req('Functional Requirements', 'must-have', 'Search input handling', 'Accept free text input, trim surrounding whitespace, and treat an empty or whitespace-only value as a cleared search that restores the unfiltered state.'),
            req('Functional Requirements', 'must-have', 'Clear search', 'Provide a clear control that empties the input, resets the results to the unfiltered state, and returns focus to the input.'),
            req('Functional Requirements', 'must-have', 'Empty state', 'Show an explicit no-results message when a search returns nothing, distinct from the loading and error states.'),
            req('Functional Requirements', 'must-have', 'Case-insensitive partial matching', 'Match case-insensitively and support partial keyword matches unless the feature explicitly requires exact matching.'),
            req('Security Requirements', 'must-have', 'Safe handling of search text', 'Treat the search text as untrusted input. Never concatenate it into queries or markup. Use parameterized queries for database access and encode any text that is rendered back, including highlighted matches.'),
            req('Error Handling Requirements', 'must-have', 'Search failure handling', 'Catch search failures, show a clear error message to the user, keep the input intact, and allow the user to retry without reloading.'),
            req('Functional Requirements', 'standard', 'Debounced input', 'Debounce search-as-you-type so a request or query is not triggered on every keystroke. Use a delay between 200 and 400 ms unless the project defines its own.', ['web', 'mobile', 'hybrid']),
            req('Performance Requirements', 'standard', 'Request cancellation', 'Cancel in-flight search requests when a newer search starts or the component is torn down, where the platform supports cancellation.', ['web', 'mobile', 'hybrid']),
            req('User Experience Requirements', 'standard', 'Loading and error states', 'Show a loading indicator while an asynchronous search is running and a distinct error state when it fails.', ['web', 'mobile', 'hybrid', 'desktop']),
            req('Data Management Requirements', 'standard', 'Local database searching', 'Query the local data store directly and avoid loading the full dataset into memory just to filter it.', ['offline', 'desktop', 'hybrid']),
            req('Architecture Requirements', 'standard', 'Separation of concerns', 'Keep input handling, query logic, and result rendering in separate units, and reuse the existing data access layer of the project.'),
            req('Accessibility Requirements', 'standard', 'Keyboard and label support', 'Give the input an accessible label, support keyboard use including clearing with Escape, and announce result counts or the empty state to assistive technology.'),
            req('Integration Requirements', 'standard', 'API integration conventions', 'Call the search endpoint through the existing API client of the project and follow its conventions for base URLs, headers, and error mapping.', ['web', 'mobile', 'hybrid']),
            req('Security Requirements', 'medium', 'Server-side validation and limits', 'Validate the query on the server, enforce a maximum query length, and reject malformed input with a clear error response.', ['web', 'backend', 'hybrid']),
            req('Performance Requirements', 'medium', 'Ignore stale responses', 'Make sure a slower response from an older search can never overwrite the results of a newer search.', ['web', 'mobile', 'hybrid']),
            req('Performance Requirements', 'medium', 'Local indexing', 'Use an index or full-text search facility of the local store when the dataset is large enough that scanning becomes slow.', ['offline', 'desktop', 'hybrid']),
            req('Integration Requirements', 'medium', 'Connectivity changes', 'Handle losing and regaining connectivity during a search, fall back to local results where available, and tell the user which source is shown.', ['hybrid']),
            req('Integration Requirements', 'medium', 'Search synchronization', 'Keep local and remote search results consistent, define which source wins on conflict, and refresh local data when connectivity returns.', ['hybrid']),
            req('Testing Requirements', 'medium', 'Behavior tests', 'Cover empty input, clearing, no results, failures, and rapid typing with automated tests.'),
            req('Security Requirements', 'strict', 'Request rate limiting', 'Apply server-side rate limiting to the search endpoint to prevent scraping and abuse, and return an appropriate throttling response.', ['web', 'backend', 'hybrid']),
            req('Performance Requirements', 'strict', 'Resource exhaustion protection', 'Cap result set size, query cost, and query time so a single search cannot exhaust memory or CPU.'),
            req('Security Requirements', 'strict', 'Audit logging of abuse patterns', 'Log repeated rejected or abusive search attempts without storing sensitive search text unnecessarily.', ['backend', 'web', 'hybrid']),
            req('Testing Requirements', 'strict', 'Security-focused tests', 'Add tests for injection payloads, oversized input, and special characters, and verify that output is encoded.'),
            req('Acceptance Criteria', 'must-have', 'Core behavior verified', 'Typing a term shows matching results, clearing restores the full list, and a term with no matches shows the empty state.'),
            req('Acceptance Criteria', 'standard', 'Responsiveness verified', 'Rapid typing does not trigger one request per keystroke and does not show out-of-order results.', ['web', 'mobile', 'hybrid']),
        ],
    };

    const restEndpoint = {
        id: newId('spec'),
        name: 'REST API Endpoint',
        description: 'A server-side HTTP endpoint that validates input, performs an operation, and returns a consistent response.',
        category: 'Backend',
        subcategory: 'API',
        tags: ['api', 'rest', 'http'],
        appTypes: ['backend', 'hybrid'],
        related: [],
        version: 1,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: null,
        requirements: [
            req('Functional Requirements', 'must-have', 'Defined contract', 'Define the route, HTTP method, request shape, and response shape before implementing, and use correct status codes for success and failure.'),
            req('Security Requirements', 'must-have', 'Server-side input validation', 'Validate all request data on the server before processing it. Apply context-appropriate validation and use parameterized database queries to prevent SQL injection.'),
            req('Security Requirements', 'must-have', 'No hardcoded secrets', 'Read credentials and keys from the configuration or secret store of the project and never commit them.'),
            req('Error Handling Requirements', 'must-have', 'No internal detail leaks', 'Never return stack traces, SQL errors, or internal paths to the client. Log the detail server-side and return a generic message.'),
            req('Security Requirements', 'standard', 'Authentication and authorization', 'Require authentication where the data is not public and check on the server that the caller is allowed to perform the action on the specific resource.'),
            req('Error Handling Requirements', 'standard', 'Consistent error format', 'Return errors in the single error format already used by the project, including a machine-readable code and a human-readable message.'),
            req('Performance Requirements', 'standard', 'Pagination for collections', 'Paginate any endpoint that returns a collection and enforce a maximum page size.'),
            req('Architecture Requirements', 'standard', 'Layered implementation', 'Keep routing, validation, business logic, and data access in separate layers following the existing project structure.'),
            req('Testing Requirements', 'standard', 'Endpoint tests', 'Cover the success path, validation failures, and authorization failures with automated tests.'),
            req('Security Requirements', 'medium', 'Rate limiting', 'Apply rate limiting appropriate to the sensitivity of the endpoint and return a throttling response when exceeded.'),
            req('Performance Requirements', 'medium', 'Avoid N+1 queries', 'Load related data in bulk or with joins instead of one query per item.'),
            req('Data Management Requirements', 'medium', 'Transactional writes', 'Wrap operations that change several records in a transaction so a failure leaves no partial state.'),
            req('Data Management Requirements', 'strict', 'Concurrency safety', 'Protect against race conditions and duplicate submissions using idempotency keys, optimistic locking, or equivalent.'),
            req('Security Requirements', 'strict', 'Audit logging', 'Record who performed sensitive actions, on what resource, and when, without logging secrets or personal data unnecessarily.'),
            req('Testing Requirements', 'strict', 'Security tests', 'Add tests for injection payloads, broken authorization, oversized bodies, and mass assignment.'),
            req('Acceptance Criteria', 'must-have', 'Contract verified', 'Valid requests succeed with the documented response, and invalid requests are rejected with the documented status code and error format.'),
        ],
    };

    return [searchBar, restEndpoint];
}

function seedData() {
    return {
        version: 1,
        categories: DEFAULT_CATEGORIES.slice(),
        tags: ['search', 'input', 'filtering', 'api', 'rest', 'http'],
        appTypes: BUILTIN_APP_TYPES.map((t) => ({ ...t })),
        specs: seedSpecs(),
        updatedAt: new Date().toISOString(),
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
    const appTypes = uniq(arr(o.appTypes).map(str).filter(Boolean)).filter((id) => validAppTypeIds.includes(id));
    return {
        id: str(o.id) || newId('spec'),
        name: str(o.name),
        description: typeof o.description === 'string' ? o.description.trim() : '',
        category: str(o.category) || 'Other',
        subcategory: str(o.subcategory),
        tags: uniq(arr(o.tags).map(str).filter(Boolean)),
        appTypes,
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

function makeReqLibraryStore({ app }) {
    const DATA_PATH = path.join(app.getPath('userData'), 'req-library.json');
    let cache = null;

    function write(data) {
        data.updatedAt = new Date().toISOString();
        const dir = path.dirname(DATA_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = DATA_PATH + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tmp, DATA_PATH);
        cache = data;
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

    function read() {
        if (cache) return cache;
        let data = null;
        try {
            if (fs.existsSync(DATA_PATH)) {
                data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
            }
        } catch (_) {
            data = null;
        }
        if (!data || typeof data !== 'object' || !Array.isArray(data.specs)) {
            data = seedData();
            write(data);
            return cache;
        }
        data.categories = arr(data.categories).map(str).filter(Boolean);
        data.tags = arr(data.tags).map(str).filter(Boolean);
        const customTypes = arr(data.appTypes).filter((t) => t && str(t.id) && str(t.name) && !BUILTIN_APP_TYPES.some((b) => b.id === t.id));
        data.appTypes = BUILTIN_APP_TYPES.map((t) => ({ ...t })).concat(
            customTypes.map((t) => ({ id: str(t.id), name: str(t.name), builtin: false }))
        );
        const ids = data.appTypes.map((t) => t.id);
        data.specs = data.specs.map((s) => normalizeSpec(s, ids));
        ensureTaxonomy(data);
        cache = data;
        return cache;
    }

    function appTypeIds(data) {
        return data.appTypes.map((t) => t.id);
    }

    function loadAll() {
        const data = read();
        return {
            version: data.version,
            categories: data.categories,
            tags: data.tags,
            appTypes: data.appTypes,
            specs: data.specs,
            updatedAt: data.updatedAt,
            levels: LEVELS,
            groups: GROUPS,
        };
    }

    function upsertSpec(input) {
        const data = read();
        const ids = appTypeIds(data);
        const incoming = normalizeSpec(input, ids);
        if (!incoming.name) throw new Error('Specification name is required');
        incoming.related = incoming.related.filter((rid) => rid !== incoming.id);
        const now = new Date().toISOString();
        const idx = data.specs.findIndex((s) => s.id === incoming.id);
        if (idx === -1) {
            incoming.createdAt = now;
            incoming.updatedAt = now;
            incoming.version = 1;
            incoming.lastAccessedAt = null;
            data.specs.push(incoming);
        } else {
            const existing = data.specs[idx];
            incoming.createdAt = existing.createdAt;
            incoming.lastAccessedAt = existing.lastAccessedAt;
            incoming.favorite = existing.favorite;
            incoming.version = (existing.version || 1) + 1;
            incoming.updatedAt = now;
            data.specs[idx] = incoming;
        }
        ensureTaxonomy(data);
        write(data);
        return incoming;
    }

    function deleteSpec({ id }) {
        const data = read();
        data.specs = data.specs.filter((s) => s.id !== id);
        for (const s of data.specs) {
            s.related = s.related.filter((rid) => rid !== id);
        }
        write(data);
        return true;
    }

    function duplicateSpec({ id }) {
        const data = read();
        const src = data.specs.find((s) => s.id === id);
        if (!src) throw new Error('Specification not found');
        const now = new Date().toISOString();
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = newId('spec');
        copy.name = src.name + ' (Copy)';
        copy.favorite = false;
        copy.version = 1;
        copy.createdAt = now;
        copy.updatedAt = now;
        copy.lastAccessedAt = null;
        copy.requirements = copy.requirements.map((r) => ({ ...r, id: newId('req') }));
        data.specs.push(copy);
        write(data);
        return copy;
    }

    function toggleFavorite({ id }) {
        const data = read();
        const spec = data.specs.find((s) => s.id === id);
        if (!spec) throw new Error('Specification not found');
        spec.favorite = !spec.favorite;
        write(data);
        return spec;
    }

    function markViewed({ id }) {
        const data = read();
        const spec = data.specs.find((s) => s.id === id);
        if (!spec) return null;
        spec.lastAccessedAt = new Date().toISOString();
        write(data);
        return spec.lastAccessedAt;
    }

    function addItem({ kind, value }) {
        const data = read();
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
        write(data);
        return true;
    }

    function renameItem({ kind, value, newValue }) {
        const data = read();
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
        write(data);
        return true;
    }

    function deleteItem({ kind, value }) {
        const data = read();
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
        } else {
            throw new Error('Unknown item kind');
        }
        ensureTaxonomy(data);
        write(data);
        return true;
    }

    function importLibrary({ data: incoming }) {
        const data = read();
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
                spec.name = spec.name + ' (Imported)';
            }
            spec.related = [];
            spec.favorite = false;
            data.specs.push(spec);
            imported += 1;
        }
        ensureTaxonomy(data);
        write(data);
        return { imported, skipped };
    }

    return {
        loadAll,
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