const { ipcMain } = require('electron');
const { save } = require('../../database/db.js');
const { db } = require('./db.js');

const KIT_LEVELS = ['starter', 'medium', 'large'];

const ITEM_TYPES = [
  'database', 'backend', 'frontend', 'security', 'middleware',
  'modules', 'folder_structure', 'testing', 'ci_cd', 'monitoring',
  'logging', 'error_handling', 'validation', 'authentication',
  'authorization', 'caching', 'performance', 'responsive',
  'accessibility', 'seo', 'documentation', 'api', 'queue',
  'storage', 'networking', 'state_management', 'styling', 'forms',
];

function register() {
  ipcMain.handle('kit:getByCategory', (event, { categoryId }) => {
    if (!categoryId) return [];
    const rows = db().exec(
      'SELECT id, category_id, kit_level, item_type, name, description, sort_order, created_at FROM kit_items WHERE category_id = ? ORDER BY sort_order, id',
      [categoryId]
    );
    if (!rows.length) return [];
    const grouped = { starter: [], medium: [], large: [] };
    for (const r of rows[0].values) {
      const item = {
        id: r[0], categoryId: r[1], kitLevel: r[2],
        itemType: r[3], name: r[4], description: r[5],
        sortOrder: r[6], createdAt: r[7],
      };
      if (grouped[item.kitLevel]) grouped[item.kitLevel].push(item);
    }
    return grouped;
  });

  ipcMain.handle('kit:create', (event, { categoryId, kitLevel, itemType, name, description }) => {
    if (!KIT_LEVELS.includes(kitLevel)) throw new Error('Invalid kit level');
    const maxSort = db().exec(
      'SELECT COALESCE(MAX(sort_order), -1) FROM kit_items WHERE category_id = ? AND kit_level = ?',
      [categoryId, kitLevel]
    );
    const nextOrder = (maxSort.length && maxSort[0].values.length) ? maxSort[0].values[0][0] + 1 : 0;
    db().run(
      'INSERT INTO kit_items (category_id, kit_level, item_type, name, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [categoryId, kitLevel, itemType, name, description || '', nextOrder]
    );
    save();
    const res = db().exec('SELECT last_insert_rowid() AS id');
    return { id: res[0].values[0][0] };
  });

  ipcMain.handle('kit:update', (event, { id, itemType, name, description }) => {
    db().run(
      'UPDATE kit_items SET item_type=?, name=?, description=? WHERE id=?',
      [itemType, name, description || '', id]
    );
    save();
    return { success: true };
  });

  ipcMain.handle('kit:delete', (event, { id }) => {
    db().run('DELETE FROM kit_items WHERE id = ?', [id]);
    save();
    return { success: true };
  });

  ipcMain.handle('kit:reorder', (event, { categoryId, kitLevel, orderedIds }) => {
    if (!KIT_LEVELS.includes(kitLevel)) throw new Error('Invalid kit level');
    for (let i = 0; i < orderedIds.length; i++) {
      db().run(
        'UPDATE kit_items SET sort_order = ? WHERE id = ? AND category_id = ? AND kit_level = ?',
        [i, orderedIds[i], categoryId, kitLevel]
      );
    }
    save();
    return { success: true };
  });

  ipcMain.handle('kit:getTypes', () => ITEM_TYPES);
}

module.exports = { register, KIT_LEVELS, ITEM_TYPES };
