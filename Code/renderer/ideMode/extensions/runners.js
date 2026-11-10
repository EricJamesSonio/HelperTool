function quote(kind, s) {
  if (kind === 'cmd') return '"' + String(s).replace(/"/g, '') + '"';
  if (kind === 'ps') return "'" + String(s).replace(/'/g, "''") + "'";
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function simple(prefix) {
  return (file, kind) => prefix + ' ' + quote(kind, file);
}

function compile(cc) {
  return (file, kind) => {
    const win = /^[a-zA-Z]:/.test(file);
    const out = file.replace(/\.[^./]+$/, '') + (win ? '.exe' : '.out');
    const q = (s) => quote(kind, s);
    if (kind === 'ps') return cc + ' ' + q(file) + ' -o ' + q(out) + '; if ($?) { & ' + q(out) + ' }';
    return cc + ' ' + q(file) + ' -o ' + q(out) + ' && ' + q(out);
  };
}

const RUNNERS = {
  py: { label: 'Python', build: simple('python') },
  pyw: { label: 'Python', build: simple('python') },
  js: { label: 'Node.js', build: simple('node') },
  mjs: { label: 'Node.js', build: simple('node') },
  cjs: { label: 'Node.js', build: simple('node') },
  ts: { label: 'TypeScript (tsx)', build: simple('npx tsx') },
  php: { label: 'PHP', build: simple('php') },
  c: { label: 'C (gcc)', build: compile('gcc') },
  cc: { label: 'C++ (g++)', build: compile('g++') },
  cpp: { label: 'C++ (g++)', build: compile('g++') },
  cxx: { label: 'C++ (g++)', build: compile('g++') },
};

function extOf(name) {
  const lower = String(name || '').toLowerCase();
  const i = lower.lastIndexOf('.');
  return i < 0 ? '' : lower.slice(i + 1);
}

export function runnerFor(name) {
  return RUNNERS[extOf(name)] || null;
}

export function buildCommand(name, file, kind) {
  const r = runnerFor(name);
  if (!r) return '';
  return r.build(String(file).replace(/\\/g, '/'), kind || 'sh');
}