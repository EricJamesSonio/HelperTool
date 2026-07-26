const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STYLES_DIR = path.join(__dirname, '..', 'renderer', 'styles');
const BUNDLE_PATH = path.join(STYLES_DIR, 'bundle.css');

// Order matters: critical/core first, then tools
const CSS_ORDER = [
  'base.css',
  'shared-components.css',
  'layout-chrome.css',
  'layout-tree.css',
  'ignore-panel.css',
  'secret-holder.css',
  'note-mode.css',
  'settings.css',
  'session-notes.css',
  'api-tool.css',
  'minified.css',
  'prompt-tool.css',
  'root-jumper.css',
  'workspaceTool.css',
  'git-tool.css',
  'branch-manager.css',
  'env-manager.css',
  'shortcuts.css',
  'symbol-index.css',
  'dependencies.css',
  'canvas-tool.css',
  'file-seeder.css',
  'loc-detector.css',
  'terminal.css',
  'port-manager.css',
  'database-inspector.css',
  'diff-viewer.css',
  'docignore-manager.css',
  'team-activity.css',
  'blueprint-library.css',
  'profile.css',
  'essentials-glossary.css',
  'docker-tool.css',
  'query-builder.css',
  'service-tracker.css',
  'codebase-chat.css',
  'video-tool.css',
  'gmail-tool.css',
  'automation-sketch.css',
  'github-explorer.css',
  'codeswamp-ui.css',
  'codebase-map.css',
  'ui-layout-helper.css',
  'graphify.css',
  'codebase-manager.css',
  'error-cop.css',
  'ecosystem-watcher.css',
  'researcher.css',
  'mcp.css',
];

let combined = '';
for (const file of CSS_ORDER) {
  const filePath = path.join(STYLES_DIR, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf-8');
    // Remove @charset and @import statements (not needed in bundle)
    content = content.replace(/@charset[^;]+;/g, '');
    content = content.replace(/@import[^;]+;/g, '');
    combined += `/* ${file} */\n${content}\n\n`;
  } else {
    console.warn(`[build-css] WARNING: ${file} not found, skipping`);
  }
}

fs.writeFileSync(BUNDLE_PATH, combined, 'utf-8');
console.log(`[build-css] Bundle written: ${BUNDLE_PATH} (${(combined.length / 1024).toFixed(0)}KB)`);
