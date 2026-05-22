const _rgbaCache = new Map();

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}

function rgba(hex, alpha) {
  const key = `${hex}|${alpha}`;
  if (_rgbaCache.has(key)) return _rgbaCache.get(key);
  const { r, g, b } = hexToRgb(hex);
  const val = `rgba(${r},${g},${b},${alpha})`;
  _rgbaCache.set(key, val);
  return val;
}

export { rgba };
