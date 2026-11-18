'use strict';

const TOP_SLICES = 6;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function pad(n) {
  return String(n).padStart(2, '0');
}

function localDate(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDate(d);
}

function rangeStart(range) {
  const span = { week: 7, month: 30, year: 365 }[range];
  return span ? daysAgo(span - 1) : '';
}

function allRows(db, sql, params) {
  const stmt = db.prepare(sql);
  try {
    if (params && params.length) stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.get());
    return out;
  } finally {
    stmt.free();
  }
}

function withOther(items, top) {
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= top) return sorted;
  const head = sorted.slice(0, top);
  const rest = sorted.slice(top).reduce((sum, i) => sum + i.value, 0);
  head.push({ label: 'Other', value: rest });
  return head;
}

function makeQueries(db) {
  function dateFilter(range) {
    const start = rangeStart(range);
    if (!start) return { where: '', params: [] };
    return { where: ' WHERE date >= ?', params: [start] };
  }

  function getStats(range) {
    const f = dateFilter(range);
    const rows = allRows(
      db,
      'SELECT COALESCE(SUM(commits), 0), COALESCE(SUM(files_touched), 0), COALESCE(SUM(file_saves), 0), ' +
        'COUNT(DISTINCT CASE WHEN commits > 0 OR file_saves > 0 THEN repo_path END) FROM activity_days' + f.where,
      f.params
    );
    const r = rows[0] || [0, 0, 0, 0];
    return { commits: r[0] || 0, files: r[1] || 0, saves: r[2] || 0, repos: r[3] || 0 };
  }

  function getHeatmap(year) {
    const y = Number(year) || new Date().getFullYear();
    const rows = allRows(
      db,
      'SELECT date, SUM(commits + file_saves), SUM(commits), SUM(file_saves), SUM(files_touched) ' +
        'FROM activity_days WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date',
      [y + '-01-01', y + '-12-31']
    );
    const map = {};
    for (const r of rows) {
      map[r[0]] = { total: r[1] || 0, commits: r[2] || 0, saves: r[3] || 0, files: r[4] || 0 };
    }
    return map;
  }

  function getDonutData(range) {
    const f = dateFilter(range);

    const repoRows = allRows(
      db,
      'SELECT repo_name, SUM(commits + file_saves) FROM activity_days' + f.where + ' GROUP BY repo_path',
      f.params
    );
    const repo = withOther(repoRows.map((r) => ({ label: r[0], value: r[1] || 0 })), TOP_SLICES);

    let extRows = [];
    try {
      extRows = allRows(db, 'SELECT ext, SUM(saves) FROM activity_ext_days' + f.where + ' GROUP BY ext', f.params);
    } catch (_) {
      extRows = [];
    }
    const ext = withOther(extRows.map((r) => ({ label: r[0] || '(none)', value: r[1] || 0 })), TOP_SLICES);

    const dayRows = allRows(
      db,
      "SELECT CAST(strftime('%w', date) AS INTEGER), SUM(commits + file_saves) FROM activity_days" + f.where + ' GROUP BY 1',
      f.params
    );
    const byDay = new Map(dayRows.map((r) => [r[0], r[1] || 0]));
    const weekday = WEEK_ORDER.map((i) => ({ label: WEEKDAYS[i], value: byDay.get(i) || 0 }));

    return { repo, ext, weekday };
  }

  function getHistory(page, filter) {
    const pageSize = 20;
    const p = Math.max(1, Number(page) || 1);
    const conds = ['(commits > 0 OR file_saves > 0 OR files_touched > 0)'];
    const params = [];
    const text = String(filter || '').trim();
    if (text) {
      conds.push('repo_name LIKE ?');
      params.push('%' + text + '%');
    }
    const where = ' WHERE ' + conds.join(' AND ');
    const totalRows = allRows(db, 'SELECT COUNT(*) FROM activity_days' + where, params);
    const total = totalRows[0] ? totalRows[0][0] : 0;
    const rows = allRows(
      db,
      'SELECT date, repo_name, repo_path, commits, files_touched, file_saves FROM activity_days' + where +
        ' ORDER BY date DESC, (commits + file_saves) DESC LIMIT ? OFFSET ?',
      params.concat([pageSize, (p - 1) * pageSize])
    );
    return {
      items: rows.map((r) => ({
        date: r[0],
        repoName: r[1],
        repoPath: r[2],
        commits: r[3] || 0,
        files: r[4] || 0,
        saves: r[5] || 0,
      })),
      total,
      page: p,
      pageSize,
    };
  }

  function getRepoStats(range) {
    const f = dateFilter(range);
    const rows = allRows(
      db,
      'SELECT repo_path, SUM(commits), SUM(file_saves), SUM(files_touched), COUNT(*) FROM activity_days' + f.where + ' GROUP BY repo_path',
      f.params
    );
    return rows.map((r) => ({
      repoPath: r[0],
      commits: r[1] || 0,
      saves: r[2] || 0,
      files: r[3] || 0,
      days: r[4] || 0,
    }));
  }

  function getDaily(count) {
    const n = Math.max(1, Number(count) || 30);
    const rows = allRows(
      db,
      'SELECT date, SUM(commits), SUM(file_saves) FROM activity_days WHERE date >= ? GROUP BY date',
      [daysAgo(n - 1)]
    );
    const byDate = new Map(rows.map((r) => [r[0], r]));
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const date = daysAgo(i);
      const r = byDate.get(date);
      out.push({ date, commits: r ? r[1] || 0 : 0, saves: r ? r[2] || 0 : 0 });
    }
    return out;
  }

  return { getStats, getHeatmap, getDonutData, getHistory, getRepoStats, getDaily };
}

module.exports = { makeQueries, localDate, rangeStart, allRows };