const state = {
  containers: [],
  images: [],
  stats: {},
  logs: {},
  activeTab: 'containers',
  selectedContainer: null,
  loading: false,
  error: null,
  connected: false,
};

const listeners = [];

function onChange(fn) {
  listeners.push(fn);
}

function set(k, v) {
  state[k] = v;
  listeners.forEach(fn => fn(k, v, state));
}

function get(k) {
  return state[k];
}

export { state, onChange, set, get };
