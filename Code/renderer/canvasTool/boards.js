import * as state from './state.js';
import { resetView, setViewport, getViewport } from './engine.js';

const TEMPLATES = {
  blank: {
    name: 'Blank Canvas',
    elements: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  flowchart: {
    name: 'Flowchart',
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [
      { id: 't_1', type: 'rect', x: 300, y: 50, width: 160, height: 60, stroke: '#22d3ee', strokeWidth: 2, fill: 'rgba(34,211,238,0.08)', opacity: 1 },
      { id: 't_2', type: 'rect', x: 300, y: 180, width: 160, height: 60, stroke: '#60a5fa', strokeWidth: 2, fill: 'rgba(96,165,250,0.08)', opacity: 1 },
      { id: 't_3', type: 'rect', x: 200, y: 310, width: 100, height: 60, stroke: '#34d399', strokeWidth: 2, fill: 'rgba(52,211,153,0.08)', opacity: 1 },
      { id: 't_4', type: 'rect', x: 460, y: 310, width: 100, height: 60, stroke: '#f87171', strokeWidth: 2, fill: 'rgba(248,113,113,0.08)', opacity: 1 },
      { id: 't_5', type: 'rect', x: 300, y: 440, width: 160, height: 60, stroke: '#a78bfa', strokeWidth: 2, fill: 'rgba(167,139,250,0.08)', opacity: 1 },
      { id: 't_a1', type: 'arrow', start: { x: 380, y: 110 }, end: { x: 380, y: 180 }, stroke: '#556080', strokeWidth: 2, opacity: 0.6 },
      { id: 't_a2', type: 'arrow', start: { x: 380, y: 240 }, end: { x: 250, y: 310 }, stroke: '#556080', strokeWidth: 2, opacity: 0.6 },
      { id: 't_a3', type: 'arrow', start: { x: 380, y: 240 }, end: { x: 510, y: 310 }, stroke: '#556080', strokeWidth: 2, opacity: 0.6 },
      { id: 't_a4', type: 'arrow', start: { x: 250, y: 370 }, end: { x: 290, y: 440 }, stroke: '#556080', strokeWidth: 2, opacity: 0.6 },
      { id: 't_a5', type: 'arrow', start: { x: 510, y: 370 }, end: { x: 460, y: 440 }, stroke: '#556080', strokeWidth: 2, opacity: 0.6 },
    ],
  },
  mindmap: {
    name: 'Mind Map',
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [
      { id: 't_m1', type: 'ellipse', x: 300, y: 200, width: 160, height: 60, stroke: '#22d3ee', strokeWidth: 2, fill: 'rgba(34,211,238,0.1)', opacity: 1 },
      { id: 't_m2', type: 'line', start: { x: 300, y: 230 }, end: { x: 100, y: 100 }, stroke: '#556080', strokeWidth: 1.5, opacity: 0.5 },
      { id: 't_m3', type: 'line', start: { x: 380, y: 230 }, end: { x: 580, y: 100 }, stroke: '#556080', strokeWidth: 1.5, opacity: 0.5 },
      { id: 't_m4', type: 'line', start: { x: 340, y: 260 }, end: { x: 550, y: 350 }, stroke: '#556080', strokeWidth: 1.5, opacity: 0.5 },
      { id: 't_m5', type: 'line', start: { x: 340, y: 260 }, end: { x: 150, y: 400 }, stroke: '#556080', strokeWidth: 1.5, opacity: 0.5 },
      { id: 't_m6', type: 'rect', x: 50, y: 60, width: 100, height: 50, stroke: '#60a5fa', strokeWidth: 1.5, fill: 'rgba(96,165,250,0.06)', opacity: 1 },
      { id: 't_m7', type: 'rect', x: 540, y: 60, width: 100, height: 50, stroke: '#34d399', strokeWidth: 1.5, fill: 'rgba(52,211,153,0.06)', opacity: 1 },
      { id: 't_m8', type: 'rect', x: 500, y: 310, width: 120, height: 50, stroke: '#f87171', strokeWidth: 1.5, fill: 'rgba(248,113,113,0.06)', opacity: 1 },
      { id: 't_m9', type: 'rect', x: 80, y: 360, width: 120, height: 50, stroke: '#a78bfa', strokeWidth: 1.5, fill: 'rgba(167,139,250,0.06)', opacity: 1 },
    ],
  },
  arch: {
    name: 'Architecture Diagram',
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [
      { id: 't_a1', type: 'rect', x: 250, y: 30, width: 260, height: 50, stroke: '#22d3ee', strokeWidth: 2, fill: 'rgba(34,211,238,0.08)', opacity: 1 },
      { id: 't_a2', type: 'rect', x: 50, y: 140, width: 180, height: 80, stroke: '#60a5fa', strokeWidth: 2, fill: 'rgba(96,165,250,0.06)', opacity: 1 },
      { id: 't_a3', type: 'rect', x: 290, y: 140, width: 180, height: 80, stroke: '#34d399', strokeWidth: 2, fill: 'rgba(52,211,153,0.06)', opacity: 1 },
      { id: 't_a4', type: 'rect', x: 530, y: 140, width: 180, height: 80, stroke: '#f87171', strokeWidth: 2, fill: 'rgba(248,113,113,0.06)', opacity: 1 },
      { id: 't_a5', type: 'rect', x: 150, y: 280, width: 460, height: 60, stroke: '#a78bfa', strokeWidth: 2, fill: 'rgba(167,139,250,0.06)', opacity: 1 },
      { id: 't_l1', type: 'arrow', start: { x: 380, y: 80 }, end: { x: 140, y: 140 }, stroke: '#556080', strokeWidth: 1.5, opacity: 0.5 },
      { id: 't_l2', type: 'arrow', start: { x: 380, y: 80 }, end: { x: 380, y: 140 }, stroke: '#556080', strokeWidth: 1.5, opacity: 0.5 },
      { id: 't_l3', type: 'arrow', start: { x: 380, y: 80 }, end: { x: 620, y: 140 }, stroke: '#556080', strokeWidth: 1.5, opacity: 0.5 },
      { id: 't_l4', type: 'arrow', start: { x: 140, y: 220 }, end: { x: 250, y: 280 }, stroke: '#556080', strokeWidth: 1.5, opacity: 0.5 },
      { id: 't_l5', type: 'arrow', start: { x: 380, y: 220 }, end: { x: 380, y: 280 }, stroke: '#556080', strokeWidth: 1.5, opacity: 0.5 },
      { id: 't_l6', type: 'arrow', start: { x: 620, y: 220 }, end: { x: 510, y: 280 }, stroke: '#556080', strokeWidth: 1.5, opacity: 0.5 },
    ],
  },
};

let _autosaveTimer = null;
let _boardList = [];
let _currentBoardId = null;
let _dirty = false;

function getTemplateNames() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name }));
}

function createBoardData(templateId) {
  const tmpl = TEMPLATES[templateId] || TEMPLATES.blank;
  return {
    viewport: { ...tmpl.viewport },
    elements: JSON.parse(JSON.stringify(tmpl.elements)),
  };
}

async function createBoard(repoPath, name, templateId) {
  const boardData = createBoardData(templateId);
  const result = await window.electronAPI.canvas.createBoard(repoPath, name, boardData);
  if (result.success) {
    _currentBoardId = result.board.id;
    state.loadBoard(boardData, name);
    setViewport(boardData.viewport);
    _dirty = false;
    return result.board;
  }
  throw new Error(result.error || 'Failed to create board');
}

async function loadBoard(boardId) {
  const result = await window.electronAPI.canvas.loadBoard(boardId);
  if (!result.found) throw new Error('Board not found');
  const board = result.board;
  let parsed;
  try {
    parsed = typeof board.data === 'string' ? JSON.parse(board.data) : board.data;
  } catch {
    throw new Error('Invalid board data');
  }
  _currentBoardId = board.id;
  state.loadBoard(parsed, board.name);
  setViewport(parsed.viewport);
  _dirty = false;
  return board;
}

async function saveBoard() {
  if (!_currentBoardId) return;
  const st = state.getState();
  const vp = getViewport();
  const data = {
    viewport: vp,
    elements: st.elements,
  };
  const result = await window.electronAPI.canvas.saveBoard(_currentBoardId, data);
  if (result.success) {
    _dirty = false;
  }
  return result;
}

function markDirty() {
  if (_dirty) return;
  _dirty = true;
  scheduleAutosave();
}

function scheduleAutosave() {
  if (_autosaveTimer) clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(async () => {
    if (_dirty && _currentBoardId) {
      try {
        await saveBoard();
      } catch (err) {
        console.error('[Canvas] Autosave failed:', err);
      }
    }
    _autosaveTimer = null;
  }, 800);
}

async function listBoards(repoPath) {
  const result = await window.electronAPI.canvas.listBoards(repoPath);
  _boardList = result.boards || [];
  return _boardList;
}

async function deleteBoard(boardId) {
  const result = await window.electronAPI.canvas.deleteBoard(boardId);
  if (result.success && _currentBoardId === boardId) {
    _currentBoardId = null;
    state.resetState();
  }
  return result;
}

async function renameBoard(boardId, name) {
  return await window.electronAPI.canvas.renameBoard(boardId, name);
}

function getCurrentBoardId() {
  return _currentBoardId;
}

function isDirty() {
  return _dirty;
}

export {
  getTemplateNames, createBoard, loadBoard, saveBoard,
  listBoards, deleteBoard, renameBoard,
  getCurrentBoardId, isDirty, markDirty,
  TEMPLATES,
};
