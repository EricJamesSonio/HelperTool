const state = {
  config: {
    prompt: '',
    validationType: 'json',
    keyword: '',
    pattern: '',
    maxRetries: 3,
    testCommand: '',
  },
  isRunning: false,
  logs: [],
  results: [],
  finalResult: null,
};

export function getState() {
  return state;
}

export function resetState() {
  state.logs = [];
  state.results = [];
  state.finalResult = null;
  state.isRunning = false;
}

export function addLog(attempt, message) {
  state.logs.push({ attempt, content: message });
}

export function addResult(attempt, passed, reason) {
  state.results.push({ attempt, passed, reason });
}

export function setFinal(data) {
  state.finalResult = data;
  state.isRunning = false;
}

export function setRunning(running) {
  state.isRunning = running;
}

export function updateConfig(partial) {
  Object.assign(state.config, partial);
}
