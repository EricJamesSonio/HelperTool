import * as diffViewer from './diffViewer.js';

export function isOpen() {
  return diffViewer.isOpen();
}

export function open(filePath, repoPath) {
  diffViewer.open(filePath, repoPath, { viewMode: true, showContent: true });
}

export function close() {
  diffViewer.close();
}
