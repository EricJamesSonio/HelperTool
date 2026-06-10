export const state = {
  open: false,
  mode: localStorage.getItem('helpertool-branch-mode') || 'beginner',

  current: '',
  local: [],
  remote: [],

  graphBranch: null,
  graphPage: 1,
  graphCommits: [],

  createOpen: false,
  createPrefix: 'feature/',
  createName: '',

  mergeFlow: null,
  conflicts: [],
  selectedConflicts: [],
  activeConflictFile: null,

  loading: {
    branches: false,
    graph: false,
    merge: false,
    push: false,
    pull: false,
  },

  error: null,
  confirm: null,
};

export function setState(patch) {
  Object.assign(state, patch);
}
