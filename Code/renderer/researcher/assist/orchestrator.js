// Wires the assist orchestrator to the real app: repo state, file tree,
// generate IPC, Global Seeder parser and dry-run IPC.

import { state as appState } from '../../app_manager/appState.js';
import { getFlatList } from '../../searchManager.js';
import { parseContentBlocks } from '../../globalSeeder/parser.js';
import { createOrchestrator } from './orchestratorCore.js';

async function tempFile(name) {
  const res = await window.electronAPI.researcher.tempFile(name);
  if (!res || !res.filePath) throw new Error((res && res.error) || 'No temp file path available.');
  return res.filePath;
}

const orchestrator = createOrchestrator({
  getRepoPath: () => appState.selectedRepoPath || null,
  getFlatList: () => getFlatList() || [],
  generate: (actionType, repoPath, items, filePath, minify, promptText) =>
    window.electronAPI.generate(actionType, repoPath, items, filePath, minify, promptText),
  tempFile,
  previewContent: (repoPath, entries) => window.electronAPI.fileSeeder.previewContent(repoPath, entries),
  parseContentBlocks,
});

export const handleReply = orchestrator.handleReply;
export const getSession = orchestrator.getSession;
export const resetSession = orchestrator.resetSession;