const MAX_UNDO = 50;

const defaultState = {
  activeTool: 'select',
  color: '#ffffff',
  strokeWidth: 2,
  fillColor: 'transparent',
  opacity: 1,
  elements: [],
  selectedIds: [],
  currentBoard: null,
};

let _state = { ...defaultState };
let _undoStack = [];
let _redoStack = [];
let _onChangeCallback = null;

function getState() {
  return _state;
}

function setState(partial) {
  Object.assign(_state, partial);
}

function pushUndo() {
  _redoStack = [];
  _undoStack.push(JSON.stringify(_state.elements));
  if (_undoStack.length > MAX_UNDO) _undoStack.shift();
}

function undo() {
  if (_undoStack.length === 0) return false;
  _redoStack.push(JSON.stringify(_state.elements));
  const prev = JSON.parse(_undoStack.pop());
  _state.elements = prev;
  _state.selectedIds = [];
  if (_onChangeCallback) _onChangeCallback(_state);
  return true;
}

function redo() {
  if (_redoStack.length === 0) return false;
  _undoStack.push(JSON.stringify(_state.elements));
  const next = JSON.parse(_redoStack.pop());
  _state.elements = next;
  _state.selectedIds = [];
  if (_onChangeCallback) _onChangeCallback(_state);
  return true;
}

function pushAndApply(action) {
  pushUndo();
  action();
  if (_onChangeCallback) _onChangeCallback(_state);
}

function addElement(el) {
  pushUndo();
  _state.elements.push(el);
  if (_onChangeCallback) _onChangeCallback(_state);
}

function updateElement(id, partial) {
  const idx = _state.elements.findIndex(e => e.id === id);
  if (idx === -1) return;
  Object.assign(_state.elements[idx], partial);
  if (_onChangeCallback) _onChangeCallback(_state);
}

function removeSelected() {
  if (_state.selectedIds.length === 0) return;
  pushUndo();
  _state.elements = _state.elements.filter(e => !_state.selectedIds.includes(e.id));
  _state.selectedIds = [];
  if (_onChangeCallback) _onChangeCallback(_state);
}

function clear() {
  pushUndo();
  _state.elements = [];
  _state.selectedIds = [];
  if (_onChangeCallback) _onChangeCallback(_state);
}

function loadBoard(boardData, boardName) {
  _state.elements = boardData.elements || [];
  _state.selectedIds = [];
  _state.currentBoard = { name: boardName || null };
  if (boardData.viewport) {
    _state.viewport = boardData.viewport;
  }
  _undoStack = [];
  _redoStack = [];
  if (_onChangeCallback) _onChangeCallback(_state);
}

function resetState() {
  _state = { ...defaultState, viewport: _state.viewport };
  _undoStack = [];
  _redoStack = [];
}

function onChange(callback) {
  _onChangeCallback = callback;
}

function canUndo() { return _undoStack.length > 0; }
function canRedo() { return _redoStack.length > 0; }

export {
  getState, setState, addElement, updateElement,
  removeSelected, clear, loadBoard, resetState,
  onChange, undo, redo, canUndo, canRedo,
  pushUndo, pushAndApply,
};
