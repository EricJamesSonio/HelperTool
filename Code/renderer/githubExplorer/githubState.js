const state = {
  view: 'input',
  url: '',
  token: '',
  repoName: '',
  branch: '',
  description: '',
  tree: [],
  builtTree: null,
  selectedPaths: new Set(),
  searchQuery: '',
  expandedPaths: new Set(),
  loading: false,
  error: null,
  totalFiles: 0,
  truncated: false,
  recent: [],
};

export default state;
