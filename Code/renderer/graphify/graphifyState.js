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
