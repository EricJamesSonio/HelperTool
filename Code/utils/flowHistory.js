'use strict';

const fs = require('fs');
const path = require('path');
const fileSeeder = require('./fileSeeder');

const MAX_RECORDS = 40;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

let storePath = null;
let store = null;

function init(app) {
    if (storePath || !app || typeof app.getPath !== 'function') return;
    storePath = path.join(app.getPath('userData'), 'flow-history.json');
}

function load() {
    if (store) return store;
    store = {};
    if (!storePath) return store;
    try {
        const raw = fs.readFileSync(storePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') store = parsed;
    } catch (_) {
        store = {};
    }
    return store;
}

function save() {
    if (!storePath || !store) return;
    try {
        fs.writeFileSync(storePath, JSON.stringify(store), 'utf-8');
    } catch (err) {
        console.error('[FlowHistory] save failed:', err.message);
    }
}

function repoKey(basePath) {
    return String(basePath || '').replace(/\\/g, '/').toLowerCase();
}

function safeAbs(basePath, rel) {
    const root = path.resolve(basePath);
    const abs = path.resolve(root, String(rel || ''));
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    return abs;
}

function readState(abs) {
    try {
        const st = fs.statSync(abs);
        if (!st.isFile()) return { existed: false, content: '', big: false };
        if (st.size > MAX_FILE_BYTES) return { existed: true, content: null, big: true };
        return { existed: true, content: fs.readFileSync(abs, 'utf-8'), big: false };
    } catch (_) {
        return { existed: false, content: '', big: false };
    }
}

function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fileKind(f) {
    if (!f.beforeExisted) return 'new';
    if (!f.afterExisted) return 'deleted';
    return 'modified';
}

async function applyWithHistory(basePath, entries, meta) {
    const rels = [];
    const seen = new Set();
    for (const e of entries) {
        if (!e || !e.resolved || seen.has(e.resolved)) continue;
        seen.add(e.resolved);
        rels.push(e.resolved);
    }

    const before = new Map();
    for (const rel of rels) {
        const abs = safeAbs(basePath, rel);
        before.set(rel, abs ? readState(abs) : null);
    }

    const result = await fileSeeder.seedContent(basePath, entries);
    if (!result || result.error) return result;

    const files = [];
    for (const rel of rels) {
        const b = before.get(rel);
        const abs = safeAbs(basePath, rel);
        if (!b || !abs) continue;
        const a = readState(abs);
        const changed = b.existed !== a.existed || b.content !== a.content;
        if (!changed) continue;
        const big = b.big || a.big;
        files.push({
            path: rel,
            beforeExisted: b.existed,
            before: big ? null : b.content,
            afterExisted: a.existed,
            after: big ? null : a.content,
            big: big,
            reverted: false,
        });
    }

    let historyId = null;
    if (files.length) {
        const data = load();
        const key = repoKey(basePath);
        if (!Array.isArray(data[key])) data[key] = [];
        historyId = newId();
        data[key].push({
            id: historyId,
            at: Date.now(),
            title: (meta && meta.title) || ('Applied ' + files.length + ' file(s)'),
            files: files,
        });
        while (data[key].length > MAX_RECORDS) data[key].shift();
        save();
    }

    return Object.assign({}, result, { historyId: historyId });
}

function list(basePath) {
    const data = load();
    const records = Array.isArray(data[repoKey(basePath)]) ? data[repoKey(basePath)] : [];
    const items = records.slice().reverse().map((r) => ({
        id: r.id,
        at: r.at,
        title: r.title,
        files: r.files.map((f) => ({
            path: f.path,
            kind: fileKind(f),
            big: !!f.big,
            reverted: !!f.reverted,
        })),
    }));
    return { items: items };
}

function get(basePath, id) {
    const data = load();
    const records = Array.isArray(data[repoKey(basePath)]) ? data[repoKey(basePath)] : [];
    const record = records.find((r) => r.id === id);
    if (!record) return { error: 'History entry not found.' };
    return { record: record };
}

function revert(basePath, id, opts) {
    const options = opts || {};
    const data = load();
    const records = Array.isArray(data[repoKey(basePath)]) ? data[repoKey(basePath)] : [];
    const record = records.find((r) => r.id === id);
    if (!record) return { error: 'History entry not found.' };

    const wanted = Array.isArray(options.paths) && options.paths.length ? new Set(options.paths) : null;
    const targets = record.files.filter((f) => !f.reverted && (!wanted || wanted.has(f.path)));
    if (!targets.length) return { error: 'Nothing left to revert.' };

    const skipped = [];
    const todo = [];
    const conflicts = [];
    for (const f of targets) {
        if (f.big) {
            skipped.push({ path: f.path, reason: 'too large to restore' });
            continue;
        }
        const abs = safeAbs(basePath, f.path);
        if (!abs) {
            skipped.push({ path: f.path, reason: 'path outside the repo' });
            continue;
        }
        const cur = readState(abs);
        const drifted = cur.existed !== f.afterExisted || cur.content !== f.after;
        if (drifted) conflicts.push(f.path);
        todo.push({ f: f, abs: abs });
    }

    if (conflicts.length && options.force !== true) {
        return { needsForce: true, conflicts: conflicts };
    }

    const reverted = [];
    const errors = [];
    for (const item of todo) {
        const f = item.f;
        try {
            if (!f.beforeExisted) {
                if (fs.existsSync(item.abs)) fs.unlinkSync(item.abs);
            } else {
                fs.mkdirSync(path.dirname(item.abs), { recursive: true });
                fs.writeFileSync(item.abs, f.before == null ? '' : f.before, 'utf-8');
            }
            f.reverted = true;
            reverted.push(f.path);
        } catch (err) {
            errors.push({ path: f.path, error: err.message });
        }
    }

    save();
    return { reverted: reverted, skipped: skipped, errors: errors };
}

function clear(basePath) {
    const data = load();
    delete data[repoKey(basePath)];
    save();
    return { ok: true };
}

module.exports = { init, applyWithHistory, list, get, revert, clear };