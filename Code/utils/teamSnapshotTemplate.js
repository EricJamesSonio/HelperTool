function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TEMPLATE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
:root{--bg:#0b0d12;--sf:#12151c;--el:#1a1e28;--bd:#262b38;--tx:#e7eaf2;--mu:#8a93a8;--fa:#5d667b;--ac:#fb923c;--gr:#34d399;--rd:#f87171;--bl:#60a5fa;--yl:#fbbf24}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
[hidden]{display:none!important}
button{font:inherit;color:inherit;cursor:pointer;background:none;border:0;padding:0}
.app{max-width:1280px;margin:0 auto;padding:0 16px 40px}
.top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:16px 0;border-bottom:1px solid var(--bd)}
.top h1{margin:0;font-size:18px;font-weight:700}
.chip{font:12px Consolas,"Courier New",monospace;color:var(--mu);background:var(--el);border:1px solid var(--bd);border-radius:99px;padding:2px 10px}
.tabs{display:flex;gap:2px;padding:2px;background:var(--el);border:1px solid var(--bd);border-radius:10px}
.tab{height:30px;padding:0 14px;border-radius:8px;color:var(--mu);font-weight:600;font-size:13px}
.tab.on{background:rgba(251,146,60,.16);color:var(--ac);box-shadow:inset 0 0 0 1px rgba(251,146,60,.4)}
.snapinfo{margin-left:auto;font-size:12px;color:var(--fa)}
.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:16px}
.card{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:12px 8px;background:var(--sf);border:1px solid var(--bd);border-top:2px solid var(--ac);border-radius:10px}
.card.add{border-top-color:var(--gr)}
.card.del{border-top-color:var(--rd)}
.card .val{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2}
.card.add .val{color:var(--gr)}
.card.del .val{color:var(--rd)}
.card .val.small{font-size:15px;line-height:1.9}
.card .lab{font-size:10px;color:var(--fa);text-transform:uppercase;letter-spacing:.4px}
.note{margin:10px 0 0;font-size:12px;color:var(--fa)}
.activity{display:grid;grid-template-columns:290px minmax(0,1fr);gap:16px;margin-top:16px}
.people{display:flex;flex-direction:column;gap:4px;background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:8px;align-self:start;max-height:80vh;overflow-y:auto}
.person{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:8px;border-radius:10px;border:1px solid transparent}
.person:hover{background:var(--el)}
.person.on{background:var(--el);border-color:var(--bd)}
.rk{width:26px;flex:0 0 26px;text-align:center;font-size:11px;font-weight:700;color:var(--mu)}
.person:first-child .rk{display:none}
.av{width:32px;height:32px;flex:0 0 32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff}
.av.all{background:var(--ac)}
.pi{flex:1;min-width:0;display:flex;flex-direction:column}
.pi b{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pi i{font-style:normal;font-size:10px;color:var(--fa);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pi .bar{display:block;height:4px;margin-top:4px;background:var(--bg);border-radius:3px;overflow:hidden}
.pi .bar span{display:block;height:100%;border-radius:3px}
.sc{font-size:10px;font-weight:600;color:var(--mu);white-space:nowrap}
.panel{background:var(--sf);border:1px solid var(--bd);border-radius:12px;overflow:hidden}
.phead{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--bd)}
.phead h2{margin:0;font-size:13px;color:var(--mu)}
.seg{display:flex;gap:2px;padding:2px;background:var(--el);border:1px solid var(--bd);border-radius:8px}
.seg button{height:24px;padding:0 10px;border-radius:6px;font-size:11px;font-weight:600;color:var(--mu)}
.seg button.on{background:var(--ac);color:#111}
.seg button.reset:hover{color:var(--rd)}
.graph{overflow-x:auto;overflow-y:hidden;padding:8px 8px 4px}
.graph svg{display:block}
.graph rect[data-k]{cursor:pointer;transition:opacity .15s}
.graph rect[data-k]:hover{opacity:1!important}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;padding:4px 14px 12px;font-size:11px;color:var(--mu)}
.legend span{display:inline-flex;align-items:center;gap:5px}
.legend em{width:9px;height:9px;border-radius:50%;display:inline-block}
.chead{display:flex;align-items:center;gap:8px;padding:8px 14px;border-top:1px solid var(--bd);border-bottom:1px solid var(--bd)}
.chead .count{font-size:12px;color:var(--fa)}
.chead input{margin-left:auto;height:28px;width:200px;max-width:100%;padding:0 10px;background:var(--el);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-size:12px;outline:0}
.chead input:focus{border-color:var(--ac)}
.clist{padding:4px 8px}
.row{display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;padding:8px;border-radius:8px}
.row:hover{background:var(--el)}
.dot{width:8px;height:8px;border-radius:50%;flex:0 0 8px}
.hash{font:11px Consolas,"Courier New",monospace;color:var(--fa);flex:0 0 58px}
.msg{flex:1 1 240px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--fa);white-space:nowrap}
.meta .a{color:var(--gr)}
.meta .d{color:var(--rd)}
.more{display:block;margin:8px auto;padding:6px 16px;border:1px solid var(--bd);border-radius:8px;color:var(--mu);font-size:12px}
.more:hover{border-color:var(--ac);color:var(--ac)}
.empty{padding:36px 12px;text-align:center;color:var(--mu);font-size:13px}
.leader{margin-top:16px;padding:20px 12px 28px;border:1px solid var(--bd);border-radius:12px;background:radial-gradient(ellipse at 50% 0%,rgba(251,146,60,.12),transparent 60%),var(--sf)}
.ltool{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.ltool h2{margin:0;font-size:17px}
.ltool p{margin:2px 0 0;font-size:11px;color:var(--fa)}
.podium{display:flex;align-items:flex-end;justify-content:center;gap:16px;padding:26px 0 6px;min-height:380px}
.pod{width:clamp(96px,24%,200px);display:flex;flex-direction:column;justify-content:flex-end;align-items:center;cursor:pointer;--c:var(--gr)}
.pod.p2{--c:var(--ac)}
.pod.p3{--c:var(--bl)}
.pod .head{display:flex;flex-direction:column;align-items:center;gap:3px;margin-bottom:10px;max-width:100%;text-align:center;opacity:0;transform:translateY(12px);transition:opacity .5s ease calc(var(--d) + .5s),transform .5s ease calc(var(--d) + .5s)}
.go .pod .head{opacity:1;transform:none}
.pod .star{color:var(--yl);font-size:26px;line-height:1}
.pod .pav{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700;color:#fff;border:2px solid var(--c)}
.pod.p1 .pav{width:64px;height:64px;font-size:22px}
.pod .pn{max-width:100%;font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pod .ps{max-width:100%;font-size:10px;color:var(--fa);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pod .pb{width:100%;height:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding-top:12px;overflow:hidden;border-radius:14px 14px 6px 6px;background:linear-gradient(180deg,var(--c),#0006);color:#fff;transition:height 1.1s cubic-bezier(.22,1.15,.36,1) var(--d)}
.go .pod .pb{height:calc(230px * var(--r))}
.pod:hover .pb{filter:brightness(1.1)}
.pod .pr{font-size:50px;font-weight:800;line-height:1}
.pod .pv{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
.pod .pu{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;opacity:.85}
.rlist{display:flex;flex-direction:column;gap:6px;max-width:900px;margin:10px auto 0}
.rrow{display:grid;grid-template-columns:34px 32px minmax(110px,1.2fr) minmax(60px,2fr) 110px;align-items:center;gap:12px;padding:9px 12px;border:1px solid var(--bd);border-radius:10px;background:var(--el);width:100%;text-align:left}
.rrow:hover{border-color:var(--fa)}
.rrow .pos{text-align:center;font-size:12px;font-weight:700;color:var(--mu)}
.rrow .nm{min-width:0}
.rrow .nm b{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rrow .nm i{display:block;font-style:normal;font-size:10px;color:var(--fa);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rrow .track{height:8px;background:var(--bg);border-radius:4px;overflow:hidden}
.rrow .fill{height:100%;width:0;border-radius:4px;transition:width .9s cubic-bezier(.2,.8,.2,1) .9s}
.go .rrow .fill{width:var(--w)}
.rrow .rv{font-size:11px;font-weight:600;color:var(--mu);text-align:right}
.foot{margin-top:24px;text-align:center;font-size:11px;color:var(--fa)}
@media (max-width:860px){
  .summary{grid-template-columns:repeat(2,1fr)}
  .activity{grid-template-columns:1fr}
  .people{flex-direction:row;overflow-x:auto;max-height:none}
  .person{min-width:220px;width:auto}
  .snapinfo{margin-left:0;width:100%}
  .podium{gap:8px;min-height:320px}
  .go .pod .pb{height:calc(160px * var(--r))}
  .pod .pr{font-size:34px}
  .rrow{grid-template-columns:30px 30px minmax(0,1fr) 90px}
  .rrow .track{display:none}
  .chead input{width:130px}
}
@media (prefers-reduced-motion:reduce){
  *{transition:none!important;animation:none!important}
  .pod .head{opacity:1;transform:none}
  .go .pod .pb{height:calc(230px * var(--r))}
}
</style>
</head>
<body>
<div class="app">
  <header class="top">
    <h1>Team Activity</h1>
    <span class="chip">__REPO__</span>
    <nav class="tabs">
      <button class="tab on" data-view="activity">Activity</button>
      <button class="tab" data-view="leadership">Leadership</button>
    </nav>
    <span class="snapinfo" id="snapinfo"></span>
  </header>
  <section class="summary" id="summary"></section>
  <p class="note">Read-only snapshot. It shows commit counts and commit messages only, with no file changes.</p>

  <main class="activity" id="v-activity">
    <aside class="people" id="people"></aside>
    <section class="panel">
      <div class="phead">
        <h2>Commit Activity</h2>
        <div class="seg" id="modes">
          <button class="on" data-mode="day">Day</button>
          <button data-mode="week">Week</button>
          <button data-mode="month">Month</button>
          <button class="reset" id="reset">Reset</button>
        </div>
      </div>
      <div class="graph" id="graph"></div>
      <div class="legend" id="legend"></div>
      <div class="chead">
        <span class="count" id="count"></span>
        <input id="filter" type="text" placeholder="Filter commits..." autocomplete="off">
      </div>
      <div class="clist" id="clist"></div>
    </section>
  </main>

  <main class="leader" id="v-leadership" hidden></main>
  <div class="foot">Generated by HelperTool Team Activity</div>
</div>
<script id="snap-data" type="application/json">__DATA__</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('snap-data').textContent);
  var COL = {};
  D.people.forEach(function (p) { COL[p.name] = p.color; });
  var S = { view: 'activity', who: '', mode: 'day', key: '', filter: '', shown: 50, metric: 'score' };
  var METRICS = {
    score: { label: 'Score', unit: 'pts', val: function (p) { return p.commits * 10 + p.added + p.removed; } },
    commits: { label: 'Commits', unit: 'commits', val: function (p) { return p.commits; } },
    lines: { label: 'Lines', unit: 'lines', val: function (p) { return p.added + p.removed; } }
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(v) { return (v || 0).toLocaleString('en-US'); }
  function pad(v) { return v < 10 ? '0' + v : String(v); }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function weekStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()); }
  function parseDay(k) {
    var p = String(k).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function fmtDay(k) {
    if (!k) return '-';
    return parseDay(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function ini(name) {
    var s = String(name || '?').trim();
    if (!s) return '?';
    return s.split(' ').map(function (p) { return p.charAt(0); }).join('').substring(0, 2).toUpperCase();
  }
  function bucketOfKey(k, mode) {
    if (mode === 'day') return k;
    var d = parseDay(k);
    return mode === 'week' ? dayKey(weekStart(d)) : monthKey(d);
  }
  function startOf(k) { return k.length === 7 ? parseDay(k + '-01') : parseDay(k); }

  function ranked(metric) {
    var f = METRICS[metric].val;
    return D.people.slice().sort(function (a, b) {
      return f(b) - f(a) || b.commits - a.commits || (a.name < b.name ? -1 : 1);
    });
  }

  function renderSummary() {
    function card(cls, val, lab) {
      return '<div class="card ' + cls + '"><div class="val">' + val + '</div><div class="lab">' + lab + '</div></div>';
    }
    $('summary').innerHTML =
      card('', num(D.total), 'Commits') +
      card('', num(D.people.length), 'Contributors') +
      card('add', '+' + num(D.added), 'Added') +
      card('del', '-' + num(D.removed), 'Removed') +
      '<div class="card"><div class="val small">Since ' + esc(fmtDay(D.since)) + '</div><div class="lab">&rarr; ' + esc(fmtDay(D.generatedDay)) + '</div></div>';
  }

  function renderPeople() {
    var max = 0;
    D.people.forEach(function (p) { max = Math.max(max, METRICS.score.val(p)); });
    var h = '<button class="person' + (S.who ? '' : ' on') + '" data-who="">' +
      '<span class="av all">A</span><span class="pi"><b>All</b><i>' + D.people.length + ' contributors</i></span></button>';
    ranked('score').forEach(function (p, i) {
      var sc = METRICS.score.val(p);
      var pct = Math.max(2, Math.round(sc / (max || 1) * 100));
      h += '<button class="person' + (S.who === p.name ? ' on' : '') + '" data-who="' + esc(p.name) + '">' +
        '<span class="rk">' + (i === 0 ? '&#9733;' : '#' + (i + 1)) + '</span>' +
        '<span class="av" style="background:' + p.color + '">' + esc(ini(p.name)) + '</span>' +
        '<span class="pi"><b>' + esc(p.name) + '</b><i>' + num(p.commits) + ' commits &middot; +' + num(p.added) + ' / -' + num(p.removed) + '</i>' +
        '<span class="bar"><span style="width:' + pct + '%;background:' + p.color + '"></span></span></span>' +
        '<span class="sc">' + num(sc) + ' pts</span></button>';
    });
    $('people').innerHTML = h;
  }

  function buckets() {
    var keys = Object.keys(D.days).sort();
    var map = {};
    keys.forEach(function (k) {
      var per = D.days[k];
      Object.keys(per).forEach(function (a) {
        if (S.who && a !== S.who) return;
        var b = bucketOfKey(k, S.mode);
        var o = map[b] || (map[b] = { key: b, total: 0, per: {} });
        o.per[a] = (o.per[a] || 0) + per[a];
        o.total += per[a];
      });
    });
    var bk = Object.keys(map).sort();
    if (!bk.length) return [];
    var out = [];
    var cur = startOf(bk[0]);
    var end = startOf(bk[bk.length - 1]);
    while (cur <= end) {
      var key = S.mode === 'month' ? monthKey(cur) : dayKey(cur);
      out.push(map[key] || { key: key, total: 0, per: {} });
      if (S.mode === 'day') cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      else if (S.mode === 'week') cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
      else cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return out;
  }

  function renderGraph(scrollEnd) {
    var wrap = $('graph');
    var prev = wrap.scrollLeft;
    var data = buckets();
    if (!data.length) {
      wrap.innerHTML = '<div class="empty">No data</div>';
      $('legend').innerHTML = '';
      return;
    }
    var bw = S.mode === 'month' ? 36 : 26;
    var gap = S.mode === 'month' ? 24 : 14;
    var step = bw + gap;
    var padL = 34;
    var padR = 10;
    var H = 230;
    var gH = H - 30;
    var W = padL + data.length * step + padR;
    var max = 0;
    data.forEach(function (g) { if (g.total > max) max = g.total; });
    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
    var lines = Math.min(4, Math.max(1, max));
    for (var i = 0; i <= lines; i++) {
      var y = gH - (gH / lines) * i;
      svg += '<line x1="' + (padL - 4) + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#262b38" stroke-width="1"/>' +
        '<text x="' + (padL - 8) + '" y="' + (y + 3) + '" fill="#5d667b" font-size="10" text-anchor="end">' + Math.round(max / lines * i) + '</text>';
    }
    var skip = Math.max(1, Math.ceil(64 / step));
    data.forEach(function (g, idx) {
      var x = padL + idx * step;
      var on = g.key === S.key;
      var dim = S.key && !on;
      var op = dim ? 0.25 : 0.9;
      if (!g.total) {
        svg += '<rect data-k="' + esc(g.key) + '" x="' + x + '" y="' + (gH - 2) + '" width="' + bw + '" height="2" rx="1" fill="#262b38"><title>' + esc(g.key) + ': 0 commits</title></rect>';
      } else {
        var yOff = gH;
        Object.keys(g.per).sort().forEach(function (a) {
          var h = g.per[a] / max * gH;
          yOff -= h;
          svg += '<rect data-k="' + esc(g.key) + '" x="' + x + '" y="' + yOff + '" width="' + bw + '" height="' + Math.max(h, 1) + '" rx="2" fill="' + (COL[a] || '#5d667b') + '" opacity="' + op + '"><title>' + esc(g.key) + ' - ' + esc(a) + ': ' + g.per[a] + ' commits</title></rect>';
        });
        if (on) {
          var th = g.total / max * gH;
          svg += '<rect x="' + x + '" y="' + (gH - th) + '" width="' + bw + '" height="' + th + '" rx="2" fill="none" stroke="#fb923c" stroke-width="2" pointer-events="none"/>';
        }
      }
      if (idx % skip === 0) {
        var label = S.mode === 'month' ? g.key : g.key.slice(5);
        svg += '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" fill="' + (on ? '#fb923c' : '#8a93a8') + '" font-size="10" text-anchor="middle">' + esc(label) + '</text>';
      }
    });
    svg += '</svg>';
    wrap.innerHTML = svg;
    wrap.scrollLeft = scrollEnd ? wrap.scrollWidth : prev;

    var lg = '';
    if (!S.who && D.people.length > 1) {
      D.people.forEach(function (p) {
        lg += '<span><em style="background:' + p.color + '"></em>' + esc(p.name) + '</span>';
      });
    }
    $('legend').innerHTML = lg;
  }

  function filteredCommits() {
    var out = [];
    var f = S.filter.toLowerCase();
    for (var i = 0; i < D.recent.length; i++) {
      var c = D.recent[i];
      if (S.who && c.a !== S.who) continue;
      if (S.key && bucketOfKey(c.k, S.mode) !== S.key) continue;
      if (f && c.m.toLowerCase().indexOf(f) < 0 && c.a.toLowerCase().indexOf(f) < 0 && c.h.indexOf(f) < 0) continue;
      out.push(c);
    }
    return out;
  }

  function renderCommits() {
    var all = filteredCommits();
    var shown = all.slice(0, S.shown);
    var note = D.truncated ? ' (latest ' + num(D.shown) + ' of ' + num(D.total) + ' commit messages)' : '';
    $('count').textContent = shown.length + ' of ' + num(all.length) + ' commits' + note;
    if (!all.length) {
      var why = (D.truncated && (S.key || S.who))
        ? 'No commit messages for this selection in the snapshot. Only the latest ' + num(D.shown) + ' are included.'
        : 'No commits match your filter';
      $('clist').innerHTML = '<div class="empty">' + esc(why) + '</div>';
      return;
    }
    var h = '';
    shown.forEach(function (c) {
      h += '<div class="row"><span class="dot" style="background:' + (COL[c.a] || '#5d667b') + '"></span>' +
        '<span class="hash">' + esc(c.h) + '</span>' +
        '<span class="msg" title="' + esc(c.m) + '">' + esc(c.m) + '</span>' +
        '<span class="meta"><span>' + esc(c.a) + '</span><span>' + esc(fmtDay(c.k)) + '</span>' +
        '<span><span class="a">+' + num(c.p) + '</span> <span class="d">-' + num(c.r) + '</span></span></span></div>';
    });
    if (shown.length < all.length) h += '<button class="more" id="more">Show more</button>';
    $('clist').innerHTML = h;
  }

  function renderLeader() {
    var root = $('v-leadership');
    var m = METRICS[S.metric];
    var r = ranked(S.metric);
    if (!r.length) {
      root.innerHTML = '<div class="empty">No contributors yet</div>';
      return;
    }
    var max = m.val(r[0]) || 1;
    var top = r.slice(0, 3);
    var rest = r.slice(3);
    var delays = [0.5, 0.25, 0.05];
    var tabs = '';
    Object.keys(METRICS).forEach(function (key) {
      tabs += '<button class="' + (key === S.metric ? 'on' : '') + '" data-metric="' + key + '">' + METRICS[key].label + '</button>';
    });
    var pod = '';
    [1, 0, 2].forEach(function (idx) {
      var p = top[idx];
      if (!p) return;
      var place = idx + 1;
      var ratio = idx === 0 ? 1 : Math.max(0.3, m.val(p) / max);
      pod += '<div class="pod p' + place + '" data-lead="' + esc(p.name) + '" style="--r:' + ratio.toFixed(3) + ';--d:' + delays[idx] + 's">' +
        '<div class="head">' + (place === 1 ? '<div class="star">&#9733;</div>' : '') +
        '<div class="pav" style="background:' + p.color + '">' + esc(ini(p.name)) + '</div>' +
        '<div class="pn" title="' + esc(p.name) + '">' + esc(p.name) + '</div>' +
        '<div class="ps">' + num(p.commits) + ' commits &middot; +' + num(p.added) + ' / -' + num(p.removed) + '</div></div>' +
        '<div class="pb"><span class="pr">' + place + '</span><span class="pv">' + num(m.val(p)) + '</span><span class="pu">' + m.unit + '</span></div></div>';
    });
    var rows = '';
    rest.forEach(function (p, i) {
      var pct = Math.max(2, Math.round(m.val(p) / max * 100));
      rows += '<button class="rrow" data-lead="' + esc(p.name) + '">' +
        '<span class="pos">#' + (i + 4) + '</span>' +
        '<span class="av" style="background:' + p.color + '">' + esc(ini(p.name)) + '</span>' +
        '<span class="nm"><b>' + esc(p.name) + '</b><i>' + num(p.commits) + ' commits &middot; +' + num(p.added) + ' / -' + num(p.removed) + '</i></span>' +
        '<span class="track"><span class="fill" style="--w:' + pct + '%;background:' + p.color + ';transition-delay:' + (0.9 + i * 0.07) + 's"></span></span>' +
        '<span class="rv">' + num(m.val(p)) + ' ' + m.unit + '</span></button>';
    });
    root.classList.remove('go');
    root.innerHTML = '<div class="ltool"><div><h2>Leadership &middot; ' + esc(D.repo) + '</h2>' +
      '<p>Score = commits x 10 + lines added + lines removed</p></div><div class="seg">' + tabs + '</div></div>' +
      '<div class="podium">' + pod + '</div>' + (rest.length ? '<div class="rlist">' + rows + '</div>' : '');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add('go'); });
    });
  }

  function renderView() {
    $('v-activity').hidden = S.view !== 'activity';
    $('v-leadership').hidden = S.view !== 'leadership';
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('on', tabs[i].getAttribute('data-view') === S.view);
    }
    if (S.view === 'leadership') renderLeader();
    else renderGraph(false);
  }

  function syncModes() {
    var b = document.querySelectorAll('#modes [data-mode]');
    for (var i = 0; i < b.length; i++) {
      b[i].classList.toggle('on', b[i].getAttribute('data-mode') === S.mode);
    }
  }

  function renderActivity(scrollEnd) {
    renderPeople();
    renderGraph(scrollEnd);
    renderCommits();
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-view]');
    if (el) {
      S.view = el.getAttribute('data-view');
      renderView();
      return;
    }
    el = t.closest('[data-lead]');
    if (el) {
      S.who = el.getAttribute('data-lead');
      S.key = '';
      S.shown = 50;
      S.view = 'activity';
      renderView();
      renderActivity(true);
      return;
    }
    el = t.closest('[data-metric]');
    if (el) {
      S.metric = el.getAttribute('data-metric');
      renderLeader();
      return;
    }
    el = t.closest('[data-who]');
    if (el) {
      S.who = el.getAttribute('data-who');
      S.key = '';
      S.shown = 50;
      renderActivity(true);
      return;
    }
    el = t.closest('[data-mode]');
    if (el) {
      S.mode = el.getAttribute('data-mode');
      S.key = '';
      S.shown = 50;
      syncModes();
      renderGraph(true);
      renderCommits();
      return;
    }
    el = t.closest('[data-k]');
    if (el) {
      var k = el.getAttribute('data-k');
      S.key = S.key === k ? '' : k;
      S.shown = 50;
      renderGraph(false);
      renderCommits();
      return;
    }
    if (t.closest('#reset')) {
      S.who = '';
      S.key = '';
      S.filter = '';
      S.shown = 50;
      $('filter').value = '';
      renderActivity(true);
      return;
    }
    if (t.closest('#more')) {
      S.shown += 50;
      renderCommits();
    }
  });

  $('filter').addEventListener('input', function () {
    S.filter = $('filter').value;
    S.shown = 50;
    renderCommits();
  });

  $('snapinfo').textContent = 'Snapshot taken ' + new Date(D.generatedAt).toLocaleString();
  renderSummary();
  syncModes();
  renderActivity(true);
})();
</script>
</body>
</html>
`;

function renderSnapshotHtml(snap) {
  const json = JSON.stringify(snap)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const title = 'Team Activity - ' + esc(snap.repo);
  return TEMPLATE
    .split('__TITLE__').join(title)
    .split('__REPO__').join(esc(snap.repo))
    .split('__DATA__').join(json);
}

module.exports = { renderSnapshotHtml };