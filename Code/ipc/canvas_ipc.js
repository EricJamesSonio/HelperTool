const { ipcMain } = require('electron');
const crypto = require('crypto');
const db = require('../database/db');

function register() {
  ipcMain.handle('canvas:listBoards', (_, repoPath) => {
    try {
      const d = db.getDb();
      const results = d.exec(
        'SELECT id, name, updated_at FROM boards WHERE repo_path = ? ORDER BY updated_at DESC',
        [repoPath]
      );
      const boards = results.length > 0 ? results[0].values.map(r => ({
        id: r[0], name: r[1], updated_at: r[2],
      })) : [];
      return { boards };
    } catch (err) {
      return { boards: [], error: err.message };
    }
  });

  ipcMain.handle('canvas:createBoard', (_, repoPath, name, boardData) => {
    try {
      const d = db.getDb();
      const id = 'board_' + crypto.randomUUID().slice(0, 8);
      const now = new Date().toISOString();
      const data = JSON.stringify(boardData || { viewport: { x: 0, y: 0, zoom: 1 }, elements: [] });
      d.run(
        'INSERT INTO boards (id, repo_path, name, data, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, repoPath || '', name || 'Untitled', data, now]
      );
      db.save();
      return { success: true, board: { id, name, data, updated_at: now } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('canvas:saveBoard', (_, boardId, data) => {
    try {
      const d = db.getDb();
      const now = new Date().toISOString();
      d.run(
        'UPDATE boards SET data = ?, updated_at = ? WHERE id = ?',
        [typeof data === 'string' ? data : JSON.stringify(data), now, boardId]
      );
      db.save();
      return { success: true, updated_at: now };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('canvas:loadBoard', (_, boardId) => {
    try {
      const d = db.getDb();
      const results = d.exec('SELECT * FROM boards WHERE id = ?', [boardId]);
      if (results.length === 0 || results[0].values.length === 0) {
        return { found: false };
      }
      const row = results[0].values[0];
      const board = {
        id: row[0], repo_path: row[1], name: row[2],
        data: row[3], updated_at: row[4],
      };
      return { found: true, board };
    } catch (err) {
      return { found: false, error: err.message };
    }
  });

  ipcMain.handle('canvas:deleteBoard', (_, boardId) => {
    try {
      const d = db.getDb();
      d.run('DELETE FROM boards WHERE id = ?', [boardId]);
      db.save();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('canvas:renameBoard', (_, boardId, name) => {
    try {
      const d = db.getDb();
      d.run('UPDATE boards SET name = ?, updated_at = ? WHERE id = ?',
        [name, new Date().toISOString(), boardId]);
      db.save();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
