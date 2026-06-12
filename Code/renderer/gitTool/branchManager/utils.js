export function isAnimated() {
  return localStorage.getItem('helpertool-branch-mode') !== 'pro';
}

export function formatBranch(name) {
  if (!name) return '';
  return name.replace(/^remotes\//, '');
}

export function branchColor(name) {
  if (!name) return '#4F8EF7';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

export function escHtml(text) {
  if (!text) return '';
  const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, c => m[c]);
}

export function timeAgo(dateIso) {
  if (!dateIso) return '';
  const now = Date.now();
  const then = new Date(dateIso).getTime();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const day = Math.floor(hr / 24);
  if (day < 30) return day + 'd ago';
  const mo = Math.floor(day / 30);
  if (mo < 12) return mo + 'mo ago';
  return Math.floor(mo / 12) + 'y ago';
}

export function parseDiff(diffText) {
  if (!diffText) return [];
  const lines = diffText.split('\n');
  const result = [];
  let oldLine = 0, newLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const m = line.match(/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (m) { oldLine = parseInt(m[1]); newLine = parseInt(m[2]); }
      result.push({ type: 'header', content: line, oldLine: null, newLine: null });
      continue;
    }
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('\\ ')) {
      continue;
    }
    if (line.startsWith('+')) {
      result.push({ type: 'add', content: line.slice(1), oldLine: null, newLine: newLine });
      newLine++;
      continue;
    }
    if (line.startsWith('-')) {
      result.push({ type: 'del', content: line.slice(1), oldLine: oldLine, newLine: null });
      oldLine++;
      continue;
    }
    result.push({ type: 'context', content: line, oldLine: oldLine, newLine: newLine });
    oldLine++;
    newLine++;
  }

  return result;
}
