'use strict';

const GLOBALS = new Set((
  'undefined NaN Infinity globalThis Object Function Array String Number Boolean Symbol BigInt Math Date RegExp ' +
  'Error TypeError RangeError SyntaxError ReferenceError EvalError URIError AggregateError Promise Proxy Reflect ' +
  'JSON Map Set WeakMap WeakSet WeakRef FinalizationRegistry ArrayBuffer SharedArrayBuffer DataView Atomics ' +
  'Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array ' +
  'BigInt64Array BigUint64Array Intl WebAssembly Iterator eval isNaN isFinite parseInt parseFloat decodeURI ' +
  'decodeURIComponent encodeURI encodeURIComponent escape unescape arguments ' +
  'require module exports __dirname __filename process Buffer global console setTimeout clearTimeout setInterval ' +
  'clearInterval setImmediate clearImmediate queueMicrotask structuredClone URL URLSearchParams TextEncoder ' +
  'TextDecoder AbortController AbortSignal Event EventTarget performance fetch Headers Request Response FormData ' +
  'Blob atob btoa BroadcastChannel MessageChannel MessagePort MessageEvent crypto ReadableStream WritableStream ' +
  'TransformStream ' +
  'window self document navigator location history localStorage sessionStorage indexedDB screen alert confirm ' +
  'prompt open close focus blur print stop getComputedStyle matchMedia requestAnimationFrame cancelAnimationFrame ' +
  'requestIdleCallback cancelIdleCallback addEventListener removeEventListener dispatchEvent postMessage Image ' +
  'Audio Option Worker SharedWorker WebSocket XMLHttpRequest EventSource FileReader File FileList HTMLElement ' +
  'Element Node NodeList Document DocumentFragment Text Comment Range Selection MutationObserver ' +
  'IntersectionObserver ResizeObserver PerformanceObserver CustomEvent KeyboardEvent MouseEvent PointerEvent ' +
  'WheelEvent InputEvent FocusEvent DragEvent ClipboardEvent TouchEvent UIEvent CSS CSSStyleSheet DOMParser ' +
  'XMLSerializer DOMRect DOMPoint DOMMatrix DOMException ImageData ImageBitmap createImageBitmap OffscreenCanvas ' +
  'Path2D CanvasRenderingContext2D HTMLCanvasElement HTMLInputElement HTMLTextAreaElement HTMLSelectElement ' +
  'HTMLButtonElement HTMLDivElement HTMLImageElement HTMLVideoElement HTMLAudioElement HTMLAnchorElement ' +
  'HTMLFormElement HTMLIFrameElement HTMLTemplateElement SVGElement Storage Notification MediaRecorder ' +
  'ClipboardItem getSelection customElements caches event devicePixelRatio innerWidth innerHeight outerWidth ' +
  'outerHeight scrollX scrollY scrollTo scrollBy scroll reportError isSecureContext'
).split(' '));

const REF_TYPES = new Set(['identifier', 'shorthand_property_identifier', 'shorthand_property_identifier_pattern']);
const JUMPS = new Set(['return_statement', 'throw_statement', 'break_statement', 'continue_statement']);
const SKIP_UNREACHABLE = new Set(['{', '}', ';', 'comment', 'empty_statement', 'function_declaration', 'generator_function_declaration']);
const MAX_REFS = 20000;
const MAX_REPORTS = 40;
const MAX_UNUSED = 30;

function newScope(parent, isFn) {
  const s = { parent, names: new Set(), used: new Set(), fn: null };
  s.fn = isFn || !parent ? s : parent.fn;
  return s;
}

function resolve(scope, name) {
  for (let s = scope; s; s = s.parent) {
    if (s.names.has(name)) return s;
  }
  return null;
}

function withinOne(a, b) {
  if (a === b) return false;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1);
  if (la > lb) return a.slice(i + 1) === b.slice(i);
  return a.slice(i) === b.slice(i + 1);
}

function suggest(scope, name) {
  if (name.length < 3) return null;
  for (let s = scope; s; s = s.parent) {
    for (const cand of s.names) {
      if (cand.length >= 3 && withinOne(cand, name)) return cand;
    }
  }
  for (const cand of GLOBALS) {
    if (cand.length >= 4 && withinOne(cand, name)) return cand;
  }
  return null;
}

function isExported(n) {
  return !!n.parent && n.parent.type === 'export_statement';
}

function declare(scope, node, ctx, lexical, kind) {
  const name = node.text;
  ctx.bound.add(node.startIndex);
  if (lexical && scope.names.has(name)) ctx.dups.push(node);
  scope.names.add(name);
  if (kind) ctx.decls.push({ node, scope, kind });
}

function declarePattern(n, scope, ctx, lexical, kind) {
  if (!n) return;
  switch (n.type) {
    case 'identifier':
    case 'shorthand_property_identifier_pattern':
      declare(scope, n, ctx, lexical, kind);
      return;
    case 'assignment_pattern':
    case 'object_assignment_pattern':
      declarePattern(n.childForFieldName('left'), scope, ctx, lexical, kind);
      return;
    case 'pair_pattern':
      declarePattern(n.childForFieldName('value'), scope, ctx, lexical, kind);
      return;
    case 'formal_parameters':
    case 'array_pattern':
    case 'object_pattern':
    case 'rest_pattern':
      for (const ch of n.children) declarePattern(ch, scope, ctx, lexical, kind);
      return;
    default:
      return;
  }
}

function declareImports(n, scope, ctx) {
  for (const clause of n.children) {
    if (clause.type !== 'import_clause') continue;
    for (const part of clause.children) {
      if (part.type === 'identifier') {
        declare(scope, part, ctx, true, 'import');
      } else if (part.type === 'namespace_import') {
        for (const id of part.children) {
          if (id.type === 'identifier') declare(scope, id, ctx, true, 'import');
        }
      } else if (part.type === 'named_imports') {
        for (const spec of part.children) {
          if (spec.type !== 'import_specifier') continue;
          const nm = spec.childForFieldName('name');
          const al = spec.childForFieldName('alias');
          if (nm) ctx.bound.add(nm.startIndex);
          if (al) declare(scope, al, ctx, true, 'import');
          else if (nm) declare(scope, nm, ctx, true, 'import');
        }
      }
    }
  }
}

function checkUnreachable(block, ctx) {
  let jumped = false;
  for (const k of block.children) {
    if (SKIP_UNREACHABLE.has(k.type)) continue;
    if (jumped) {
      ctx.unreach.push(k);
      return;
    }
    if (JUMPS.has(k.type)) jumped = true;
  }
}

function addRef(n, scope, ctx) {
  if (ctx.bound.has(n.startIndex)) return;
  const p = n.parent;
  const quiet = !!p && p.type === 'unary_expression' && !!p.children[0] && p.children[0].type === 'typeof';
  if (ctx.refs.length < MAX_REFS) ctx.refs.push({ node: n, scope, quiet });
}

function walkKids(n, scope, ctx) {
  for (const ch of n.children) walk(ch, scope, ctx);
}

function enterFn(n, scope, ctx, ownName) {
  const fs = newScope(scope, true);
  if (ownName) fs.names.add(ownName);
  declarePattern(n.childForFieldName('parameters'), fs, ctx, false, null);
  declarePattern(n.childForFieldName('parameter'), fs, ctx, false, null);
  walkKids(n, fs, ctx);
}

function walk(n, scope, ctx) {
  const t = n.type;
  if (REF_TYPES.has(t)) {
    addRef(n, scope, ctx);
    return;
  }
  if (!n.childCount) return;
  switch (t) {
    case 'program':
      checkUnreachable(n, ctx);
      break;
    case 'function_declaration':
    case 'generator_function_declaration': {
      const nm = n.childForFieldName('name');
      if (nm) declare(scope.fn, nm, ctx, false, isExported(n) ? null : 'function');
      enterFn(n, scope, ctx, null);
      return;
    }
    case 'function_expression':
    case 'function':
    case 'generator_function': {
      const nm = n.childForFieldName('name');
      if (nm) ctx.bound.add(nm.startIndex);
      enterFn(n, scope, ctx, nm ? nm.text : null);
      return;
    }
    case 'arrow_function':
    case 'method_definition':
      enterFn(n, scope, ctx, null);
      return;
    case 'class_declaration': {
      const nm = n.childForFieldName('name');
      if (nm) declare(scope, nm, ctx, true, isExported(n) ? null : 'class');
      break;
    }
    case 'class': {
      const nm = n.childForFieldName('name');
      let cs = scope;
      if (nm) {
        cs = newScope(scope, false);
        cs.names.add(nm.text);
        ctx.bound.add(nm.startIndex);
      }
      walkKids(n, cs, ctx);
      return;
    }
    case 'variable_declarator': {
      const p = n.parent;
      const isVar = !!p && p.type === 'variable_declaration';
      const exported = !!p && !!p.parent && p.parent.type === 'export_statement';
      declarePattern(n.childForFieldName('name'), isVar ? scope.fn : scope, ctx, !isVar, exported ? null : 'variable');
      break;
    }
    case 'catch_clause': {
      const cs = newScope(scope, false);
      declarePattern(n.childForFieldName('parameter'), cs, ctx, false, null);
      walkKids(n, cs, ctx);
      return;
    }
    case 'statement_block':
    case 'for_statement':
    case 'switch_body': {
      const bs = newScope(scope, false);
      if (t === 'statement_block') checkUnreachable(n, ctx);
      walkKids(n, bs, ctx);
      return;
    }
    case 'for_in_statement': {
      const bs = newScope(scope, false);
      const kind = n.childForFieldName('kind');
      if (kind) {
        const isVar = kind.type === 'var';
        declarePattern(n.childForFieldName('left'), isVar ? scope.fn : bs, ctx, !isVar, null);
      }
      walkKids(n, bs, ctx);
      return;
    }
    case 'import_statement':
      declareImports(n, scope, ctx);
      return;
    case 'export_statement':
      if (n.childForFieldName('source')) return;
      break;
    case 'export_specifier': {
      const nm = n.childForFieldName('name');
      if (nm && nm.type === 'identifier') addRef(nm, scope, ctx);
      return;
    }
    case 'meta_property':
    case 'jsx_namespace_name':
    case 'jsx_closing_element':
      return;
    case 'nested_identifier': {
      const first = n.children.find((c) => c.type === 'identifier');
      if (first) addRef(first, scope, ctx);
      return;
    }
    case 'jsx_opening_element':
    case 'jsx_self_closing_element': {
      const nm = n.childForFieldName('name');
      if (nm && nm.type === 'identifier' && /^[a-z]/.test(nm.text)) ctx.bound.add(nm.startIndex);
      break;
    }
    default:
      break;
  }
  walkKids(n, scope, ctx);
}

function findUndefined(root, text, c) {
  if (/\/\*\s*eslint-disable\s*(?:\*\/|[^*]*\bno-undef\b)/.test(text)) return;
  const extra = new Set();
  const re = /\/\*\s*globals?\s+([^*]*)\*\//g;
  let m = re.exec(text);
  while (m !== null) {
    for (const part of m[1].split(/[\s,]+/)) {
      const nm = part.split(':')[0];
      if (nm) extra.add(nm);
    }
    m = re.exec(text);
  }
  const isModule = /^\s*(?:import|export)\s/m.test(text) || /\brequire\s*\(/.test(text) || /\bmodule\.exports\b|\bexports\./.test(text);
  const sev = isModule ? 'error' : 'warning';
  const ctx = { bound: new Set(), refs: [], dups: [], unreach: [], decls: [] };
  const top = newScope(null, true);
  walk(root, top, ctx);
  const lines = text.split('\n');
  const capped = ctx.refs.length >= MAX_REFS;

  let reported = 0;
  for (const r of ctx.refs) {
    const name = r.node.text;
    const owner = resolve(r.scope, name);
    if (owner) {
      owner.used.add(name);
      continue;
    }
    if (r.quiet || GLOBALS.has(name) || extra.has(name)) continue;
    if (reported++ >= MAX_REPORTS) continue;
    const hint = suggest(r.scope, name);
    const sp = r.node.startPosition;
    const msg = "'" + name + "' is not defined" + (hint ? ". Did you mean '" + hint + "'?" : '');
    c.addAt(sp.row + 1, sp.column, name.length, sev, msg, 'JavaScript');
  }

  for (const d of ctx.dups.slice(0, 10)) {
    const sp = d.startPosition;
    c.addAt(sp.row + 1, sp.column, d.text.length, 'error', "'" + d.text + "' has already been declared in this scope", 'JavaScript');
  }

  for (const k of ctx.unreach.slice(0, 10)) {
    const sp = k.startPosition;
    const ep = k.endPosition;
    const len = ep.row === sp.row ? Math.max(1, ep.column - sp.column) : Math.max(1, (lines[sp.row] || '').length - sp.column);
    c.addAt(sp.row + 1, sp.column, len, 'warning', 'Unreachable code', 'JavaScript');
  }

  if (capped) return;
  let unused = 0;
  for (const d of ctx.decls) {
    if (unused >= MAX_UNUSED) break;
    const name = d.node.text;
    if (name.charAt(0) === '_' || name === 'React') continue;
    if (!isModule && d.scope === top) continue;
    if (d.scope.used.has(name)) continue;
    unused++;
    const sp = d.node.startPosition;
    const what = d.kind === 'import' ? 'imported' : 'declared';
    c.addAt(sp.row + 1, sp.column, name.length, 'info', "'" + name + "' is " + what + ' but never used', 'JavaScript');
  }
}

module.exports = { findUndefined };