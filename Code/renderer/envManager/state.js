export const state = {
  open: false,
  repoPath: null,
  sections: [],
};

export function setState(patch) {
  Object.assign(state, patch);
}
