const state = {
  query:       '',
  results:     [],
  files:       [],
  explanation: '',
  loading:     false,
  error:       null,
  port:        3333,
  serverStatus: 'stopped',
  serverInfo:   null,
  endpoints:    null,
  // Knowledge-graph state
  activeTab:      'search',
  graphData:      null,
  graphStats:     null,
  graphReport:    null,
  graphCommunities: null,
  graphLoading:   false,
  graphError:     null,
  // Query tools state
  nodeSearchQuery: '',
  nodeSearchResults: [],
  pathFrom: '',
  pathTo: '',
  pathResult: null,
  explainNodeId: '',
  explainDepth: 1,
  explainResult: null,
  affectedNodeId: '',
  affectedDepth: 1,
  affectedResult: null,
  // AI-enrichment state
  exportStatus: null,
  exportError: null,
  exportLoading: false,
  aiGraphData: null,
  aiGraphReport: '',
  aiGraphLoading: false,
  aiGraphError: null,
  // Repo status (idle-hero wizard)
  repoStatus: null,
  symbolsInfo: null,
  promptExists: false,
  graphInfo: null,
  graphHasData: false,
  statusLoading: false,
};

const _listeners = new Set();

function getState() {
  return { ...state, results: [...state.results], files: [...state.files] };
}

function setState(patch) {
  Object.assign(state, patch);
  _notify();
}

function _notify() {
  for (const fn of _listeners) fn(getState());
}

function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export { getState, setState, subscribe };
