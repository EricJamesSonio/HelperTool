import { transform } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const R = (...p) => resolve(root, 'renderer', ...p);

const files = [
  'styles/base.css',
  'styles/shared-components.css',
  'styles/layout-chrome.css',
  'styles/layout-tree.css',
  'styles/ignore-panel.css',
  'styles/secret-holder.css',
  'styles/note-mode.css',
  'styles/settings.css',
  'styles/session-notes.css',
  'styles/api-tool.css',
  'styles/minified.css',
  'styles/prompt-tool.css',
  'styles/root-jumper.css',
  'styles/workspaceTool.css',
  'styles/git-tool.css',
  'styles/branch-manager.css',
  'styles/env-manager.css',
  'styles/shortcuts.css',
  'styles/symbol-index.css',
  'styles/dependencies.css',
  'styles/canvas-tool.css',
  'styles/file-seeder.css',
  'styles/loc-detector.css',
  'styles/terminal.css',
  'styles/port-manager.css',
  'styles/database-inspector.css',
  'databaseInspector/graph-bundle.css',
  'styles/diff-viewer.css',
  'styles/docignore-manager.css',
  'styles/team-activity.css',
  'styles/blueprint-library.css',
  'styles/profile.css',
  'styles/essentials-glossary.css',
  'styles/docker-tool.css',
  'styles/query-builder.css',
  'styles/service-tracker.css',
  'styles/codebase-chat.css',
  'styles/video-tool.css',
  'styles/gmail-tool.css',
  'styles/automation-sketch.css',
  'styles/github-explorer.css',
  'styles/codeswamp-ui.css',
  'styles/codebase-map.css',
  'styles/ui-layout-helper.css',
  'styles/graphify.css',
  'styles/error-cop.css',
  'styles/mcp.css',
];

let css = '';
let loaded = 0;
for (const f of files) {
  const p = R(f);
  if (!existsSync(p)) {
    console.warn('Warning: missing CSS file', f);
    continue;
  }
  css += readFileSync(p, 'utf8') + '\n';
  loaded++;
}

const result = await transform(css, { loader: 'css', minify: true });
const outPath = R('styles', 'bundle.css');
writeFileSync(outPath, result.code);
console.log(`bundle.css written (${(result.code.length / 1024).toFixed(1)} KB, ${loaded} files bundled)`);
