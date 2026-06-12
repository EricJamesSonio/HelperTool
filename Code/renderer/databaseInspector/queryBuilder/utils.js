import { state } from './state.js';

function isNumeric(v) {
  if (v === '' || v === null || v === undefined) return false;
  if (typeof v === 'number') return true;
  return !isNaN(Number(v));
}

export function quoteId(name) {
  if (!name) return name;
  if (state.dbType === 'mysql') {
    return '`' + name.replace(/`/g, '``') + '`';
  }
  return '"' + name.replace(/"/g, '""') + '"';
}

export function buildSqlQuery(type, table, columns, form, conditions, range) {
  const escVal = (v) => {
    if (v === '' || v === null || v === undefined) return 'NULL';
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'number') return String(v);
    if (!isNaN(Number(v)) && v !== '') return v;
    return `'${String(v).replace(/'/g, "''")}'`;
  };

  const t = quoteId(table);

  switch (type) {
    case 'GET_ALL':
      return `SELECT * FROM ${t} LIMIT 100`;

    case 'GET_WHERE': {
      if (!conditions.column || !conditions.value) return `SELECT * FROM ${t} LIMIT 100`;
      const val = escVal(conditions.value);
      return `SELECT * FROM ${t} WHERE ${quoteId(conditions.column)} ${conditions.operator} ${val} LIMIT 100`;
    }

    case 'GET_RANGE': {
      const from = parseInt(range.from) || 0;
      const to = parseInt(range.to) || 100;
      const limit = to - from;
      const orderCol = form.orderBy || (columns[0] && columns[0].name) || '1';
      const orderBy = orderCol === '1' ? '1' : quoteId(orderCol);
      return `SELECT * FROM ${t} ORDER BY ${orderBy} LIMIT ${Math.max(0, limit)} OFFSET ${Math.max(0, from)}`;
    }

    case 'GET_COLUMNS': {
      const cols = form.selectedColumns && form.selectedColumns.length > 0
        ? form.selectedColumns.map(quoteId).join(', ')
        : '*';
      return `SELECT ${cols} FROM ${t} LIMIT 100`;
    }

    case 'COUNT':
      return `SELECT COUNT(*) FROM ${t}`;

    case 'INSERT': {
      const formCols = Object.keys(form).filter(k => form[k] !== '' && form[k] !== null && form[k] !== undefined);
      const vals = formCols.map(c => escVal(form[c]));
      return `INSERT INTO ${t} (${formCols.map(quoteId).join(', ')}) VALUES (${vals.join(', ')})`;
    }

    case 'UPDATE': {
      const setCols = Object.keys(form.set || {}).filter(k => form.set[k] !== '' && form.set[k] !== null && form.set[k] !== undefined);
      if (setCols.length === 0 || !conditions.column || !conditions.value) return `UPDATE ${t} SET ... WHERE ...`;
      const setClause = setCols.map(c => `${quoteId(c)} = ${escVal(form.set[c])}`).join(', ');
      const wVal = escVal(conditions.value);
      return `UPDATE ${t} SET ${setClause} WHERE ${quoteId(conditions.column)} ${conditions.operator} ${wVal}`;
    }

    case 'DELETE': {
      if (!conditions.column || !conditions.value) return `DELETE FROM ${t} WHERE ...`;
      const wVal = escVal(conditions.value);
      return `DELETE FROM ${t} WHERE ${quoteId(conditions.column)} ${conditions.operator} ${wVal}`;
    }

    default:
      return '';
  }
}

export function buildMongoQuery(type, collection, form, conditions) {
  const mVal = (v) => isNumeric(v) ? Number(v) : v;

  switch (type) {
    case 'FIND_ALL':
      return JSON.stringify({ collection, method: 'find', filter: {} });

    case 'FIND_WHERE': {
      const op = conditions.operator || '$eq';
      const val = mVal(conditions.value);
      const filter = op === '$eq'
        ? { [conditions.column]: val }
        : { [conditions.column]: { [op]: val } };
      return JSON.stringify({ collection, method: 'find', filter });
    }

    case 'COUNT':
      return JSON.stringify({ collection, method: 'countDocuments', filter: {} });

    case 'INSERT_ONE': {
      const doc = {};
      for (const [key, val] of Object.entries(form)) {
        if (val !== '' && val !== null && val !== undefined) {
          doc[key] = mVal(val);
        }
      }
      return JSON.stringify({ collection, method: 'insertOne', document: doc });
    }

    case 'UPDATE_ONE': {
      const filter = { [conditions.column]: mVal(conditions.value) };
      const update = { $set: {} };
      for (const [key, val] of Object.entries(form.set || {})) {
        if (val !== '' && val !== null && val !== undefined) {
          update.$set[key] = mVal(val);
        }
      }
      return JSON.stringify({ collection, method: 'updateOne', filter, update });
    }

    case 'DELETE_ONE': {
      const filter = { [conditions.column]: mVal(conditions.value) };
      return JSON.stringify({ collection, method: 'deleteOne', filter });
    }

    default:
      return '';
  }
}

export function buildQueryPreview(type, table, columns, form, conditions, range, dbType) {
  if (dbType === 'mongodb') {
    const mongoDisplay = buildMongoQueryPreview(type, table, form, conditions);
    return mongoDisplay;
  }
  return buildSqlQuery(type, table, columns, form, conditions, range);
}

function buildMongoQueryPreview(type, collection, form, conditions) {
  const dv = (v) => isNumeric(v) ? v : `"${v}"`;

  switch (type) {
    case 'FIND_ALL':
      return `db.${collection}.find({}).limit(100)`;

    case 'FIND_WHERE': {
      const op = conditions.operator || '$eq';
      const val = dv(conditions.value);
      if (op === '$eq') {
        return `db.${collection}.find({ "${conditions.column}": ${val} })`;
      }
      return `db.${collection}.find({ "${conditions.column}": { "${op}": ${val} } })`;
    }

    case 'COUNT':
      return `db.${collection}.countDocuments({})`;

    case 'INSERT_ONE': {
      const fields = Object.entries(form).filter(([, v]) => v !== '' && v !== null && v !== undefined);
      const pairs = fields.map(([k, v]) => {
        const val = isNumeric(v) ? v : `"${v}"`;
        return `"${k}": ${val}`;
      });
      return `db.${collection}.insertOne({ ${pairs.join(', ')} })`;
    }

    case 'UPDATE_ONE': {
      const setFields = Object.entries(form.set || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
      const setPairs = setFields.map(([k, v]) => {
        const val = isNumeric(v) ? v : `"${v}"`;
        return `"${k}": ${val}`;
      });
      return `db.${collection}.updateOne(\n  { "${conditions.column}": "${conditions.value}" },\n  { $set: { ${setPairs.join(', ')} } }\n)`;
    }

    case 'DELETE_ONE':
      return `db.${collection}.deleteOne({ "${conditions.column}": "${conditions.value}" })`;

    default:
      return '';
  }
}

export function highlightSql(sql) {
  const keywords = /\b(SELECT|FROM|WHERE|INSERT INTO|VALUES|UPDATE|SET|DELETE|LIMIT|OFFSET|ORDER BY|COUNT|AND|OR|NOT|IN|LIKE|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP BY|HAVING|DISTINCT|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|IS|NULL|TRUE|FALSE|PRIMARY KEY|FOREIGN KEY|REFERENCES|INDEX|UNIQUE|ASC|DESC|CREATE|TABLE|DROP|ALTER|ADD|COLUMN)\b/gi;
  return sql.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(keywords, m => `<span class="qb-keyword">${m}</span>`);
}

export function highlightMongo(queryStr) {
  const keywords = /\b(db|find|insertOne|updateOne|deleteOne|countDocuments|aggregate|limit|sort|filter|project|map|set|where|and|or|nor|not|eq|ne|gt|gte|lt|lte|in|nin|regex|exists|type|text|search)\b/gi;
  return queryStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(keywords, m => `<span class="qb-keyword">${m}</span>`).replace(/"(\w+)":/g, '<span class="qb-field">"$1":</span>');
}
