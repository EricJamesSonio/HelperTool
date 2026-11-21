const LANG_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572a5',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Vue: '#41b883',
  PHP: '#4f5d95',
  'C#': '#178600',
  'C++': '#f34b7d',
  C: '#555555',
  Java: '#b07219',
  Go: '#00add8',
  Rust: '#dea584',
  Ruby: '#701516',
  Shell: '#89e051',
  PowerShell: '#012456',
  Dockerfile: '#384d54',
  Astro: '#ff5a03',
  Svelte: '#ff3e00',
  Kotlin: '#a97bff',
  Swift: '#f05138',
  Dart: '#00b4ab',
};

export function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function num(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(v);
}

export function ago(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  const months = Math.floor(days / 30);
  if (months < 12) return months + 'mo ago';
  return Math.floor(months / 12) + 'y ago';
}

export function dateLong(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function sizeKb(kb) {
  const v = Number(kb) || 0;
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' GB';
  if (v >= 1024) return (v / 1024).toFixed(1) + ' MB';
  return v + ' KB';
}

export function langColor(name) {
  if (LANG_COLORS[name]) return LANG_COLORS[name];
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return 'hsl(' + h + ', 55%, 55%)';
}

export function initial(name) {
  const s = String(name || '?').trim();
  return s ? s.charAt(0).toUpperCase() : '?';
}