'use strict';

const fs   = require('fs');
const path = require('path');

function preview(basePath, relPaths) {
    const toCreate = [];
    const toSkip   = [];

    for (const rel of relPaths) {
        const abs = path.join(basePath, rel);
        if (fs.existsSync(abs)) {
            toSkip.push(rel);
        } else {
            toCreate.push(rel);
        }
    }

    return { toCreate, toSkip };
}

function seed(basePath, relPaths) {
    const created = [];
    const errors  = [];

    for (const rel of relPaths) {
        const abs = path.join(basePath, rel);
        try {
            const dir = path.dirname(abs);
            fs.mkdirSync(dir, { recursive: true });

            if (fs.existsSync(abs)) continue;

            fs.writeFileSync(abs, '', 'utf-8');
            created.push(rel);
        } catch (err) {
            errors.push({ path: rel, error: err.message });
        }
    }

    return { created, errors };
}

function previewContent(basePath, entries) {
    const toCreate    = [];
    const toOverwrite = [];

    for (const { relPath } of entries) {
        const abs = path.join(basePath, relPath);
        if (fs.existsSync(abs)) {
            toOverwrite.push(relPath);
        } else {
            toCreate.push(relPath);
        }
    }

    return { toCreate, toOverwrite };
}

function seedContent(basePath, entries) {
    const created     = [];
    const overwritten = [];
    const errors      = [];

    for (const { relPath, content } of entries) {
        const abs = path.join(basePath, relPath);
        try {
            const dir = path.dirname(abs);
            fs.mkdirSync(dir, { recursive: true });

            const existed = fs.existsSync(abs);
            fs.writeFileSync(abs, content ?? '', 'utf-8');

            if (existed) overwritten.push(relPath);
            else created.push(relPath);
        } catch (err) {
            errors.push({ path: relPath, error: err.message });
        }
    }

    return { created, overwritten, errors };
}

module.exports = { preview, seed, previewContent, seedContent };
