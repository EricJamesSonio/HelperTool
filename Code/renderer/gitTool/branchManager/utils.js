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
