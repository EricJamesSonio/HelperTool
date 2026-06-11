export const state = {
  open: false,
  repoPath: null,
  files: [],
  activeFile: null,
  entries: [],
  dirty: false,
  creating: false,
  loading: false,
  error: null,
  searchQuery: '',
};

export function setState(patch) {
  Object.assign(state, patch);
}
