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
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0c0e13">
<title>__TITLE__</title>
<style>
:root{color-scheme:dark;--bg:#0c0e13;--sf:#12151b;--el:#1a1e27;--bd:#242936;--tx:#e8ebf3;--mu:#8e97ab;--fa:#5f687d;--ac:#fb923c;--gr:#34d399;--rd:#f87171;--bl:#60a5fa;--yl:#fbbf24}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
[hidden]{display:none!important}
html,body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%}
button{font:inherit;color:inherit;cursor:pointer;background:none;border:0;padding:0}
.app{max-width:1240px;margin:0 auto;padding:0 20px 48px}
.top{display:flex;align-items:center;gap:14px;padding:18px 0 4px}
.brand{display:flex;align-items:baseline;gap:10px;min-width:0}
.brand h1{margin:0;font-size:19px;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.repo{font:12px ui-monospace,Consolas,"Courier New",monospace;color:var(--mu);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46vw}
.tabs{display:flex;gap:2px;padding:3px;margin-left:auto;background:var(--el);border:1px solid var(--bd);border-radius:11px}
.tab{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 14px;border-radius:8px;color:var(--mu);font-weight:600;font-size:13px}
.tab svg{width:15px;height:15px;flex:0 0 15px}
.tab.on{background:var(--bg);color:var(--tx);box-shadow:0 0 0 1px var(--bd)}
.tab.on svg{color:var(--ac)}
.sub{margin:4px 0 16px;font-size:12px;color:var(--fa)}
.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.stat{display:flex;flex-direction:column-reverse;gap:3px;min-width:0;padding:14px 16px;background:var(--sf);border:1px solid var(--bd);border-radius:12px}
.stat .lab{font-size:11px;color:var(--fa);text-transform:uppercase;letter-spacing:.06em}
.stat .val{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.15;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stat.add .val{color:var(--gr)}
.stat.del .val{color:var(--rd)}
.stat .val.sm{font-size:15px;font-weight:600;line-height:1.7}
.activity{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;margin-top:16px;align-items:start}
.people{display:flex;flex-direction:column;gap:3px;padding:8px;background:var(--sf);border:1px solid var(--bd);border-radius:14px;max-height:78vh;overflow-y:auto}
.person{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:9px 10px;border-radius:10px;border:1px solid transparent}
.person:hover{background:var(--el)}
.person.on{background:var(--el);border-color:var(--bd);box-shadow:inset 3px 0 0 var(--ac)}
.rk{width:24px;flex:0 0 24px;text-align:center;font-size:11px;font-weight:700;color:var(--mu)}
.rk svg{width:16px;height:16px;color:var(--yl);display:block;margin:0 auto}
.av{width:32px;height:32px;flex:0 0 32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff}
.av.all{background:var(--el);color:var(--tx);border:1px solid var(--bd)}
.pi{flex:1;min-width:0;display:flex;flex-direction:column}
.pi b{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pi i{font-style:normal;font-size:11px;color:var(--fa);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pi .bar{display:block;height:3px;margin-top:5px;background:var(--bg);border-radius:2px;overflow:hidden}
.pi .bar span{display:block;height:100%;border-radius:2px}
.sc{font-size:11px;font-weight:600;color:var(--mu);white-space:nowrap}
.panel{background:var(--sf);border:1px solid var(--bd);border-radius:14px;overflow:hidden;min-width:0}
.phead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 16px}
.phead h2{margin:0;font-size:13px;font-weight:600;color:var(--mu)}
.seg{display:flex;gap:2px;padding:3px;background:var(--el);border:1px solid var(--bd);border-radius:10px}
.seg button{height:28px;padding:0 12px;border-radius:7px;font-size:12px;font-weight:600;color:var(--mu)}
.seg button.on{background:var(--ac);color:#15110c}
.seg button.reset:hover{color:var(--rd)}
.graph{overflow-x:auto;overflow-y:hidden;padding:4px 10px 2px;-webkit-overflow-scrolling:touch}
.graph svg{display:block}
.graph rect[data-k]{cursor:pointer;transition:opacity .15s}
.graph rect[data-k]:hover{opacity:1!important}
.sel{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 16px 0;padding:8px 12px;background:var(--el);border:1px solid var(--bd);border-radius:10px;font-size:13px;color:var(--mu)}
.sel b{color:var(--tx)}
.sel button{font-size:12px;font-weight:600;color:var(--ac);padding:4px 8px}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;padding:8px 16px 12px;font-size:11px;color:var(--mu)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend em{width:9px;height:9px;border-radius:50%;display:inline-block}
.chead{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;padding:10px 16px;border-top:1px solid var(--bd)}
.chead .count{font-size:12px;color:var(--fa)}
.chead input{margin-left:auto;height:34px;width:220px;max-width:100%;padding:0 12px;background:var(--el);border:1px solid var(--bd);border-radius:10px;color:var(--tx);font-size:14px;outline:0}
.chead input:focus{border-color:var(--ac)}
.clist{padding:0 8px 8px}
.row{display:flex;align-items:flex-start;gap:12px;padding:11px 8px}
.row+.row{border-top:1px solid var(--bd)}
.dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;margin-top:7px}
.rb{flex:1;min-width:0}
.msg{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;font-size:14px}
.meta{display:flex;flex-wrap:wrap;gap:2px 10px;margin-top:3px;font-size:12px;color:var(--fa)}
.meta code{font:11.5px ui-monospace,Consolas,"Courier New",monospace}
.ds{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:1px;margin-top:2px;font:12px ui-monospace,Consolas,"Courier New",monospace}
.ds .a{color:var(--gr)}
.ds .d{color:var(--rd)}
.more{display:block;margin:10px auto 4px;padding:9px 20px;border:1px solid var(--bd);border-radius:10px;color:var(--mu);font-size:13px}
.more:hover{border-color:var(--ac);color:var(--ac)}
.empty{padding:36px 12px;text-align:center;color:var(--mu);font-size:13px}
.leader{margin-top:16px;padding:22px 16px 30px;border:1px solid var(--bd);border-radius:14px;background:var(--sf)}
.ltool{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.ltool h2{margin:0;font-size:17px;letter-spacing:-.01em}
.ltool p{margin:2px 0 0;font-size:12px;color:var(--fa)}
.podium{display:flex;align-items:flex-end;justify-content:center;gap:14px;padding:26px 0 4px}
.pod{--c:var(--gr);width:clamp(92px,24%,210px);min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;cursor:pointer}
.pod.p2{--c:var(--ac)}
.pod.p3{--c:var(--bl)}
.pod .head{display:flex;flex-direction:column;align-items:center;gap:4px;max-width:100%;margin-bottom:12px;text-align:center;opacity:0;transform:translateY(12px);transition:opacity .5s ease calc(var(--d) + .5s),transform .5s ease calc(var(--d) + .5s)}
.go .pod .head{opacity:1;transform:none}
.pod .crown{width:26px;height:26px;color:var(--yl)}
.pod .pav{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700;color:#fff;box-shadow:0 0 0 3px var(--sf),0 0 0 5px var(--c)}
.pod.p1 .pav{width:64px;height:64px;font-size:22px}
.pod .pn{max-width:100%;font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pod .ps{max-width:100%;font-size:11px;color:var(--fa);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pod .pb{width:100%;height:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding-top:14px;overflow:hidden;border-radius:14px 14px 4px 4px;background:var(--el);background:color-mix(in srgb,var(--c) 14%,var(--el));border:1px solid var(--bd);border:1px solid color-mix(in srgb,var(--c) 38%,transparent);border-bottom:0;transition:height 1.1s cubic-bezier(.22,1.15,.36,1) var(--d)}
.go .pod .pb{height:calc(220px * var(--r))}
.pod:hover .pb{background:color-mix(in srgb,var(--c) 22%,var(--el))}
.pod .pr{font-size:52px;font-weight:800;line-height:1;color:var(--c)}
.pod .pv{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
.pod .pu{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--mu)}
.rlist{display:flex;flex-direction:column;gap:6px;max-width:900px;margin:12px auto 0}
.rrow{display:grid;grid-template-columns:34px 32px minmax(110px,1.2fr) minmax(60px,2fr) 110px;align-items:center;gap:12px;width:100%;text-align:left;padding:10px 12px;background:var(--el);border:1px solid var(--bd);border-radius:12px}
.rrow:hover{border-color:var(--fa)}
.rrow .pos{text-align:center;font-size:12px;font-weight:700;color:var(--mu)}
.rrow .nm{min-width:0}
.rrow .nm b{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rrow .nm i{display:block;font-style:normal;font-size:11px;color:var(--fa);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rrow .track{height:6px;background:var(--bg);border-radius:3px;overflow:hidden}
.rrow .fill{display:block;height:100%;width:0;border-radius:3px;transition:width .9s cubic-bezier(.2,.8,.2,1) .9s}
.go .rrow .fill{width:var(--w)}
.rrow .rv{font-size:12px;font-weight:600;color:var(--mu);text-align:right;white-space:nowrap}
.foot{margin-top:28px;text-align:center;font-size:11px;color:var(--fa)}
@media (max-width:900px){
  .stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .stat.span{grid-column:1/-1}
  .stat .val{font-size:23px}
  .activity{grid-template-columns:minmax(0,1fr);gap:12px}
}
@media (max-width:720px){
  .app{padding:0 14px calc(92px + env(safe-area-inset-bottom))}
  .top{padding:14px 0 2px}
  .brand h1{font-size:17px}
  .repo{max-width:52vw}
  .sub{margin-bottom:12px}
  .tabs{position:fixed;left:0;right:0;bottom:0;z-index:20;margin:0;gap:8px;padding:8px 14px calc(8px + env(safe-area-inset-bottom));border:0;border-top:1px solid var(--bd);border-radius:0;background:rgba(18,21,27,.94);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
  .tab{flex:1;justify-content:center;height:44px;border-radius:12px;font-size:14px}
  .tab.on{background:var(--el);box-shadow:none}
  .people{flex-direction:row;gap:8px;padding:2px 0 8px;max-height:none;overflow-x:auto;overflow-y:hidden;background:none;border:0;border-radius:0;scroll-snap-type:x proximity;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .people::-webkit-scrollbar{display:none}
  .person{flex:0 0 auto;width:auto;padding:7px 14px 7px 7px;background:var(--sf);border-color:var(--bd);border-radius:99px;scroll-snap-align:start}
  .person.on{box-shadow:none;border-color:var(--ac);background:var(--el)}
  .person .rk,.person .sc,.person .bar,.person .ln{display:none}
  .pi b{max-width:140px}
  .phead{padding:12px 12px 6px}
  .seg{width:100%}
  .seg button{flex:1;height:34px}
  .sel{margin:6px 12px 0}
  .legend{padding:8px 12px 10px}
  .chead{padding:10px 12px}
  .chead input{flex:1 1 100%;margin-left:0;width:100%;height:40px}
  .clist{padding:0 4px 8px}
  .row{padding:12px 8px}
  .leader{padding:18px 10px 24px}
  .podium{gap:8px;padding-top:18px}
  .pod .pav{width:44px;height:44px;font-size:16px}
  .pod.p1 .pav{width:52px;height:52px;font-size:18px}
  .pod .pn{font-size:13px}
  .pod .crown{width:22px;height:22px}
  .go .pod .pb{height:calc(150px * var(--r))}
  .pod .pr{font-size:36px}
  .pod .pv{font-size:14px}
  .rrow{grid-template-columns:28px 32px minmax(0,1fr) auto;gap:10px;padding:10px}
  .rrow .track{display:none}
  .foot{margin-top:20px}
}
@media (prefers-reduced-motion:reduce){
  *{transition:none!important;animation:none!important}
  .pod .head{opacity:1;transform:none}
  .go .pod .pb{height:calc(220px * var(--r))}
}
</style>
</head>
<body>
<div class="app">
  <header class="top">
    <div class="brand">
      <h1>Team Activity</h1>
      <span class="repo">__REPO__</span>
    </div>
    <nav class="tabs">
      <button class="tab on" data-view="activity"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17V9M8 17V4M13 17v-6M18 17V7"/></svg><span>Activity</span></button>
      <button class="tab" data-view="leadership"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8v5a4 4 0 0 1-8 0V3z"/><path d="M6 5H3v1a3 3 0 0 0 3 3"/><path d="M14 5h3v1a3 3 0 0 1-3 3"/><path d="M10 12v3"/><path d="M7 17h6"/></svg><span>Leadership</span></button>
    </nav>
  </header>
  <p class="sub" id="snapinfo"></p>
  <section class="stats" id="summary"></section>

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
      <div class="sel" id="sel" hidden></div>
      <div class="legend" id="legend"></div>
      <div class="chead">
        <span class="count" id="count"></span>
        <input id="filter" type="search" placeholder="Filter commits" autocomplete="off">
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
  var CROWN = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M3.5 15.5L1 6l4 2 5-5 5 5 4-2-2.5 9.5H3.5z"/></svg>';
  var METRICS = {
    score: { label: 'Score', unit: 'pts', val: function (p) { return p.commits * 10 + p.added + p.removed; } },
    commits: { label: 'Commits', unit: 'commits', val: function (p) { return p.commits; } },
    lines: { label: 'Lines', unit: 'lines', val: function (p) { return p.added + p.removed; } }
  };
  var narrow = window.innerWidth < 720;

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
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2] || 1));
  }
  function fmtDay(k) {
    if (!k) return '-';
    return parseDay(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtShort(k) {
    if (!k) return '-';
    var d = parseDay(k);
    var o = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString(undefined, o);
  }
  function fmtMonth(k) {
    return parseDay(k + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
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
  function labelOfKey(k) {
    if (S.mode === 'month') return fmtMonth(k);
    if (S.mode === 'week') return 'Week of ' + fmtShort(k);
    return fmtDay(k);
  }

  function ranked(metric) {
    var f = METRICS[metric].val;
    return D.people.slice().sort(function (a, b) {
      return f(b) - f(a) || b.commits - a.commits || (a.name < b.name ? -1 : 1);
    });
  }

  function renderSummary() {
    function card(cls, val, lab, sm) {
      return '<div class="stat ' + cls + '"><div class="val' + (sm ? ' sm' : '') + '">' + val + '</div><div class="lab">' + lab + '</div></div>';
    }
    $('summary').innerHTML =
      card('', num(D.total), 'Commits') +
      card('', num(D.people.length), 'Contributors') +
      card('add', '+' + num(D.added), 'Added') +
      card('del', '-' + num(D.removed), 'Removed') +
      card('span', esc(fmtDay(D.since)) + ' &rarr; ' + esc(fmtDay(D.generatedDay)), 'Period', true);
  }

  function renderPeople() {
    var max = 0;
    D.people.forEach(function (p) { max = Math.max(max, METRICS.score.val(p)); });
    var h = '<button class="person' + (S.who ? '' : ' on') + '" data-who="">' +
      '<span class="av all">All</span><span class="pi"><b>Everyone</b><i>' + D.people.length + ' contributors</i></span></button>';
    ranked('score').forEach(function (p, i) {
      var sc = METRICS.score.val(p);
      var pct = Math.max(2, Math.round(sc / (max || 1) * 100));
      h += '<button class="person' + (S.who === p.name ? ' on' : '') + '" data-who="' + esc(p.name) + '">' +
        '<span class="rk">' + (i === 0 ? CROWN : '#' + (i + 1)) + '</span>' +
        '<span class="av" style="background:' + p.color + '">' + esc(ini(p.name)) + '</span>' +
        '<span class="pi"><b>' + esc(p.name) + '</b><i>' + num(p.commits) + ' commits<span class="ln"> &middot; +' + num(p.added) + ' / -' + num(p.removed) + '</span></i>' +
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

  function renderSel(data) {
    var el = $('sel');
    if (!S.key) {
      el.hidden = true;
      return;
    }
    var total = 0;
    data.forEach(function (g) { if (g.key === S.key) total = g.total; });
    el.hidden = false;
    el.innerHTML = '<span><b>' + esc(labelOfKey(S.key)) + '</b> &middot; ' + num(total) + ' commits</span><button id="clearsel">Clear</button>';
  }

  function renderGraph(scrollEnd) {
    var wrap = $('graph');
    var prev = wrap.scrollLeft;
    var data = buckets();
    if (!data.length) {
      wrap.innerHTML = '<div class="empty">No data</div>';
      $('legend').innerHTML = '';
      $('sel').hidden = true;
      return;
    }
    var bw = S.mode === 'month' ? 36 : (narrow ? 22 : 26);
    var gap = S.mode === 'month' ? 24 : (narrow ? 12 : 14);
    var step = bw + gap;
    var padL = 32;
    var padR = 10;
    var H = narrow ? 190 : 230;
    var gH = H - 30;
    var W = padL + data.length * step + padR;
    var max = 0;
    data.forEach(function (g) { if (g.total > max) max = g.total; });
    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
    var lines = Math.min(4, Math.max(1, max));
    for (var i = 0; i <= lines; i++) {
      var y = gH - (gH / lines) * i;
      svg += '<line x1="' + (padL - 4) + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#242936" stroke-width="1"/>' +
        '<text x="' + (padL - 8) + '" y="' + (y + 3) + '" fill="#5f687d" font-size="10" text-anchor="end">' + Math.round(max / lines * i) + '</text>';
    }
    var skip = Math.max(1, Math.ceil(60 / step));
    data.forEach(function (g, idx) {
      var x = padL + idx * step;
      var on = g.key === S.key;
      var op = S.key && !on ? 0.25 : 0.92;
      if (!g.total) {
        svg += '<rect data-k="' + esc(g.key) + '" x="' + x + '" y="' + (gH - 2) + '" width="' + bw + '" height="2" rx="1" fill="#242936"><title>' + esc(g.key) + ': 0 commits</title></rect>';
      } else {
        var yOff = gH;
        Object.keys(g.per).sort().forEach(function (a) {
          var h = g.per[a] / max * gH;
          yOff -= h;
          svg += '<rect data-k="' + esc(g.key) + '" x="' + x + '" y="' + yOff + '" width="' + bw + '" height="' + Math.max(h, 1) + '" rx="2" fill="' + (COL[a] || '#5f687d') + '" opacity="' + op + '"><title>' + esc(g.key) + ' - ' + esc(a) + ': ' + g.per[a] + ' commits</title></rect>';
        });
        if (on) {
          var th = g.total / max * gH;
          svg += '<rect x="' + (x - 2) + '" y="' + (gH - th - 2) + '" width="' + (bw + 4) + '" height="' + (th + 4) + '" rx="3" fill="none" stroke="#fb923c" stroke-width="2" pointer-events="none"/>';
        }
      }
      if (idx % skip === 0) {
        var label = S.mode === 'month' ? g.key : g.key.slice(5);
        svg += '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" fill="' + (on ? '#fb923c' : '#8e97ab') + '" font-size="10" text-anchor="middle">' + esc(label) + '</text>';
      }
    });
    svg += '</svg>';
    wrap.innerHTML = svg;
    wrap.scrollLeft = scrollEnd ? wrap.scrollWidth : prev;
    renderSel(data);

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
    var note = D.truncated ? ' (latest ' + num(D.shown) + ' of ' + num(D.total) + ')' : '';
    $('count').textContent = shown.length + ' of ' + num(all.length) + ' commits' + note;
    if (!all.length) {
      var why = (D.truncated && (S.key || S.who))
        ? 'No commit messages for this selection. Only the latest ' + num(D.shown) + ' are included in the snapshot.'
        : 'No commits match your filter';
      $('clist').innerHTML = '<div class="empty">' + esc(why) + '</div>';
      return;
    }
    var h = '';
    shown.forEach(function (c) {
      h += '<div class="row"><span class="dot" style="background:' + (COL[c.a] || '#5f687d') + '"></span>' +
        '<div class="rb"><div class="msg">' + esc(c.m) + '</div>' +
        '<div class="meta"><code>' + esc(c.h) + '</code><span>' + esc(c.a) + '</span><span>' + esc(fmtShort(c.k)) + '</span></div></div>' +
        '<div class="ds"><span class="a">+' + num(c.p) + '</span><span class="d">-' + num(c.r) + '</span></div></div>';
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
        '<div class="head">' + (place === 1 ? '<span class="crown">' + CROWN + '</span>' : '') +
        '<div class="pav" style="background:' + p.color + '">' + esc(ini(p.name)) + '</div>' +
        '<div class="pn" title="' + esc(p.name) + '">' + esc(p.name) + '</div>' +
        '<div class="ps">' + num(p.commits) + ' commits</div></div>' +
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
      window.scrollTo(0, 0);
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
      window.scrollTo(0, 0);
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
    if (t.closest('#clearsel')) {
      S.key = '';
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

  var rz = 0;
  window.addEventListener('resize', function () {
    if (rz) clearTimeout(rz);
    rz = setTimeout(function () {
      var n = window.innerWidth < 720;
      if (n === narrow) return;
      narrow = n;
      renderView();
    }, 150);
  });

  $('snapinfo').textContent = 'Snapshot taken ' + new Date(D.generatedAt).toLocaleString() + '. Read-only: commit counts and messages, no file changes.';
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