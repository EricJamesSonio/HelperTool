const STORAGE_KEY = 'helpertool-harness-loops';

function _loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { loops: [], activeLoopId: null };
}

function _saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      loops: state.loops,
      activeLoopId: state.activeLoopId,
    }));
  } catch (_) {}
}

function _uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const _stored = _loadFromStorage();

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
  loops: _stored.loops,
  activeLoopId: _stored.activeLoopId,
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

export function loadConfigFromLoop(loop) {
  if (!loop) return;
  state.config.prompt = loop.config.prompt;
  state.config.validationType = loop.config.validationType;
  state.config.keyword = loop.config.keyword || '';
  state.config.pattern = loop.config.pattern || '';
  state.config.maxRetries = loop.config.maxRetries;
  state.config.testCommand = loop.config.testCommand || '';
}

export function getLoops() {
  return state.loops;
}

export function getActiveLoop() {
  if (!state.activeLoopId) return null;
  return state.loops.find(l => l.id === state.activeLoopId) || null;
}

export function setActiveLoop(id) {
  state.activeLoopId = id;
  _saveToStorage();
  const loop = getActiveLoop();
  if (loop) loadConfigFromLoop(loop);
}

export function createLoop(name, config) {
  const loop = {
    id: _uuid(),
    name: name.trim() || 'Untitled Loop',
    config: config ? { ...config } : { ...state.config },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.loops.push(loop);
  _saveToStorage();
  return loop;
}

export function updateLoop(id, updates) {
  const loop = state.loops.find(l => l.id === id);
  if (!loop) return null;
  if (updates.name) loop.name = updates.name;
  if (updates.config) Object.assign(loop.config, updates.config);
  loop.updatedAt = Date.now();
  _saveToStorage();
  return loop;
}

export function deleteLoop(id) {
  state.loops = state.loops.filter(l => l.id !== id);
  if (state.activeLoopId === id) state.activeLoopId = null;
  _saveToStorage();
}
