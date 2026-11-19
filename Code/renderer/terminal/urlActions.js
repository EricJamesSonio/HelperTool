const ICON_VIEW = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="15" height="13" rx="1.5"/><path d="M2.5 7.5h15"/></svg>';
const ICON_OPEN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3h6v6"/><path d="M17 3l-8 8"/><path d="M15 11v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>';

const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})(?:\/[^\s"'<>)\]]*)?/gi;
const PORT_RE = /\b(?:listening|running|started|serving)\b[^\n]{0,60}?\bport\b\D{0,6}(\d{4,5})\b/i;
const TAIL_MAX = 400;

function cleanUrl(raw) {
  let url = String(raw).replace(/[.,;:!?]+$/, '');
  url = url.replace(/^(https?:\/\/)(?:0\.0\.0\.0|\[::\])/i, '$1localhost');
  return url;
}

function portOf(url) {
  const m = /:(\d{2,5})(?:\/|$)/.exec(String(url));
  return m ? Number(m[1]) : 0;
}

function addUrl(url, known, out) {
  const port = portOf(url);
  for (const u of known) {
    if (portOf(u) === port) return;
  }
  known.add(url);
  out.push(url);
}

function scanLine(line, known, out) {
  URL_RE.lastIndex = 0;
  let m;
  let hit = false;
  while ((m = URL_RE.exec(line)) !== null) {
    hit = true;
    addUrl(cleanUrl(m[0]), known, out);
  }
  if (hit) return;
  const p = PORT_RE.exec(line);
  if (!p) return;
  const port = Number(p[1]);
  if (port >= 1024 && port <= 65535) addUrl('http://localhost:' + port, known, out);
}

export function extractUrls(inst, data) {
  const text = (inst.urlTail || '') + String(data).replace(ANSI_RE, '');
  const parts = text.split(/\r\n|\n|\r/);
  inst.urlTail = (parts.pop() || '').slice(-TAIL_MAX);
  const found = [];
  for (const line of parts) {
    scanLine(line, inst.discoveredUrls, found);
  }
  return found;
}

function actionBtn(cls, icon, text, title, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = cls;
  btn.title = title;
  btn.innerHTML = icon + '<span>' + text + '</span>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function buildGroup(url, handlers) {
  const group = document.createElement('div');
  group.className = 'terminal-url-group';
  const label = document.createElement('span');
  label.className = 'terminal-url-label';
  label.textContent = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  label.title = url;
  group.appendChild(label);
  group.appendChild(actionBtn(
    'terminal-url-action terminal-url-action--view',
    ICON_VIEW,
    'View here',
    'Show this app inside the IDE',
    () => handlers.onView(url)
  ));
  group.appendChild(actionBtn(
    'terminal-url-action',
    ICON_OPEN,
    'Open in browser',
    'Open this app in your default browser',
    () => handlers.onExternal(url)
  ));
  return group;
}

export function renderUrlBar(bar, urls, handlers) {
  bar.innerHTML = '';
  for (const url of urls) {
    bar.appendChild(buildGroup(url, handlers));
  }
}