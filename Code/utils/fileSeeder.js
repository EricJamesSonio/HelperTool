/**
 * utils/fileSeeder.js
 * Handles the actual filesystem operations for the File Seeder tool.
 * Parsing lives in the renderer (parser.js). This module only receives
 * a clean list of relative paths and a base directory, then creates them.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Given a base directory and an array of relative paths,
 * check which already exist and which will be created.
 *
 * @param {string}   basePath  - Absolute path to the target folder
 * @param {string[]} relPaths  - Relative paths like 'src/app.ts', 'config/env.ts'
 * @returns {{ toCreate: string[], toSkip: string[] }}
 */
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

/**
 * Create files (and any required parent directories).
 * Files in `toSkip` are ignored entirely.
 *
 * @param {string}   basePath  - Absolute path to the target folder
 * @param {string[]} relPaths  - Only the paths that should be created
 * @returns {{ created: string[], errors: { path: string, error: string }[] }}
 */
function seed(basePath, relPaths) {
    const created = [];
    const errors  = [];

    for (const rel of relPaths) {
        const abs = path.join(basePath, rel);
        try {
            // Ensure parent directories exist
            const dir = path.dirname(abs);
            fs.mkdirSync(dir, { recursive: true });

            // Skip if somehow it appeared between preview and seed
            if (fs.existsSync(abs)) continue;

            // Create empty file
            fs.writeFileSync(abs, '', 'utf-8');
            created.push(rel);
        } catch (err) {
            errors.push({ path: rel, error: err.message });
        }
    }

    return { created, errors };
}

module.exports = { preview, seed };