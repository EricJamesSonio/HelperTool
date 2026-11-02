const MAX_FILES_ANALYZED = 40;
const MAX_TEXT = 300000;
const SUBJECT_MAX = 72;
const BODY_FILE_MAX = 10;
const PHRASE_MAX = 170;
const FETCH_CONCURRENCY = 6;

const JS_EXT = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'svelte']);
const MARKUP_EXT = new Set(['jsx', 'tsx', 'vue', 'svelte', 'html', 'htm', 'php']);
const COMPONENT_EXT = new Set(['tsx', 'jsx', 'vue', 'svelte']);
const STYLE_EXT = new Set(['css', 'scss', 'sass', 'less']);
const DOC_EXT = new Set(['md', 'mdx', 'txt', 'rst']);
const CONFIG_EXT = new Set(['json', 'yml', 'yaml', 'toml', 'ini', 'xml']);
const HASH_COMMENT_EXT = new Set(['py', 'rb', 'sh', 'yml', 'yaml', 'toml']);

const BINARY_RE = /\.(png|jpe?g|gif|webp|ico|svg|bmp|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|wav|pdf|zip|gz|tar|7z|exe|dll|wasm|db|sqlite)$/i;
const TEST_RE = /(^|\/)(__tests?__|tests?|spec)\/|\.(test|spec)\.[A-Za-z]+$/i;
const SPECIAL_NAME_RE = /^(package(-lock)?\.json|tsconfig[\w.]*\.json|\.[\w.]+|Dockerfile|Makefile|README\.md)$/i;

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'with', 'do', 'try']);
const TAG_ORDER = ['logic', 'UI', 'types', 'imports', 'styles', 'dependencies', 'config', 'tests', 'docs', 'comments', 'formatting', 'tweaks'];

const RE = {
  jsFunction: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[(<]/,
  jsArrow: /^\s*(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=>]+)?=>|[A-Za-z_$][\w$]*\s*=>|(?:React\.)?(?:memo|forwardRef)\(|use(?:Callback|Memo)\()/,
  jsClass: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  jsMethod: /^\s{2,}(?:(?:public|private|protected|static|async|override|readonly)\s+)*(?:get\s+|set\s+)?\*?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{=]+)?\{\s*$/,
  jsProp: /^\s{2,}([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
  tsType: /^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
  pyDef: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/,
  pyClass: /^\s*class\s+([A-Za-z_]\w*)/,
  rbDef: /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!]?)/,
  goFunc: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/,
  rsFn: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/,
  hook: /\buse[A-Z][\w$]*(?=\s*[(<])/g,
  testCase: /^\s*(?:it|test|describe)(?:\.\w+)?\(\s*(['"`])(.+?)\1/,
  pyTest: /^\s*(?:async\s+)?def\s+(test_\w+)/,
};

// ---------- small helpers ----------

function extOf(file) {
  const m = /\.([A-Za-z0-9]+)$/.exec(file || '');
  return m ? m[1].toLowerCase() : '';
}

function baseOf(file) {
  return (file || '').split('/').pop() || file || '';
}

function shortPath(file) {
  const segs = (file || '').split('/').filter(Boolean);
  const base = segs[segs.length - 1] || file;
  if (/^index\./i.test(base) && segs.length > 1) return segs.slice(-2).join('/');
  return base;
}

function plain(items, max = 3) {
  const arr = [...new Set(items)].filter(Boolean);
  if (arr.length <= max) return arr.join(', ');
  return arr.slice(0, max).join(', ') + ' +' + (arr.length - max) + ' more';
}

function list(items, max = 3) {
  const arr = [...new Set(items)].filter(Boolean);
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  if (arr.length <= max) return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  return arr.slice(0, max).join(', ') + ' +' + (arr.length - max) + ' more';
}

function humanName(file) {
  const baseName = baseOf(file);
  if (SPECIAL_NAME_RE.test(baseName)) return baseName;
  const segs = (file || '').split('/').filter(Boolean);
  let base = (segs.pop() || file).replace(/\.[^.]+$/, '');
  base = base.replace(/\.(test|spec|stories|d)$/i, '');
  if (/^index$/i.test(base) && segs.length) base = segs[segs.length - 1];
  if (/^use[A-Z]/.test(base)) return base;
  const words = base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim();
  if (!words) return base;
  return words
    .split(/\s+/)
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()))
    .join(' ');
}

function squash(s) {
  return String(s).replace(/\s+/g, '');
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------- diff parsing ----------

function parseDiff(diff) {
  const out = { hunks: [], added: [], removed: [], binary: false };
  if (!diff) return out;
  if (/^Binary files .* differ/m.test(diff)) out.binary = true;
  let cur = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      const m = /^@@ [^@]*@@ ?(.*)$/.exec(line);
      cur = { context: m ? m[1].trim() : '', added: [], removed: [] };
      out.hunks.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('\\')) continue;
    if (line.startsWith('+')) {
      cur.added.push(line.slice(1));
      out.added.push(line.slice(1));
    } else if (line.startsWith('-')) {
      cur.removed.push(line.slice(1));
      out.removed.push(line.slice(1));
    }
  }
  return out;
}

function parsedFromContent(content) {
  const lines = String(content || '').split('\n');
  return { hunks: [{ context: '', added: lines, removed: [] }], added: lines, removed: [], binary: false };
}

// ---------- line classification ----------

function isTrivialLine(line, ext) {
  const t = line.trim();
  if (!t) return true;
  if (/^(\/\/|\/\*|\*|\*\/|<!--|-->)/.test(t)) return true;
  if (HASH_COMMENT_EXT.has(ext) && t.startsWith('#')) return true;
  return false;
}

function isBracketOnly(line) {
  return /^[\s{}\[\]();,]*$/.test(line);
}

function compKind(name, ext) {
  return /^[A-Z]/.test(name) && COMPONENT_EXT.has(ext) ? 'component' : 'function';
}

function declFromLine(line, ext) {
  if (!line) return null;
  let m;
  if (JS_EXT.has(ext) || ext === 'php') {
    if ((m = RE.tsType.exec(line))) return { name: m[1], kind: 'type' };
    if ((m = RE.jsFunction.exec(line))) return { name: m[1], kind: compKind(m[1], ext) };
    if ((m = RE.jsArrow.exec(line))) return { name: m[1], kind: compKind(m[1], ext) };
    if ((m = RE.jsClass.exec(line))) return { name: m[1], kind: 'class' };
    if ((m = RE.jsMethod.exec(line)) && !KEYWORDS.has(m[1])) return { name: m[1], kind: 'method' };
    if ((m = RE.jsProp.exec(line))) return { name: m[1], kind: 'method' };
    return null;
  }
  if (ext === 'py') {
    if ((m = RE.pyDef.exec(line))) return { name: m[1], kind: 'function' };
    if ((m = RE.pyClass.exec(line))) return { name: m[1], kind: 'class' };
    return null;
  }
  if (ext === 'rb') {
    if ((m = RE.rbDef.exec(line))) return { name: m[1], kind: 'function' };
    if ((m = RE.pyClass.exec(line))) return { name: m[1], kind: 'class' };
    return null;
  }
  if (ext === 'go') {
    if ((m = RE.goFunc.exec(line))) return { name: m[1], kind: 'function' };
    return null;
  }
  if (ext === 'rs') {
    if ((m = RE.rsFn.exec(line))) return { name: m[1], kind: 'function' };
    return null;
  }
  if ((m = RE.pyClass.exec(line)) || (m = RE.jsClass.exec(line))) return { name: m[1], kind: 'class' };
  return null;
}

function collectDecls(lines, ext) {
  const fns = new Map();
  const types = new Map();
  const top = [];
  for (const line of lines) {
    const d = declFromLine(line, ext);
    if (!d) continue;
    if (d.kind === 'type') {
      if (!types.has(d.name)) types.set(d.name, d.kind);
    } else if (!fns.has(d.name)) {
      fns.set(d.name, d.kind);
    }
    if (!/^\s/.test(line) && !top.some((t) => t.name === d.name)) top.push(d);
  }
  return { fns, types, top };
}

function showDecl(d) {
  return d.kind === 'function' || d.kind === 'method' ? d.name + '()' : d.name;
}

// ---------- imports ----------

function shortSource(src) {
  const last = String(src).split('/').filter(Boolean).pop() || String(src);
  return last.replace(/\.(js|jsx|ts|tsx|mjs|cjs)$/, '');
}

function namesFromClause(clause) {
  const names = [];
  const brace = /\{([^}]*)\}/.exec(clause);
  if (brace) {
    for (const part of brace[1].split(',')) {
      const n = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (n) names.push(n);
    }
  }
  const rest = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
  if (rest) {
    const ns = /\*\s+as\s+(\w+)/.exec(rest);
    if (ns) names.push(ns[1]);
    else names.push(rest.split(/\s+/)[0]);
  }
  return names;
}

function parseImport(line, ext) {
  let m;
  if (ext === 'py') {
    if ((m = /^\s*from\s+(\S+)\s+import\s+(.+)$/.exec(line))) {
      const names = m[2].replace(/[()]/g, '').split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      return { source: m[1], names };
    }
    if ((m = /^\s*import\s+([\w.]+)/.exec(line))) return { source: m[1], names: [] };
    return null;
  }
  if (!JS_EXT.has(ext)) return null;
  if ((m = /^\s*import\s+(?:type\s+)?([^'"]+?)\s+from\s*['"]([^'"]+)['"]/.exec(line))) {
    return { source: m[2], names: namesFromClause(m[1]) };
  }
  if ((m = /^\s*import\s*['"]([^'"]+)['"]/.exec(line))) return { source: m[1], names: [] };
  if ((m = /(?:const|let|var)\s+([^=]+?)\s*=\s*(?:await\s+)?require\(\s*['"]([^'"]+)['"]\s*\)/.exec(line))) {
    return { source: m[2], names: namesFromClause(m[1]) };
  }
  if ((m = /^\s*}\s*from\s*['"]([^'"]+)['"]/.exec(line))) return { source: m[1], names: [] };
  return null;
}

function diffImports(added, removed, ext) {
  const add = new Map();
  const rem = new Map();
  const put = (map, p) => {
    if (!map.has(p.source)) map.set(p.source, new Set());
    p.names.forEach((n) => map.get(p.source).add(n));
  };
  for (const l of added) { const p = parseImport(l, ext); if (p) put(add, p); }
  for (const l of removed) { const p = parseImport(l, ext); if (p) put(rem, p); }

  const addedLabels = [];
  const removedLabels = [];
  for (const [src, names] of add) {
    const before = rem.get(src);
    const net = [...names].filter((n) => !before || !before.has(n));
    if (net.length) addedLabels.push(...net);
    else if (!before && names.size === 0) addedLabels.push(shortSource(src));
  }
  for (const [src, names] of rem) {
    const after = add.get(src);
    const net = [...names].filter((n) => !after || !after.has(n));
    if (net.length) removedLabels.push(...net);
    else if (!after && names.size === 0) removedLabels.push(shortSource(src));
  }
  return { added: addedLabels, removed: removedLabels };
}

// ---------- phrase helpers ----------

function describeFns(verb, items) {
  const out = [];
  const groups = { function: [], component: [], class: [] };
  for (const it of items) {
    const key = it.kind === 'method' ? 'function' : it.kind;
    (groups[key] || groups.function).push(it.name);
  }
  if (groups.function.length) {
    out.push(verb + ' ' + list(groups.function.map((n) => n + '()')) + (verb === 'update' ? ' logic' : ''));
  }
  if (groups.component.length) {
    out.push(verb + ' ' + list(groups.component) + (groups.component.length > 1 ? ' components' : ' component'));
  }
  if (groups.class.length) {
    out.push(verb + ' ' + list(groups.class) + (groups.class.length > 1 ? ' classes' : ' class'));
  }
  return out;
}

function hooksIn(lines, declared) {
  const set = new Set();
  for (const l of lines) {
    for (const m of l.matchAll(RE.hook)) {
      if (!declared.has(m[0])) set.add(m[0]);
    }
  }
  return set;
}

function countMarkup(lines) {
  let n = 0;
  for (const l of lines) {
    if (/^\s*<\/?[A-Za-z]/.test(l) || /\/>\s*$/.test(l) || /className=|style=\{/.test(l)) n++;
  }
  return n;
}

// ---------- per-category analyzers ----------

function analyzeCode(parsed, info) {
  const { ext } = info;
  const phrases = [];
  const tags = [];
  const added = parsed.added;
  const removed = parsed.removed;
  const a = collectDecls(added, ext);
  const r = collectDecls(removed, ext);
  const markup = MARKUP_EXT.has(ext) ? countMarkup([...added, ...removed]) : 0;

  if (info.isNew) {
    phrases.push(a.top.length ? 'defines ' + plain(a.top.map(showDecl), 4) : 'new file');
    if (a.fns.size) tags.push('logic');
    if (markup > 0) tags.push('UI');
    if (a.types.size) tags.push('types');
    return { phrases, tags };
  }

  const allChanged = [...added, ...removed];
  const meaningful = allChanged.filter((l) => !isTrivialLine(l, ext));
  if (allChanged.length && meaningful.length === 0) {
    return { phrases: ['update comments'], tags: ['comments'] };
  }
  const normAdd = added.map(squash).filter(Boolean).sort().join('\n');
  const normRem = removed.map(squash).filter(Boolean).sort().join('\n');
  if (added.length && normAdd === normRem) {
    return { phrases: ['reformat code'], tags: ['formatting'] };
  }

  const fnAdded = [];
  const fnRemoved = [];
  const fnChanged = new Map();
  for (const [n, k] of a.fns) {
    if (!r.fns.has(n)) fnAdded.push({ name: n, kind: k });
    else fnChanged.set(n, k);
  }
  for (const [n, k] of r.fns) {
    if (!a.fns.has(n)) fnRemoved.push({ name: n, kind: k });
  }

  const typesAdded = [...a.types.keys()].filter((n) => !r.types.has(n));
  const typesRemoved = [...r.types.keys()].filter((n) => !a.types.has(n));
  const typesChanged = new Set([...a.types.keys()].filter((n) => r.types.has(n)));

  const newOnly = new Set(fnAdded.map((f) => f.name));
  const goneOnly = new Set(fnRemoved.map((f) => f.name));
  for (const h of parsed.hunks) {
    const ctx = declFromLine(h.context, ext);
    if (!ctx) continue;
    const body = [...h.added, ...h.removed].filter(
      (l) => !isTrivialLine(l, ext) && !isBracketOnly(l) && !parseImport(l, ext)
    );
    if (!body.length) continue;
    if (!body.some((l) => /^[ \t]/.test(l))) continue;
    if (ctx.kind === 'type') {
      typesChanged.add(ctx.name);
    } else if (!newOnly.has(ctx.name) && !goneOnly.has(ctx.name)) {
      fnChanged.set(ctx.name, ctx.kind);
    }
  }

  const declared = new Set([...a.fns.keys(), ...r.fns.keys()]);
  const hooksAddedSet = hooksIn(added, declared);
  const hooksRemovedSet = hooksIn(removed, declared);
  const hooksAdded = [...hooksAddedSet].filter((n) => !hooksRemovedSet.has(n));
  const hooksRemoved = [...hooksRemovedSet].filter((n) => !hooksAddedSet.has(n));

  const imp = diffImports(added, removed, ext);

  const changedItems = [...fnChanged].map(([name, kind]) => ({ name, kind }));
  phrases.push(...describeFns('update', changedItems));
  phrases.push(...describeFns('add', fnAdded));
  phrases.push(...describeFns('remove', fnRemoved));
  if (typesAdded.length) phrases.push('add types (' + plain(typesAdded) + ')');
  if (typesChanged.size) phrases.push('update types (' + plain([...typesChanged]) + ')');
  if (typesRemoved.length) phrases.push('remove types (' + plain(typesRemoved) + ')');
  if (hooksAdded.length) phrases.push('add hooks (' + plain(hooksAdded) + ')');
  if (hooksRemoved.length) phrases.push('remove hooks (' + plain(hooksRemoved) + ')');
  if (imp.added.length) phrases.push('add imports (' + plain(imp.added, 4) + ')');
  if (imp.removed.length) phrases.push('remove imports (' + plain(imp.removed, 4) + ')');
  if (markup > 0 && changedItems.length === 0 && fnAdded.length === 0) phrases.push('update UI markup');

  if (changedItems.length || fnAdded.length || fnRemoved.length || hooksAdded.length || hooksRemoved.length) tags.push('logic');
  if (markup > 0) tags.push('UI');
  if (typesAdded.length || typesChanged.size || typesRemoved.length) tags.push('types');
  if (imp.added.length || imp.removed.length) tags.push('imports');

  if (!phrases.length) {
    phrases.push('tweak code (+' + added.length + '/-' + removed.length + ' lines)');
    tags.push('tweaks');
  }
  return { phrases, tags };
}

function testNames(lines, ext) {
  const set = new Set();
  for (const l of lines) {
    let m;
    if (ext === 'py') {
      if ((m = RE.pyTest.exec(l))) set.add(m[1]);
    } else if ((m = RE.testCase.exec(l))) {
      set.add(m[2]);
    }
  }
  return set;
}

function analyzeTests(parsed, info) {
  const { ext } = info;
  const a = testNames(parsed.added, ext);
  const r = testNames(parsed.removed, ext);
  const phrases = [];
  const added = [...a].filter((n) => !r.has(n));
  const removed = [...r].filter((n) => !a.has(n));
  if (info.isNew) {
    phrases.push(added.length ? 'adds tests (' + plain(added, 2) + ')' : 'new test file');
  } else {
    if (added.length) phrases.push('add tests (' + plain(added, 2) + ')');
    if (removed.length) phrases.push('remove tests (' + plain(removed, 2) + ')');
    if (!phrases.length) phrases.push('update test cases');
  }
  return { phrases, tags: ['tests'] };
}

function selectorSet(lines) {
  const set = new Set();
  for (const l of lines) {
    const m = /^\s*([^{};@][^{}]*?)\s*\{\s*$/.exec(l);
    if (m) set.add(m[1].trim().replace(/\s+/g, ' '));
  }
  return set;
}

function analyzeStyle(parsed, info) {
  const a = selectorSet(parsed.added);
  const r = selectorSet(parsed.removed);
  if (info.isNew) {
    return { phrases: [a.size ? 'defines ' + plain([...a], 3) : 'new stylesheet'], tags: ['styles'] };
  }
  const phrases = [];
  const addedSel = [...a].filter((s) => !r.has(s));
  const removedSel = [...r].filter((s) => !a.has(s));
  const changed = new Set();
  for (const h of parsed.hunks) {
    const ctx = h.context.replace(/\s*\{\s*$/, '').trim();
    if (ctx && !ctx.startsWith('@') && (h.added.length || h.removed.length)) changed.add(ctx);
  }
  for (const s of a) if (r.has(s)) changed.add(s);
  if (addedSel.length) phrases.push('add styles (' + plain(addedSel) + ')');
  if (changed.size) phrases.push('update styles (' + plain([...changed]) + ')');
  if (removedSel.length) phrases.push('remove styles (' + plain(removedSel) + ')');
  if (!phrases.length) phrases.push('update styles (+' + parsed.added.length + '/-' + parsed.removed.length + ' lines)');
  return { phrases, tags: ['styles'] };
}

function analyzePackage(parsed, info) {
  const verRe = /^\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/;
  const isVersion = (v) => /^[\^~<>=*\s]*\d/.test(v) || /^(latest|\*|workspace:|file:|git|github:|npm:|link:)/.test(v);
  const skip = new Set(['node', 'npm']);
  const add = new Map();
  const rem = new Map();
  let versionBumped = false;
  for (const l of parsed.added) {
    const m = verRe.exec(l);
    if (!m) continue;
    if (m[1] === 'version') { versionBumped = true; continue; }
    if (isVersion(m[2]) && !skip.has(m[1])) add.set(m[1], m[2]);
  }
  for (const l of parsed.removed) {
    const m = verRe.exec(l);
    if (m && m[1] !== 'version' && isVersion(m[2]) && !skip.has(m[1])) rem.set(m[1], m[2]);
  }
  const addedDeps = [...add.keys()].filter((k) => !rem.has(k));
  const removedDeps = [...rem.keys()].filter((k) => !add.has(k));
  const bumped = [...add.keys()].filter((k) => rem.has(k) && rem.get(k) !== add.get(k));
  const scripts = parsed.hunks.some((h) => /"scripts"/.test(h.context)) ||
    [...parsed.added, ...parsed.removed].some((l) => /^\s*"(build|dev|start|test|lint|serve|preview|prepare|postinstall)"\s*:/.test(l));

  const phrases = [];
  const tags = [];
  if (addedDeps.length) phrases.push('add dependencies (' + plain(addedDeps, 4) + ')');
  if (removedDeps.length) phrases.push('remove dependencies (' + plain(removedDeps, 4) + ')');
  if (bumped.length) phrases.push('bump ' + plain(bumped, 4));
  if (versionBumped) phrases.push('bump package version');
  if (addedDeps.length || removedDeps.length || bumped.length) tags.push('dependencies');
  if (scripts) { phrases.push('update scripts'); tags.push('config'); }
  if (!phrases.length) { phrases.push('update package config'); tags.push('config'); }
  return { phrases, tags };
}

function analyzeConfig(parsed, info) {
  if (info.isNew) return { phrases: ['new config file'], tags: ['config'] };
  const keys = new Set();
  for (const l of [...parsed.added, ...parsed.removed]) {
    const m = /^\s*"?([\w.\-@/]+)"?\s*:/.exec(l);
    if (m) keys.add(m[1]);
  }
  return {
    phrases: [keys.size ? 'update config (' + plain([...keys], 3) + ')' : 'update config'],
    tags: ['config'],
  };
}

function analyzeDoc(parsed, info) {
  if (info.isNew) return { phrases: ['new document'], tags: ['docs'] };
  const heads = new Set();
  for (const l of parsed.added) {
    const m = /^#{1,6}\s+(.+)$/.exec(l);
    if (m) heads.add(m[1].trim());
  }
  return {
    phrases: [heads.size ? 'update docs (' + plain([...heads], 2) + ')' : 'update docs'],
    tags: ['docs'],
  };
}

// ---------- per-file entry ----------

export function analyzeFile({ file, status, diff, content }) {
  const ext = extOf(file);
  const base = baseOf(file);
  const info = {
    file,
    base,
    status,
    ext,
    name: humanName(file),
    isNew: status === 'A' || status === '?',
    isDeleted: status === 'D',
    phrases: [],
    tags: [],
  };

  if (info.isDeleted) { info.phrases.push('remove file'); return info; }
  if (BINARY_RE.test(file)) { info.phrases.push(info.isNew ? 'add asset' : 'update asset'); return info; }

  let parsed = parseDiff(diff || '');
  if (parsed.binary) { info.phrases.push('update binary file'); return info; }
  if (!parsed.hunks.length && content) parsed = parsedFromContent(content);
  if (!parsed.hunks.length) {
    info.phrases.push(info.isNew ? 'new file' : 'update file');
    return info;
  }

  let res;
  try {
    if (TEST_RE.test(file) && (JS_EXT.has(ext) || ext === 'py')) res = analyzeTests(parsed, info);
    else if (STYLE_EXT.has(ext)) res = analyzeStyle(parsed, info);
    else if (base === 'package.json') res = analyzePackage(parsed, info);
    else if (DOC_EXT.has(ext)) res = analyzeDoc(parsed, info);
    else if (CONFIG_EXT.has(ext)) res = analyzeConfig(parsed, info);
    else res = analyzeCode(parsed, info);
  } catch (err) {
    res = { phrases: ['update ' + (ext || 'file')], tags: [] };
  }

  info.phrases = res.phrases && res.phrases.length ? res.phrases : ['update file'];
  info.tags = res.tags || [];
  return info;
}

// ---------- message building ----------

function aggregateTags(infos) {
  const set = new Set();
  infos.forEach((i) => i.tags.forEach((t) => set.add(t)));
  const ordered = TAG_ORDER.filter((t) => set.has(t));
  const real = ordered.filter((t) => t !== 'tweaks');
  return real.length ? real : ordered;
}

function buildSubject(infos, extraCount, fallbackRest) {
  const allNew = infos.every((i) => i.isNew);
  const allDeleted = infos.every((i) => i.isDeleted);
  const verb = allDeleted ? 'Remove' : allNew ? 'Add' : 'Update';
  const names = [...new Set(infos.map((i) => i.name))];

  let target = '';
  if (extraCount === 0 && names.length <= 3) target = list(names, 3);
  if (!target || target.length > 46) {
    target = fallbackRest || (names.length === 1 ? names[0] : (infos.length + extraCount) + ' files');
  }

  const tags = allNew || allDeleted ? [] : aggregateTags(infos).slice(0, 2);
  let subject = verb + ' ' + target;
  const withTags = tags.length ? subject + ': ' + tags.join(', ') : subject;
  subject = withTags.length <= SUBJECT_MAX ? withTags : subject;
  if (subject.length > SUBJECT_MAX) subject = subject.slice(0, SUBJECT_MAX - 1).trimEnd() + '\u2026';
  return subject;
}

function buildBody(infos, extraCount) {
  const lines = infos.slice(0, BODY_FILE_MAX).map((i) => {
    const label = shortPath(i.file) + (i.isNew ? ' (new)' : i.isDeleted ? ' (removed)' : '');
    let text = i.phrases.join('; ');
    if (text.length > PHRASE_MAX) text = text.slice(0, PHRASE_MAX - 1).trimEnd() + '\u2026';
    return '- ' + label + ': ' + text;
  });
  const more = infos.length - BODY_FILE_MAX + extraCount;
  if (more > 0) lines.push('- +' + more + ' more file' + (more !== 1 ? 's' : ''));
  return lines.join('\n');
}

/**
 * Build a commit message for one smart group.
 * @param {{files: Array<{file:string,status:string}>}} group
 * @param {{getDiff:(file:string)=>Promise<string>, readFile:(file:string)=>Promise<string>, fallback:()=>string}} deps
 */
export async function buildGroupMessage(group, deps) {
  const { getDiff, readFile, fallback } = deps || {};
  const files = (group && group.files) || [];
  if (!files.length) return fallback ? fallback() : 'Update files';

  const slice = files.slice(0, MAX_FILES_ANALYZED);
  const extraCount = files.length - slice.length;

  const infos = await mapLimit(slice, FETCH_CONCURRENCY, async (f) => {
    const isDeleted = f.status === 'D';
    const isUntracked = f.status === '?';
    let diff = '';
    let content = '';
    try {
      if (!isDeleted && !BINARY_RE.test(f.file)) {
        if (!isUntracked && getDiff) diff = (await getDiff(f.file)) || '';
        if ((isUntracked || (f.status === 'A' && !diff)) && readFile) content = (await readFile(f.file)) || '';
      }
      if (diff.length > MAX_TEXT) diff = diff.slice(0, MAX_TEXT);
      if (content.length > MAX_TEXT) content = content.slice(0, MAX_TEXT);
    } catch (err) {
      diff = '';
      content = '';
    }
    try {
      return analyzeFile({ file: f.file, status: f.status, diff, content });
    } catch (err) {
      return {
        file: f.file, base: baseOf(f.file), status: f.status, ext: extOf(f.file),
        name: humanName(f.file), isNew: isUntracked || f.status === 'A', isDeleted,
        phrases: ['update file'], tags: [],
      };
    }
  });

  let fallbackRest = '';
  try {
    const fb = fallback ? String(fallback()).split('\n')[0] : '';
    fallbackRest = fb.replace(/^\w+\s+/, '');
  } catch (err) {
    fallbackRest = '';
  }

  const subject = buildSubject(infos, extraCount, fallbackRest);
  const body = buildBody(infos, extraCount);
  return body ? subject + '\n\n' + body : subject;
}