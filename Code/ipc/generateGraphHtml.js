function buildGraphHtml(visData, title) {
  const data = visData || {};
  const nodes = data.nodes || [];
  const edges = data.edges || [];
  const stats = data.stats || {};
  const communities = data.communities || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title || 'Graphify - Knowledge Graph'}</title>
<script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#050807;color:#dff5e6;height:100vh;overflow:hidden}
#app{display:flex;height:100vh}
#sidebar{width:260px;background:rgba(10,20,14,0.95);border-right:1px solid rgba(34,255,122,0.1);padding:16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;flex-shrink:0}
#graph-container{flex:1;position:relative}
#graph{width:100%;height:100%}
.search-box{position:relative}
.search-box input{width:100%;padding:8px 12px;background:rgba(10,20,14,0.8);border:1px solid rgba(34,255,122,0.2);border-radius:8px;color:#dff5e6;font-size:13px;outline:none}
.search-box input:focus{border-color:rgba(34,255,122,0.5)}
.search-box input::placeholder{color:#43594c}
.search-results{position:absolute;top:100%;left:0;right:0;background:#0a140e;border:1px solid rgba(34,255,122,0.15);border-radius:0 0 8px 8px;max-height:200px;overflow-y:auto;display:none;z-index:10}
.search-result-item{padding:6px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid rgba(34,255,122,0.05)}
.search-result-item:hover{background:rgba(34,255,122,0.1)}
.sidebar-section{margin-bottom:4px}
.sidebar-section h3{font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#5c7a68;margin-bottom:6px;font-weight:600}
.community-item{display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:12px}
.community-item:hover{opacity:0.8}
.community-color{width:12px;height:12px;border-radius:50%;flex-shrink:0;border:1px solid rgba(255,255,255,0.1)}
.community-count{margin-left:auto;color:#5c7a68;font-size:10px}
.stats{font-size:11px;color:#8fae9c;padding:8px 12px;background:rgba(10,20,14,0.5);border-radius:8px;border:1px solid rgba(34,255,122,0.08)}
.stats span{display:inline-block;margin-right:12px}
.stats strong{color:#22ff7a}
.node-detail{display:none;padding:12px;background:rgba(10,20,14,0.8);border:1px solid rgba(34,255,122,0.15);border-radius:8px;font-size:12px;line-height:1.5}
.node-detail.show{display:block}
.node-detail .label{color:#22ff7a;font-weight:600;font-size:14px}
.node-detail .meta{color:#8fae9c;margin-top:4px}
.node-detail .meta span{display:block}
</style>
</head>
<body>
<div id="app">
  <div id="sidebar">
    <div style="font-size:14px;font-weight:700;color:#22ff7a;padding-bottom:8px;border-bottom:1px solid rgba(34,255,122,0.15);letter-spacing:0.3px;">Graphify</div>

    <div class="search-box">
      <input type="text" id="searchInput" placeholder="Search nodes..." autocomplete="off" spellcheck="false">
      <div class="search-results" id="searchResults"></div>
    </div>

    <div class="sidebar-section">
      <div class="stats">
        <span><strong>${stats.totalNodes || 0}</strong> nodes</span>
        <span><strong>${stats.totalEdges || 0}</strong> edges</span>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="node-detail" id="nodeDetail"></div>
    </div>

    <div class="sidebar-section" style="flex:1;overflow-y:auto;">
      <h3>Communities (${communities.length || 0})</h3>
      <div id="communityList">
        ${(communities || []).map(c => `
          <div class="community-item" data-community="${c.id}">
            <span class="community-color" style="background:${c.color || '#22ff7a'}"></span>
            <span>Community ${(c.id || 0) + 1}</span>
            <span class="community-count">${c.nodeCount || 0}</span>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <div id="graph-container">
    <div id="graph"></div>
  </div>
</div>

<script>
var rawNodes = ${JSON.stringify(nodes)};
var rawEdges = ${JSON.stringify(edges)};

var nodes = new vis.DataSet(rawNodes);
var edges = new vis.DataSet(rawEdges);

var container = document.getElementById('graph');
var network = new vis.Network(container, { nodes: nodes, edges: edges }, {
  physics: { stabilization: { iterations: 100 }, solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -40, centralGravity: 0.005, springLength: 120, springConstant: 0.02, damping: 0.4 } },
  edges: { arrows: { to: { enabled: true, scaleFactor: 0.5 } }, smooth: { type: 'continuous' }, font: { size: 8, color: '#5c7a68' } },
  nodes: { borderWidth: 1, borderWidthSelected: 2 },
  interaction: { hover: true, tooltipDelay: 200, navigationButtons: true, keyboard: { enabled: true } },
  manipulation: { enabled: false },
  groups: { 0: { shape: 'box', color: { background: '#1a1a2e', border: '#22ff7a' } }, 1: { shape: 'dot' } }
});

network.on('click', function(params) {
  if (params.nodes.length > 0) {
    var nodeId = params.nodes[0];
    var node = rawNodes.find(function(n) { return n.id === nodeId; });
    var detail = document.getElementById('nodeDetail');
    if (node) {
      detail.innerHTML = '<div class="label">' + (node.label || '') + '</div><div class="meta"><span>Type: ' + (node.type || 'unknown') + '</span><span>File: ' + (node.filePath || '-') + '</span><span>Degree: ' + (node.size || 0) + '</span></div>';
      detail.classList.add('show');
    }
  }
});

document.getElementById('searchInput').addEventListener('input', function() {
  var q = this.value.trim().toLowerCase();
  var results = document.getElementById('searchResults');
  if (!q) { results.style.display = 'none'; return; }
  var matches = rawNodes.filter(function(n) { return n.label && (n.label.toLowerCase().indexOf(q) !== -1 || (n.title && n.title.toLowerCase().indexOf(q) !== -1)); }).slice(0, 10);
  if (matches.length === 0) { results.style.display = 'none'; return; }
  results.innerHTML = matches.map(function(m) { return '<div class="search-result-item" data-id="' + m.id + '">' + m.label + '</div>'; }).join('');
  results.style.display = 'block';
});

document.getElementById('searchResults').addEventListener('click', function(e) {
  var item = e.target.closest('.search-result-item');
  if (!item) return;
  var nodeId = item.dataset.id;
  network.focus(nodeId, { scale: 2, animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
  network.selectNodes([nodeId]);
  document.getElementById('searchResults').style.display = 'none';
  document.getElementById('searchInput').value = '';
});

document.addEventListener('click', function(e) {
  if (!e.target.closest('.search-box')) {
    document.getElementById('searchResults').style.display = 'none';
  }
});

document.getElementById('communityList').addEventListener('click', function(e) {
  var item = e.target.closest('.community-item');
  if (!item) return;
  var commId = parseInt(item.dataset.community);
  var ids = rawNodes.filter(function(n) { return n.group === commId || n.community === commId; }).map(function(n) { return n.id; });
  if (ids.length > 0) {
    network.selectNodes(ids);
    network.fit({ animation: true });
  }
});
<\/script>
</body>
</html>`;
}

module.exports = { buildGraphHtml };
