const MAP = {
  py: ['python'],
  pyw: ['python'],
  js: ['js'],
  mjs: ['js'],
  cjs: ['js'],
  jsx: ['js', 'react'],
  ts: ['js'],
  tsx: ['js', 'react'],
  php: ['php'],
  vue: ['vue'],
  astro: ['astro'],
  cs: ['dotnet'],
  c: ['cpp'],
  cc: ['cpp'],
  cpp: ['cpp'],
  cxx: ['cpp'],
  h: ['cpp'],
  hh: ['cpp'],
  hpp: ['cpp'],
  hxx: ['cpp'],
};

export function stacksForFile(name) {
  const lower = String(name || '').toLowerCase();
  const i = lower.lastIndexOf('.');
  const e = i < 0 ? '' : lower.slice(i + 1);
  const ids = (MAP[e] || []).slice();
  if (lower.endsWith('.blade.php')) ids.push('laravel');
  return ids;
}