/**
 * sidebarManager.js
 * Single responsibility: sidebar expand/collapse/pin behaviour
 * and populating the tools list items.
 */

import { getFeatures } from '../featureManager.js';

const TOOL_FEATURE = {
  api: 'apiTool',
  prompt: 'promptTool',
  git: 'gitTool',
  fileSeeder: 'fileSeeder',
  video: 'videoTool',
  gmail: 'gmailTool',
  automation: 'automationSketch',
  github: 'githubExplorer',
  loc: 'locDetector',
  secret: 'secretHolder',
  ecosystemWatcher: 'ecosystemWatcher',
  performanceTracker: 'performanceTracker',
  harness: 'harnessTool',
  workspace: 'workspaceTool',
  terminal: 'terminalTool',
  port: 'portManagerTool',
  team: 'teamActivityTool',
  blueprint: 'blueprintLibraryTool',
  profile: 'profileTool',
  docker: 'dockerTool',
  essentials: 'essentialsGlossary',
  symbolIndex: 'symbolIndex',
  canvas: 'canvasTool',
  db: 'dbInspector',
  codebbaseChat: 'codebbaseChat',
  codebaseMap: 'codebaseMap',
  env: 'envManager',
  layout: 'uiLayoutHelper',
  graphify: 'graphify',
  mcp: 'mcp',
  projectInspector: 'projectInspector',
  opencode: 'codeswampChat',
  globalSeeder: 'globalSeeder',
  researcher: 'researcherTool',
  flow: 'flowTool',
};

function isToolEnabled(toolKey) {
  const featureId = TOOL_FEATURE[toolKey];
  if (!featureId) return true;
  try {
    return getFeatures()[featureId] !== false;
  } catch (_) {
    return true;
  }
}

export function initSidebar() {
  const sidebar = document.getElementById('toolsSidebar');
  if (!sidebar) return;

  sidebar.addEventListener('mouseenter', () => {
    if (!sidebar.classList.contains('pinned')) sidebar.classList.add('expanded');
  });

  sidebar.addEventListener('mouseleave', () => {
    if (!sidebar.classList.contains('pinned')) sidebar.classList.remove('expanded');
  });

  const pinBtn = document.getElementById('sidebarPinBtn');
  if (pinBtn) {
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pinned = sidebar.classList.toggle('pinned');
      if (pinned) {
        sidebar.classList.add('expanded');
        pinBtn.title = 'Unpin sidebar';
      } else {
        sidebar.classList.remove('expanded');
        pinBtn.title = 'Pin sidebar open';
      }
    });
  }
}

export function createSidebarItem(icon, name, desc, onClick, toolKey) {
  const el = document.createElement('button');
  el.className = 'tools-sidebar-item';
  if (toolKey) el.setAttribute('data-tool', toolKey);
  el.innerHTML =
    '<span class="tools-sidebar-item-icon">' + icon + '</span>' +
    '<div class="tools-sidebar-item-info">' +
      '<span class="tools-sidebar-item-name">' + name + '</span>' +
      '<span class="tools-sidebar-item-desc">' + desc + '</span>' +
    '</div>';
  el.addEventListener('click', onClick);
  if (!isToolEnabled(toolKey)) {
    el.hidden = true;
    el.style.display = 'none';
  }
  return el;
}