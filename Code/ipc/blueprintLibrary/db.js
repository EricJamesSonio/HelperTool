const { getDb } = require('../../database/db.js');

function db() { return getDb(); }

module.exports = { db };
