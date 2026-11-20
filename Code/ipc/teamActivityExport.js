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
  const initials = (name) => {
    const s = String(name || '?').trim();
    return s ? s.split(' ').map((p) => p.charAt(0)).join('').substring(0, 2).toUpperCase() : '?';
  };
  const colors = {};
  snap.people.forEach((p) => {
    colors[p.name] = p.color;
  });
  const maxScore = snap.people.reduce((m, p) => Math.max(m, scoreOf(p)), 0) || 1;

  const topCards = snap.people.slice(0, 3).map((p, i) => {
    return '<div class="pc">'
      + '<div class="pcn">' + (i + 1) + '</div>'
      + '<div class="pav" style="border-color:' + esc(p.color) + '">' + esc(initials(p.name)) + '</div>'
      + '<div class="pci"><b>' + esc(p.name) + '</b><span>' + fmt(p.commits) + ' commits</span></div>'
      + '<div class="pcs"><b>' + fmt(scoreOf(p)) + '</b><span>pts</span></div>'
      + '</div>';
  }).join('');

  const rankRows = snap.people.map((p, i) => {
    const pct = Math.max(2, Math.round((scoreOf(p) / maxScore) * 100));
    return '<tr>'
      + '<td class="pos">' + (i + 1) + '</td>'
      + '<td><span class="dot" style="background:' + esc(p.color) + '"></span>' + esc(p.name) + '</td>'
      + '<td class="num">' + fmt(p.commits) + '</td>'
      + '<td class="num add">+' + fmt(p.added) + '</td>'
      + '<td class="num del">-' + fmt(p.removed) + '</td>'
      + '<td class="sco"><div class="sn">' + fmt(scoreOf(p)) + '</div>'
      + '<div class="bar"><i style="width:' + pct + '%;background:' + esc(p.color) + '"></i></div></td>'
      + '</tr>';
  }).join('');

  const recent = snap.recent.slice(0, PDF_RECENT);
  const recentRows = recent.map((c) => {
    return '<tr>'
      + '<td class="date">' + esc(c.k) + '</td>'
      + '<td class="who"><span class="dot" style="background:' + esc(colors[c.a] || '#9aa3b5') + '"></span>' + esc(c.a) + '</td>'
      + '<td class="cm">' + esc(c.m) + '</td>'
      + '</tr>';
  }).join('');

  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(snap.repo) + ' - Team Activity</title>'
    + '<style>'
    + '@page { size: A4; margin: 16mm 14mm 20mm; }'
    + '* { box-sizing: border-box; }'
    + 'body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.5pt; line-height: 1.4; color: #151a22; margin: 0; }'
    + '.hd { padding-bottom: 14px; margin-bottom: 16px; border-bottom: 1px solid #dfe3ea; }'
    + '.eyebrow { font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; color: #6b7487; }'
    + 'h1 { font-size: 27pt; margin: 2px 0 4px; letter-spacing: -.01em; }'
    + '.sub { color: #6b7487; font-size: 9.5pt; }'
    + '.tiles { display: flex; gap: 10px; margin-bottom: 20px; }'
    + '.tile { flex: 1; border: 1px solid #dfe3ea; border-radius: 8px; padding: 10px 12px; }'
    + '.tile b { display: block; font-size: 17pt; font-variant-numeric: tabular-nums; line-height: 1.2; }'
    + '.tile span { font-size: 7.5pt; letter-spacing: .08em; text-transform: uppercase; color: #6b7487; }'
    + '.tile.add b { color: #15803d; }'
    + '.tile.del b { color: #b91c1c; }'
    + 'h2 { font-size: 12pt; margin: 0 0 8px; letter-spacing: -.005em; }'
    + 'section { margin-bottom: 22px; }'
    + '.top3 { display: flex; gap: 10px; }'
    + '.pc { flex: 1; display: flex; align-items: center; gap: 9px; border: 1px solid #dfe3ea; border-radius: 8px; padding: 9px 11px; page-break-inside: avoid; }'
    + '.pcn { font-size: 18pt; font-weight: 800; color: #c4cad6; width: 16px; text-align: center; }'
    + '.pav { width: 30px; height: 30px; flex: 0 0 30px; border: 2px solid #9aa3b5; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8.5pt; font-weight: 700; }'
    + '.pci { flex: 1; min-width: 0; }'
    + '.pci b { display: block; font-size: 10pt; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }'
    + '.pci span { font-size: 8pt; color: #6b7487; }'
    + '.pcs { text-align: right; }'
    + '.pcs b { display: block; font-size: 11pt; font-variant-numeric: tabular-nums; }'
    + '.pcs span { font-size: 7.5pt; color: #6b7487; text-transform: uppercase; letter-spacing: .06em; }'
    + 'table { width: 100%; border-collapse: collapse; }'
    + 'thead { display: table-header-group; }'
    + 'th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #6b7487; font-weight: 600; padding: 5px 8px; border-bottom: 1.5px solid #151a22; }'
    + 'td { padding: 6px 8px; border-bottom: 1px solid #e6e9f0; vertical-align: middle; }'
    + 'tr { page-break-inside: avoid; }'
    + 'th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }'
    + '.pos { width: 26px; font-weight: 700; color: #6b7487; }'
    + '.add { color: #15803d; }'
    + '.del { color: #b91c1c; }'
    + '.sco { width: 130px; }'
    + '.sn { font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }'
    + '.bar { height: 4px; background: #eceff4; border-radius: 2px; margin-top: 3px; }'
    + '.bar i { display: block; height: 100%; border-radius: 2px; }'
    + '.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 7px; }'
    + '.note { margin-top: 6px; font-size: 8pt; color: #8a93a6; }'
    + '.date { width: 74px; color: #6b7487; white-space: nowrap; font-variant-numeric: tabular-nums; }'
    + '.who { width: 130px; white-space: nowrap; }'
    + '.cm { word-break: break-word; }'
    + '.foot { position: fixed; left: 0; right: 0; bottom: -11mm; display: flex; justify-content: space-between; font-size: 7.5pt; color: #8a93a6; }'
    + '</style></head><body>'
    + '<div class="foot"><span>' + esc(snap.repo) + ' &middot; Team activity report</span><span>' + esc(snap.generatedDay) + '</span></div>'
    + '<div class="hd">'
    + '<div class="eyebrow">Team activity report</div>'
    + '<h1>' + esc(snap.repo) + '</h1>'
    + '<div class="sub">' + esc(snap.since || '-') + ' to ' + esc(snap.generatedDay) + '</div>'
    + '</div>'
    + '<div class="tiles">'
    + '<div class="tile"><b>' + fmt(snap.total) + '</b><span>Commits</span></div>'
    + '<div class="tile"><b>' + fmt(snap.people.length) + '</b><span>Contributors</span></div>'
    + '<div class="tile add"><b>+' + fmt(snap.added) + '</b><span>Lines added</span></div>'
    + '<div class="tile del"><b>-' + fmt(snap.removed) + '</b><span>Lines removed</span></div>'
    + '</div>'
    + (topCards ? '<section><h2>Top contributors</h2><div class="top3">' + topCards + '</div></section>' : '')
    + '<section><h2>Rankings</h2>'
    + '<table><thead><tr><th>#</th><th>Contributor</th><th class="num">Commits</th><th class="num">Added</th><th class="num">Removed</th><th class="num">Score</th></tr></thead><tbody>'
    + rankRows
    + '</tbody></table>'
    + '<div class="note">Score = commits x 10 + lines added + lines removed</div></section>'
    + '<section><h2>Latest ' + recent.length + ' commits</h2>'
    + '<table><thead><tr><th>Date</th><th>Author</th><th>Message</th></tr></thead><tbody>'
    + recentRows
    + '</tbody></table></section>'
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