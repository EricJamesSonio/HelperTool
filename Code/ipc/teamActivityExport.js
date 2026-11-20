const { ipcMain, BrowserWindow, dialog, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { renderSnapshotHtml } = require('../utils/teamSnapshotTemplate.js');

const RECENT_LIMIT = 500;
const PDF_RECENT = 20;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function dayKeyOf(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function fmt(n) {
  return (n || 0).toLocaleString('en-US');
}

function scoreOf(p) {
  return (p.commits || 0) * 10 + (p.added || 0) + (p.removed || 0);
}

function repoNameOf(repoPath) {
  const parts = String(repoPath || '').split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'repository';
}

function safeName(s) {
  return String(s || 'repo').replace(/[^a-z0-9_-]+/gi, '_');
}

function buildSnapshot(repoPath, data) {
  const commits = (data.commits || [])
    .map((c) => ({ c, t: new Date(c.date) }))
    .filter((x) => !isNaN(x.t.getTime()));
  commits.sort((a, b) => b.t - a.t);

  const contributors = data.contributors || {};
  const people = Object.keys(contributors).map((name) => {
    const d = contributors[name];
    const last = d.lastCommit ? new Date(d.lastCommit) : null;
    return {
      name,
      color: d.color || '#818cf8',
      commits: d.commits || 0,
      added: d.linesAdded || 0,
      removed: d.linesRemoved || 0,
      last: last && !isNaN(last.getTime()) ? dayKeyOf(last) : '',
    };
  });
  people.sort((a, b) => scoreOf(b) - scoreOf(a) || b.commits - a.commits || (a.name < b.name ? -1 : 1));

  const days = {};
  let since = '';
  for (const x of commits) {
    const k = dayKeyOf(x.t);
    if (!since || k < since) since = k;
    if (!days[k]) days[k] = {};
    days[k][x.c.author] = (days[k][x.c.author] || 0) + 1;
  }

  const recent = commits.slice(0, RECENT_LIMIT).map((x) => ({
    h: String(x.c.hash || '').slice(0, 7),
    a: x.c.author,
    k: dayKeyOf(x.t),
    m: x.c.message || '',
    p: x.c.linesAdded || 0,
    r: x.c.linesRemoved || 0,
  }));

  let added = 0;
  let removed = 0;
  for (const p of people) {
    added += p.added;
    removed += p.removed;
  }

  const now = new Date();
  return {
    repo: repoNameOf(repoPath),
    generatedAt: now.toISOString(),
    generatedDay: dayKeyOf(now),
    since,
    total: commits.length,
    added,
    removed,
    shown: recent.length,
    truncated: commits.length > recent.length,
    people,
    days,
    recent,
  };
}

function buildPdfHtml(snap) {
  const rankRows = snap.people.map((p, i) => {
    return '<tr>'
      + '<td class="pos">' + (i + 1) + '</td>'
      + '<td><span class="dot" style="background:' + esc(p.color) + '"></span>' + esc(p.name) + '</td>'
      + '<td class="num">' + fmt(p.commits) + '</td>'
      + '<td class="num add">+' + fmt(p.added) + '</td>'
      + '<td class="num del">-' + fmt(p.removed) + '</td>'
      + '<td class="num sc">' + fmt(scoreOf(p)) + '</td>'
      + '</tr>';
  }).join('');

  const recent = snap.recent.slice(0, PDF_RECENT);
  const recentRows = recent.map((c) => {
    return '<tr>'
      + '<td class="date">' + esc(c.k) + '</td>'
      + '<td class="who">' + esc(c.a) + '</td>'
      + '<td>' + esc(c.m) + '</td>'
      + '</tr>';
  }).join('');

  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(snap.repo) + ' - Team Activity</title>'
    + '<style>'
    + '@page { size: A4; margin: 14mm 12mm; }'
    + '* { box-sizing: border-box; }'
    + 'body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.5pt; color: #1b2233; margin: 0; }'
    + '.cover { border-bottom: 3px solid #fb923c; padding-bottom: 10px; margin-bottom: 16px; }'
    + '.cover h1 { font-size: 22pt; margin: 0 0 4px; }'
    + '.cover .meta { color: #5b6780; font-size: 10pt; }'
    + '.stats { display: flex; gap: 10px; margin-top: 10px; }'
    + '.stat { background: #fff4ea; border-radius: 6px; padding: 6px 14px; }'
    + '.stat b { display: block; font-size: 15pt; color: #c2570c; }'
    + '.stat span { font-size: 8pt; color: #5b6780; text-transform: uppercase; letter-spacing: .04em; }'
    + 'h2 { font-size: 13pt; margin: 18px 0 8px; }'
    + 'table { width: 100%; border-collapse: collapse; }'
    + 'thead { display: table-header-group; }'
    + 'th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #5b6780; background: #eef2f9; padding: 5px 8px; }'
    + 'td { padding: 5px 8px; border-bottom: 1px solid #e3e8f2; vertical-align: top; word-break: break-word; }'
    + 'tr { page-break-inside: avoid; }'
    + '.num { text-align: right; font-variant-numeric: tabular-nums; }'
    + 'th.num { text-align: right; }'
    + '.pos { width: 28px; font-weight: 700; color: #5b6780; }'
    + '.add { color: #15803d; }'
    + '.del { color: #b91c1c; }'
    + '.sc { font-weight: 700; }'
    + '.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }'
    + '.date { width: 78px; color: #5b6780; white-space: nowrap; }'
    + '.who { width: 120px; color: #5b6780; }'
    + '.foot { margin-top: 14px; font-size: 8pt; color: #7a859c; }'
    + '</style></head><body>'
    + '<div class="cover"><h1>' + esc(snap.repo) + '</h1>'
    + '<div class="meta">Team activity report &middot; ' + esc(snap.generatedDay) + '</div>'
    + '<div class="stats">'
    + '<div class="stat"><b>' + fmt(snap.total) + '</b><span>Commits</span></div>'
    + '<div class="stat"><b>' + fmt(snap.people.length) + '</b><span>Contributors</span></div>'
    + '<div class="stat"><b>' + esc(snap.since || '-') + '</b><span>First commit</span></div>'
    + '</div></div>'
    + '<h2>Rankings</h2>'
    + '<table><thead><tr><th>#</th><th>Contributor</th><th class="num">Commits</th><th class="num">Added</th><th class="num">Removed</th><th class="num">Score</th></tr></thead><tbody>'
    + rankRows
    + '</tbody></table>'
    + '<div class="foot">Score = commits x 10 + lines added + lines removed</div>'
    + '<h2>Recent commits (latest ' + recent.length + ')</h2>'
    + '<table><thead><tr><th>Date</th><th>Author</th><th>Message</th></tr></thead><tbody>'
    + recentRows
    + '</tbody></table>'
    + '</body></html>';
}

async function renderPdf(html) {
  const tmpFile = path.join(os.tmpdir(), 'team_activity_' + Date.now() + '.html');
  fs.writeFileSync(tmpFile, html, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win.loadFile(tmpFile);
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' },
    });
  } finally {
    try { win.destroy(); } catch (_) {}
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

function pickSavePath(event, options) {
  const parent = BrowserWindow.fromWebContents(event.sender);
  if (parent) return dialog.showSaveDialog(parent, options);
  return dialog.showSaveDialog(options);
}

async function loadSnapshot(repoPath, getData) {
  if (!repoPath) throw new Error('repoPath is required');
  const data = await getData(repoPath);
  if (!data || !data.commits || !data.commits.length) throw new Error('No commits to export');
  return buildSnapshot(repoPath, data);
}

function register(deps) {
  const getData = deps && deps.getData;

  ipcMain.handle('team-activity:export-html', async (event, payload) => {
    try {
      const snap = await loadSnapshot(payload && payload.repoPath, getData);
      const pick = await pickSavePath(event, {
        title: 'Save team activity snapshot',
        defaultPath: safeName(snap.repo) + '_team-activity.html',
        filters: [{ name: 'Web page', extensions: ['html'] }],
      });
      if (pick.canceled || !pick.filePath) return { success: false, canceled: true };
      fs.writeFileSync(pick.filePath, renderSnapshotHtml(snap), 'utf8');
      try { shell.showItemInFolder(pick.filePath); } catch (_) {}
      return { success: true, filePath: pick.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('team-activity:export-pdf', async (event, payload) => {
    try {
      const snap = await loadSnapshot(payload && payload.repoPath, getData);
      const pick = await pickSavePath(event, {
        title: 'Save team activity report',
        defaultPath: safeName(snap.repo) + '_team-activity.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (pick.canceled || !pick.filePath) return { success: false, canceled: true };
      const pdf = await renderPdf(buildPdfHtml(snap));
      fs.writeFileSync(pick.filePath, pdf);
      try { shell.showItemInFolder(pick.filePath); } catch (_) {}
      return { success: true, filePath: pick.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register, buildSnapshot };