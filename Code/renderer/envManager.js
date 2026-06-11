import { open as openModal } from './envManager/index.js';

export function openEnvManager(repoPath) {
  openModal(repoPath);
}
