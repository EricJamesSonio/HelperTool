export function maskValue(value) {
  if (!value) return '';
  return '\u2022'.repeat(Math.min(value.length, 16));
}

export function parseEnv(content) {
  const lines = content.split('\n');
  return lines.map(line => {
    if (line.startsWith('#')) return { key: null, value: null, comment: line };
    if (!line.trim()) return { key: null, value: null, comment: '' };
    const idx = line.indexOf('=');
    if (idx === -1) return { key: line.trim(), value: '', comment: null };
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return { key, value, comment: null };
  });
}

export function serializeEnv(entries) {
  return entries.map(e => {
    if (e.comment !== null && e.comment !== undefined) return e.comment;
    const val = e.value.includes(' ') || e.value.includes('"') || e.value.includes("'") ? `"${e.value}"` : e.value;
    return `${e.key}=${val}`;
  }).join('\n');
}

export function escHtml(text) {
  if (!text) return '';
  const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, c => m[c]);
}
