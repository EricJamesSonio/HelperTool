/**
 * renderer/graphify/graphifyState.js
 * Simple observable state — matches the pattern used by codeswampUI/state.js.
 */

const state = {
  query:       '',
  results:     [],   // [{ file: string, score: number }]
  files:       [],   // string[] — just the paths, for easy iteration
  explanation: '',
  loading:     false,
  error:       null,
  port:        3333,
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
  return () => _listeners.delete(fn); // returns unsubscribe
}

export { getState, setState, subscribe };