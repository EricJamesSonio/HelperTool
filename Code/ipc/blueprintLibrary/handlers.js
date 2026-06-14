const { ipcMain } = require('electron');
const { save } = require('../../database/db.js');
const { db } = require('./db.js');
const { SEED_CATEGORIES, SEED_BLUEPRINTS } = require('./seed.js');

function register() {
  // ── Category CRUD ──

  ipcMain.handle('blueprint:getCategories', () => {
    const rows = db().exec(`
      SELECT bc.id, bc.name, bc.type, bc.created_at,
             (SELECT COUNT(*) FROM blueprints b WHERE b.category_id = bc.id) AS blueprint_count
      FROM blueprint_categories bc ORDER BY bc.type, bc.name
    `);
    if (!rows.length) return [];
    return rows[0].values.map(r => ({
      id: r[0], name: r[1], type: r[2], createdAt: r[3], blueprintCount: r[4],
    }));
  });

  ipcMain.handle('blueprint:createCategory', (event, { name, type }) => {
    db().run('INSERT INTO blueprint_categories (name, type) VALUES (?, ?)', [name, type]);
    save();
    const res = db().exec('SELECT last_insert_rowid() AS id');
    return { id: res[0].values[0][0] };
  });

  ipcMain.handle('blueprint:renameCategory', (event, { id, name }) => {
    db().run('UPDATE blueprint_categories SET name = ? WHERE id = ?', [name, id]);
    save();
    return { success: true };
  });

  ipcMain.handle('blueprint:deleteCategory', (event, { id }) => {
    db().run('DELETE FROM blueprints WHERE category_id = ?', [id]);
    db().run('DELETE FROM blueprint_categories WHERE id = ?', [id]);
    save();
    return { success: true };
  });

  // ── Blueprint CRUD ──

  ipcMain.handle('blueprint:getByCategory', (event, { categoryId }) => {
    const rows = db().exec(
      'SELECT id, category_id, name, description, tags, created_at, updated_at FROM blueprints WHERE category_id = ? ORDER BY name',
      [categoryId]
    );
    if (!rows.length) return [];
    return rows[0].values.map(r => ({
      id: r[0], categoryId: r[1], name: r[2], description: r[3],
      tags: r[4], createdAt: r[5], updatedAt: r[6],
    }));
  });

  ipcMain.handle('blueprint:getOne', (event, { id }) => {
    const rows = db().exec('SELECT * FROM blueprints WHERE id = ?', [id]);
    if (!rows.length || !rows[0].values.length) return null;
    const r = rows[0].values[0];
    return {
      id: r[0], categoryId: r[1], name: r[2], description: r[3],
      pseudoCode: r[4], tags: r[5], createdAt: r[6], updatedAt: r[7],
    };
  });

  ipcMain.handle('blueprint:create', (event, { categoryId, name, description, pseudoCode, tags }) => {
    db().run(
      'INSERT INTO blueprints (category_id, name, description, pseudo_code, tags) VALUES (?, ?, ?, ?, ?)',
      [categoryId, name, description || '', pseudoCode, tags || '']
    );
    save();
    const res = db().exec('SELECT last_insert_rowid() AS id');
    return { id: res[0].values[0][0] };
  });

  ipcMain.handle('blueprint:update', (event, { id, name, description, pseudoCode, tags, categoryId }) => {
    db().run(
      'UPDATE blueprints SET name=?, description=?, pseudo_code=?, tags=?, category_id=?, updated_at=datetime(\'now\') WHERE id=?',
      [name, description || '', pseudoCode, tags || '', categoryId, id]
    );
    save();
    return { success: true };
  });

  ipcMain.handle('blueprint:delete', (event, { id }) => {
    db().run('DELETE FROM blueprints WHERE id = ?', [id]);
    save();
    return { success: true };
  });

  // ── Search ──

  ipcMain.handle('blueprint:search', (event, { query }) => {
    if (!query || !query.trim()) return [];
    const q = '%' + query.trim() + '%';
    const rows = db().exec(
      `SELECT b.id, b.name, b.description, b.tags, bc.name AS category_name, bc.type
       FROM blueprints b JOIN blueprint_categories bc ON b.category_id = bc.id
       WHERE b.name LIKE ? OR b.description LIKE ? OR b.tags LIKE ?
       ORDER BY b.name LIMIT 50`,
      [q, q, q]
    );
    if (!rows.length) return [];
    return rows[0].values.map(r => ({
      id: r[0], name: r[1], description: r[2], tags: r[3],
      categoryName: r[4], type: r[5],
    }));
  });

  // ── Seed ──

  ipcMain.handle('blueprint:seed', () => {
    const existingRows = db().exec('SELECT name FROM blueprint_categories');
    const existingNames = existingRows.length
      ? existingRows[0].values.map(r => r[0])
      : [];

    const catIdMap = {};
    let catCount = 0;
    let bpCount = 0;

    for (const cat of SEED_CATEGORIES) {
      if (existingNames.includes(cat.name)) {
        const row = db().exec('SELECT id FROM blueprint_categories WHERE name = ?', [cat.name]);
        if (row.length && row[0].values.length) catIdMap[cat.name] = row[0].values[0][0];
        continue;
      }
      db().run('INSERT INTO blueprint_categories (name, type) VALUES (?, ?)', [cat.name, cat.type]);
      const res = db().exec('SELECT last_insert_rowid() AS id');
      catIdMap[cat.name] = res[0].values[0][0];
      catCount++;

      const blueprints = SEED_BLUEPRINTS[cat.name] || [];
      for (const bp of blueprints) {
        db().run(
          'INSERT INTO blueprints (category_id, name, description, pseudo_code, tags) VALUES (?, ?, ?, ?, ?)',
          [catIdMap[cat.name], bp.name, bp.description, bp.pseudo_code, bp.tags]
        );
        bpCount++;
      }
    }

    if (catCount === 0 && bpCount === 0) {
      return { seeded: false, reason: 'Already seeded' };
    }

    save();
    return { seeded: true, categories: catCount, blueprints: bpCount };
  });
}

module.exports = { register };
