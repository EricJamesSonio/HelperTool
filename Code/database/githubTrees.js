const { getDb, save } = require('./db');

function saveTree({ repo_url, repo_name, branch, description, total_files, truncated, tree_data }) {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO github_repo_trees (repo_url, repo_name, branch, description, total_files, truncated, tree_data, saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [repo_url, repo_name, branch || 'main', description || '', total_files || 0, truncated ? 1 : 0, JSON.stringify(tree_data)]
  );
  save();
}

function listTrees() {
  const db = getDb();
  const rows = db.exec(
    `SELECT id, repo_url, repo_name, branch, description, total_files, truncated, saved_at
     FROM github_repo_trees
     ORDER BY saved_at DESC`
  );
  return rows.length > 0
    ? rows[0].values.map(row => ({
        id: row[0],
        repo_url: row[1],
        repo_name: row[2],
        branch: row[3],
        description: row[4],
        total_files: row[5],
        truncated: row[6] === 1,
        saved_at: row[7],
      }))
    : [];
}

function getTree(repo_url) {
  const db = getDb();
  const rows = db.exec(
    `SELECT repo_url, repo_name, branch, description, total_files, truncated, tree_data
     FROM github_repo_trees
     WHERE repo_url = ?`,
    [repo_url]
  );
  if (rows.length === 0 || rows[0].values.length === 0) return null;
  const row = rows[0].values[0];
  return {
    repo_url: row[0],
    repo_name: row[1],
    branch: row[2],
    description: row[3],
    total_files: row[4],
    truncated: row[5] === 1,
    tree: JSON.parse(row[6]),
  };
}

function deleteTree(repo_url) {
  const db = getDb();
  db.run('DELETE FROM github_repo_trees WHERE repo_url = ?', [repo_url]);
  save();
}

module.exports = { saveTree, listTrees, getTree, deleteTree };
