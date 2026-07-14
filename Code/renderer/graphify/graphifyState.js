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
  // Endpoint testing
  endpointTests: {},
  expandedEndpoint: null,
  endpointResultKey: null,
  // Repo status (idle-hero wizard)
  repoStatus: null,
  symbolsInfo: null,
  promptExists: false,
  promptType: null,
  pendingChanges: null,
  graphInfo: null,
  graphHasData: false,
  statusLoading: false,
  indexLoading: false,
  // Changes tab state
  changesLoading: false,
  changesError: null,
  changesDetected: null,
  incrementalPromptPath: null,
  incrementalPromptReady: false,
  incrementalPromptText: '',
  graphSyncStatus: null,
  graphSyncLoading: false,
  changesTabStep: 'idle', // idle | changes_detected | prompt_ready | synced | out_of_sync
  changedFileList: null, // { modified: [...], added: [...] }
};

const _listeners = new Set();
let _pending = null;
let _scheduled = false;

function getState() {
  return { ...state, results: [...state.results], files: [...state.files] };
}

function _flush() {
  if (!_pending) return;
  const patch = _pending;
  _pending = null;
  _scheduled = false;
  Object.assign(state, patch);
  for (const fn of _listeners) fn(getState());
}

function setState(patch) {
  if (_pending) {
    Object.assign(_pending, patch);
  } else {
    _pending = { ...patch };
  }
  if (!_scheduled) {
    _scheduled = true;
    queueMicrotask(_flush);
  }
}

function setStateSync(patch) {
  _flush();
  Object.assign(state, patch);
  for (const fn of _listeners) fn(getState());
}

function _notify() {
  for (const fn of _listeners) fn(getState());
}

function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export { getState, setState, setStateSync, subscribe };
