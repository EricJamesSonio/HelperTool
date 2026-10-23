import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.join(__dirname, '..', 'renderer');

// A stray backtick inside a template literal is invisible in review but breaks
// the whole renderer module. Bundling the entry point catches every such
// syntax error plus unresolved imports.
describe('renderer — entry point', () => {
  it('bundles without syntax or import errors', async () => {
    const esbuild = require('esbuild');
    const result = await esbuild.build({
      entryPoints: [path.join(rendererRoot, 'app.js')],
      bundle: true,
      write: false,
      format: 'esm',
      logLevel: 'silent',
      loader: { '.js': 'js', '.jsx': 'jsx' },
    });
    assert.equal(result.errors.length, 0);
    assert.ok(result.outputFiles[0].text.length > 0);
  });
});

describe('renderer — global seeder template', () => {
  it('renders the documented block format', async () => {
    const { loadModuleCopy } = await import('./helpers.mjs');
    const { getPanelHTML } = await loadModuleCopy('renderer/globalSeeder/template.js');
    const html = getPanelHTML();

    assert.ok(html.includes('&#96;&#96;&#96;text'), 'sample keeps a fence opener');
    assert.ok(html.includes('&lt;&lt;&lt;START'), 'sample shows <<<START');
    assert.ok(html.includes('&lt;&lt;&lt;END'), 'sample shows <<<END');
    assert.ok(html.includes('id="gsCopyRuleBtn"'), 'copy-rule button is present');
  });
});
