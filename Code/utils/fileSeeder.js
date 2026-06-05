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

module.exports = { preview, seed };
